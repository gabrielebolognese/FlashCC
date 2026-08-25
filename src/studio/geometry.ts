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
export function snap(
  moving: Rect,
  others: Rect[],
  artboard: { w: number; h: number },
  tolerance: number,
): { dx: number; dy: number; guides: Guide[] } {
  const xTargets: number[] = [0, artboard.w / 2, artboard.w];
  const yTargets: number[] = [0, artboard.h / 2, artboard.h];

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
