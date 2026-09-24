/**
 * Lemon Squeezy: the API calls, and the three decisions worth testing.
 *
 * ── Why a merchant of record at all ──────────────────────────────────────────
 *
 * Lemon Squeezy sells the product to the customer and then pays us. That makes
 * them, not us, the party who owes VAT in every country a customer lives in.
 * The alternative is registering for VAT OSS and filing quarterly across the EU
 * for a product that might make nothing, which is a real cost paid in advance
 * against a hypothetical.
 *
 * ── Why plain fetch and no SDK ───────────────────────────────────────────────
 *
 * Three endpoints and one HMAC. An SDK would be a dependency, a version to keep
 * current and a second set of types to reconcile with ours, in exchange for
 * saving about forty lines. The Stripe SDK earned its place because the surface
 * was large; this surface is not.
 *
 * ── What is pure, and why it matters ─────────────────────────────────────────
 *
 * `verifySignature`, `planForVariant` and `entitlementOf` decide, respectively,
 * whether a request is genuine, what somebody bought, and whether they currently
 * have it. Those are the three ways a billing integration goes wrong silently,
 * and none of them needs a network, so all three are pure and tested in
 * `lemon.test.ts`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { HttpError } from "./http.js";
import type { PlanName } from "./supabase.js";

const API = "https://api.lemonsqueezy.com/v1";

const API_KEY = process.env.LEMON_API_KEY;
const STORE_ID = process.env.LEMON_STORE_ID;

export const WEBHOOK_SECRET = process.env.LEMON_WEBHOOK_SECRET;

/**
 * Lemon Squeezy sells *variants*, not prices. A product ("FlashCC Pro") holds
 * variants ("monthly", "yearly"), and the variant id is what a webhook carries.
 */
export const VARIANTS: Record<Exclude<PlanName, "free">, string | undefined> = {
  pro: process.env.LEMON_VARIANT_PRO,
  agency: process.env.LEMON_VARIANT_AGENCY,
};

export const lemonConfigured = (): boolean => Boolean(API_KEY && STORE_ID && VARIANTS.pro);

/* ── 1. is this request genuine ───────────────────────────────────────────── */

/**
 * HMAC-SHA256 of the **raw** body, hex, compared in constant time.
 *
 * Raw bytes, not the parsed object: `JSON.parse` followed by `JSON.stringify`
 * does not reproduce the original byte for byte, and the signature is over the
 * original. Re-encoding is the single most common way this check is broken, and
 * it fails closed, so it looks like Lemon Squeezy is misbehaving.
 *
 * `timingSafeEqual` throws on a length mismatch rather than returning false, so
 * the lengths are compared first. A malformed header is not an exception, it is
 * an unsigned request, and unsigned requests are simply refused.
 */
export function verifySignature(raw: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;

  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"), "utf8");
  const given = Buffer.from(signature, "utf8");

  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/* ── 2. what did they buy ─────────────────────────────────────────────────── */

/**
 * Variant id back to a plan name.
 *
 * Takes the mapping as an argument rather than reading the module constant, so
 * a test can state the mapping it is testing instead of manipulating the
 * environment. Ids arrive from the API as numbers and from the environment as
 * strings, so both sides are compared as strings.
 */
export function planForVariant(
  variantId: string | number | null | undefined,
  variants: Record<string, string | undefined> = VARIANTS,
): PlanName {
  if (variantId === null || variantId === undefined) return "free";
  const id = String(variantId);

  for (const [plan, configured] of Object.entries(variants)) {
    if (configured && configured === id) return plan as PlanName;
  }

  // An unknown variant is another product in the same store, or a variant
  // rotated without updating the environment. Refusing to guess is safer than
  // handing out a plan, and the warning is how anybody finds out.
  console.warn("[billing] unknown variant on subscription:", id);
  return "free";
}

/* ── 3. do they currently have it ─────────────────────────────────────────── */

export type LemonSubscription = {
  status?: string;
  variant_id?: number | string;
  customer_id?: number | string;
  renews_at?: string | null;
  ends_at?: string | null;
  urls?: { customer_portal?: string; update_payment_method?: string } | null;
};

/**
 * Which Lemon Squeezy statuses mean "they have the thing right now".
 *
 * `cancelled` is in this set and that is not a mistake. In Lemon Squeezy it
 * means future payments are stopped while the period already paid for runs to
 * `ends_at`. Treating it as unpaid would take away, on the day somebody clicks
 * cancel, the month they have already been charged for.
 *
 * `past_due` is in, because retries are still running and cutting somebody off
 * over a card that expired on Tuesday is a support ticket, not a policy.
 *
 * `unpaid` is out: retries are exhausted. `expired` is out: the period ended.
 * `paused` is out: collection is deliberately stopped, and nothing in this
 * product pauses a subscription, so meeting one means something unexpected has
 * happened and the safe reading is the conservative one.
 */
const ENTITLED = new Set(["on_trial", "active", "past_due", "cancelled"]);

export type Entitlement = {
  plan: PlanName;
  entitled: boolean;
  renewsAt: string | null;
  endsAtPeriodEnd: boolean;
};

/**
 * One subscription, reduced to what the app actually gates on.
 *
 * `endsAtPeriodEnd` is the difference between "renews on the 3rd" and "ends on
 * the 3rd". There is no way to tell those apart from the plan and the date
 * alone, and showing the wrong one is precisely the surprise the account screen
 * exists to prevent.
 */
export function entitlementOf(
  sub: LemonSubscription,
  variants: Record<string, string | undefined> = VARIANTS,
): Entitlement {
  const status = sub.status ?? "";
  const entitled = ENTITLED.has(status);
  const cancelled = status === "cancelled";

  return {
    plan: entitled ? planForVariant(sub.variant_id, variants) : "free",
    entitled,
    // A cancelled subscription has no next payment, so `renews_at` is the wrong
    // field to read; `ends_at` is when access actually stops.
    renewsAt: entitled ? ((cancelled ? sub.ends_at : sub.renews_at) ?? null) : null,
    endsAtPeriodEnd: entitled && cancelled,
  };
}

/* ── the network half ─────────────────────────────────────────────────────── */

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_KEY) {
    throw new HttpError(503, "No LEMON_API_KEY. Billing is not set up on this server.");
  }

  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${API_KEY}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    // Their errors come back as a JSON:API `errors` array. Read the first detail
    // if it is there, because "422" on its own tells nobody anything.
    const body = (await response.json().catch(() => null)) as {
      errors?: { detail?: string }[];
    } | null;
    const detail = body?.errors?.[0]?.detail ?? response.statusText;
    throw new HttpError(502, `Lemon Squeezy: ${detail}`);
  }

  return (await response.json()) as T;
}

type CheckoutResponse = { data?: { attributes?: { url?: string } } };

/**
 * A checkout for one person and one plan.
 *
 * `custom` is the important part: whatever goes in here comes back on every
 * webhook for the resulting subscription, under `meta.custom_data`. It is how a
 * payment becomes a *user*, and without it the only link between the two is an
 * email address, which people change.
 *
 * Lemon Squeezy returns custom values as strings, so the user id is sent as one
 * and read back as one. Sending a number and comparing it to a string is a bug
 * that only appears in production, where the ids are real.
 */
export async function createCheckout(input: {
  variantId: string;
  userId: string;
  email: string | null;
  redirectUrl: string;
}): Promise<string> {
  if (!STORE_ID) throw new HttpError(503, "No LEMON_STORE_ID on this server");

  const body = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          ...(input.email ? { email: input.email } : {}),
          custom: { user_id: input.userId },
        },
        product_options: {
          redirect_url: input.redirectUrl,
          // Their default is to show every variant in the product. We are sending
          // somebody to buy one specific thing, so the rest is a decision they
          // did not ask to make.
          enabled_variants: [Number(input.variantId)],
        },
      },
      relationships: {
        store: { data: { type: "stores", id: String(STORE_ID) } },
        variant: { data: { type: "variants", id: String(input.variantId) } },
      },
    },
  };

  const out = await call<CheckoutResponse>("/checkouts", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const url = out.data?.attributes?.url;
  if (!url) throw new HttpError(502, "Lemon Squeezy did not return a checkout URL");
  return url;
}

type SubscriptionResponse = { data?: { attributes?: LemonSubscription } };

export async function fetchSubscription(id: string): Promise<LemonSubscription> {
  const out = await call<SubscriptionResponse>(`/subscriptions/${encodeURIComponent(id)}`);
  const attrs = out.data?.attributes;
  if (!attrs) throw new HttpError(502, "Lemon Squeezy returned no subscription");
  return attrs;
}
