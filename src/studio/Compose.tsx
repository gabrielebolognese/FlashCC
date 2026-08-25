import { ArrowRight, GripVertical, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Fragment, useRef, useState } from "react";

import { MAX_SLIDES } from "./compositions.js";
import { THEMES } from "./presets.js";
import { labelFor, repeatableOf, type Slot, type Structure } from "./structures.js";

export type ComposeResult = {
  texts: string[];
  roles: string[];
  themeId: keyof typeof THEMES;
};

type Field = { key: string; slot: Slot; text: string };

let n = 0;
const mk = (slot: Slot, text = ""): Field => {
  n += 1;
  return { key: `f${n}`, slot, text };
};

export function Compose({
  structure,
  initialTheme = "ink",
  initialTexts,
  onGenerate,
  onBack,
}: {
  structure: Structure;
  initialTheme?: keyof typeof THEMES;
  /** Copy drafted upstream, one entry per slot. */
  initialTexts?: string[] | undefined;
  onGenerate: (result: ComposeResult) => void;
  onBack: () => void;
}) {
  const [fields, setFields] = useState<Field[]>(() =>
    structure.slots.map((slot, i) => mk(slot, initialTexts?.[i] ?? "")),
  );
  const [themeId, setThemeId] = useState<keyof typeof THEMES>(initialTheme);
  const [showing, setShowing] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);

  const filled = fields.filter((f) => f.text.trim().length > 0);
  const theme = THEMES[themeId]!;
  const labels = fields.map((f) => f.slot);

  const update = (key: string, text: string) =>
    setFields((fs) => fs.map((f) => (f.key === key ? { ...f, text } : f)));

  function addSlide() {
    const rep = repeatableOf(structure);
    if (!rep) return;
    setFields((fs) => {
      if (fs.length >= MAX_SLIDES) return fs;
      const last = fs.map((f) => f.slot.repeatable === true).lastIndexOf(true);
      const at = last === -1 ? Math.max(0, fs.length - 1) : last + 1;
      return [...fs.slice(0, at), mk(rep), ...fs.slice(at)];
    });
  }

  /** Insert a slide at an exact position, from the + between two boxes. */
  function insertAt(at: number) {
    const rep = repeatableOf(structure);
    if (!rep) return;
    setFields((fs) => (fs.length >= MAX_SLIDES ? fs : [...fs.slice(0, at), mk(rep), ...fs.slice(at)]));
  }

  const remove = (key: string) =>
    setFields((fs) => (fs.length <= 1 ? fs : fs.filter((f) => f.key !== key)));

  /** Pasting a whole post into an empty box spreads it down the remaining boxes. */
  function spread(index: number, clip: string): boolean {
    const parts = clip
      .replace(/\r\n?/g, "\n")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) return false;

    setFields((fs) => {
      const next = [...fs];
      const rep = repeatableOf(structure);
      parts.forEach((part, k) => {
        const at = index + k;
        if (at < next.length) {
          const target = next[at];
          if (target) next[at] = { ...target, text: part };
        } else if (rep && next.length < MAX_SLIDES) {
          next.splice(Math.max(0, next.length - 1), 0, mk(rep, part));
        }
      });
      return next;
    });
    return true;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-surface-1 px-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid h-8 w-8 place-items-center rounded-xl text-tertiary hover:bg-white/[0.06] hover:text-primary"
        >
          <X size={16} strokeWidth={2} />
        </button>
        <div>
          <div className="text-title text-primary">{structure.name}</div>
          <div className="text-caption text-muted">
            {structure.shape} · {filled.length}/{MAX_SLIDES} slides
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((id) => (
            <button
              key={id}
              type="button"
              title={id}
              onClick={() => setThemeId(id)}
              className={[
                "grid h-8 w-8 place-items-center rounded-xl border-2",
                themeId === id ? "border-accent" : "border-hairline hover:border-surface-5",
              ].join(" ")}
              style={{ background: THEMES[id]!.bg }}
            >
              <span className="block h-2.5 w-2.5 rounded-full" style={{ background: THEMES[id]!.accent }} />
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={filled.length === 0}
          onClick={() =>
            onGenerate({
              texts: filled.map((f) => f.text),
              roles: filled.map((f) => f.slot.id),
              themeId,
            })
          }
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          className="ml-2 flex h-9 items-center gap-2 rounded-xl px-4 text-body-strong shadow-overlay hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
        >
          <Sparkles size={15} strokeWidth={2.5} />
          Generate {filled.length || ""} slide{filled.length === 1 ? "" : "s"}
          <ArrowRight size={15} strokeWidth={2.5} />
        </button>
      </header>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1240px] px-6 py-12">
          {fields.map((f, i) => (
            <Fragment key={f.key}>
              {i > 0 ? <InsertRow onClick={() => insertAt(i)} disabled={fields.length >= MAX_SLIDES} /> : null}
              <div className="flex gap-6">
              {/* The note: one white line on the same row as the field, no border,
                  no background, and a straight arrow pointing at the box. */}
              <div className="hidden w-[430px] shrink-0 flex-col items-end pt-[36px] lg:flex">
                <div className="flex items-center gap-3" title={f.slot.detail}>
                  <span className="text-right text-[22px] font-medium leading-[28px] tracking-[-0.2px] text-primary">
                    {f.slot.note}
                  </span>
                  <LongArrow />
                </div>

                {f.slot.examples.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowing(showing === f.key ? null : f.key)}
                    className="mr-[68px] mt-3 flex h-8 items-center rounded-xl border border-accent-dim px-3 text-[14px] font-semibold text-accent hover:bg-accent-wash"
                  >
                    {showing === f.key ? "Hide examples" : "Examples"}
                  </button>
                ) : null}

                {showing === f.key ? (
                  <div className="mr-[68px] mt-2.5 flex flex-col items-end gap-2">
                    {f.slot.examples.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => {
                          update(f.key, ex);
                          setShowing(null);
                        }}
                        className="text-right text-body leading-[18px] text-tertiary hover:text-primary"
                      >
                        “{ex}”
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div
                  draggable
                  onDragStart={() => {
                    dragFrom.current = i;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    const from = dragFrom.current;
                    if (from === null || from === i) return;
                    setFields((fs) => {
                      const next = [...fs];
                      const [m] = next.splice(from, 1);
                      if (m) next.splice(i, 0, m);
                      return next;
                    });
                    dragFrom.current = null;
                  }}
                  className="group rounded-2xl border border-hairline bg-surface-1 p-3 transition-[border-color] duration-instant ease-out focus-within:border-accent-dim hover:border-surface-5"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <GripVertical size={13} className="cursor-grab text-muted" />
                    <span
                      className="grid h-6 min-w-6 place-items-center rounded-lg px-1.5 text-[10px] font-semibold"
                      style={{
                        background: f.slot.id === "hook" ? theme.accent : "var(--surface-4)",
                        color: f.slot.id === "hook" ? theme.bg : "var(--text-secondary)",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-caption font-semibold text-secondary">
                      {labelFor(labels, i)}
                    </span>
                    <span className="text-caption text-tertiary lg:hidden">{f.slot.note}</span>
                    <div className="flex-1" />
                    <span className="text-caption text-muted">{f.text.trim().length}</span>
                    {fields.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => remove(f.key)}
                        aria-label="Remove slide"
                        className="grid h-6 w-6 place-items-center rounded-lg text-muted opacity-0 hover:bg-white/[0.06] hover:text-danger group-hover:opacity-100"
                      >
                        <Trash2 size={12} strokeWidth={2} />
                      </button>
                    ) : null}
                  </div>

                  <textarea
                    value={f.text}
                    rows={Math.min(8, Math.max(2, Math.ceil(f.text.length / 58) + 1))}
                    placeholder={f.slot.placeholder}
                    onChange={(e) => update(f.key, e.target.value)}
                    onPaste={(e) => {
                      if (f.text.trim().length > 0) return;
                      if (spread(i, e.clipboardData.getData("text"))) e.preventDefault();
                    }}
                    className="w-full resize-none bg-transparent text-[14px] leading-[22px] text-primary outline-none placeholder:text-muted"
                  />
                </div>
              </div>
              </div>
            </Fragment>
          ))}

          <div className="mt-11 flex gap-6">
            <div className="hidden w-[320px] shrink-0 lg:block" />
            <button
              type="button"
              disabled={fields.length >= MAX_SLIDES}
              onClick={addSlide}
              className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline text-body text-tertiary hover:border-edge hover:text-primary disabled:opacity-40"
            >
              <Plus size={15} strokeWidth={2} />
              {fields.length >= MAX_SLIDES
                ? `Maximum ${MAX_SLIDES} slides`
                : `Add another ${repeatableOf(structure)?.label.toLowerCase() ?? "slide"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Twice the length of a stock arrow, and white — it has to read as a pointer. */
function LongArrow() {
  return (
    <svg
      width={56}
      height={12}
      viewBox="0 0 56 12"
      fill="none"
      className="shrink-0 text-primary"
      aria-hidden
    >
      <path
        d="M1 6h50M45 1l5 5-5 5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The + between two boxes. Inserts exactly there, not at the end. */
function InsertRow({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <div className="group/i flex items-center gap-6 py-4">
      <div className="hidden w-[430px] shrink-0 lg:block" />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="h-px flex-1 bg-hairline opacity-0 group-hover/i:opacity-100" />
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          aria-label="Add a slide here"
          title="Add a slide here"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline bg-surface-1 text-tertiary hover:border-accent hover:bg-accent-wash hover:text-accent disabled:opacity-30"
        >
          <Plus size={16} strokeWidth={2.5} />
        </button>
        <div className="h-px flex-1 bg-hairline opacity-0 group-hover/i:opacity-100" />
      </div>
    </div>
  );
}
