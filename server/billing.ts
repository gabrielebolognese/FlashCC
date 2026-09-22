/**
 * Taking money, and deciding who has paid.
 *
 * The shape to understand: the browser never says what plan someone is on, and
 * the server never believes it if it does. The browser can only ask for a
 * Checkout link. What a person actually has is decided in one place — a webhook
 * whose signature has been verified against the Stripe secret — and written with
 * the service role key, because the database deliberately refuses that column to
 * everyone else.
 *
 * Get that backwards and the paywall is theatre. A client that reports its own
 * plan is a client that can report any plan.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import Stripe from "stripe";

import { bearer, HttpError, json, readJson, readRaw } from "./http.js";
import {
  readBilling,
  requireCaller,
  setPlan,
  userIdForCustomer,
  type PlanName,
} from "./supabase.js";

const SECRET = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SITE = process.env.PUBLIC_SITE_URL ?? "http://localhost:5173";

const PRICES: Record<Exclude<PlanName, "free">, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  agency: process.env.STRIPE_PRICE_AGENCY,
};

export const billingConfigured = (): boolean => Boolean(SECRET && PRICES.pro);

let stripe: Stripe | null = null;

function client(): Stripe {
  if (!SECRET) {
    throw new HttpError(503, "No STRIPE_SECRET_KEY. Billing is not set up on this server.");
  }
  stripe ??= new Stripe(SECRET);
  return stripe;
}

/** Which plan a price buys. The webhook needs this backwards from the price id. */
function planForPrice(priceId: string | null | undefined): PlanName {
  if (!priceId) return "free";
  if (priceId === PRICES.agency) return "agency";
  if (priceId === PRICES.pro) return "pro";
  // An unrecognised price is somebody else's product, or a price rotated without
  // updating the env. Refusing to guess is safer than handing out a plan.
  console.warn("[billing] unknown price on subscription:", priceId);
  return "free";
}

/** Stripe statuses that mean "they currently have the thing". */
const ENTITLED = new Set(["active", "trialing", "past_due"]);

const renewISO = (seconds: number | null | undefined): string | null =>
  typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;

/* ── checkout ─────────────────────────────────────────────────────────────── */

type CheckoutBody = { plan?: string };

export async function checkout(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  const body = await readJson<CheckoutBody>(req);

  const plan = body.plan === "agency" ? "agency" : "pro";
  const price = PRICES[plan];
  if (!price) throw new HttpError(503, `No price configured for ${plan}`);

  const billing = await readBilling(caller.id);

  // Reuse the customer if we have made one, so a person who subscribes, cancels
  // and returns keeps one billing history rather than three.
  let customerId = billing.customerId;
  if (!customerId) {
    const customer = await client().customers.create({
      ...(caller.email ? { email: caller.email } : {}),
      metadata: { userId: caller.id },
    });
    customerId = customer.id;
    await setPlan(caller.id, { plan: billing.plan, stripeCustomerId: customerId });
  }

  const session = await client().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    // Both, deliberately: client_reference_id survives on the session, metadata
    // survives on the subscription, and the webhook may see either one first.
    client_reference_id: caller.id,
    subscription_data: { metadata: { userId: caller.id, plan } },
    success_url: `${SITE}/?checkout=done`,
    cancel_url: `${SITE}/?checkout=cancelled`,
    allow_promotion_codes: true,
  });

  if (!session.url) throw new HttpError(502, "Stripe did not return a checkout URL");
  json(res, 200, { url: session.url });
}

/* ── customer portal ──────────────────────────────────────────────────────── */

/**
 * Cancelling, changing card, invoices — all of it is Stripe's own screen. Building
 * our own would mean handling card details, which is a compliance burden nobody
 * needs for a feature Stripe hosts for free.
 */
export async function portal(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  const billing = await readBilling(caller.id);

  if (!billing.customerId) throw new HttpError(400, "There is no subscription to manage yet");

  const session = await client().billingPortal.sessions.create({
    customer: billing.customerId,
    return_url: SITE,
  });

  json(res, 200, { url: session.url });
}

/* ── webhook ──────────────────────────────────────────────────────────────── */

/**
 * The only thing that may change a plan.
 *
 * Signature verification is not optional and not a nicety: without it this is an
 * open endpoint where anyone who guesses the URL can POST themselves a
 * subscription. The raw bytes matter for the same reason — re-encoding the body
 * invalidates the signature.
 */
export async function webhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!WEBHOOK_SECRET) throw new HttpError(503, "No STRIPE_WEBHOOK_SECRET on this server");

  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") throw new HttpError(400, "Missing Stripe signature");

  const raw = await readRaw(req);

  let event: Stripe.Event;
  try {
    event = client().webhooks.constructEvent(raw, signature, WEBHOOK_SECRET);
  } catch (error) {
    // Deliberately terse: a caller failing verification does not get told why.
    console.warn("[billing] rejected an unverified webhook");
    throw new HttpError(400, "Signature verification failed");
  }

  await handle(event);

  // Acknowledge fast. Anything slow here just makes Stripe retry.
  json(res, 200, { received: true });
}

async function handle(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

      if (!userId || !subscriptionId) return;

      // Read the subscription back rather than trusting the session: it carries
      // the authoritative price and period, and by now it may already have moved.
      const sub = await client().subscriptions.retrieve(subscriptionId);
      await applySubscription(userId, sub);
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const userId = sub.metadata.userId ?? (await userIdForCustomer(customerId));
      if (!userId) {
        console.warn("[billing] no user for customer", customerId);
        return;
      }
      await applySubscription(userId, sub);
      return;
    }

    default:
      // Everything else is Stripe telling us about things we do not gate on.
      return;
  }
}

async function applySubscription(userId: string, sub: Stripe.Subscription): Promise<void> {
  const item = sub.items.data[0];
  const entitled = ENTITLED.has(sub.status);
  const plan = entitled ? planForPrice(item?.price.id) : "free";

  await setPlan(userId, {
    plan,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: entitled ? sub.id : null,
    // Stripe moved the period onto the item; older accounts still carry it on the
    // subscription, so read whichever is there.
    renewsAt: entitled
      ? renewISO(
          item?.current_period_end ??
            (sub as unknown as { current_period_end?: number }).current_period_end,
        )
      : null,
  });

  console.log(`[billing] ${userId} -> ${plan} (${sub.status})`);
}

/* ── status, for the client ───────────────────────────────────────────────── */

export async function status(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  const billing = await readBilling(caller.id);
  json(res, 200, {
    configured: billingConfigured(),
    plan: billing.plan,
    manageable: Boolean(billing.customerId),
  });
}
