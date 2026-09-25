/**
 * Taking money, and deciding who has paid.
 *
 * The shape to understand: the browser never says what plan someone is on, and
 * the server never believes it if it does. The browser can only ask for a
 * checkout to open. What a person actually has is decided in one place, a
 * webhook whose signature has been verified against the Paddle signing secret,
 * and written with the Supabase secret key, because the database deliberately
 * refuses that column to everyone else.
 *
 * Get that backwards and the paywall is theatre. A client that reports its own
 * plan is a client that can report any plan.
 *
 * The provider is Paddle, and the reason is that they are the merchant of
 * record: they owe the VAT, in every country a customer lives in, not us. What
 * that costs is a percentage; what it saves is EU-wide VAT registration and
 * quarterly filings for a product that may earn nothing. See `paddle.ts`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { bearer, HttpError, json, readJson, readRaw } from "./http.js";
import {
  CLIENT_TOKEN,
  createTransaction,
  entitlementOf,
  PADDLE_ENV,
  paddleConfigured,
  portalUrl,
  PRICES,
  userIdOn,
  verifySignature,
  WEBHOOK_SECRET,
  type PaddleSubscription,
} from "./paddle.js";
import { readBilling, requireCaller, setPlan, userIdForCustomer } from "./supabase.js";

const SITE = process.env.PUBLIC_SITE_URL ?? "http://localhost:5173";

export const billingConfigured = paddleConfigured;

/* ── checkout ─────────────────────────────────────────────────────────────── */

type CheckoutBody = { plan?: string };

/**
 * A transaction, and what the browser needs to open it.
 *
 * Paddle's checkout runs in the page rather than on a hosted page of theirs,
 * which is the one real difference from the provider this replaced. There is no
 * URL to send somebody to; there is a transaction id, and the browser opens it.
 *
 * The client token travels in this response rather than in the bundle. It is
 * public either way, but a `VITE_` copy would be a second place to configure
 * billing and a second place for it to be wrong.
 */
export async function checkout(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  const body = await readJson<CheckoutBody>(req);

  const plan = body.plan === "agency" ? "agency" : "pro";
  const priceId = PRICES[plan];
  if (!priceId) throw new HttpError(503, `No price configured for ${plan}`);
  if (!CLIENT_TOKEN) throw new HttpError(503, "No PADDLE_CLIENT_TOKEN on this server");

  const transactionId = await createTransaction({ priceId, userId: caller.id });

  json(res, 200, {
    transactionId,
    clientToken: CLIENT_TOKEN,
    environment: PADDLE_ENV,
    // Paddle sends them back here itself once the payment lands. The flag is
    // what lets the UI say "finishing up" rather than showing Free to somebody
    // who has just paid, since the webhook may still be in flight.
    successUrl: `${SITE}/?checkout=done`,
  });
}

/* ── customer portal ──────────────────────────────────────────────────────── */

/**
 * Cancelling, changing card, invoices, all of it is Paddle's own screen.
 *
 * The portal URL is **signed and short-lived**, so it is fetched per request
 * rather than stored. It hangs off the customer, and the subscription is passed
 * only so the portal can deep link to it: somebody whose subscription has fully
 * ended still has invoices to read.
 */
export async function portal(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  const billing = await readBilling(caller.id);

  if (!billing.customerId) throw new HttpError(400, "There is nothing to manage yet");

  const url = await portalUrl(billing.customerId, billing.subscriptionId);
  json(res, 200, { url });
}

/* ── webhook ──────────────────────────────────────────────────────────────── */

type PaddleEvent = {
  event_type?: string;
  data?: PaddleSubscription;
};

/**
 * The only thing that may change a plan.
 *
 * Signature verification is not optional and not a nicety: without it this is an
 * open endpoint where anyone who guesses the URL can POST themselves a
 * subscription. The raw bytes matter for the same reason, re-encoding the body
 * invalidates the signature.
 */
export async function webhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!WEBHOOK_SECRET) throw new HttpError(503, "No PADDLE_WEBHOOK_SECRET on this server");

  const raw = await readRaw(req);
  const signature = req.headers["paddle-signature"];

  if (!verifySignature(raw, typeof signature === "string" ? signature : undefined, WEBHOOK_SECRET)) {
    // Deliberately terse: a caller failing verification does not get told why.
    console.warn("[billing] rejected an unverified webhook");
    throw new HttpError(400, "Signature verification failed");
  }

  let event: PaddleEvent;
  try {
    event = JSON.parse(raw.toString("utf8")) as PaddleEvent;
  } catch {
    throw new HttpError(400, "Webhook body was not JSON");
  }

  await handle(event);

  // Acknowledge fast. Anything slow here just makes Paddle retry.
  json(res, 200, { received: true });
}

async function handle(event: PaddleEvent): Promise<void> {
  const name = event.event_type ?? "";

  /*
   * Every `subscription.*` event carries the whole subscription, so they are all
   * handled the same way: read the current state and write what it means.
   *
   * `transaction.*` events are deliberately excluded. They carry an invoice, not
   * a subscription, and a renewal that moves `next_billed_at` also raises
   * `subscription.updated`. Handling both would mean two writes for one change,
   * and the invoice one has less information.
   */
  if (!name.startsWith("subscription.")) return;

  const sub = event.data;
  const subscriptionId = sub?.id;
  if (!sub || !subscriptionId) return;

  // custom_data is how a payment becomes a user: Paddle copies it from the
  // transaction on to the subscription. The lookup by customer id is a fallback
  // for the case where it is missing, which should not happen and would be hard
  // to diagnose if it did.
  const userId =
    userIdOn(sub) ?? (sub.customer_id ? await userIdForCustomer(sub.customer_id) : null);

  if (!userId) {
    console.warn("[billing] no user for subscription", subscriptionId);
    return;
  }

  const entitlement = entitlementOf(sub);

  await setPlan(userId, {
    plan: entitlement.plan,
    ...(sub.customer_id ? { customerId: sub.customer_id } : {}),
    subscriptionId: entitlement.entitled ? subscriptionId : null,
    renewsAt: entitlement.renewsAt,
    endsAtPeriodEnd: entitlement.endsAtPeriodEnd,
  });

  console.log(`[billing] ${userId} -> ${entitlement.plan} (${sub.status})`);
}

/* ── status, for the client ───────────────────────────────────────────────── */

export async function status(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  const billing = await readBilling(caller.id);
  json(res, 200, {
    configured: billingConfigured(),
    plan: billing.plan,
    // The portal is a customer's screen, not a subscription's, so a lapsed
    // subscriber can still get to their invoices.
    manageable: Boolean(billing.customerId),
  });
}
