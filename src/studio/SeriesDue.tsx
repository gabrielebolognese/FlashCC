/**
 * "Part 2 is due."
 *
 * The evidenced pain, in the words it was reported in: *"the last thing you want
 * is for a piece of content to finally go viral, but then by the time you make
 * the part two in the series, it's like a month later and there's just no
 * momentum anymore."*
 *
 * Three rules keep this from becoming wallpaper, and they live in `dueParts`
 * rather than here:
 *
 *   - a series nobody has published from is not losing momentum, it is unstarted
 *   - a next part already scheduled is a decision made, not a thing to nag about
 *   - nothing appears until the gap is genuinely open
 *
 * It is a BANNER, not a notification. There is no background job in this product
 * and no permission to send anything, so promising a reminder that arrives while
 * the app is closed would be a promise it cannot keep. This is what it can
 * honestly do: tell you the moment you look.
 */
import { CalendarClock, Flame, X } from "lucide-react";
import { useMemo, useState } from "react";

import { collectSeries, dueParts, type DuePart } from "./series.js";
import type { Post } from "./pipeline.js";
import { listDocs } from "./storage.js";

/** Dismissals last the session. A new day is a new chance to have been right. */
const dismissed = new Set<string>();

export function SeriesDue({
  posts,
  onOpen,
}: {
  posts: readonly Post[];
  onOpen: (docId: string) => void;
}) {
  const [, bump] = useState(0);

  const due = useMemo(
    () => dueParts(collectSeries(listDocs(), posts)).filter((d) => !dismissed.has(d.seriesId)),
    [posts],
  );

  const top: DuePart | undefined = due[0];
  if (!top) return null;

  return (
    <div
      className={[
        "mb-4 flex items-start gap-2.5 rounded-2xl border px-3.5 py-3",
        top.stale ? "border-hairline bg-surface-1" : "border-accent-dim bg-accent-wash",
      ].join(" ")}
    >
      {top.stale ? (
        <CalendarClock size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-tertiary" />
      ) : (
        <Flame size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-body leading-5 text-primary">
          {top.stale ? (
            <>
              <span className="text-body-strong">{top.seriesName}</span> stalled {top.daysSince} days
              ago at part {top.part.part - 1}.
            </>
          ) : (
            <>
              Part {top.part.part} of <span className="text-body-strong">{top.seriesName}</span> is
              due — the last one went out {top.daysSince} days ago.
            </>
          )}
        </p>
        <p className="mt-0.5 text-caption leading-4 text-tertiary">
          {top.stale
            ? "Worth deciding whether to finish it or let it go. A half-published series is the worst of both."
            : "Momentum is the whole advantage of a series. Schedule it while the last part is still moving."}
        </p>

        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpen(top.part.docId)}
            className="flex h-7 items-center rounded-lg border border-hairline bg-surface-1 px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent"
          >
            Open part {top.part.part}
          </button>
          {due.length > 1 ? (
            <span className="text-caption text-muted">
              and {due.length - 1} other series waiting
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          dismissed.add(top.seriesId);
          bump((n) => n + 1);
        }}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-tertiary hover:text-primary"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
