/**
 * The video routes (26.5).
 *
 *   POST /api/video         queue a render, answer with the job at once
 *   GET  /api/video         one job's state, by id and token
 *   GET  /api/video/file    the finished file, when it is kept here
 *   POST /api/video/retry   a failed job, queued again
 *
 * **Who may render what.** A slideshow with nothing moving is free and, like
 * the PDF export, needs no account: it is the same pictures, held. Anything
 * that animates is Pro, checked here on the server because the choice is a
 * button anyone can edit. There are no credits and no counter of renders a
 * plan pays for (invariant 7); the ceilings below are about one script holding
 * the renderer, and say so.
 *
 * **Where the file goes.** For a signed-in account on a server with the secret
 * key, the public `slides` bucket, beside the deck's published slides, so the
 * URL goes straight into a scheduler's CSV. Otherwise it stays on this server
 * and is served from `/api/video/file` until the queue sweeps it.
 */
import { createReadStream } from "node:fs";
import { readFile, rename, rm, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";

import { bearer, callerKey, HttpError, json, rateLimit, readJson } from "./http.js";
import { MAX_ACTIVE_PER_OWNER, MAX_PER_HOUR, VideoQueue, view, type Job } from "./jobs.js";
import { hasSecretKey, requireCaller, requirePro, serviceClient } from "./supabase.js";
import { ffmpegAvailable, isAnimated, renderVideo, validateVideo, type VideoRequest } from "./video.js";

const SLIDES_BUCKET = "slides";

/** Filesystem-safe and recognisable in a downloads folder. */
const slug = (name: string): string =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "carousel";

/** Where a hosted video lives: under its owner, beside the deck's slides, one per shape, replaced on re-render. */
export const videoPath = (owner: string, docId: string | null, target: string): string =>
  `${owner}/${(docId ?? "video").replace(/[^\w-]/g, "")}/video-${target}.mp4`;

async function host(job: Job, file: string): Promise<string | undefined> {
  if (!job.signedIn || !hasSecretKey()) return undefined;
  const path = videoPath(job.owner, job.docId, job.target);
  const storage = serviceClient().storage.from(SLIDES_BUCKET);
  const { error } = await storage.upload(path, await readFile(file), { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`The video rendered but could not be uploaded: ${error.message}`);
  await rm(file, { force: true });
  // The path is reused on purpose, so the URL in a CSV keeps working; the
  // version keeps a CDN from serving the previous render.
  return `${storage.getPublicUrl(path).data.publicUrl}?v=${job.id.slice(0, 8)}`;
}

/** Read at import, like the keys in supabase.ts: safe because only index.ts imports this, after env.js. */
const VIDEO_DIR = process.env.VIDEO_DIR || join(process.cwd(), ".data", "video");
const VIDEO_WORKERS = Math.max(1, Number(process.env.VIDEO_WORKERS ?? 1) || 1);

export const queue = new VideoQueue(
  VIDEO_DIR,
  async (job, payload, file, progress) => {
    // To a partial name first: a render killed mid-file never looks finished.
    await renderVideo(payload as VideoRequest, `${file}.part`, (done, total) => progress(done / total));
    await rename(`${file}.part`, file);
    return { url: (await host(job, file)) ?? `/api/video/file?id=${job.id}&token=${job.token}` };
  },
  VIDEO_WORKERS,
);

const params = (req: IncomingMessage): URLSearchParams => new URL(req.url ?? "", "http://x").searchParams;

function jobFrom(id: string | null, token: string | null): Job {
  const job = id && token ? queue.get(id, token) : null;
  // 404 rather than 403 for a wrong token: the job's existence is not anyone else's business.
  if (!job) throw new HttpError(404, "No such video. It may have been swept after a week.");
  return job;
}

/** Who to count against: the account when there is one, the address when there is not. */
async function ownerOf(req: IncomingMessage): Promise<{ owner: string; signedIn: boolean }> {
  const token = bearer(req);
  if (token) {
    try {
      const caller = await requireCaller(token);
      return { owner: caller.id, signedIn: true };
    } catch {
      /* A stale session renders as a guest, the same as the PDF export. */
    }
  }
  return { owner: `ip:${callerKey(req)}`, signedIn: false };
}

export async function createVideo(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!ffmpegAvailable()) throw new HttpError(503, "This server has no ffmpeg, so it cannot make videos");
  const body = await readJson<VideoRequest>(req, 90_000_000);
  const { plan } = validateVideo(body);
  const animated = isAnimated(body);
  if (animated) await requirePro(bearer(req), "Animated video");

  const { owner, signedIn } = await ownerOf(req);
  if (queue.activeFor(owner) >= MAX_ACTIVE_PER_OWNER) {
    throw new HttpError(429, `${MAX_ACTIVE_PER_OWNER} videos are already rendering for you. The next one can start when one finishes.`);
  }
  rateLimit(`video:${owner}`, MAX_PER_HOUR, 3600_000);

  const job = await queue.add(
    {
      owner,
      signedIn,
      name: slug(body.name ?? "carousel"),
      docId: typeof body.docId === "string" ? body.docId : null,
      target: body.target,
      seconds: plan.seconds,
      animated,
    },
    body,
  );
  json(res, 202, { ...view(job), token: job.token });
}

export async function readVideo(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const q = params(req);
  json(res, 200, view(jobFrom(q.get("id"), q.get("token"))));
}

export async function retryVideo(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson<{ id?: string; token?: string }>(req);
  const job = jobFrom(body.id ?? null, body.token ?? null);
  if (job.state === "failed") rateLimit(`video:${job.owner}`, MAX_PER_HOUR, 3600_000);
  if (!(await queue.retry(job))) throw new HttpError(410, "This render's deck is gone. Retry sends it again from the editor.");
  json(res, 200, view(queue.get(job.id, job.token)!));
}

/** The finished file, with byte ranges so a `<video>` can seek in it. */
export async function videoFile(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const q = params(req);
  const job = jobFrom(q.get("id"), q.get("token"));
  if (job.state !== "done") throw new HttpError(404, "Not rendered yet");
  const file = queue.filePath(job.id);
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    throw new HttpError(404, "That file is not on this server: it was hosted, or swept after a week.");
  }
  const headers = {
    "content-type": "video/mp4",
    "accept-ranges": "bytes",
    "content-disposition": `${q.get("download") ? "attachment" : "inline"}; filename="${job.name}.mp4"`,
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { "content-range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, { ...headers, "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${size}` });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, "content-length": size });
  createReadStream(file).pipe(res);
}
