/**
 * Sign in, sign out, and who is signed in.
 *
 * Email rather than passwords. There is no password to store, no reset flow to
 * build, no "I forgot it" support thread, and no credential for this app to be
 * careless with — the whole category of problem is skipped for the price of one
 * email round trip. For a tool someone opens a few times a week that trade is
 * plainly worth it.
 *
 * ── A code, with the link as the fallback ────────────────────────────────────
 *
 * The same email carries both. The CODE is offered first, for two reasons that
 * are not about preference:
 *
 * 1. Corporate mail scanners — Outlook Safe Links, Defender, Proofpoint — fetch
 *    every URL in an incoming message to check it. That fetch REDEEMS a one-time
 *    magic link, so the recipient clicks it and is told it has already been
 *    used. It is one of the commonest ways magic-link auth fails in the field
 *    and it is invisible from this side. A six-digit code cannot be consumed by
 *    something that only follows links.
 *
 * 2. PKCE keeps the code verifier in the browser that ASKED. That is what makes
 *    a stolen link worthless — and it also means a link opened on a different
 *    device cannot complete. Typing six digits into the tab that is already open
 *    sidesteps both.
 *
 * Everything here returns quietly when the cloud is not configured, because the
 * app has to keep working with no account at all. That is the free tier.
 */
import type { Session, User } from "@supabase/supabase-js";

import { cloud, isCloudConfigured, type Plan, type Profile } from "./cloud.js";

export type AuthState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: User; profile: Profile | null };

/**
 * Where the emailed link comes back to. Kept to the app's own origin so a stolen
 * link cannot be bounced somewhere else, and stripped of any query string so the
 * token does not land beside whatever state happened to be in the URL.
 */
const redirectTo = (): string =>
  typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`;

export type SignInResult = { ok: boolean; error?: string };

export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

export const looksLikeEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(email));

/**
 * Supabase's own wording, translated into what to do about it.
 *
 * "email rate limit exceeded" is the single most likely thing anybody setting
 * this up will see, and on its own it sounds like the user did something wrong.
 * It means the project is still on the built-in mailer, which sends a handful an
 * hour — a configuration fact, and one nobody can act on without being told.
 */
export function explain(message: string): string {
  const text = message.toLowerCase();

  if (text.includes("rate limit") || text.includes("too many")) {
    return "This project is still using Supabase's built-in mailer, which only sends a few messages an hour. Wait a few minutes, or set up an SMTP provider — see supabase/README.md.";
  }
  if (text.includes("expired") || text.includes("invalid")) {
    return "That code is wrong or has expired. Ask for a new one.";
  }
  if (text.includes("signups not allowed") || text.includes("signup is disabled")) {
    return "New accounts are turned off for this project. Enable email sign-ups in Authentication → Providers.";
  }
  return message;
}

/**
 * Sends the email. It carries both a code and a link.
 *
 * `shouldCreateUser` is left at its default of true on purpose: there is no
 * separate sign-up here, and an unknown address being quietly refused would be
 * a registration flow that never says it exists.
 */
export async function sendCode(email: string): Promise<SignInResult> {
  const db = cloud();
  if (!db) return { ok: false, error: "Cloud is not configured" };

  const address = normaliseEmail(email);
  if (!looksLikeEmail(address)) {
    return { ok: false, error: "That does not look like an email address" };
  }

  const { error } = await db.auth.signInWithOtp({
    email: address,
    options: { emailRedirectTo: redirectTo() },
  });

  return error ? { ok: false, error: explain(error.message) } : { ok: true };
}

/** Kept under its old name because three call sites and a lot of copy say "link". */
export const sendMagicLink = sendCode;

/** Digits only, so a pasted "123 456" or "123-456" is not rejected for punctuation. */
export const cleanCode = (code: string): string => code.replace(/\D/g, "").slice(0, 6);

export const CODE_LENGTH = 6;

/**
 * Exchanges the six digits for a session.
 *
 * `type: "email"` covers both a first sign-up and a returning sign-in — Supabase
 * issues the same kind of token for each, and splitting them here would mean
 * guessing which one this person is and being wrong half the time.
 */
export async function verifyCode(email: string, code: string): Promise<SignInResult> {
  const db = cloud();
  if (!db) return { ok: false, error: "Cloud is not configured" };

  const token = cleanCode(code);
  if (token.length !== CODE_LENGTH) {
    return { ok: false, error: `The code is ${CODE_LENGTH} digits.` };
  }

  const { error } = await db.auth.verifyOtp({
    email: normaliseEmail(email),
    token,
    type: "email",
  });

  return error ? { ok: false, error: explain(error.message) } : { ok: true };
}

export async function signOut(): Promise<void> {
  await cloud()?.auth.signOut();
}

export async function currentSession(): Promise<Session | null> {
  const db = cloud();
  if (!db) return null;
  const { data } = await db.auth.getSession();
  return data.session;
}

/**
 * Fires on sign in, sign out and token refresh. Returns its own unsubscribe, so a
 * component can hand it straight back from an effect.
 */
export function onAuthChange(handler: (session: Session | null) => void): () => void {
  const db = cloud();
  if (!db) return () => {};
  const { data } = db.auth.onAuthStateChange((_event, session) => handler(session));
  return () => data.subscription.unsubscribe();
}

/**
 * The plan lives here, and it is read-only from the browser by design: the column
 * has its UPDATE privilege revoked, so this value can be trusted as far as the
 * database is trusted. Any check that matters still belongs in a policy, not in
 * whatever this returns.
 */
export async function loadProfile(userId: string): Promise<Profile | null> {
  const db = cloud();
  if (!db) return null;

  const { data, error } = await db
    .from("profiles")
    .select("id, email, display_name, plan, plan_renews_at, plan_ends_at_period_end, stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    id: string;
    email: string | null;
    display_name: string | null;
    plan: string;
    plan_renews_at: string | null;
    plan_ends_at_period_end: boolean | null;
    stripe_customer_id: string | null;
  };

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    plan: (["free", "pro", "agency"] as const).includes(row.plan as Plan)
      ? (row.plan as Plan)
      : "free",
    planRenewsAt: row.plan_renews_at,
    // The column arrives with 08-pipeline-fields.sql. Absent reads as false,
    // which is the safe way round: it shows a renewal date rather than wrongly
    // telling somebody their plan is ending.
    planEndsAtPeriodEnd: row.plan_ends_at_period_end ?? false,
    hasBilling: row.stripe_customer_id !== null,
  };
}

/**
 * Makes the profile row if this is the first sign-in.
 *
 * The obvious home for this is a trigger on auth.users, and that is what Supabase
 * documents — but creating one now fails on many projects with "must be owner of
 * relation users", and because the SQL editor runs a script in a single
 * transaction, that one error rolls the whole schema back. Doing it from here
 * needs no privileged DDL.
 *
 * Nothing is trusted to the client by moving it: the INSERT privilege is narrowed
 * to (id, email, display_name), so `plan` takes its default of 'free' no matter
 * what this sends, and the RLS policy pins the row to the caller's own id.
 */
export async function ensureProfile(user: User): Promise<Profile | null> {
  const db = cloud();
  if (!db) return null;

  const existing = await loadProfile(user.id);
  if (existing) return existing;

  const { error } = await db
    .from("profiles")
    .insert({ id: user.id, email: user.email ?? null });

  // 23505 is a unique violation: another tab signed in first and won the race,
  // which is a success from here.
  if (error && error.code !== "23505") return null;

  return loadProfile(user.id);
}

export async function setDisplayName(userId: string, name: string): Promise<boolean> {
  const db = cloud();
  if (!db) return false;
  const { error } = await db.from("profiles").update({ display_name: name }).eq("id", userId);
  return !error;
}

export const isPro = (profile: Profile | null): boolean =>
  profile?.plan === "pro" || profile?.plan === "agency";

export { isCloudConfigured };
