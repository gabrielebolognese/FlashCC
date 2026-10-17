/**
 * The video renderer against real Chromium and real ffmpeg (Batch 26).
 *
 * The done-when lines, each as an assertion:
 *   - a nine-slide deck's slide boundaries in the DECODED file are the plan's,
 *     and the plan is the reading-time formula, slide by slide;
 *   - the same deck rendered twice is the same bytes;
 *   - a slide with nothing moving costs one screenshot;
 *   - the file is H.264, yuv420p, 30fps, with the moov atom first.
 *
 * Skipped, with a note, where no Chromium or no ffmpeg is available.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { formulaSeconds, slideFrames, toFrames, wrapEntrance } from "../src/studio/motion.js";
import { closeBrowser } from "./render.js";
import { ffmpegAvailable, isAnimated, renderVideo, splitPngs, validateVideo, type VideoRequest } from "./video.js";

const COLOURS = ["#e5545a", "#d9a521", "#3a86ff", "#2a9d8f", "#8338ec", "#fb5607", "#06d6a0", "#ef476f", "#118ab2"];

/** A flat slide of one colour with some words on it, the way LayerView would paint a text layer. */
const flat = (colour: string, words: string) =>
  `<div style="position:absolute;inset:0;background-color:${colour}"><div style="position:absolute;left:90px;top:400px;width:900px;height:200px;font:600 64px sans-serif;color:#fff">${words}</div></div>`;

let ready = true;
let dir = "";
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "fcc-video-test-"));
  try {
    await (await chromium.launch()).close();
  } catch {
    ready = false;
  }
  if (!ffmpegAvailable()) ready = false;
});
afterAll(async () => {
  await closeBrowser();
  await rm(dir, { recursive: true, force: true });
});

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

/** The mean colour of every decoded frame, scaled to one pixel. */
function frameColours(file: string): [number, number, number][] {
  const run = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", "scale=1:1:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], {
    maxBuffer: 1 << 26,
  });
  const out: [number, number, number][] = [];
  for (let i = 0; i + 2 < run.stdout.length; i += 3) out.push([run.stdout[i]!, run.stdout[i + 1]!, run.stdout[i + 2]!]);
  return out;
}

const hex = (c: string): [number, number, number] => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16)) as [number, number, number];
const near = (a: [number, number, number], b: [number, number, number]) => a.every((v, k) => Math.abs(v - b[k]!) < 40);

const probe = (file: string) =>
  JSON.parse(
    spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]).stdout.toString(),
  ) as { streams: Record<string, string | number>[]; format: Record<string, string> };

describe("validation", () => {
  const base: VideoRequest = { css: "", width: 1080, height: 1350, target: "vertical", transition: "push", slides: [{ html: "", frames: 60, moving: 0 }] };
  it("takes the frame size from the table, never the request", () => {
    expect(validateVideo(base)).toMatchObject({ w: 1080, h: 1920 });
    expect(() => validateVideo({ ...base, target: "8k" })).toThrow(/Unknown video shape/);
  });
  it("refuses fractional frames, unknown transitions and runaway lengths", () => {
    expect(() => validateVideo({ ...base, slides: [{ html: "", frames: 1.5, moving: 0 }] })).toThrow(/whole number/);
    expect(() => validateVideo({ ...base, transition: "spin" as "cut" })).toThrow(/transition/);
    expect(() => validateVideo({ ...base, slides: [{ html: "", frames: 20_000, moving: 0 }] })).toThrow(/ten minutes/);
  });
  it("is animated only when something moves", () => {
    expect(isAnimated(base)).toBe(false);
    expect(isAnimated({ slides: [{ html: "", frames: 60, moving: 0 }, { html: "", frames: 60, moving: 20 }] })).toBe(true);
  });
  it("splits a PNG stream at each end chunk", () => {
    const end = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    const one = Buffer.concat([Buffer.from("png-a"), end]);
    const two = Buffer.concat([Buffer.from("png-b"), end]);
    expect(splitPngs(Buffer.concat([one, two]))).toEqual([one, two]);
  });
});

describe("renderVideo", () => {
  it("cuts a nine-slide deck exactly where the formula says", async (ctx) => {
    if (!ready) return ctx.skip();
    const counts = [9, 3, 14, 0, 21, 7, 30, 5, 2];
    const slides = counts.map((n) => ({ layers: [{ kind: "text", visible: true, text: words(n) }] }) as never);
    const frames = slides.map((s, i) => slideFrames(s, i, slides.length));
    // The plan IS the formula, slide by slide.
    frames.forEach((f, i) => expect(f).toBe(toFrames(formulaSeconds(counts[i]!, i, 9))));

    const out = join(dir, "nine.mp4");
    const result = await renderVideo(
      {
        css: "",
        width: 1080,
        height: 1080,
        target: "square",
        transition: "cut",
        slides: counts.map((n, i) => ({ html: flat(COLOURS[i]!, words(Math.min(n, 4))), frames: frames[i]!, moving: 0 })),
      },
      out,
    );
    expect(result.screenshots).toBe(9);
    expect(result.frames).toBe(frames.reduce((a, b) => a + b, 0));

    const decoded = frameColours(out);
    expect(decoded.length).toBe(result.frames);
    // Every frame is its slide's colour: the boundaries in the file are the plan's, to the frame.
    for (const s of result.plan.slides) {
      const i = result.plan.slides.indexOf(s);
      expect(near(decoded[s.start]!, hex(COLOURS[i]!))).toBe(true);
      expect(near(decoded[s.start + s.frames - 1]!, hex(COLOURS[i]!))).toBe(true);
      if (i > 0) expect(near(decoded[s.start - 1]!, hex(COLOURS[i - 1]!))).toBe(true);
    }

    const meta = probe(out);
    const video = meta.streams.find((s) => s.codec_type === "video")!;
    expect(video).toMatchObject({ codec_name: "h264", pix_fmt: "yuv420p", profile: "High", width: 1080, height: 1080, r_frame_rate: "30/1" });
    expect(meta.streams.some((s) => s.codec_type === "audio")).toBe(false);
    const bytes = await readFile(out);
    // faststart: the index is in front of the media, so a phone plays while it downloads.
    expect(bytes.indexOf("moov")).toBeLessThan(bytes.indexOf("mdat"));
  }, 120_000);

  it("renders the same deck to the same bytes, entrances, transitions and sound included", async (ctx) => {
    if (!ready) return ctx.skip();
    const tone = join(dir, "tone.m4a");
    spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.5", "-c:a", "aac", tone]);
    const audio = { base64: (await readFile(tone)).toString("base64"), type: "audio/mp4" };

    const headline = wrapEntrance(
      `<div style="position:absolute;left:90px;top:300px;width:900px;height:100px;font:600 64px sans-serif;color:#fff">A headline</div>`,
      { text: "A headline" },
      { kind: "rise", delay: 0, duration: 0.5 },
      undefined,
    );
    const number = wrapEntrance(
      `<div style="position:absolute;left:90px;top:500px;width:900px;height:200px;font:700 160px sans-serif;color:#fff">73%</div>`,
      { text: "73%" },
      { kind: "count", delay: 0.1, duration: 0.8 },
      undefined,
    );
    const req: VideoRequest = {
      css: "",
      width: 1080,
      height: 1350,
      target: "vertical",
      backdrop: "#111111",
      transition: "push",
      audio,
      slides: [
        { html: `<div style="position:absolute;inset:0;background-color:#3a86ff">${headline}${number}</div>`, frames: 45, moving: 28 },
        { html: flat("#e5545a", "Still"), frames: 30, moving: 0 },
        { html: flat("#2a9d8f", "Last"), frames: 30, moving: 0 },
      ],
    };
    const a = join(dir, "a.mp4");
    const b = join(dir, "b.mp4");
    const first = await renderVideo(req, a);
    await renderVideo(req, b);
    expect((await readFile(a)).equals(await readFile(b))).toBe(true);

    // 28 moving frames and a still for the animated slide, one still each for the others.
    expect(first.screenshots).toBe(28 + 1 + 1 + 1);

    const meta = probe(a);
    expect(meta.streams.find((s) => s.codec_type === "video")).toMatchObject({ width: 1080, height: 1920, nb_frames: "105" });
    expect(meta.streams.find((s) => s.codec_type === "audio")).toMatchObject({ codec_name: "aac" });
    expect(Number(meta.format.duration)).toBeCloseTo(3.5, 1);

    // Letterboxed: a 4:5 slide in a 9:16 frame leaves the backdrop above and below.
    const decoded = spawnSync("ffmpeg", ["-v", "error", "-i", a, "-frames:v", "1", "-vf", "crop=1080:200:0:0,scale=1:1:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]).stdout;
    expect(near([decoded[0]!, decoded[1]!, decoded[2]!], [17, 17, 17])).toBe(true);
  }, 180_000);
});
