/**
 * Hook formulas (25.3): pick one, fill its blanks, put it on the cover. No
 * model involved, which is the point: the hook is the one slide people should
 * write themselves. "Write variants in this shape" hands the formula to the
 * hook writer as a hint instead.
 *
 * Listed by kind. Nothing is ranked, starred or labelled "top converting".
 */
import { Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

import { IconButton } from "../ui/IconButton.js";
import { blanksOf, fillFormula, formulasOf, HOOK_KINDS, isFilled, type HookFormula, type HookKind } from "./hooks.js";

export function HookFormulas({
  current,
  canAsk,
  onUse,
  onAsk,
  onClose,
}: {
  /** What slide 1 says now. */
  current: string;
  /** Hook variants need the drafting server; without it the hint is not offered. */
  canAsk: boolean;
  /** The words, and the kind of formula they came from (recorded on the deck for 28.5). */
  onUse: (text: string, kind: HookKind) => void;
  onAsk: (pattern: string) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<HookKind>("curiosity");
  const [chosen, setChosen] = useState<HookFormula | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const blanks = useMemo(() => (chosen ? blanksOf(chosen.template) : []), [chosen]);
  const filled = chosen ? fillFormula(chosen.template, values) : "";

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Hook formulas"
        className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[680px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <span className="flex-1 text-title text-primary">Hook formulas</span>
          <IconButton icon={X} label="Close" control onClick={onClose} />
        </header>

        <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-hairline px-5 py-3">
          {HOOK_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              data-control
              title={k.note}
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              className={[
                "h-7 rounded-lg border px-2.5 text-caption",
                kind === k.id ? "border-accent text-accent" : "border-hairline text-tertiary hover:text-primary",
              ].join(" ")}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-[1fr_1fr] overflow-hidden">
          <div className="overflow-y-auto border-r border-hairline p-3">
            <p className="mb-2 px-1 text-caption text-muted">{HOOK_KINDS.find((k) => k.id === kind)?.note}. Not ranked: you know your audience.</p>
            {formulasOf(kind).map((h) => (
              <button
                key={h.id}
                type="button"
                data-control
                onClick={() => {
                  setChosen(h);
                  setValues({});
                }}
                className={[
                  "mb-1 block w-full rounded-xl border px-3 py-2 text-left text-body",
                  chosen?.id === h.id ? "border-accent-dim bg-accent-wash text-primary" : "border-transparent text-secondary hover:bg-white/[0.04]",
                ].join(" ")}
              >
                {h.template}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto p-4">
            {chosen ? (
              <>
                {blanks.map((b) => (
                  <label key={b} className="mb-2 block">
                    <span className="text-caption text-tertiary">{b}</span>
                    <input
                      value={values[b] ?? ""}
                      onChange={(e) => setValues({ ...values, [b]: e.target.value })}
                      className="mt-0.5 h-8 w-full rounded-md border border-edge bg-surface-1 px-2 text-body text-primary outline-none focus:border-accent-dim"
                    />
                  </label>
                ))}
                <div className="mt-3 rounded-2xl border border-hairline bg-surface-1 p-3">
                  <div className="text-caption text-muted">On the cover</div>
                  <div className="mt-1 text-body text-primary">{filled}</div>
                  <div className="mt-1 text-caption text-muted">{filled.length} characters</div>
                </div>
              </>
            ) : (
              <p className="text-caption leading-5 text-muted">
                Pick a formula, fill its blanks, and it goes on the cover, laid out like any hook. Now it says: “{current || "nothing yet"}”
              </p>
            )}
          </div>
        </div>

        <footer className="flex h-16 shrink-0 items-center gap-2 border-t border-hairline px-5">
          <span className="flex-1 text-caption text-muted">Only slide 1 changes.</span>
          {canAsk && chosen ? (
            <button
              type="button"
              data-control
              onClick={() => onAsk(chosen.template)}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-hairline px-3.5 text-body text-secondary hover:text-primary"
            >
              <Sparkles size={14} strokeWidth={2} />
              Write variants in this shape
            </button>
          ) : null}
          <button
            type="button"
            data-control
            disabled={!chosen || !isFilled(filled)}
            onClick={() => onUse(filled, chosen?.kind ?? kind)}
            className="flex h-9 items-center rounded-xl px-3.5 text-body-strong disabled:opacity-40"
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          >
            Use on the cover
          </button>
        </footer>
      </div>
    </>
  );
}
