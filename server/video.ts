/**
 * Slides into a video file (Batch 26).
 *
 * The same painter as every other export: the browser serialises LayerView's
 * markup, a real Chromium renders it, and ffmpeg only ever encodes pictures it
 * is handed. Nothing here lays anything out or decides a duration; the plan is
 * `planVideo` from `src/studio/motion.ts`, the same arithmetic the editor's
 * timing strip shows.
 *
 * **Deterministic, on purpose.** An entrance is never played, it is SEEKED: for
 * frame `k` every animation on the page is set to `k / 30` seconds and the page
 * is screenshotted. No clock is read, so two renders of one deck are the same
 * screenshots, and the encoder runs with fixed threads and bitexact flags, so
 * the same screenshots are the same file. `video.test.ts` renders twice and
 * compares the bytes.
 *
 * **A still slide costs one screenshot.** Its hold is that one picture written
 * as many times as the plan says; only the frames where something moves are
 * captured one by one. A transition is drawn by ffmpeg's `xfade` from the
 * outgoing slide's last picture and the incoming slide's first.
 *
 * ffmpeg is the system's, found as `FFMPEG_PATH` or on PATH. It is not bundled:
 * the static builds carry GPL codecs, and an ffmpeg that is missing is reported
 * on /api/health so the editor can say so rather than fail at the end of a job.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BrowserContext, Page } from "playwright";

import {
  ENTRANCE_CSS,
  FPS,
  planVideo,
  SEEK_SCRIPT,
  letterbox,
  TRANSITIONS,
  VIDEO_TARGETS,
  XFADE,
  type Plan,
  type Transition,
} from "../src/studio/motion.js";
import { HttpError } from "./http.js";
import { getBrowser } from "./render.js";

export type VideoSlide = {
  html: string;
  /** This slide's span in frames: `slideFrames`, already rounded. */
  frames: number;
  /** Frames at the start of the hold where an entrance is moving (26.3); 0 for a still slide. */
  moving: number;
};

export type VideoRequest = {
  name?: string | undefined;
  /** The deck, so a re-render replaces its file rather than adding a second. */
  docId?: string | undefined;
  css: string;
  /** The artboard the markup was laid out on. Anything that is not the frame's size is fitted, centred. */
  width: number;
  height: number;
  /** A `VIDEO_TARGETS` id: the frame size comes from the table, never from the request. */
  target: string;
  /** Behind a letterboxed slide. */
  backdrop?: string | undefined;
  transition: Transition;
  slides: VideoSlide[];
  /** An uploaded track (26.4). Silent when absent; there is no music library. */
  audio?: { base64: string; type: string } | undefined;
};

export const MAX_VIDEO_SLIDES = 60;
/** Ten minutes. Far beyond any slideshow, and a ceiling on what one job can cost. */
export const MAX_VIDEO_FRAMES = 10 * 60 * FPS;
export const MAX_AUDIO_BYTES = 20_000_000;

/** Whether this request animates anything: the line between free and Pro (26.5). */
export const isAnimated = (req: Pick<VideoRequest, "slides">): boolean => req.slides.some((s) => s.moving > 0);

export function validateVideo(req: VideoRequest): { w: number; h: number; plan: Plan } {
  const target = VIDEO_TARGETS.find((t) => t.id === req.target);
  if (!target) throw new HttpError(400, "Unknown video shape");
  if (!TRANSITIONS.some((t) => t.id === req.transition)) throw new HttpError(400, "Unknown transition");
  if (!Array.isArray(req.slides) || req.slides.length === 0) throw new HttpError(400, "No slides to render");
  if (req.slides.length > MAX_VIDEO_SLIDES) throw new HttpError(400, `A video takes at most ${MAX_VIDEO_SLIDES} slides`);
  if (!(req.width >= 1 && req.height >= 1 && req.width <= 4096 && req.height <= 4096)) {
    throw new HttpError(400, "Artboard size is out of range");
  }
  for (const s of req.slides) {
    if (typeof s.html !== "string" || !Number.isInteger(s.frames) || s.frames < 1 || !Number.isInteger(s.moving) || s.moving < 0) {
      throw new HttpError(400, "Every slide needs its markup and a whole number of frames");
    }
  }
  const plan = planVideo(
    req.slides.map((s) => s.frames),
    req.transition,
    req.slides.map((s) => s.moving),
  );
  if (plan.frames > MAX_VIDEO_FRAMES) throw new HttpError(400, "A video can run at most ten minutes");
  if (req.audio && Buffer.byteLength(req.audio.base64 ?? "", "base64") > MAX_AUDIO_BYTES) {
    throw new HttpError(413, "That track is over 20 MB");
  }
  return { w: target.w, h: target.h, plan };
}

/* ── ffmpeg ───────────────────────────────────────────────────────────────── */

/** Read when called, never at import: see env.test.ts. */
function ffmpegPath(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

let available: boolean | null = null;

/** Asked once per process: reported on /api/health, and checked before a job is accepted. */
export function ffmpegAvailable(): boolean {
  if (available !== null) return available;
  try {
    const run = spawnSync(ffmpegPath(), ["-hide_banner", "-version"], { timeout: 5000 });
    available = run.status === 0;
  } catch {
    available = false;
  }
  return available;
}

/**
 * Fixed, so the same pictures always encode to the same bytes. x264 is
 * deterministic for a given thread count; the count is pinned rather than
 * left to the machine.
 */
const ENCODE_THREADS = "2";

/** The colour tags phones read: without them a slide's colours shift slightly on iOS. */
const COLOUR = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

function encoderArgs(out: string, seconds: number, audio: string | null): string[] {
  const args = ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "pipe:0"];
  if (audio) args.push("-i", audio);
  args.push("-map", "0:v");
  if (audio) {
    // The track is cut to the video and faded over its last second; a short
    // track is padded with silence so every player sees one length.
    const fade = Math.max(0, seconds - 1).toFixed(3);
    args.push(
      "-map", "1:a",
      "-af", `apad,afade=t=out:st=${fade}:d=1`,
      "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-flags:a", "+bitexact",
    );
  }
  args.push(
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p",
    ...COLOUR,
    "-r", String(FPS), "-threads", ENCODE_THREADS,
    "-t", seconds.toFixed(3),
    // Moov at the front: a phone starts playing before the whole file arrives.
    "-movflags", "+faststart",
    "-fflags", "+bitexact", "-flags:v", "+bitexact", "-map_metadata", "-1",
    // Named, not read from the extension: the queue renders to `<id>.mp4.part`.
    "-f", "mp4",
    out,
  );
  return args;
}

/** Runs ffmpeg to completion, collecting stdout; a failure carries its stderr. */
function runFfmpeg(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => (err += c.toString()));
    child.on("error", (e) => reject(missing(e)));
    child.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg failed: ${err.trim().slice(0, 400)}`))));
  });
}

const missing = (e: Error): Error =>
  (e as NodeJS.ErrnoException).code === "ENOENT" ? new HttpError(503, "This server has no ffmpeg, so it cannot make videos") : e;

const IEND = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/** A stream of concatenated PNGs, split at each file's end chunk. */
export function splitPngs(stream: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let from = 0;
  for (;;) {
    const at = stream.indexOf(IEND, from);
    if (at < 0) break;
    out.push(stream.subarray(from, at + IEND.length));
    from = at + IEND.length;
  }
  return out;
}

/**
 * The frames of one transition, from the outgoing slide's last picture to the
 * incoming slide's first, drawn by ffmpeg's xfade. Exactly `frames` of them.
 */
async function transitionFrames(dir: string, from: Buffer, to: Buffer, transition: Exclude<Transition, "cut">, frames: number): Promise<Buffer[]> {
  const a = join(dir, "a.png");
  const b = join(dir, "b.png");
  await Promise.all([writeFile(a, from), writeFile(b, to)]);
  const d = (frames / FPS).toFixed(6);
  const stream = await runFfmpeg([
    "-v", "error",
    "-loop", "1", "-framerate", String(FPS), "-t", d, "-i", a,
    "-loop", "1", "-framerate", String(FPS), "-t", d, "-i", b,
    "-filter_complex", `[0][1]xfade=transition=${XFADE[transition]}:duration=${d}:offset=0,format=rgb24`,
    "-frames:v", String(frames), "-threads", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1",
  ]);
  const shots = splitPngs(stream);
  // Never short: a frame missing here would shift every slide after it.
  while (shots.length < frames) shots.push(shots[shots.length - 1] ?? to);
  return shots.slice(0, frames);
}

/* ── the page ─────────────────────────────────────────────────────────────── */

/** One slide in a frame-sized page. A slide of another size is scaled to fit, centred, on the backdrop. */
function framePage(req: VideoRequest, w: number, h: number, html: string): string {
  const fits = req.width === w && req.height === h;
  const box = letterbox({ w: req.width, h: req.height }, { w, h });
  const scale = box.w / req.width;
  const inner = fits
    ? html
    : `<div style="position:absolute;left:${box.x}px;top:${box.y}px;width:${req.width}px;height:${req.height}px;overflow:hidden;transform:scale(${scale});transform-origin:0 0">${html}</div>`;
  const backdrop = /^[#a-zA-Z0-9(),.%\s]{1,40}$/.test(req.backdrop ?? "") ? req.backdrop : "#000";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${fits ? "transparent" : backdrop}; }
  #frame { position: relative; width: ${w}px; height: ${h}px; overflow: hidden; background: ${fits ? "transparent" : backdrop}; }
  ${ENTRANCE_CSS}
  ${req.css}
</style></head><body><div id="frame">${inner}</div><script>${SEEK_SCRIPT}</script></body></html>`;
}

/** Far past every entrance: what a slide looks like once everything has arrived. */
const SETTLED = 3600;

type Shots = { first: Buffer; moving: Buffer[]; still: Buffer };

/**
 * The pictures one slide needs: the moving frames, one by one, and the still
 * it settles on. A slide with nothing moving is ONE screenshot.
 */
async function shootSlide(sheet: Page, req: VideoRequest, w: number, h: number, slide: VideoSlide, moving: number, count: { shots: number }): Promise<Shots> {
  await sheet.setContent(framePage(req, w, h, slide.html), { waitUntil: "load" });
  // See render.ts: layout first, so a face that is only asked for by layout
  // has started loading before `fonts.ready` is read.
  await sheet.evaluate("(document.body.offsetHeight, document.fonts.ready)");
  const shot = async (t: number): Promise<Buffer> => {
    await sheet.evaluate(`window.__fccSeek(${t})`);
    count.shots += 1;
    return sheet.screenshot({ type: "png", clip: { x: 0, y: 0, width: w, height: h }, animations: "allow", caret: "hide" });
  };
  const frames: Buffer[] = [];
  for (let k = 0; k < moving; k += 1) frames.push(await shot(k / FPS));
  const still = await shot(SETTLED);
  return { first: frames[0] ?? still, moving: frames, still };
}

export type VideoResult = { frames: number; seconds: number; screenshots: number; plan: Plan };

/**
 * Renders the request to an MP4 at `out`. `progress` hears frames written out
 * of the plan's total, for the job's progress bar.
 */
export async function renderVideo(req: VideoRequest, out: string, progress?: (done: number, total: number) => void): Promise<VideoResult> {
  const { w, h, plan } = validateVideo(req);
  const dir = await mkdtemp(join(tmpdir(), "fcc-video-"));
  let audio: string | null = null;
  if (req.audio?.base64) {
    audio = join(dir, "track");
    await writeFile(audio, Buffer.from(req.audio.base64, "base64"));
  }

  const encoder = spawn(ffmpegPath(), encoderArgs(out, plan.seconds, audio), { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  encoder.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
  const finished = new Promise<void>((resolve, reject) => {
    encoder.on("error", (e) => reject(missing(e)));
    encoder.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${stderr.trim().slice(0, 400)}`))));
  });
  // A write after ffmpeg has died should surface as its own error, not as EPIPE.
  encoder.stdin.on("error", () => {});

  let written = 0;
  const write = async (png: Buffer): Promise<void> => {
    if (!encoder.stdin.write(png)) {
      await Promise.race([new Promise((r) => encoder.stdin.once("drain", r)), finished]);
    }
    written += 1;
    if (written % FPS === 0) progress?.(written, plan.frames);
  };

  const count = { shots: 0 };
  const b = await getBrowser();
  const context: BrowserContext = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: "light" });
  try {
    const sheet = await context.newPage();
    const shots: (Shots | undefined)[] = [];
    const shotsFor = async (i: number): Promise<Shots> =>
      (shots[i] ??= await shootSlide(sheet, req, w, h, req.slides[i]!, plan.slides[i]!.moving, count));

    for (let i = 0; i < plan.slides.length; i += 1) {
      const p = plan.slides[i]!;
      const own = await shotsFor(i);
      const hold = p.frames - p.out;
      for (let k = 0; k < hold; k += 1) await write(own.moving[k] ?? own.still);
      if (p.out > 0) {
        const next = await shotsFor(i + 1);
        const between = await transitionFrames(dir, own.still, next.first, req.transition as Exclude<Transition, "cut">, p.out);
        for (const f of between) await write(f);
      }
      // Done with it: a long deck should not hold every slide's frames at once.
      shots[i] = undefined;
    }
    encoder.stdin.end();
    await finished;
    progress?.(plan.frames, plan.frames);
    return { frames: written, seconds: plan.seconds, screenshots: count.shots, plan };
  } catch (error) {
    encoder.kill("SIGKILL");
    throw error;
  } finally {
    await context.close();
    await rm(dir, { recursive: true, force: true });
  }
}
