/**
 * The pricing panel.
 *
 * The tiers are drawn along the line the product actually splits on: making a
 * carousel is the free part, and everything that turns making into a practice —
 * keeping the history, scheduling it, learning from it, running more than one
 * brand — is what a subscription is for. A tool that gated the editor would just
 * be a worse Canva; gating the loop is the only version of this worth money.
 *
 * Nothing here knows what plan you are on. It is told, from a profile the server
 * wrote after verifying a Stripe webhook.
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
      "Unlimited brand kits",
      "Client folders and review links",
      "Approvals before anything ships",
      "Shared media pool",
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
                      ? "Opening Stripe…"
                      : !signedIn
                        ? "Sign in to subscribe"
                        : `Choose ${tier.name}`}
                </button>
              </div>
            );
          })}
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl border border-danger-dim bg-danger-wash px-3.5 py-2.5 text-body text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <p className="flex-1 text-caption text-muted">
            Payment is handled by Stripe. Card details never reach FlashCC.
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
