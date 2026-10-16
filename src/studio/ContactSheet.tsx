/**
 * Every slide of every destination, before the zip is written.
 *
 * Reflow is good and it is not perfect, and a 9:16 slide that reflowed badly
 * should be caught here rather than after posting. One column per destination,
 * its pre-flight above it, so "which one is wrong" is answered by looking.
 */
import { Chip } from "./Dash.js";
import { destinationLabel, type Destination } from "./destinations.js";
import type { Doc } from "./model.js";
import type { Finding } from "./preflight.js";
import { SlidePreview } from "./SlidePreview.js";

export type SheetColumn = { destination: Destination; variant: Doc; findings: Finding[] };

export function ContactSheet({
  columns,
  onKeep,
}: {
  columns: readonly SheetColumn[];
  onKeep: (index: number, keep: boolean) => void;
}) {
  return (
    <div className="scroll-quiet mt-2 flex gap-3 overflow-x-auto pb-1">
      {columns.map((c, i) => {
        const fatal = c.findings.filter((f) => f.severity === "block").length;
        const warn = c.findings.length - fatal;
        return (
          <div key={`${c.destination.platform.id}-${c.destination.shape.label}`} className="w-[108px] shrink-0">
            <div className="text-body-strong text-primary">{destinationLabel(c.destination)}</div>
            <div className="mt-1 flex h-5 items-center gap-1">
              {c.findings.length === 0 ? <Chip tone="success">All clear</Chip> : null}
              {fatal > 0 ? <Chip tone="danger">{fatal} to fix</Chip> : null}
              {warn > 0 ? <Chip>{warn} to check</Chip> : null}
            </div>
            <label className="mt-1.5 flex h-7 items-center gap-1.5 text-caption text-tertiary">
              <input
                type="checkbox"
                checked={Boolean(c.destination.keep)}
                onChange={(e) => onKeep(i, e.target.checked)}
              />
              Keep as carousel
            </label>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {c.variant.slides.map((s) => (
                <SlidePreview
                  key={s.id}
                  slide={s}
                  w={c.variant.width}
                  h={c.variant.height}
                  className="rounded-md border border-hairline"
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
