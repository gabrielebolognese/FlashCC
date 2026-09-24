/**
 * Taking money, and deciding who has paid.
 *
 * The shape to understand: the browser never says what plan someone is on, and
 * the server never believes it if it does. The browser can only ask for a
 * checkout link. What a person actually has is decided in one place, a webhook
 * whose signature has been verified against the Lemon Squeezy signing secret,
 * and written with the Supabase secret key, because the database deliberately
 * refuses that column to everyone else.
 *
 * Get that backwards and the paywall is theatre. A client that reports its own
 * plan is a client that can report any plan.
 *
 * The provider is Lemon Squeezy, and the reason is that they are the merchant of
 * record: they owe the VAT, in every country a customer lives in, not us. What
 * that costs is a percentage; what it saves is EU-wide VAT registration and
 * quarterly filings for a product that may earn nothing. See `lemon.ts`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { bearer, HttpError, json, readJson, readRaw } from "./http.js";
import {
  createCheckout,
  entitlementOf,
  fetchSubscription,
  lemonConfigured,
  VARIANTS,
  verifySignature,
  WEBHOOK_SECRET,
  type LemonSubscription,
} from "./lemon.js";
import { readBilling, requireCaller, setPlan, userIdForCustomer } from "./supabase.js";

const SITE = process.env.PUBLIC_SITE_URL ?? "http://localhost:5173";

export const billingConfigured = lemonConfigured;

/* ── checkout ─────────────────────────────────────────────────────────────── */

type CheckoutBody = { plan?: string };

/**
 * No customer is created up front, unlike the Stripe integration this replaced.
 *
 * Lemon Squeezy creates the customer when the checkout is actually paid, so
 * there is nothing to pre-register and nothing to clean up after somebody opens
 * checkout and closes the tab. The link back to our user is `custom.user_id`,
 * which rides along on every webhook the subscription ever produces.
 */
export async function checkout(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  const body = await readJson<CheckoutBody>(req);

  const plan = body.plan === "agency" ? "agency" : "pro";
  const variantId = VARIANTS[plan];
  if (!variantId) throw new HttpError(503, `No variant configured for ${plan}`);

  const url = await createCheckout({
    variantId,
    userId: caller.id,
    email: caller.email,
    redirectUrl: `${SITE}/?checkout=done`,
  });

  json(res, 200, { url });
}

/* ── customer portal ──────────────────────────────────────────────────────── */

/**
 * Cancelling, changing card, invoices, all of it is Lemon Squeezy's own screen.
 * Building our own would mean handling card details, which is a compliance
 * burden nobody needs for a feature the provider hosts for free.
 *
 * The portal URL is **signed and short-lived**, so it is fetched per request
 * rather than stored. It also hangs off the subscription rather than the
 * customer, which is why this needs a subscription id: somebody whose
 * subscription has fully expired has nothing left to manage, and gets told that
 * rather than a broken link.
 */
export async function portal(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  const billing = await readBilling(caller.id);

  if (!billing.subscriptionId) throw new HttpError(400, "There is no subscription to manage yet");

  const sub = await fetchSubscription(billing.subscriptionId);
  const url = sub.urls?.customer_portal;
  if (!url) throw new HttpError(502, "Lemon Squeezy did not return a portal URL");

  json(res, 200, { url });
}

/* ── webhook ──────────────────────────────────────────────────────────────── */

type LemonEvent = {
  meta?: { event_name?: string; custom_data?: Record<string, unknown> };
  data?: { id?: string; attributes?: LemonSubscription };
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
  if (!WEBHOOK_SECRET) throw new HttpError(503, "No LEMON_WEBHOOK_SECRET on this server");

  const raw = await readRaw(req);
  const signature = req.headers["x-signature"];

  if (!verifySignature(raw, typeof signature === "string" ? signature : undefined, WEBHOOK_SECRET)) {
    // Deliberately terse: a caller failing verification does not get told why.
    console.warn("[billing] rejected an unverified webhook");
    throw new HttpError(400, "Signature verification failed");
  }

  let event: LemonEvent;
  try {
    event = JSON.parse(raw.toString("utf8")) as LemonEvent;
  } catch {
    throw new HttpError(400, "Webhook body was not JSON");
  }

  await handle(event);

  // Acknowledge fast. Anything slow here just makes Lemon Squeezy retry.
  json(res, 200, { received: true });
}

async function handle(event: LemonEvent): Promise<void> {
  const name = event.meta?.event_name ?? "";

  /*
   * Every `subscription_*` event carries the whole subscription, so they are all
   * handled the same way: read the current state and write what it means.
   *
   * `subscription_payment_*` events are deliberately excluded. They carry an
   * invoice, not a subscription, and a renewal that moves `renews_at` also
   * raises `subscription_updated`. Handling both would mean two writes for one
   * change, and the invoice one has less information.
   */
  if (!name.startsWith("subscription_") || name.startsWith("subscription_payment_")) return;

  const attrs = event.data?.attributes;
  const subscriptionId = event.data?.id;
  if (!attrs || !subscriptionId) return;

  // custom_data is how a payment becomes a user. The lookup by customer id is a
  // fallback for the case where it is missing, which should not happen and
  // silently granting nothing would be hard to diagnose if it did.
  const fromCustom = event.meta?.custom_data?.user_id;
  const userId =
    (typeof fromCustom === "string" ? fromCustom : null) ??
    (attrs.customer_id ? await userIdForCustomer(String(attrs.customer_id)) : null);

  if (!userId) {
    console.warn("[billing] no user for subscription", subscriptionId);
    return;
  }

  const entitlement = entitlementOf(attrs);

  await setPlan(userId, {
    plan: entitlement.plan,
    ...(attrs.customer_id ? { customerId: String(attrs.customer_id) } : {}),
    subscriptionId: entitlement.entitled ? subscriptionId : null,
    renewsAt: entitlement.renewsAt,
    endsAtPeriodEnd: entitlement.endsAtPeriodEnd,
  });

  console.log(`[billing] ${userId} -> ${entitlement.plan} (${attrs.status})`);
}

/* ── status, for the client ───────────────────────────────────────────────── */

export async function status(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  const billing = await readBilling(caller.id);
  json(res, 200, {
    configured: billingConfigured(),
    plan: billing.plan,
    manageable: Boolean(billing.subscriptionId),
  });
}
