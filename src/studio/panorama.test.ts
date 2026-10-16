import { describe, expect, it } from "vitest";

import { reseal, stampFurniture } from "./furniture.js";
import { makeDoc, makeLayer, makeSlide, type Doc } from "./model.js";
import { addBridge, BRIDGES, bridgeLayer, hasPeek, panoramaDeck, stripBackground, stripTexture } from "./panorama.js";
import { THEMES } from "./presets.js";
import { brokenSpans, joinedSpans, stripX, touchedSlides } from "./spans.js";

const theme = THEMES.ink!;
const deck = (n: number): Doc => ({
  ...makeDoc("t"),
  slides: Array.from({ length: n }, () => ({ ...makeSlide(theme.bg), layers: [{ ...makeLayer("text", { x: 96, y: 900, w: 888, h: 120 }, "#fff"), text: "Words" }] })),
});

describe("continuous backgrounds (23.3)", () => {
  it("puts one picture under the whole strip, behind everything, with one focal point", () => {
    const doc = stripBackground(deck(4), { src: "https://x/y.jpg", focal: { x: 0.7, y: 0.3 } });
    const [span] = joinedSpans(doc);
    expect(span!.layer).toMatchObject({ x: 0, y: 0, w: 4 * 1080, h: 1350, fit: "cover" });
    expect(span!.pieces.map((p) => p.slide)).toEqual([0, 1, 2, 3]);
    for (const s of doc.slides) {
      expect(s.layers[0]!.kind).toBe("image");
      expect(s.layers[0]!.focal).toEqual({ x: 0.7, y: 0.3 });
    }
    expect(doc.slides.map((s, i) => stripX(i, s.layers[0]!.x, 1080))).toEqual([0, 0, 0, 0]);
  });

  it("draws a texture once at strip size, so it runs on across the edges", () => {
    const doc = stripTexture(deck(3), "dots", 0.5, theme, null);
    const src = doc.slides[0]!.layers[0]!.src!;
    expect(src.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(src)).toContain(`width="${3 * 1080}"`);
    expect(doc.slides.every((s) => s.layers[0]!.src === src)).toBe(true);
  });

  it("makes a panorama deck from one image", () => {
    const doc = panoramaDeck({ src: "https://x/wide.jpg", name: "Alps" }, 5, theme);
    expect(doc.slides).toHaveLength(5);
    expect(doc.name).toBe("Alps panorama");
    expect(joinedSpans(doc)[0]!.layer.w).toBe(5 * 1080);
    expect(brokenSpans(doc)).toEqual([]);
    expect(panoramaDeck({ src: "s" }, 40, theme).slides).toHaveLength(10);
  });
});

describe("bridges (23.4)", () => {
  it.each(BRIDGES.map((b) => b.id))("%s crosses the edge it is put on", (kind) => {
    const l = bridgeLayer(kind, 0, { w: 1080, h: 1350 }, theme);
    expect(touchedSlides(l, l.x, 1080, 3)).toEqual([0, 1]);
    const doc = addBridge(deck(3), kind, 0, theme);
    expect(joinedSpans(doc)).toHaveLength(1);
    expect(doc.slides[0]!.layers.some((x) => x.bridge === kind)).toBe(true);
    expect(doc.slides[1]!.layers.some((x) => x.bridge === kind)).toBe(true);
  });

  it("puts the split number behind the words and the rest on top", () => {
    expect(addBridge(deck(2), "number", 0, theme).slides[0]!.layers[0]!.bridge).toBe("number");
    expect(addBridge(deck(2), "line", 0, theme).slides[0]!.layers.at(-1)!.bridge).toBe("line");
  });

  it("does nothing past the last slide", () => {
    const d = deck(2);
    expect(addBridge(d, "peek", 1, theme)).toBe(d);
  });

  it("a peek on the cover replaces the swipe-cue furniture", () => {
    const identity = { name: "Ana Lee", handles: {} };
    const furnished = stampFurniture(deck(4), "creator", identity);
    const swipes = (d: Doc) => d.slides.flatMap((s) => s.layers.filter((l) => l.furniture === "swipe")).length;
    expect(swipes(furnished)).toBe(3);
    const peeked = reseal(addBridge(furnished, "peek", 0, theme));
    expect(hasPeek(peeked)).toBe(true);
    expect(swipes(peeked)).toBe(0);
  });
});
