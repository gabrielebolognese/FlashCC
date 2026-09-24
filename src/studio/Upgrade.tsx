/**
 * The pricing panel.
 *
 * The tiers are drawn along the line the product actually splits on: making a
 * carousel is the free part, and everything that turns making into a practice,
 * keeping the history, scheduling it, learning from it, running more than one
 * brand, is what a subscription is for. A tool that gated the editor would just
 * be a worse Canva; gating the loop is the only version of this worth money.
 *
 * Nothing here knows what plan you are on. It is told, from a profile the server
 * wrote after verifying a Lemon Squeezy webhook.
 */
import { Check, ExternalLink, X } from "lucide-react";
import { useState } from "react";

import { openPortal, startCheckout } from "./billing.js";
import type { Plan } from "./cloud.js";

type Tier = {
  id: Plan;
  name: string;
  price: string;
  cadence: string;
  line: string;
  features: string[];
  featured?: boolean;
};

/**
 * The one line on this screen that is a commitment rather than a description.
 *
 * Sprout charges $499/month per external approver and caps the account at three.
 * It is the loudest single complaint in the whole research corpus, and Planable,
 * Gain and Ziflow all give reviewer seats away as an acquisition lever. Saying
 * so on the pricing page is free and nobody has taken it.
 *
 * See CLAUDE.md invariant 6. If this line ever has to come down, the product has
 * changed into the thing it was built against.
 */
export const REVIEWER_PROMISE =
  "Everyone you send a review link to is free. No seats, no per-approver fee, no cap on how many people can comment or approve. Not as an introductory offer, as the point.";

/**
 * The second commitment on this screen, and the cheapest one in the document.
 *
 * "A rationing system, not a content tool" is how users describe metered
 * competitors, and a rival already uses "no credit limits" as its wedge. There is
 * no credit, quota or usage counter anywhere in this codebase, see CLAUDE.md
 * invariant 7, so this costs nothing to say and nobody else has said it.
 */
export const UNMETERED_PROMISE =
  "Nothing here is metered. No credits, no generation limits, no counting your exports. Plans differ by what they do, never by how many times you may do it.";

/**
 * What happens to your money, in the words somebody would use if they were
 * telling you honestly.
 *
 * Every line is a real failure somebody had in this category, written down
 * verbatim in the research: Loomly raising a yearly price by 996% ("it feels
 * predatory and unkind to small businesses like mine"), Taplio charging "over
 * 60€ per month" after a trial with "no emails, no reminders", Contentdrips
 * revoking access the moment you cancel, Later charging $180 four months after a
 * cancellation.
 *
 * FlashCC already behaves this way, `ENTITLED` in server/billing.ts keeps a
 * cancelled subscription entitled until the period ends, and the billing
 * portal is one click from here. What was missing was saying so, which is the
 * whole of 8.2 and costs nothing.
 */
export const BILLING_TERMS: { title: string; body: string }[] = [
  {
    title: "Cancel yourself, in two clicks",
    body: "Manage subscription opens the payment provider's own portal. No email to support, no retention call, no form.",
  },
  {
    title: "You keep what you paid for",
    body: "Cancelling stops the next charge. Everything stays unlocked until the end of the period you already paid for, and your work stays yours afterwards either way.",
  },
  {
    title: "No surprise renewals",
    body: "The date you renew is on your account card, always. If a trial is going to become a charge, you will have been told before it does.",
  },
  {
    title: "A price you agreed to is the price",
    body: "If it ever changes, you get told before it takes effect, and you can leave first. Nobody wakes up to a different number.",
  },
];

export const PLANS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    line: "Make carousels, and keep them safe.",
    features: [
      "Unlimited carousels",
      "Every framework and style",
      "The full canvas editor",
      "PDF export",
      "Synced across your devices",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    cadence: "a month",
    line: "The loop: post it, measure it, learn from it.",
    featured: true,
    features: [
      "Everything in Free",
      "Up to 5 clients",
      "Review links, unlimited reviewers, free",
      "Pipeline board and scheduling",
      "Analytics with structural attribution",
      "Outlier detection on your own baseline",
      "PNG and PDF export",
      "AI drafting",
    ],
  },
  {
    id: "agency",
    name: "Agency",
    price: "$79",
    cadence: "a month",
    line: "More than one brand, more than one person.",
    features: [
      "Everything in Pro",
      "Unlimited clients and brand kits",
      "White-labelled review pages",
      "Approvals pinned to the version approved",
      "Shared asset library",
    ],
  },
];

export function Upgrade({
  plan,
  signedIn,
  manageable,
  onSignIn,
  onClose,
}: {
  plan: Plan;
  signedIn: boolean;
  manageable: boolean;
  onSignIn: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (tier: Tier) => {
    if (tier.id === "free" || busy) return;

    if (!signedIn) {
      onClose();
      onSignIn();
      return;
    }

    setBusy(tier.id);
    setError(null);
    try {
      await startCheckout(tier.id);
      // startCheckout navigates away; reaching here means it did not.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
      setBusy(null);
    }
  };

  const manage = async () => {
    setBusy("free");
    setError(null);
    try {
      await openPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the billing portal");
      setBusy(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 z-modal w-[900px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-hairline bg-surface-2 p-6 shadow-modal">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-[22px] font-semibold leading-7 tracking-[-0.4px] text-primary">
              Making one is free. Running the practice is Pro.
            </h2>
            <p className="mt-1 text-body text-tertiary">
              Every plan gets the editor, all four frameworks, and your work synced. Pro is what
              remembers what you posted and tells you which of it worked.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-primary"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {PLANS.map((tier) => {
            const current = tier.id === plan;
            return (
              <div
                key={tier.id}
                className={[
                  "flex flex-col rounded-3xl border p-4",
                  tier.featured ? "border-accent-dim bg-accent-wash" : "border-hairline bg-surface-1",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span className="text-title text-primary">{tier.name}</span>
                  {current ? (
                    <span className="rounded-md border border-hairline px-1.5 py-0.5 text-overline uppercase text-secondary">
                      Current
                    </span>
                  ) : tier.featured ? (
                    <span className="rounded-md border border-accent-dim px-1.5 py-0.5 text-overline uppercase text-accent">
                      Most useful
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-[30px] font-semibold leading-8 tracking-[-0.6px] text-primary">
                    {tier.price}
                  </span>
                  <span className="text-caption text-tertiary">{tier.cadence}</span>
                </div>

                <p className="mt-2 text-body text-tertiary">{tier.line}</p>

                <ul className="mt-4 flex-1 space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check
                        size={13}
                        strokeWidth={2.4}
                        className={["mt-0.5 shrink-0", tier.featured ? "text-accent" : "text-tertiary"].join(" ")}
                      />
                      <span className="text-body text-secondary">{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={current || busy !== null}
                  onClick={() => void choose(tier)}
                  style={
                    tier.featured && !current
                      ? { background: "var(--brand-gold)", color: "var(--on-brand-gold)" }
                      : undefined
                  }
                  className={[
                    "mt-4 flex h-9 items-center justify-center rounded-xl text-body-strong",
                    current || busy !== null ? "pointer-events-none opacity-60" : "",
                    tier.featured && !current
                      ? "hover:brightness-110"
                      : "border border-hairline text-secondary hover:text-primary",
                  ].join(" ")}
                >
                  {current
                    ? "Your plan"
                    : busy === tier.id
                      ? "Opening checkout…"
                      : !signedIn
                        ? "Sign in to subscribe"
                        : `Choose ${tier.name}`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Not footnotes. See REVIEWER_PROMISE and UNMETERED_PROMISE for why these
            are on the pricing screen rather than buried in terms nobody reads. */}
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <p className="rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3 text-body leading-5 text-secondary">
            {REVIEWER_PROMISE}
          </p>
          <p className="rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3 text-body leading-5 text-secondary">
            {UNMETERED_PROMISE}
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-hairline bg-surface-1 p-4">
          <span className="text-overline uppercase text-tertiary">What happens to your money</span>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {BILLING_TERMS.map((t) => (
              <div key={t.title}>
                <div className="flex items-start gap-1.5">
                  <Check size={13} strokeWidth={2.4} className="mt-0.5 shrink-0 text-success" />
                  <span className="text-body-strong text-primary">{t.title}</span>
                </div>
                <p className="mt-0.5 pl-[19px] text-caption leading-4 text-tertiary">{t.body}</p>
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl border border-danger-dim bg-danger-wash px-3.5 py-2.5 text-body text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <p className="flex-1 text-caption text-muted">
            Payment and VAT are handled by Lemon Squeezy, our merchant of record. Card
            details never reach FlashCC.
          </p>
          {manageable ? (
            <button
              type="button"
              onClick={() => void manage()}
              disabled={busy !== null}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-hairline px-3 text-caption text-secondary hover:text-primary disabled:pointer-events-none disabled:opacity-60"
            >
              Manage subscription
              <ExternalLink size={12} strokeWidth={2} />
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
