import { ArrowRight, GripVertical, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";

import { compositionLabel, MAX_SLIDES } from "./compositions.js";
import { THEMES } from "./presets.js";

export type ComposeResult = { texts: string[]; themeId: keyof typeof THEMES };

type Field = { id: string; text: string };

let n = 0;
const field = (text = ""): Field => {
  n += 1;
  return { id: `f${n}`, text };
};

/**
 * Write the deck before you design it. One field per slide, up to 35, and each field
 * shows which composition it will get — so the variety is visible before Generate,
 * not a surprise afterwards.
 */
export function Compose({
  initialTheme = "ink",
  onGenerate,
  onCancel,
}: {
  initialTheme?: keyof typeof THEMES;
  onGenerate: (result: ComposeResult) => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<Field[]>([field(), field(), field()]);
  const [themeId, setThemeId] = useState<keyof typeof THEMES>(initialTheme);
  const dragFrom = useRef<number | null>(null);

  const filled = fields.filter((f) => f.text.trim().length > 0);
  const canAdd = fields.length < MAX_SLIDES;

  const update = (id: string, text: string) =>
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, text } : f)));

  const addAt = (i: number) =>
    setFields((fs) => (fs.length >= MAX_SLIDES ? fs : [...fs.slice(0, i), field(), ...fs.slice(i)]));

  const remove = (id: string) =>
    setFields((fs) => (fs.length <= 1 ? [field()] : fs.filter((f) => f.id !== id)));

  /** Pasting a whole post into an empty field splits it across fields. */
  const onPaste = (id: string, index: number, clip: string) => {
    const parts = clip
      .replace(/\r\n?/g, "\n")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) return false;

    setFields((fs) => {
      const before = fs.slice(0, index);
      const after = fs.slice(index + 1).filter((f) => f.text.trim().length > 0);
      const made = parts.slice(0, MAX_SLIDES - before.length).map((p) => field(p));
      return [...before, ...made, ...after].slice(0, MAX_SLIDES);
    });
    return true;
  };

  const theme = THEMES[themeId]!;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-surface-1 px-5">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          className="grid h-8 w-8 place-items-center rounded-xl text-tertiary hover:bg-white/[0.06] hover:text-primary"
        >
          <X size={16} strokeWidth={2} />
        </button>
        <div>
          <div className="text-title text-primary">Write your carousel</div>
          <div className="text-caption text-muted">One box per slide · {filled.length}/{MAX_SLIDES}</div>
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
          onClick={() => onGenerate({ texts: filled.map((f) => f.text), themeId })}
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          className="ml-2 flex h-9 items-center gap-2 rounded-xl px-4 text-body-strong shadow-overlay hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
        >
          <Sparkles size={15} strokeWidth={2.5} />
          Generate {filled.length > 0 ? filled.length : ""} slide{filled.length === 1 ? "" : "s"}
          <ArrowRight size={15} strokeWidth={2.5} />
        </button>
      </header>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-6 py-8">
          <p className="mb-5 text-body text-tertiary">
            Paste your whole post into the first box and it splits itself. The first slide is
            always the title; the rest rotate through different layouts.
          </p>

          {fields.map((f, i) => (
            <div key={f.id}>
              <InsertRow onClick={() => addAt(i)} disabled={!canAdd} />

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
                      background: i === 0 ? theme.accent : "var(--surface-4)",
                      color: i === 0 ? theme.bg : "var(--text-secondary)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-caption text-tertiary">
                    {compositionLabel(i, Math.max(filled.length, fields.length))}
                  </span>
                  <div className="flex-1" />
                  <span className="text-caption text-muted">{f.text.trim().length}</span>
                  <button
                    type="button"
                    onClick={() => remove(f.id)}
                    aria-label="Remove slide"
                    className="grid h-6 w-6 place-items-center rounded-lg text-muted opacity-0 hover:bg-white/[0.06] hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                </div>

                <textarea
                  value={f.text}
                  rows={Math.min(8, Math.max(2, Math.ceil(f.text.length / 62) + 1))}
                  placeholder={i === 0 ? "Your hook — the line that stops the scroll" : "What this slide says…"}
                  onChange={(e) => update(f.id, e.target.value)}
                  onPaste={(e) => {
                    if (f.text.trim().length > 0) return;
                    const clip = e.clipboardData.getData("text");
                    if (onPaste(f.id, i, clip)) e.preventDefault();
                  }}
                  className="w-full resize-none bg-transparent text-[14px] leading-[22px] text-primary outline-none placeholder:text-muted"
                />
              </div>
            </div>
          ))}

          <InsertRow onClick={() => addAt(fields.length)} disabled={!canAdd} last />

          <button
            type="button"
            disabled={!canAdd}
            onClick={() => addAt(fields.length)}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline text-body text-tertiary hover:border-edge hover:text-primary disabled:opacity-40"
          >
            <Plus size={15} strokeWidth={2} />
            {canAdd ? "Add slide" : `Maximum ${MAX_SLIDES} slides`}
          </button>
        </div>
      </div>
    </div>
  );
}

function InsertRow({ onClick, disabled, last = false }: { onClick: () => void; disabled: boolean; last?: boolean }) {
  return (
    <div className={["group/i flex items-center", last ? "pt-2" : "py-2"].join(" ")}>
      <div className="h-px flex-1 bg-transparent group-hover/i:bg-hairline" />
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-label="Insert slide here"
        className="mx-2 grid h-6 w-6 place-items-center rounded-full border border-hairline bg-surface-1 text-muted opacity-0 hover:border-accent hover:text-accent group-hover/i:opacity-100 disabled:opacity-0"
      >
        <Plus size={12} strokeWidth={2} />
      </button>
      <div className="h-px flex-1 bg-transparent group-hover/i:bg-hairline" />
    </div>
  );
}
