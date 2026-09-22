import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { makeDoc, type Doc } from "./model.js";
import { restateSlide, textsOf } from "./regenerate.js";
import { styleById } from "./styles.js";
import { distinctHooks, type HookVariant } from "./variants.js";

const THEME = styleById("ink").theme;
const COPY = ["A hook that earns the swipe.", "Some body copy in the middle.", "Follow for more."];

const deck = (): Doc => ({ ...makeDoc("Test"), styleId: "ink", slides: buildSlides(COPY, THEME) });

const v = (angle: string, text: string): HookVariant => ({ angle, text });

describe("keeping only the variants worth showing", () => {
  it("drops one identical to what is already on the slide", () => {
    const out = distinctHooks([v("a", "Stop doing this"), v("b", "Try this instead")], "Stop doing this");
    expect(out.map((x) => x.text)).toEqual(["Try this instead"]);
  });

  /** Two that differ only by punctuation are one idea wearing two hats. */
  it("collapses punctuation-only differences", () => {
    const out = distinctHooks([v("a", "Stop doing this."), v("b", "Stop doing this!")], "");
    expect(out).toHaveLength(1);
  });

  it("ignores case when comparing", () => {
    expect(distinctHooks([v("a", "STOP DOING THIS")], "stop doing this")).toHaveLength(0);
  });

  it("keeps genuinely different angles", () => {
    const out = distinctHooks(
      [v("the cost", "This costs you 3 hours a week"), v("contrarian", "Beats are a trap")],
      "Stop doing this",
    );
    expect(out).toHaveLength(2);
  });

  it("drops an empty one rather than offering a blank card", () => {
    expect(distinctHooks([v("a", "   ")], "")).toHaveLength(0);
  });
});

describe("putting a chosen hook back on the deck", () => {
  it("changes slide one and leaves the rest alone", () => {
    const before = deck();
    const after = restateSlide(before, 0, "Beats are a trap. Here is why.", THEME).doc;

    expect(textsOf(after)[0]).toContain("Beats are a trap");
    expect(textsOf(after)[1]).toBe(textsOf(before)[1]);
    expect(textsOf(after)[2]).toBe(textsOf(before)[2]);
  });

  /**
   * The layer's box and font size were chosen for the OLD words. Writing new
   * text onto it is how "text too small to read" arrives by a different door.
   */
  it("lays the slide out again rather than retyping the layer", () => {
    const before = deck();
    const oldIds = before.slides[0]?.layers.map((l) => l.id) ?? [];
    const after = restateSlide(before, 0, "A completely different opening line", THEME).doc;
    const newIds = after.slides[0]?.layers.map((l) => l.id) ?? [];

    expect(newIds.some((id) => oldIds.includes(id))).toBe(false);
  });

  it("keeps hand-edited layers on that slide", () => {
    const doc = deck();
    doc.slides[0]!.layers.push({ ...doc.slides[0]!.layers[0]!, id: "mine", name: "Mine", handEdited: true });

    const out = restateSlide(doc, 0, "Another opening", THEME);
    expect(out.kept).toBe(1);
    expect(out.doc.slides[0]?.layers.some((l) => l.name === "Mine")).toBe(true);
  });

  it("restyles through the theme it is given", () => {
    const paper = styleById("paper").theme;
    const out = restateSlide(deck(), 0, "Another opening", paper).doc;
    expect(out.slides[0]?.background).toBe(paper.bg);
  });

  it("leaves the deck alone when asked about a slide that is not there", () => {
    const before = deck();
    expect(restateSlide(before, 9, "Nope", THEME).doc).toBe(before);
  });

  /** A rewrite long enough to split is a different deck, and says so. */
  it("returns the whole regeneration when the rewrite changes the slide count", () => {
    const before = deck();
    const huge = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} carries real weight here.`).join(" ");
    const out = restateSlide(before, 0, huge, THEME);
    expect(out.doc.slides.length).toBeGreaterThan(before.slides.length);
  });

  it("does not throw on an empty deck", () => {
    expect(() => restateSlide({ ...makeDoc(), slides: [] }, 0, "x", THEME)).not.toThrow();
  });
});
