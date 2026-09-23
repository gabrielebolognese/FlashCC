/**
 * Several ways to open, side by side.
 *
 * The screen is a LIST, not a ranking. The loudest complaint in the research is
 * about exactly that, "its virality score and my audience disagree, constantly...
 * I have stopped trusting the ranking and now I scrub the whole thing myself
 * anyway, which defeats the point of paying", so nothing here is starred,
 * scored, sorted by confidence or marked recommended. Each one names the angle
 * it takes, which is what lets a choice be made on judgement.
 *
 * Picking one goes back through the generator rather than typing over the layer,
 * so type scale and composition stay deterministic (6.6). The current hook is
 * shown in the same shape as the alternatives, because "keep what I have" is a
 * real answer and it should not take an escape key to give it.
 */
import { AlertCircle, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Chip } from "./Dash.js";
import type { Doc } from "./model.js";
import { deckTexts } from "./transcript.js";
import { distinctHooks, draftHooks, HOOK_COUNT, type HookVariant } from "./variants.js";

type Phase =
  | { at: "loading" }
  | { at: "ready"; variants: HookVariant[] }
  | { at: "failed"; error: string };

export function HookPicker({
  doc,
  framework,
  onPick,
  onClose,
}: {
  doc: Doc;
  framework?: string | undefined;
  onPick: (text: string) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ at: "loading" });
  const abort = useRef<AbortController | null>(null);

  const texts = deckTexts(doc);
  const current = texts[0] ?? "";

  const load = () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPhase({ at: "loading" });

    draftHooks(current, texts, undefined, HOOK_COUNT, controller.signal)
      .then((variants) => {
        if (controller.signal.aborted) return;
        const kept = distinctHooks(variants, current);
        setPhase(
          kept.length > 0
            ? { at: "ready", variants: kept }
            : { at: "failed", error: "Everything that came back said the same thing. Try again." },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPhase({
          at: "failed",
          error: error instanceof Error ? error.message : "Could not write hooks",
        });
      });
  };

  // Runs once on open and never re-fires from a dependency change: this costs a
  // model call, and a re-render must not spend one.
  useEffect(() => {
    load();
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[620px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <span className="text-title text-primary">Another way in</span>
          {framework ? <Chip>{framework}</Chip> : null}
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
          <p className="text-caption leading-4 text-muted">
            Each one is written against the slides you already have, so it promises something the
            deck actually delivers. They are not ranked, you know your audience.
          </p>

          <div className="mt-3">
            <span className="text-overline uppercase text-tertiary">What you have now</span>
            <button
              type="button"
              onClick={onClose}
              className="mt-1.5 w-full rounded-2xl border border-accent-dim bg-accent-wash p-3 text-left"
            >
              <div className="text-body text-primary">{current || "Nothing on slide 1 yet"}</div>
              <div className="mt-1 text-caption text-tertiary">Keep this</div>
            </button>
          </div>

          {phase.at === "loading" ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
              <RefreshCw size={13} strokeWidth={2} className="fcc-spin shrink-0 text-accent" />
              <span className="text-body text-secondary">Reading the deck and writing openings…</span>
            </div>
          ) : null}

          {phase.at === "failed" ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-danger-dim bg-danger-wash p-3">
              <AlertCircle size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <p className="text-body leading-5 text-secondary">{phase.error}</p>
                <button
                  type="button"
                  onClick={load}
                  className="mt-2 flex h-7 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-caption text-secondary hover:text-primary"
                >
                  <RefreshCw size={12} strokeWidth={2} />
                  Try again
                </button>
              </div>
            </div>
          ) : null}

          {phase.at === "ready" ? (
            <div className="mt-4">
              <span className="text-overline uppercase text-tertiary">Or</span>
              <div className="mt-1.5 flex flex-col gap-2">
                {phase.variants.map((v) => (
                  <button
                    key={v.text}
                    type="button"
                    onClick={() => onPick(v.text)}
                    className="rounded-2xl border border-hairline bg-surface-1 p-3 text-left hover:border-accent-dim"
                  >
                    <div className="text-body text-primary">{v.text}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-caption text-accent">{v.angle}</span>
                      <span className="text-caption text-muted">{v.text.length} characters</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex h-16 shrink-0 items-center gap-2 border-t border-hairline px-5">
          <span className="flex-1 text-caption text-muted">
            Picking one lays slide 1 out again. Nothing else in the deck moves.
          </span>
          <button
            type="button"
            disabled={phase.at === "loading"}
            onClick={load}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-hairline px-3.5 text-body text-secondary hover:text-primary disabled:opacity-40"
          >
            <Sparkles size={14} strokeWidth={2} />
            More
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center rounded-xl border border-hairline px-3.5 text-body text-secondary hover:text-primary"
          >
            Close
          </button>
        </footer>
      </div>
    </>
  );
}
