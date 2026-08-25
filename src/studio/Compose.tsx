import { ArrowRight, GripVertical, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";

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
  onGenerate,
  onBack,
}: {
  structure: Structure;
  initialTheme?: keyof typeof THEMES;
  onGenerate: (result: ComposeResult) => void;
  onBack: () => void;
}) {
  const [fields, setFields] = useState<Field[]>(() => structure.slots.map((slot) => mk(slot)));
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
        <div className="mx-auto max-w-[1120px] px-6 py-12">
          {fields.map((f, i) => (
            <div key={f.key} className="mb-11 flex gap-6">
              {/* The note: one white line on the same row as the field, no border,
                  no background, and a straight arrow pointing at the box. */}
              <div className="hidden w-[320px] shrink-0 flex-col items-end pt-[46px] lg:flex">
                <div className="flex items-center gap-2.5" title={f.slot.detail}>
                  <span className="text-caption text-primary">
                    <span className="font-semibold">{labelFor(labels, i)}</span>
                    <span className="text-tertiary"> — </span>
                    {f.slot.note}
                  </span>
                  <ArrowRight size={14} strokeWidth={2} className="shrink-0 text-muted" />
                </div>

                {f.slot.examples.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowing(showing === f.key ? null : f.key)}
                    className="mr-6 mt-2 text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-accent"
                  >
                    {showing === f.key ? "hide examples" : "examples"}
                  </button>
                ) : null}

                {showing === f.key ? (
                  <div className="mr-6 mt-2 flex flex-col items-end gap-2">
                    {f.slot.examples.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => {
                          update(f.key, ex);
                          setShowing(null);
                        }}
                        className="text-right text-[11px] leading-[16px] text-tertiary hover:text-primary"
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
                    <span className="text-caption text-primary lg:hidden">
                      {labelFor(labels, i)}
                      <span className="text-tertiary"> — {f.slot.note}</span>
                    </span>
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
          ))}

          <div className="flex gap-6">
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
