import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { buildSlides } from "./compositions.js";
import { SlidePreview } from "./SlidePreview.js";
import { FONTS } from "./model.js";
import {
  ACCENTS,
  DEFAULT_PREFS,
  MAIN_GROUNDS,
  MORE_GROUNDS,
  decorScale,
  markOnboarded,
  savePrefs,
  styleFromPrefs,
  wantsImages,
  type Prefs,
} from "./onboarding.js";

const SAMPLE = "Your carousel title";

/** Stagger index, as a CSS var the .fcc-stagger rule reads. */
const at = (i: number): CSSProperties => ({ ["--i" as string]: i });

type Question = {
  id: keyof Prefs;
  title: string;
  note: string;
  render: (prefs: Prefs, set: (p: Partial<Prefs>) => void) => ReactNode;
};

const QUESTIONS: Question[] = [
  {
    id: "ground",
    title: "Light or dark?",
    note: "The ground everything else sits on. There are tinted ones underneath.",
    render: (p, set) => (
      <div>
        <div className="grid grid-cols-2 gap-2.5">
          {MAIN_GROUNDS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => set({ ground: g.id })}
              className={[
                "fcc-lift flex items-center gap-3 rounded-2xl border p-3 text-left",
                p.ground === g.id
                  ? "fcc-selected border-accent-dim bg-accent-wash"
                  : "border-hairline hover:border-surface-5",
              ].join(" ")}
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 text-[15px] font-semibold"
                style={{ background: g.bg, color: g.fg }}
              >
                Aa
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-primary">{g.name}</span>
                <span className="block text-caption text-tertiary">
                  {g.id === "dark" ? "Light text on near-black" : "Dark text on white"}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="mb-2 mt-5 text-overline uppercase text-tertiary">Or a tint</div>
        <div className="grid grid-cols-3 gap-2">
          {MORE_GROUNDS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => set({ ground: g.id })}
              title={g.name}
              className={[
                "fcc-lift flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left",
                p.ground === g.id
                  ? "fcc-selected border-accent-dim bg-accent-wash"
                  : "border-hairline hover:border-surface-5",
              ].join(" ")}
            >
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 text-[10px] font-semibold"
                style={{ background: g.bg, color: g.fg }}
              >
                Aa
              </span>
              <span className="min-w-0 truncate text-caption text-secondary">{g.name}</span>
            </button>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "accent",
    title: "Pick an accent",
    note: "One colour, for rules, numerals and the closing slide.",
    render: (p, set) => (
      <div className="flex flex-wrap gap-2.5">
        {ACCENTS.map((hex, i) => (
          <button
            key={hex}
            type="button"
            onClick={() => set({ accent: hex })}
            aria-label={hex}
            style={{ background: hex, ...at(i) }}
            className={[
              "fcc-lift h-12 w-12 rounded-2xl border-2",
              p.accent === hex ? "fcc-selected border-white/70" : "border-white/10",
            ].join(" ")}
          />
        ))}
        <label className="fcc-lift grid h-12 w-12 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-hairline">
          <input
            type="color"
            value={p.accent}
            onChange={(e) => set({ accent: e.target.value })}
            className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
      </div>
    ),
  },
  {
    id: "displayFont",
    title: "How should headings read?",
    note: "The face on hooks, headings and statements.",
    render: (p, set) => (
      <div className="flex flex-wrap gap-2.5">
        {FONTS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => set({ displayFont: f.id, bodyFont: f.id === "mono" ? "mono" : p.bodyFont })}
            style={{ fontFamily: f.stack }}
            className={[
              "fcc-lift h-16 min-w-[124px] flex-1 rounded-2xl border px-4 text-[19px] font-semibold",
              p.displayFont === f.id
                ? "fcc-selected border-accent-dim bg-accent-wash text-primary"
                : "border-hairline text-tertiary hover:border-surface-5 hover:text-secondary",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>
    ),
  },
  {
    id: "images",
    title: "Do you use photos?",
    note: "If you do, every slide keeps a space for one.",
    render: (p, set) => (
      <Choices
        value={p.images}
        options={[
          { value: "always" as const, label: "Always", hint: "A picture on every slide" },
          { value: "sometimes" as const, label: "Sometimes", hint: "Keep the space, fill what I want" },
          { value: "never" as const, label: "Never", hint: "Text only, and more room for it" },
        ]}
        onChange={(images) => set({ images })}
      />
    ),
  },
  {
    id: "decor",
    title: "Lines and accents?",
    note: "Rules under headings, the bar beside a quote, the tick under a numeral.",
    render: (p, set) => (
      <Choices
        value={p.decor}
        options={[
          { value: "none" as const, label: "None", hint: "Type only, nothing drawn" },
          { value: "normal" as const, label: "Some", hint: "A thin rule where it helps" },
          { value: "bold" as const, label: "Bold", hint: "Heavier, more graphic" },
        ]}
        onChange={(decor) => set({ decor })}
      />
    ),
  },
];

export function Welcome({ onDone }: { onDone: (prefs: Prefs | null) => void }) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  const set = (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch }));

  const preview = useMemo(() => {
    const style = styleFromPrefs(prefs);
    return buildSlides([SAMPLE], style.theme, ["hook"], {
      images: wantsImages(prefs.images),
      decor: decorScale(prefs.decor),
    })[0];
  }, [prefs]);

  function finish() {
    savePrefs(prefs);
    markOnboarded();
    onDone(prefs);
  }

  function skip() {
    markOnboarded();
    onDone(null);
  }

  if (!started) {
    return (
      <div className="relative grid h-full place-items-center overflow-hidden bg-base">
        <div className="fcc-aurora" />

        <div className="fcc-stagger relative flex w-full max-w-[560px] flex-col items-center px-6 text-center">
          <div style={at(0)} className="relative">
            <span className="fcc-halo" />
            <span
              className="relative grid h-[72px] w-[72px] place-items-center rounded-[24px] text-[26px] font-semibold shadow-overlay"
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            >
              F
            </span>
          </div>

          {/* clamp so a narrow window shrinks the type instead of overflowing */}
          <h1
            style={{ ...at(1), fontSize: "clamp(28px, 6vw, 40px)", lineHeight: 1.14 }}
            className="mt-8 text-balance font-semibold tracking-[-0.8px] text-primary"
          >
            Welcome to FlashCC
          </h1>

          <p
            style={{ ...at(2), fontSize: "clamp(15px, 2.2vw, 17px)" }}
            className="mt-3.5 text-pretty leading-[26px] text-tertiary"
          >
            Do you want to start onboarding? Five questions, and everything after them
            comes out in your style.
          </p>

          <div style={at(3)} className="mt-9 flex w-full flex-col gap-2.5">
            <button
              type="button"
              onClick={() => setStarted(true)}
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              className="fcc-sheen fcc-lift flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl text-[16px] font-semibold shadow-overlay"
            >
              <Sparkles size={18} strokeWidth={2.5} />
              Yes, set it up
            </button>
            <button
              type="button"
              onClick={skip}
              className="fcc-lift flex h-12 w-full items-center justify-center rounded-2xl border border-hairline text-[15px] font-semibold text-secondary hover:border-surface-5 hover:text-primary"
            >
              No, take me straight in
            </button>
          </div>

          <p style={at(4)} className="mt-5 text-caption text-muted">
            Takes about a minute. You can change any of it later, on any slide.
          </p>
        </div>
      </div>
    );
  }

  const q = QUESTIONS[step]!;
  const last = step === QUESTIONS.length - 1;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-base">
      <div className="fcc-aurora opacity-60" />

      <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-surface-1/80 px-5 backdrop-blur">
        <button
          type="button"
          onClick={() => (step === 0 ? setStarted(false) : setStep(step - 1))}
          aria-label="Back"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-tertiary hover:bg-white/[0.06] hover:text-primary"
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <div className="shrink-0 text-caption text-muted">
          {step + 1} of {QUESTIONS.length}
        </div>
        <div className="h-1 w-28 shrink-0 overflow-hidden rounded-full bg-surface-3 sm:w-44">
          <div
            className="h-full rounded-full transition-[width] duration-large ease-out"
            style={{
              width: `${((step + 1) / QUESTIONS.length) * 100}%`,
              background: "var(--brand-gold)",
              boxShadow: "0 0 12px rgba(217,165,33,.6)",
            }}
          />
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={skip}
          className="h-8 shrink-0 rounded-xl px-3 text-caption text-muted hover:bg-white/[0.06] hover:text-primary"
        >
          Skip
        </button>
      </header>

      <div className="scroll-quiet relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[980px] flex-col items-center gap-10 px-6 py-10 lg:flex-row lg:items-center">
          {/* key on step so the entrance replays for each question */}
          <div key={step} className="fcc-stagger w-full min-w-0 flex-1">
            <h2
              style={{ ...at(0), fontSize: "clamp(22px, 3.4vw, 30px)", lineHeight: 1.2 }}
              className="text-balance font-semibold tracking-[-0.5px] text-primary"
            >
              {q.title}
            </h2>
            <p
              style={at(1)}
              className="mb-7 mt-2 text-pretty text-body leading-[20px] text-tertiary"
            >
              {q.note}
            </p>

            <div style={at(2)}>{q.render(prefs, set)}</div>

            <button
              type="button"
              style={{ ...at(3), background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              onClick={() => (last ? finish() : setStep(step + 1))}
              className="fcc-lift mt-9 flex h-12 items-center justify-center gap-2 rounded-2xl px-7 text-[15px] font-semibold shadow-overlay"
            >
              {last ? (
                <>
                  <Check size={17} strokeWidth={2.5} />
                  Done
                </>
              ) : (
                <>
                  Next
                  <ArrowRight size={17} strokeWidth={2.5} />
                </>
              )}
            </button>
          </div>

          {/* A real slide, rebuilt on every answer. Scales with the viewport rather
              than sitting at a fixed size that squeezes the column. */}
          <div className="fcc-float relative w-full max-w-[300px] shrink-0">
            <div
              aria-hidden
              className="absolute -inset-6 rounded-[36px] opacity-70 blur-2xl"
              style={{ background: `radial-gradient(circle, ${prefs.accent}55, transparent 70%)` }}
            />
            <SlidePreview
              slide={preview}
              className="relative rounded-2xl border border-white/10 shadow-modal"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Choices<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string; hint: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={[
            "fcc-lift flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left",
            value === o.value
              ? "fcc-selected border-accent-dim bg-accent-wash"
              : "border-hairline hover:border-surface-5",
          ].join(" ")}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-primary">{o.label}</span>
            <span className="mt-0.5 block text-pretty text-caption text-tertiary">{o.hint}</span>
          </span>
          {value === o.value ? (
            <Check size={16} className="shrink-0 text-accent" strokeWidth={2.5} />
          ) : null}
        </button>
      ))}
    </div>
  );
}
