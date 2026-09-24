/**
 * Several ways to say the same line, side by side.
 *
 * The same shape as `HookPicker` and for the same reasons: a LIST, never a
 * ranking, with what you already have shown in the same form as the
 * alternatives, because "keep this" is a real answer and should not require an
 * escape key.
 *
 * Two things specific to this screen:
 *
 * **The intent chips live inside the picker, not only outside it.** The most
 * common thing somebody does after reading three rewrites is want a different
 * kind of rewrite, and closing the panel to press a different chip loses the
 * three they were comparing against.
 *
 * **A rewrite that would change the slide count says so before it is clicked.**
 * `restateSlide` splits a line too long for its box into more slides, which is
 * correct and is also a surprise if it happens after the click rather than
 * before it. `expand` is the intent that does this and the reason the label
 * exists.
 */
import { AlertCircle, ChevronDown, CornerDownLeft, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  distinctRewrites,
  INTENT_LABELS,
  rewriteLine,
  type RewriteIntent,
  type RewriteOption,
} from "./rewrite.js";
import type { Slot } from "./structures.js";
import type { Voice } from "./brand.js";

type Phase =
  | { at: "loading" }
  | { at: "ready"; options: RewriteOption[]; limit: number }
  | { at: "failed"; error: string };

export function RewritePicker({
  text,
  slot,
  deck,
  limit,
  voice,
  title = "Rewrite this line",
  slidesAfter,
  onPick,
  onClose,
}: {
  text: string;
  slot?: Slot | undefined;
  deck?: readonly string[] | undefined;
  limit?: number | undefined;
  voice?: Voice | undefined;
  title?: string;
  /**
   * How many slides this deck becomes if that text is used. Supplied by the
   * caller, which owns the document; this component knows nothing about docs.
   */
  slidesAfter?: ((candidate: string) => number) | undefined;
  onPick: (text: string) => void;
  onClose: () => void;
}) {
  const [intent, setIntent] = useState<RewriteIntent>("shorter");
  const [phase, setPhase] = useState<Phase>({ at: "loading" });
  const [freeOpen, setFreeOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const abort = useRef<AbortController | null>(null);

  const now = slidesAfter?.(text);

  const load = (want: RewriteIntent, note?: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setIntent(want);
    setPhase({ at: "loading" });

    rewriteLine(
      {
        text,
        intent: want,
        ...(note ? { instruction: note } : {}),
        ...(slot ? { slot } : {}),
        ...(deck ? { deck } : {}),
        ...(typeof limit === "number" ? { limit } : {}),
        ...(voice ? { voice } : {}),
      },
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        const kept = distinctRewrites(result.options, text);
        setPhase(
          kept.length > 0
            ? { at: "ready", options: kept, limit: result.limit }
            : { at: "failed", error: "Everything that came back said the same thing. Try again." },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPhase({
          at: "failed",
          error: error instanceof Error ? error.message : "Could not rewrite this line",
        });
      });
  };

  // Fires once on open. A re-render must not spend a model call.
  useEffect(() => {
    load("shorter");
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[620px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <span className="text-title text-primary">{title}</span>
          <div className="flex-1" />
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-primary"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </header>

        <div className="scroll-quiet flex-1 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-1.5">
            {INTENT_LABELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => load(c.id)}
                className={[
                  "h-7 rounded-lg border px-2.5 text-caption",
                  intent === c.id
                    ? "border-accent bg-accent-wash text-accent"
                    : "border-hairline text-tertiary hover:text-primary",
                ].join(" ")}
              >
                {c.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setFreeOpen((v) => !v)}
              className={[
                "flex h-7 items-center gap-1 rounded-lg border px-2.5 text-caption",
                intent === "free"
                  ? "border-accent bg-accent-wash text-accent"
                  : "border-hairline text-tertiary hover:text-primary",
              ].join(" ")}
            >
              Tell it what to change
              <ChevronDown size={12} strokeWidth={2.2} />
            </button>
          </div>

          {freeOpen ? (
            <form
              className="mt-2 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (instruction.trim()) load("free", instruction.trim());
              }}
            >
              <input
                autoFocus
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Make it sound less like a pitch"
                maxLength={300}
                className="h-7 flex-1 rounded-lg border border-hairline bg-surface-1 px-2.5 text-caption text-primary outline-none placeholder:text-muted focus:border-accent-dim"
              />
              <button
                type="submit"
                disabled={!instruction.trim()}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-hairline text-tertiary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
              >
                <CornerDownLeft size={13} strokeWidth={2} />
              </button>
            </form>
          ) : null}

          <div className="mt-4">
            <span className="text-overline uppercase text-tertiary">Now</span>
            <button
              type="button"
              onClick={onClose}
              className="mt-1.5 w-full rounded-2xl border border-accent-dim bg-accent-wash p-3 text-left"
            >
              <div className="text-body leading-5 text-primary">{text || "Nothing here yet"}</div>
              <div className="mt-1 text-caption text-tertiary">
                Keep this · {text.length} characters
              </div>
            </button>
          </div>

          {phase.at === "loading" ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
              <RefreshCw size={13} strokeWidth={2} className="fcc-spin shrink-0 text-accent" />
              <span className="text-body text-secondary">Working on it…</span>
            </div>
          ) : null}

          {phase.at === "failed" ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-danger-dim bg-danger-wash p-3">
              <AlertCircle size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <p className="text-body leading-5 text-secondary">{phase.error}</p>
                <button
                  type="button"
                  onClick={() => load(intent, instruction.trim() || undefined)}
                  className="mt-2 flex h-7 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-caption text-secondary hover:text-primary"
                >
                  <RefreshCw size={12} strokeWidth={2} />
                  Try again
                </button>
              </div>
            </div>
          ) : null}

          {phase.at === "ready" ? (
            <div className="mt-4 flex flex-col gap-2">
              {phase.options.map((o, i) => {
                const over = o.text.length > phase.limit;
                const after = slidesAfter?.(o.text);
                // Only worth saying when it differs from what is already true.
                const splits = after !== undefined && now !== undefined && after !== now;

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onPick(o.text)}
                    className="rounded-2xl border border-hairline bg-surface-1 p-3 text-left hover:border-accent-dim hover:bg-accent-wash"
                  >
                    <div className="text-body leading-5 text-primary">{o.text}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-caption text-accent">{o.note}</span>
                      <span className={over ? "text-caption text-danger" : "text-caption text-muted"}>
                        {o.text.length} characters
                      </span>
                      {splits ? (
                        <span className="text-caption text-muted">
                          becomes {after} slide{after === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}

              <p className="mt-1 text-caption leading-4 text-muted">
                Not ranked. They are in the order they were written, and you know what this deck
                is for.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
