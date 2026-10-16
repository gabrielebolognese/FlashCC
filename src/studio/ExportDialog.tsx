/**
 * Choose a platform, see what is wrong, get a file.
 *
 * The check runs before the export rather than after, because every problem it
 * finds is invisible at design time and expensive afterwards, a 14pt caption
 * looks fine at 100% zoom and turns to mush once LinkedIn recompresses it, and a
 * twenty-slide Instagram carousel looks fine right up until no scheduler will
 * publish it.
 *
 * Blocking findings block. Warnings do not: they are judgement calls, and a tool
 * that refuses to export because a stroke is 1px is a tool people route around.
 *
 * There are two ways out of here, and they are genuinely different jobs. DOWNLOAD
 * hands you a file to upload by hand. PUBLISH hosts the rendered slides and gives
 * you a CSV row that already knows their URLs, which is the half of the bulk
 * pipeline no scheduler provides and every scheduler requires.
 */
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileDown,
  Images,
  Link2,
  RefreshCw,
  Sparkles,
  Table,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { altFile, writeAlt, writeCaption } from "./caption.js";
import { ContactSheet, type SheetColumn } from "./ContactSheet.js";
import { Chip } from "./Dash.js";
import {
  destinationFolder,
  destinationFor,
  destinationLabel,
  gridNeighbours,
  keepAsCarousel,
  postGroups,
  postLines,
  togglePick,
  variantFor,
  type Destination,
} from "./destinations.js";
import { exportDeck, renderFile, saveBlob } from "./exporter.js";
import { GridPreview } from "./GridPreview.js";
import { uid, type Doc } from "./model.js";
import { bundleZip, threadZip, zipBlob } from "./packing.js";
import { listPosts } from "./pipeline.js";
import { PLATFORMS, platformForSize, type Platform } from "./platforms.js";
import { blockers, canExport, preflight, sizeFinding, type Finding } from "./preflight.js";
import { downloadText, publishDeck } from "./publish.js";
import {
  buildSheet,
  isSchedulable,
  SCHEDULERS,
  type PublishedCarousel,
  type Scheduler,
} from "./schedulers.js";
import { hasCloudSession, sessionPlan, sessionUserId } from "./session.js";
import { saveDoc } from "./storage.js";
import { deckTexts } from "./transcript.js";
import { snapshot } from "./versions.js";

type Phase =
  | { at: "idle" }
  | { at: "working"; label?: string | undefined }
  | { at: "done"; filename: string; size: Finding | null; note?: string | undefined }
  | { at: "failed"; error: string };

type PublishPhase =
  | { at: "idle" }
  | { at: "working" }
  | { at: "done"; carousel: PublishedCarousel; warnings: string[]; filename: string }
  | { at: "failed"; error: string };

/** Filesystem-safe, matching the server's own slug for the single-file path. */
const slug = (name: string): string =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
  "carousel";

export function ExportDialog({
  doc,
  onAlt,
  onClose,
}: {
  doc: Doc;
  onAlt: (index: number, text: string) => void;
  onClose: () => void;
}) {
  // Default to whatever matches the artboard, so the common case needs no choice.
  const [dests, setDests] = useState<Destination[]>(() => [
    destinationFor(platformForSize(doc.width, doc.height) ?? PLATFORMS[0]!, doc),
  ]);
  /**
   * Several at once (17.5). A mode rather than a second dialog, because the
   * question is the same one, "where is it going", with more than one answer.
   */
  const [multi, setMulti] = useState(false);
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const [scheduler, setScheduler] = useState<Scheduler>(() => SCHEDULERS[0]!);
  const [publishing, setPublishing] = useState<PublishPhase>({ at: "idle" });
  /** Per-post lines a thread destination's user wrote or asked for, by folder. */
  const [lines, setLines] = useState<Record<string, string[]>>({});

  const canPublish = hasCloudSession();

  const current = dests[0]!;
  const platform = current.platform;

  // Each destination's copy of the deck, in memory. Nothing is saved unless a
  // "Keep as carousel" box is ticked, see destinations.ts.
  const columns = useMemo<SheetColumn[]>(
    () =>
      dests.map((d) => {
        const variant = variantFor(doc, d);
        return { destination: d, variant, findings: preflight(variant, d.platform) };
      }),
    [doc, dests],
  );

  const variant = columns[0]!.variant;
  const findings = columns[0]!.findings;
  const fatal = blockers(findings);
  const warnings = findings.filter((f) => f.severity === "warn");
  const ready = multi ? columns.every((c) => canExport(c.findings)) : canExport(findings);

  /** The lines that ship with a thread: the user's, or the ones the slides give. */
  const linesFor = (d: Destination, v: Doc): string[] => {
    if (!d.platform.perPost) return [];
    const groups = postGroups(v.slides.length, d.platform.perPost);
    const own = lines[destinationFolder(d)];
    return own && own.length === groups.length ? own : postLines(v, groups, d.platform.id);
  };

  const pick = (p: Platform) => {
    setPhase({ at: "idle" });
    setPublishing({ at: "idle" });
    if (!multi) {
      setDests([destinationFor(p, doc)]);
      return;
    }
    setDests((all) => {
      const has = all.some((d) => d.platform.id === p.id);
      if (!has) return [...all, destinationFor(p, doc)];
      // Never empty: the last destination stays until another is chosen.
      return all.length > 1 ? all.filter((d) => d.platform.id !== p.id) : all;
    });
  };

  const patch = (i: number, next: Partial<Destination>) => {
    setPhase({ at: "idle" });
    setDests((all) => all.map((d, k) => (k === i ? { ...d, ...next } : d)));
  };

  /**
   * Render, host, and hand over the row.
   *
   * The CSV downloads as part of the same press rather than behind a second
   * button. The URLs are the deliverable and a file the person has to go and
   * fetch is a file they will not fetch.
   */
  const publish = async () => {
    const userId = sessionUserId();
    if (!userId) {
      setPublishing({ at: "failed", error: "Publishing needs an account. Sign in and try again." });
      return;
    }

    setPublishing({ at: "working" });
    // The destination's copy, with the source's id so republishing replaces.
    const result = await publishDeck({ ...variant, id: doc.id }, platform, userId);
    if (!result.ok) {
      setPublishing({ at: "failed", error: result.error });
      return;
    }

    const sheet = buildSheet(scheduler, [result.carousel]);
    downloadText(sheet.filename, sheet.csv);
    setPublishing({
      at: "done",
      carousel: result.carousel,
      warnings: sheet.warnings,
      filename: sheet.filename,
    });
  };

  const run = async () => {
    // Taken before the render rather than after it: the point of an export
    // snapshot is "this is what I sent out", and the deck cannot change during
    // a render anyway, so the earlier call is the one that cannot be missed by
    // a failure halfway through.
    snapshot(doc, "export", sessionPlan(), `Exported for ${destinationLabel(current)}`);
    setPhase({ at: "working" });

    const perPost = platform.perPost;
    const threadLines = linesFor(current, variant);
    const result = await exportDeck(
      variant,
      platform,
      perPost
        ? async (file) => ({
            filename: file.filename,
            blob: await zipBlob(await threadZip(file.blob, perPost, threadLines)),
          })
        : undefined,
    );
    setPhase(
      result.ok
        ? { at: "done", filename: result.filename, size: sizeFinding(result.bytes, platform) }
        : { at: "failed", error: result.error },
    );
  };

  /**
   * Every destination, one zip. One at a time, for the reason `publishDecks`
   * gives: each is a headless render, and firing them together is how a render
   * server falls over. A destination that fails is named and the rest still
   * ship, the Batch 4.4 rule.
   */
  const runAll = async () => {
    const labels = columns.map((c) => destinationLabel(c.destination)).join(", ");
    snapshot(doc, "export", sessionPlan(), `Exported for ${labels}`);

    const files: Parameters<typeof bundleZip>[0][number][] = [];
    const failed: string[] = [];

    for (const c of columns) {
      setPhase({ at: "working", label: destinationLabel(c.destination) });
      const file = await renderFile(c.variant, c.destination.platform);
      if (!file.ok) {
        failed.push(`${destinationLabel(c.destination)}: ${file.error}`);
        continue;
      }
      files.push({
        destination: c.destination,
        filename: file.filename,
        blob: file.blob,
        lines: linesFor(c.destination, c.variant),
      });
    }

    if (files.length === 0) {
      setPhase({ at: "failed", error: failed.join(" ") });
      return;
    }

    // Saved only when asked, and only once the render worked.
    const now = new Date().toISOString();
    let kept = 0;
    for (const c of columns) {
      if (!c.destination.keep || !files.some((f) => f.destination === c.destination)) continue;
      saveDoc(keepAsCarousel(c.variant, doc, c.destination, uid("d"), now));
      kept += 1;
    }

    const filename = `${slug(doc.name)}-${files.length}-destinations.zip`;
    saveBlob(await zipBlob(await bundleZip(files)), filename);

    const notes = [
      kept > 0 ? `${kept} saved as separate carousel${kept === 1 ? "" : "s"}.` : "",
      failed.length > 0 ? `Not included: ${failed.join(" ")}` : "",
    ].filter(Boolean);
    setPhase({ at: "done", filename, size: null, note: notes.join(" ") || undefined });
  };

  const instagram = columns.find((c) => c.destination.platform.id === "instagram");
  const neighbours = useMemo(
    () => (instagram ? gridNeighbours(listPosts(), doc.id) : []),
    [instagram, doc.id],
  );

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[680px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal">
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
          <div className="flex items-center gap-2">
            <span className="text-overline uppercase text-tertiary">Where is it going</span>
            <div className="flex-1" />
            <label className="flex h-7 items-center gap-1.5 text-caption text-tertiary">
              <input
                type="checkbox"
                checked={multi}
                onChange={(e) => {
                  setMulti(e.target.checked);
                  setPhase({ at: "idle" });
                  // Back to one: keep the first, which is what the single view shows.
                  if (!e.target.checked) setDests((all) => all.slice(0, 1));
                }}
              />
              Several at once
            </label>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {PLATFORMS.map((p) => {
              const on = dests.some((d) => d.platform.id === p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p)}
                  className={[
                    "rounded-2xl border p-3 text-left",
                    on
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
                    {p.shapes.map((s) => s.label).join(" · ")}
                  </div>
                  <div className="text-caption text-muted">
                    {p.output === "pdf"
                      ? "PDF document"
                      : p.perPost
                        ? `Posts of ${p.perPost}`
                        : `Up to ${p.maxSlides} ${p.imageFormat.toUpperCase()}s`}
                  </div>
                </button>
              );
            })}
          </div>

          {multi ? null : <p className="mt-2.5 text-caption leading-4 text-muted">{platform.note}</p>}

          {/* ── per destination: the shape, the pick, the posts ── */}
          <div className="mt-3 flex flex-col gap-2">
            {columns.map((c, i) => (
              <DestinationRow
                key={c.destination.platform.id}
                doc={doc}
                column={c}
                showLabel={multi}
                lines={linesFor(c.destination, c.variant)}
                onPatch={(next) => patch(i, next)}
                onLines={(next) => setLines((all) => ({ ...all, [destinationFolder(c.destination)]: next }))}
              />
            ))}
          </div>

          {multi ? (
            <div className="mt-5">
              <div className="flex items-center gap-2">
                <span className="text-overline uppercase text-tertiary">Contact sheet</span>
                <span className="text-caption text-muted">
                  Each column is that destination&rsquo;s copy. Nothing is saved unless you tick it.
                </span>
              </div>
              <ContactSheet columns={columns} onKeep={(i, keep) => patch(i, { keep })} />
            </div>
          ) : (
            <>
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

              {/* ── publish for a scheduler ── */}
              {isSchedulable(platform.id) ? (
                <div className="mt-5 border-t border-hairline pt-5">
                  <div className="flex items-center gap-2">
                    <span className="text-overline uppercase text-tertiary">Straight into a scheduler</span>
                    <Chip>No manual uploading</Chip>
                  </div>

                  <p className="mt-2 text-caption leading-4 text-muted">
                    Every bulk importer wants public image URLs and none of them host the images. This
                    hosts your rendered slides and fills the row in for you.
                  </p>

                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    {SCHEDULERS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setScheduler(s);
                          setPublishing({ at: "idle" });
                        }}
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

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!ready || !canPublish || publishing.at === "working"}
                      onClick={() => void publish()}
                      className={[
                        "flex h-8 items-center gap-1.5 rounded-xl border border-hairline px-3.5 text-body-strong text-secondary",
                        !ready || !canPublish || publishing.at === "working"
                          ? "pointer-events-none opacity-50"
                          : "hover:border-accent-dim hover:text-accent",
                      ].join(" ")}
                    >
                      <Table size={14} strokeWidth={2.2} />
                      {publishing.at === "working"
                        ? "Rendering and hosting…"
                        : `Publish and get the ${scheduler.label} CSV`}
                    </button>
                    {!canPublish ? (
                      <span className="text-caption text-muted">Needs an account.</span>
                    ) : null}
                  </div>

                  {publishing.at === "done" ? (
                    <div className="mt-3 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
                      <div className="flex items-center gap-2">
                        <Check size={14} strokeWidth={2.4} className="shrink-0 text-success" />
                        <span className="text-body text-primary">
                          {publishing.carousel.urls.length} slides hosted, {publishing.filename} saved
                        </span>
                      </div>
                      <div className="mt-2 flex items-start gap-2">
                        <Link2 size={12} strokeWidth={2} className="mt-1 shrink-0 text-muted" />
                        <code className="min-w-0 flex-1 truncate font-mono text-caption text-tertiary">
                          {publishing.carousel.urls[0]}
                        </code>
                      </div>
                      {publishing.warnings.map((w) => (
                        <p key={w} className="mt-1.5 text-caption leading-4 text-tertiary">
                          {w}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {publishing.at === "failed" ? (
                    <p className="mt-3 rounded-2xl border border-danger-dim bg-danger-wash px-3.5 py-3 text-body text-danger">
                      {publishing.error}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-5 border-t border-hairline pt-5 text-caption leading-4 text-muted">
                  The scheduler CSVs cover LinkedIn, Instagram and TikTok. None of their importers
                  has a column for {platform.label} yet, so this one goes out as files.
                </p>
              )}
            </>
          )}

          {phase.at === "done" ? (
            <div className="mt-4 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <Check size={14} strokeWidth={2.4} className="shrink-0 text-success" />
                <span className="text-body text-primary">Saved {phase.filename}</span>
              </div>
              {phase.size ? (
                <p className="mt-1.5 text-caption leading-4 text-tertiary">{phase.size.message}</p>
              ) : null}
              {phase.note ? (
                <p className="mt-1.5 text-caption leading-4 text-tertiary">{phase.note}</p>
              ) : null}
            </div>
          ) : null}

          {phase.at === "failed" ? (
            <p className="mt-4 rounded-2xl border border-danger-dim bg-danger-wash px-3.5 py-3 text-body text-danger">
              {phase.error}
            </p>
          ) : null}

          {instagram ? (
            <GridPreview
              cover={instagram.variant.slides[0]}
              w={instagram.variant.width}
              h={instagram.variant.height}
              neighbours={neighbours}
              userId={canPublish ? sessionUserId() : null}
            />
          ) : null}

          {multi ? null : <AltText doc={doc} platform={platform} onChange={onAlt} />}
        </div>

        <footer className="flex h-16 shrink-0 items-center gap-2 border-t border-hairline px-5">
          <span className="flex-1 text-caption text-muted">
            {!ready
              ? "Fix the red ones first."
              : multi
                ? "One zip, a folder per destination."
                : platform.output === "pdf"
                  ? "One PDF, one slide per page."
                  : platform.perPost
                    ? `A folder per post, ${platform.perPost} images each, in order.`
                    : `Numbered ${platform.imageFormat.toUpperCase()} files in a zip, in order.`}
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
            onClick={() => void (multi ? runAll() : run())}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className={[
              "flex h-9 items-center gap-1.5 rounded-xl px-4 text-body-strong",
              !ready || phase.at === "working"
                ? "pointer-events-none opacity-50"
                : "hover:brightness-110",
            ].join(" ")}
          >
            <Download size={14} strokeWidth={2.4} />
            {phase.at === "working"
              ? phase.label
                ? `Rendering ${phase.label}…`
                : "Rendering…"
              : multi
                ? `Export ${dests.length} destination${dests.length === 1 ? "" : "s"}`
                : `Export for ${destinationLabel(current)}`}
          </button>
        </footer>
      </div>
    </>
  );
}

/**
 * What one destination needs decided, and only that.
 *
 * Most destinations need nothing, and then this draws nothing: no shape row
 * for a platform with one shape, no pick for a deck that already fits, no
 * posts for a platform with a carousel. The dialog stays as quiet as the
 * destination allows.
 */
function DestinationRow({
  doc,
  column,
  showLabel,
  lines,
  onPatch,
  onLines,
}: {
  doc: Doc;
  column: SheetColumn;
  showLabel: boolean;
  lines: string[];
  onPatch: (next: Partial<Destination>) => void;
  onLines: (next: string[]) => void;
}) {
  const { destination: d, variant } = column;
  const p = d.platform;
  const shapes = p.shapes.length > 1;
  const picking = p.keep !== undefined && d.picked !== undefined && doc.slides.length > p.keep;
  const groups = p.perPost ? postGroups(variant.slides.length, p.perPost) : [];
  const thread = groups.length > 1;

  const [asking, setAsking] = useState<"idle" | "working" | "failed">("idle");
  const [error, setError] = useState("");

  if (!shapes && !picking && !thread) return null;

  const ask = () => {
    setAsking("working");
    writeCaption({
      deck: deckTexts(variant),
      platform: p.id === "bluesky" ? "bluesky" : "x",
      count: 1,
      posts: groups.map((g) => g.length),
    })
      .then((result) => {
        if (result.lines) onLines(result.lines);
        setAsking("idle");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not write the lines");
        setAsking("failed");
      });
  };

  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-3">
      {showLabel ? <div className="mb-1.5 text-body-strong text-secondary">{p.label}</div> : null}

      {shapes ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-14 text-caption text-muted">Shape</span>
          {p.shapes.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onPatch({ shape: s })}
              title={s.api === false ? "Posts from the app; the publishing API refuses it" : undefined}
              className={[
                "h-7 rounded-md border px-2.5 text-caption",
                s.w === d.shape.w && s.h === d.shape.h
                  ? "border-accent text-accent"
                  : "border-hairline text-tertiary hover:text-primary",
              ].join(" ")}
            >
              {s.label}
              {s.api === false ? " · app only" : ""}
            </button>
          ))}
          {d.shape.w !== doc.width || d.shape.h !== doc.height ? (
            <span className="ml-1 text-caption text-muted">Reflowed from {doc.width}×{doc.height}</span>
          ) : null}
        </div>
      ) : null}

      {picking ? (
        <div className={shapes ? "mt-2" : ""}>
          <div className="flex flex-wrap items-center gap-1">
            <span className="w-14 text-caption text-muted">Slides</span>
            {doc.slides.map((s, i) => {
              const on = d.picked!.includes(i);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPatch({ picked: togglePick(d.picked!, i, p.keep!, p.minSlides ?? 1) })}
                  className={[
                    "h-7 w-7 rounded-md border text-caption",
                    on ? "border-accent text-accent" : "border-hairline text-muted hover:text-primary",
                  ].join(" ")}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-caption leading-4 text-muted">
            {p.label} takes {p.keep}. These are the hook, the next slides in order, and the last one.
            Click to swap any of them.
          </p>
        </div>
      ) : null}

      {thread ? (
        <div className={shapes || picking ? "mt-2" : ""}>
          <div className="flex items-center gap-2">
            <span className="text-caption text-muted">
              {variant.slides.length} slides go out as {groups.length} posts:{" "}
              {groups.map((g) => g.length).join(", ")}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              disabled={asking === "working"}
              onClick={ask}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-caption text-tertiary hover:border-accent-dim hover:text-accent disabled:pointer-events-none disabled:opacity-40"
            >
              {asking === "working" ? (
                <RefreshCw size={12} strokeWidth={2} className="fcc-spin" />
              ) : (
                <Sparkles size={12} strokeWidth={2} />
              )}
              Write the lines
            </button>
          </div>
          <div className="mt-1.5 flex flex-col gap-1">
            {lines.map((line, i) => (
              <input
                key={i}
                value={line}
                onChange={(e) => onLines(lines.map((l, k) => (k === i ? e.target.value : l)))}
                className="h-7 rounded-md border border-hairline bg-surface-2 px-2 text-caption text-primary outline-none focus:border-accent-dim"
              />
            ))}
          </div>
          {asking === "failed" ? (
            <p className="mt-1.5 text-caption leading-4 text-danger">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Alt text, and an honest account of where it can actually go.
 *
 * **It has no automatic destination and pretending otherwise would be the
 * dishonest part of this feature.** It cannot be embedded in a JPEG in a way any
 * of these platforms reads, and none of them has an API to push it to. A person
 * types it into the upload form.
 *
 * What differs is whether there is a form at all:
 *
 * - Instagram takes per-image alt text on a carousel, under Advanced Settings.
 *   The export is a zip, so the text travels with the images as `alt.txt`,
 *   numbered to match.
 * - TikTok is the same shape of export and the same file.
 * - **LinkedIn is a document post: one PDF, no per-page alt field.** There is
 *   nowhere to put it, and the accessible answer there is the transcript in the
 *   first comment, which `PostSheet` already offers. This says so rather than
 *   offering a list that leads nowhere.
 *
 * (An older comment in `PostSheet` claimed per-slide alt text was impossible on
 * both platforms. That is right about LinkedIn and wrong about Instagram, which
 * is why this exists at all.)
 */
function AltText({
  doc,
  platform,
  onChange,
}: {
  doc: Doc;
  platform: Platform;
  onChange: (index: number, text: string) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "working" | "failed">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const written = doc.slides.filter((s) => (s.alt ?? "").trim()).length;
  const usable = platform.output === "images";

  const write = () => {
    setPhase("working");
    writeAlt(deckTexts(doc))
      .then((result) => {
        result.alt.forEach((t, i) => onChange(i, t));
        setPhase("idle");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not write alt text");
        setPhase("failed");
      });
  };

  return (
    <div className="mt-4 rounded-2xl border border-hairline bg-surface-1 p-3.5">
      <div className="flex items-center gap-2">
        <span className="text-body-strong text-secondary">Alt text</span>
        <span className="text-caption text-muted">
          {written}/{doc.slides.length} written
        </span>
        <div className="flex-1" />
        {written > 0 ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(altFile(doc.slides.map((s) => s.alt ?? "")));
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-caption text-tertiary hover:border-accent-dim hover:text-accent"
          >
            {copied ? <Check size={12} strokeWidth={2.4} /> : <Copy size={12} strokeWidth={2} />}
            {copied ? "Copied" : "Copy all"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={phase === "working"}
          onClick={write}
          className="flex h-7 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-caption text-tertiary hover:border-accent-dim hover:text-accent disabled:pointer-events-none disabled:opacity-40"
        >
          {phase === "working" ? (
            <RefreshCw size={12} strokeWidth={2} className="fcc-spin" />
          ) : (
            <Sparkles size={12} strokeWidth={2} />
          )}
          {written > 0 ? "Rewrite all" : "Write it"}
        </button>
      </div>

      <p className="mt-1.5 text-caption leading-4 text-muted">
        {usable
          ? `Ships as alt.txt inside the zip, numbered to match the images. ${platform.label} takes it per image when you upload.`
          : "A document post is one PDF and has no per-page alt field, so this is for your own reference. The accessible answer on LinkedIn is the transcript in the first comment."}
      </p>

      {phase === "failed" ? (
        <p className="mt-2 text-caption leading-4 text-danger">{error}</p>
      ) : null}

      {written > 0 ? (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {doc.slides.map((slide, i) => (
            <label key={slide.id} className="flex items-start gap-2">
              <span className="mt-1.5 w-5 shrink-0 text-right font-mono text-caption text-muted">
                {i + 1}
              </span>
              <input
                value={slide.alt ?? ""}
                onChange={(e) => onChange(i, e.target.value)}
                maxLength={ALT_LIMIT}
                placeholder="What this slide shows"
                className="h-7 flex-1 rounded-md border border-hairline bg-surface-2 px-2 text-caption text-primary outline-none placeholder:text-muted focus:border-accent-dim"
              />
              <span
                className={
                  (slide.alt ?? "").length > ALT_LIMIT
                    ? "mt-1.5 w-8 shrink-0 text-right font-mono text-caption text-danger"
                    : "mt-1.5 w-8 shrink-0 text-right font-mono text-caption text-muted"
                }
              >
                {(slide.alt ?? "").length}
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Where most screen readers cut off. Mirrored from the server's own ceiling. */
const ALT_LIMIT = 125;
