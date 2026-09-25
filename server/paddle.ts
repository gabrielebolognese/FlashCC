/**
 * Paddle Billing: the API calls, and the three decisions worth testing.
 *
 * ── Why a merchant of record at all ──────────────────────────────────────────
 *
 * Paddle sells the product to the customer and then pays us. That makes them,
 * not us, the party who owes VAT in every country a customer lives in. The
 * alternative is registering for VAT OSS and filing quarterly across the EU for
 * a product that might make nothing, which is a real cost paid in advance
 * against a hypothetical. This was the reason for the previous provider too, and
 * it is the reason the replacement is another merchant of record rather than a
 * payment processor.
 *
 * ── Why plain fetch and no SDK ───────────────────────────────────────────────
 *
 * Three endpoints and one HMAC. An SDK would be a dependency, a version to keep
 * current and a second set of types to reconcile with ours, in exchange for
 * saving about forty lines.
 *
 * ── What is pure, and why it matters ─────────────────────────────────────────
 *
 * `verifySignature`, `planForPrice` and `entitlementOf` decide, respectively,
 * whether a request is genuine, what somebody bought, and whether they currently
 * have it. Those are the three ways a billing integration goes wrong silently,
 * and none of them needs a network, so all three are pure and tested in
 * `paddle.test.ts`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { HttpError } from "./http.js";
import type { PlanName } from "./supabase.js";

const API_KEY = process.env.PADDLE_API_KEY;

/**
 * Sandbox or live, decided by the key rather than by a second variable.
 *
 * Paddle runs two entirely separate environments with separate ids, and a
 * sandbox key against the live host is a 403 that reads like a permissions
 * problem. The key says which one it is (`pdl_sdbx_` against `pdl_live_`), so
 * asking anybody to state it again is asking them to contradict themselves.
 */
const sandbox = (key: string | undefined): boolean => (key ?? "").startsWith("pdl_sdbx_");

const API = sandbox(API_KEY) ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";

export const PADDLE_ENV: "sandbox" | "production" = sandbox(API_KEY) ? "sandbox" : "production";

/**
 * The browser's token, which is public by design.
 *
 * Paddle's checkout runs in the page, so a token has to reach it. This one is
 * scoped to opening a checkout and reading prices and nothing else, which is why
 * Paddle calls it a client-side token. It is served from here rather than built
 * into the bundle with a `VITE_` prefix so that every piece of billing
 * configuration lives in one file on one machine.
 */
export const CLIENT_TOKEN = process.env.PADDLE_CLIENT_TOKEN;

/** `pdl_ntfset_...`, from the notification destination, not the API key. */
export const WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET;

/**
 * Paddle sells *prices*, not variants. A product ("FlashCC Pro") holds prices
 * ("monthly", "yearly"), and a subscription item carries the price id.
 */
export const PRICES: Record<Exclude<PlanName, "free">, string | undefined> = {
  pro: process.env.PADDLE_PRICE_PRO,
  agency: process.env.PADDLE_PRICE_AGENCY,
};

export const paddleConfigured = (): boolean =>
  Boolean(API_KEY && CLIENT_TOKEN && PRICES.pro);

/* ── 1. is this request genuine ───────────────────────────────────────────── */

/**
 * How long a signature stays acceptable.
 *
 * Paddle's own SDKs default to five seconds. That is tight enough that a
 * container whose clock has drifted a few seconds starts refusing real
 * webhooks, and a refused webhook here means somebody who paid does not get
 * their plan. Five minutes is Stripe's figure and the right trade: the HMAC is
 * what stops forgery, and the window only bounds how long a captured request
 * could be replayed.
 */
export const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

/**
 * `Paddle-Signature: ts=1671552777;h1=eb4d0dc...`
 *
 * The signed payload is **`${ts}:${rawBody}`**, HMAC-SHA256, hex. Three things
 * about that are easy to get wrong and all three fail closed, which makes them
 * look like Paddle misbehaving:
 *
 * 1. The timestamp is part of what is signed. Hashing the body alone verifies
 *    nothing that was actually sent.
 * 2. Raw bytes, not the parsed object. `JSON.parse` then `JSON.stringify` does
 *    not reproduce the original byte for byte, and the signature is over the
 *    original.
 * 3. `timingSafeEqual` throws on a length mismatch rather than returning false,
 *    so lengths are compared first. A malformed header is not an exception, it
 *    is an unsigned request, and unsigned requests are simply refused.
 */
export function verifySignature(
  raw: Buffer,
  header: string | undefined,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!header) return false;

  // `ts=...;h1=...`, and tolerant of more parts arriving later: Paddle versions
  // its signature scheme by adding `h2`, so an unknown part must not break this.
  const parts = new Map<string, string>();
  for (const piece of header.split(";")) {
    const at = piece.indexOf("=");
    if (at > 0) parts.set(piece.slice(0, at).trim(), piece.slice(at + 1).trim());
  }

  const ts = parts.get("ts");
  const h1 = parts.get("h1");
  if (!ts || !h1) return false;

  const seconds = Number(ts);
  if (!Number.isFinite(seconds)) return false;
  if (Math.abs(now - seconds * 1000) > SIGNATURE_WINDOW_MS) return false;

  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${ts}:${raw.toString("utf8")}`).digest("hex"),
    "utf8",
  );
  const given = Buffer.from(h1, "utf8");

  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/* ── 2. what did they buy ─────────────────────────────────────────────────── */

/**
 * Price id back to a plan name.
 *
 * Takes the mapping as an argument rather than reading the module constant, so
 * a test can state the mapping it is testing instead of manipulating the
 * environment.
 */
export function planForPrice(
  priceId: string | null | undefined,
  prices: Record<string, string | undefined> = PRICES,
): PlanName {
  if (!priceId) return "free";

  for (const [plan, configured] of Object.entries(prices)) {
    if (configured && configured === priceId) return plan as PlanName;
  }

  // Another product in the same account, or a price rotated without updating
  // the environment. Refusing to guess is safer than handing out a plan, and
  // the warning is how anybody finds out.
  console.warn("[billing] unknown price on subscription:", priceId);
  return "free";
}

/* ── 3. do they currently have it ─────────────────────────────────────────── */

export type PaddleSubscription = {
  id?: string;
  status?: string;
  customer_id?: string;
  next_billed_at?: string | null;
  canceled_at?: string | null;
  current_billing_period?: { starts_at?: string | null; ends_at?: string | null } | null;
  scheduled_change?: { action?: string; effective_at?: string | null } | null;
  items?: { price?: { id?: string } | null }[];
  custom_data?: Record<string, unknown> | null;
};

/**
 * Which Paddle statuses mean "they have the thing right now".
 *
 * ── `canceled` is OUT, and this is the difference that would bite ──────────
 *
 * The previous provider's `cancelled` meant "future payments stopped, the paid
 * period runs on", so it had to be treated as entitled or somebody lost the
 * month they had already paid for the moment they clicked cancel. **Paddle does
 * not work that way.** A Paddle subscription stays `active` with a
 * `scheduled_change` of `cancel` until the period ends, and only then becomes
 * `canceled`. By the time the status says canceled it really is over.
 *
 * Porting the old set across verbatim would therefore have granted a plan to
 * everybody whose subscription had fully ended, indefinitely, and nothing would
 * have looked wrong from the outside. It is the exact reason this function is
 * pure and has a test.
 *
 * `past_due` is in, because retries are still running and cutting somebody off
 * over a card that expired on Tuesday is a support ticket, not a policy.
 * `paused` is out: collection is deliberately stopped, and nothing in this
 * product pauses a subscription, so meeting one means something unexpected has
 * happened and the safe reading is the conservative one.
 */
const ENTITLED = new Set(["active", "trialing", "past_due"]);

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
 * exists to prevent. In Paddle it is a pending `scheduled_change`, not a status.
 *
 * The plan comes from the **first item's price**. Every plan here is one
 * subscription of one price; a second item would be an add-on, and picking the
 * first is both what we sell and a great deal better than summing them.
 */
export function entitlementOf(
  sub: PaddleSubscription,
  prices: Record<string, string | undefined> = PRICES,
): Entitlement {
  const entitled = ENTITLED.has(sub.status ?? "");

  const change = sub.scheduled_change;
  const ending = Boolean(entitled && change?.action === "cancel");

  return {
    plan: entitled ? planForPrice(sub.items?.[0]?.price?.id, prices) : "free",
    entitled,
    // When a cancellation is scheduled there is no next payment, so
    // `next_billed_at` is the wrong field to read: `effective_at` is when access
    // actually stops. Reading the other one is how somebody is told their
    // cancelled plan renews next month.
    renewsAt: entitled
      ? ending
        ? (change?.effective_at ?? sub.current_billing_period?.ends_at ?? null)
        : (sub.next_billed_at ?? null)
      : null,
    endsAtPeriodEnd: ending,
  };
}

/** The user id we put on the checkout, handed back on every event since. */
export function userIdOn(sub: PaddleSubscription): string | null {
  const value = sub.custom_data?.user_id;
  return typeof value === "string" && value ? value : null;
}

/* ── the network half ─────────────────────────────────────────────────────── */

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_KEY) {
    throw new HttpError(503, "No PADDLE_API_KEY. Billing is not set up on this server.");
  }

  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    // Paddle's errors come back as `{ error: { detail, code } }`. Read the
    // detail if it is there, because "403" on its own tells nobody anything.
    const body = (await response.json().catch(() => null)) as {
      error?: { detail?: string; code?: string };
    } | null;
    const detail = body?.error?.detail ?? response.statusText;
    throw new HttpError(502, `Paddle: ${detail}`);
  }

  return (await response.json()) as T;
}

type TransactionResponse = { data?: { id?: string } };

/**
 * A transaction for one person and one plan, which the browser then opens.
 *
 * `custom_data` is the important part: Paddle copies it from the transaction on
 * to the subscription it creates, and every webhook for that subscription
 * carries it from then on. It is how a payment becomes a *user*, and without it
 * the only link between the two is an email address, which people change.
 *
 * No customer is created up front. Paddle creates one when the checkout is
 * actually paid, so there is nothing to pre-register and nothing to clean up
 * after somebody opens checkout and closes the tab.
 */
export async function createTransaction(input: {
  priceId: string;
  userId: string;
}): Promise<string> {
  const out = await call<TransactionResponse>("/transactions", {
    method: "POST",
    body: JSON.stringify({
      items: [{ price_id: input.priceId, quantity: 1 }],
      collection_mode: "automatic",
      // A string, read back as a string. Sending a number and comparing it to a
      // string is a bug that only appears in production, where the ids are real.
      custom_data: { user_id: input.userId },
    }),
  });

  const id = out.data?.id;
  if (!id) throw new HttpError(502, "Paddle did not return a transaction");
  return id;
}

type PortalResponse = {
  data?: {
    urls?: {
      general?: { overview?: string };
      subscriptions?: { id?: string; cancel_subscription?: string }[];
    };
  };
};

/**
 * A signed, short-lived link into Paddle's own customer portal.
 *
 * Cancelling, changing card and invoices are all Paddle's screens. Building our
 * own would mean handling card details, which is a compliance burden nobody
 * needs for a feature the provider hosts for free.
 *
 * The subscription id is passed so the portal can deep link to it, and the
 * general overview is the fallback: a subscription that has fully ended has no
 * deep link, and the overview still shows the invoices.
 */
export async function portalUrl(customerId: string, subscriptionId: string | null): Promise<string> {
  const out = await call<PortalResponse>(
    `/customers/${encodeURIComponent(customerId)}/portal-sessions`,
    {
      method: "POST",
      body: JSON.stringify(subscriptionId ? { subscription_ids: [subscriptionId] } : {}),
    },
  );

  const urls = out.data?.urls;
  const deep = subscriptionId
    ? urls?.subscriptions?.find((s) => s.id === subscriptionId)
    : undefined;

  const url = urls?.general?.overview ?? deep?.cancel_subscription;
  if (!url) throw new HttpError(502, "Paddle did not return a portal URL");
  return url;
}

type SubscriptionResponse = { data?: PaddleSubscription };

export async function fetchSubscription(id: string): Promise<PaddleSubscription> {
  const out = await call<SubscriptionResponse>(`/subscriptions/${encodeURIComponent(id)}`);
  const sub = out.data;
  if (!sub) throw new HttpError(502, "Paddle returned no subscription");
  return sub;
}
