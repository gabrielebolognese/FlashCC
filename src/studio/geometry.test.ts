import { describe, expect, it } from "vitest";

import { bounds, contains, intersects, normalize, resize, snap, type Rect } from "./geometry.js";
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
