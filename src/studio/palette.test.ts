import { describe, expect, it } from "vitest";

import { contrast, hexToRgb } from "./colour.js";
import { paletteOf, proposeTheme, quantise, saturation, vividOf } from "./palette.js";

/** A picture made of solid blocks: [hex, pixel count] pairs. */
function picture(parts: [string, number][], alpha = 255): Uint8ClampedArray {
  const px: number[] = [];
  for (const [hex, n] of parts) {
    const { r, g, b } = hexToRgb(hex);
    for (let i = 0; i < n; i += 1) px.push(r, g, b, alpha);
  }
  return new Uint8ClampedArray(px);
}

describe("quantise", () => {
  it("finds the colours a picture is made of, most common first", () => {
    const s = quantise(picture([["#1e3a8a", 600], ["#f59e0b", 300], ["#ffffff", 100]]), 8);
    expect(s).toHaveLength(3);
    expect(s[0]!.share).toBeCloseTo(0.6, 5);
    // 5-bit buckets: within one step of the source colour on each channel.
    const near = (a: string, b: string) => {
      const x = hexToRgb(a);
      const y = hexToRgb(b);
      return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b)) <= 8;
    };
    expect(near(s[0]!.hex, "#1e3a8a")).toBe(true);
    expect(near(s[1]!.hex, "#f59e0b")).toBe(true);
  });

  it("is deterministic", () => {
    const p = picture([["#123456", 50], ["#abcdef", 70], ["#ff0000", 20], ["#00ff00", 10]]);
    expect(quantise(p)).toEqual(quantise(p));
  });

  it("ignores transparent pixels, so a logo's margin is not its colour", () => {
    expect(quantise(picture([["#ffffff", 100]], 0))).toEqual([]);
  });

  it("never returns more than asked", () => {
    const many: [string, number][] = Array.from({ length: 40 }, (_, i) => [`#${(i * 6).toString(16).padStart(2, "0")}40${(255 - i * 6).toString(16).padStart(2, "0")}`, 10]);
    expect(quantise(picture(many), 6).length).toBeLessThanOrEqual(6);
  });
});

describe("proposeTheme", () => {
  const cases: [string, [string, number][]][] = [
    ["a dark logo with an orange mark", [["#0b1220", 700], ["#f97316", 200], ["#e5e7eb", 100]]],
    ["a pale product shot", [["#f4efe6", 600], ["#c9b79c", 300], ["#2f855a", 100]]],
    ["a mid-grey photo", [["#808080", 800], ["#7a7f8a", 200]]],
    ["a saturated blue on white", [["#ffffff", 500], ["#2563eb", 500]]],
    ["a yellow flyer", [["#facc15", 900], ["#111111", 100]]],
  ];

  it.each(cases)("passes contrast for %s", (_, parts) => {
    const t = proposeTheme(quantise(picture(parts)))!;
    expect(contrast(t.fg, t.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.muted, t.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.accent, t.bg)).toBeGreaterThanOrEqual(3);
    for (const v of [t.bg, t.fg, t.accent, t.muted]) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("takes the accent from the most colourful swatch, not the commonest", () => {
    const t = proposeTheme(quantise(picture([["#0b1220", 700], ["#f97316", 200], ["#e5e7eb", 100]])))!;
    expect(saturation(t.accent)).toBeGreaterThan(0.6);
    const { r, b } = hexToRgb(t.accent);
    expect(r).toBeGreaterThan(b);
  });

  it("leans light for a light picture and dark for a dark one", () => {
    expect(contrast(proposeTheme(quantise(picture([["#f4efe6", 900], ["#2f855a", 100]])))!.bg, "#ffffff")).toBeLessThan(1.5);
    expect(contrast(proposeTheme(quantise(picture([["#0b1220", 900], ["#f97316", 100]])))!.bg, "#000000")).toBeLessThan(1.5);
  });

  it("proposes nothing for an empty picture", () => {
    expect(paletteOf(new Uint8ClampedArray(0)).theme).toBeNull();
  });
});

describe("vividOf", () => {
  it("finds a small vivid colour that median cut would average away", () => {
    // Mostly browns and greys, 5% orange: the orange is the accent a person would name.
    const p = picture([["#3a3226", 500], ["#5b4a36", 300], ["#6b6b6b", 150], ["#f26a1b", 50]]);
    const v = vividOf(p)!;
    expect(v.share).toBeCloseTo(0.05, 2);
    const t = paletteOf(p).theme!;
    const { r, g, b } = hexToRgb(t.accent);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(contrast(t.accent, t.bg)).toBeGreaterThanOrEqual(3);
  });

  it("finds nothing in a grey picture rather than inventing a colour", () => {
    expect(vividOf(picture([["#777777", 500], ["#8a8580", 500]]))).toBeNull();
  });
});
