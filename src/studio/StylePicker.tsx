import { ArrowLeft, Check, Palette, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { buildSlides } from "./compositions.js";
import { LayerView } from "./LayerView.js";
import { FONTS } from "./model.js";
import type { BuildOptions } from "./compositions.js";
import { customFrom, DEFAULT_STYLE, type Style } from "./styles.js";

const W = 1080;
const H = 1350;
const CARD_H = 196;
const LOAD_MS = 1500;

const STEPS = [
  "Reading your slides",
  "Choosing a composition for each",
  "Fitting the type",
  "Reserving space for pictures",
  "Ready",
];

/** The generation moment. Real work is instant; this is the beat that shows it happened. */
function Generating({ count }: { count: number }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / LOAD_MS);
      setPct(t * 100);
      if (t >= 1) window.clearInterval(id);
    }, 40);
    return () => window.clearInterval(id);
  }, []);

  const step = Math.min(STEPS.length - 1, Math.floor((pct / 100) * STEPS.length));

  return (
    <div className="grid h-full place-items-center bg-base">
      <div className="w-[420px] px-6">
        <div className="mb-1 text-[22px] font-semibold leading-8 tracking-[-0.3px] text-primary">
          Building {count} slide{count === 1 ? "" : "s"}
        </div>
        <div className="mb-5 h-5 text-body text-tertiary">{STEPS[step]}…</div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: "var(--brand-gold)" }}
          />
        </div>

        <div className="mt-2 text-right font-mono text-caption text-muted">
          {Math.round(pct)}%
        </div>
      </div>
    </div>
  );
}

/** A real first slide, in the style, through the same renderer the canvas uses. */
function StyleCard({
  style,
  texts,
  roles,
  build,
  selected,
  onPick,
}: {
  style: Style;
  texts: string[];
  roles: string[];
  build: BuildOptions;
  selected: boolean;
  onPick: () => void;
}) {
  const slide = useMemo(
    () => buildSlides(texts.slice(0, 1), style.theme, roles.slice(0, 1), build)[0],
    [style, texts, roles, build],
  );
  const scale = CARD_H / H;

  return (
    <button type="button" onClick={onPick} className="group text-left">
      <div
        className={[
          "overflow-hidden rounded-2xl border-2 transition-[border-color,transform] duration-micro ease-out group-hover:-translate-y-0.5",
          selected ? "border-accent" : "border-hairline group-hover:border-accent-dim",
        ].join(" ")}
        style={{ width: W * scale, height: CARD_H, background: slide?.background }}
      >
        <div
          className="pointer-events-none relative origin-top-left"
          style={{ width: W, height: H, transform: `scale(${scale})` }}
        >
          {slide?.layers.map((l) => (
            <LayerView key={l.id} layer={l} />
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-body-strong text-secondary group-hover:text-primary">{style.name}</span>
        {selected ? <Check size={13} className="text-accent" strokeWidth={2.5} /> : null}
      </div>
      <div className="text-caption text-muted">{style.note}</div>
    </button>
  );
}

export function StylePicker({
  texts,
  roles,
  styles,
  build,
  onUse,
  onBack,
}: {
  texts: string[];
  roles: string[];
  /** The gallery, with the user's own style first when they have one. */
  styles: Style[];
  build: BuildOptions;
  onUse: (style: Style) => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [custom, setCustom] = useState<Style | null>(null);
  const [picked, setPicked] = useState<string>(styles[0]?.id ?? DEFAULT_STYLE.id);

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), LOAD_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (loading) return <Generating count={texts.filter((t) => t.trim()).length} />;

  if (custom) {
    return (
      <CustomStyle
        style={custom}
        texts={texts}
        roles={roles}
        build={build}
        onChange={setCustom}
        onCancel={() => setCustom(null)}
        onUse={() => onUse(custom)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-surface-1 px-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to writing"
          className="grid h-8 w-8 place-items-center rounded-xl text-tertiary hover:bg-white/[0.06] hover:text-primary"
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <div>
          <div className="text-title text-primary">Pick a style</div>
          <div className="text-caption text-muted">
            Every preview is your own first slide
          </div>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onUse(styles.find((s) => s.id === picked) ?? styles[0] ?? DEFAULT_STYLE)}
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          className="flex h-9 items-center gap-2 rounded-xl px-4 text-body-strong shadow-overlay hover:brightness-110"
        >
          Use this style
        </button>
      </header>

      <div className="scroll-quiet fcc-rise min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1160px] px-6 py-8">
          <div className="flex flex-wrap gap-5">
            {styles.map((s) => (
              <StyleCard
                key={s.id}
                style={s}
                texts={texts}
                roles={roles}
                build={build}
                selected={picked === s.id}
                onPick={() => setPicked(s.id)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setCustom(customFrom(styles.find((s) => s.id === picked) ?? styles[0] ?? DEFAULT_STYLE))}
            className="mt-10 flex h-16 w-full items-center justify-center gap-3 rounded-3xl border border-dashed border-hairline text-[17px] font-semibold text-secondary transition-[border-color,background-color,color] duration-instant ease-out hover:border-accent-dim hover:bg-accent-wash hover:text-accent"
          >
            <Palette size={19} strokeWidth={2.2} />
            or create your own style
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── the custom editor ─────────────────────────────────────────────────── */

function CustomStyle({
  style,
  texts,
  roles,
  build,
  onChange,
  onCancel,
  onUse,
}: {
  style: Style;
  texts: string[];
  roles: string[];
  build: BuildOptions;
  onChange: (s: Style) => void;
  onCancel: () => void;
  onUse: () => void;
}) {
  const set = (patch: Partial<Style["theme"]>) =>
    onChange({ ...style, theme: { ...style.theme, ...patch } });

  const slide = useMemo(
    () => buildSlides(texts.slice(0, 1), style.theme, roles.slice(0, 1), build)[0],
    [style, texts, roles, build],
  );
  const scale = 460 / H;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-surface-1 px-5">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back to styles"
          className="grid h-8 w-8 place-items-center rounded-xl text-tertiary hover:bg-white/[0.06] hover:text-primary"
        >
          <X size={16} strokeWidth={2} />
        </button>
        <div className="text-title text-primary">Your own style</div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onUse}
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          className="flex h-9 items-center gap-2 rounded-xl px-4 text-body-strong shadow-overlay hover:brightness-110"
        >
          Use this style
        </button>
      </header>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[880px] flex-col items-center gap-8 px-6 py-10 md:flex-row md:items-start">
          <div
            className="shrink-0 overflow-hidden rounded-2xl border border-hairline shadow-overlay"
            style={{ width: W * scale, height: 460, background: slide?.background }}
          >
            <div
              className="pointer-events-none relative origin-top-left"
              style={{ width: W, height: H, transform: `scale(${scale})` }}
            >
              {slide?.layers.map((l) => (
                <LayerView key={l.id} layer={l} />
              ))}
            </div>
          </div>

          <div className="w-full min-w-0 flex-1">
            <Section label="Colours">
              <Swatch label="Background" value={style.theme.bg} onChange={(bg) => set({ bg })} />
              <Swatch label="Text" value={style.theme.fg} onChange={(fg) => set({ fg })} />
              <Swatch label="Accent" value={style.theme.accent} onChange={(accent) => set({ accent })} />
              <Swatch label="Muted" value={style.theme.muted} onChange={(muted) => set({ muted })} />
            </Section>

            <Section label="Typefaces">
              <Picker
                label="Headings"
                value={style.theme.displayFont ?? "sans"}
                onChange={(displayFont) => set({ displayFont })}
              />
              <Picker
                label="Body"
                value={style.theme.bodyFont ?? "sans"}
                onChange={(bodyFont) => set({ bodyFont })}
              />
            </Section>

            <p className="mt-5 text-caption leading-[17px] text-muted">
              The preview is your real first slide. Everything here lands on ordinary layers, so
              you can still change any of it once you are in the editor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2.5 text-overline uppercase text-tertiary">{label}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Swatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label className="flex h-10 items-center gap-3 rounded-xl border border-hairline bg-surface-1 px-3">
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-6 cursor-pointer rounded-md border-0 bg-transparent p-0"
      />
      <span className="flex-1 text-body text-secondary">{label}</span>
      <span className="font-mono text-caption uppercase text-muted">{value}</span>
    </label>
  );
}

function Picker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex h-10 items-center gap-3 rounded-xl border border-hairline bg-surface-1 px-3">
      <span className="w-20 shrink-0 text-body text-secondary">{label}</span>
      <div className="flex flex-1 gap-1">
        {FONTS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            style={{ fontFamily: f.stack }}
            className={[
              "h-7 flex-1 rounded-lg text-caption",
              value === f.id ? "bg-surface-4 text-primary" : "text-tertiary hover:bg-white/[0.04]",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
