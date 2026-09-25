import {
  AlertCircle,
  ArrowUp,
  Minus,
  PenLine,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { alignToSlots, draftSlides, type Finding } from "./ai.js";
import { contextVoice, listBrands } from "./brand.js";
import { ALL_CLIENTS, loadSelectedClient } from "./clients.js";
import {
  floorFor,
  labelFor,
  MAX_DRAFT_SLIDES,
  slotsFor,
  type Structure,
} from "./structures.js";

type Phase =
  | { kind: "idle" }
  | { kind: "drafting" }
  | { kind: "drafted"; texts: string[]; findings: Finding[] }
  | { kind: "failed"; message: string };

export function AiChat({
  structure,
  initialBrief,
  onDrafted,
  onWriteMyself,
  onCancel,
}: {
  structure: Structure;
  /** A brief carried in from a distilled source. Editable like any other. */
  initialBrief?: string | undefined;
  onDrafted: (texts: string[], findings: Finding[]) => void;
  onWriteMyself: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);
  // Seeded once. An angle's brief is a starting point somebody edits, not a
  // value that keeps reasserting itself while they type over it.
  const [brief, setBrief] = useState(initialBrief ?? "");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [handingOver, setHandingOver] = useState(false);
  /**
   * How many slides to ask for.
   *
   * A real control rather than something read out of the brief. The slot list
   * IS the count, so it has to be settled before the call, and a number parsed
   * out of prose is a number somebody cannot see, cannot correct, and will not
   * trust the second time it guesses wrong.
   */
  const [count, setCount] = useState(structure.slots.length);
  const abort = useRef<AbortController | null>(null);

  // A short beat so the screen change is a transition rather than a flicker.
  useEffect(() => {
    if (!handingOver) return;
    const t = window.setTimeout(onWriteMyself, 200);
    return () => window.clearTimeout(t);
  }, [handingOver, onWriteMyself]);

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
      // Nothing is stamped with a brand yet at this point, so the voice is
      // inferred from the client on screen. See contextVoice for the rules,
      // including why it returns nothing when they are ambiguous.
      // The sentinel is not a client id. Passing it through would happen to
      // work, by matching no brand and falling to the single-brand rule, and
      // relying on that is how it breaks the next time the rules change.
      const selected = loadSelectedClient();
      const voice = contextVoice(
        listBrands(),
        selected === ALL_CLIENTS ? undefined : selected,
      );
      // Resized BEFORE the call, never after. Generating the framework's
      // natural length and then asking for more would cost a second call and
      // produce slides written without knowing about each other.
      const asked = { ...structure, slots: slotsFor(structure, count) };
      const drafted = await draftSlides(brief, asked, controller.signal, voice);
      setPhase({
        kind: "drafted",
        texts: alignToSlots(drafted.slides, asked),
        findings: drafted.findings,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase({ kind: "failed", message: error instanceof Error ? error.message : "Drafting failed" });
    }
  }

  if (loading || handingOver) {
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
          {drafting ? (
            <Generating count={count} />
          ) : phase.kind === "drafted" ? (
            <Drafted
              structure={structure}
              texts={phase.texts}
              onUse={() => onDrafted(phase.texts, phase.findings)}
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
                Describe the post in your own words. It gets drafted into {count}{" "}
                {structure.name.toLowerCase()} slides you can edit.
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
                      // Enter sends, Shift+Enter breaks the line. The chat
                      // convention, and this box is a message rather than a
                      // document. Cmd/Ctrl+Enter still works for the muscle
                      // memory of anybody who learned it the old way.
                      if (e.key !== "Enter") return;
                      if (e.shiftKey) return;
                      e.preventDefault();
                      void send();
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

                <div className="mt-3 flex items-center gap-2 px-1">
                  <span className="text-caption text-tertiary">How many slides?</span>
                  <div className="flex h-7 items-center gap-0.5 rounded-lg border border-hairline">
                    <button
                      type="button"
                      aria-label="One fewer slide"
                      disabled={count <= floorFor(structure)}
                      onClick={() => setCount((n) => Math.max(floorFor(structure), n - 1))}
                      className="grid h-full w-7 place-items-center rounded-l-lg text-tertiary hover:text-primary disabled:opacity-30"
                    >
                      <Minus size={13} strokeWidth={2.4} />
                    </button>
                    <span className="w-7 text-center font-mono text-caption text-primary">{count}</span>
                    <button
                      type="button"
                      aria-label="One more slide"
                      disabled={count >= MAX_DRAFT_SLIDES}
                      onClick={() => setCount((n) => Math.min(MAX_DRAFT_SLIDES, n + 1))}
                      className="grid h-full w-7 place-items-center rounded-r-lg text-tertiary hover:text-primary disabled:opacity-30"
                    >
                      <Plus size={13} strokeWidth={2.4} />
                    </button>
                  </div>

                  {count === structure.slots.length ? (
                    <span className="text-caption text-muted">
                      what {structure.name.toLowerCase()} is normally
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCount(structure.slots.length)}
                      className="text-caption text-tertiary hover:text-accent"
                    >
                      back to {structure.slots.length}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setHandingOver(true)}
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


/**
 * The wait, given a shape.
 *
 * The form used to stay on screen, dimmed, with a spinner in the send button.
 * That reads as "your click may not have registered" rather than "this is
 * working", and the wait here is ten to fifteen seconds, which is long enough
 * that the difference matters.
 *
 * The steps are not progress. Nothing reports progress, and a bar that pretends
 * to would be lying; they are a description of what is happening, timed to the
 * call's real shape, so the screen has something true to say while it waits.
 */
function Generating({ count }: { count: number }) {
  const steps = [
    "Reading your brief",
    `Planning ${count} slides`,
    "Writing the hook",
    "Working through the middle",
    "Tightening the close",
  ];

  const [at, setAt] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setAt((n) => Math.min(steps.length - 1, n + 1)), 2600);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center">
      <span
        className="grid h-14 w-14 place-items-center rounded-2xl shadow-overlay"
        style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
      >
        <span className="fcc-spin block h-6 w-6 rounded-full border-2 border-black/20 border-t-black/70" />
      </span>

      <h1 className="mt-6 text-center text-[28px] font-semibold leading-9 tracking-[-0.5px] text-primary">
        Generating your slides
      </h1>

      <p className="mt-2 h-6 text-center text-body leading-[20px] text-tertiary">{steps[at]}…</p>

      <div className="mt-6 flex gap-1.5">
        {steps.map((s, i) => (
          <span
            key={s}
            className={[
              "block h-1 w-8 rounded-full",
              i <= at ? "bg-accent" : "bg-surface-4",
            ].join(" ")}
          />
        ))}
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
