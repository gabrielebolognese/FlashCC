/** Pure geometry for the canvas: bounds, resize handles, snapping. No React, no DOM. */
import type { Layer } from "./model.js";

export type Rect = { x: number; y: number; w: number; h: number };
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export const CURSOR: Record<Handle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

export const rectOf = (l: Layer): Rect => ({ x: l.x, y: l.y, w: l.w, h: l.h });

/** Bounding box of a selection. */
export function bounds(layers: Layer[]): Rect | null {
  if (layers.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of layers) {
    x0 = Math.min(x0, l.x);
    y0 = Math.min(y0, l.y);
    x1 = Math.max(x1, l.x + l.w);
    y1 = Math.max(y1, l.y + l.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const contains = (r: Rect, px: number, py: number): boolean =>
  px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

export const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function normalize(r: Rect): Rect {
  return {
    x: r.w < 0 ? r.x + r.w : r.x,
    y: r.h < 0 ? r.y + r.h : r.y,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}

const MIN = 4;

/** Resize a rect by dragging one handle. `constrain` keeps the aspect ratio. */
export function resize(r: Rect, handle: Handle, dx: number, dy: number, constrain = false): Rect {
  let { x, y, w, h } = r;

  if (handle.includes("w")) {
    x = r.x + dx;
    w = r.w - dx;
  }
  if (handle.includes("e")) w = r.w + dx;
  if (handle.includes("n")) {
    y = r.y + dy;
    h = r.h - dy;
  }
  if (handle.includes("s")) h = r.h + dy;

  if (constrain && r.w > 0 && r.h > 0 && handle.length === 2) {
    const ratio = r.w / r.h;
    if (Math.abs(w - r.w) > Math.abs(h - r.h)) h = w / ratio;
    else w = h * ratio;
    if (handle.includes("n")) y = r.y + (r.h - h);
    if (handle.includes("w")) x = r.x + (r.w - w);
  }

  if (w < MIN) {
    if (handle.includes("w")) x = r.x + r.w - MIN;
    w = MIN;
  }
  if (h < MIN) {
    if (handle.includes("n")) y = r.y + r.h - MIN;
    h = MIN;
  }
  return { x, y, w, h };
}

/* ── snapping ─────────────────────────────────────────────────────────── */

export type Guide = { axis: "x" | "y"; at: number };

/**
 * Snap a moving rect to the artboard's edges and centre, and to the edges and
 * centres of the other layers. Returns the correction to apply plus the guides to
 * draw, so the user can see why it snapped.
 */
/**
 * Lines worth snapping to that are not layers: the composition's margins and the
 * active platform's safe-zone edges (18.1). Passed in rather than worked out
 * here, so this file stays about rectangles and never learns what a platform is.
 */
export type Targets = { x: number[]; y: number[] };

export function snap(
  moving: Rect,
  others: Rect[],
  artboard: { w: number; h: number },
  tolerance: number,
  extra: Targets = { x: [], y: [] },
): { dx: number; dy: number; guides: Guide[] } {
  const xTargets: number[] = [0, artboard.w / 2, artboard.w, ...extra.x];
  const yTargets: number[] = [0, artboard.h / 2, artboard.h, ...extra.y];

  for (const o of others) {
    xTargets.push(o.x, o.x + o.w / 2, o.x + o.w);
    yTargets.push(o.y, o.y + o.h / 2, o.y + o.h);
  }

  const xEdges = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const yEdges = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];

  let dx = 0;
  let dy = 0;
  let bestX = tolerance;
  let bestY = tolerance;
  const guides: Guide[] = [];

  for (const edge of xEdges) {
    for (const t of xTargets) {
      const d = t - edge;
      if (Math.abs(d) < bestX) {
        bestX = Math.abs(d);
        dx = d;
      }
    }
  }
  for (const edge of yEdges) {
    for (const t of yTargets) {
      const d = t - edge;
      if (Math.abs(d) < bestY) {
        bestY = Math.abs(d);
        dy = d;
      }
    }
  }

  if (dx !== 0) {
    for (const edge of xEdges) {
      const at = edge + dx;
      if (xTargets.some((t) => Math.abs(t - at) < 0.5)) guides.push({ axis: "x", at });
    }
  }
  if (dy !== 0) {
    for (const edge of yEdges) {
      const at = edge + dy;
      if (yTargets.some((t) => Math.abs(t - at) < 0.5)) guides.push({ axis: "y", at });
    }
  }

  return { dx, dy, guides };
}

/**
 * Snapping for a RESIZE: only the edges the handle moves are pulled.
 *
 * Moving snaps the whole box by its edges and centre; a resize that did the same
 * would jump the fixed edge, which is the one thing the person holding the
 * handle did not ask to move.
 */
export function snapResize(
  box: Rect,
  handle: Handle,
  others: Rect[],
  artboard: { w: number; h: number },
  tolerance: number,
  extra: Targets = { x: [], y: [] },
): { rect: Rect; guides: Guide[] } {
  const xTargets = [0, artboard.w / 2, artboard.w, ...extra.x];
  const yTargets = [0, artboard.h / 2, artboard.h, ...extra.y];
  for (const o of others) {
    xTargets.push(o.x, o.x + o.w / 2, o.x + o.w);
    yTargets.push(o.y, o.y + o.h / 2, o.y + o.h);
  }

  const nearest = (edge: number, targets: number[]): number | null => {
    let best: number | null = null;
    let dist = tolerance;
    for (const t of targets) {
      if (Math.abs(t - edge) < dist) {
        dist = Math.abs(t - edge);
        best = t;
      }
    }
    return best;
  };

  const r = { ...box };
  const guides: Guide[] = [];

  if (handle.includes("e")) {
    const t = nearest(r.x + r.w, xTargets);
    if (t !== null && t > r.x) {
      r.w = t - r.x;
      guides.push({ axis: "x", at: t });
    }
  } else if (handle.includes("w")) {
    const t = nearest(r.x, xTargets);
    if (t !== null && t < r.x + r.w) {
      r.w += r.x - t;
      r.x = t;
      guides.push({ axis: "x", at: t });
    }
  }
  if (handle.startsWith("s")) {
    const t = nearest(r.y + r.h, yTargets);
    if (t !== null && t > r.y) {
      r.h = t - r.y;
      guides.push({ axis: "y", at: t });
    }
  } else if (handle.startsWith("n")) {
    const t = nearest(r.y, yTargets);
    if (t !== null && t < r.y + r.h) {
      r.h += r.y - t;
      r.y = t;
      guides.push({ axis: "y", at: t });
    }
  }

  return { rect: r, guides };
}

/* ── equal spacing ────────────────────────────────────────────────────── */

/**
 * One measured gap, drawn as a marker: on `axis`, from `from` to `to`, at
 * `cross` on the other axis.
 */
export type Gap = { axis: "x" | "y"; from: number; to: number; cross: number };

const overlaps = (a0: number, a1: number, b0: number, b1: number): boolean => a0 < b1 && b0 < a1;

/**
 * Pull a moving box to sit evenly between its nearest neighbours.
 *
 * On each axis, the nearest layer before it and the nearest after it, among the
 * ones it lines up with on the other axis. When the two gaps are within the
 * tolerance of each other, the box moves to make them equal and both gaps come
 * back as markers, which is the "equal spacing" hint every design tool draws.
 */
export function spacingSnap(
  moving: Rect,
  others: Rect[],
  tolerance: number,
): { dx: number; dy: number; gaps: Gap[] } {
  let dx = 0;
  let dy = 0;
  const gaps: Gap[] = [];

  const axis = (a: "x" | "y") => {
    const pos = a === "x" ? "x" : "y";
    const size = a === "x" ? "w" : "h";
    const cpos = a === "x" ? "y" : "x";
    const csize = a === "x" ? "h" : "w";

    const inLine = others.filter((o) =>
      overlaps(o[cpos], o[cpos] + o[csize], moving[cpos], moving[cpos] + moving[csize]),
    );
    const before = inLine
      .filter((o) => o[pos] + o[size] <= moving[pos] + tolerance)
      .sort((p, q) => q[pos] + q[size] - (p[pos] + p[size]))[0];
    const after = inLine
      .filter((o) => o[pos] >= moving[pos] + moving[size] - tolerance)
      .sort((p, q) => p[pos] - q[pos])[0];
    if (!before || !after) return;

    const g1 = moving[pos] - (before[pos] + before[size]);
    const g2 = after[pos] - (moving[pos] + moving[size]);
    if (g1 <= 0 || g2 <= 0 || Math.abs(g1 - g2) > tolerance * 2) return;

    const shift = (g2 - g1) / 2;
    const start = moving[pos] + shift;
    const cross = moving[cpos] + moving[csize] / 2;
    gaps.push(
      { axis: a, from: before[pos] + before[size], to: start, cross },
      { axis: a, from: start + moving[size], to: after[pos], cross },
    );
    if (a === "x") dx = shift;
    else dy = shift;
  };

  axis("x");
  axis("y");
  return { dx, dy, gaps };
}
