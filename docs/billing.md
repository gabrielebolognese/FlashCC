# Billing setup

Stripe, end to end. Test mode throughout, swap to live keys only when you are ready to charge
real people.

## How it works, in one paragraph

The browser can do exactly one billing thing: ask the server for a Checkout link. It never says
what plan someone is on, and the server never believes it if it does. What a person actually has
is decided in one place, `server/billing.ts`, handling a webhook whose signature has been
verified against the Stripe secret, and written with the Supabase service role key, because the
database refuses `profiles.plan` to everyone else. Get that backwards and the paywall is theatre:
a client that reports its own plan can report any plan.

## 1. The Supabase service role key

**Dashboard → Project Settings → API → `service_role`** (click to reveal).

Put it in `.env` as `SUPABASE_SERVICE_ROLE_KEY`. This key bypasses row level security entirely.
It never gets a `VITE_` prefix, never goes in the browser, never gets logged.

## 2. Stripe products

[dashboard.stripe.com](https://dashboard.stripe.com) with **Test mode** toggled on.

**Product catalogue → Add product**, twice:

| Product | Price | Billing |
| --- | --- | --- |
| FlashCC Pro | 29.00 | Recurring, monthly |
| FlashCC Agency | 79.00 | Recurring, monthly |

After saving each, copy the **price id**, it starts with `price_`, not `prod_`. That distinction
costs people an afternoon.

```
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_AGENCY=price_...
```

## 3. The secret key

**Developers → API keys → Secret key**. Into `.env` as `STRIPE_SECRET_KEY`.

## 4. The webhook

In development, Stripe cannot reach `localhost`, so its CLI forwards for you.

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli), then:

```
stripe login
stripe listen --forward-to localhost:8787/api/billing/webhook
```

It prints a signing secret (`whsec_…`). That goes in `.env` as `STRIPE_WEBHOOK_SECRET`, and **it
changes every time you run `stripe listen`**, so expect to update it.

Leave that command running while you test. Restart the server after editing `.env`.

In production instead: **Developers → Webhooks → Add endpoint**, pointed at
`https://yourdomain.com/api/billing/webhook`, subscribed to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## 5. Check it

`curl localhost:8787/api/health` should report `"billing":true` and `"serviceRole":true`.

Then in the app: sign in → **See Pro** → **Choose Pro** → pay with Stripe's test card
`4242 4242 4242 4242`, any future expiry, any CVC.

You should land back on the app with a gold banner saying the plan is being turned on, and the
rail should flip to **Pro** within a second or two. The `stripe listen` terminal shows the events
arriving; the server logs `[billing] <user id> -> pro (active)`.

If the rail stays on Free: check that terminal. A `400 Signature verification failed` means
`STRIPE_WEBHOOK_SECRET` does not match the running `stripe listen`.

## 6. Turn the gate on

Only once the above works end to end:

```
supabase/02-pro-gate.sql
```

Paste it into the Supabase SQL editor and run it. Until then a free account syncs its pipeline
like a paying one, and there is nothing to buy.

After it, a free account can still **read** everything it already has, a lapsed subscriber
pulling their own history back out is not the moment to look like confiscation, but cannot write
new pipeline records to the cloud. Carousels are never gated; the editor is the free tier.

## What is deliberately not built

- **Invoices, cancelling, card changes.** All of it is Stripe's hosted billing portal, reached
  from **Manage subscription** in the pricing panel. Building our own would mean handling card
  details, which is a compliance burden for a screen Stripe hosts for free.
- **Proration and plan switching logic.** The portal does it.
- **Dunning.** Stripe's retry and reminder settings do it. Note that `past_due` currently counts
  as entitled, so a failed payment does not cut access off mid-retry, change `ENTITLED` in
  `server/billing.ts` if you would rather it did.
