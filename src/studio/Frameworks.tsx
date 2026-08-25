import { ArrowRight, HelpCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

import { DEFAULT_STRUCTURE, STRUCTURES, type Structure } from "./structures.js";

/** A square preview of the shape, drawn from the framework's own slot count. */
function ShapeMark({ slots, accent }: { slots: number; accent: string }) {
  const bars = Array.from({ length: Math.min(slots, 9) });
  return (
    <div className="flex items-end gap-1.5">
      {bars.map((_, i) => (
        <span
          key={i}
          className="block w-1.5 rounded-full"
          style={{
            height: 10 + ((i * 13) % 34),
            background: i === 0 ? accent : "var(--surface-5)",
          }}
        />
      ))}
    </div>
  );
}

export function Frameworks({
  onPick,
  onCancel,
}: {
  onPick: (structure: Structure) => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 1000);
    return () => window.clearTimeout(t);
  }, []);

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
        <div className="text-title text-primary">Pick a framework</div>
      </header>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid h-full place-items-center">
            <div className="flex flex-col items-center gap-4">
              <span className="fcc-spin block h-9 w-9 rounded-full border-2 border-hairline border-t-accent" />
              <span className="text-caption text-muted">Preparing frameworks…</span>
            </div>
          </div>
        ) : (
          <div className="grid min-h-full place-items-center px-6 py-8">
            <div>
              <p className="mb-6 text-center text-body text-tertiary">
                Every carousel is one of four shapes. Each one opens differently.
              </p>

              <div className="fcc-rise grid grid-cols-1 gap-5 sm:grid-cols-2">
                {STRUCTURES.map((s, i) => (
                  <div
                    key={s.id}
                    className="group flex flex-col justify-between rounded-3xl border border-hairline bg-gradient-to-b from-surface-2 to-surface-1 p-6 shadow-overlay transition-[border-color,transform] duration-standard ease-out hover:-translate-y-0.5 hover:border-accent-dim"
                    style={{
                      width: "min(30vw, 34vh)",
                      height: "min(30vw, 34vh)",
                      minWidth: 264,
                      minHeight: 264,
                      animationDelay: `${i * 60}ms`,
                    }}
                  >
                    <div className="min-h-0">
                      <ShapeMark slots={s.slots.length} accent="var(--accent)" />
                      <div className="mt-5 text-[17px] font-semibold leading-6 tracking-[-0.2px] text-primary">
                        {s.name}
                      </div>
                      <div className="mt-1.5 font-mono text-[10px] uppercase leading-4 tracking-[0.4px] text-accent">
                        {s.shape}
                      </div>
                      <p className="mt-3 text-body leading-[19px] text-tertiary">{s.description}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onPick(s)}
                      className="mt-5 flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-hairline bg-surface-3 text-body-strong text-secondary transition-colors duration-instant ease-out group-hover:bg-[color:var(--accent)] group-hover:text-[color:var(--on-accent)]"
                    >
                      Start writing
                      <ArrowRight size={15} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>

              {/* The escape hatch. Choosing wrong here is the expensive mistake, so
                  not choosing has to lead somewhere rather than stall. */}
              <button
                type="button"
                onClick={() => onPick(DEFAULT_STRUCTURE)}
                className="fcc-lift mt-5 flex w-full items-center justify-center gap-3 rounded-3xl border border-dashed border-hairline px-6 py-4 text-center hover:border-accent-dim hover:bg-accent-wash"
              >
                <HelpCircle size={18} strokeWidth={2} className="shrink-0 text-tertiary" />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-primary">Not sure</span>
                  <span className="mt-0.5 block text-caption text-tertiary">
                    Start on {DEFAULT_STRUCTURE.name} — it works on people who have never
                    heard of you
                  </span>
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
