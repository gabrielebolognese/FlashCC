/**
 * The server's two relationships with Supabase.
 *
 * VERIFYING a caller: the browser sends the access token it already holds, and
 * Supabase says whether it is genuine and whose it is. Never trust a user id sent
 * in a request body, that is just a number the caller typed.
 *
 * WRITING the plan: with the service role key, which bypasses row level security
 * entirely. That is the point. The browser deliberately cannot write
 * profiles.plan, so the only thing that may is a process holding this key, acting
 * on a Stripe webhook it has cryptographically verified.
 *
 * This key must never be sent to the browser, logged, or given a VITE_ prefix.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { HttpError } from "./http.js";

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

export const hasServiceRole = (): boolean => Boolean(URL && SERVICE_KEY);

let admin: SupabaseClient | null = null;

/** Full access. Only ever reached from a verified webhook or a verified caller. */
export function serviceClient(): SupabaseClient {
  if (!URL || !SERVICE_KEY) {
    // Reached from two directions now: billing writing a plan, and requirePro
    // reading one before an AI route runs. The old wording named only the first,
    // so clicking Draft returned a 503 about billing.
    throw new HttpError(
      503,
      "No SUPABASE_SERVICE_ROLE_KEY. The server cannot read or update a plan without it.",
    );
  }
  admin ??= createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export type Caller = { id: string; email: string | null };

/**
 * Turns the browser's access token into a user, or refuses.
 *
 * Uses the public key, exactly as the browser would: this asks Supabase "is this
 * token real, and whose", which needs no privilege at all. Doing it with the
 * service key would work too and would be a strictly worse habit.
 */
export async function requireCaller(token: string | null): Promise<Caller> {
  if (!token) throw new HttpError(401, "Sign in first");
  if (!URL || !ANON_KEY) throw new HttpError(503, "Supabase is not configured on the server");

  const client = createClient(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "That session is no longer valid");

  return { id: data.user.id, email: data.user.email ?? null };
}

export type PlanName = "free" | "pro" | "agency";

/**
 * A verified caller who is also on a paid plan.
 *
 * **402, not 403.** Payment Required is the one status code that means exactly
 * this, and the difference matters downstream: the client opens the pricing
 * panel on a 402 and shows an error on a 403, so using the wrong one turns an
 * upgrade prompt into "Drafting failed (403)".
 *
 * The plan is read from `profiles` with the service key rather than by calling
 * `is_pro()`. That function is `security definer` and reads `auth.uid()`, which
 * is null for the service role, so it would answer false for everybody and the
 * gate would look like it worked while refusing paying customers.
 */
export async function requirePro(
  token: string | null,
  feature: string,
): Promise<Caller & { plan: PlanName }> {
  const caller = await requireCaller(token);
  const { plan } = await readBilling(caller.id);

  if (plan === "free") {
    throw new HttpError(402, `${feature} is part of Pro.`);
  }
  return { ...caller, plan };
}

export type PlanUpdate = {
  plan: PlanName;
  stripeCustomerId?: string | undefined;
  stripeSubscriptionId?: string | null | undefined;
  renewsAt?: string | null | undefined;
  /**
   * Stripe's `cancel_at_period_end`.
   *
   * Stored rather than inferred, because it is the difference between "renews on
   * the 3rd" and "ends on the 3rd" and there is no way to tell those apart from
   * the plan and the date alone. Showing the wrong one is exactly the surprise
   * this feature exists to prevent.
   */
  endsAtPeriodEnd?: boolean | undefined;
};

/** The one write that decides who has paid. */
export async function setPlan(userId: string, update: PlanUpdate): Promise<void> {
  const patch: Record<string, unknown> = { plan: update.plan };
  if (update.stripeCustomerId !== undefined) patch.stripe_customer_id = update.stripeCustomerId;
  if (update.stripeSubscriptionId !== undefined) {
    patch.stripe_subscription_id = update.stripeSubscriptionId;
  }
  if (update.renewsAt !== undefined) patch.plan_renews_at = update.renewsAt;
  if (update.endsAtPeriodEnd !== undefined) {
    patch.plan_ends_at_period_end = update.endsAtPeriodEnd;
  }

  const { error } = await serviceClient().from("profiles").update(patch).eq("id", userId);
  if (error) throw new HttpError(500, `Could not update the plan: ${error.message}`);
}

export async function readBilling(
  userId: string,
): Promise<{ customerId: string | null; plan: PlanName }> {
  const { data, error } = await serviceClient()
    .from("profiles")
    .select("stripe_customer_id, plan")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);

  const row = data as { stripe_customer_id: string | null; plan: PlanName } | null;
  return { customerId: row?.stripe_customer_id ?? null, plan: row?.plan ?? "free" };
}

/**
 * Stripe knows a customer, not a user. The mapping is kept on our side so a
 * webhook that arrives with only a customer id can still find whose it is,
 * Stripe metadata is a convenience, not somewhere to keep the only copy.
 */
export async function userIdForCustomer(customerId: string): Promise<string | null> {
  const { data, error } = await serviceClient()
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) return null;
  return (data as { id: string } | null)?.id ?? null;
}
