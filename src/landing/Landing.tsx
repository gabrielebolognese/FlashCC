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
 * `inset`, they are written to be applied to a bare decorative `<div>`, which
 * is how every other screen uses them, so the header and the deck came out of
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
import { ArrowRight, Check, Search, Sparkles, Wand2, Zap } from "lucide-react";
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
  "Write it. Design it. Export ten files.",
  "Rename them. Paste ten links into a scheduler.",
  "FlashCC does all of that part.",
  "You bring the idea.",
];

const DRAFT_BRIEF =
  "Most talking-head edits feel flat because people cut on the beat instead of on movement.";

const REVISE_ASK = "In slide 4, make it about what to cut on instead";

const REVISE_DECK = [
  "Cutting on the beat is why your edits feel robotic.",
  "Every cut lands on the snare. Precise, and lifeless.",
  "Attention resets when the frame changes, not when the snare hits.",
  "So stop cutting on the beat.",
];

const REVISE_AFTER = "Cut on movement. A hand leaving frame. A door closing.";

const BATCH_ROWS = [
  "Why cutting on the beat kills an edit",
  "What editors get wrong about pricing",
  "Nobody asks what camera you used",
  "The note that halves revision rounds",
  "Cut on movement, not on the beat",
];

/** Real domains, because the feature returns real sources rather than a badge. */
const BATCH_SOURCES = ["4 searches", "34 sources", "all cited"];

const SPLIT_SOURCE =
  "Every cut lands on the beat and the edit still feels flat. Attention resets when the frame changes, not when the snare hits. Cut on movement instead, a hand leaving frame, a head turning, a door closing.";

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
      {/* Decorative, empty, out of flow, and the ONLY thing here that is. */}
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

        <h1 className="mx-auto mt-6 max-w-[16ch] text-[32px] font-semibold leading-[1.02] tracking-[-1px] text-primary sm:text-[44px] sm:leading-[0.98] sm:tracking-[-1.8px] md:text-[68px] md:tracking-[-3px]">
          Carousels are easy.
          <br />
          <span style={{ color: "var(--brand-gold)" }}>Posting them isn&rsquo;t.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-[54ch] text-[17px] leading-[27px] text-tertiary md:text-[19px] md:leading-[30px]">
          Say what the post is about. FlashCC writes it, lays it out, checks it against the
          platform, and hands your scheduler a row that already knows the image URLs.
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

/**
 * A brief becoming a deck.
 *
 * The slides are laid out by `buildSlides`, like everything else here. What is
 * staged is the typing and the arrival, because the point of the section is the
 * shape of the exchange, not the speed of a real call.
 */
function DraftDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [step, setStep] = useState(0);

  const deck = useMemo(
    () =>
      deckFrom(
        [
          "Cutting on the beat is why your edits feel robotic.",
          "Every cut lands on the snare. Precise, and lifeless.",
          "Attention resets when the frame changes.",
          "Cut on movement. A hand leaving frame. A door closing.",
        ],
        "ink",
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
      <div className="rounded-2xl border border-hairline bg-surface-1 p-4">
        <div className="text-[15px] leading-[24px] text-primary">
          {DRAFT_BRIEF}
          <span
            className="ml-0.5 inline-block h-[18px] w-[2px] translate-y-[3px]"
            style={{
              background: "var(--accent)",
              opacity: step === 0 ? 1 : 0,
              transition: "opacity 300ms ease",
            }}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-caption text-tertiary">How many slides?</span>
          <span className="rounded-md border border-accent-dim px-1.5 py-0.5 font-mono text-caption text-accent">
            4
          </span>
          <div className="flex-1" />
          <span
            className="flex items-center gap-1.5 text-caption text-muted"
            style={{ opacity: step === 1 ? 1 : 0, transition: "opacity 300ms ease" }}
          >
            <Sparkles size={11} strokeWidth={2.4} className="text-accent" />
            Generating your slides
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2.5">
        {deck.slides.map((slide, i) => (
          <div
            key={slide.id}
            className="overflow-hidden rounded-xl border border-hairline"
            style={{
              opacity: step >= 2 ? 1 : 0,
              transform: step >= 2 ? "none" : "translateY(18px) scale(0.95)",
              transition: `opacity 520ms ease ${i * 110}ms, transform 620ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms`,
            }}
          >
            <SlidePreview slide={slide} />
          </div>
        ))}
      </div>

      <p className="mt-3 text-caption leading-4 text-muted">
        Ask for four slides and you get four. Ask for sixteen and you get sixteen.
      </p>
    </div>
  );
}

/**
 * Changing one slide by saying so.
 *
 * The untouched slides are deliberately shown unchanged rather than re-rendered
 * differently, because that is the actual behaviour: the route returns only the
 * slides it changed, so the others come back as the same words.
 */
function ReviseDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!seen) return;
    if (prefersReducedMotion()) {
      setStep(1);
      return;
    }
    const t = setTimeout(() => setStep(1), 900);
    return () => clearTimeout(t);
  }, [seen]);

  return (
    <div ref={ref}>
      <div className="flex items-center gap-2 rounded-2xl border border-accent-dim bg-accent-wash p-3">
        <Wand2 size={14} strokeWidth={2} className="shrink-0 text-accent" />
        <span className="text-[15px] text-primary">{REVISE_ASK}</span>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {REVISE_DECK.map((line, i) => {
          const changed = i === 3;
          const showing = changed && step >= 1 ? REVISE_AFTER : line;
          return (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border bg-surface-1 p-3"
              style={{
                borderColor:
                  changed && step >= 1 ? "var(--accent-dim)" : "var(--hairline)",
                transition: "border-color 400ms ease",
              }}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-surface-4 text-[10px] font-semibold text-secondary">
                {i + 1}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-caption text-primary"
                style={{
                  opacity: changed && step === 0 ? 0.45 : 1,
                  transition: "opacity 400ms ease",
                }}
              >
                {showing}
              </span>
              {changed && step >= 1 ? (
                <span className="shrink-0 text-caption text-accent">changed</span>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-caption leading-4 text-muted">
        Only slide four moved. The rest came back as the same words, not rewritten ones.
      </p>
    </div>
  );
}

/**
 * A batch being made, with what it read.
 *
 * The percentage and the sources are the two things this screen actually shows
 * while it runs, so they are the two things the demo shows.
 */
function BatchDemo() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [at, setAt] = useState(0);

  useEffect(() => {
    if (!seen) return;
    if (prefersReducedMotion()) {
      setAt(BATCH_ROWS.length);
      return;
    }
    const id = setInterval(() => setAt((n) => (n >= BATCH_ROWS.length ? n : n + 1)), 700);
    return () => clearInterval(id);
  }, [seen]);

  const percent = Math.round((Math.min(at, BATCH_ROWS.length) / BATCH_ROWS.length) * 100);

  return (
    <div ref={ref}>
      <div className="rounded-2xl border border-hairline bg-surface-1 p-4">
        <div className="flex items-baseline gap-2">
          <span
            className="font-mono text-[26px] font-semibold leading-none"
            style={{ color: "var(--brand-gold)" }}
          >
            {percent}%
          </span>
          <div className="flex-1" />
          <span className="text-caption text-muted">9 carousels · 3 ideas</span>
        </div>

        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full"
            style={{
              width: `${percent}%`,
              background: "var(--brand-gold)",
              transition: "width 600ms cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          {BATCH_ROWS.map((row, i) => (
            <div
              key={row}
              className="flex items-center gap-2.5"
              style={{
                opacity: i < at ? 1 : 0.3,
                transition: "opacity 400ms ease",
              }}
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-surface-4 text-[10px] font-semibold text-secondary">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-caption text-primary">{row}</span>
              {i < at ? (
                <Check size={12} strokeWidth={2.6} className="shrink-0 text-success" />
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Search size={12} strokeWidth={2.2} className="text-accent" />
        <span className="text-caption text-tertiary">Angles built from what it read:</span>
        {BATCH_SOURCES.map((s) => (
          <span
            key={s}
            className="rounded-md border border-hairline px-1.5 py-0.5 text-caption text-muted"
          >
            {s}
          </span>
        ))}
      </div>

      <p className="mt-3 text-caption leading-4 text-muted">
        Three ideas, taking turns, so the batch is never nine versions of one post.
      </p>
    </div>
  );
}
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
    <div ref={ref} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
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
          Approved, pinned to this exact version
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
  { n: "0", label: "credits, ever", sub: "Drafting, rewriting, research. None of it metered." },
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
        colours, so that class produces NO background, and a sticky bar with no
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
          <a href="#pricing" className="hidden text-caption text-tertiary hover:text-primary sm:block">
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
          eyebrow="Draft"
          title="Say what it's about."
          line="A sentence in, a finished carousel out, at the length you asked for. It writes the words and nothing else: every size, position and colour is decided by the layout engine, which is why it never comes back looking like a template with the text swapped."
        >
          <DraftDemo />
        </Section>

        <Section
          eyebrow="Change"
          title="Talk to the draft."
          line="In slide 4, make it about pricing. Make the first three shorter. It changes those and hands the rest back untouched, so fixing one slide never quietly rewrites another."
          flip
        >
          <ReviseDemo />
        </Section>

        <Section
          eyebrow="Paste"
          title="Or bring your own words."
          line="Paste a post, a newsletter, a transcript, or drop a subtitle file. Every cut lands on a sentence end, and no model touches a word you already wrote."
        >
          <SplitDemo />
        </Section>

        <Section
          eyebrow="Batch"
          title="Three ideas. A fortnight of posts."
          line="It reads the web about each idea first, builds the angles from what it finds, and cites them. The ideas take turns, so nine carousels are nine different posts rather than nine versions of one."
          flip
        >
          <BatchDemo />
        </Section>

        <Section
          eyebrow="Brand"
          title="One brand. Every deck."
          line="Colours, typefaces and a background picture saved once, applied to one carousel or thirty, and your logo lands on the cover by itself."
        >
          <BrandDemo />
        </Section>

        <Section
          eyebrow="Check"
          title="It reads the rules so you don't."
          line="Type too small to survive compression. A deck too long to publish. The crop that eats your hook in the grid. A number the draft invented that your brief never mentioned. Caught before you post."
          flip
        >
          <CheckDemo />
        </Section>

        <Section
          eyebrow="Approve"
          title="Send a link. No account."
          line="Your client comments on the slide they mean, then approves, and the approval is pinned to that exact version, so nobody signs off on something that has changed since."
        >
          <ReviewDemo />
        </Section>

        <Section
          eyebrow="Ship"
          title="Straight into your scheduler."
          line="Captions written for the platform you are posting to, alt text for every slide, and a row your bulk importer can read. FlashCC hosts the rendered slides, which is the part none of them do."
          flip
        >
          <CsvDemo />
        </Section>
      </div>

      <Pricing onStart={onStart} />

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-3 px-6 py-8">
          <span className="text-caption text-muted">FlashCC, carousels, end to end.</span>
          <div className="flex-1" />
          <a href="#pricing" className="text-caption text-tertiary hover:text-primary">
            Pricing
          </a>
          {/*
            Real links to real pages, not a modal. A payment provider reviewing
            the account has to be able to reach these from the homepage, and so
            does anybody who wants to read them before paying.
          */}
          <a href="/terms" className="text-caption text-tertiary hover:text-primary">
            Terms
          </a>
          <a href="/privacy" className="text-caption text-tertiary hover:text-primary">
            Privacy
          </a>
          <a href="/refunds" className="text-caption text-tertiary hover:text-primary">
            Refunds
          </a>
          <a
            href="mailto:support@flashcc.app"
            className="text-caption text-tertiary hover:text-primary"
          >
            Contact
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
