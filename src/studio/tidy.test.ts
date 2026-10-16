import { describe, expect, it } from "vitest";

import { buildSlides, DEFAULT_SPACING, spacingFor } from "./compositions.js";
import { makeDoc, makeLayer, makeSlide, type Doc, type Layer } from "./model.js";
import { STYLES } from "./styles.js";
import {
  align,
  applyMoves,
  distribute,
  equalGap,
  group,
  matchAcross,
  matchWidth,
  nearestStep,
  regroupCopies,
  tidySlide,
  ungroup,
  unitsOf,
  withGroups,
} from "./tidy.js";

const BOARD = { w: 1080, h: 1350 };

const rect = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Layer> = {}): Layer => ({
  ...makeLayer("rect", { x, y, w, h }, "#fff"),
  id,
  name: id,
  ...extra,
});

const slideOf = (layers: Layer[]) => ({ ...makeSlide(), layers });

describe("align", () => {
  it("aligns several things to the selection's own edge", () => {
    const layers = [rect("a", 100, 0, 50, 50), rect("b", 300, 0, 80, 50)];
    const moves = align(layers, ["a", "b"], "right", BOARD);
    expect(moves.get("a")).toEqual({ x: 330, y: 0 });
    expect(moves.has("b")).toBe(false);
  });

  it("aligns one thing to the artboard", () => {
    const moves = align([rect("a", 100, 100, 80, 40)], ["a"], "hcenter", BOARD);
    expect(moves.get("a")).toEqual({ x: 500, y: 100 });
  });

  it("moves a group as one unit and keeps its shape", () => {
    const layers = [
      rect("a", 100, 100, 50, 50, { groupId: "g" }),
      rect("b", 200, 120, 50, 50, { groupId: "g" }),
      rect("c", 600, 400, 50, 50),
    ];
    expect(unitsOf(layers, ["a", "b", "c"])).toHaveLength(2);
    const moves = align(layers, ["a", "b", "c"], "top", BOARD);
    expect(moves.has("a")).toBe(false);
    expect(moves.get("c")).toEqual({ x: 600, y: 100 });
  });
});

describe("distribute", () => {
  it("makes the gaps equal and leaves the outer two alone", () => {
    const layers = [rect("a", 0, 0, 100, 10), rect("b", 130, 0, 100, 10), rect("c", 400, 0, 100, 10)];
    const moves = distribute(layers, ["a", "b", "c"], "x");
    // Span 500, used 300, two gaps of 100: b sits at 200.
    expect(moves.get("b")).toEqual({ x: 200, y: 0 });
    expect(moves.has("a")).toBe(false);
    expect(moves.has("c")).toBe(false);
  });
});

describe("equalGap and the spacing scale", () => {
  it("snaps the gap to the nearest step of the scale", () => {
    expect(nearestStep(37, [16, 24, 40, 64])).toBe(40);
    expect(nearestStep(20, [16, 24])).toBe(16);
    const layers = [rect("a", 0, 0, 10, 100), rect("b", 0, 130, 10, 100), rect("c", 0, 280, 10, 100)];
    const { moves, gap } = equalGap(layers, ["a", "b", "c"], "y", [16, 24, 40, 64]);
    expect(gap).toBe(40);
    expect(moves.get("b")).toEqual({ x: 0, y: 140 });
    // c already sits 40 below b's new position, so it does not move at all.
    expect(moves.has("c")).toBe(false);
  });

  it("knows each composition's own steps, and a default for hand-made slides", () => {
    expect(spacingFor("heading-body")).toContain(32);
    expect(spacingFor(undefined)).toEqual(DEFAULT_SPACING);
  });
});

describe("matchWidth", () => {
  it("makes everything as wide as the widest, re-measuring text", () => {
    const t = { ...makeLayer("text", { x: 0, y: 0, w: 900, h: 60 }, "#fff"), id: "t", text: "A long line of words that will wrap", fontSize: 48 };
    const moves = matchWidth([t, rect("r", 0, 200, 300, 40), rect("w", 0, 300, 900, 40)], ["t", "r", "w"]);
    expect(moves.get("r")).toEqual({ w: 900 });
    expect(moves.has("t")).toBe(false);
    const narrow = { ...t, w: 200 };
    const m2 = matchWidth([narrow, rect("w", 0, 300, 900, 40)], ["t", "w"]);
    expect(m2.get("t")?.w).toBe(900);
    expect(m2.get("t")?.h).toBeGreaterThan(0);
  });
});

describe("tidySlide", () => {
  /** 18.2's done-when. */
  it("turns four uneven gaps into four equal gaps from the scale", () => {
    const layers = [
      rect("a", 96, 200, 800, 80),
      rect("b", 96, 300, 800, 80), // gap 20
      rect("c", 96, 450, 800, 80), // gap 70
      rect("d", 96, 560, 800, 80), // gap 30
      rect("e", 96, 680, 800, 80), // gap 40
    ];
    const { moves, gap, pinned } = tidySlide(slideOf(layers), BOARD, [16, 24, 40, 64]);
    expect(gap).toBe(40);
    expect(pinned).toEqual([]);
    const after = applyMoves(layers, moves);
    const ys = after.map((l) => l.y);
    const gaps = ys.slice(1).map((y, i) => y - (ys[i]! + 80));
    expect(gaps).toEqual([40, 40, 40, 40]);
    // Reading order is unchanged, and nothing was resized.
    expect([...after].sort((p, q) => p.y - q.y).map((l) => l.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(after.every((l) => l.h === 80 && l.w === 800)).toBe(true);
  });

  it("keeps things side by side together, and text on its block", () => {
    const layers = [
      rect("left", 96, 200, 300, 80),
      rect("right", 600, 210, 300, 80),
      rect("block", 0, 500, 1080, 200),
      rect("onblock", 96, 560, 800, 80),
    ];
    const { moves } = tidySlide(slideOf(layers), BOARD, [56]);
    const after = applyMoves(layers, moves);
    const get = (id: string) => after.find((l) => l.id === id)!;
    expect(get("right").y - get("left").y).toBe(10);
    expect(get("onblock").y - get("block").y).toBe(60);
  });

  it("leaves an ambiguous overlap where it is, and says which", () => {
    const layers = [
      rect("a", 96, 200, 400, 100),
      rect("b", 300, 250, 400, 100), // partly overlaps a
      rect("c", 96, 500, 800, 80),
      rect("d", 96, 700, 800, 80),
    ];
    const { moves, pinned } = tidySlide(slideOf(layers), BOARD, [40]);
    expect(pinned.sort()).toEqual(["a", "b"]);
    expect(moves.has("a")).toBe(false);
    expect(moves.has("b")).toBe(false);
  });

  it("ignores the background, locked and hidden layers", () => {
    const layers = [
      rect("bg", 0, 0, 1080, 1350),
      rect("a", 96, 200, 800, 80),
      rect("lock", 96, 330, 800, 80, { locked: true }),
      rect("b", 96, 500, 800, 80),
    ];
    const { moves } = tidySlide(slideOf(layers), BOARD, [40]);
    expect(moves.has("bg")).toBe(false);
    expect(moves.has("lock")).toBe(false);
  });
});

describe("groups", () => {
  it("selects the whole group from any one member, in layer order", () => {
    const layers = [rect("a", 0, 0, 1, 1, { groupId: "g" }), rect("b", 0, 0, 1, 1), rect("c", 0, 0, 1, 1, { groupId: "g" })];
    expect(withGroups(layers, ["c"])).toEqual(["a", "c"]);
    expect(withGroups(layers, ["b"])).toEqual(["b"]);
  });

  it("groups and ungroups, one level only", () => {
    const layers = [rect("a", 0, 0, 1, 1), rect("b", 0, 0, 1, 1, { groupId: "old" })];
    const grouped = group(layers, ["a", "b"], "new");
    expect(grouped.map((l) => l.groupId)).toEqual(["new", "new"]);
    expect(group(layers, ["a"], "x")).toEqual(layers);
    expect(ungroup(grouped, ["a", "b"]).every((l) => l.groupId === undefined)).toBe(true);
  });

  it("gives duplicated groups a group of their own", () => {
    let n = 0;
    const copies = regroupCopies(
      [rect("a", 0, 0, 1, 1, { groupId: "g" }), rect("b", 0, 0, 1, 1, { groupId: "g" }), rect("c", 0, 0, 1, 1)],
      () => `fresh${(n += 1)}`,
    );
    expect(copies.map((l) => l.groupId)).toEqual(["fresh1", "fresh1", undefined]);
  });
});

describe("matchAcross", () => {
  const deck = (): Doc => {
    const theme = STYLES[0]!.theme;
    const copy = Array.from({ length: 9 }, (_, i) =>
      i === 4 ? `Point ${i}\nA much longer body with a great many words in it so that it wraps over several lines at any size` : `Point ${i}\nThe body of point ${i}.`,
    );
    const roles = ["hook", ...Array.from({ length: 7 }, () => "point"), "cta"];
    return { ...makeDoc("M"), slides: buildSlides(copy, theme, roles) };
  };

  /** 18.3's done-when. */
  it("puts every same-named layer at the source's y and size, and reports what it skipped", () => {
    const doc = deck();
    const from = doc.slides.findIndex((s) => s.layers.some((l) => l.name === "Heading"));
    expect(from).toBeGreaterThanOrEqual(0);
    const source = doc.slides[from]!.layers.find((l) => l.name === "Heading")!;
    const r = matchAcross(doc, from, source.id);

    for (const n of r.matched) {
      const twin = r.doc.slides[n - 1]!.layers.find((l) => l.name === "Heading")!;
      expect(twin.y).toBe(source.y);
      expect(twin.fontSize).toBe(source.fontSize);
      expect(twin.handEdited).toBe(true);
    }
    // Slides with no Heading are named, not silently passed over.
    expect(r.matched.length + r.skipped.length).toBe(doc.slides.length - 1);
  });

  it("reports a text layer that no longer fits, by slide number, and never shrinks it", () => {
    const small = { ...makeLayer("text", { x: 96, y: 200, w: 300, h: 50 }, "#fff"), name: "Body", text: "Short", fontSize: 40 };
    const long = { ...makeLayer("text", { x: 96, y: 400, w: 888, h: 400 }, "#fff"), name: "Body", text: "A much longer body that will need many lines at three hundred pixels wide", fontSize: 40 };
    const doc: Doc = { ...makeDoc("O"), slides: [slideOf([small]), slideOf([long])] };
    const r = matchAcross(doc, 0, small.id);
    expect(r.overflow).toEqual([2]);
    expect(r.doc.slides[1]!.layers[0]!.fontSize).toBe(40);
  });

  it("is a copy of numbers, not a link", () => {
    const a = rect("a", 10, 10, 100, 100, { name: "Logo" });
    const b = rect("b", 500, 500, 50, 50, { name: "Logo" });
    const doc: Doc = { ...makeDoc("L"), slides: [slideOf([a]), slideOf([b])] };
    const r = matchAcross(doc, 0, "a");
    expect(r.doc.slides[1]!.layers[0]).toMatchObject({ x: 10, y: 10, w: 100, h: 100 });
    expect(Object.keys(r.doc.slides[1]!.layers[0]!)).not.toContain("matchOf");
  });

  it("only touches the slides it is given", () => {
    const doc: Doc = {
      ...makeDoc("S"),
      slides: [slideOf([rect("a", 0, 0, 10, 10, { name: "X" })]), slideOf([rect("b", 5, 5, 5, 5, { name: "X" })]), slideOf([rect("c", 7, 7, 7, 7, { name: "X" })])],
    };
    const r = matchAcross(doc, 0, "a", [doc.slides[2]!.id]);
    expect(r.matched).toEqual([3]);
    expect(r.doc.slides[1]).toBe(doc.slides[1]);
  });
});
