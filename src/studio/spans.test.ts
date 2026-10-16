import { describe, expect, it } from "vitest";

import { makeDoc, makeLayer, makeSlide, type Doc, type Layer } from "./model.js";
import { reflowDoc } from "./reflow.js";
import {
  addAcross,
  brokenSpans,
  family,
  joinedSpans,
  links,
  moveAcross,
  piecesOf,
  runs,
  stripX,
  touchedSlides,
  unspan,
} from "./spans.js";

const W = 1080;
let n = 0;
const ids = { span: () => `s${(n += 1)}`, layer: () => `l${(n += 1)}` };

const deck = (count: number): Doc => ({
  ...makeDoc("t"),
  slides: Array.from({ length: count }, (_, i) => ({ ...makeSlide("#000000", `S${i + 1}`), layers: [] })),
});

const circle = (x: number, y = 500, size = 300): Layer => ({ ...makeLayer("ellipse", { x, y, w: size, h: size }, "#ff0000"), id: "c" });

describe("touchedSlides", () => {
  it("is every slide the drawn extent overlaps, an edge alone does not count", () => {
    expect(touchedSlides({ w: 300, h: 300, rotation: 0, strokeWidth: 0 }, 2 * W - 150, W, 5)).toEqual([1, 2]);
    expect(touchedSlides({ w: 300, h: 300, rotation: 0, strokeWidth: 0 }, W - 300, W, 5)).toEqual([0]);
    expect(touchedSlides({ w: 300, h: 300, rotation: 0, strokeWidth: 0 }, -400, W, 5)).toEqual([0]);
  });
  it("counts a rotated layer's corners", () => {
    // A 600x20 bar ending 10px short of the edge reaches over it once turned 45 degrees? No: its
    // extent shrinks. A 20x600 bar does reach over.
    expect(touchedSlides({ w: 20, h: 600, rotation: 45, strokeWidth: 0 }, W - 40, W, 3)).toEqual([0, 1]);
  });
});

describe("a spanning layer is several ordinary layers (the 23.2 done-when)", () => {
  it("a circle dropped across the edge of slides 2 and 3 becomes two layers, meeting exactly at the edge", () => {
    const doc = addAcross(deck(5), circle(2 * W - 150), ids);
    expect(doc.slides[1]!.layers).toHaveLength(1);
    expect(doc.slides[2]!.layers).toHaveLength(1);
    const [a, b] = [doc.slides[1]!.layers[0]!, doc.slides[2]!.layers[0]!];
    expect(a.spanId).toBeDefined();
    expect(a.spanId).toBe(b.spanId);
    expect(a.x).toBe(W - 150);
    expect(b.x).toBe(-150);
    expect(stripX(1, a.x, W)).toBe(stripX(2, b.x, W));
    expect(a.id).toBe("c");
    expect(brokenSpans(doc)).toEqual([]);
  });

  it("moving it in the strip moves both pieces", () => {
    let doc = addAcross(deck(5), circle(2 * W - 150), ids);
    doc = moveAcross(doc, "c", 40, -20, ids);
    const pieces = family(doc, "c");
    expect(pieces).toHaveLength(2);
    expect(pieces.map((p) => stripX(p.slide, p.layer.x, W))).toEqual([2 * W - 110, 2 * W - 110]);
    expect(pieces.every((p) => p.layer.y === 480)).toBe(true);
  });

  it("dragging it fully onto one slide makes it a plain layer again, and over the next edge a three-piece span", () => {
    let doc = addAcross(deck(5), circle(2 * W - 150), ids);
    doc = moveAcross(doc, "c", 400, 0, ids);
    expect(doc.slides[1]!.layers).toHaveLength(0);
    expect(doc.slides[2]!.layers[0]).toMatchObject({ id: "c", x: 250 });
    expect(doc.slides[2]!.layers[0]!.spanId).toBeUndefined();

    const wide = { ...makeLayer("rect", { x: W - 100, y: 0, w: W + 200, h: 50 }, "#fff"), id: "bar" };
    doc = addAcross(doc, wide, ids);
    expect(piecesOf(doc, doc.slides[0]!.layers.find((l) => l.id === "bar")!.spanId!).map((p) => p.slide)).toEqual([0, 1, 2]);
  });

  it("keeps a piece's own restyle and z-position when the span moves", () => {
    let doc = addAcross(deck(3), circle(W - 150), ids);
    const right = doc.slides[1]!.layers[0]!;
    doc = {
      ...doc,
      slides: doc.slides.map((s, i) =>
        i === 1 ? { ...s, layers: [{ ...right, fill: "#00ff00" }, { ...makeLayer("rect", { x: 0, y: 0, w: 10, h: 10 }, "#fff"), id: "top" }] } : s,
      ),
    };
    doc = moveAcross(doc, "c", 10, 0, ids);
    expect(doc.slides[1]!.layers[0]).toMatchObject({ fill: "#00ff00", id: right.id });
    expect(doc.slides[1]!.layers[1]!.id).toBe("top");
  });
});

describe("links and runs", () => {
  it("say which edges a span crosses, for the export to render as one strip", () => {
    const doc = addAcross(deck(5), circle(2 * W - 150), ids);
    expect(links(doc)).toEqual([false, true, false, false]);
    expect(runs(doc)).toEqual([[0], [1, 2], [3], [4]]);
  });
});

describe("the four ways a seam breaks (23.5)", () => {
  /** Five slides with a seam on every edge: the seamless deck. */
  function seamless(): Doc {
    let doc = deck(5);
    for (let e = 1; e < 5; e += 1) doc = addAcross(doc, { ...circle(e * W - 150, 200 + e * 150, 300), id: `c${e}` }, ids);
    // And a background across the whole strip.
    doc = addAcross(doc, { ...makeLayer("rect", { x: 0, y: 0, w: 5 * W, h: 1350 }, "#222222"), id: "bg" }, ids);
    return doc;
  }

  it("a 4:5 to 3:4 format switch keeps every seam intact (the done-when)", () => {
    const before = seamless();
    const after = reflowDoc(before, 1080, 1440);
    expect(brokenSpans(after)).toEqual([]);
    expect(joinedSpans(after)).toHaveLength(joinedSpans(before).length);
    for (const span of joinedSpans(after)) {
      const xs = span.pieces.map((p) => stripX(p.slide, p.layer.x, after.width));
      expect(new Set(xs.map((x) => Math.round(x * 1000))).size).toBe(1);
    }
    // The strip background still covers the whole strip at the new height.
    const bg = joinedSpans(after).find((s) => s.layer.id === "bg")!;
    expect(bg.layer).toMatchObject({ x: 0, y: 0, w: 5 * 1080, h: 1440 });
    expect(bg.pieces.map((p) => p.slide)).toEqual([0, 1, 2, 3, 4]);
  });

  it("survives a square switch and back", () => {
    const there = reflowDoc(seamless(), 1080, 1080);
    expect(brokenSpans(there)).toEqual([]);
    expect(brokenSpans(reflowDoc(there, 1080, 1350))).toEqual([]);
  });

  it("a reorder that separates two pieces is reported, and Unspan frees them where they are", () => {
    let doc = addAcross(deck(4), circle(W - 150), ids);
    doc = { ...doc, slides: [doc.slides[0]!, doc.slides[2]!, doc.slides[1]!, doc.slides[3]!] };
    const [problem] = brokenSpans(doc);
    expect(problem).toMatchObject({ reason: "apart", slides: [0, 2] });
    const freed = unspan(doc, problem!.spanId);
    expect(brokenSpans(freed)).toEqual([]);
    expect(freed.slides[0]!.layers[0]).toMatchObject({ x: W - 150, spanId: undefined });
    expect(freed.slides[2]!.layers[0]).toMatchObject({ x: -150, spanId: undefined });
  });

  it("a slide inserted inside a span breaks it by construction", () => {
    const doc = addAcross(deck(3), circle(W - 150), ids);
    const inserted = { ...doc, slides: [doc.slides[0]!, { ...makeSlide(), layers: [] }, ...doc.slides.slice(1)] };
    expect(brokenSpans(inserted)[0]?.reason).toBe("apart");
  });

  it("a piece moved alone in single-slide view is reported as an offset seam", () => {
    const doc = addAcross(deck(3), circle(W - 150), ids);
    const nudged = { ...doc, slides: doc.slides.map((s, i) => (i === 1 ? { ...s, layers: s.layers.map((l) => ({ ...l, x: l.x + 12 })) } : s)) };
    expect(brokenSpans(nudged)[0]?.reason).toBe("offset");
  });
});

describe("pre-flight for spanning decks", () => {
  it("flags a cover headline cut by the edge (23.6), and nothing about pieces that run past it on purpose", async () => {
    const { preflight } = await import("./preflight.js");
    const { platformById } = await import("./platforms.js");
    let doc = deck(3);
    doc = addAcross(doc, circle(W - 150), ids);
    const ok = preflight(doc, platformById("instagram"));
    expect(ok.some((f) => f.code === "outside-safe-zone")).toBe(false);
    expect(ok.some((f) => f.code === "cover-cut")).toBe(false);

    const head: Layer = { ...makeLayer("text", { x: 700, y: 600, w: 700, h: 120 }, "#fff"), id: "head", name: "Hook", text: "A headline that runs on", fontSize: 48 };
    doc = addAcross(doc, head, ids);
    const cut = preflight(doc, platformById("instagram")).filter((f) => f.code === "cover-cut");
    expect(cut).toHaveLength(1);
    expect(cut[0]).toMatchObject({ slide: 1, severity: "warn" });
  });

  it("warns about a broken seam", async () => {
    const { preflight } = await import("./preflight.js");
    const { platformById } = await import("./platforms.js");
    let doc = addAcross(deck(4), circle(W - 150), ids);
    doc = { ...doc, slides: [doc.slides[0]!, doc.slides[2]!, doc.slides[1]!, doc.slides[3]!] };
    expect(preflight(doc, platformById("linkedin")).some((f) => f.code === "span-broken")).toBe(true);
  });
});
