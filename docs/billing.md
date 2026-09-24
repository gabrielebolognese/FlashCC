# Billing setup

Lemon Squeezy, end to end. Test mode throughout, switch the store to live only when you are ready
to charge real people.

## Why Lemon Squeezy and not Stripe

They are the **merchant of record**. They sell the product to the customer and then pay us, which
makes them the party who owes VAT in every country a customer lives in. The alternative is
registering for VAT OSS and filing quarterly across the EU for a product that might earn nothing,
which is a real cost paid up front against a hypothetical one.

What it costs is a percentage on every sale. What it saves is the whole of tax compliance.

> Worth knowing: Stripe now offers the same thing under **Managed Payments**, and Stripe owns
> Lemon Squeezy. If you ever want to move back, the integration this replaced is in git history at
> `572ebd7` and enabling Stripe as merchant of record is one parameter on a Checkout Session.

## How it works, in one paragraph

The browser can do exactly one billing thing: ask the server for a checkout link. It never says
what plan someone is on, and the server never believes it if it does. What a person actually has
is decided in one place, `server/billing.ts`, handling a webhook whose signature has been verified
against the Lemon Squeezy signing secret, and written with the Supabase secret key, because the
database refuses `profiles.plan` to everyone else. Get that backwards and the paywall is theatre:
a client that reports its own plan can report any plan.

## 1. The Supabase secret key

**Dashboard, Project Settings, API Keys, "Create secret key"**. It looks like `sb_secret_...`.

Put it in `.env` as `SUPABASE_SECRET_KEY`. This key bypasses row level security entirely. Do not
use the legacy `service_role` JWT: Supabase is deprecating it by the end of 2026. The old variable
name is still read as a fallback.

It never gets a `VITE_` prefix, never goes in the browser, never gets logged.

## 2. The store

[app.lemonsqueezy.com](https://app.lemonsqueezy.com). Create a store if you have not.

**Keep the store in test mode** while you set this up. In Lemon Squeezy test mode is a toggle on
the store, not a separate set of keys, so check which mode you are in before charging anybody.

**Settings, Stores** gives you the store id. A plain number.

```
LEMON_STORE_ID=12345
```

## 3. Products and variants

**Products, New product**, twice:

| Product | Price | Billing |
| --- | --- | --- |
| FlashCC Pro | 29.00 | Subscription, monthly |
| FlashCC Agency | 79.00 | Subscription, monthly |

Then open each product and copy the **variant id**, not the product id. A product holds variants
(monthly, yearly) and the variant is what a webhook carries. That distinction costs people an
afternoon.

If the product page does not show it, `GET https://api.lemonsqueezy.com/v1/variants` lists them.

```
LEMON_VARIANT_PRO=111111
LEMON_VARIANT_AGENCY=222222
```

## 4. The API key

**Settings, API, create an API key**. Into `.env` as `LEMON_API_KEY`.

## 5. The webhook

**Settings, Webhooks, add endpoint.**

In production, point it at `https://yourdomain.com/api/billing/webhook`.

In development Lemon Squeezy cannot reach `localhost`, and unlike Stripe there is no official CLI
forwarder. Use a tunnel:

```
npx untun@latest tunnel http://localhost:8787
```

and point the webhook at `<the tunnel url>/api/billing/webhook`.

**Signing secret:** you choose it, 6 to 40 characters. The same string goes in `.env` as
`LEMON_WEBHOOK_SECRET`. Unlike the Stripe CLI it does not rotate, so you set it once.

Subscribe to these events:

- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_resumed`
- `subscription_expired`
- `subscription_paused`
- `subscription_unpaused`

The `subscription_payment_*` events are deliberately not subscribed to. They carry an invoice
rather than a subscription, and a renewal that moves the date also raises `subscription_updated`.

Restart the server after editing `.env`.

## 6. Check it

`curl localhost:8787/api/health` should report `"billing":true` and `"secretKey":true`.

Then in the app: sign in, **See Pro**, **Choose Pro**, and pay with the test card
`4242 4242 4242 4242`, any future expiry, any CVC.

You should land back on the app with a gold banner saying the plan is being turned on, and the
rail should flip to **Pro** within a second or two. The server logs
`[billing] <user id> -> pro (active)`.

If the rail stays on Free, check the server log. A `400 Signature verification failed` means
`LEMON_WEBHOOK_SECRET` does not match what you typed into the dashboard.

## 7. Turn the gate on

Only once the above works end to end:

```
supabase/02-pro-gate.sql
supabase/09-gates.sql
```

Paste each into the Supabase SQL editor and run it. Until then a free account syncs its pipeline
like a paying one, and there is nothing to buy.

After them, a free account can still **read** everything it already has, a lapsed subscriber
pulling their own history back out is not the moment to look like confiscation, but cannot write
new pipeline records to the cloud. Carousels are never gated; the editor is the free tier.

## What is deliberately not built

- **Invoices, cancelling, card changes.** All of it is Lemon Squeezy's hosted portal, reached from
  **Manage subscription** in the pricing panel. Building our own would mean handling card details,
  which is a compliance burden for a screen the provider hosts for free.

  Note the portal URL is **signed and short-lived**, so it is fetched per request rather than
  stored, and it hangs off the subscription rather than the customer. Somebody whose subscription
  has fully expired has nothing left to manage and is told so.
- **Proration and plan switching logic.** The portal does it.
- **Dunning.** Their retry and reminder settings do it. Note that `past_due` counts as entitled,
  so a failed payment does not cut access off mid-retry. Change `ENTITLED` in `server/lemon.ts` if
  you would rather it did.
- **Anything metered.** Invariant 7. Plans differ by what they do, never by how many times.
