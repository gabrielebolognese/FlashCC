import { describe, expect, it } from "vitest";

import { makeLayer, makeSlide, type Layer, type Slide } from "./model.js";
import { distinctRewrites, rebuildsOnRewrite, slideTextWith, slotAt } from "./rewrite.js";
import { STRUCTURES } from "./structures.js";

const text = (id: string, t: string, fontSize: number): Layer => ({
  ...makeLayer("text", { x: 0, y: 0, w: 800, h: 200 }, "#ffffff"),
  id,
  text: t,
  fontSize,
});

const slideOf = (layers: Layer[]): Slide => ({ ...makeSlide("#000000"), layers });

describe("which options are worth showing", () => {
  const opts = [
    { note: "tighter", text: "Cut on movement." },
    { note: "names the cost", text: "Cutting on the beat costs you the swipe." },
  ];

  it("keeps genuinely different options", () => {
    expect(distinctRewrites(opts, "Something else entirely.")).toHaveLength(2);
  });

  /** An option identical to what is on the slide is not an alternative. */
  it("drops one that matches the line already there", () => {
    expect(distinctRewrites(opts, "Cut on movement.")).toHaveLength(1);
  });

  it("ignores punctuation and case when comparing", () => {
    expect(distinctRewrites(opts, "cut on movement")).toHaveLength(1);
    expect(distinctRewrites(opts, "Cut on movement!")).toHaveLength(1);
  });

  it("collapses two options that are the same idea twice", () => {
    const twice = [opts[0]!, { note: "shorter", text: "Cut on movement!" }];
    expect(distinctRewrites(twice, "Nothing alike")).toHaveLength(1);
  });

  it("drops an empty option rather than showing a blank card", () => {
    expect(distinctRewrites([{ note: "x", text: "   " }], "A line")).toHaveLength(0);
  });
});

describe("which slot a slide is, when it can be known", () => {
  const structure = STRUCTURES[0]!;

  it("finds the slot by position while the deck still has its shape", () => {
    const slot = slotAt(0, structure.slots.length, structure.slots);
    expect(slot?.id).toBe(structure.slots[0]?.id);
  });

  /**
   * The correspondence is positional and nothing stores it, so a deck that has
   * been split, merged or added to no longer lines up. A CTA rewritten as a
   * mid-deck point is worse than one rewritten with no slot at all.
   */
  it("refuses to guess once the slide count has drifted", () => {
    expect(slotAt(0, structure.slots.length + 1, structure.slots)).toBeUndefined();
    expect(slotAt(0, structure.slots.length - 1, structure.slots)).toBeUndefined();
  });

  it("is undefined for a deck made with no framework", () => {
    expect(slotAt(0, 8, undefined)).toBeUndefined();
  });
});

describe("rebuilding the slide around a rewritten line", () => {
  /**
   * The bug this exists to prevent: handing `restateSlide` one layer's new text
   * as the whole slide's copy, which rebuilds the slide from that line alone
   * and silently deletes the other one.
   */
  it("keeps the other text layers on the slide", () => {
    const slide = slideOf([text("a", "The heading", 72), text("b", "The body copy", 36)]);
    expect(slideTextWith(slide, "a", "A new heading")).toBe("A new heading\nThe body copy");
  });

  it("swaps the body without touching the heading", () => {
    const slide = slideOf([text("a", "The heading", 72), text("b", "The body copy", 36)]);
    expect(slideTextWith(slide, "b", "New body")).toBe("The heading\nNew body");
  });

  /** Biggest font first, matching `textsOf`, whatever order the layers are in. */
  it("reassembles in the order the generator reads, not layer order", () => {
    const slide = slideOf([text("b", "The body copy", 36), text("a", "The heading", 72)]);
    expect(slideTextWith(slide, "a", "New heading")).toBe("New heading\nThe body copy");
  });

  it("ignores non-text and empty layers", () => {
    const slide = slideOf([
      text("a", "The heading", 72),
      text("blank", "   ", 40),
      { ...makeLayer("rect", { x: 0, y: 0, w: 10, h: 10 }, "#fff"), id: "r" },
    ]);
    expect(slideTextWith(slide, "a", "New")).toBe("New");
  });

  it("drops the line entirely when it is rewritten to nothing", () => {
    const slide = slideOf([text("a", "Heading", 72), text("b", "Body", 36)]);
    expect(slideTextWith(slide, "a", "  ")).toBe("Body");
  });

  it("leaves a slide it does not recognise alone", () => {
    const slide = slideOf([text("a", "Heading", 72)]);
    expect(slideTextWith(slide, "missing", "New")).toBe("Heading");
  });
});

describe("which layers rebuild and which are written to directly", () => {
  /** A generated box was measured for the old words, so it has to be recomputed. */
  it("rebuilds a generated layer", () => {
    expect(rebuildsOnRewrite(text("a", "Line", 72))).toBe(true);
  });

  /**
   * Running `restateSlide` on a hand-edited layer prints the new words as a
   * generated layer AND keeps the old hand-placed one: the same line twice.
   * Somebody who dragged a box has also already said where it goes.
   */
  it("writes straight to a layer somebody has moved", () => {
    expect(rebuildsOnRewrite({ ...text("a", "Line", 72), handEdited: true })).toBe(false);
  });
});
