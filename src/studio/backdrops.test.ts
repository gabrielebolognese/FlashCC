import { describe, expect, it } from "vitest";

import { applyTexture, deckSeed, rng, strengthCap, TEXTURES, textureFor, textureSvg } from "./backdrops.js";
import { makeDoc, makeLayer, makeSlide, type Doc } from "./model.js";
import { slidePaint } from "./paint.js";
import { platformById } from "./platforms.js";

const C = { bg: "#12161c", fg: "#f4f6f8", accent: "#d9a521", muted: "#8b96a5" };

const deck = (words: string[]): Doc => ({
  ...makeDoc("t"),
  slides: words.map((w) => ({
    ...makeSlide("#12161c", "S"),
    layers: [{ ...makeLayer("text", { x: 0, y: 0, w: 100, h: 50 }, "#fff"), text: w }],
  })),
});

describe("rng", () => {
  it("is the same sequence for the same seed", () => {
    const a = rng(42);
    const b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(rng(43)()).not.toBe(rng(42)());
  });
});

describe("textureSvg", () => {
  it.each(TEXTURES.map((t) => t.id))("%s is deterministic, well formed and sized to the board", (kind) => {
    const a = textureSvg(kind, 7, 0.5, C, 1080, 1350);
    expect(textureSvg(kind, 7, 0.5, C, 1080, 1350)).toBe(a);
    expect(a.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"')).toBe(true);
    expect(a.endsWith("</svg>")).toBe(true);
    expect(a).not.toMatch(/NaN|undefined/);
    // Every element opened is closed: a cheap well-formedness check with no DOM.
    const opened = (a.match(/<(?!\/)[a-zA-Z]+[^>]*[^/]>/g) ?? []).length;
    const closed = (a.match(/<\/[a-zA-Z]+>/g) ?? []).length;
    expect(opened).toBe(closed);
  });

  it("differs between seeds for the seeded generators", () => {
    for (const kind of ["mesh", "blobs", "dots", "lines", "tiles", "grain", "paper"] as const) {
      expect(textureSvg(kind, 1, 0.5, C, 1080, 1350)).not.toBe(textureSvg(kind, 99, 0.5, C, 1080, 1350));
    }
  });

  it("draws in the brand's colours, not its own", () => {
    expect(textureSvg("dots", 3, 0.5, C, 1080, 1350)).toContain(C.muted);
    expect(textureSvg("mesh", 3, 0.5, C, 1080, 1350)).toContain(C.accent);
  });

  it("is invisible at zero strength", () => {
    expect(textureSvg("grain", 3, 0, C, 1080, 1350)).toContain('opacity="0"');
  });
});

describe("strengthCap", () => {
  it("caps noise on a 2MB JPEG destination and nothing else", () => {
    const linkedin = platformById("linkedin");
    expect(strengthCap("grain", linkedin)).toBeLessThan(1);
    expect(strengthCap("paper", linkedin)).toBeLessThan(1);
    expect(strengthCap("dots", linkedin)).toBe(1);
    expect(strengthCap("grain", null)).toBe(1);
  });
});

describe("applyTexture", () => {
  const d = deck(["One", "Two", "Three"]);

  it("stamps every slide with a stored SVG, from the deck's seed", () => {
    const out = applyTexture(d, "dots", 0.5, C, null);
    for (const s of out.slides) {
      expect(s.texture?.src.startsWith("data:image/svg+xml,")).toBe(true);
      expect(s.texture?.seed).toBe(deckSeed(d));
    }
    // A pattern holds still across the deck.
    expect(out.slides[0]!.texture!.src).toBe(out.slides[2]!.texture!.src);
  });

  it("moves the mesh per slide, so it does not read as a watermark", () => {
    const out = applyTexture(d, "mesh", 0.5, C, null);
    expect(out.slides[0]!.texture!.src).not.toBe(out.slides[1]!.texture!.src);
  });

  it("is the same for the same deck and different for a different one", () => {
    expect(applyTexture(d, "blobs", 0.5, C, null)).toEqual(applyTexture(d, "blobs", 0.5, C, null));
    const other = deck(["Something", "else", "entirely"]);
    expect(applyTexture(other, "blobs", 0.5, C, null).slides[0]!.texture!.src).not.toBe(
      applyTexture(d, "blobs", 0.5, C, null).slides[0]!.texture!.src,
    );
  });

  it("holds noise under the destination's cap", () => {
    const out = applyTexture(d, "grain", 1, C, platformById("linkedin"));
    expect(out.slides[0]!.texture!.strength).toBe(strengthCap("grain", platformById("linkedin")));
  });

  it("can touch one slide, and null removes it", () => {
    const one = applyTexture(d, "tiles", 0.5, C, null, 1);
    expect(one.slides.map((s) => Boolean(s.texture))).toEqual([false, true, false]);
    const none = applyTexture(one, null, 0.5, C, null);
    expect(none.slides.every((s) => !("texture" in s))).toBe(true);
  });
});

describe("painting a texture", () => {
  it("goes on top of a solid colour", () => {
    const s = { ...makeSlide("#101010"), texture: textureFor("dots", 1, 0, 0.5, C, 1080, 1350) };
    const p = slidePaint(s);
    expect(p.background).toBe("#101010");
    expect(String(p.backgroundImage).startsWith("url('data:image/svg+xml,")).toBe(true);
    expect(p.backgroundSize).toBe("cover");
  });

  it("goes over a picture and its scrim, with a value per layer", () => {
    const s = {
      ...makeSlide("#101010"),
      image: { src: "https://example.com/a.jpg", scrim: 0.3 },
      texture: textureFor("grain", 1, 0, 0.5, C, 1080, 1350),
    };
    const p = slidePaint(s);
    expect(String(p.backgroundImage).split("url('").length - 1).toBe(2);
    expect(String(p.backgroundSize).split(",")).toHaveLength(3);
    expect(String(p.backgroundRepeat).split(",")).toHaveLength(3);
  });

  it("goes over a gradient, spelling out the gradient's defaults", () => {
    const s = {
      ...makeSlide("#101010"),
      gradient: { kind: "linear" as const, angle: 90, cx: 0.5, cy: 0.5, stops: [{ colour: "#000000", at: 0 }, { colour: "#ffffff", at: 1 }] },
      texture: textureFor("lines", 1, 0, 0.5, C, 1080, 1350),
    };
    const p = slidePaint(s);
    expect(String(p.backgroundImage)).toContain("linear-gradient");
    expect(p.backgroundSize).toBe("cover, auto");
    expect(p.backgroundRepeat).toBe("no-repeat, repeat");
  });
});
