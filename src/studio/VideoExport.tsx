/**
 * Export as video (Batch 26): the deck as a slideshow for Reels, TikTok,
 * Shorts, LinkedIn and X.
 *
 * Four choices and a timing strip, nothing more. There is no timeline: every
 * slide's duration comes from its words (`motion.ts`), each can be changed,
 * and the total runtime is always on screen. The render is a job on the
 * server, so this dialog can be closed while it runs; the app says when it is
 * done.
 */
import { Film, Music, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";
import { looksPaid } from "./gate.js";
import type { Doc } from "./model.js";
import {
  ANIMATIONS,
  formulaSeconds,
  FPS,
  motionOf,
  planVideo,
  slideFrames,
  TRANSITIONS,
  VIDEO_TARGETS,
  videoTarget,
  wordsOn,
  type MotionSettings,
} from "./motion.js";
import { downloadText } from "./publish.js";
import { buildSheet, isSchedulable, SCHEDULABLE, SCHEDULERS, type SchedulerId } from "./schedulers.js";
import { captionOf } from "./transcript.js";
import { loadDoc } from "./storage.js";
import { absoluteUrl, isHosted, retryVideo, runtime, startVideo, useVideoJobs, type VideoJob } from "./videojobs.js";

const chip = (on: boolean) =>
  [
    "flex h-7 items-center rounded-md border px-2.5 text-body",
    on ? "border-accent text-primary" : "border-hairline text-secondary hover:border-accent-dim hover:text-primary",
  ].join(" ");

/** Whether this server can render video at all. Read once from /api/health. */
function useVideoServer(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : {}))
      .then((b: { video?: boolean }) => live && setOk(Boolean(b.video)))
      .catch(() => live && setOk(false));
    return () => {
      live = false;
    };
  }, []);
  return ok;
}

function readAudio(file: File): Promise<{ base64: string; type: string; name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve({ base64: url.slice(url.indexOf(",") + 1), type: file.type || "audio/mpeg", name: file.name });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function VideoExport({
  doc,
  onMotion,
  onHold,
  onClose,
}: {
  doc: Doc;
  onMotion: (motion: MotionSettings) => void;
  onHold: (index: number, seconds: number | undefined) => void;
  onClose: () => void;
}) {
  const motion = motionOf(doc);
  const target = videoTarget(motion.target);
  const server = useVideoServer();
  const all = useVideoJobs();
  const mine = all.filter((j) => j.docId === doc.id);
  const [audio, setAudio] = useState<{ base64: string; type: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const n = doc.slides.length;
  const frames = doc.slides.map((s, i) => slideFrames(s, i, n));
  const plan = useMemo(() => planVideo(frames, motion.transition), [frames.join(","), motion.transition]);
  const sameShape = doc.width === target.w && doc.height === target.h;
  const animated = motion.animation !== "none";

  const set = (fields: Partial<MotionSettings>) => onMotion({ ...motion, ...fields });

  async function render() {
    setError(null);
    setSending(true);
    const sent = await startVideo(doc, motion, audio ? { base64: audio.base64, type: audio.type } : undefined);
    setSending(false);
    if (!sent.ok) setError(sent.error);
  }

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Export as video"
        className="fixed left-1/2 top-1/2 z-modal flex max-h-[88vh] w-[720px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <Film size={14} strokeWidth={2} className="text-tertiary" />
          <span className="flex-1 text-title text-primary">Export as video</span>
          <span className="text-caption text-tertiary" data-testid="video-runtime">
            {runtime(plan.seconds)} · {n} slides · {FPS} fps
          </span>
          <IconButton icon={X} label="Close" control onClick={onClose} />
        </header>

        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-5">
          <section className="mb-4">
            <h3 className="mb-2 text-caption uppercase tracking-[0.4px] text-tertiary">Shape</h3>
            <div className="flex flex-wrap gap-2">
              {VIDEO_TARGETS.map((t) => (
                <button key={t.id} type="button" data-control aria-pressed={t.id === target.id} className={chip(t.id === target.id)} onClick={() => set({ target: t.id })}>
                  {t.label} <span className="ml-1.5 text-caption text-muted">{t.w}×{t.h}</span>
                </button>
              ))}
            </div>
            {sameShape ? (
              <p className="mt-2 text-caption text-muted">The deck is already this shape, so it goes as it is.</p>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <button type="button" data-control aria-pressed={motion.fit === "reflow"} className={chip(motion.fit === "reflow")} onClick={() => set({ fit: "reflow" })}>
                  Reflow
                </button>
                <button type="button" data-control aria-pressed={motion.fit === "letterbox"} className={chip(motion.fit === "letterbox")} onClick={() => set({ fit: "letterbox" })}>
                  Letterbox
                </button>
                <span className="text-caption text-muted">
                  {motion.fit === "reflow"
                    ? `Re-laid for ${target.w}×${target.h}${target.platform ? ", clear of the platform's interface" : ""}. Your deck is not changed.`
                    : `Your ${doc.width}×${doc.height} slides as they are, centred on bands of the deck's colour.`}
                </span>
              </div>
            )}
          </section>

          <section className="mb-4">
            <h3 className="mb-2 text-caption uppercase tracking-[0.4px] text-tertiary">Between slides</h3>
            <div className="flex flex-wrap gap-2">
              {TRANSITIONS.map((t) => (
                <button key={t.id} type="button" data-control title={t.note} aria-pressed={t.id === motion.transition} className={chip(t.id === motion.transition)} onClick={() => set({ transition: t.id })}>
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="mb-4">
            <h3 className="mb-2 text-caption uppercase tracking-[0.4px] text-tertiary">On each slide</h3>
            <div className="flex flex-wrap gap-2">
              {ANIMATIONS.map((a) => (
                <button key={a.id} type="button" data-control title={a.note} aria-pressed={a.id === motion.animation} className={chip(a.id === motion.animation)} onClick={() => set({ animation: a.id })}>
                  {a.label}
                  {a.id !== "none" && !looksPaid() ? <span className="ml-1.5 text-caption text-accent">Pro</span> : null}
                </button>
              ))}
            </div>
            <p className="mt-2 text-caption text-muted">{ANIMATIONS.find((a) => a.id === motion.animation)?.note}.</p>
          </section>

          <section className="mb-4">
            <h3 className="mb-2 flex items-center text-caption uppercase tracking-[0.4px] text-tertiary">
              <span className="flex-1">Timing</span>
              <span className="normal-case tracking-normal text-muted">2s plus about 3.5 words a second, at most 6s; cover +0.5s, last slide +1s</span>
            </h3>
            <div className="grid grid-cols-6 gap-2" data-testid="timing-strip">
              {doc.slides.map((s, i) => {
                const formula = Math.round(formulaSeconds(wordsOn(s), i, n) * 10) / 10;
                const own = s.hold;
                return (
                  <label key={s.id} className="flex flex-col rounded-xl border border-hairline p-2">
                    <span className="text-caption text-tertiary">
                      {i + 1} · {wordsOn(s)} words
                    </span>
                    <span className="mt-1 flex items-center gap-1">
                      <input
                        type="number"
                        min={0.5}
                        max={30}
                        step={0.1}
                        aria-label={`Slide ${i + 1} seconds`}
                        value={own ?? formula}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          onHold(i, Number.isFinite(v) && v > 0 && Math.abs(v - formula) > 0.001 ? v : undefined);
                        }}
                        className={[
                          "h-7 w-full rounded-md border bg-surface-1 px-1.5 text-body outline-none focus:border-accent-dim",
                          own === undefined ? "border-edge text-secondary" : "border-accent-dim text-primary",
                        ].join(" ")}
                      />
                      {own === undefined ? null : (
                        <IconButton icon={RotateCcw} label={`Slide ${i + 1} back to ${formula}s`} control onClick={() => onHold(i, undefined)} />
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="mb-2">
            <h3 className="mb-2 text-caption uppercase tracking-[0.4px] text-tertiary">Sound</h3>
            <div className="flex items-center gap-2">
              {audio ? (
                <>
                  <Music size={14} strokeWidth={2} className="text-tertiary" />
                  <span className="truncate text-body text-primary">{audio.name}</span>
                  <button type="button" data-control className="h-7 rounded-md px-2 text-body text-tertiary hover:text-primary" onClick={() => setAudio(null)}>
                    Remove
                  </button>
                </>
              ) : (
                <label className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-hairline px-2.5 text-body text-secondary hover:border-accent-dim hover:text-primary">
                  <Music size={14} strokeWidth={2} />
                  Add a track
                  <input
                    type="file"
                    accept="audio/*"
                    aria-label="Sound track"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 20_000_000) return setError("That track is over 20 MB.");
                      void readAudio(f).then(setAudio);
                    }}
                  />
                </label>
              )}
              <span className="text-caption text-muted">
                Silent unless you add one. Use a track you have the rights to: the platforms mute what you do not. Faded out over the last second.
              </span>
            </div>
          </section>

          {mine.length ? (
            <section className="mt-4 border-t border-hairline pt-4">
              <h3 className="mb-2 text-caption uppercase tracking-[0.4px] text-tertiary">This deck&rsquo;s videos</h3>
              {mine.map((j) => (
                <JobRow key={j.id} job={j} doc={doc} />
              ))}
            </section>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-hairline p-3">
          <span className="flex-1 text-caption text-muted">
            {server === false
              ? "This server has no ffmpeg installed, so it cannot make videos. Images and PDF still export."
              : error ?? (animated ? "Animated video is part of Pro. A still slideshow is free." : "A still slideshow is free, with or without an account.")}
          </span>
          <Button hero control icon={Film} disabled={server === false || sending} onClick={() => void render()}>
            {sending ? "Sending" : `Render ${runtime(plan.seconds)} video`}
          </Button>
        </div>
      </div>
    </>
  );
}

/** One render: its progress, then its file, its link and its scheduler row. */
function JobRow({ job, doc }: { job: VideoJob; doc: Doc }) {
  const [scheduler, setScheduler] = useState<SchedulerId>("metricool");
  const shape = videoTarget(job.target);
  const [platform, setPlatform] = useState(shape.platform && isSchedulable(shape.platform as never) ? shape.platform : "tiktok");
  const url = job.url ? absoluteUrl(job.url) : null;
  return (
    <div className="mb-2 rounded-xl border border-hairline p-3" data-testid="video-job">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-body text-primary">
          {shape.label} · {runtime(job.seconds)}
          {job.animated ? " · animated" : ""}
        </span>
        <span className="text-caption text-tertiary">
          {job.state === "queued" ? "Waiting" : job.state === "running" ? `Rendering ${Math.round(job.progress * 100)}%` : job.state === "done" ? "Ready" : "Failed"}
        </span>
      </div>
      {job.state === "queued" || job.state === "running" ? (
        <div className="mt-2 h-1 overflow-hidden rounded bg-surface-3">
          <div className="h-full bg-accent" style={{ width: `${Math.round(job.progress * 100)}%` }} />
        </div>
      ) : null}
      {job.state === "failed" ? (
        <div className="mt-1 flex items-center gap-2">
          <p className="flex-1 text-caption text-muted">{job.error}</p>
          <button
            type="button"
            data-control
            className="flex h-7 items-center rounded-md border border-hairline px-2.5 text-body text-secondary hover:border-accent-dim hover:text-primary"
            onClick={() => void retryVideo(job, loadDoc)}
          >
            Retry
          </button>
        </div>
      ) : null}
      {job.state === "done" && url ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <video src={url} controls muted className="h-[120px] rounded-md bg-black" />
          <div className="flex flex-col gap-2">
            <a
              href={isHosted(job.url) ? url : `${url}&download=1`}
              download={`${job.name}.mp4`}
              className="flex h-7 items-center self-start rounded-md border border-hairline px-2.5 text-body text-secondary hover:border-accent-dim hover:text-primary"
            >
              Download .mp4
            </a>
            {isHosted(job.url) ? (
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Scheduler"
                  value={scheduler}
                  onChange={(e) => setScheduler(e.target.value as SchedulerId)}
                  className="h-7 rounded-md border border-edge bg-surface-1 px-1.5 text-body text-secondary"
                >
                  {SCHEDULERS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Post to"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="h-7 rounded-md border border-edge bg-surface-1 px-1.5 text-body text-secondary"
                >
                  {SCHEDULABLE.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-control
                  className="flex h-7 items-center rounded-md border border-hairline px-2.5 text-body text-secondary hover:border-accent-dim hover:text-primary"
                  onClick={() => {
                    const sheet = buildSheet(SCHEDULERS.find((s) => s.id === scheduler)!, [
                      {
                        id: job.id,
                        name: doc.name,
                        caption: captionOf(doc, { platform: platform as never }) || doc.name,
                        urls: [],
                        alts: [],
                        platform: platform as never,
                        scheduledFor: null,
                        videoUrl: url,
                      },
                    ]);
                    downloadText(sheet.filename, sheet.csv);
                  }}
                >
                  Scheduler CSV
                </button>
              </div>
            ) : (
              <span className="max-w-[300px] text-caption text-muted">
                Kept on this server for a week. Sign in on a server with storage to get a public link for a scheduler.
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
