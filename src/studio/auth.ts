/**
 * Sign in, sign out, and who is signed in.
 *
 * Magic link rather than passwords. There is no password to store, no reset flow
 * to build, no "I forgot it" support thread, and no credential for this app to be
 * careless with — the whole category of problem is skipped for the price of one
 * email round trip. For a tool someone opens a few times a week that trade is
 * plainly worth it.
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

export async function sendMagicLink(email: string): Promise<SignInResult> {
  const db = cloud();
  if (!db) return { ok: false, error: "Cloud is not configured" };

  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return { ok: false, error: "That does not look like an email address" };
  }

  const { error } = await db.auth.signInWithOtp({
    email: address,
    options: { emailRedirectTo: redirectTo() },
  });

  return error ? { ok: false, error: error.message } : { ok: true };
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
    .select("id, email, display_name, plan, plan_renews_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    id: string;
    email: string | null;
    display_name: string | null;
    plan: string;
    plan_renews_at: string | null;
  };

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    plan: (["free", "pro", "agency"] as const).includes(row.plan as Plan)
      ? (row.plan as Plan)
      : "free",
    planRenewsAt: row.plan_renews_at,
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
