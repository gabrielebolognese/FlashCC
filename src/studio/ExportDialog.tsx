/**
 * Choose a platform, see what is wrong, get a file.
 *
 * The check runs before the export rather than after, because every problem it
 * finds is invisible at design time and expensive afterwards — a 14pt caption
 * looks fine at 100% zoom and turns to mush once LinkedIn recompresses it, and a
 * twenty-slide Instagram carousel looks fine right up until no scheduler will
 * publish it.
 *
 * Blocking findings block. Warnings do not: they are judgement calls, and a tool
 * that refuses to export because a stroke is 1px is a tool people route around.
 */
import { AlertTriangle, Check, Download, FileDown, Images, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Chip } from "./Dash.js";
import { exportDeck } from "./exporter.js";
import type { Doc } from "./model.js";
import { PLATFORMS, platformForSize, type Platform } from "./platforms.js";
import { blockers, canExport, preflight, sizeFinding, type Finding } from "./preflight.js";

type Phase =
  | { at: "idle" }
  | { at: "working" }
  | { at: "done"; filename: string; size: Finding | null }
  | { at: "failed"; error: string };

export function ExportDialog({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  // Default to whatever matches the artboard, so the common case needs no choice.
  const [platform, setPlatform] = useState<Platform>(
    () => platformForSize(doc.width, doc.height) ?? PLATFORMS[0]!,
  );
  const [phase, setPhase] = useState<Phase>({ at: "idle" });

  const findings = useMemo(() => preflight(doc, platform), [doc, platform]);
  const fatal = blockers(findings);
  const warnings = findings.filter((f) => f.severity === "warn");
  const ready = canExport(findings);

  const run = async () => {
    setPhase({ at: "working" });
    const result = await exportDeck(doc, platform);
    setPhase(
      result.ok
        ? { at: "done", filename: result.filename, size: sizeFinding(result.bytes, platform) }
        : { at: "failed", error: result.error },
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[620px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <span className="text-title text-primary">Export</span>
          <Chip>{doc.slides.length} slides</Chip>
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
          <span className="text-overline uppercase text-tertiary">Where is it going</span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPlatform(p);
                  setPhase({ at: "idle" });
                }}
                className={[
                  "rounded-2xl border p-3 text-left",
                  p.id === platform.id
                    ? "border-accent-dim bg-accent-wash"
                    : "border-hairline bg-surface-1 hover:border-surface-5",
                ].join(" ")}
              >
                <div className="flex items-center gap-1.5">
                  {p.output === "pdf" ? (
                    <FileDown size={13} strokeWidth={2} className="text-tertiary" />
                  ) : (
                    <Images size={13} strokeWidth={2} className="text-tertiary" />
                  )}
                  <span className="text-body-strong text-primary">{p.label}</span>
                </div>
                <div className="mt-1 text-caption text-tertiary">
                  {p.w}×{p.h}
                </div>
                <div className="text-caption text-muted">
                  {p.output === "pdf" ? "PDF document" : `${p.imageFormat.toUpperCase()} in a zip`}
                </div>
              </button>
            ))}
          </div>

          <p className="mt-2.5 text-caption leading-4 text-muted">{platform.note}</p>

          {/* ── what the check found ── */}
          <div className="mt-5">
            <div className="flex items-center gap-2">
              <span className="text-overline uppercase text-tertiary">Before it goes</span>
              {findings.length === 0 ? (
                <Chip tone="success">All clear</Chip>
              ) : (
                <>
                  {fatal.length > 0 ? <Chip tone="danger">{fatal.length} to fix</Chip> : null}
                  {warnings.length > 0 ? <Chip>{warnings.length} to check</Chip> : null}
                </>
              )}
            </div>

            {findings.length === 0 ? (
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
                <Check size={14} strokeWidth={2.4} className="shrink-0 text-success" />
                <span className="text-body text-secondary">
                  Nothing here will surprise you after you post it.
                </span>
              </div>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {[...fatal, ...warnings].map((f, i) => (
                  <li
                    key={`${f.code}-${f.slide}-${i}`}
                    className={[
                      "flex items-start gap-2 rounded-xl border px-3 py-2",
                      f.severity === "block"
                        ? "border-danger-dim bg-danger-wash"
                        : "border-hairline bg-surface-1",
                    ].join(" ")}
                  >
                    <AlertTriangle
                      size={12}
                      strokeWidth={2.2}
                      className={[
                        "mt-0.5 shrink-0",
                        f.severity === "block" ? "text-danger" : "text-tertiary",
                      ].join(" ")}
                    />
                    <span className="min-w-0 flex-1 text-caption leading-4 text-secondary">
                      {f.message}
                    </span>
                    {f.slide === null ? null : (
                      <span className="shrink-0 text-caption text-muted">Slide {f.slide}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {phase.at === "done" ? (
            <div className="mt-4 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <Check size={14} strokeWidth={2.4} className="shrink-0 text-success" />
                <span className="text-body text-primary">Saved {phase.filename}</span>
              </div>
              {phase.size ? (
                <p className="mt-1.5 text-caption leading-4 text-tertiary">{phase.size.message}</p>
              ) : null}
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
            {ready
              ? platform.output === "pdf"
                ? "One PDF, one slide per page."
                : `Numbered ${platform.imageFormat.toUpperCase()} files in a zip, in order.`
              : "Fix the red ones first."}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center rounded-xl border border-hairline px-3.5 text-body text-secondary hover:text-primary"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!ready || phase.at === "working"}
            onClick={() => void run()}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className={[
              "flex h-9 items-center gap-1.5 rounded-xl px-4 text-body-strong",
              !ready || phase.at === "working"
                ? "pointer-events-none opacity-50"
                : "hover:brightness-110",
            ].join(" ")}
          >
            <Download size={14} strokeWidth={2.4} />
            {phase.at === "working" ? "Rendering…" : `Export for ${platform.label}`}
          </button>
        </footer>
      </div>
    </>
  );
}
