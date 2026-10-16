import { describe, expect, it } from "vitest";

import {
  bounds,
  contains,
  intersects,
  normalize,
  resize,
  snap,
  snapResize,
  spacingSnap,
  type Rect,
} from "./geometry.js";
import { makeLayer, type Layer } from "./model.js";

const L = (x: number, y: number, w: number, h: number): Layer =>
  makeLayer("rect", { x, y, w, h }, "#fff");

describe("bounds", () => {
  it("is null for nothing and the rect itself for one layer", () => {
    expect(bounds([])).toBeNull();
    expect(bounds([L(10, 20, 30, 40)])).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });

  it("wraps a multi-selection", () => {
    expect(bounds([L(10, 10, 10, 10), L(50, 30, 20, 20)])).toEqual({ x: 10, y: 10, w: 60, h: 40 });
  });
});

describe("resize", () => {
  const r: Rect = { x: 100, y: 100, w: 200, h: 100 };

  it("moves the dragged edge only", () => {
    expect(resize(r, "e", 50, 0)).toEqual({ x: 100, y: 100, w: 250, h: 100 });
    expect(resize(r, "s", 0, 25)).toEqual({ x: 100, y: 100, w: 200, h: 125 });
  });

  it("moves origin and size together on a west or north drag", () => {
    expect(resize(r, "w", 40, 0)).toEqual({ x: 140, y: 100, w: 160, h: 100 });
    expect(resize(r, "n", 0, 30)).toEqual({ x: 100, y: 130, w: 200, h: 70 });
  });

  it("resizes both axes from a corner", () => {
    expect(resize(r, "se", 20, 10)).toEqual({ x: 100, y: 100, w: 220, h: 110 });
    expect(resize(r, "nw", 20, 10)).toEqual({ x: 120, y: 110, w: 180, h: 90 });
  });

  it("keeps the aspect ratio when constrained", () => {
    const out = resize(r, "se", 100, 0, true);
    expect(out.w / out.h).toBeCloseTo(r.w / r.h, 5);
  });

  it("never collapses below the minimum, and pins the far edge doing it", () => {
    const out = resize(r, "w", 9999, 0);
    expect(out.w).toBeGreaterThanOrEqual(4);
    expect(out.x + out.w).toBeCloseTo(r.x + r.w, 5);
  });

  it("does not drift when nothing moves", () => {
    expect(resize(r, "se", 0, 0)).toEqual(r);
  });
});

describe("normalize", () => {
  it("turns a backwards drag into a positive rect", () => {
    expect(normalize({ x: 100, y: 100, w: -40, h: -20 })).toEqual({ x: 60, y: 80, w: 40, h: 20 });
  });
});

describe("hit testing", () => {
  it("contains is inclusive of the edges", () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(contains(r, 5, 5)).toBe(true);
    expect(contains(r, 0, 0)).toBe(true);
    expect(contains(r, 11, 5)).toBe(false);
  });

  it("intersects finds marquee overlap but not mere adjacency", () => {
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe("snap", () => {
  const board = { w: 1000, h: 1000 };

  it("pulls a near-centre box onto the centre and reports the guide", () => {
    const moving = { x: 397, y: 400, w: 200, h: 200 };
    const s = snap(moving, [], board, 8);
    expect(moving.x + s.dx + 100).toBeCloseTo(500, 5);
    expect(s.guides.some((g) => g.axis === "x" && Math.abs(g.at - 500) < 0.5)).toBe(true);
  });

  it("leaves a box alone when nothing is within tolerance", () => {
    const s = snap({ x: 123, y: 321, w: 50, h: 50 }, [], board, 4);
    expect(s.dx).toBe(0);
    expect(s.dy).toBe(0);
    expect(s.guides).toHaveLength(0);
  });

  it("aligns to another layer's edge", () => {
    const other = { x: 300, y: 0, w: 100, h: 100 };
    const s = snap({ x: 303, y: 500, w: 50, h: 50 }, [other], board, 8);
    expect(303 + s.dx).toBeCloseTo(300, 5);
  });

  it("snaps to the artboard's own edges", () => {
    const s = snap({ x: 3, y: 500, w: 50, h: 50 }, [], board, 8);
    expect(3 + s.dx).toBeCloseTo(0, 5);
  });

  it("is symmetric: snapping an already-snapped box is a no-op", () => {
    const once = snap({ x: 397, y: 400, w: 200, h: 200 }, [], board, 8);
    const settled = { x: 397 + once.dx, y: 400 + once.dy, w: 200, h: 200 };
    const twice = snap(settled, [], board, 8);
    expect(twice.dx).toBe(0);
    expect(twice.dy).toBe(0);
  });
});

/* ── Batch 18.1 ───────────────────────────────────────────────────────── */

describe("snap to lines that are not layers", () => {
  const board = { w: 1080, h: 1350 };

  /** 18.1's done-when: a headline dragged near the safe-zone edge lands on it. */
  it("snaps to a safe-zone edge passed in as a target", () => {
    // LinkedIn's safe box starts 80px down; drop a headline at 84.
    const s = snap({ x: 300, y: 84, w: 400, h: 100 }, [], board, 8, { x: [], y: [80, 1270] });
    expect(s.dy).toBe(-4);
    expect(s.guides).toContainEqual({ axis: "y", at: 80 });
  });

  it("snaps to the composition margins", () => {
    const s = snap({ x: 99, y: 600, w: 300, h: 50 }, [], board, 8, { x: [96, 984], y: [] });
    expect(s.dx).toBe(-3);
  });
});

describe("snapResize", () => {
  const board = { w: 1080, h: 1350 };

  it("moves only the edge being dragged", () => {
    const r = snapResize({ x: 100, y: 100, w: 880, h: 50 }, "e", [], board, 8, { x: [984], y: [] });
    expect(r.rect).toEqual({ x: 100, y: 100, w: 884, h: 50 });
  });

  it("pulls the left edge without moving the right one", () => {
    const r = snapResize({ x: 92, y: 100, w: 300, h: 50 }, "w", [], board, 8, { x: [96], y: [] });
    expect(r.rect.x).toBe(96);
    expect(r.rect.x + r.rect.w).toBe(392);
  });
});

describe("spacingSnap", () => {
  it("evens out the gaps either side of a box, and draws both", () => {
    const left = { x: 0, y: 0, w: 100, h: 100 };
    const right = { x: 400, y: 0, w: 100, h: 100 };
    // Gaps 98 and 102: within tolerance, so it settles at 100 and 100.
    const s = spacingSnap({ x: 198, y: 0, w: 100, h: 100 }, [left, right], 4);
    expect(s.dx).toBe(2);
    expect(s.gaps).toHaveLength(2);
    expect(s.gaps.map((g) => g.to - g.from)).toEqual([100, 100]);
  });

  it("does nothing when the gaps are clearly different", () => {
    const s = spacingSnap({ x: 150, y: 0, w: 100, h: 100 }, [{ x: 0, y: 0, w: 100, h: 100 }, { x: 400, y: 0, w: 100, h: 100 }], 4);
    expect(s.dx).toBe(0);
    expect(s.gaps).toEqual([]);
  });

  it("only measures neighbours it lines up with", () => {
    const s = spacingSnap({ x: 198, y: 0, w: 100, h: 100 }, [{ x: 0, y: 500, w: 100, h: 100 }, { x: 400, y: 0, w: 100, h: 100 }], 4);
    expect(s.gaps).toEqual([]);
  });
});
