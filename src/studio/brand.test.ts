import { describe, expect, it } from "vitest";

import {
  applyBrand,
  brandFromStyle,
  brandIdOf,
  brandLimit,
  brandToStyle,
  canAddBrand,
  isBrandStyle,
  makeBrand,
  themeMap,
  themeOf,
} from "./brand.js";
import { buildSlides } from "./compositions.js";
import { makeDoc, makeLayer, makeSlide, type Doc, type Layer } from "./model.js";
import type { Theme } from "./presets.js";
import { styleById } from "./styles.js";

const INK = styleById("ink").theme;
const PAPER = styleById("paper").theme;

const brandOf = (theme: Theme, name = "Acme") => makeBrand(name, theme);

const deckIn = (styleId: string): Doc => {
  const theme = styleById(styleId).theme;
  return {
    ...makeDoc("Test"),
    styleId,
    slides: buildSlides(["A hook that earns the swipe.", "Some body copy.", "Follow for more."], theme),
  };
};

const allLayers = (doc: Doc): Layer[] => doc.slides.flatMap((s) => s.layers);

describe("tiers", () => {
  it("is the proven ladder", () => {
    expect(brandLimit("free")).toBe(1);
    expect(brandLimit("pro")).toBe(3);
    expect(brandLimit("agency")).toBe(Infinity);
  });

  it("treats an unknown plan as free rather than unlimited", () => {
    expect(brandLimit(undefined)).toBe(1);
  });

  it("gates on the count", () => {
    expect(canAddBrand(0, "free")).toBe(true);
    expect(canAddBrand(1, "free")).toBe(false);
    expect(canAddBrand(2, "pro")).toBe(true);
    expect(canAddBrand(99, "agency")).toBe(true);
  });
});

describe("conversion", () => {
  it("makes a brand from a style and back into one", () => {
    const b = brandFromStyle(styleById("ink"), "Acme");
    expect(b.name).toBe("Acme");
    expect(b.theme.accent).toBe(INK.accent);
    expect(brandToStyle(b).theme).toEqual(b.theme);
  });

  it("copies the theme rather than aliasing it", () => {
    const b = brandOf(INK);
    b.theme.accent = "#ff0000";
    expect(styleById("ink").theme.accent).toBe(INK.accent);
  });

  it("round-trips its id through the style id", () => {
    const b = brandOf(INK);
    const styleId = brandToStyle(b).id;
    expect(isBrandStyle(styleId)).toBe(true);
    expect(brandIdOf(styleId)).toBe(b.id);
  });

  it("does not mistake a built-in style for a brand", () => {
    expect(isBrandStyle("ink")).toBe(false);
    expect(brandIdOf("ink")).toBeNull();
  });

  it("refuses to be nameless", () => {
    expect(makeBrand("   ", INK).name).toBe("Untitled brand");
  });
});

describe("the colour map", () => {
  it("maps each theme colour to its counterpart", () => {
    const map = themeMap(INK, PAPER);
    expect(map.get(INK.bg.toLowerCase())).toBe(PAPER.bg);
    expect(map.get(INK.accent.toLowerCase())).toBe(PAPER.accent);
  });

  it("is case-insensitive, because hand-typed hex is not", () => {
    const map = themeMap({ ...INK, accent: "#D9A521" }, PAPER);
    expect(map.get("#d9a521")).toBe(PAPER.accent);
  });
});

describe("applying a brand to an existing carousel", () => {
  it("recolours a generated deck to the brand", () => {
    const doc = deckIn("ink");
    const { doc: out, changed } = applyBrand(doc, brandOf(PAPER));

    expect(changed).toBeGreaterThan(0);
    for (const slide of out.slides) expect(slide.background).toBe(PAPER.bg);
    expect(allLayers(out).some((l) => l.fill === PAPER.accent)).toBe(true);
    expect(allLayers(out).some((l) => l.fill === INK.accent)).toBe(false);
  });

  it("leaves the layers themselves otherwise intact", () => {
    const doc = deckIn("ink");
    const out = applyBrand(doc, brandOf(PAPER)).doc;

    expect(out.slides).toHaveLength(doc.slides.length);
    expect(allLayers(out)).toHaveLength(allLayers(doc).length);
    expect(allLayers(out).map((l) => l.id)).toEqual(allLayers(doc).map((l) => l.id));
    expect(allLayers(out).map((l) => l.text)).toEqual(allLayers(doc).map((l) => l.text));
  });

  /**
   * The precise rule. A shape the user drew in a palette colour that the old
   * theme explains should follow the rebrand like everything else.
   */
  it("follows an exact colour match on a hand-drawn layer", () => {
    const doc = deckIn("ink");
    const drawn = { ...makeLayer("rect", { x: 10, y: 10, w: 100, h: 100 }, INK.accent), name: "Mine" };
    doc.slides[0]!.layers.push(drawn);

    const out = applyBrand(doc, brandOf(PAPER)).doc;
    const mine = allLayers(out).find((l) => l.name === "Mine");
    expect(mine?.fill).toBe(PAPER.accent);
  });

  /**
   * And the boundary on it: a colour the old theme cannot explain, on a layer the
   * generator never made, is somebody's deliberate choice. Silently recolouring
   * it is worse than missing it.
   */
  it("never touches an unrecognised colour on an unrecognised layer", () => {
    const doc = deckIn("ink");
    const drawn = { ...makeLayer("rect", { x: 10, y: 10, w: 100, h: 100 }, "#123456"), name: "Mine" };
    doc.slides[0]!.layers.push(drawn);

    const { doc: out, skipped } = applyBrand(doc, brandOf(PAPER));
    expect(allLayers(out).find((l) => l.name === "Mine")?.fill).toBe("#123456");
    expect(skipped).toBeGreaterThan(0);
  });

  /** The fallback: a generator layer whose colour was changed still rebrands. */
  it("falls back to the layer name when the colour no longer matches", () => {
    const doc = deckIn("ink");
    const title = allLayers(doc).find((l) => l.name === "Title");
    expect(title).toBeDefined();
    title!.fill = "#abcdef";

    const out = applyBrand(doc, brandOf(PAPER)).doc;
    expect(allLayers(out).find((l) => l.name === "Title")?.fill).toBe(PAPER.fg);
  });

  it("carries the typefaces across, body face included", () => {
    const doc = deckIn("ink");
    const out = applyBrand(doc, brandOf({ ...PAPER, displayFont: "slab", bodyFont: "mono" })).doc;

    const texts = allLayers(out).filter((l) => l.kind === "text");
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t.fontFamily).toBe(t.name === "Body" ? "mono" : "slab");
    }
  });

  it("carries a gradient, and clears one when the brand has none", () => {
    const dusk = styleById("dusk").theme;
    const withRamp = applyBrand(deckIn("ink"), brandOf(dusk)).doc;
    expect(withRamp.slides[0]?.gradient).toEqual(dusk.bgGradient);

    const backToFlat = applyBrand(withRamp, brandOf(PAPER)).doc;
    expect(backToFlat.slides[0]?.gradient).toBeUndefined();
  });

  it("stamps the brand so the document knows what it is wearing", () => {
    const b = brandOf(PAPER);
    expect(applyBrand(deckIn("ink"), b).doc.styleId).toBe(`brand:${b.id}`);
  });

  it("puts the brand colours at the front of the palette without duplicating them", () => {
    const out = applyBrand(deckIn("ink"), brandOf(PAPER)).doc;
    expect(out.palette.slice(0, 4)).toEqual([PAPER.bg, PAPER.fg, PAPER.accent, PAPER.muted]);
    expect(new Set(out.palette).size).toBe(out.palette.length);
    expect(out.palette.length).toBeLessThanOrEqual(10);
  });

  it("is idempotent — applying the same brand twice changes nothing the second time", () => {
    const b = brandOf(PAPER);
    const once = applyBrand(deckIn("ink"), b).doc;
    const twice = applyBrand(once, b);
    expect(twice.changed).toBe(0);
  });

  /**
   * The CTA block prints theme.bg on theme.accent. A name-based rule that saw
   * "Text" and reached for fg would make that copy invisible against its own
   * block — which is exactly what the idempotence test caught.
   */
  it("leaves the CTA block's copy on the background colour, not the foreground", () => {
    const out = applyBrand(deckIn("ink"), brandOf(PAPER)).doc;
    const block = out.slides.find((s) => s.layers.some((l) => l.name === "Block"));
    expect(block).toBeDefined();

    const copy = block!.layers.find((l) => l.kind === "text");
    expect(copy?.fill).toBe(PAPER.bg);
    expect(copy?.fill).not.toBe(PAPER.fg);
  });

  it("survives an empty document", () => {
    const empty = { ...makeDoc(), slides: [] };
    expect(() => applyBrand(empty, brandOf(PAPER))).not.toThrow();
  });

  it("survives a slide with no layers", () => {
    const doc = { ...makeDoc(), slides: [makeSlide("#101215")] };
    const out = applyBrand(doc, brandOf(PAPER)).doc;
    expect(out.slides[0]?.background).toBe(PAPER.bg);
  });
});

describe("reconstructing the old theme", () => {
  it("reads it back off the stamped style", () => {
    expect(themeOf(deckIn("paper")).accent).toBe(PAPER.accent);
  });

  it("falls back to the first slide's background when nothing was stamped", () => {
    const doc = { ...makeDoc(), slides: [makeSlide("#123456")] };
    expect(themeOf(doc).bg).toBe("#123456");
  });

  it("does not try to resolve a brand id through the style table", () => {
    const doc = { ...deckIn("ink"), styleId: "brand:b_missing" };
    expect(() => themeOf(doc)).not.toThrow();
  });

  /** Brands live in the account, so they have to be handed in to be resolvable. */
  it("resolves a brand id when the brands are passed in", () => {
    const b = brandOf(PAPER);
    const doc = { ...deckIn("ink"), styleId: `brand:${b.id}` };
    expect(themeOf(doc, [b]).accent).toBe(PAPER.accent);
    expect(themeOf(doc, []).accent).not.toBe(PAPER.accent);
  });
});
