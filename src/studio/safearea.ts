/**
 * Pulling a laid-out slide clear of a platform's chrome.
 *
 * ── The gap this fills ───────────────────────────────────────────────────────
 *
 * `compositions.ts` lays out for one artboard and `reflow.ts` moves that layout
 * to another. Neither knows anything about the DESTINATION — and it is the
 * destination that decides where an action rail sits, or a caption, or a nav
 * bar. So a deck reflowed to TikTok's 1080×1920 kept its 96px side margins and
 * put every headline under the action rail, which covers the right 180px of
 * every slide. Thirteen warnings on a six-slide deck, all of them true.
 *
 * Raising the generation margin cannot fix that. TikTok's rail alone would want
 * 180 on the right, its caption band wants 480 at the bottom, and a single
 * constant big enough for those would make LinkedIn and Instagram — the
 * platforms most decks are actually for — needlessly narrow. The margin belongs
 * to the artboard; the chrome belongs to the platform.
 *
 * ── Uniform scale, not per-axis clamping ─────────────────────────────────────
 *
 * The obvious fix is to clamp each layer into the box individually. It is also
 * wrong: a headline and the rule underneath it would move by different amounts,
 * and a composition that was aligned stops being aligned. Everything that is not
 * deliberately full-bleed moves together, by one factor, about one origin.
 *
 * ── Full bleed is a decision ─────────────────────────────────────────────────
 *
 * A band spanning the full width is the commonest deliberate shape in this
 * product — every framework's closing block is one. Those are left exactly where
 * they are, per axis, and are not counted when working out how far the rest has
 * to move.
 *
 * Pure and DOM-free.
 */

import type { Doc, Layer, Slide } from "./model.js";
import { safeBox, type Platform } from "./platforms.js";

/** Half a pixel, because a reflow lands a full-width layer at 1079.9997. */
const EPSILON = 0.5;

export const bleedsX = (l: Layer, width: number): boolean =>
  l.x <= EPSILON && l.x + l.w >= width - EPSILON;

export const bleedsY = (l: Layer, height: number): boolean =>
  l.y <= EPSILON && l.y + l.h >= height - EPSILON;

/** A layer nothing should move: it was drawn to run off both edges. */
const isFullBleed = (l: Layer, w: number, h: number): boolean => bleedsX(l, w) && bleedsY(l, h);

export type Box = { x: number; y: number; w: number; h: number };

/**
 * The extent of everything that can be moved.
 *
 * Full-bleed layers are excluded on the axis they bleed on, because including
 * them would report a span of the whole artboard and conclude that nothing can
 * fit — the correction would then be a scale factor of about 0.8 applied to a
 * slide that needed no correction at all.
 */
export function movableBounds(slide: Slide, w: number, h: number): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;

  for (const l of slide.layers) {
    if (!l.visible || isFullBleed(l, w, h)) continue;

    if (!bleedsX(l, w)) {
      x0 = Math.min(x0, l.x);
      x1 = Math.max(x1, l.x + l.w);
    }
    if (!bleedsY(l, h)) {
      y0 = Math.min(y0, l.y);
      y1 = Math.max(y1, l.y + l.h);
    }
  }

  if (x0 === Infinity && y0 === Infinity) return null;

  // An axis where everything bled is not a constraint, so it reports the whole
  // artboard and contributes a scale factor of 1 rather than infinity.
  const left = x0 === Infinity ? 0 : x0;
  const top = y0 === Infinity ? 0 : y0;
  const right = x1 === -Infinity ? w : x1;
  const bottom = y1 === -Infinity ? h : y1;

  return { x: left, y: top, w: right - left, h: bottom - top };
}

export type Transform = { scale: number; dx: number; dy: number };

export const IDENTITY: Transform = { scale: 1, dx: 0, dy: 0 };

/**
 * What it takes to get `bounds` inside `box`.
 *
 * Scale is uniform and never above 1 — this only ever pulls content in. A slide
 * already inside the box is left alone rather than stretched out to fill it,
 * because "it fits" and "it should be bigger" are different questions and only
 * one of them was asked.
 */
export function transformFor(bounds: Box, box: Box): Transform {
  const scale = Math.min(
    1,
    bounds.w > 0 ? box.w / bounds.w : 1,
    bounds.h > 0 ? box.h / bounds.h : 1,
  );

  // Scaled about the bounds' own top-left, then nudged in whichever direction
  // still hangs over an edge. Centring instead would move content that was
  // deliberately hard against the left margin.
  const w = bounds.w * scale;
  const h = bounds.h * scale;

  let x = bounds.x * scale;
  let y = bounds.y * scale;

  if (x < box.x) x = box.x;
  if (y < box.y) y = box.y;
  if (x + w > box.x + box.w) x = box.x + box.w - w;
  if (y + h > box.y + box.h) y = box.y + box.h - h;

  return { scale, dx: x - bounds.x * scale, dy: y - bounds.y * scale };
}

export const isIdentity = (t: Transform): boolean =>
  Math.abs(t.scale - 1) < 0.001 && Math.abs(t.dx) < 0.5 && Math.abs(t.dy) < 0.5;

/**
 * Applies it, leaving each full-bleed axis alone.
 *
 * `fontSize` scales with the box, because a layer made 7% narrower with its type
 * unchanged is a layer whose text no longer fits — which is the "some text
 * ending up too small to read" complaint arriving from the other direction.
 * Stroke width does not: a 2px rule is 2px because thinner than that disappears
 * after the platform recompresses it, and that floor is absolute.
 */
export function applyTransform(l: Layer, t: Transform, w: number, h: number): Layer {
  const fixedX = bleedsX(l, w);
  const fixedY = bleedsY(l, h);
  if (fixedX && fixedY) return l;

  const next: Layer = {
    ...l,
    x: fixedX ? l.x : l.x * t.scale + t.dx,
    y: fixedY ? l.y : l.y * t.scale + t.dy,
    w: fixedX ? l.w : l.w * t.scale,
    h: fixedY ? l.h : l.h * t.scale,
  };

  if (l.kind === "text" && l.fontSize) {
    // FLOOR, not round. The box shrinks by exactly `scale`; a font rounded UP is
    // proportionally larger than the box it now sits in, and one extra wrapped
    // line is all it takes to push the layer out the bottom. Half a point of
    // type is invisible; an overflowing slide is not.
    next.fontSize = Math.max(1, Math.floor(l.fontSize * t.scale));
  }
  return next;
}

/**
 * One slide, moved clear of the chrome.
 *
 * Returns the same object when nothing needed moving, so this can run on every
 * format change without every slide looking edited.
 */
export function fitSlide(slide: Slide, box: Box, w: number, h: number): Slide {
  const bounds = movableBounds(slide, w, h);
  if (!bounds) return slide;

  const t = transformFor(bounds, box);
  if (isIdentity(t)) return slide;

  return { ...slide, layers: slide.layers.map((l) => applyTransform(l, t, w, h)) };
}

/**
 * The whole document, against one platform's chrome.
 *
 * `safeScope` is honoured: Instagram's box is a profile-grid crop that only ever
 * applies to the cover, so slides 2 onward are left exactly as they were. Moving
 * them would shrink nine slides to satisfy a constraint that cannot reach them.
 */
export function fitToSafeArea(doc: Doc, platform: Platform): Doc {
  const box = safeBox(platform, doc.width, doc.height);
  let touched = false;

  const slides = doc.slides.map((slide, i) => {
    if (platform.safeScope === "first" && i > 0) return slide;
    const next = fitSlide(slide, box, doc.width, doc.height);
    if (next !== slide) touched = true;
    return next;
  });

  return touched ? { ...doc, slides } : doc;
}
