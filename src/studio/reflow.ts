/**
 * Moving an existing slide onto a different artboard.
 *
 * The naive version, keep every layer's pixel position and just change the
 * canvas size, is what ships today, and it is the thing people describe as
 * "the spacing never survives the resize". Go from 1080×1350 to 1080×1920 and
 * the content strands in the top two-thirds with 570px of dead space beneath it.
 *
 * The other naive version is to scale everything proportionally, which is what
 * Magic Resize does and why its output is "a strong first draft, not a finished
 * file": type gets squashed or inflated, circles turn into ovals, and the margins
 * stop matching the type.
 *
 * So the rule here is split:
 *
 *   HORIZONTAL follows the board. Columns and margins are a proportion of width.
 *   VERTICAL POSITION follows the board, so a block that sat low still sits low.
 *   VERTICAL SIZE does not stretch. Type keeps its size and is re-wrapped to the
 *   new column, and its box is re-measured from the lines it actually needs.
 *
 * And it re-lays the LAYERS THAT ARE THERE rather than regenerating from the
 * source text. Regenerating would be easier and would silently delete every
 * hand-drawn shape, every moved block and every placed image, a far worse bug
 * than the one it fixes.
 */

import { fontStack, type Layer, type Slide } from "./model.js";
import { lineCount, type Measure } from "./text.js";

export type Size = { w: number; h: number };

/** A layer covering essentially the whole board is a background, not content. */
const FULL_BLEED = 0.98;

const measureOf = (l: Layer): Measure => ({
  family: fontStack(l.fontFamily),
  letterSpacing: l.letterSpacing,
  uppercase: l.uppercase,
});

function isFullBleed(l: Layer, from: Size): boolean {
  return (
    l.x <= from.w * (1 - FULL_BLEED) &&
    l.y <= from.h * (1 - FULL_BLEED) &&
    l.w >= from.w * FULL_BLEED &&
    l.h >= from.h * FULL_BLEED
  );
}

export function reflowLayer(layer: Layer, from: Size, to: Size): Layer {
  if (from.w === to.w && from.h === to.h) return layer;

  // A background follows the board exactly, or it stops being a background.
  if (isFullBleed(layer, from)) {
    return { ...layer, x: 0, y: 0, w: to.w, h: to.h };
  }

  const sx = to.w / from.w;
  const sy = to.h / from.h;
  // Uniform for anything whose proportions carry meaning. When the board only
  // grows, this is 1 and shapes are left alone rather than inflated.
  const uniform = Math.min(sx, sy);

  const x = layer.x * sx;
  const w = layer.kind === "text" ? layer.w * sx : layer.w * uniform;
  const y = layer.y * sy;

  if (layer.kind !== "text") {
    const h = layer.h * uniform;
    return {
      ...layer,
      x,
      w,
      y: Math.min(y, Math.max(0, to.h - h)),
      h,
    };
  }

  // Text keeps its size and gets re-wrapped to the new column. The box is then
  // whatever the copy actually needs, measured, not guessed.
  const size = layer.fontSize ?? 40;
  const lineHeight = layer.lineHeight ?? 1.2;
  const lines = lineCount(layer.text ?? "", size, w, measureOf(layer));
  const needed = Math.max(lines * size * lineHeight, size * lineHeight);

  return {
    ...layer,
    x,
    w,
    h: needed,
    // Keep it on the board. A block that sat near the bottom stays near the
    // bottom rather than being pushed off by its own re-measured height.
    y: Math.max(0, Math.min(y, to.h - needed)),
  };
}

export const reflowSlide = (slide: Slide, from: Size, to: Size): Slide => ({
  ...slide,
  layers: slide.layers.map((l) => reflowLayer(l, from, to)),
});

export type Doclike = { width: number; height: number; slides: Slide[] };

export function reflowDoc<T extends Doclike>(doc: T, w: number, h: number): T {
  if (doc.width === w && doc.height === h) return doc;
  const from = { w: doc.width, h: doc.height };
  const to = { w, h };
  return {
    ...doc,
    width: w,
    height: h,
    slides: doc.slides.map((s) => reflowSlide(s, from, to)),
  };
}

/**
 * How much of the board's height the content actually occupies, 0 to 1.
 *
 * Exists for the tests rather than the app: the failure this module is built to
 * prevent is content clumping in part of a taller board, and "every layer is
 * inside the artboard" does not catch that, the broken version passes it too.
 */
export function verticalFill(slide: Slide, board: Size): number {
  const content = slide.layers.filter((l) => l.visible && !isFullBleed(l, board));
  if (content.length === 0) return 0;
  const top = Math.min(...content.map((l) => l.y));
  const bottom = Math.max(...content.map((l) => l.y + l.h));
  return (bottom - top) / board.h;
}
