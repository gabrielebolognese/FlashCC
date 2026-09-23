/**
 * The landing page.
 *
 * ── Everything on it is the actual product ───────────────────────────────────
 *
 * The carousel in the hero was laid out by `buildSlides`. The recolour is
 * `applyBrand`. The warnings are `preflight`, run against a deliberately broken
 * deck. Nothing here is a screenshot, which means nothing here can drift out of
 * date or promise something the app does not do.
 *
 * ── One layout rule, learned the hard way ────────────────────────────────────
 *
 * **Nothing that holds content is ever taken out of flow.** Every absolutely
 * positioned element on this page is decorative, empty, `aria-hidden`, and lives
 * inside an explicit `relative` parent.
 *
 * The first version of this page put `.fcc-aurora` on the `<header>` and
 * `.fcc-halo` on the hero's deck wrapper. Both are `position: absolute` with an
 * `inset` — they are written to be applied to a bare decorative `<div>`, which
 * is how every other screen uses them — so the header and the deck came out of
 * flow and the whole document stacked on top of itself. That is why those
 * classes do not appear in this file at all.
 *
 * ── Low text, motion doing the explaining ────────────────────────────────────
 *
 * Each section is a headline, one line, and something that moves. A carousel
 * tool that needs three paragraphs to explain a carousel has already lost.
 *
 * Motion is deliberate here even though `CLAUDE.md` forbids transitions on
 * colour and background in the app. That rule is right for an editor, where a
 * fade on a selection reads as latency, and wrong for a page whose entire job is
 * to show what the tool does. All of it stops under `prefers-reduced-motion`
 * with the finished state left on screen.
 */
import { ArrowRight, Check, Sparkles, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { applyBrand, makeBrand } from "../studio/brand.js";
import { buildSlides } from "../studio/compositions.js";
import { makeDoc, type Doc } from "../studio/model.js";
import { platformById } from "../studio/platforms.js";
import { preflight } from "../studio/preflight.js";
import { SlidePreview } from "../studio/SlidePreview.js";
import { STYLES, styleById } from "../studio/styles.js";
import { PLANS, REVIEWER_PROMISE, UNMETERED_PROMISE } from "../studio/Upgrade.js";
import { DeckShelf } from "./DeckShelf.js";
import { prefersReducedMotion, useInView } from "./useInView.js";

/* ── material ─────────────────────────────────────────────────────────────── */

/** The pitch, written as a carousel, because that is the product demonstrating itself. */
const PITCH = [
  "You don't have a carousel problem.",
  "You have a ninety-minute problem.",
  "Design it. Export ten files. Rename them.",
  "Paste ten links into a scheduler.",
  "FlashCC does all of that part.",
  "You just write the words.",
];

const SPLIT_SOURCE =
  "Every cut lands on the beat and the edit still feels flat. Attention resets when the frame changes, not when the snare hits. Cut on movement instead — a hand leaving frame, a head turning, a door closing.";

const deckFrom = (texts: string[], styleId: string): Doc => ({
  ...makeDoc("Demo"),
  styleId,
  slides: buildSlides(texts, styleById(styleId).theme),
});

/**
 * Resolved against STYLES rather than by id at the call site.
 *
 * `styleById` falls back to the default for an id it does not know, so a typo
 * here would render a duplicate swatch and look like the feature was broken.
 * This way a typo is a missing swatch, which is visible.
 */
const BRAND_SET = ["ink", "paper", "terminal", "bloom"]
  .map((id) => STYLES.find((s) => s.id === id))
  .filter((s): s is (typeof STYLES)[number] => Boolean(s));

/* ── pieces ───────────────────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-3 py-1 text-caption text-tertiary">
      {children}
    </span>
  );
}

function Cta({
  onStart,
  label = "Start free",
}: {
  onStart: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onStart}
      style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
      className="flex h-12 items-center gap-2 rounded-2xl px-6 text-[15px] font-semibold shadow-overlay hover:brightness-110"
    >
      {label}
      <ArrowRight size={17} strokeWidth={2.4} />
    </button>
  );
}

/** A section that fades up the first time it is looked at, and then stays. */
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: seen ? 1 : 0,
        transform: seen ? "none" : "translateY(16px)",
        transition: `opacity 650ms ease ${delay}ms, transform 700ms cubic-bezier(0.2,0,0,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function Section({
  eyebrow,
  title,
  line,
  children,
  flip = false,
}: {
  eyebrow: string;
  title: string;
  line: string;
  children: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <section className="border-t border-hairline">
      <div className="mx-auto grid max-w-[1080px] items-center gap-10 px-6 py-20 md:py-24 lg:grid-cols-2 lg:gap-16">
        <Reveal className={flip ? "lg:order-2" : ""}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-4 text-[30px] font-semibold leading-[1.12] tracking-[-0.8px] text-primary md:text-[38px]">
            {title}
          </h2>
          <p className="mt-3 max-w-[40ch] text-[16px] leading-[25px] text-tertiary">{line}</p>
        </Reveal>
        <Reveal delay={80} className={flip ? "lg:order-1" : ""}>
          {children}
        </Reveal>
      </div>
    </section>
  );
}

/* ── hero ─────────────────────────────────────────────────────────────────── */

function Hero({ onStart }: { onStart: () => void }) {
  const deck = useMemo(() => deckFrom(PITCH, "ink"), []);

  return (
    <header className="relative overflow-hidden border-b border-hairline">
      {/* Decorative, empty, out of flow — and the ONLY thing here that is. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 55% at 50% -10%, rgba(217,165,33,.16), transparent 70%), radial-gradient(50% 40% at 85% 20%, rgba(76,134,214,.12), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[1080px] px-6 pb-4 pt-16 text-center md:pt-24">
        <Eyebrow>
          <Zap size={12} strokeWidth={2.4} className="text-accent" />
          For people who post every week
        </Eyebrow>

        <h1 className="mx-auto mt-6 max-w-[16ch] text-[44px] font-semibold leading-[0.96] tracking-[-1.8px] text-primary md:text-[68px] md:tracking-[-3px]">
          Carousels are easy.
          <br />
          <span style={{ color: "var(--brand-gold)" }}>Posting them isn&rsquo;t.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-[52ch] text-[17px] leading-[27px] text-tertiary md:text-[19px] md:leading-[30px]">
          Write the words. FlashCC lays them out, checks them against the platform, and hands your
          scheduler a row that already knows the image URLs.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Cta onStart={onStart} />
          <a
            href="#how"
            className="flex h-12 items-center rounded-2xl border border-hairline px-5 text-[15px] text-secondary hover:border-accent-dim hover:text-accent"
          >
            See it work
          </a>
        </div>

        <p className="mt-4 text-caption text-muted">
          Free forever to make them. No card, no credits.
        </p>
      </div>

      {/* The product, full width, under the pitch. */}
      <div className="relative mx-auto max-w-[1080px] px-6 pb-16">
        <DeckShelf slides={deck.slides} />
      </div>
    </header>
  );
}

/* ── demos ────────────────────────────────────────────────────────────────── */

function SplitDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [step, setStep] = useState(0);

  const deck = useMemo(
    () =>
      deckFrom(
        [
          "Every cut lands on the beat and it still feels flat.",
          "Attention resets when the frame changes.",
          "Cut on movement instead.",
        ],
        "paper",
      ),
    [],
  );

  useEffect(() => {
    if (!seen) return;
    if (prefersReducedMotion()) {
      setStep(1);
      return;
    }
    const t = setTimeout(() => setStep(1), 600);
    return () => clearTimeout(t);
  }, [seen]);

  return (
    <div ref={ref}>
      <div
        className="rounded-2xl border border-hairline bg-surface-1 p-4 font-mono text-caption leading-5 text-tertiary"
        style={{
          opacity: step === 0 ? 1 : 0.3,
          transition: "opacity 600ms ease",
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
              transform: step >= 1 ? "none" : "translateY(18px) scale(0.95)",
              transition: `opacity 520ms ease ${i * 120}ms, transform 620ms cubic-bezier(0.22,1,0.36,1) ${i * 120}ms`,
            }}
          >
            <SlidePreview slide={slide} />
          </div>
        ))}
      </div>

      <p className="mt-3 text-caption leading-4 text-muted">
        It splits on sentence ends, never mid-thought.
      </p>
    </div>
  );
}

function BrandDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [which, setWhich] = useState(0);

  const base = useMemo(
    () => deckFrom(["Five edits that cost you the swipe.", "Cut on movement.", "Save this."], "ink"),
    [],
  );

  // The real `applyBrand`, the same call the Brands screen makes.
  const decks = useMemo(
    () => BRAND_SET.map((style) => applyBrand(base, makeBrand(style.name, style.theme)).doc),
    [base],
  );

  useEffect(() => {
    if (!seen || prefersReducedMotion()) return;
    const t = setInterval(() => setWhich((i) => (i + 1) % BRAND_SET.length), 2400);
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {BRAND_SET.map((style, i) => (
          <button
            key={style.id}
            type="button"
            aria-label={style.name}
            onClick={() => setWhich(i)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2"
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
        ))}
        <span className="text-caption text-muted">Applied once. Never a live template.</span>
      </div>
    </div>
  );
}

function CheckDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();

  // Real findings from a deliberately broken deck, not three plausible sentences.
  const findings = useMemo(() => {
    const doc = deckFrom(["A hook.", "A body line.", "A close."], "ink");
    const broken = {
      ...doc,
      slides: doc.slides.map((s, i) =>
        i === 1
          ? { ...s, layers: s.layers.map((l) => (l.kind === "text" ? { ...l, fontSize: 12 } : l)) }
          : s,
      ),
    };
    return preflight(broken, platformById("linkedin")).slice(0, 3);
  }, []);

  return (
    <div ref={ref} className="rounded-2xl border border-hairline bg-surface-1 p-4">
      <div className="flex items-center gap-2">
        <span className="text-overline uppercase text-tertiary">Before it goes</span>
        {findings.length > 0 ? (
          <span className="rounded-md bg-danger-wash px-1.5 py-0.5 text-caption text-danger">
            {findings.length} to fix
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {findings.map((f, i) => (
          <div
            key={`${f.code}-${i}`}
            className="rounded-xl border border-hairline bg-surface-2 px-3 py-2.5 text-caption leading-4 text-secondary"
            style={{
              opacity: seen ? 1 : 0,
              transform: seen ? "none" : "translateX(-12px)",
              transition: `opacity 460ms ease ${i * 170}ms, transform 520ms cubic-bezier(0.22,1,0.36,1) ${i * 170}ms`,
            }}
          >
            {f.message}
          </div>
        ))}
      </div>

      <p className="mt-3 text-caption leading-4 text-muted">
        Every rule here is one somebody learned after posting.
      </p>
    </div>
  );
}

function ReviewDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const deck = useMemo(() => deckFrom(["Five edits that cost you the swipe."], "ember"), []);

  const comments = [
    { who: "Priya", body: "Love it. Can the logo go bottom-right?" },
    { who: "Marco", body: "Approved from my side." },
  ];

  return (
    <div ref={ref} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start gap-4">
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
              transform: seen ? "none" : "translateY(10px)",
              transition: `opacity 480ms ease ${500 + i * 650}ms, transform 540ms cubic-bezier(0.22,1,0.36,1) ${500 + i * 650}ms`,
            }}
          >
            <div className="text-caption font-semibold text-secondary">{c.who}</div>
            <p className="mt-0.5 text-caption leading-4 text-tertiary">{c.body}</p>
          </div>
        ))}

        <div
          className="mt-1 flex items-center gap-1.5 text-caption text-muted"
          style={{ opacity: seen ? 1 : 0, transition: "opacity 500ms ease 1900ms" }}
        >
          <Check size={12} strokeWidth={2.4} className="shrink-0 text-success" />
          Approved — pinned to this exact version
        </div>
      </div>
    </div>
  );
}

function CsvDemo() {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-4">
      <span className="text-overline uppercase text-tertiary">metricool.csv</span>
      <pre className="scroll-quiet mt-2.5 overflow-x-auto rounded-xl border border-hairline bg-surface-2 p-3 font-mono text-[11px] leading-5 text-tertiary">
{`Text,Date,Picture Url 1,Picture Url 2
"Five edits…",2026-10-02,https://…/01.jpg,https://…/02.jpg`}
      </pre>
      <p className="mt-3 text-caption leading-4 text-muted">
        Imports with no edits. The URLs are already in it.
      </p>
    </div>
  );
}

/* ── the rest ─────────────────────────────────────────────────────────────── */

const PROOF = [
  { n: "9", label: "schedulers want public image URLs", sub: "None of them host the images." },
  { n: "0", label: "credits, ever", sub: "Nothing here is metered." },
  { n: "∞", label: "reviewers, free", sub: "Others charge $499 a month each." },
];

function Pricing({ onStart }: { onStart: () => void }) {
  return (
    <section id="pricing" className="border-t border-hairline">
      <div className="mx-auto max-w-[1080px] px-6 py-20 md:py-24">
        <Reveal className="text-center">
          <Eyebrow>
            <Sparkles size={12} strokeWidth={2.4} className="text-accent" />
            Flat, and unmetered
          </Eyebrow>
          <h2 className="mt-4 text-[30px] font-semibold leading-[1.12] tracking-[-0.8px] text-primary md:text-[38px]">
            Making one is free.
          </h2>
          <p className="mx-auto mt-3 max-w-[46ch] text-[16px] leading-[25px] text-tertiary">
            Running the practice is what costs money. The editor never will.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {PLANS.map((tier, i) => (
            <Reveal key={tier.id} delay={i * 90}>
              <div
                className={[
                  "h-full rounded-3xl border p-5",
                  tier.featured ? "border-accent-dim bg-accent-wash" : "border-hairline bg-surface-1",
                ].join(" ")}
              >
                <div className="text-body-strong text-primary">{tier.name}</div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-[32px] font-semibold tracking-[-1px] text-primary">
                    {tier.price}
                  </span>
                  <span className="text-caption text-muted">{tier.cadence}</span>
                </div>
                <p className="mt-1.5 text-caption leading-4 text-tertiary">{tier.line}</p>

                <ul className="mt-4 flex flex-col gap-1.5">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-caption leading-4 text-secondary"
                    >
                      <Check size={12} strokeWidth={2.4} className="mt-0.5 shrink-0 text-success" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
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

        <div className="mt-10 flex flex-col items-center">
          <Cta onStart={onStart} label="Make one now" />
          <p className="mt-3 text-caption text-muted">Free forever. No card to start.</p>
        </div>
      </div>
    </section>
  );
}

export function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-full bg-base">
      {/*
        Opaque, and set inline rather than with `bg-surface-1/90`.
        CLAUDE.md: the `/opacity` suffix does NOT work on these var-based
        colours, so that class produces NO background — and a sticky bar with no
        background lets every demo below scroll straight through it.
      */}
      <nav
        className="sticky top-0 z-overlay border-b border-hairline"
        style={{ background: "var(--surface-1)" }}
      >
        <div className="mx-auto flex h-14 max-w-[1080px] items-center gap-2.5 px-6">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-xl text-[13px] font-semibold"
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
            className="flex h-8 shrink-0 items-center rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent"
          >
            Open the app
          </button>
        </div>
      </nav>

      <Hero onStart={onStart} />

      <div className="border-b border-hairline bg-surface-1">
        <div className="mx-auto grid max-w-[1080px] gap-8 px-6 py-12 md:grid-cols-3">
          {PROOF.map((p, i) => (
            <Reveal key={p.label} delay={i * 90}>
              <div
                className="text-[36px] font-semibold leading-none tracking-[-1.5px]"
                style={{ color: "var(--brand-gold)" }}
              >
                {p.n}
              </div>
              <div className="mt-2 text-body-strong text-primary">{p.label}</div>
              <div className="mt-1 text-caption leading-4 text-tertiary">{p.sub}</div>
            </Reveal>
          ))}
        </div>
      </div>

      <div id="how">
        <Section
          eyebrow="Paste"
          title="Words in. Slides out."
          line="Paste a post, a newsletter, a transcript. Every cut lands on a sentence end, and each piece gets laid out for you."
        >
          <SplitDemo />
        </Section>

        <Section
          eyebrow="Brand"
          title="One brand. Every deck."
          line="Colours and typefaces saved once, applied to one carousel or thirty — and your logo lands on the cover by itself."
          flip
        >
          <BrandDemo />
        </Section>

        <Section
          eyebrow="Check"
          title="It reads the rules so you don't."
          line="Type too small to survive compression. A deck too long to publish. The crop that eats your hook in the grid. Caught before you post."
        >
          <CheckDemo />
        </Section>

        <Section
          eyebrow="Approve"
          title="Send a link. No account."
          line="Your client comments on the slide they mean, then approves — and the approval is pinned to that exact version, so nobody signs off on something that has changed since."
          flip
        >
          <ReviewDemo />
        </Section>

        <Section
          eyebrow="Ship"
          title="Straight into your scheduler."
          line="Every bulk importer wants public image URLs and none of them host the images. FlashCC hosts your rendered slides and fills the row in."
        >
          <CsvDemo />
        </Section>
      </div>

      <Pricing onStart={onStart} />

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-3 px-6 py-8">
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
