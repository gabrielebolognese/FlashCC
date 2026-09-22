/**
 * One long asset, several carousels.
 *
 * ── The interaction is this way round for a reason ───────────────────────────
 *
 * Across the whole research corpus nobody complains that the slides look bad.
 * They complain that the machine picked the wrong material:
 *
 *   "its virality score and my audience disagree, constantly... I have stopped
 *    trusting the ranking and now I scrub the whole thing myself anyway, which
 *    defeats the point of paying... Looking specifically for: I choose the
 *    moment, it does the work."
 *
 * So this does **not** auto-segment and hand back a finished series. It offers
 * candidates and does nothing until somebody picks. There is no score, no
 * ranking and no "recommended" badge, because a confident number on an
 * unknowable quantity is exactly what that person stopped trusting.
 *
 * ── The one hard guarantee ───────────────────────────────────────────────────
 *
 *   "The Quotes, Hooks & Timestamps pick up in the middle of a sentence so it
 *    does not make any sense. My time would be better spent just writing the
 *    sentences myself."
 *
 * Every cut in this file lands on a sentence boundary. That is the difference
 * between a tool and a waste of time, and it is what `sentences()` exists for.
 *
 * Pure and DOM-free. It reads text and returns text; `buildDocs` in bulk.ts does
 * the rest, unchanged.
 */

import type { BulkBlock } from "./bulk.js";
import { nameFromHook } from "./search.js";

/* ── reading the document ─────────────────────────────────────────────────── */

export type Shape = "markdown" | "transcript" | "prose";

export type Segment = {
  kind: "heading" | "para";
  text: string;
};

const normalise = (source: string): string => source.replace(/\r\n?/g, "\n").replace(/ /g, " ");

/** `# H1` through `###### H6`, or an `===`/`---` underline on the line below. */
const MD_HEADING = /^#{1,6}\s+(.+)$/;
const SETEXT = /^(=|-){3,}\s*$/;

/** `00:12`, `1:02:33`, `[00:12]`, `(00:12:33)` — with or without a trailing dash. */
const TIMESTAMP = /^[\s([]*\d{1,2}:\d{2}(?::\d{2})?[\s)\]]*[-–—]?\s*/;

/** `Name:` or `NAME [00:12]:` at the head of a line. Two words at most, so a
 *  sentence containing a colon is not mistaken for a speaker turn. */
const SPEAKER = /^([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)?)\s*(?:\[[^\]]*\])?\s*:\s+/;

/**
 * A line that is acting as a heading without being marked as one.
 *
 * Short, no terminal punctuation, and title-ish. Deliberately conservative: a
 * false positive here invents a section break in the middle of an argument,
 * which is the failure mode this whole file exists to avoid.
 */
function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length === 0 || t.length > 70) return false;
  if (/[.!?,;:]$/.test(t)) return false;
  if (t.split(/\s+/).length > 10) return false;
  // All caps, or Title Case with at least two words.
  if (t === t.toUpperCase() && /[A-Z]/.test(t)) return true;
  return /^[A-Z0-9]/.test(t) && t.split(/\s+/).filter((w) => /^[A-Z0-9]/.test(w)).length >= 2;
}

export function shapeOf(source: string): Shape {
  const text = normalise(source);
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return "prose";

  const timestamped = lines.filter((l) => TIMESTAMP.test(l)).length;
  const speakers = lines.filter((l) => SPEAKER.test(l)).length;
  // A third is a low bar on purpose: transcripts interleave stage directions and
  // unlabelled continuations, so demanding a majority misses most real ones.
  if (timestamped + speakers >= lines.length / 3) return "transcript";

  if (lines.some((l) => MD_HEADING.test(l))) return "markdown";
  return "prose";
}

/**
 * The document as headings and paragraphs.
 *
 * Transcripts are stripped of their timestamps and speaker labels first. Those
 * are navigation for whoever recorded it and noise on a slide, and leaving them
 * in is how "00:12:33 So anyway" ends up as somebody's hook.
 */
export function segments(source: string): Segment[] {
  const text = normalise(source);
  const shape = shapeOf(text);
  const out: Segment[] = [];

  if (shape === "transcript") {
    const cleaned = text
      .split("\n")
      .map((line) => line.replace(TIMESTAMP, "").replace(SPEAKER, "").trim())
      .filter(Boolean);

    // A transcript has no paragraphs, so sentences are regrouped into readable
    // ones. Three is not a rule about prose — it is the size at which a chunk
    // still fits on a slide after fitting.
    const all = sentences(cleaned.join(" "));
    for (let i = 0; i < all.length; i += 3) {
      const para = all.slice(i, i + 3).join(" ").trim();
      if (para) out.push({ kind: "para", text: para });
    }
    return out;
  }

  const lines = text.split("\n");
  let buffer: string[] = [];

  const flush = () => {
    const para = buffer.join(" ").replace(/\s+/g, " ").trim();
    buffer = [];
    if (para) out.push({ kind: "para", text: para });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    const line = raw.trim();

    if (line === "") {
      flush();
      continue;
    }

    const md = MD_HEADING.exec(line);
    if (md) {
      flush();
      out.push({ kind: "heading", text: (md[1] ?? "").trim() });
      continue;
    }

    // Setext: the underline belongs to the line above, which is in the buffer.
    if (SETEXT.test(line) && buffer.length === 1) {
      const title = buffer[0] ?? "";
      buffer = [];
      out.push({ kind: "heading", text: title.trim() });
      continue;
    }

    // An unmarked heading only counts when it stands alone, which is what the
    // blank line before it establishes.
    if (buffer.length === 0 && looksLikeHeading(line) && shape !== "prose") {
      out.push({ kind: "heading", text: line });
      continue;
    }

    buffer.push(line);
  }

  flush();
  return out;
}

/* ── sentences ────────────────────────────────────────────────────────────── */

/** Endings that are not endings. Extended rather than clever — it is a list. */
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "eg", "ie",
  "approx", "fig", "inc", "ltd", "co", "no", "al", "dept", "est", "min", "max",
  "us", "uk", "eu", "am", "pm",
]);

/**
 * Splits on real sentence ends only.
 *
 * Every cut this file makes goes through here, because "picks up in the middle
 * of a sentence" is the single most-cited failure of every competing tool.
 *
 * A candidate boundary is a terminator followed by whitespace and something that
 * can start a sentence. It is rejected when the word before it is a known
 * abbreviation, a single initial, or a number — "3." is a list marker, not the
 * end of a thought.
 */
export function sentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const out: string[] = [];
  let start = 0;

  const boundary = /([.!?]+)(["')\]]*)\s+(?=[A-Z0-9"'(\[])/g;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(clean)) !== null) {
    const end = match.index + match[0].length;
    const before = clean.slice(start, match.index);
    const lastWord = (before.match(/([\w.]+)$/)?.[1] ?? "").toLowerCase().replace(/\./g, "");

    const isAbbrev = ABBREVIATIONS.has(lastWord);
    const isInitial = lastWord.length === 1 && /[a-z]/.test(lastWord);
    const isNumber = /^\d+$/.test(lastWord) && match[1] === ".";

    if (isAbbrev || isInitial || isNumber) continue;

    const sentence = clean.slice(start, end).trim();
    if (sentence) out.push(sentence);
    start = end;
  }

  const tail = clean.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/* ── candidates ───────────────────────────────────────────────────────────── */

export type Candidate = {
  id: string;
  title: string;
  paragraphs: string[];
  chars: number;
  /** Why this was offered, shown to the person choosing. Never a score. */
  reason: string;
  /** Too little material to make five slides from. Stated, never hidden. */
  thin: boolean;
};

/** Below this a candidate cannot fill a carousel; it is offered anyway, labelled. */
export const THIN_CHARS = 400;
/** A window for material with no structure of its own. */
const WINDOW_CHARS = 1400;

export type LongFormResult = {
  shape: Shape;
  candidates: Candidate[];
  warnings: string[];
};

/**
 * The moments on offer.
 *
 * A heading defines a candidate when the document has headings, because whoever
 * wrote it already decided where the ideas divide and second-guessing them is
 * the mistake. Material with no headings is windowed at sentence boundaries — an
 * arbitrary but honest cut, and the labelling says so rather than implying the
 * machine found a theme.
 */
export function readLongForm(source: string): LongFormResult {
  const shape = shapeOf(source);
  const segs = segments(source);
  const warnings: string[] = [];

  if (segs.length === 0) {
    return { shape, candidates: [], warnings: ["There is nothing to read in that."] };
  }

  const headed = segs.some((s) => s.kind === "heading");
  const candidates = headed ? bySection(segs) : byWindow(segs);

  if (!headed && shape !== "transcript") {
    warnings.push(
      "No headings found, so this was cut into even stretches at sentence ends. Add headings and it will follow them instead.",
    );
  }
  if (candidates.every((c) => c.thin)) {
    warnings.push("Every section here is short. Expect brief carousels, or pick several together.");
  }

  return { shape, candidates, warnings };
}

function make(title: string, paragraphs: string[], reason: string, n: number): Candidate {
  const chars = paragraphs.reduce((sum, p) => sum + p.length, 0);
  return {
    id: `c${n}`,
    title: title.trim() || nameFromHook(paragraphs[0] ?? "") || `Section ${n + 1}`,
    paragraphs,
    chars,
    reason,
    thin: chars < THIN_CHARS,
  };
}

/** One candidate per heading. Text before the first heading becomes its own. */
function bySection(segs: readonly Segment[]): Candidate[] {
  const out: Candidate[] = [];
  let title = "";
  let buffer: string[] = [];
  let intro = true;

  const flush = () => {
    if (buffer.length > 0) {
      out.push(make(title, buffer, intro ? "Before the first heading" : `Section: ${title}`, out.length));
    }
    buffer = [];
  };

  for (const seg of segs) {
    if (seg.kind === "heading") {
      flush();
      intro = false;
      title = seg.text;
      continue;
    }
    buffer.push(seg.text);
  }
  flush();

  return out;
}

/** Even stretches, never cutting a paragraph in half. */
function byWindow(segs: readonly Segment[]): Candidate[] {
  const paras = segs.filter((s) => s.kind === "para").map((s) => s.text);
  const out: Candidate[] = [];
  let buffer: string[] = [];
  let size = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    out.push(make("", buffer, `An even stretch — ${buffer.length} paragraphs`, out.length));
    buffer = [];
    size = 0;
  };

  for (const para of paras) {
    buffer.push(para);
    size += para.length;
    if (size >= WINDOW_CHARS) flush();
  }
  flush();

  return out;
}

/* ── candidate to carousel ────────────────────────────────────────────────── */

/** The mapping the roadmap specifies: each section becomes one or two slides, 5–10 a deck. */
export const MIN_SLIDES = 3;
export const MAX_SLIDES = 10;
/** Comfortable on one slide after fitting. Generation splits anything longer. */
const TARGET_CHARS = 200;

export type BlockOptions = {
  /** A closing line applied to every carousel, as bulk creators already do. */
  cta?: string | undefined;
  /** Use the section title as the opening slide. On by default. */
  titleAsHook?: boolean | undefined;
  max?: number | undefined;
};

/**
 * Turns a chosen candidate into slides.
 *
 * A long paragraph is divided at sentence ends and never anywhere else; a short
 * one is left whole. When there is more material than slides, trailing
 * paragraphs are MERGED into the last slide rather than dropped — generation's
 * own split pass will give an overlong slide another slide if it needs one,
 * whereas material thrown away here is gone without anyone being told.
 */
export function toSlides(candidate: Candidate, options: BlockOptions = {}): string[] {
  const max = Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, options.max ?? MAX_SLIDES));
  const cta = options.cta?.trim();
  const useTitle = options.titleAsHook ?? true;

  const body: string[] = [];
  for (const para of candidate.paragraphs) {
    if (para.length <= TARGET_CHARS) {
      body.push(para);
      continue;
    }
    body.push(...divide(para));
  }

  const room = max - (useTitle ? 1 : 0) - (cta ? 1 : 0);
  const packed = room > 0 ? fold(body, room) : body.slice(0, 1);

  return [
    ...(useTitle ? [candidate.title] : []),
    ...packed,
    ...(cta ? [cta] : []),
  ].filter((t) => t.trim() !== "");
}

/** Sentences gathered into slide-sized runs. Always cuts between sentences. */
function divide(paragraph: string): string[] {
  const all = sentences(paragraph);
  if (all.length <= 1) return [paragraph];

  const out: string[] = [];
  let run: string[] = [];
  let size = 0;

  for (const sentence of all) {
    // A sentence longer than a slide still gets its own slide rather than being
    // cut. Generation's split pass handles it from there, at its own boundaries.
    if (size > 0 && size + sentence.length > TARGET_CHARS) {
      out.push(run.join(" "));
      run = [];
      size = 0;
    }
    run.push(sentence);
    size += sentence.length + 1;
  }
  if (run.length > 0) out.push(run.join(" "));
  return out;
}

/** Folds the tail into the last slide so nothing is silently lost. */
function fold(texts: readonly string[], room: number): string[] {
  if (texts.length <= room) return [...texts];
  const kept = texts.slice(0, room - 1);
  const rest = texts.slice(room - 1).join(" ");
  return [...kept, rest];
}

export const toBlock = (candidate: Candidate, options: BlockOptions = {}): BulkBlock => {
  const texts = toSlides(candidate, options);
  return { texts, title: nameFromHook(candidate.title) || candidate.title };
};

export const toBlocks = (
  candidates: readonly Candidate[],
  options: BlockOptions = {},
): BulkBlock[] => candidates.map((c) => toBlock(c, options));

/** What the picker shows beside each candidate, without pretending to judge it. */
export const slideEstimate = (candidate: Candidate, options: BlockOptions = {}): number =>
  toSlides(candidate, options).length;

export const preview = (candidate: Candidate, chars = 160): string => {
  const text = candidate.paragraphs.join(" ");
  return text.length <= chars ? text : `${text.slice(0, chars).trimEnd()}…`;
};
