/**
 * Publish everything in view, and get one CSV with a row each.
 *
 * This is the shape the work actually has. Nobody makes one carousel and then
 * goes to a scheduler; they make ten on a Sunday and want ten rows. It is scoped
 * to the FILTERED set rather than to the whole library for the same reason the
 * bulk rebrand is: "all of them" is rarely what anyone means, and the project
 * filters already express "this week's batch" perfectly well.
 *
 * It is slow and it says so. Each deck is a full headless render of up to ten
 * pages plus an upload each, so twenty carousels is minutes — which is fine, and
 * is still the fastest anyone has ever got from ten designs to a scheduler-ready
 * sheet. What is not fine is a spinner with no numbers on it, so there are
 * numbers on it.
 */
import { Check, Table, X } from "lucide-react";
import { useState } from "react";

import { Chip } from "./Dash.js";
import { loadDoc } from "./storage.js";
import { resolveDocAssets } from "./library.js";
import type { Doc } from "./model.js";
import { PLATFORMS, platformForSize, type Platform } from "./platforms.js";
import { downloadText, publishDecks, type BatchProgress } from "./publish.js";
import { buildSheet, SCHEDULERS, type Scheduler } from "./schedulers.js";
import { hasCloudSession, sessionUserId } from "./session.js";

type Phase =
  | { at: "idle" }
  | { at: "working"; progress: BatchProgress }
  | { at: "done"; rows: number; slides: number; filename: string; problems: string[] }
  | { at: "failed"; error: string };

export function PublishBatch({ ids, onClose }: { ids: readonly string[]; onClose: () => void }) {
  const [scheduler, setScheduler] = useState<Scheduler>(() => SCHEDULERS[0]!);
  const [platform, setPlatform] = useState<Platform>(() => PLATFORMS[0]!);
  const [phase, setPhase] = useState<Phase>({ at: "idle" });

  const canPublish = hasCloudSession();

  const run = async () => {
    const userId = sessionUserId();
    if (!userId) {
      setPhase({ at: "failed", error: "Publishing needs an account. Sign in and try again." });
      return;
    }

    setPhase({ at: "working", progress: { done: 0, total: ids.length, name: "" } });

    // Loaded and resolved up front. A stored document carries asset references
    // rather than files, and the renderer is handed a page that must not need
    // the network — so the URLs have to exist before the first render starts.
    const docs: Doc[] = [];
    for (const id of ids) {
      const doc = loadDoc(id);
      if (doc) docs.push(await resolveDocAssets(doc));
    }

    if (docs.length === 0) {
      setPhase({ at: "failed", error: "None of those projects could be opened." });
      return;
    }

    const result = await publishDecks(docs, platform, userId, (progress) =>
      setPhase({ at: "working", progress }),
    );

    if (result.published.length === 0) {
      setPhase({
        at: "failed",
        error: result.failures[0]?.error ?? "Nothing could be published.",
      });
      return;
    }

    const sheet = buildSheet(scheduler, result.published);
    downloadText(sheet.filename, sheet.csv);

    setPhase({
      at: "done",
      rows: result.published.length,
      slides: result.published.reduce((n, c) => n + c.urls.length, 0),
      filename: sheet.filename,
      problems: [
        ...sheet.warnings,
        ...result.failures.map((f) => `"${f.name}" could not be published: ${f.error}`),
      ],
    });
  };

  const busy = phase.at === "working";

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={busy ? undefined : onClose} />

      <div className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[600px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <span className="text-title text-primary">Publish for scheduling</span>
          <Chip>{ids.length} carousels</Chip>
          <div className="flex-1" />
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-primary disabled:opacity-40"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </header>

        <div className="scroll-quiet flex-1 overflow-y-auto p-5">
          <span className="text-overline uppercase text-tertiary">Rendered for</span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p)}
                className={[
                  "rounded-2xl border p-2.5 text-left",
                  p.id === platform.id
                    ? "border-accent-dim bg-accent-wash"
                    : "border-hairline bg-surface-1 hover:border-surface-5",
                ].join(" ")}
              >
                <div className="text-body-strong text-primary">{p.label}</div>
                <div className="text-caption text-muted">
                  {p.w}×{p.h} · {p.imageFormat.toUpperCase()}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5">
            <span className="text-overline uppercase text-tertiary">Sheet for</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {SCHEDULERS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScheduler(s)}
                  className={[
                    "rounded-2xl border p-2.5 text-left",
                    s.id === scheduler.id
                      ? "border-accent-dim bg-accent-wash"
                      : "border-hairline bg-surface-1 hover:border-surface-5",
                  ].join(" ")}
                >
                  <div className="text-body-strong text-primary">{s.label}</div>
                  <div className="mt-1 text-caption leading-4 text-muted">{s.note}</div>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-4 text-caption leading-4 text-muted">
            Slides are hosted at public URLs so the scheduler can fetch them. Anyone with a link can
            see that slide — which is what publishing means, and what every importer requires.
          </p>

          {phase.at === "working" ? (
            <div className="mt-4 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
              <div className="text-body text-primary">
                {phase.progress.done} of {phase.progress.total} published
              </div>
              <div className="mt-1 truncate text-caption text-tertiary">
                {phase.progress.name || "Finishing up"}
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full bg-accent"
                  style={{
                    width: `${Math.round((phase.progress.done / Math.max(1, phase.progress.total)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {phase.at === "done" ? (
            <div className="mt-4 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <Check size={14} strokeWidth={2.4} className="shrink-0 text-success" />
                <span className="text-body text-primary">
                  {phase.rows} rows, {phase.slides} slides hosted. {phase.filename} saved.
                </span>
              </div>
              {phase.problems.map((p) => (
                <p key={p} className="mt-1.5 text-caption leading-4 text-tertiary">
                  {p}
                </p>
              ))}
            </div>
          ) : null}

          {phase.at === "failed" ? (
            <p className="mt-4 rounded-2xl border border-danger-dim bg-danger-wash px-3.5 py-3 text-body text-danger">
              {phase.error}
            </p>
          ) : null}
        </div>

        <footer className="flex h-16 shrink-0 items-center gap-2 border-t border-hairline px-5">
          <span className="flex-1 text-caption text-muted">
            {canPublish
              ? "Import the CSV with no edits. The URLs are already in it."
              : "Publishing needs an account."}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex h-9 items-center rounded-xl border border-hairline px-3.5 text-body text-secondary hover:text-primary disabled:opacity-40"
          >
            Close
          </button>
          <button
            type="button"
            disabled={busy || !canPublish}
            onClick={() => void run()}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className={[
              "flex h-9 items-center gap-1.5 rounded-xl px-4 text-body-strong",
              busy || !canPublish ? "pointer-events-none opacity-50" : "hover:brightness-110",
            ].join(" ")}
          >
            <Table size={14} strokeWidth={2.4} />
            {busy ? "Working…" : `Publish ${ids.length}`}
          </button>
        </footer>
      </div>
    </>
  );
}
