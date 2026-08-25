import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { buildSlides } from "./compositions.js";
import { LayerView } from "./LayerView.js";
import { FONTS } from "./model.js";
import {
  ACCENTS,
  DEFAULT_PREFS,
  decorScale,
  markOnboarded,
  savePrefs,
  styleFromPrefs,
  wantsImages,
  type Prefs,
} from "./onboarding.js";

const W = 1080;
const H = 1350;
const PREVIEW_H = 420;

const SAMPLE = "Your videos feel boring. Here's why.";

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
    note: "The ground everything else sits on.",
    render: (p, set) => (
      <Choices
        value={p.ground}
        options={[
          { value: "dark" as const, label: "Dark", hint: "White text on near-black" },
          { value: "light" as const, label: "Light", hint: "Black text on white" },
        ]}
        onChange={(ground) => set({ ground })}
      />
    ),
  },
  {
    id: "accent",
    title: "Pick an accent",
    note: "One colour, used for rules, numerals and the closing slide.",
    render: (p, set) => (
      <div className="flex flex-wrap gap-2">
        {ACCENTS.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => set({ accent: hex })}
            aria-label={hex}
            className={[
              "h-11 w-11 rounded-2xl border-2",
              p.accent === hex ? "border-primary" : "border-hairline hover:border-surface-5",
            ].join(" ")}
            style={{ background: hex }}
          />
        ))}
        <label className="grid h-11 w-11 cursor-pointer place-items-center rounded-2xl border-2 border-hairline hover:border-surface-5">
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
      <div className="flex flex-wrap gap-2">
        {FONTS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => set({ displayFont: f.id, bodyFont: f.id === "mono" ? "mono" : p.bodyFont })}
            style={{ fontFamily: f.stack }}
            className={[
              "h-14 min-w-[128px] rounded-2xl border-2 px-4 text-[19px] font-semibold",
              p.displayFont === f.id
                ? "border-primary text-primary"
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
    note: "If you do, every slide reserves a space for one.",
    render: (p, set) => (
      <Choices
        value={p.images}
        options={[
          { value: "always" as const, label: "Always", hint: "A picture on every slide" },
          { value: "sometimes" as const, label: "Sometimes", hint: "Keep the space, fill what I want" },
          { value: "never" as const, label: "Never", hint: "Text only, more room for it" },
        ]}
        onChange={(images) => set({ images })}
      />
    ),
  },
  {
    id: "decor",
    title: "Lines and accents?",
    note: "The rules under headings, the bar beside a quote, the tick under a numeral.",
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
      <div className="grid h-full place-items-center bg-base">
        <div className="fcc-rise flex max-w-[520px] flex-col items-center px-6 text-center">
          <span
            className="grid h-16 w-16 place-items-center rounded-3xl text-[24px] font-semibold shadow-overlay"
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          >
            F
          </span>

          <h1 className="mt-7 text-[34px] font-semibold leading-[42px] tracking-[-0.8px] text-primary">
            Welcome to FlashCC
          </h1>
          <p className="mt-3 text-[17px] leading-[26px] text-tertiary">
            Do you want to start onboarding? It takes five questions and makes everything after
            it match your style.
          </p>

          <div className="mt-8 flex w-full flex-col gap-2.5">
            <button
              type="button"
              onClick={() => setStarted(true)}
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl text-[16px] font-semibold shadow-overlay hover:brightness-110"
            >
              <Sparkles size={18} strokeWidth={2.5} />
              Yes, set it up
            </button>
            <button
              type="button"
              onClick={skip}
              className="flex h-12 w-full items-center justify-center rounded-2xl border border-hairline text-[15px] font-semibold text-secondary hover:border-surface-5 hover:text-primary"
            >
              No, take me straight in
            </button>
          </div>

          <p className="mt-4 text-caption text-muted">
            You can change any of this later, on any slide.
          </p>
        </div>
      </div>
    );
  }

  const q = QUESTIONS[step]!;
  const last = step === QUESTIONS.length - 1;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-surface-1 px-5">
        <button
          type="button"
          onClick={() => (step === 0 ? setStarted(false) : setStep(step - 1))}
          aria-label="Back"
          className="grid h-8 w-8 place-items-center rounded-xl text-tertiary hover:bg-white/[0.06] hover:text-primary"
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <div className="text-caption text-muted">
          Question {step + 1} of {QUESTIONS.length}
        </div>
        <div className="ml-2 h-1 w-40 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full"
            style={{
              width: `${((step + 1) / QUESTIONS.length) * 100}%`,
              background: "var(--brand-gold)",
            }}
          />
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={skip}
          className="h-8 rounded-xl px-3 text-caption text-muted hover:bg-white/[0.06] hover:text-primary"
        >
          Skip
        </button>
      </header>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[900px] flex-col items-center gap-10 px-6 py-10 md:flex-row md:items-start">
          <div className="w-full min-w-0 flex-1">
            <h2 className="text-[26px] font-semibold leading-8 tracking-[-0.4px] text-primary">
              {q.title}
            </h2>
            <p className="mb-6 mt-1.5 text-body leading-[20px] text-tertiary">{q.note}</p>

            {q.render(prefs, set)}

            <button
              type="button"
              onClick={() => (last ? finish() : setStep(step + 1))}
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              className="mt-8 flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-[15px] font-semibold shadow-overlay hover:brightness-110"
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

          {/* A real slide, rebuilt on every answer. */}
          <div
            className="shrink-0 overflow-hidden rounded-2xl border border-hairline shadow-overlay"
            style={{ width: (W * PREVIEW_H) / H, height: PREVIEW_H, background: preview?.background }}
          >
            <div
              className="pointer-events-none relative origin-top-left"
              style={{ width: W, height: H, transform: `scale(${PREVIEW_H / H})` }}
            >
              {preview?.layers.map((l) => (
                <LayerView key={l.id} layer={l} />
              ))}
            </div>
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
    <div className="flex flex-col gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={[
            "flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left",
            value === o.value
              ? "border-primary bg-surface-2"
              : "border-hairline hover:border-surface-5",
          ].join(" ")}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-primary">{o.label}</span>
            <span className="mt-0.5 block text-caption text-tertiary">{o.hint}</span>
          </span>
          {value === o.value ? <Check size={16} className="shrink-0 text-accent" strokeWidth={2.5} /> : null}
        </button>
      ))}
    </div>
  );
}
