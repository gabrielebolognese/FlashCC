import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { FILLER, PREVIEW_COUNT, previewDeck } from "./preview.js";
import { styleById } from "./styles.js";

const THEME = styleById("ink").theme;

const deckOf = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `Slide ${i + 1}, a line of real copy about editing.`);

describe("which slides the style editor previews", () => {
  it("uses the real deck when it is long enough, and borrows nothing", () => {
    const out = previewDeck(deckOf(9));
    expect(out.texts).toHaveLength(PREVIEW_COUNT);
    expect(out.borrowed).toBe(0);
    expect(out.texts.every((t) => !FILLER.includes(t))).toBe(true);
  });

  it("pads a short deck up to six and says how many it borrowed", () => {
    const out = previewDeck(deckOf(2));
    expect(out.texts).toHaveLength(PREVIEW_COUNT);
    expect(out.borrowed).toBe(4);
    expect(out.texts.slice(0, 2)).toEqual(deckOf(2));
  });

  it("fills the whole grid from nothing at all", () => {
    const out = previewDeck([]);
    expect(out.texts).toHaveLength(PREVIEW_COUNT);
    expect(out.borrowed).toBe(PREVIEW_COUNT);
  });

  it("keeps the roles of real slides", () => {
    const out = previewDeck(deckOf(3), ["hook", "problem", "why"]);
    expect(out.roles.slice(0, 3)).toEqual(["hook", "problem", "why"]);
  });

  /**
   * Filler takes no role on purpose. A pinned role on a borrowed slide spends a
   * preview repeating a layout the real slides already showed, and coverage is
   * the entire point of the grid.
   */
  it("gives filler no role, so the cycle decides its layout", () => {
    const out = previewDeck(deckOf(2), ["hook", "problem"]);
    expect(out.roles.slice(2)).toEqual([undefined, undefined, undefined, undefined]);
  });

  /**
   * Blank boxes are common: somebody writes four slides of eight and moves on.
   * Dropping the text without dropping the matching role would slide every role
   * up by one and preview the wrong layouts, which nothing would notice.
   */
  it("drops blank slides without unaligning the roles", () => {
    const out = previewDeck(
      ["A real hook.", "   ", "The problem.", "", "The fix."],
      ["hook", "skipped", "problem", "alsoskipped", "solution"],
    );
    expect(out.texts.slice(0, 3)).toEqual(["A real hook.", "The problem.", "The fix."]);
    expect(out.roles.slice(0, 3)).toEqual(["hook", "problem", "solution"]);
  });
});

/**
 * The actual complaint this was built for: the editor showed one composition, so
 * a palette was chosen having never been seen on a quote or a colour block.
 */
describe("the previews are visibly different from each other", () => {
  /** Layer count plus rounded geometry. Two slides matching on all of it look the same. */
  const shapeOf = (slide: { layers: { kind: string; x: number; y: number; w: number; h: number }[] }) =>
    slide.layers
      .map((l) => `${l.kind}:${Math.round(l.x)},${Math.round(l.y)},${Math.round(l.w)},${Math.round(l.h)}`)
      .join("|");

  it("produces six distinct layouts from an ordinary deck", () => {
    const deck = previewDeck(deckOf(8), ["hook", "problem", "why", "solution", "point", "point"]);
    const slides = buildSlides(deck.texts, THEME, deck.roles as string[]).slice(0, PREVIEW_COUNT);

    expect(slides).toHaveLength(PREVIEW_COUNT);
    expect(new Set(slides.map(shapeOf)).size).toBe(PREVIEW_COUNT);
  });

  it("is still varied when every slide is filler", () => {
    const deck = previewDeck([]);
    const slides = buildSlides(deck.texts, THEME, deck.roles as string[]).slice(0, PREVIEW_COUNT);
    expect(new Set(slides.map(shapeOf)).size).toBe(PREVIEW_COUNT);
  });

  /** Adjacent repeats are the ones a reader notices first. */
  it("never repeats a layout on consecutive previews", () => {
    const deck = previewDeck(deckOf(6), ["hook", "problem", "why", "solution", "point", "cta"]);
    const shapes = buildSlides(deck.texts, THEME, deck.roles as string[])
      .slice(0, PREVIEW_COUNT)
      .map(shapeOf);

    for (let i = 1; i < shapes.length; i += 1) {
      expect(shapes[i]).not.toBe(shapes[i - 1]);
    }
  });

  /**
   * Half the compositions put the picture band above the text and half below,
   * and that is one of the things a style has to survive. If every preview
   * banded the same way the grid would be six variations of one idea.
   */
  it("shows the image band both above and below the text", () => {
    const deck = previewDeck(deckOf(8));
    const slides = buildSlides(deck.texts, THEME, deck.roles as string[]).slice(0, PREVIEW_COUNT);

    const bandTops = slides
      .map((s) => s.layers.find((l) => l.kind === "image"))
      .filter((l): l is NonNullable<typeof l> => Boolean(l))
      .map((l) => l.y);

    expect(bandTops.length).toBeGreaterThan(1);
    expect(new Set(bandTops).size).toBeGreaterThan(1);
  });
});
