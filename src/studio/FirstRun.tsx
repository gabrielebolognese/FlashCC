import { ArrowRight, LayoutTemplate, PenLine } from "lucide-react";
import { useEffect, useState } from "react";

import { STRUCTURES } from "./structures.js";

const LINE = "Ready to create your first carousel?";
const SPEED = 42;

/** Types a line out, then reports done so the choices can arrive after it. */
function Typewriter({ text, onDone }: { text: string; onDone: () => void }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    setN(0);
    // Respect a reduced-motion preference by showing the whole line at once.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setN(text.length);
      onDone();
      return;
    }

    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) {
        window.clearInterval(id);
        onDone();
      }
    }, SPEED);
    return () => window.clearInterval(id);
  }, [text, onDone]);

  const typed = text.slice(0, n);
  const done = n >= text.length;

  return (
    <span>
      {typed}
      <span
        aria-hidden
        className={done ? "fcc-caret" : ""}
        style={{ opacity: done ? undefined : 1 }}
      >
        |
      </span>
    </span>
  );
}

export function FirstRun({
  onCreate,
  onExamples,
  onLater,
}: {
  onCreate: () => void;
  onExamples: () => void;
  onLater: () => void;
}) {
  const [ready, setReady] = useState(false);

  return (
    <div className="relative grid h-full place-items-center overflow-hidden bg-base">
      <div className="fcc-aurora" />

      <div className="relative w-full max-w-[620px] px-6 text-center">
        <h1
          className="text-balance font-semibold tracking-[-0.8px] text-primary"
          style={{ fontSize: "clamp(26px, 5vw, 40px)", lineHeight: 1.18 }}
        >
          <Typewriter text={LINE} onDone={() => setReady(true)} />
        </h1>

        {/* The choices arrive only once the line has finished, so the eye lands on
            the question first rather than on three buttons. */}
        <div
          className="fcc-stagger mt-9 flex flex-col gap-2.5"
          style={{ visibility: ready ? "visible" : "hidden" }}
        >
          <button
            type="button"
            onClick={onCreate}
            style={{ ["--i" as string]: 0, background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className="fcc-sheen fcc-lift flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl text-[16px] font-semibold shadow-overlay"
          >
            <PenLine size={18} strokeWidth={2.5} />
            Yes, create my own
            <ArrowRight size={17} strokeWidth={2.5} />
          </button>

          <button
            type="button"
            onClick={onExamples}
            style={{ ["--i" as string]: 1 }}
            className="fcc-lift flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border border-hairline bg-surface-1 text-[15px] font-semibold text-secondary hover:border-accent-dim hover:text-primary"
          >
            <LayoutTemplate size={17} strokeWidth={2.2} />
            Look at templates
          </button>

          <p style={{ ["--i" as string]: 2 }} className="mt-1 text-caption leading-[17px] text-muted">
            {STRUCTURES.length} finished examples, one per framework, in the style you just
            picked. Open, take apart, keep or delete.
          </p>

          <button
            type="button"
            onClick={onLater}
            style={{ ["--i" as string]: 3 }}
            className="mt-2 h-10 w-full rounded-2xl text-[14px] font-medium text-muted hover:bg-white/[0.04] hover:text-primary"
          >
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}
