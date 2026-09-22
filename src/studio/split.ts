/**
 * Same words, more slides.
 *
 * Two related jobs, one piece of reasoning.
 *
 * AUTOMATICALLY, at generation: copy that will not fit gets another slide rather
 * than a smaller font. Shrink-to-fit is the single loudest complaint about every
 * tool in this category — "dense slides get scaled down to fit rather than spread
 * out, so text ends up small and cramped", and more bluntly, "it just crams
 * everything into the top 5th of each page and then blanks the rest". A couple of
 * steps down the ladder is a reasonable accommodation; falling to the floor is
 * the tool giving up and calling it a feature.
 *
 * BY HAND, in the editor: split a slide, merge two, move the break. This is
 * explicitly unmet in the market — a paying customer of a competitor: "our copy
 * is client-approved and must not be reworded. That leaves us no way to express
 * 'same words, spread across more slides'". Both halves of that matter. The words
 * are never touched here; only where they break.
 *
 * Splits land on sentence boundaries, nearest the middle, so each piece reads as
 * a complete thought. Falling back to a line break, then a word break, then
 * nothing — a piece that cannot be split is returned whole rather than cut
 * mid-word.
 */

import type { Doc, Layer, Slide } from "./model.js";
import { lineCount, type Measure } from "./text.js";

/**
 * How far down the ladder shrinking is allowed to go before splitting instead.
 *
 * Two steps is roughly 10-12% on the ladders the compositions use — enough to
 * absorb a slightly long line, not enough to be visible as "this slide is
 * cramped".
 */
export const MAX_SHRINK_STEPS = 2;

export type Box = { w: number; h: number };

export type FitSpec = {
  box: Box;
  /** The composition's ladder, largest first. */
  sizes: readonly number[];
  lineHeight: number;
  measure?: Measure | undefined;
};

const heightAt = (text: string, size: number, spec: FitSpec): number =>
  lineCount(text, size, spec.box.w, spec.measure ?? {}) * size * spec.lineHeight;

/** The largest ladder size that fits, considering only the first N steps. */
export function sizeWithin(text: string, spec: FitSpec, steps = MAX_SHRINK_STEPS): number | null {
  const ladder = [...spec.sizes].sort((a, b) => b - a).slice(0, steps + 1);
  for (const size of ladder) {
    if (heightAt(text, size, spec) <= spec.box.h) return size;
  }
  return null;
}

/** True when this copy cannot be set without shrinking past the allowance. */
export const needsSplit = (text: string, spec: FitSpec, steps = MAX_SHRINK_STEPS): boolean =>
  text.trim() !== "" && sizeWithin(text, spec, steps) === null;

/* ── where to cut ─────────────────────────────────────────────────────────── */

/** Every index just past a sentence-ending punctuation run followed by space. */
function sentenceBreaks(text: string): number[] {
  const out: number[] = [];
  const re = /[.!?]["')\]]*\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m.index + m[0].length);
  return out;
}

const lineBreaks = (text: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") out.push(i + 1);
  return out;
};

const wordBreaks = (text: string): number[] => {
  const out: number[] = [];
  for (let i = 1; i < text.length - 1; i += 1) if (/\s/.test(text[i] ?? "")) out.push(i + 1);
  return out;
};

/**
 * The candidate closest to the middle.
 *
 * Middle rather than "as much as fits": a greedy first cut leaves a long slide
 * and a stub, which looks like a mistake. Halving twice produces four even
 * slides; greedy-cutting four times produces three full ones and a fragment.
 */
function bestBreak(text: string): number | null {
  for (const candidates of [sentenceBreaks(text), lineBreaks(text), wordBreaks(text)]) {
    const usable = candidates.filter((i) => i > 0 && i < text.length);
    if (usable.length === 0) continue;
    const middle = text.length / 2;
    return usable.reduce((a, b) => (Math.abs(a - middle) <= Math.abs(b - middle) ? a : b));
  }
  return null;
}

/** Guards against a pathological input splitting forever. */
const MAX_PIECES = 12;

/**
 * Splits copy until every piece fits without shrinking past the allowance.
 *
 * Never rewords, never drops a character: concatenating the result with a space
 * reproduces the input's words in order.
 */
export function splitToFit(text: string, spec: FitSpec, steps = MAX_SHRINK_STEPS): string[] {
  const trimmed = text.trim();
  if (trimmed === "" || !needsSplit(trimmed, spec, steps)) return [trimmed];

  const out: string[] = [];
  const queue = [trimmed];

  while (queue.length > 0 && out.length + queue.length < MAX_PIECES) {
    const piece = queue.shift();
    if (piece === undefined) break;

    if (!needsSplit(piece, spec, steps)) {
      out.push(piece);
      continue;
    }

    const at = bestBreak(piece);
    if (at === null) {
      // Unsplittable — one enormous word. Better whole and small than cut.
      out.push(piece);
      continue;
    }

    queue.unshift(piece.slice(0, at).trim(), piece.slice(at).trim());

    // A break that produced nothing usable would loop forever; take it as-is.
    if (queue[0] === "" || queue[1] === "") {
      queue.length = 0;
      out.push(piece);
    }
  }

  return [...out, ...queue].filter((p) => p !== "");
}

/* ── slide-level operations, for the editor ───────────────────────────────── */

/** The layer carrying a slide's copy: the biggest non-empty text layer. */
export function mainText(slide: Slide): Layer | undefined {
  const texts = slide.layers.filter((l) => l.kind === "text" && (l.text ?? "").trim() !== "");
  if (texts.length === 0) return undefined;
  return texts.reduce((a, b) => ((a.fontSize ?? 0) >= (b.fontSize ?? 0) ? a : b));
}

export const measureOf = (l: Layer): Measure => ({
  // The id, not fontStack(id): Measure.family is keyed against FAMILY_SCALE.
  family: l.fontFamily,
  letterSpacing: l.letterSpacing,
  uppercase: l.uppercase,
});

/**
 * Splits one slide into two, keeping everything else on both.
 *
 * The second slide is a copy of the first with the other half of the copy, so
 * decoration, background and any hand-drawn shape survive the split. That is
 * occasionally more than someone wanted — a duplicated photo, say — but the
 * alternative loses work, and undo is one keystroke.
 */
export function splitSlide(doc: Doc, index: number): Doc {
  const slide = doc.slides[index];
  if (!slide) return doc;

  const layer = mainText(slide);
  if (!layer) return doc;

  const at = bestBreak((layer.text ?? "").trim());
  if (at === null) return doc;

  const head = (layer.text ?? "").slice(0, at).trim();
  const tail = (layer.text ?? "").slice(at).trim();
  if (!head || !tail) return doc;

  // Every layer on the copy needs a fresh id, the split text layer included.
  // Two layers sharing an id across slides breaks selection, undo and sync,
  // and it is invisible until one of those misbehaves.
  const withText = (s: Slide, text: string, suffix: string): Slide => ({
    ...s,
    id: `${s.id}${suffix}`,
    layers: s.layers.map((l) =>
      l.id === layer.id ? { ...l, id: `${l.id}${suffix}`, text } : { ...l, id: `${l.id}${suffix}` },
    ),
  });

  return {
    ...doc,
    slides: [
      ...doc.slides.slice(0, index),
      { ...slide, layers: slide.layers.map((l) => (l.id === layer.id ? { ...l, text: head } : l)) },
      withText(slide, tail, "_s"),
      ...doc.slides.slice(index + 1),
    ],
  };
}

/** Merges the slide at `index` into the one before it, joining the copy. */
export function mergeSlideUp(doc: Doc, index: number): Doc {
  if (index <= 0 || index >= doc.slides.length) return doc;

  const prev = doc.slides[index - 1];
  const here = doc.slides[index];
  if (!prev || !here) return doc;

  const into = mainText(prev);
  const from = mainText(here);
  if (!into || !from) return doc;

  const joined = `${(into.text ?? "").trim()}\n\n${(from.text ?? "").trim()}`.trim();

  return {
    ...doc,
    slides: [
      ...doc.slides.slice(0, index - 1),
      { ...prev, layers: prev.layers.map((l) => (l.id === into.id ? { ...l, text: joined } : l)) },
      ...doc.slides.slice(index + 1),
    ],
  };
}

export const canSplit = (slide: Slide | undefined): boolean => {
  if (!slide) return false;
  const layer = mainText(slide);
  return layer !== undefined && bestBreak((layer.text ?? "").trim()) !== null;
};

export const canMergeUp = (doc: Doc, index: number): boolean =>
  index > 0 &&
  mainText(doc.slides[index - 1] as Slide) !== undefined &&
  mainText(doc.slides[index] as Slide) !== undefined;

/* ── finding what overflows, across a batch ───────────────────────────────── */

export type Overflow = { docId: string; docName: string; slide: number; layerId: string };

/**
 * Every text layer in a set of documents that does not fit its own box.
 *
 * Reported rather than fixed, because the remedy is a judgement: another slide
 * changes the deck's length, which is the user's call and not the tool's.
 */
export function findOverflows(docs: readonly Doc[]): Overflow[] {
  const out: Overflow[] = [];

  for (const doc of docs) {
    doc.slides.forEach((slide, i) => {
      for (const l of slide.layers) {
        if (l.kind !== "text" || !(l.text ?? "").trim() || !l.visible) continue;
        const size = l.fontSize ?? 0;
        const lines = lineCount(l.text ?? "", size, l.w, measureOf(l));
        if (lines * size * (l.lineHeight ?? 1.2) > l.h + 1) {
          out.push({ docId: doc.id, docName: doc.name, slide: i + 1, layerId: l.id });
        }
      }
    });
  }

  return out;
}

/** Splits every overflowing slide in a document, lowest index first. */
export function splitOverflowing(doc: Doc): Doc {
  let next = doc;
  for (let guard = 0; guard < MAX_PIECES; guard += 1) {
    const bad = findOverflows([next])[0];
    if (!bad) break;
    const before = next.slides.length;
    next = splitSlide(next, bad.slide - 1);
    // Nothing moved: the layer cannot be split, so stop rather than spin.
    if (next.slides.length === before) break;
  }
  return next;
}

