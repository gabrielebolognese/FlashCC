import { ArrowUp, PenLine, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { Structure } from "./structures.js";

/**
 * Mockup for AI drafting. Deliberately inert: the composer does not submit and there
 * is no model behind it. It is here to hold the shape of the feature and to give
 * "write it yourself" something to sit under — nothing on this screen should imply
 * that drafting works yet, so every control that would send is visibly disabled.
 */
export function AiChat({
  structure,
  onWriteMyself,
  onCancel,
}: {
  structure: Structure;
  onWriteMyself: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 300);
    return () => window.clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <div className="grid h-full place-items-center bg-base">
        <span className="fcc-spin block h-9 w-9 rounded-full border-2 border-hairline border-t-accent" />
      </div>
    );
  }

  const prompts = [
    "Why most talking-head edits feel flat",
    "How I cut a 6-hour interview to 60 seconds",
    "The one change that took a client from 2K to 61K",
  ];

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
          <span
            className="grid h-14 w-14 place-items-center rounded-2xl shadow-overlay"
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          >
            <Sparkles size={24} strokeWidth={2.5} />
          </span>

          <h1 className="mt-6 text-center text-[28px] font-semibold leading-9 tracking-[-0.5px] text-primary">
            What is this carousel about?
          </h1>
          <p className="mt-2 max-w-[520px] text-center text-body leading-[20px] text-tertiary">
            Describe the post and it will be drafted into {structure.name.toLowerCase()} slides,
            ready to edit.
          </p>

          {/* The composer. Inert on purpose. */}
          <div className="mt-8 w-full">
            <div className="relative rounded-3xl border border-hairline bg-surface-1 opacity-60">
              <textarea
                disabled
                rows={3}
                placeholder="Describe your post…"
                className="h-[112px] w-full resize-none rounded-3xl bg-transparent px-5 py-4 text-[15px] leading-[24px] text-primary outline-none placeholder:text-muted disabled:cursor-not-allowed"
              />
              <span
                aria-hidden
                className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-surface-4 text-muted"
              >
                <ArrowUp size={17} strokeWidth={2.5} />
              </span>
            </div>

            {/* Same width, half the height. */}
            <button
              type="button"
              onClick={onWriteMyself}
              className="group mt-3 flex h-[56px] w-full items-center justify-center gap-2.5 rounded-3xl border border-hairline bg-surface-1 text-[15px] font-semibold text-secondary transition-[border-color,background-color,color] duration-instant ease-out hover:border-accent-dim hover:bg-accent-wash hover:text-accent"
            >
              <PenLine size={17} strokeWidth={2.5} />
              or write it yourself
            </button>

            <p className="mt-3 text-center text-caption text-muted">
              AI drafting is not live yet. Write it yourself for now.
            </p>
          </div>

          <div className="mt-9 flex w-full flex-wrap justify-center gap-2">
            {prompts.map((p) => (
              <span
                key={p}
                className="cursor-not-allowed rounded-2xl border border-hairline px-3.5 py-2 text-caption text-muted opacity-60"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
