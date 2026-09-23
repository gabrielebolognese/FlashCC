/**
 * What this carousel looked like at the moments that mattered.
 *
 * Not an undo list, `useStudio` already has one of those and it covers
 * keystrokes. This covers three or four points in a carousel's life: you sent it
 * for approval, you exported it, you rebranded it. Restorable whole, or one
 * slide at a time, which is the case that actually comes up when a client asks
 * for slide four back and three other things have been fixed since.
 *
 * The filmstrip is a DIFF, not a preview. Showing what the version looked like
 * is barely useful; showing which slides are not what you have now is the whole
 * question, *"safeties to ensure that approved images aren't confused with
 * modified ones."*
 */
import { History, RotateCcw, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Chip, Empty } from "./Dash.js";
import type { Doc } from "./model.js";
import { sessionPlan } from "./session.js";
import { SlidePreview } from "./SlidePreview.js";
import {
  changedCount,
  diffSlides,
  listVersions,
  removeVersion,
  REASON_LABEL,
  restoreAll,
  restoreSlide,
  retentionDays,
  retentionLabel,
  snapshot,
  type Version,
} from "./versions.js";

const when = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function HistoryPanel({
  doc,
  onRestore,
  onClose,
}: {
  doc: Doc;
  onRestore: (next: Doc) => void;
  onClose: () => void;
}) {
  const plan = sessionPlan();
  const [versions, setVersions] = useState<Version[]>(() => listVersions(doc.id));
  const [selected, setSelected] = useState<Version | null>(() => listVersions(doc.id)[0] ?? null);
  const [confirming, setConfirming] = useState(false);

  const diff = useMemo(() => (selected ? diffSlides(selected.doc, doc) : []), [selected, doc]);
  const changed = changedCount(diff);
  const off = retentionDays(plan) === 0;

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[720px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <span className="text-title text-primary">History</span>
          {versions.length > 0 ? <Chip>{versions.length}</Chip> : null}
          <div className="flex-1" />
          <span className="text-caption text-muted">Versions are {retentionLabel(plan)}</span>
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
          {off ? (
            <p className="mb-4 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-2.5 text-body leading-5 text-tertiary">
              History is a Pro feature. Nothing is being kept on this plan, a history that only went
              back two saves would look like a safety net without being one.
            </p>
          ) : null}

          {versions.length === 0 ? (
            <Empty
              icon={History}
              title="Nothing saved yet"
              body="A version is kept when you send this for approval, export it, or apply a brand, the moments worth going back to, rather than every keystroke."
              action={
                off ? undefined : (
                  <button
                    type="button"
                    onClick={() => setVersions(snapshot(doc, "manual", plan, "Saved by hand"))}
                    style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                    className="flex h-8 items-center rounded-xl px-3.5 text-body-strong hover:brightness-110"
                  >
                    Save one now
                  </button>
                )
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
              {/* ── the list ── */}
              <div className="flex flex-col gap-1.5">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelected(v)}
                    className={[
                      "rounded-xl border px-3 py-2 text-left",
                      v.id === selected?.id
                        ? "border-accent-dim bg-accent-wash"
                        : "border-hairline bg-surface-1 hover:border-surface-5",
                    ].join(" ")}
                  >
                    <div className="text-caption font-semibold text-secondary">
                      {REASON_LABEL[v.reason]}
                    </div>
                    <div className="text-caption text-muted">{when(v.capturedAt)}</div>
                    <div className="text-caption text-muted">
                      {v.slideCount} slide{v.slideCount === 1 ? "" : "s"}
                    </div>
                  </button>
                ))}

                <button
                  type="button"
                  disabled={off}
                  onClick={() => setVersions(snapshot(doc, "manual", plan, "Saved by hand"))}
                  className="mt-1 flex h-8 items-center justify-center rounded-xl border border-dashed border-hairline text-caption text-tertiary hover:border-accent-dim hover:text-accent disabled:opacity-40"
                >
                  Save this version
                </button>
              </div>

              {/* ── the diff ── */}
              <div>
                {selected ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-overline uppercase text-tertiary">
                        Against what you have now
                      </span>
                      {changed === 0 ? (
                        <Chip tone="success">Identical</Chip>
                      ) : (
                        <Chip>
                          {changed} slide{changed === 1 ? "" : "s"} differ
                        </Chip>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
                      {diff.map((d) => (
                        <div key={d.index} className="min-w-0">
                          <div
                            className={[
                              "overflow-hidden rounded-lg border",
                              d.state === "same" ? "border-hairline" : "border-accent-dim",
                            ].join(" ")}
                          >
                            {/* The version's slide, because that is the thing being
                                offered, the current one is already on screen behind
                                this dialog. */}
                            {d.before ? (
                              <SlidePreview slide={d.before} />
                            ) : (
                              <div className="grid aspect-[4/5] place-items-center bg-surface-1 text-caption text-muted">
                                not in it
                              </div>
                            )}
                          </div>

                          <div className="mt-1 flex items-center gap-1">
                            <span className="text-caption text-muted">{d.index + 1}</span>
                            <span
                              className={[
                                "min-w-0 flex-1 truncate text-caption",
                                d.state === "same" ? "text-muted" : "text-accent",
                              ].join(" ")}
                            >
                              {d.state === "same"
                                ? "same"
                                : d.state === "changed"
                                  ? "changed"
                                  : d.state === "added"
                                    ? "added since"
                                    : "removed since"}
                            </span>
                            {d.before && d.state !== "same" ? (
                              <button
                                type="button"
                                title={`Put slide ${d.index + 1} back to this`}
                                onClick={() => onRestore(restoreSlide(doc, selected, d.index))}
                                className="shrink-0 text-muted hover:text-accent"
                              >
                                <RotateCcw size={11} strokeWidth={2.2} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="mt-3 text-caption leading-4 text-muted">
                      The arrow on a slide puts that one back and leaves the rest alone, which is
                      usually what is being asked for.
                    </p>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <footer className="flex h-16 shrink-0 items-center gap-2 border-t border-hairline px-5">
          {selected ? (
            <button
              type="button"
              onClick={() => {
                setVersions(removeVersion(doc.id, selected.id));
                setSelected(null);
              }}
              className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-body text-tertiary hover:bg-white/[0.04] hover:text-danger"
            >
              <Trash2 size={14} strokeWidth={2} />
              Forget this one
            </button>
          ) : null}

          <div className="flex-1" />

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center rounded-xl border border-hairline px-3.5 text-body text-secondary hover:text-primary"
          >
            Close
          </button>

          {selected && changed > 0 ? (
            confirming ? (
              <>
                <span className="text-caption text-secondary">
                  Replace all {diff.length} slides?
                </span>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex h-9 items-center rounded-xl border border-hairline px-3 text-body text-secondary hover:text-primary"
                >
                  Keep
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Snapshotted first, so restoring is itself undoable, going
                    // back should never be the one move you cannot take back.
                    snapshot(doc, "manual", plan, "Before restoring");
                    onRestore(restoreAll(doc, selected));
                    onClose();
                  }}
                  className="flex h-9 items-center rounded-xl border border-danger-dim bg-danger-wash px-3.5 text-body-strong text-danger"
                >
                  Restore
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                className="flex h-9 items-center gap-1.5 rounded-xl px-4 text-body-strong hover:brightness-110"
              >
                <RotateCcw size={14} strokeWidth={2.4} />
                Restore all
              </button>
            )
          ) : null}
        </footer>
      </div>
    </>
  );
}
