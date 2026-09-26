/**
 * The refund policy. Written for this product rather than adapted from a template.
 *
 * ── What it has to satisfy ───────────────────────────────────────────────────
 *
 * 1. **Paddle's seller requirement.** Their verification guidance expects at
 *    least a 30 day money-back guarantee stated on the site. Paddle's own buyer
 *    policy is 14 days statutory in the EU, EEA, UK and Switzerland and 5 to 7
 *    days in some other markets, and it says that where a supplier gives more,
 *    "the highest level of rights will always apply". So 30 days here becomes the
 *    operative figure for our customers, and it clears their bar with margin.
 *
 * 2. **`BILLING_TERMS` in `Upgrade.tsx`.** The pricing screen already makes four
 *    promises, each one lifted from a documented complaint in the research:
 *    cancel yourself in two clicks, you keep what you paid for, no surprise
 *    renewals, and a price you agreed to is the price. A refund policy that
 *    contradicted any of them would make one of the two surfaces a lie, and the
 *    pricing screen is the one people read first.
 *
 * 3. **Invariant 7, nothing is metered.** There are no credits, so there is
 *    nothing to deduct for what somebody made before asking. Saying so is not
 *    generosity, it is the only position consistent with the product: a refund
 *    that charged per carousel would be a rationing system arriving at the exit.
 *
 * 4. **The terms.** A 7 day free trial, monthly billing, and cancellation that
 *    takes effect at the end of the paid term. The trial clause below exists
 *    because of a specific research complaint about a rival charging 60 euros
 *    after a trial with "no emails, no reminders".
 *
 * Every number in here is a commitment. It is deliberately short: a refund policy
 * nobody finishes reading is one that gets disputed.
 */
import { COMPANY, postalAddress, type LegalDoc } from "./legal.js";

/** Thirty. Named once, because it appears six times below and in a test. */
export const REFUND_DAYS = 30;

/** The window on a renewal, which matches the statutory one rather than beating it. */
export const RENEWAL_REFUND_DAYS = 14;

const body = `
${COMPANY.name} ("**we**," "**us**," "**our**") sells ${COMPANY.short}, a
subscription tool for making carousels. This policy explains when we give your
money back, how to ask, and how long it takes.

Payments for ${COMPANY.short} are taken by **Paddle**, who are the merchant of
record for every purchase. That means Paddle, not us, is the party who charged
you, and Paddle is who issues the refund. We decide the policy below; they carry
it out.

> **The short version.** Ask within ${REFUND_DAYS} days of your first payment and
> you get all of it back. You do not need a reason, and we do not deduct anything
> for what you made in the meantime.

## {guarantee} 1. The ${REFUND_DAYS} day money-back guarantee

If you are not happy with ${COMPANY.short} for any reason, tell us within
**${REFUND_DAYS} days of your first payment** and we will refund it in full.

- **No reason required.** You do not have to justify it, and we will not ask you to sit through a call or fill in a form to get it.
- **Nothing is deducted for use.** ${COMPANY.short} does not meter anything, so there are no credits to subtract and no per-carousel charge at the exit. If you made forty carousels and then asked for your money back, you get all of your money back.
- **This covers the first charge after a free trial.** If a trial became a payment and you did not want it to, that payment is refundable on exactly these terms.

## {trial} 2. The free trial

New accounts get a **7 day free trial**. You are not charged during it.

If a trial is going to become a charge, you will have been told before it does,
and the renewal date is on your account screen for as long as you have a
subscription. If it still took you by surprise, section 1 applies: that first
payment is refundable in full for ${REFUND_DAYS} days.

## {renewals} 3. Renewals

Subscriptions are monthly and renew automatically until you cancel.

A **renewal** charge is refundable in full if you ask within
**${RENEWAL_REFUND_DAYS} days** of that charge. This is the same window the law
gives consumers in the EU, the EEA, the UK and Switzerland, and we apply it
everywhere rather than only where we have to.

If you simply no longer want to be billed, cancelling is usually the better move:
see section 4.

## {cancelling} 4. Cancelling, and what happens to your work

**Cancelling and refunding are different things.**

- **Cancelling** stops the next charge. Everything stays unlocked until the end of the period you have already paid for. You can cancel yourself from your account screen, which opens Paddle's own portal. No email to us, no retention call.
- **A refund** unwinds the payment, so the subscription ends and the account returns to the Free plan when it is issued. You cannot be refunded for a period and also keep using it.

**Either way, your work stays yours.** Refunding or cancelling does not delete your
carousels, your brands or your assets, and it does not take away anything you have
already exported. The Free plan keeps the editor, every framework and style, and
PDF export.

## {howto} 5. How to ask

Two routes, and either is fine:

- **Email us** at [${COMPANY.termsEmail}](mailto:${COMPANY.termsEmail}) from the address on the account, or tell us the order number from your receipt. We will approve it and Paddle will process it.
- **Go to Paddle directly** at [paddle.net](https://paddle.net) and choose "Request refund". Paddle can find your transaction from the email address you paid with. EU consumers also have a withdrawal button in Paddle's own customer portal.

We do not see or hold your card details at any point, which is why the money goes
back through Paddle rather than from us.

## {timing} 6. How long it takes

We answer refund requests within **2 working days**.

Once approved, Paddle returns the money to the **original payment method**. Paddle
issues refunds within 14 days, and in practice card refunds usually appear in 3 to
10 working days depending on your bank. The delay after that point is your bank's,
not ours, and we cannot speed it up.

## {exceptions} 7. What we will not refund

The list is short, and there is nothing else on it:

- **Charges older than the windows above.** Thirty days from a first payment, ${RENEWAL_REFUND_DAYS} days from a renewal. Ask us anyway if something unusual happened; we would rather hear it than not.
- **Fraud or refund abuse.** Repeatedly subscribing and refunding, chargebacks raised without contacting us first, or payments with evidence of fraud. Paddle applies the same rule as the merchant of record.

We do not refuse a refund because you used the product, because you are past a
usage allowance, or because you cancelled in the wrong order. None of those are
reasons.

## {statutory} 8. Your statutory rights

Nothing in this policy reduces rights you have by law.

If you are a consumer in the EU, the EEA, the UK or Switzerland, you have a
statutory right to withdraw from a purchase of digital services within 14 days.
Consumers in some other countries have shorter statutory windows. Paddle's own
[refund policy](https://www.paddle.com/legal/refund-policy) sets out those rights
in full, and states that where a supplier offers more than the law requires, the
higher level applies.

Because this policy offers ${REFUND_DAYS} days on a first payment, ${REFUND_DAYS}
days is what applies to you. Where the law in your country gives you more than
this policy does, the law wins.

Separately from refunds, if the product is faulty, not as described, or not fit for
purpose, you have remedies under consumer law that no policy of ours can sign away.

## {changes} 9. Changes to this policy

We may update this policy. The date at the top changes when we do.

A change never applies backwards: the policy that applies to a payment is the one
published on the day you made it. If we ever shorten the window, that affects
future payments only.

## {contact} 10. Contact us

${COMPANY.name}

${COMPANY.street}

${COMPANY.town}, ${COMPANY.province} ${COMPANY.postcode}

${COMPANY.country}

Phone: ${COMPANY.phone}

Email: [${COMPANY.termsEmail}](mailto:${COMPANY.termsEmail})

This policy sits alongside our [Terms and Conditions](/terms) and our
[Privacy Policy](/privacy). Postal address for written notice:
${postalAddress()}.
`;

export const REFUNDS: LegalDoc = {
  path: "/refunds",
  title: "Refund and Cancellation Policy",
  updated: "26 September 2026",
  contents: [
    { id: "guarantee", label: `1. The ${REFUND_DAYS} day money-back guarantee` },
    { id: "trial", label: "2. The free trial" },
    { id: "renewals", label: "3. Renewals" },
    { id: "cancelling", label: "4. Cancelling, and what happens to your work" },
    { id: "howto", label: "5. How to ask" },
    { id: "timing", label: "6. How long it takes" },
    { id: "exceptions", label: "7. What we will not refund" },
    { id: "statutory", label: "8. Your statutory rights" },
    { id: "changes", label: "9. Changes to this policy" },
    { id: "contact", label: "10. Contact us" },
  ],
  body,
};
