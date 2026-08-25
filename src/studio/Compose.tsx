import { ArrowRight, CornerDownRight, GripVertical, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";

import { MAX_SLIDES } from "./compositions.js";
import { THEMES } from "./presets.js";
import {
  DEFAULT_STRUCTURE,
  insertionIndex,
  labelFor,
  repeatableOf,
  STRUCTURES,
  type Slot,
  type Structure,
} from "./structures.js";

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

const fieldsFor = (s: Structure): Field[] => s.slots.map((slot) => mk(slot));

export function Compose({
  initialTheme = "ink",
  onGenerate,
  onCancel,
}: {
  initialTheme?: keyof typeof THEMES;
  onGenerate: (result: ComposeResult) => void;
  onCancel: () => void;
}) {
  const [structure, setStructure] = useState<Structure>(DEFAULT_STRUCTURE);
  const [fields, setFields] = useState<Field[]>(() => fieldsFor(DEFAULT_STRUCTURE));
  const [themeId, setThemeId] = useState<keyof typeof THEMES>(initialTheme);
  const [showing, setShowing] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);

  const filled = fields.filter((f) => f.text.trim().length > 0);
  const canAdd = fields.length < MAX_SLIDES && repeatableOf(structure) !== undefined;
  const theme = THEMES[themeId]!;

  /** Switching framework keeps what you have written, matched up by position. */
  function switchTo(next: Structure) {
    setStructure(next);
    setFields((prev) => {
      const written = prev.filter((f) => f.text.trim().length > 0).map((f) => f.text);
      const base = next.slots.map((slot, i) => mk(slot, written[i] ?? ""));
      const spare = written.slice(next.slots.length);
      const rep = repeatableOf(next);
      if (!rep || spare.length === 0) return base;
      const at = insertionIndex(next.slots);
      return [...base.slice(0, at), ...spare.map((t) => mk(rep, t)), ...base.slice(at)];
    });
    setShowing(null);
  }

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

  const labels = fields.map((f) => f.slot);

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
        <div className="mx-auto max-w-[1060px] px-6 py-8">
          {/* framework picker */}
          <div className="mb-2 text-overline uppercase text-tertiary">Framework</div>
          <div className="mb-8 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {STRUCTURES.map((s) => {
              const active = s.id === structure.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => switchTo(s)}
                  className={[
                    "rounded-2xl border p-3 text-left transition-[border-color,transform] duration-micro ease-out hover:-translate-y-px",
                    active
                      ? "border-accent bg-accent-wash"
                      : "border-hairline bg-surface-1 hover:border-surface-5",
                  ].join(" ")}
                >
                  <div className={["text-body-strong", active ? "text-accent" : "text-primary"].join(" ")}>
                    {s.name}
                  </div>
                  <div className="mt-0.5 text-caption text-tertiary">{s.description}</div>
                  <div className="mt-1.5 font-mono text-[10px] leading-[14px] text-muted">{s.shape}</div>
                </button>
              );
            })}
          </div>

          {fields.map((f, i) => (
            <div key={f.key} className="flex gap-5">
              {/* the note: no border, no background — it sits in the margin */}
              <div className="hidden w-[268px] shrink-0 pt-9 text-right lg:block">
                <div className="text-caption font-semibold text-secondary">{labelFor(labels, i)}</div>
                <p className="mt-1 text-[11px] leading-[17px] text-muted">{f.slot.note}</p>
                {f.slot.examples.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowing(showing === f.key ? null : f.key)}
                    className="mt-1.5 text-[11px] text-tertiary underline decoration-dotted underline-offset-2 hover:text-accent"
                  >
                    {showing === f.key ? "Hide examples" : "See examples"}
                  </button>
                ) : null}
                {showing === f.key ? (
                  <div className="mt-2 flex flex-col items-end gap-1.5">
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
                    <span className="text-[10px] text-muted">click one to use it</span>
                  </div>
                ) : null}
              </div>

              {/* the arrow, pointing from the note at the box */}
              <div className="hidden shrink-0 pt-9 lg:block">
                <CornerDownRight size={13} className="-scale-y-100 text-muted" strokeWidth={2} />
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
                  className="group mb-3 rounded-2xl border border-hairline bg-surface-1 p-3 transition-[border-color] duration-instant ease-out focus-within:border-accent-dim hover:border-surface-5"
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
                    <span className="text-caption text-tertiary lg:hidden">{labelFor(labels, i)}</span>
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

          <div className="flex gap-5">
            <div className="hidden w-[268px] shrink-0 lg:block" />
            <div className="hidden w-[13px] shrink-0 lg:block" />
            <button
              type="button"
              disabled={!canAdd}
              onClick={addSlide}
              className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline text-body text-tertiary hover:border-edge hover:text-primary disabled:opacity-40"
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
