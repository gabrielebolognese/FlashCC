import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import {
  cellsUnder,
  colourOnly,
  coverAtTile,
  deltaE,
  denseSlides,
  feedScale,
  filterValues,
  flatContrast,
  flatGround,
  inkRects,
  needFor,
  parseColour,
  ratio,
  roleFix,
  simulate,
  slideWords,
  slidesNeedingPixels,
  smallOnPhone,
  tileScale,
  withoutText,
  wordCeiling,
  type Grid,
} from "./legibility.js";
import { makeDoc, makeLayer, type Doc, type Layer, type Slide } from "./model.js";
import { platformById } from "./platforms.js";
import { THEMES } from "./presets.js";

const text = (fill: string, extra: Partial<Layer> = {}): Layer => ({
  ...makeLayer("text", { x: 96, y: 400, w: 888, h: 120 }, fill),
  id: "t",
  name: "Words",
  text: "Cut on the beat",
  fontSize: 48,
  fontWeight: 400,
  lineHeight: 1.2,
  ...extra,
});

const slide = (background: string, layers: Layer[]): Slide => ({ id: "s", name: "S", background, layers });
const doc = (slides: Slide[], w = 1080, h = 1350): Doc => ({ ...makeDoc("d"), width: w, height: h, slides });

describe("colour arithmetic", () => {
  it("reads hex of every length and rgb()", () => {
    expect(parseColour("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColour("#00000080")!.a).toBeCloseTo(0.5, 2);
    expect(parseColour("rgba(10, 20, 30, 0.4)")).toEqual({ r: 10, g: 20, b: 30, a: 0.4 });
    expect(parseColour("none")).toBeNull();
  });
  it("gives WCAG's ratios", () => {
    expect(ratio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0);
    expect(ratio({ r: 118, g: 118, b: 118 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(4.54, 1);
  });
});

describe("thresholds at the size the slide is seen", () => {
  it("is 3:1 for large text and 4.5:1 for body, judged on a 360 phone", () => {
    const scale = feedScale({ width: 1080, height: 1350 });
    expect(scale).toBeCloseTo(1 / 3, 5);
    expect(needFor({ fontSize: 72, fontWeight: 400 }, scale)).toBe(3);
    expect(needFor({ fontSize: 60, fontWeight: 700 }, scale)).toBe(3);
    expect(needFor({ fontSize: 48, fontWeight: 400 }, scale)).toBe(4.5);
  });
  it("letterboxes a tall page in LinkedIn's frame, and fills TikTok's screen", () => {
    expect(feedScale({ width: 1080, height: 1920 }, platformById("linkedin"))).toBeCloseTo(450 / 1920, 5);
    expect(feedScale({ width: 1080, height: 1920 }, platformById("tiktok"))).toBeCloseTo(1 / 3, 5);
  });
});

describe("where the ink is", () => {
  it("is each line's glyphs, aligned, not the whole box", () => {
    const left = inkRects(text("#fff"));
    expect(left).toHaveLength(1);
    expect(left[0]!.x).toBe(96);
    expect(left[0]!.w).toBeLessThan(888);
    const right = inkRects(text("#fff", { align: "right" }));
    expect(right[0]!.x + right[0]!.w).toBeCloseTo(96 + 888, 5);
    const centred = inkRects(text("#fff", { align: "center" }));
    expect(centred[0]!.x).toBeCloseTo(96 + (888 - centred[0]!.w) / 2, 5);
  });
  it("puts a right-to-left line at its own start", () => {
    expect(inkRects(text("#fff", { text: "قص على الإيقاع" }))[0]!.x + inkRects(text("#fff", { text: "قص على الإيقاع" }))[0]!.w).toBeCloseTo(984, 5);
  });
});

describe("over a flat colour, arithmetic (30.1)", () => {
  it("knows the ground: the slide, a solid shape covering the words, or nothing it can judge", () => {
    const t = text("#ffffff");
    expect(flatGround(slide("#12161c", [t]), t)).toBe("#12161c");
    const card = { ...makeLayer("rect", { x: 0, y: 300, w: 1080, h: 400 }, "#f7f4ed"), id: "card" };
    expect(flatGround(slide("#12161c", [card, t]), t)).toBe("#f7f4ed");
    const photo = { ...makeLayer("image", { x: 0, y: 0, w: 1080, h: 1350 }, "none"), src: "x.jpg" };
    expect(flatGround(slide("#12161c", [photo, t]), t)).toBeNull();
    expect(flatGround({ ...slide("#12161c", [t]), image: { src: "x.jpg" } }, t)).toBeNull();
    expect(flatGround(slide("#12161c", [t]), text("#fff", { textEffect: "label", effectColour: "#d9a521" }))).toBe("#d9a521");
  });

  it("flags grey on grey and passes what reads", () => {
    const grey = doc([slide("#555555", [text("#777777")])]);
    const issues = flatContrast(grey, 1 / 3);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ slide: 0, layerId: "t", need: 4.5, flat: true });
    expect(flatContrast(doc([slide("#12161c", [text("#f4f6f8")])]), 1 / 3)).toEqual([]);
  });

  it("counts a layer's opacity against it", () => {
    expect(flatContrast(doc([slide("#000000", [text("#ffffff", { opacity: 0.3 })])]), 1 / 3)).toHaveLength(1);
  });

  it("passes every generated deck in every theme", () => {
    for (const theme of Object.values(THEMES)) {
      const d = doc(buildSlides(["Why carousels lose people", "One idea per slide. Two sentences is two slides.", "Follow for more"], theme));
      expect(flatContrast(d, 1 / 3)).toEqual([]);
    }
  });

  it("asks for pixels only where the ground is not flat, and hides every word when it does", () => {
    const photo = { ...makeLayer("image", { x: 0, y: 0, w: 1080, h: 1350 }, "none"), src: "x.jpg" };
    const d = doc([slide("#000", [text("#fff")]), slide("#000", [photo, text("#fff")])]);
    expect(slidesNeedingPixels(d)).toEqual([1]);
    expect(withoutText(d).slides[1]!.layers.map((l) => l.visible)).toEqual([true, false]);
  });

  it("finds the nearest role that passes over a flat ground", () => {
    const t = text("#777777");
    const s = slide("#555555", [t]);
    expect(roleFix(s, t, null, ["#12161c", "#f4f6f8", "#d9a521"], 1 / 3)).toBe("#f4f6f8");
  });
});

describe("the grid", () => {
  const g: Grid = { cell: 24, cols: 2, rows: 1, rgb: [0, 0, 0, 255, 255, 255] };
  it("takes the cells at least half under a rectangle", () => {
    expect(cellsUnder(g, { x: 0, y: 0, w: 30, h: 24 }).map((c) => c.at.x)).toEqual([0]);
    expect(cellsUnder(g, { x: 0, y: 0, w: 48, h: 24 }).map((c) => c.at.x)).toEqual([0, 24]);
  });
  it("falls back to every cell touched by a rectangle smaller than half a cell", () => {
    expect(cellsUnder(g, { x: 20, y: 4, w: 8, h: 8 }).map((c) => c.at.x)).toEqual([0, 24]);
  });
});

describe("seen at its size (30.2)", () => {
  it("names the smallest copy under 10px on a 360 phone, leaving furniture out", () => {
    const small = text("#fff", { id: "small", fontSize: 24 });
    const counter = text("#fff", { id: "c", fontSize: 20, furniture: "counter" });
    const d = doc([slide("#000", [text("#fff", { fontSize: 64 }), small, counter]), slide("#000", [text("#fff", { fontSize: 40 })])]);
    expect(smallOnPhone(d).map((s) => [s.slide, s.layerId, Math.round(s.px)])).toEqual([[0, "small", 8]]);
  });
  it("catches a 9:16 deck letterboxed into LinkedIn's frame that the artboard floor misses", () => {
    const d = doc([slide("#000", [text("#fff", { fontSize: 36 })])], 1080, 1920);
    expect(smallOnPhone(d, platformById("instagram"))).toEqual([]);
    expect(smallOnPhone(d, platformById("linkedin"))).toHaveLength(1);
  });
  it("measures the cover's headline at profile-tile size", () => {
    const d = doc([slide("#000", [text("#fff", { fontSize: 104 }), text("#fff", { id: "b", fontSize: 40 })])]);
    expect(tileScale(d)).toBeCloseTo(160 / 1350, 5);
    expect(coverAtTile(d)!.px).toBeCloseTo(104 * (160 / 1350), 5);
  });
});

describe("colour vision (30.3)", () => {
  it("makes red and green alike to a deuteranope and keeps black and white apart", () => {
    const red = { r: 213, g: 62, b: 79 };
    const green = { r: 102, g: 160, b: 60 };
    expect(deltaE(red, green)).toBeGreaterThan(20);
    expect(deltaE(simulate(red, "deutan"), simulate(green, "deutan"))).toBeLessThan(deltaE(red, green) / 2);
    expect(deltaE(simulate({ r: 0, g: 0, b: 0 }, "protan"), simulate({ r: 255, g: 255, b: 255 }, "protan"))).toBeGreaterThan(90);
  });

  it("writes the filter as a 4x5 matrix", () => {
    expect(filterValues("deutan").split(" ")).toHaveLength(20);
  });

  const bar = (id: string, x: number, fill: string): Layer => ({ ...makeLayer("rect", { x, y: 500, w: 200, h: 300 }, fill), id, name: id });

  it("flags two shapes that differ only by a colour some cannot tell apart", () => {
    const d = doc([slide("#ffffff", [bar("Red bar", 200, "#d33e4f"), bar("Green bar", 600, "#5f9e3a")])]);
    expect(colourOnly(d)).toEqual([{ slide: 0, a: "Red bar", b: "Green bar", vision: "deutan" }]);
  });

  it("is satisfied once each shape carries words", () => {
    const label = (x: number, t: string) => ({ ...text("#000", { id: `l${x}`, x, y: 820, w: 200, h: 60, text: t }) });
    const d = doc([slide("#ffffff", [bar("Red bar", 200, "#d33e4f"), bar("Green bar", 600, "#5f9e3a"), label(200, "Before"), label(600, "After")])]);
    expect(colourOnly(d)).toEqual([]);
  });

  it("catches the familiar pairs: matplotlib's red and green, and flat UI's", () => {
    for (const [r, g] of [["#d62728", "#2ca02c"], ["#e74c3c", "#2ecc71"]]) {
      expect(colourOnly(doc([slide("#ffffff", [bar("A", 200, r!), bar("B", 600, g!)])]))).toHaveLength(1);
    }
  });

  it("leaves a block's own marks alone, and pairs that differ in lightness", () => {
    const red = { ...bar("Red bar", 200, "#d33e4f"), block: { block: "chart", instance: "c", part: "bar-0" } };
    const green = { ...bar("Green bar", 600, "#5f9e3a"), block: { block: "chart", instance: "c", part: "bar-1" } };
    expect(colourOnly(doc([slide("#fff", [red, green])]))).toEqual([]);
    expect(colourOnly(doc([slide("#fff", [bar("Navy", 200, "#12285a"), bar("Sky", 600, "#7ec8ff")])]))).toEqual([]);
  });
});

describe("density (30.4)", () => {
  it("is 40 words at 4:5 and 30 at 9:16", () => {
    expect(wordCeiling({ width: 1080, height: 1350 })).toBe(40);
    expect(wordCeiling({ width: 1080, height: 1920 })).toBe(30);
  });
  it("counts words, marks stripped and furniture left out, and CJK by two characters", () => {
    expect(slideWords(slide("#000", [text("#fff", { text: "Cut *on* the beat, 3 times." }), text("#fff", { text: "Ada", furniture: "author" })]))).toBe(6);
    expect(slideWords(slide("#000", [text("#fff", { text: "ほとんどのカルーセル" })]))).toBe(5);
  });
  it("names a slide over the ceiling and never one under it", () => {
    const long = Array.from({ length: 41 }, (_, i) => `word${i}`).join(" ");
    const d = doc([slide("#000", [text("#fff", { text: long })]), slide("#000", [text("#fff")])]);
    expect(denseSlides(d)).toEqual([{ slide: 0, words: 41, ceiling: 40 }]);
  });
});
