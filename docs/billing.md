# Billing: Paddle, click by click

Everything you have to do in a browser to make money arrive, in order. The code
is already written; this is the configuration it needs.

Paddle is the **merchant of record**. They sell the product to the customer and
then pay you, which makes them the party who owes VAT in every country a
customer lives in. The alternative is registering for VAT OSS and filing
quarterly across the EU for a product that might make nothing.

Roughly 40 minutes, most of it waiting for Paddle to approve the account.

---

## Before you start

| You need | Why |
| --- | --- |
| A Paddle account | paddle.com, "Get started". Sign up for **Paddle Billing**, not Classic. |
| A live site at a real domain | Paddle approves the domain before you can take live payments. |
| The Supabase secret key already in `.env` | The webhook writes the plan with it. Nothing works without it. |

Everything below can be done in the **sandbox** first, with no approval and no
real cards. Do that. The only difference in this codebase is which API key is in
`.env`, and the key itself says which environment it belongs to.

---

## 1. Sandbox, first

Paddle's sandbox is a separate account at **sandbox-vendors.paddle.com**, with
its own login, its own products and its own ids. Nothing is shared with live.

1. Go to <https://sandbox-vendors.paddle.com>, sign up.
2. You are in. There is no approval step for sandbox.

Do the whole of the rest of this document in the sandbox, take a test payment,
see the plan appear on your account, and only then repeat sections 2 to 5 in the
live dashboard.

---

## 2. Two products, two prices

**Catalog → Products → New product.**

| Field | Pro | Agency |
| --- | --- | --- |
| Name | `FlashCC Pro` | `FlashCC Agency` |
| Tax category | Standard digital goods | Standard digital goods |
| Description | Whatever the pricing screen says | Whatever the pricing screen says |

Save each one, then on the product page: **Prices → New price.**

| Field | Value |
| --- | --- |
| Type | **Recurring** |
| Billing period | Monthly |
| Amount | What `Upgrade.tsx` says. Keep them in step. |
| Currency | USD, and let Paddle handle the rest |

You now have four ids on screen. **Two of them are traps:**

```
pro_01j...   <- the PRODUCT. Not this one.
pri_01j...   <- the PRICE. This one.
```

Copy the two **`pri_`** ids.

---

## 3. The keys

**Developer tools → Authentication.**

### API key

"New API key". Name it `FlashCC server`. Permissions: it needs
`transaction.write`, `subscription.read` and `customer.write` at a minimum;
granting read and write on all four of transactions, subscriptions, customers
and prices is fine and saves a second trip.

Copy it once, now. Paddle shows it exactly once.

It begins `pdl_sdbx_apikey_` in sandbox and `pdl_live_apikey_` in live, and
**the server reads that prefix** to decide which API host to talk to. There is
no environment variable to set and no way to point a sandbox key at live data.

### Client-side token

Same screen, "New client-side token". Name it `FlashCC browser`.

This one is **public**. It is handed to the browser so Paddle's checkout can
open, and it can do nothing else. It still goes in `.env` rather than a `VITE_`
variable, so all of billing is configured in one file on one machine.

It begins `test_` in sandbox and `live_` in live.

---

## 4. Approve your domain

**Checkout → Website approval → Add website.**

Paddle's checkout refuses to open on a domain it does not know. Add:

- your real domain, and
- `localhost` if Paddle lets you (in sandbox it does), for development.

**Checkout → Checkout settings → Default payment link.** Set it to your site,
for example `https://yourdomain.com/`. This is the page Paddle appends
`?_ptxn=txn_...` to. This app opens checkout with `Paddle.Checkout.open()`
rather than by navigation, so the default link is a fallback rather than the
main path, but Paddle requires one to be set before it will create checkouts.

---

## 5. The webhook

**Developer tools → Notifications → New destination.**

| Field | Value |
| --- | --- |
| Description | `FlashCC` |
| Notification type | **Webhook** |
| URL | `https://yourdomain.com/api/billing/webhook` |
| Events | Everything beginning `subscription.` |

The events that matter are `subscription.created`, `subscription.updated`,
`subscription.activated`, `subscription.canceled`, `subscription.past_due`,
`subscription.paused` and `subscription.resumed`. Subscribing to all of them is
correct: the handler reads whatever state arrives and writes what it means, so
an extra event is a harmless second write of the same answer.

Do **not** subscribe to `transaction.*`. Those carry an invoice rather than a
subscription, they have less information, and a renewal raises
`subscription.updated` anyway. Two writes for one change is not an improvement.

Save, then open the destination and copy its **secret key**. It begins
`pdl_ntfset_`. This is *not* the API key, and the difference matters: the
webhook route verifies signatures with this one and refuses everything without
it.

---

## 6. `.env`

```
PADDLE_API_KEY=pdl_sdbx_apikey_...
PADDLE_CLIENT_TOKEN=test_...
PADDLE_WEBHOOK_SECRET=pdl_ntfset_...
PADDLE_PRICE_PRO=pri_...
PADDLE_PRICE_AGENCY=pri_...
PUBLIC_SITE_URL=https://yourdomain.com
```

Then check it:

```
npm run paddle:prices
```

It prints every product and price in the account, marks which id is which, and
then says plainly whether what you have configured is right. It catches the four
mistakes that otherwise only show up after somebody has been charged:

- a **product** id where a price id belongs
- a price that is not in this account at all
- the API key in `PADDLE_CLIENT_TOKEN`
- a sandbox key with a live token, or the reverse

---

## 7. Take a test payment

1. `npm run dev`, sign in, open the pricing screen, click Pro.
2. Paddle's checkout opens **over the app**. It does not navigate away.
3. Pay with a sandbox card: `4242 4242 4242 4242`, any future expiry, any CVC.
4. You land back on the app with `?checkout=done`.
5. The account card says "Turning your plan on", then shows Pro.

If step 5 never finishes, the webhook is the thing to look at, not the checkout.
The payment succeeded; the plan is written by the webhook.

### Webhooks in development

Your machine has no public URL, so Paddle cannot reach it. Two options:

- **Paddle's simulator.** Developer tools → Notifications → Simulations. Send a
  `subscription.created` to a public URL. Only useful once deployed.
- **A tunnel.** `npx untun@latest tunnel http://localhost:8787` or ngrok, then
  point the destination at `https://<tunnel>/api/billing/webhook`. Remember the
  secret key belongs to the destination, so a new destination means a new
  secret in `.env`.

---

## 8. Going live

Repeat sections 2 to 5 in the **live** dashboard at vendors.paddle.com. Nothing
carries over from sandbox: different products, different prices, different keys,
different webhook secret.

Then swap the five values in the production `.env`. The API key prefix changes
from `pdl_sdbx_` to `pdl_live_` and the server follows it automatically.

Before you charge anybody real money:

- [ ] `npm run paddle:prices` is clean against the live key
- [ ] `DEV_PRO` is **removed** from `.env`, or every signed-in account is Pro
- [ ] `supabase/02-pro-gate.sql` and `supabase/09-gates.sql` have been run
- [ ] A real card has been charged once and refunded, end to end
- [ ] Cancelling in the portal leaves the plan working until the period ends

That last one is worth doing by hand. Paddle keeps a cancelling subscription
`active` with a scheduled change until the period ends, and the account card
should say **"Ends 3 Oct, everything stays unlocked until then"** rather than a
renewal date. It is the promise on the pricing screen, and the research is full
of tools that break it.

---

## 9. Webhook address allowlist

Already built, and it needs no configuration in the common case.
`server/paddleips.ts` fetches Paddle's own addresses from
<https://api.paddle.com/ips> (`data.ipv4_cidrs`), caches them for 12 hours, and
refuses a webhook that did not come from one.

Two things about it worth knowing before you deploy:

**It fails open.** If that endpoint cannot be reached, requests are allowed
through to the signature check with a warning. The signature is the real
boundary; failing closed would mean an outage at Paddle's status endpoint stops
plans reaching people who have paid, which is an outage we caused ourselves with
a defence-in-depth layer.

**Behind a proxy, set `TRUST_PROXY_HOPS`.** Default 0, which judges the socket
address. On Fly, Railway, Render, Vercel or behind your own nginx, set it to 1.
Get this wrong in the other direction and the allowlist trusts a header anybody
can send, which makes it worthless: `x-forwarded-for` is caller-supplied, and the
entry your own proxy wrote is the LAST one, not the first.

If real webhooks start being refused, the log line names the address they
actually arrived from, which is usually a proxy nobody remembered was there.

---

## 10. Before verification: what your site needs

Paddle reviews the website before it lets you take live payments, and this is
where it is usually refused. Checked against Paddle's current guidance:

| Requirement | Why it fails |
| --- | --- |
| **Terms & Conditions**, live and linked from navigation | Must name the company or sole trader brand |
| **Privacy Policy**, live and linked | |
| **Refund / Cancellation Policy**, live and linked | Paddle expects **at least a 30 day money-back guarantee** |
| **Buyer support details**, email and phone, clearly on the site | Two clicks from the homepage or fewer |
| A **pricing page** whose prices match the live Paddle catalog | A mismatch is a refusal |
| **HTTPS** with a valid certificate | |
| Every domain running Checkout **serves the real product** | Not parked, not a placeholder, not a 404 |
| Only domains **related to what you sell** submitted for approval | Unrelated products raise chargeback risk and hurt approval |

Domain review is a **manual** review, roughly 5 to 7 business days, so submit it
early and do the rest while it runs. Sandbox approves domains automatically and
live does not, which is why a checkout that worked all through testing fails the
first time you point it at live.

---

## What the code does with all this

| File | Job |
| --- | --- |
| `server/paddle.ts` | The API calls, and the three pure decisions: is it genuine, what did they buy, do they have it now. |
| `server/billing.ts` | Four routes: checkout, portal, webhook, status. |
| `src/studio/billing.ts` | Loads Paddle.js on the click and opens the transaction. |
| `src/studio/Upgrade.tsx` | The pricing screen, and the promises on it. |
| `server/paddleips.ts` | The webhook address allowlist, fetched from Paddle and cached. |
| `scripts/paddle-prices.mjs` | `npm run paddle:prices`. |

`docs/reference.md` §25 is the reasoning: why `canceled` is not entitled, why
the signature covers the timestamp, why the replay window is five minutes rather
than Paddle's five seconds.
