/**
 * The editor's side of a video render (26.5): start one, follow it, hear when
 * it is done, retry one that failed.
 *
 * A render is a job on the server, so this keeps the jobs it started in local
 * storage and follows them from there. That is what makes "never silently
 * lost" true from this end: a reload, a closed dialog, or a different screen
 * still knows the job exists, and a job the server has no record of at all
 * (a deploy whose disk did not survive) is reported failed here, with a retry
 * that sends the deck again, rather than spinning forever.
 *
 * One poller for the whole app, however many components are listening.
 */
import { useEffect, useState } from "react";

import { authHeader } from "./bearer.js";
import { videoPayload, type VideoPayload } from "./exporter.js";
import { readRefusal } from "./gate.js";
import type { Doc } from "./model.js";
import { motionOf, type MotionSettings } from "./motion.js";

export type VideoJobState = "queued" | "running" | "done" | "failed";

export type VideoJob = {
  id: string;
  token: string;
  state: VideoJobState;
  progress: number;
  name: string;
  docId: string | null;
  target: string;
  seconds: number;
  animated: boolean;
  createdAt: number;
  url?: string | undefined;
  error?: string | undefined;
  /** The server has no record of it: retry re-sends the deck. */
  lost?: boolean | undefined;
  /** Shown once in the toast; set when the user has seen the result. */
  seen?: boolean | undefined;
};

const KEY = "flashcc.videoJobs";
const KEEP = 20;
const POLL_MS = 1500;

/** The settings of the last render of each deck, so a lost job can be sent again as it was. */
const SETTINGS_KEY = "flashcc.videoSettings";

let jobs: VideoJob[] = read();
const listeners = new Set<(jobs: VideoJob[]) => void>();

function read(): VideoJob[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as VideoJob[]) : [];
  } catch {
    return [];
  }
}

function write(next: VideoJob[]): void {
  jobs = next.slice(0, KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(jobs));
  } catch {
    /* Private mode: the jobs are followed for this tab only. */
  }
  for (const l of listeners) l(jobs);
  schedule();
}

const patch = (id: string, fields: Partial<VideoJob>): void => write(jobs.map((j) => (j.id === id ? { ...j, ...fields } : j)));

export const listVideoJobs = (): VideoJob[] => jobs;

const active = (j: VideoJob): boolean => j.state === "queued" || j.state === "running";

/** A server-relative file URL made absolute, so it can be pasted into a scheduler. */
export const absoluteUrl = (url: string): string => (url.startsWith("/") ? `${location.origin}${url}` : url);

/** Is the URL one a scheduler could fetch (hosted), or only this server's own file route? */
export const isHosted = (url: string | undefined): boolean => Boolean(url && /^https?:\/\//.test(url));

/* ── talking to the server ────────────────────────────────────────────────── */

async function headers(): Promise<Record<string, string>> {
  try {
    return await authHeader();
  } catch {
    // Signed out: a still slideshow renders anyway, like the PDF export.
    return { "Content-Type": "application/json" };
  }
}

async function post(payload: VideoPayload): Promise<{ ok: true; job: VideoJob } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch("/api/video", { method: "POST", headers: await headers(), body: JSON.stringify(payload) });
  } catch {
    return { ok: false, error: "Could not reach the export server. Is it running?" };
  }
  if (!response.ok) return { ok: false, error: (await readRefusal(response)).message };
  const job = (await response.json()) as VideoJob;
  write([{ ...job }, ...jobs.filter((j) => j.id !== job.id)]);
  return { ok: true, job };
}

export async function startVideo(doc: Doc, motion: MotionSettings, audio?: VideoPayload["audio"]) {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Record<string, MotionSettings>;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, [doc.id]: motion }));
  } catch {
    /* Only used to resend a lost job. */
  }
  return post(await videoPayload(doc, motion, audio));
}

/**
 * One click. A failed job the server still holds is queued again from its
 * stored deck; one it does not hold (or holds without its deck) is sent again
 * from the editor, which needs the deck: `load` finds it by id.
 */
export async function retryVideo(job: VideoJob, load: (docId: string) => Doc | null): Promise<{ ok: boolean; error?: string }> {
  if (!job.lost) {
    const response = await fetch("/api/video/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, token: job.token }),
    }).catch(() => null);
    if (response?.ok) {
      patch(job.id, { ...((await response.json()) as Partial<VideoJob>), seen: false });
      return { ok: true };
    }
    if (response && response.status !== 410 && response.status !== 404) return { ok: false, error: (await readRefusal(response)).message };
  }
  const doc = job.docId ? load(job.docId) : null;
  if (!doc) return { ok: false, error: "The deck this video came from is no longer here." };
  let motion: MotionSettings | undefined;
  try {
    motion = (JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Record<string, MotionSettings>)[doc.id];
  } catch {
    /* falls back to the deck's own settings */
  }
  const sent = await startVideo(doc, motion ?? motionOf(doc));
  if (!sent.ok) return sent;
  write(jobs.filter((j) => j.id !== job.id));
  return { ok: true };
}

export const dismissVideo = (id: string): void => patch(id, { seen: true });

export const forgetVideo = (id: string): void => write(jobs.filter((j) => j.id !== id));

/* ── the one poller ───────────────────────────────────────────────────────── */

let timer: number | null = null;

function schedule(): void {
  if (timer !== null || listeners.size === 0 || !jobs.some(active)) return;
  timer = window.setTimeout(() => {
    timer = null;
    void poll();
  }, POLL_MS);
}

async function poll(): Promise<void> {
  const open = jobs.filter(active);
  for (const job of open) {
    try {
      const response = await fetch(`/api/video?id=${encodeURIComponent(job.id)}&token=${encodeURIComponent(job.token)}`);
      if (response.status === 404) {
        patch(job.id, {
          state: "failed",
          lost: true,
          error: "The server has no record of this render; it may have restarted without its disk. Retry sends the deck again.",
        });
        continue;
      }
      if (!response.ok) continue;
      const next = (await response.json()) as VideoJob;
      patch(job.id, { state: next.state, progress: next.progress, url: next.url, error: next.error });
    } catch {
      /* Offline for a moment: the next tick asks again. */
    }
  }
  schedule();
}

/** Every job this browser started, live. */
export function useVideoJobs(): VideoJob[] {
  const [state, setState] = useState(jobs);
  useEffect(() => {
    listeners.add(setState);
    schedule();
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

/** The runtime as people read it: 0:34, 1:05. */
export const runtime = (seconds: number): string => {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
