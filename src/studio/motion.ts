/**
 * Motion export (Batch 26): the arithmetic of a slideshow video.
 *
 * Pure and shared with the server, like `marks.ts`: the editor's timing strip
 * and the renderer read the same numbers, so the runtime somebody sees is the
 * runtime they get.
 *
 * **Durations are arithmetic, not a model's guess** (invariant 5). Reading time
 * is the one thing about a slide that can be computed exactly: a floor of 2
 * seconds plus about 3.5 words a second, capped at 6, with half a second more
 * on the cover and a second more on the call to action. Every one adjustable.
 *
 * Frames, not seconds, are the unit the renderer works in, at 30 a second. A
 * slide's duration is rounded to whole frames once, here, so the timing strip,
 * the plan and the file agree to the frame.
 */
import { stripMarks } from "./marks.js";

/*
 * The few fields this reads, stated structurally rather than imported from
 * `model.ts`: the server program typechecks everything it imports, and the
 * model pulls in modules that only exist under Vite. A real Layer and Slide
 * satisfy these as they are.
 */
type Layer = {
  id: string;
  kind: string;
  visible: boolean;
  text?: string | undefined;
  fontSize?: number | undefined;
  furniture?: unknown;
  furnitureOptOut?: string | undefined;
  block?: { block: string } | undefined;
};
type Slide = { layers: readonly Layer[]; hold?: number | undefined };
type Doc = { motion?: Partial<MotionSettings> | undefined };

export const FPS = 30;

/* ── how long each slide holds (26.1) ─────────────────────────────────────── */

export const MIN_SECONDS = 2;
export const MAX_SECONDS = 6;
export const WORDS_PER_SECOND = 3.5;
export const COVER_EXTRA = 0.5;
export const CTA_EXTRA = 1;

/** The words a reader reads on a slide: its text layers, marks stripped, furniture left out. */
export function wordsOn(slide: Pick<Slide, "layers">): number {
  let n = 0;
  for (const l of slide.layers) {
    if (l.kind !== "text" || !l.visible || l.furniture) continue;
    n += stripMarks(l.text ?? "").split(/\s+/).filter(Boolean).length;
  }
  return n;
}

/** The formula, in seconds, before rounding to frames. */
export function formulaSeconds(words: number, index: number, total: number): number {
  const reading = Math.min(MAX_SECONDS, MIN_SECONDS + words / WORDS_PER_SECOND);
  const cover = index === 0 ? COVER_EXTRA : 0;
  const cta = total > 1 && index === total - 1 ? CTA_EXTRA : 0;
  return reading + cover + cta;
}

export const toFrames = (seconds: number): number => Math.max(1, Math.round(seconds * FPS));

/** A slide's hold, in frames: its own override when it has one, the formula otherwise. */
export function slideFrames(slide: Pick<Slide, "layers" | "hold">, index: number, total: number): number {
  const own = slide.hold;
  if (typeof own === "number" && Number.isFinite(own) && own > 0) return toFrames(Math.min(30, Math.max(0.5, own)));
  return toFrames(formulaSeconds(wordsOn(slide), index, total));
}

/* ── transitions and the plan ─────────────────────────────────────────────── */

export type Transition = "cut" | "push" | "fade" | "zoom";

export const TRANSITIONS: { id: Transition; label: string; note: string }[] = [
  { id: "cut", label: "Cut", note: "Straight to the next slide" },
  { id: "push", label: "Push", note: "Slides move left, like a swipe" },
  { id: "fade", label: "Fade", note: "One slide dissolves into the next" },
  { id: "zoom", label: "Zoom", note: "The next slide grows in" },
];

/** How a transition is drawn: ffmpeg's xfade names. */
export const XFADE: Record<Exclude<Transition, "cut">, string> = { push: "slideleft", fade: "fade", zoom: "zoomin" };

/** A transition lasts 0.4 seconds, taken from the END of the slide it leaves. */
export const TRANSITION_FRAMES = 12;

export type SlidePlan = {
  /** First frame of this slide's span. */
  start: number;
  /** The span: from its first frame to the first frame of the next slide. */
  frames: number;
  /** Frames at the end of the span spent on the transition out; 0 for a cut or the last slide. */
  out: number;
  /** Frames at the start of the hold where something is moving (26.3); 0 for a still slide. */
  moving: number;
};

export type Plan = { slides: SlidePlan[]; frames: number; seconds: number };

/**
 * Where every slide starts and how long it lasts. The span of slide `i` is
 * exactly `slideFrames`, so a per-slide duration in the file is the formula to
 * the frame; a transition eats into the end of the slide it leaves rather than
 * adding time, so the runtime is the sum of the durations.
 */
export function planVideo(frames: readonly number[], transition: Transition, moving: readonly number[] = []): Plan {
  let at = 0;
  const slides = frames.map((f, i): SlidePlan => {
    const last = i === frames.length - 1;
    // A transition never takes more than half a slide.
    const out = transition === "cut" || last ? 0 : Math.min(TRANSITION_FRAMES, Math.floor(f / 2));
    const plan = { start: at, frames: f, out, moving: Math.min(Math.max(0, moving[i] ?? 0), f - out) };
    at += f;
    return plan;
  });
  return { slides, frames: at, seconds: at / FPS };
}

/* ── the shape of the video (26.2) ────────────────────────────────────────── */

export type VideoTarget = {
  id: string;
  label: string;
  w: number;
  h: number;
  /** The platform whose safe area a reflowed deck is fitted to. */
  platform: string | null;
  note: string;
};

export const VIDEO_TARGETS: VideoTarget[] = [
  { id: "vertical", label: "Reels, TikTok, Shorts", w: 1080, h: 1920, platform: "tiktok", note: "9:16, reflowed clear of the caption band" },
  { id: "linkedin-45", label: "LinkedIn video 4:5", w: 1080, h: 1350, platform: "linkedin", note: "As the deck is" },
  { id: "square", label: "LinkedIn or X, square", w: 1080, h: 1080, platform: null, note: "1:1" },
  { id: "landscape", label: "X video 16:9", w: 1920, h: 1080, platform: null, note: "16:9" },
];

export const videoTarget = (id: string | undefined): VideoTarget => VIDEO_TARGETS.find((t) => t.id === id) ?? VIDEO_TARGETS[0]!;

/** How a deck gets into a shape it was not made in. Reflow by default; letterbox only when asked. */
export type VideoFit = "reflow" | "letterbox";

/** The box a letterboxed slide sits in, centred, as large as fits. */
export function letterbox(slide: { w: number; h: number }, frame: { w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const s = Math.min(frame.w / slide.w, frame.h / slide.h);
  const w = Math.round(slide.w * s);
  const h = Math.round(slide.h * s);
  return { x: Math.round((frame.w - w) / 2), y: Math.round((frame.h - h) / 2), w, h };
}

/* ── entrances (26.3) ─────────────────────────────────────────────────────── */

/**
 * One choice per deck. "Entrances" animates by ROLE, never per layer: the
 * headline rises, the body fades in, a number counts up, a list's items arrive
 * in order, a highlighted word is drawn on. "Fade" fades every line in, the
 * quietest option. Shapes, pictures and furniture never move.
 */
export type Animation = "none" | "entrances" | "fade";

export const ANIMATIONS: { id: Animation; label: string; note: string }[] = [
  { id: "none", label: "None", note: "Still slides. Free, and the fastest to render" },
  { id: "entrances", label: "Entrances", note: "Headline rises, body fades, numbers count, lists arrive in order" },
  { id: "fade", label: "Fade in", note: "Every line fades in, gently" },
];

export type EntranceKind = "rise" | "fade" | "count" | "item" | "highlight";

export type Entrance = { kind: EntranceKind; delay: number; duration: number };

/** A number a reader would see counted: "73%", "3x", "61K", "$1,200", "04". */
export const COUNTABLE = /^([^\d-]{0,3})(-?\d[\d,]*(?:\.\d+)?)([^\d]{0,4})$/;

const LIST_BLOCKS = new Set(["checklist", "steps", "timeline", "icon-grid"]);

/**
 * Which layer does what, and when, from the slide's start. Seconds.
 *
 * The copy layers are read by size, biggest first, the way generation reads
 * them back: the biggest is the headline. A block's parts keep their block's
 * order, so a checklist's items arrive top to bottom.
 */
export function entrancesFor(slide: Pick<Slide, "layers">, animation: Animation): Map<string, Entrance> {
  const out = new Map<string, Entrance>();
  if (animation === "none") return out;

  const copy = slide.layers.filter(
    (l) => l.kind === "text" && l.visible && !l.furniture && !l.furnitureOptOut && (l.text ?? "").trim() !== "",
  );

  if (animation === "fade") {
    copy.forEach((l, k) => out.set(l.id, { kind: "fade", delay: 0.1 * k, duration: 0.5 }));
    return out;
  }

  const plain = copy.filter((l) => !l.block);
  const byBlock = copy.filter((l) => l.block);
  const sorted = [...plain].sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0));
  sorted.forEach((l, k) => {
    const text = stripMarks(l.text ?? "").trim();
    if (COUNTABLE.test(text)) out.set(l.id, { kind: "count", delay: 0.1, duration: 0.8 });
    else if (k === 0) out.set(l.id, { kind: "rise", delay: 0, duration: 0.5 });
    else out.set(l.id, { kind: "fade", delay: 0.25 + 0.1 * (k - 1), duration: 0.5 });
  });

  let item = 0;
  for (const l of byBlock) {
    const text = stripMarks(l.text ?? "").trim();
    if (COUNTABLE.test(text)) out.set(l.id, { kind: "count", delay: 0.1, duration: 0.8 });
    else if (LIST_BLOCKS.has(l.block!.block)) out.set(l.id, { kind: "item", delay: 0.2 + 0.15 * item++, duration: 0.4 });
    else out.set(l.id, { kind: "fade", delay: 0.25, duration: 0.5 });
  }

  // A ==highlighted== word is drawn on, after its line has arrived.
  for (const l of copy) {
    if (!/==[^=]+==/.test(l.text ?? "")) continue;
    const own = out.get(l.id);
    const after = own ? own.delay + own.duration : 0;
    out.set(`${l.id}#mark`, { kind: "highlight", delay: after, duration: 0.5 });
  }
  return out;
}

/** How long a slide's entrances take, in frames: the screenshots it needs beyond the first. */
export function movingFrames(entrances: ReadonlyMap<string, Entrance>): number {
  let end = 0;
  for (const e of entrances.values()) end = Math.max(end, e.delay + e.duration);
  return end === 0 ? 0 : Math.ceil(end * FPS) + 1;
}

/**
 * The value a count-up shows at progress `p` (0 to 1): the same digits, the
 * same decimals, the same thousands separators, the same prefix and suffix.
 */
export function countAt(text: string, p: number): string {
  const m = text.trim().match(COUNTABLE);
  if (!m) return text;
  const [, pre = "", num = "0", post = ""] = m;
  const target = Number(num.replace(/,/g, ""));
  const decimals = num.includes(".") ? num.split(".")[1]!.length : 0;
  const eased = 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;
  let v = (target * eased).toFixed(decimals);
  if (num.includes(",")) {
    const [i = "", d] = v.split(".");
    v = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d ? `.${d}` : "");
  }
  // Leading zeros kept, so "04" counts 00, 01 ... 04.
  const intLen = num.replace(/,/g, "").split(".")[0]!.replace("-", "").length;
  if (/^0\d/.test(num) && !num.includes(",")) v = v.padStart(intLen + (decimals ? decimals + 1 : 0), "0");
  return `${pre}${v}${post}`;
}

/**
 * `countAt`, as the page runs it. Plain JavaScript in a string because it runs
 * in the render page; `motion.test.ts` evaluates it and checks it agrees with
 * `countAt` on every case, so the two cannot drift.
 */
export const COUNT_JS = `function (text, p) {
  var m = String(text).trim().match(${COUNTABLE.toString()});
  if (!m) return text;
  var pre = m[1] || "", num = m[2] || "0", post = m[3] || "";
  var target = Number(num.replace(/,/g, ""));
  var decimals = num.indexOf(".") >= 0 ? num.split(".")[1].length : 0;
  var q = Math.min(1, Math.max(0, p));
  var eased = 1 - Math.pow(1 - q, 3);
  var v = (target * eased).toFixed(decimals);
  if (num.indexOf(",") >= 0) {
    var parts = v.split(".");
    v = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",") + (parts[1] ? "." + parts[1] : "");
  }
  var intLen = num.replace(/,/g, "").split(".")[0].replace("-", "").length;
  if (/^0\\d/.test(num) && num.indexOf(",") < 0) v = v.padStart(intLen + (decimals ? decimals + 1 : 0), "0");
  return pre + v + post;
}`;

/**
 * The page-side half of an entrance: keyframes on the wrapper the exporter
 * puts round each moving layer. Seeked frame by frame through the Web
 * Animations API, never played, so every run is identical.
 */
export const ENTRANCE_CSS = `
@keyframes fcc-rise { from { opacity: 0; transform: translateY(48px); } to { opacity: 1; transform: none; } }
@keyframes fcc-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes fcc-item { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
@keyframes fcc-pop { from { opacity: 0; } to { opacity: 1; } }
@keyframes fcc-mark { from { background-size: 0% 100%; } to { background-size: 100% 100%; } }
[data-fcc-anim], [data-fcc-mark] { position: absolute; inset: 0; }
[data-fcc-anim] { animation-fill-mode: both; animation-timing-function: cubic-bezier(.2,.7,.2,1); animation-play-state: paused; }
[data-fcc-anim="rise"] { animation-name: fcc-rise; }
[data-fcc-anim="fade"] { animation-name: fcc-fade; }
[data-fcc-anim="item"] { animation-name: fcc-item; }
[data-fcc-anim="count"] { animation-name: fcc-pop; }
[data-fcc-mark] span[style*="background-image"] { animation: fcc-mark var(--fcc-mark-d) linear var(--fcc-mark-at) both paused; }
`;

/**
 * What the page runs to show frame `t` (seconds): every animation seeked to
 * the same instant, and every count-up written for it. A string, because it
 * runs in the page and the server has no DOM types.
 */
export const SEEK_SCRIPT = `
window.__fccSeek = (t) => {
  for (const a of document.getAnimations()) { a.pause(); a.currentTime = t * 1000; }
  for (const el of document.querySelectorAll("[data-fcc-count]")) {
    const delay = Number(el.dataset.fccDelay), dur = Number(el.dataset.fccDuration);
    const p = Math.min(1, Math.max(0, (t - delay) / dur));
    // Into the text itself, so LayerView's element and its style survive:
    // the first run of text gets the number, any other run is emptied.
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let first = true;
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      n.nodeValue = first ? window.__fccCount(el.dataset.fccCount, p) : "";
      first = false;
    }
  }
};
window.__fccCount = ${COUNT_JS};
`;

const attr = (v: string): string => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** A count-up fades in quickly while its digits run; the wrapper's own animation is the fade. */
const COUNT_FADE = 0.2;

/**
 * One layer's markup wrapped for its entrance: the keyframes on the wrapper,
 * the timing inline, and for a count-up the text it counts to. A layer with
 * no entrance is returned untouched, so a still deck's markup is exactly the
 * markup every other export sends.
 */
export function wrapEntrance(markup: string, layer: Pick<Layer, "text">, own: Entrance | undefined, mark: Entrance | undefined): string {
  if (!own && !mark) return markup;
  const style: string[] = [];
  const attrs: string[] = [];
  if (own) {
    attrs.push(`data-fcc-anim="${own.kind}"`);
    style.push(`animation-delay:${own.delay}s`, `animation-duration:${own.kind === "count" ? COUNT_FADE : own.duration}s`);
    if (own.kind === "count") {
      attrs.push(
        `data-fcc-count="${attr(stripMarks(layer.text ?? "").trim())}"`,
        `data-fcc-delay="${own.delay}"`,
        `data-fcc-duration="${own.duration}"`,
      );
    }
  }
  if (mark) {
    attrs.push("data-fcc-mark");
    style.push(`--fcc-mark-at:${mark.delay}s`, `--fcc-mark-d:${mark.duration}s`);
  }
  return `<div ${attrs.join(" ")} style="${style.join(";")}">${markup}</div>`;
}

/* ── what the deck asks for (stored on the doc) ───────────────────────────── */

export type MotionSettings = {
  target: string;
  fit: VideoFit;
  transition: Transition;
  animation: Animation;
};

export const DEFAULT_MOTION: MotionSettings = { target: "vertical", fit: "reflow", transition: "push", animation: "none" };

export const motionOf = (doc: Pick<Doc, "motion">): MotionSettings => ({ ...DEFAULT_MOTION, ...(doc.motion ?? {}) });

/** The words a layer holds, for the count-up's starting text. */
export const layerWords = (l: Layer): string => stripMarks(l.text ?? "").trim();
