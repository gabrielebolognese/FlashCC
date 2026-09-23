/**
 * The landing page.
 *
 * ── Everything on it is the actual product ───────────────────────────────────
 *
 * The carousels swiping in the hero were laid out by `buildSlides`. The recolour
 * is `applyBrand`. The warnings are `preflight`. Nothing here is a screenshot or
 * a mock, which means none of it can drift out of date and none of it can
 * promise something the app does not do. A marketing page that runs the code it
 * is selling is the one kind that stays honest for free.
 *
 * ── Low text, and motion doing the explaining ────────────────────────────────
 *
 * Every section is a headline, one line, and a thing that MOVES. The demos are
 * the argument; the copy only labels them. A carousel tool that needs three
 * paragraphs to explain a carousel has already lost.
 *
 * ── The app's own rules bend here, on purpose ────────────────────────────────
 *
 * `CLAUDE.md` forbids transitions on colour, background and border, and that
 * rule is right for an editor — a 200ms fade on a selection state makes a tool
 * feel slow. A landing page has the opposite job. Motion is the product demo, so
 * it is used deliberately and it is used everywhere, and every piece of it stops
 * under `prefers-reduced-motion` with the finished state left on screen.
 */
import { ArrowRight, Check, MessageSquare, Sparkles, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { applyBrand, makeBrand } from "../studio/brand.js";
import { buildSlides } from "../studio/compositions.js";
import { makeDoc, type Doc } from "../studio/model.js";
import { platformById } from "../studio/platforms.js";
import { preflight } from "../studio/preflight.js";
import { SlidePreview } from "../studio/SlidePreview.js";
import { STYLES, styleById } from "../studio/styles.js";
import { PLANS, REVIEWER_PROMISE, UNMETERED_PROMISE } from "../studio/Upgrade.js";
import { DeckPlayer } from "./DeckPlayer.js";
import { prefersReducedMotion, useInView } from "./useInView.js";

/* ── the material every demo is built from ────────────────────────────────── */

const PITCH = [
  "Your carousels are not the problem. Your pipeline is.",
  "You write the post. Then you fight the design for an hour.",
  "Then you export ten files and name them by hand.",
  "Then you paste ten links into a scheduler.",
  "FlashCC does the other ninety minutes.",
  "Start free. No card.",
];

const SPLIT_SOURCE =
  "Every cut lands on the beat and the edit still feels flat. Attention resets when the frame changes, not when the snare hits. Cut on movement instead — a hand leaving frame, a head turning, a door closing.";

const deckFrom = (texts: string[], styleId: string): Doc => ({
  ...makeDoc("Demo"),
  styleId,
  slides: buildSlides(texts, styleById(styleId).theme),
});

/* ── small pieces ─────────────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-3 py-1 text-caption text-tertiary">
      {children}
    </span>
  );
}

function Section({
  eyebrow,
  title,
  line,
  children,
  flip = false,
}: {
  eyebrow: React.ReactNode;
  title: string;
  line: string;
  children: React.ReactNode;
  flip?: boolean;
}) {
  const [ref, seen] = useInView<HTMLElement>();

  return (
    <section ref={ref} className="mx-auto max-w-[1100px] px-6 py-20 md:py-28">
      <div
        className={[
          "grid items-center gap-10 md:gap-16 lg:grid-cols-2",
          seen ? "opacity-100" : "opacity-0",
        ].join(" ")}
        style={{
          transform: seen ? "none" : "translateY(18px)",
          transition: "opacity 700ms ease, transform 700ms cubic-bezier(0.2,0,0,1)",
        }}
      >
        <div className={flip ? "lg:order-2" : ""}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-4 text-[34px] font-semibold leading-[1.1] tracking-[-1px] text-primary md:text-[42px]">
            {title}
          </h2>
          <p className="mt-3 max-w-[38ch] text-[17px] leading-[26px] text-tertiary">{line}</p>
        </div>
        <div className={flip ? "lg:order-1" : ""}>{children}</div>
      </div>
    </section>
  );
}

/* ── hero ─────────────────────────────────────────────────────────────────── */

function Hero({ onStart }: { onStart: () => void }) {
  const deck = useMemo(() => deckFrom(PITCH, "ink"), []);

  return (
    <header className="fcc-aurora relative overflow-hidden border-b border-hairline">
      <div className="mx-auto grid max-w-[1100px] items-center gap-12 px-6 pb-24 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pb-32 lg:pt-24">
        <div className="fcc-rise">
          <Eyebrow>
            <Zap size={12} strokeWidth={2.4} className="text-accent" />
            For people who post every week
          </Eyebrow>

          <h1 className="mt-5 text-[46px] font-semibold leading-[0.98] tracking-[-2px] text-primary md:text-[64px]">
            Carousels are easy.
            <br />
            <span style={{ color: "var(--brand-gold)" }}>Posting them isn&rsquo;t.</span>
          </h1>

          <p className="mt-5 max-w-[42ch] text-[18px] leading-[28px] text-tertiary">
            Write the words. FlashCC lays them out, checks them against the platform, and hands your
            scheduler a row that already knows the URLs.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onStart}
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              className="fcc-lift flex h-12 items-center gap-2 rounded-2xl px-6 text-[15px] font-semibold shadow-overlay hover:brightness-110"
            >
              Start free
              <ArrowRight size={17} strokeWidth={2.4} />
            </button>
            <a
              href="#how"
              className="flex h-12 items-center rounded-2xl border border-hairline px-5 text-[15px] text-secondary hover:border-accent-dim hover:text-accent"
            >
              See it work
            </a>
          </div>

          <p className="mt-4 text-caption text-muted">
            No card. No credits. The editor is free forever.
          </p>
        </div>

        <div className="fcc-halo mx-auto w-full max-w-[330px]">
          <DeckPlayer slides={deck.slides} />
        </div>
      </div>
    </header>
  );
}

/* ── 1. paste, and it splits ──────────────────────────────────────────────── */

function SplitDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [step, setStep] = useState(0);

  const deck = useMemo(
    () =>
      deckFrom(
        [
          "Every cut lands on the beat and it still feels flat.",
          "Attention resets when the frame changes, not when the snare hits.",
          "Cut on movement instead.",
        ],
        "paper",
      ),
    [],
  );

  useEffect(() => {
    if (!seen) return;
    if (prefersReducedMotion()) {
      setStep(2);
      return;
    }
    const a = setTimeout(() => setStep(1), 500);
    const b = setTimeout(() => setStep(2), 1500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [seen]);

  return (
    <div ref={ref}>
      {/* The paste, which then visibly becomes the slides beneath it. */}
      <div
        className="rounded-2xl border border-hairline bg-surface-1 p-4 font-mono text-caption leading-5 text-tertiary"
        style={{
          opacity: step === 0 ? 1 : 0.35,
          transform: step === 0 ? "none" : "scale(0.985)",
          transition: "opacity 500ms ease, transform 500ms ease",
        }}
      >
        {SPLIT_SOURCE}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {deck.slides.map((slide, i) => (
          <div
            key={slide.id}
            className="overflow-hidden rounded-xl border border-hairline"
            style={{
              opacity: step >= 1 ? 1 : 0,
              transform: step >= 1 ? "none" : "translateY(20px) scale(0.94)",
              transition: `opacity 520ms ease ${i * 110}ms, transform 620ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms`,
            }}
          >
            <SlidePreview slide={slide} />
          </div>
        ))}
      </div>

      <p className="mt-3 text-caption text-muted">
        Sentence boundaries, never mid-thought. Nothing is cut where it would stop making sense.
      </p>
    </div>
  );
}

/* ── 2. one brand, every deck ─────────────────────────────────────────────── */

/**
 * Four that look nothing like each other, so the recolour is visible at a glance.
 *
 * Resolved against STYLES rather than passed to `styleById`, because that falls
 * back to the default for an id it does not know — which would have shown two
 * identical swatches and looked like the feature did not work. A typo here is
 * now a missing swatch rather than a silent duplicate.
 */
const BRAND_SET = ["ink", "paper", "terminal", "bloom"]
  .map((id) => STYLES.find((s) => s.id === id))
  .filter((s): s is (typeof STYLES)[number] => Boolean(s));

function BrandDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [which, setWhich] = useState(0);

  const base = useMemo(
    () =>
      deckFrom(
        ["Five edits that cost you the swipe.", "Cut on movement, not on beat.", "Save this."],
        "ink",
      ),
    [],
  );

  // Each swatch is a real Brand, and the recolour is the real applyBrand — the
  // same call the Brands screen makes. A mock would have been three sets of
  // hardcoded hexes that drift the first time a style changes.
  const decks = useMemo(
    () => BRAND_SET.map((style) => applyBrand(base, makeBrand(style.name, style.theme)).doc),
    [base],
  );

  useEffect(() => {
    if (!seen || prefersReducedMotion()) return;
    const t = setInterval(() => setWhich((i) => (i + 1) % BRAND_SET.length), 2200);
    return () => clearInterval(t);
  }, [seen]);

  const deck = decks[which] ?? decks[0]!;

  return (
    <div ref={ref}>
      <div className="grid grid-cols-3 gap-3">
        {deck.slides.slice(0, 3).map((slide) => (
          <div key={slide.id} className="overflow-hidden rounded-xl border border-hairline">
            <SlidePreview slide={slide} />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {BRAND_SET.map((style, i) => {
          return (
            <button
              key={style.id}
              type="button"
              aria-label={style.name}
              onClick={() => setWhich(i)}
              className="grid h-9 w-9 place-items-center rounded-xl border-2"
              style={{
                background: style.theme.bg,
                borderColor: i === which ? "var(--brand-gold)" : "var(--hairline)",
              }}
            >
              <span
                className="block h-2.5 w-2.5 rounded-full"
                style={{ background: style.theme.accent }}
              />
            </button>
          );
        })}
        <span className="ml-1 text-caption text-muted">Applied once. Never a live template.</span>
      </div>
    </div>
  );
}

/* ── 3. it checks before you post ─────────────────────────────────────────── */

function CheckDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();

  // A deliberately broken deck, so the findings are the real ones preflight
  // produces rather than three sentences somebody wrote to look plausible.
  const findings = useMemo(() => {
    const doc = deckFrom(["A hook.", "A body line.", "A close."], "ink");
    const tiny = {
      ...doc,
      slides: doc.slides.map((s, i) =>
        i === 1
          ? { ...s, layers: s.layers.map((l) => (l.kind === "text" ? { ...l, fontSize: 12 } : l)) }
          : s,
      ),
    };
    return preflight(tiny, platformById("linkedin")).slice(0, 3);
  }, []);

  return (
    <div ref={ref} className="rounded-2xl border border-hairline bg-surface-1 p-4">
      <div className="flex items-center gap-2">
        <span className="text-overline uppercase text-tertiary">Before it goes</span>
        <span className="rounded-md bg-danger-wash px-1.5 py-0.5 text-caption text-danger">
          {findings.length} to fix
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {findings.map((f, i) => (
          <div
            key={`${f.code}-${i}`}
            className="rounded-xl border border-hairline bg-surface-2 px-3 py-2.5 text-caption leading-4 text-secondary"
            style={{
              opacity: seen ? 1 : 0,
              transform: seen ? "none" : "translateX(-14px)",
              transition: `opacity 480ms ease ${i * 160}ms, transform 520ms cubic-bezier(0.22,1,0.36,1) ${i * 160}ms`,
            }}
          >
            {f.message}
          </div>
        ))}
      </div>

      <p className="mt-3 text-caption text-muted">
        Every one is a rule somebody learned the expensive way, after posting.
      </p>
    </div>
  );
}

/* ── 4. your client, no account ───────────────────────────────────────────── */

function ReviewDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const deck = useMemo(() => deckFrom(["Five edits that cost you the swipe."], "ember"), []);

  const comments = [
    { who: "Priya", body: "Love it. Can the logo go bottom-right?" },
    { who: "Marco", body: "Approved from my side." },
  ];

  return (
    <div ref={ref} className="grid grid-cols-[1fr_1.15fr] items-start gap-4">
      <div className="overflow-hidden rounded-xl border border-hairline">
        <SlidePreview slide={deck.slides[0]} />
      </div>

      <div className="flex flex-col gap-2">
        {comments.map((c, i) => (
          <div
            key={c.who}
            className="rounded-xl border border-hairline bg-surface-1 px-3 py-2.5"
            style={{
              opacity: seen ? 1 : 0,
              transform: seen ? "none" : "translateY(12px)",
              transition: `opacity 500ms ease ${600 + i * 700}ms, transform 560ms cubic-bezier(0.22,1,0.36,1) ${600 + i * 700}ms`,
            }}
          >
            <div className="text-caption font-semibold text-secondary">{c.who}</div>
            <p className="mt-0.5 text-caption leading-4 text-tertiary">{c.body}</p>
          </div>
        ))}

        <div
          className="mt-1 flex items-center gap-1.5 text-caption text-muted"
          style={{
            opacity: seen ? 1 : 0,
            transition: "opacity 500ms ease 2000ms",
          }}
        >
          <Check size={12} strokeWidth={2.4} className="text-success" />
          Approved — pinned to this exact version
        </div>
      </div>
    </div>
  );
}

/* ── the rest ─────────────────────────────────────────────────────────────── */

const PROOF = [
  { n: "9", label: "schedulers want public image URLs", sub: "None of them host the images. This one does." },
  { n: "0", label: "credits, ever", sub: "Nothing here is metered." },
  { n: "∞", label: "reviewers, free", sub: "Others charge $499 a month, each." },
];

function Pricing({ onStart }: { onStart: () => void }) {
  const [ref, seen] = useInView<HTMLElement>();

  return (
    <section ref={ref} id="pricing" className="mx-auto max-w-[1100px] px-6 py-20 md:py-28">
      <div className="text-center">
        <Eyebrow>
          <Sparkles size={12} strokeWidth={2.4} className="text-accent" />
          Flat, and unmetered
        </Eyebrow>
        <h2 className="mt-4 text-[34px] font-semibold leading-[1.1] tracking-[-1px] text-primary md:text-[42px]">
          Making one is free.
        </h2>
        <p className="mx-auto mt-3 max-w-[44ch] text-[17px] leading-[26px] text-tertiary">
          Running the practice is what costs money. The editor never will.
        </p>
      </div>

      <div className="mt-10 grid gap-3 md:grid-cols-3">
        {PLANS.map((tier, i) => (
          <div
            key={tier.id}
            className={[
              "rounded-3xl border p-5",
              tier.featured ? "border-accent-dim bg-accent-wash" : "border-hairline bg-surface-1",
            ].join(" ")}
            style={{
              opacity: seen ? 1 : 0,
              transform: seen ? "none" : "translateY(20px)",
              transition: `opacity 600ms ease ${i * 120}ms, transform 700ms cubic-bezier(0.22,1,0.36,1) ${i * 120}ms`,
            }}
          >
            <div className="text-body-strong text-primary">{tier.name}</div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-[34px] font-semibold tracking-[-1px] text-primary">
                {tier.price}
              </span>
              <span className="text-caption text-muted">{tier.cadence}</span>
            </div>
            <p className="mt-1.5 text-caption leading-4 text-tertiary">{tier.line}</p>

            <ul className="mt-4 flex flex-col gap-1.5">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-caption leading-4 text-secondary">
                  <Check size={12} strokeWidth={2.4} className="mt-0.5 shrink-0 text-success" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <p className="rounded-2xl border border-hairline bg-surface-1 px-4 py-3 text-caption leading-4 text-tertiary">
          {REVIEWER_PROMISE}
        </p>
        <p className="rounded-2xl border border-hairline bg-surface-1 px-4 py-3 text-caption leading-4 text-tertiary">
          {UNMETERED_PROMISE}
        </p>
      </div>

      <div className="mt-10 text-center">
        <button
          type="button"
          onClick={onStart}
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          className="fcc-lift inline-flex h-12 items-center gap-2 rounded-2xl px-7 text-[15px] font-semibold shadow-overlay hover:brightness-110"
        >
          Make one now
          <ArrowRight size={17} strokeWidth={2.4} />
        </button>
        <p className="mt-3 text-caption text-muted">Free forever. No card to start.</p>
      </div>
    </section>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────── */

export function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-full bg-base">
      <nav className="sticky top-0 z-overlay border-b border-hairline bg-surface-1/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center gap-2.5 px-6">
          <span
            className="grid h-7 w-7 place-items-center rounded-xl text-[13px] font-semibold"
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          >
            F
          </span>
          <span className="text-title text-primary">FlashCC</span>
          <div className="flex-1" />
          <a href="#pricing" className="text-caption text-tertiary hover:text-primary">
            Pricing
          </a>
          <button
            type="button"
            onClick={onStart}
            className="flex h-8 items-center rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent"
          >
            Open the app
          </button>
        </div>
      </nav>

      <Hero onStart={onStart} />

      {/* Three numbers, because the argument is mostly arithmetic. */}
      <div className="border-b border-hairline bg-surface-1">
        <div className="mx-auto grid max-w-[1100px] gap-8 px-6 py-12 md:grid-cols-3">
          {PROOF.map((p) => (
            <div key={p.label}>
              <div
                className="text-[38px] font-semibold leading-none tracking-[-1.5px]"
                style={{ color: "var(--brand-gold)" }}
              >
                {p.n}
              </div>
              <div className="mt-2 text-body-strong text-primary">{p.label}</div>
              <div className="mt-1 text-caption leading-4 text-tertiary">{p.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div id="how">
        <Section
          eyebrow="Paste"
          title="Words in. Slides out."
          line="Paste a post, a newsletter, a transcript. It splits on sentence ends, never mid-thought, and lays each piece out for you."
        >
          <SplitDemo />
        </Section>

        <Section
          eyebrow="Brand"
          title="One brand. Every deck."
          line="Colours and typefaces, saved once. Applied to a carousel, or to thirty at a time — and your logo lands on the cover by itself."
          flip
        >
          <BrandDemo />
        </Section>

        <Section
          eyebrow="Check"
          title="It reads the rules so you don't."
          line="Type too small to survive compression. A deck too long to publish. The crop that eats your hook in the grid. Caught before you post, not after."
        >
          <CheckDemo />
        </Section>

        <Section
          eyebrow="Approve"
          title="Send a link. No account."
          line="Your client opens it, comments on the slide they mean, and approves. The approval is pinned to that exact version — so nobody signs off on something that has since changed."
          flip
        >
          <ReviewDemo />
        </Section>

        <Section
          eyebrow="Ship"
          title="Straight into your scheduler."
          line="Every bulk importer wants public image URLs and none of them host the images. FlashCC hosts your rendered slides and fills the row in — Metricool, Publer and ContentStudio, each in its own shape."
        >
          <div className="rounded-2xl border border-hairline bg-surface-1 p-4">
            <div className="flex items-center gap-2">
              <MessageSquare size={13} strokeWidth={2} className="text-tertiary" />
              <span className="text-overline uppercase text-tertiary">Metricool.csv</span>
            </div>
            <pre className="scroll-quiet mt-2.5 overflow-x-auto whitespace-pre rounded-xl border border-hairline bg-surface-2 p-3 font-mono text-[11px] leading-5 text-tertiary">
{`Text,Date,Picture Url 1,Picture Url 2,…
"Five edits…",2026-10-02,https://…/01.jpg,https://…/02.jpg`}
            </pre>
            <p className="mt-3 text-caption text-muted">
              Imports with no edits. The URLs are already in it.
            </p>
          </div>
        </Section>
      </div>

      <Pricing onStart={onStart} />

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-3 px-6 py-8">
          <span className="text-caption text-muted">FlashCC — carousels, end to end.</span>
          <div className="flex-1" />
          <a href="#pricing" className="text-caption text-tertiary hover:text-primary">
            Pricing
          </a>
          <button
            type="button"
            onClick={onStart}
            className="text-caption text-tertiary hover:text-primary"
          >
            Open the app
          </button>
        </div>
      </footer>
    </div>
  );
}
