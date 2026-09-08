/**
 * The pricing panel.
 *
 * The tiers are drawn along the line the product actually splits on: making a
 * carousel is the free part, and everything that turns making into a practice —
 * keeping the history, scheduling it, learning from it, running more than one brand —
 * is what a subscription is for. A tool that gated the editor would just be a worse
 * Canva; gating the loop is the only version of this that is worth money.
 *
 * Checkout is not connected. The button below marks the spot rather than pretending.
 */
import { Check, X } from "lucide-react";
import { useState } from "react";

type Plan = {
  id: string;
  name: string;
  price: string;
  cadence: string;
  line: string;
  features: string[];
  featured?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    line: "Make carousels, keep them on this machine.",
    features: [
      "5 carousels a month",
      "Every framework and style",
      "The full canvas editor",
      "PDF export",
      "Saved in this browser only",
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
      "Unlimited carousels",
      "Synced across your devices",
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

export function Upgrade({ onClose }: { onClose: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);

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
              Every plan gets the editor and all four frameworks. Pro is what remembers what you
              posted and tells you which of it worked.
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
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={[
                "flex flex-col rounded-3xl border p-4",
                p.featured ? "border-accent-dim bg-accent-wash" : "border-hairline bg-surface-1",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span className="text-title text-primary">{p.name}</span>
                {p.featured ? (
                  <span className="rounded-md border border-accent-dim px-1.5 py-0.5 text-overline uppercase text-accent">
                    Most useful
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[30px] font-semibold leading-8 tracking-[-0.6px] text-primary">
                  {p.price}
                </span>
                <span className="text-caption text-tertiary">{p.cadence}</span>
              </div>

              <p className="mt-2 text-body text-tertiary">{p.line}</p>

              <ul className="mt-4 flex-1 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      size={13}
                      strokeWidth={2.4}
                      className={["mt-0.5 shrink-0", p.featured ? "text-accent" : "text-tertiary"].join(" ")}
                    />
                    <span className="text-body text-secondary">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => setPicked(p.id)}
                style={
                  p.featured
                    ? { background: "var(--brand-gold)", color: "var(--on-brand-gold)" }
                    : undefined
                }
                className={[
                  "mt-4 flex h-9 items-center justify-center rounded-xl text-body-strong",
                  p.featured
                    ? "hover:brightness-110"
                    : "border border-hairline text-secondary hover:text-primary",
                ].join(" ")}
              >
                {p.id === "free" ? "Your plan" : `Choose ${p.name}`}
              </button>
            </div>
          ))}
        </div>

        {picked && picked !== "free" ? (
          <p className="mt-4 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-2.5 text-body text-tertiary">
            Checkout is not connected yet. This is where the {picked === "pro" ? "Pro" : "Agency"}{" "}
            subscription flow goes.
          </p>
        ) : null}
      </div>
    </>
  );
}
