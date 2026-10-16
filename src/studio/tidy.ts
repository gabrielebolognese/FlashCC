/**
 * Layout tools that act once (Batch 18).
 *
 * Every function here reads the layers as they are, works out new coordinates,
 * and returns them. Nothing is stored about having run: an aligned layer is a
 * layer at a new x, and a matched headline is a headline with new numbers. That
 * is the invariant this whole file exists inside, presets run once and nothing
 * is derived, applied to the tools somebody uses after generation rather than
 * the ones that generate.
 *
 * Results are MOVES, `Map<layerId, Partial<Rect>>` or a whole new document,
 * never a mutation, so the caller sends them through the studio's own funnels
 * (`updateEach`, `commit`) and they flag `handEdited` and undo in one step like
 * any other edit.
 *
 * Pure and DOM-free.
 */

import type { Doc, Layer, Slide } from "./model.js";
import { markEdited } from "./regenerate.js";
import { layerLines } from "./text.js";

export type Box = { x: number; y: number; w: number; h: number };
export type Moves = Map<string, Partial<Box>>;

const boxOf = (l: Box): Box => ({ x: l.x, y: l.y, w: l.w, h: l.h });

function boundsOf(boxes: readonly Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/* ── groups (18.6) ────────────────────────────────────────────────────────── */

/**
 * The selection a click on `id` should produce: the layer, or its whole group.
 *
 * Groups are a shared tag, so "select the group" is just "select everything
 * carrying the tag". Done here once so the canvas, the marquee and the layers
 * list cannot disagree about it.
 */
export function withGroups(layers: readonly Layer[], ids: readonly string[]): string[] {
  const groups = new Set(
    layers.filter((l) => ids.includes(l.id) && l.groupId).map((l) => l.groupId!),
  );
  const out = new Set(ids);
  for (const l of layers) if (l.groupId && groups.has(l.groupId)) out.add(l.id);
  // Layer order, so a selection reads the same however it was built.
  return layers.filter((l) => out.has(l.id)).map((l) => l.id);
}

/** Gives the selected layers one new shared tag. Fewer than two is not a group. */
export function group(layers: readonly Layer[], ids: readonly string[], groupId: string): Layer[] {
  if (ids.length < 2) return [...layers];
  // One level only (no nested groups): grouping layers that are already in
  // groups replaces their old tag rather than putting a group inside a group.
  return layers.map((l) => (ids.includes(l.id) ? markEdited({ ...l, groupId }) : l));
}

export function ungroup(layers: readonly Layer[], ids: readonly string[]): Layer[] {
  return layers.map((l) =>
    ids.includes(l.id) && l.groupId ? markEdited({ ...l, groupId: undefined }) : l,
  );
}

/**
 * Copies of grouped layers need a group of their own.
 *
 * Duplicating a group and leaving the copies on the original tag would make one
 * six-layer group out of two three-layer ones, and the next click would select
 * both. `fresh` is called once per distinct old tag.
 */
export function regroupCopies(copies: readonly Layer[], fresh: () => string): Layer[] {
  const map = new Map<string, string>();
  return copies.map((l) => {
    if (!l.groupId) return l;
    if (!map.has(l.groupId)) map.set(l.groupId, fresh());
    return { ...l, groupId: map.get(l.groupId) };
  });
}

/**
 * The things the arranging tools move: a group as one unit, every other layer
 * as itself. Aligning three layers of which two are grouped aligns two things.
 */
export type Unit = { ids: string[]; box: Box };

export function unitsOf(layers: readonly Layer[], ids: readonly string[]): Unit[] {
  const picked = layers.filter((l) => ids.includes(l.id));
  const byGroup = new Map<string, Layer[]>();
  const units: Unit[] = [];
  for (const l of picked) {
    if (l.groupId) {
      const list = byGroup.get(l.groupId) ?? [];
      if (list.length === 0) byGroup.set(l.groupId, list);
      list.push(l);
    } else {
      units.push({ ids: [l.id], box: boxOf(l) });
    }
  }
  for (const list of byGroup.values()) {
    units.push({ ids: list.map((l) => l.id), box: boundsOf(list.map(boxOf)) });
  }
  return units;
}

/** Every layer in a unit moves by the unit's offset, so a group keeps its shape. */
function shift(moves: Moves, layers: readonly Layer[], unit: Unit, dx: number, dy: number): void {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
  for (const id of unit.ids) {
    const l = layers.find((x) => x.id === id);
    if (!l) continue;
    moves.set(id, { x: Math.round(l.x + dx), y: Math.round(l.y + dy) });
  }
}

/* ── align, distribute, equal gap, match width (18.2) ─────────────────────── */

export type Edge = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/**
 * Six directions. Against the selection's own bounds when there are several
 * things, and against the artboard when there is one, which is what "centre
 * this" means to somebody with one layer selected.
 */
export function align(
  layers: readonly Layer[],
  ids: readonly string[],
  edge: Edge,
  board: { w: number; h: number },
): Moves {
  const units = unitsOf(layers, ids);
  const moves: Moves = new Map();
  if (units.length === 0) return moves;
  const target =
    units.length === 1 ? { x: 0, y: 0, w: board.w, h: board.h } : boundsOf(units.map((u) => u.box));

  for (const u of units) {
    const b = u.box;
    const dx =
      edge === "left"
        ? target.x - b.x
        : edge === "right"
          ? target.x + target.w - (b.x + b.w)
          : edge === "hcenter"
            ? target.x + target.w / 2 - (b.x + b.w / 2)
            : 0;
    const dy =
      edge === "top"
        ? target.y - b.y
        : edge === "bottom"
          ? target.y + target.h - (b.y + b.h)
          : edge === "vcenter"
            ? target.y + target.h / 2 - (b.y + b.h / 2)
            : 0;
    shift(moves, layers, u, dx, dy);
  }
  return moves;
}

/**
 * Equal gaps between three or more things, the outer two staying put.
 *
 * Gaps, not centres: equal centres with unequal sizes leave unequal air, and
 * air is what the eye measures.
 */
export function distribute(layers: readonly Layer[], ids: readonly string[], axis: "x" | "y"): Moves {
  const units = unitsOf(layers, ids);
  const moves: Moves = new Map();
  if (units.length < 3) return moves;
  const pos = axis === "x" ? "x" : "y";
  const size = axis === "x" ? "w" : "h";
  const sorted = [...units].sort((a, b) => a.box[pos] - b.box[pos]);
  const first = sorted[0]!.box;
  const last = sorted.at(-1)!.box;
  const span = last[pos] + last[size] - first[pos];
  const used = sorted.reduce((n, u) => n + u.box[size], 0);
  const gap = (span - used) / (sorted.length - 1);

  let at = first[pos] + first[size] + gap;
  for (const u of sorted.slice(1, -1)) {
    shift(moves, layers, u, axis === "x" ? at - u.box.x : 0, axis === "y" ? at - u.box.y : 0);
    at += u.box[size] + gap;
  }
  return moves;
}

/** The step of the scale nearest to `gap`. Ties go to the smaller step. */
export function nearestStep(gap: number, scale: readonly number[]): number {
  if (scale.length === 0) return Math.max(0, Math.round(gap));
  return scale.reduce((best, s) => (Math.abs(s - gap) < Math.abs(best - gap) ? s : best), scale[0]!);
}

/**
 * Equal gaps, from the spacing scale, between two or more things.
 *
 * The first stays where it is and the rest follow it, so the gap that comes out
 * is a step of the scale (18.4) rather than whatever the average happened to be.
 */
export function equalGap(
  layers: readonly Layer[],
  ids: readonly string[],
  axis: "x" | "y",
  scale: readonly number[],
): { moves: Moves; gap: number } {
  const units = unitsOf(layers, ids);
  const moves: Moves = new Map();
  if (units.length < 2) return { moves, gap: 0 };
  const pos = axis === "x" ? "x" : "y";
  const size = axis === "x" ? "w" : "h";
  const sorted = [...units].sort((a, b) => a.box[pos] - b.box[pos]);
  const gaps = sorted.slice(1).map((u, i) => u.box[pos] - (sorted[i]!.box[pos] + sorted[i]!.box[size]));
  const gap = nearestStep(gaps.reduce((a, b) => a + b, 0) / gaps.length, scale);

  let at = sorted[0]!.box[pos] + sorted[0]!.box[size] + gap;
  for (const u of sorted.slice(1)) {
    shift(moves, layers, u, axis === "x" ? at - u.box.x : 0, axis === "y" ? at - u.box.y : 0);
    at += u.box[size] + gap;
  }
  return { moves, gap };
}


/** The height a text layer needs at a width, or null for anything that is not text. */
function textHeight(l: Layer, w: number): number | null {
  if (l.kind !== "text") return null;
  const size = l.fontSize ?? 40;
  const lh = l.lineHeight ?? 1.2;
  return layerLines(l, size, w) * size * lh;
}

/**
 * Every selected layer as wide as the widest one.
 *
 * Text is re-measured at the new width, the way reflow does it, so a narrower
 * box gets taller rather than overflowing. Groups are left alone: widening one
 * member of a group would pull it out of the shape the group was made for.
 */
export function matchWidth(layers: readonly Layer[], ids: readonly string[]): Moves {
  const picked = layers.filter((l) => ids.includes(l.id) && !l.groupId);
  const moves: Moves = new Map();
  if (picked.length < 2) return moves;
  const w = Math.max(...picked.map((l) => l.w));
  for (const l of picked) {
    if (l.w === w) continue;
    const h = textHeight(l, w);
    moves.set(l.id, { w, ...(h !== null ? { h: Math.ceil(h) } : {}) });
  }
  return moves;
}

/* ── Tidy slide ───────────────────────────────────────────────────────────── */

export type TidyResult = {
  moves: Moves;
  /** The step every gap became. */
  gap: number;
  /** Layers left exactly where they were because their order was ambiguous. */
  pinned: string[];
};

/** Wider than this share of the board, and as tall, it is a background. */
const BACKDROP = 0.9;

const contains = (a: Box, b: Box): boolean =>
  b.x >= a.x - 0.5 && b.y >= a.y - 0.5 && b.x + b.w <= a.x + a.w + 0.5 && b.y + b.h <= a.y + a.h + 0.5;

const intersects = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * With nothing selected: read the slide top to bottom and re-space it.
 *
 * - **Rows**, not layers. Layers whose vertical extents overlap are one row
 *   and move together, so two things side by side stay side by side, and a
 *   colour block keeps the text sitting on it.
 * - **Reading order never changes**, and nothing is resized. It moves boxes.
 * - **Ambiguity is reported, not guessed at.** A row in which two layers
 *   partly overlap, neither containing the other, has no clear order, so it
 *   stays exactly where it is and its layers come back in `pinned`.
 * - Backgrounds, locked and hidden layers are not part of it.
 *
 * Every gap between rows becomes the scale step nearest their average, and the
 * stack keeps its vertical centre, which is where every composition puts it.
 * With a pinned row in the middle the top stays put instead, because there is
 * no single centre to keep.
 */
export function tidySlide(
  slide: Slide,
  board: { w: number; h: number },
  scale: readonly number[],
): TidyResult {
  const empty: TidyResult = { moves: new Map(), gap: 0, pinned: [] };
  const movable = slide.layers.filter(
    (l) =>
      l.visible &&
      !l.locked &&
      !(l.w >= board.w * BACKDROP && l.h >= board.h * BACKDROP),
  );
  if (movable.length < 2) return empty;

  // Rows: connected components of vertical overlap.
  const sorted = [...movable].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Layer[][] = [];
  let bottom = -Infinity;
  for (const l of sorted) {
    const row = rows.at(-1);
    if (row && l.y < bottom - 0.5) {
      row.push(l);
      bottom = Math.max(bottom, l.y + l.h);
    } else {
      rows.push([l]);
      bottom = l.y + l.h;
    }
  }
  if (rows.length < 2) return empty;

  const ambiguous = (row: Layer[]): boolean =>
    row.some((a, i) =>
      row.slice(i + 1).some((b) => intersects(a, b) && !contains(a, b) && !contains(b, a)),
    );

  const info = rows.map((row) => ({ row, box: boundsOf(row.map(boxOf)), pinned: ambiguous(row) }));
  const pinned = info.filter((r) => r.pinned).flatMap((r) => r.row.map((l) => l.id));

  const gaps: number[] = [];
  info.slice(1).forEach((r, i) => {
    if (!r.pinned && !info[i]!.pinned) gaps.push(r.box.y - (info[i]!.box.y + info[i]!.box.h));
  });
  if (gaps.length === 0) return { ...empty, pinned };
  const gap = nearestStep(gaps.reduce((a, b) => a + b, 0) / gaps.length, scale);

  // Lay the rows out from the top, then slide the whole stack to keep its centre.
  const tops: number[] = [];
  let cursor = info[0]!.box.y;
  info.forEach((r, i) => {
    if (i === 0 || r.pinned) {
      tops.push(r.box.y);
    } else {
      // After a pinned row, carry on from wherever it actually ends.
      tops.push(cursor + gap);
    }
    cursor = tops[i]! + r.box.h;
  });

  let offset = 0;
  if (pinned.length === 0) {
    const oldTop = info[0]!.box.y;
    const oldBottom = info.at(-1)!.box.y + info.at(-1)!.box.h;
    const newBottom = tops.at(-1)! + info.at(-1)!.box.h;
    offset = (oldTop + oldBottom) / 2 - (oldTop + newBottom) / 2;
  }

  const moves: Moves = new Map();
  info.forEach((r, i) => {
    if (r.pinned) return;
    const dy = tops[i]! + offset - r.box.y;
    if (Math.abs(dy) < 0.5) return;
    for (const l of r.row) moves.set(l.id, { y: Math.round(l.y + dy) });
  });

  return { moves, gap, pinned };
}

/** Applies moves to a list of layers, flagging what moved as hand-edited. */
export function applyMoves(layers: readonly Layer[], moves: Moves): Layer[] {
  return layers.map((l) => {
    const m = moves.get(l.id);
    return m ? markEdited({ ...l, ...m }) : l;
  });
}

/* ── Match across slides (18.3) ───────────────────────────────────────────── */

export type MatchResult = {
  doc: Doc;
  /** 1-based slides whose layer took the source's numbers. */
  matched: number[];
  /** 1-based slides with no layer of that kind and name, or more than one. */
  skipped: number[];
  /** 1-based slides where the matched text no longer fits its box. */
  overflow: number[];
};

/**
 * What makes two layers "the same layer" on different slides.
 *
 * The compositions stamp every layer with a name, Heading, Body, Number,
 * Title, and that name IS the stamped role: there is no separate role field,
 * and adding one would bring back the semantic document the Photoshop-model
 * rewrite removed. Kind as well as name, so a rectangle someone renamed
 * "Heading" is never handed a type size.
 */
const sameRole = (a: Layer, b: Layer): boolean => a.kind === b.kind && a.name === b.name;

const overflows = (l: Layer): boolean => {
  const h = textHeight(l, l.w);
  return h !== null && h > l.h + 1;
};

/**
 * Copies one layer's position, size and type size onto its counterpart on
 * other slides. A one-shot copy of numbers, not a link: change the source
 * afterwards and nothing follows.
 *
 * A slide where the match would be a guess (no counterpart, or two) is skipped
 * and named. A matched text layer that no longer fits is NOT shrunk to fit,
 * shrink-to-fit is the complaint, so it is reported by slide number instead.
 */
export function matchAcross(
  doc: Doc,
  from: number,
  layerId: string,
  only?: readonly string[] | undefined,
): MatchResult {
  const source = doc.slides[from]?.layers.find((l) => l.id === layerId);
  const result: MatchResult = { doc, matched: [], skipped: [], overflow: [] };
  if (!source) return result;

  const slides = doc.slides.map((slide, i) => {
    if (i === from || (only && !only.includes(slide.id))) return slide;
    const twins = slide.layers.filter((l) => sameRole(l, source));
    if (twins.length !== 1) {
      result.skipped.push(i + 1);
      return slide;
    }
    const twin = twins[0]!;
    const before = overflows(twin);
    const next: Layer = markEdited({
      ...twin,
      x: source.x,
      y: source.y,
      w: source.w,
      h: source.h,
      ...(source.kind === "text" && source.fontSize !== undefined ? { fontSize: source.fontSize } : {}),
    });
    result.matched.push(i + 1);
    if (!before && overflows(next)) result.overflow.push(i + 1);
    return { ...slide, layers: slide.layers.map((l) => (l.id === twin.id ? next : l)) };
  });

  return { ...result, doc: result.matched.length > 0 ? { ...doc, slides } : doc };
}
