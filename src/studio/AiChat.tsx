import { AlertCircle, ArrowUp, PenLine, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { alignToSlots, draftSlides } from "./ai.js";
import { labelFor, type Structure } from "./structures.js";

type Phase =
  | { kind: "idle" }
  | { kind: "drafting" }
  | { kind: "drafted"; texts: string[] }
  | { kind: "failed"; message: string };

export function AiChat({
  structure,
  onDrafted,
  onWriteMyself,
  onCancel,
}: {
  structure: Structure;
  onDrafted: (texts: string[]) => void;
  onWriteMyself: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 300);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  async function send() {
    if (!brief.trim() || phase.kind === "drafting") return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPhase({ kind: "drafting" });
    try {
      const drafted = await draftSlides(brief, structure, controller.signal);
      setPhase({ kind: "drafted", texts: alignToSlots(drafted, structure) });
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase({ kind: "failed", message: error instanceof Error ? error.message : "Drafting failed" });
    }
  }

  if (loading) {
    return (
      <div className="grid h-full place-items-center bg-base">
        <span className="fcc-spin block h-9 w-9 rounded-full border-2 border-hairline border-t-accent" />
      </div>
    );
  }

  const drafting = phase.kind === "drafting";

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
          <div className="text-title text-primary">{structure.name}</div>
          <div className="text-caption text-muted">{structure.shape}</div>
        </div>
      </header>

      <div className="scroll-quiet fcc-rise min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col items-center justify-center px-6 py-12">
          {phase.kind === "drafted" ? (
            <Drafted
              structure={structure}
              texts={phase.texts}
              onUse={() => onDrafted(phase.texts)}
              onRedo={() => setPhase({ kind: "idle" })}
            />
          ) : (
            <>
              <span
                className="grid h-14 w-14 place-items-center rounded-2xl shadow-overlay"
                style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              >
                <Sparkles size={24} strokeWidth={2.5} />
              </span>

              <h1 className="mt-6 text-center text-[28px] font-semibold leading-9 tracking-[-0.5px] text-primary">
                What is this carousel about?
              </h1>
              <p className="mt-2 max-w-[540px] text-center text-body leading-[20px] text-tertiary">
                Describe the post in your own words. It gets drafted into{" "}
                {structure.slots.length} {structure.name.toLowerCase()} slides you can edit.
              </p>

              <div className="mt-8 w-full">
                <div
                  className={[
                    "relative rounded-3xl border bg-surface-1",
                    drafting ? "border-accent-dim opacity-70" : "border-hairline focus-within:border-accent-dim",
                  ].join(" ")}
                >
                  <textarea
                    autoFocus
                    disabled={drafting}
                    value={brief}
                    rows={3}
                    onChange={(e) => setBrief(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder="e.g. Most talking-head edits feel flat because people cut on the beat instead of on movement. I want to show three fixes."
                    className="h-[112px] w-full resize-none rounded-3xl bg-transparent px-5 py-4 pr-16 text-[15px] leading-[24px] text-primary outline-none placeholder:text-muted"
                  />
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={!brief.trim() || drafting}
                    aria-label="Draft the slides"
                    className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full disabled:opacity-40"
                    style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                  >
                    {drafting ? (
                      <span className="fcc-spin block h-4 w-4 rounded-full border-2 border-black/20 border-t-black/70" />
                    ) : (
                      <ArrowUp size={17} strokeWidth={2.5} />
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onWriteMyself}
                  className="mt-3 flex h-[56px] w-full items-center justify-center gap-2.5 rounded-3xl border border-hairline bg-surface-1 text-[15px] font-semibold text-secondary transition-[border-color,background-color,color] duration-instant ease-out hover:border-accent-dim hover:bg-accent-wash hover:text-accent"
                >
                  <PenLine size={17} strokeWidth={2.5} />
                  or write it yourself
                </button>

                {phase.kind === "failed" ? (
                  <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-hairline bg-surface-1 p-3.5">
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" strokeWidth={2} />
                    <div className="min-w-0">
                      <div className="text-body-strong text-primary">Could not draft that</div>
                      <p className="mt-0.5 text-caption leading-[17px] text-tertiary">{phase.message}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-center text-caption text-muted">
                    {drafting ? "Drafting…" : "Cmd/Ctrl + Enter to draft"}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Drafted({
  structure,
  texts,
  onUse,
  onRedo,
}: {
  structure: Structure;
  texts: string[];
  onUse: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="w-full">
      <div className="mb-5 flex items-center gap-3">
        <div>
          <div className="text-[20px] font-semibold leading-7 tracking-[-0.3px] text-primary">
            {texts.filter((t) => t.trim()).length} slides drafted
          </div>
          <div className="text-caption text-muted">Edit anything before you build it</div>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onRedo}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-hairline px-3 text-body text-tertiary hover:text-primary"
        >
          <RotateCcw size={14} strokeWidth={2} />
          Redo
        </button>
        <button
          type="button"
          onClick={onUse}
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          className="flex h-9 items-center gap-2 rounded-xl px-4 text-body-strong shadow-overlay hover:brightness-110"
        >
          Use these
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {texts.map((text, i) => (
          <div key={i} className="rounded-2xl border border-hairline bg-surface-1 p-3.5">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="grid h-5 min-w-5 place-items-center rounded-md bg-surface-4 px-1.5 text-[10px] font-semibold text-secondary">
                {i + 1}
              </span>
              <span className="text-caption font-semibold text-tertiary">
                {labelFor(structure.slots, i)}
              </span>
            </div>
            <p className="text-[14px] leading-[21px] text-primary">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
