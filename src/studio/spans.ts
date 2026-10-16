/**
 * Layers that run across a slide edge (Batch 23).
 *
 * ── A spanning layer is several ordinary layers ─────────────────────────────
 *
 * This is the whole design, and the reason the feature is possible at all. A
 * circle dropped across the edge between slides 2 and 3 is committed as TWO
 * plain layers, one on each slide, the right-hand piece at `x - W`, both
 * carrying the same `spanId`. Each slide clips and renders its own piece alone,
 * so nothing is computed at render time (invariant 1), the painter is unchanged
 * (invariant 3), and a slide exported, previewed or shared on its own is still
 * exactly what it says it is.
 *
 * Coordinates: the STRIP is every slide side by side with no gap, so slide `i`
 * starts at `i * W`. A piece on slide `i` at `x` sits at strip x `i * W + x`,
 * and every piece of one span agrees on that number. That agreement is the seam.
 *
 * Pure and DOM-free, like geometry.ts: this is where a seamless deck breaks.
 */
import type { Doc, Layer, Slide } from "./model.js";

export type Board = { w: number; h: number };

/** Strip x of a layer on slide `i`. */
export const stripX = (i: number, x: number, W: number): number => i * W + x;

/**
 * The slides a layer at strip x `sx` touches, first to last, clamped to the
 * deck. A rotated or stroked layer touches what its drawn extent touches, not
 * just its box. A layer that only meets an edge does not touch the slide past it.
 */
export function touchedSlides(l: Pick<Layer, "w" | "h" | "rotation" | "strokeWidth">, sx: number, W: number, n: number): number[] {
  const a = ((l.rotation ?? 0) * Math.PI) / 180;
  const halfW = (Math.abs(l.w * Math.cos(a)) + Math.abs(l.h * Math.sin(a))) / 2 + (l.strokeWidth ?? 0) / 2;
  const cx = sx + l.w / 2;
  const left = cx - halfW;
  const right = cx + halfW;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) if (left < (i + 1) * W && right > i * W) out.push(i);
  if (out.length === 0) out.push(Math.max(0, Math.min(n - 1, Math.floor(cx / W))));
  return out;
}

export type Piece = { slide: number; index: number; layer: Layer };

/** Every piece of a span, in slide order. */
export function piecesOf(doc: Pick<Doc, "slides">, spanId: string): Piece[] {
  const out: Piece[] = [];
  doc.slides.forEach((s, slide) =>
    s.layers.forEach((layer, index) => {
      if (layer.spanId === spanId) out.push({ slide, index, layer });
    }),
  );
  return out;
}

/** The layer and its slide, by id. */
export function findLayer(doc: Pick<Doc, "slides">, id: string): Piece | null {
  for (let slide = 0; slide < doc.slides.length; slide += 1) {
    const index = doc.slides[slide]!.layers.findIndex((l) => l.id === id);
    if (index >= 0) return { slide, index, layer: doc.slides[slide]!.layers[index]! };
  }
  return null;
}

/** The pieces a layer belongs to: its span's, or just itself. */
export function family(doc: Pick<Doc, "slides">, id: string): Piece[] {
  const hit = findLayer(doc, id);
  if (!hit) return [];
  return hit.layer.spanId ? piecesOf(doc, hit.layer.spanId) : [hit];
}

/**
 * Puts a layer, given at strip coordinates, onto every slide it touches.
 *
 * `existing` are the pieces it had before (empty for a new layer). A slide that
 * already held a piece keeps that piece, its id, its z-position and anything
 * restyled on it in single-slide view; only its position changes. A slide the
 * layer reaches for the first time gets a copy of the nearest piece, on top.
 * A slide it no longer reaches loses its piece. One slide touched means a
 * plain layer again: no `spanId`.
 */
export function place(
  doc: Doc,
  at: { x: number; y: number },
  existing: readonly Piece[],
  template: Layer,
  ids: { span: () => string; layer: () => string },
  /** The id that must survive, the one being dragged: it stays selected whatever the span becomes. */
  keepId?: string,
  /** Where a slide's new piece goes: on top (the default), or at the back for a background. */
  z: "top" | "bottom" = "top",
): Doc {
  const W = doc.width;
  const n = doc.slides.length;
  const slides = touchedSlides(template, at.x, W, n);
  const spanId = slides.length > 1 ? (template.spanId ?? ids.span()) : undefined;
  const bySlide = new Map(existing.map((p) => [p.slide, p]));
  const firstId = keepId ?? existing[0]?.layer.id ?? template.id;

  const nearest = (i: number): Layer => {
    let best: Piece | undefined;
    for (const p of existing) if (!best || Math.abs(p.slide - i) < Math.abs(best.slide - i)) best = p;
    return best?.layer ?? template;
  };

  // The first id survives the move when it can, so whatever had it selected
  // still has it: on its own slide if that is still touched, else on the first
  // new piece.
  let firstFree = !slides.some((i) => bySlide.get(i)?.layer.id === firstId);
  const pieces = new Map<number, Layer>();
  for (const i of slides) {
    const own = bySlide.get(i)?.layer;
    let id: string;
    if (own) id = own.id;
    else if (firstFree) {
      id = firstId;
      firstFree = false;
    } else id = ids.layer();
    // Size comes from the template: the same for a move, the new size for a reflow.
    pieces.set(i, { ...(own ?? nearest(i)), id, x: at.x - i * W, y: at.y, w: template.w, h: template.h, spanId });
  }
  // Still not placed: its slide is gone and every remaining slide had a piece.
  // The first piece takes it over, so the selection follows the drag.
  if (firstFree) {
    const head = pieces.get(slides[0]!)!;
    pieces.set(slides[0]!, { ...head, id: firstId });
  }

  const gone = new Set(existing.map((p) => p.layer.id));
  return {
    ...doc,
    slides: doc.slides.map((s, i): Slide => {
      const piece = pieces.get(i);
      const had = bySlide.get(i);
      if (!piece && !had) return s;
      if (had && piece) return { ...s, layers: s.layers.map((l) => (l.id === had.layer.id ? piece : l)) };
      const kept = s.layers.filter((l) => !gone.has(l.id));
      if (!piece) return { ...s, layers: kept };
      return { ...s, layers: z === "bottom" ? [piece, ...kept] : [...kept, piece] };
    }),
  };
}

/** The strip position of a piece group: where its first piece says the whole layer is. */
export function stripPosition(doc: Pick<Doc, "width">, pieces: readonly Piece[]): { x: number; y: number } | null {
  const p = pieces[0];
  return p ? { x: stripX(p.slide, p.layer.x, doc.width), y: p.layer.y } : null;
}

/**
 * Moves a layer, or every piece of its span, by `dx`, `dy` in strip
 * coordinates. Dragging a layer over an edge is how a span is made; dragging it
 * back onto one slide unmakes it.
 */
export function moveAcross(doc: Doc, id: string, dx: number, dy: number, ids: { span: () => string; layer: () => string }): Doc {
  const pieces = family(doc, id);
  const at = stripPosition(doc, pieces);
  if (!at || pieces.length === 0) return doc;
  return place(doc, { x: at.x + dx, y: at.y + dy }, pieces, pieces[0]!.layer, ids, id);
}

/** Adds a new layer given in strip coordinates, split across whatever it touches. */
export function addAcross(
  doc: Doc,
  layer: Layer,
  ids: { span: () => string; layer: () => string },
  z: "top" | "bottom" = "top",
): Doc {
  return place(doc, { x: layer.x, y: layer.y }, [], { ...layer, spanId: undefined }, ids, undefined, z);
}

/** The pieces become independent layers and keep their positions (23.5). */
export function unspan(doc: Doc, spanId: string): Doc {
  return {
    ...doc,
    slides: doc.slides.map((s) =>
      s.layers.some((l) => l.spanId === spanId)
        ? { ...s, layers: s.layers.map((l) => (l.spanId === spanId ? { ...l, spanId: undefined } : l)) }
        : s,
    ),
  };
}

export type SpanProblem = {
  spanId: string;
  slides: number[];
  /**
   * apart: the pieces are no longer on neighbouring slides (a reorder, or a
   * slide inserted inside the span). offset: they disagree about where the
   * layer is (one was moved alone). missing: the layer reaches a slide that
   * holds no piece of it.
   */
  reason: "apart" | "offset" | "missing";
};

/** Every span whose seam is broken. Never repaired silently: the studio offers Unspan. */
export function brokenSpans(doc: Pick<Doc, "slides" | "width">): SpanProblem[] {
  const ids = new Set<string>();
  for (const s of doc.slides) for (const l of s.layers) if (l.spanId) ids.add(l.spanId);
  const out: SpanProblem[] = [];
  for (const spanId of ids) {
    const pieces = piecesOf(doc, spanId);
    const slides = pieces.map((p) => p.slide);
    const apart = slides.some((s, k) => k > 0 && s !== slides[k - 1]! + 1);
    if (apart) {
      out.push({ spanId, slides, reason: "apart" });
      continue;
    }
    const xs = pieces.map((p) => Math.round(stripX(p.slide, p.layer.x, doc.width) * 100) / 100);
    const ys = pieces.map((p) => p.layer.y);
    if (xs.some((x) => Math.abs(x - xs[0]!) > 0.5) || ys.some((y) => Math.abs(y - ys[0]!) > 0.5)) {
      out.push({ spanId, slides, reason: "offset" });
      continue;
    }
    const want = touchedSlides(pieces[0]!.layer, xs[0]!, doc.width, doc.slides.length);
    if (want.some((i) => !slides.includes(i))) out.push({ spanId, slides, reason: "missing" });
  }
  return out;
}

/** links[i]: a span crosses the edge between slide i and i+1. The export renders linked runs as one strip. */
export function links(doc: Pick<Doc, "slides">): boolean[] {
  const out = doc.slides.slice(0, -1).map(() => false);
  for (let i = 0; i + 1 < doc.slides.length; i += 1) {
    const here = new Set(doc.slides[i]!.layers.flatMap((l) => (l.spanId ? [l.spanId] : [])));
    out[i] = doc.slides[i + 1]!.layers.some((l) => l.spanId !== undefined && here.has(l.spanId));
  }
  return out;
}

/** Runs of slides joined by spans: [[0,1,2],[3],[4,5]]. */
export function runs(doc: Pick<Doc, "slides">): number[][] {
  const l = links(doc);
  const out: number[][] = [];
  let run: number[] = [];
  doc.slides.forEach((_, i) => {
    run.push(i);
    if (!l[i]) {
      out.push(run);
      run = [];
    }
  });
  if (run.length) out.push(run);
  return out;
}

export const isSpanning = (doc: Pick<Doc, "slides">): boolean => doc.slides.some((s) => s.layers.some((l) => l.spanId));

/**
 * Every span as one layer at strip coordinates, plus where its pieces sat.
 * What reflow (23.5) works on: a seam survives a format switch only if the
 * span is reflowed as one layer on the strip and split again.
 */
export function joinedSpans(doc: Pick<Doc, "slides" | "width">): { spanId: string; layer: Layer; pieces: Piece[] }[] {
  const ids: string[] = [];
  for (const s of doc.slides) for (const l of s.layers) if (l.spanId && !ids.includes(l.spanId)) ids.push(l.spanId);
  return ids.map((spanId) => {
    const pieces = piecesOf(doc, spanId);
    const at = stripPosition(doc, pieces)!;
    return { spanId, layer: { ...pieces[0]!.layer, x: at.x, y: at.y }, pieces };
  });
}
