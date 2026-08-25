import { describe, expect, it } from "vitest";

import { buildSlides, compositionFor, MAX_SLIDES } from "./compositions.js";
import { THEMES } from "./presets.js";

const theme = THEMES.ink!;
const W = 1080;
const H = 1350;

const texts = (n: number) => Array.from({ length: n }, (_, i) => `Slide ${i + 1} says something here.`);

describe("compositionFor", () => {
  it("always makes the first slide the title", () => {
    for (const n of [1, 2, 3, 10, 35]) expect(compositionFor(0, n).id).toBe("title");
  });

  it("closes a real deck on the colour block", () => {
    expect(compositionFor(9, 10).id).toBe("block");
    // ...but a two-slide deck has no room for a closer
    expect(compositionFor(1, 2).id).not.toBe("block");
  });

  it("never repeats a composition on consecutive slides", () => {
    for (const total of [5, 8, 12, 35]) {
      for (let i = 0; i < total - 1; i += 1) {
        expect(compositionFor(i, total).id, `${i}→${i + 1} of ${total}`).not.toBe(
          compositionFor(i + 1, total).id,
        );
      }
    }
  });

  it("uses several distinct compositions across a deck", () => {
    const ids = new Set(texts(12).map((_, i) => compositionFor(i, 12).id));
    expect(ids.size).toBeGreaterThanOrEqual(6);
  });
});

describe("buildSlides", () => {
  it("makes one slide per non-empty text", () => {
    expect(buildSlides(texts(7), theme)).toHaveLength(7);
    expect(buildSlides(["a", "  ", "", "b"], theme)).toHaveLength(2);
  });

  it("never returns an empty deck", () => {
    expect(buildSlides([], theme)).toHaveLength(1);
    expect(buildSlides(["   "], theme)).toHaveLength(1);
  });

  it("puts every input word on its slide", () => {
    const input = ["The quick brown fox", "Jumped over the lazy dog completely"];
    const slides = buildSlides(input, theme);
    slides.forEach((s, i) => {
      const rendered = s.layers.map((l) => l.text ?? "").join(" ");
      for (const word of input[i]!.split(" ")) expect(rendered).toContain(word);
    });
  });

  it("keeps layers inside the artboard", () => {
    const slides = buildSlides(texts(MAX_SLIDES), theme);
    for (const s of slides) {
      for (const l of s.layers) {
        expect(l.x).toBeGreaterThanOrEqual(0);
        expect(l.y).toBeGreaterThanOrEqual(0);
        expect(l.x + l.w).toBeLessThanOrEqual(W + 1);
        expect(l.y + l.h).toBeLessThanOrEqual(H + 1);
      }
    }
  });

  it("scales type down as text gets longer, and never below the floor", () => {
    const short = buildSlides(["Short hook"], theme)[0]!;
    const long = buildSlides([`Long hook ${"with many more words ".repeat(20)}`], theme)[0]!;
    const sizeOf = (s: typeof short) =>
      Math.max(...s.layers.filter((l) => l.kind === "text").map((l) => l.fontSize ?? 0));
    expect(sizeOf(short)).toBeGreaterThan(sizeOf(long));
    expect(sizeOf(long)).toBeGreaterThanOrEqual(28);
  });

  it("handles the full 35 without producing a degenerate layer", () => {
    const slides = buildSlides(texts(MAX_SLIDES), theme);
    expect(slides).toHaveLength(MAX_SLIDES);
    for (const s of slides) {
      expect(s.layers.length).toBeGreaterThan(0);
      for (const l of s.layers) {
        expect(Number.isFinite(l.x) && Number.isFinite(l.y)).toBe(true);
        expect(l.w).toBeGreaterThan(0);
        expect(l.h).toBeGreaterThan(0);
      }
    }
  });

  it("splits a lead sentence into a heading plus body", () => {
    const s = buildSlides(["First slide.", "The point. And then the supporting detail follows here."], theme)[1]!;
    const t = s.layers.filter((l) => l.kind === "text");
    expect(t.length).toBe(2);
    expect(t[0]?.fontSize ?? 0).toBeGreaterThan(t[1]?.fontSize ?? 0);
  });

  it("is deterministic", () => {
    const a = JSON.stringify(buildSlides(texts(6), theme).map((s) => s.layers.map((l) => [l.x, l.y, l.w, l.h, l.fontSize])));
    const b = JSON.stringify(buildSlides(texts(6), theme).map((s) => s.layers.map((l) => [l.x, l.y, l.w, l.h, l.fontSize])));
    expect(a).toBe(b);
  });

  it("gives consecutive slides visibly different geometry", () => {
    const slides = buildSlides(texts(6), theme);
    const sig = (i: number) =>
      slides[i]!.layers.map((l) => `${Math.round(l.x)},${Math.round(l.y)},${l.fontSize ?? 0}`).join("|");
    for (let i = 0; i < slides.length - 1; i += 1) expect(sig(i)).not.toBe(sig(i + 1));
  });
});
