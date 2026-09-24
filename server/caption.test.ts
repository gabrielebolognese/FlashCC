import { describe, expect, it } from "vitest";

import { groundedTags, phraseIn, stem, tidyTag } from "./caption.js";

const DECK = [
  "Cutting on the beat makes your edits feel mechanical.",
  "Attention resets when the frame changes, not when the snare hits.",
  "Cut on movement instead: a hand leaving frame, a head turning.",
];

describe("one hashtag, or nothing", () => {
  it("strips a leading hash", () => {
    expect(tidyTag("#editing")).toBe("editing");
    expect(tidyTag("##editing")).toBe("editing");
  });

  /** Asked for no symbol, a model supplies one about a third of the time. */
  it("accepts one written either way", () => {
    expect(tidyTag("editing")).toBe("editing");
  });

  it("closes up a tag written with spaces in it", () => {
    expect(tidyTag("video editing")).toBe("videoediting");
  });

  /** A tag that cannot be pasted into a post is not a tag. */
  it("refuses one with punctuation left in", () => {
    expect(tidyTag("video-editing")).toBeNull();
    expect(tidyTag("editing!")).toBeNull();
    expect(tidyTag("what's this")).toBeNull();
  });

  it("keeps underscores and digits, which are legal", () => {
    expect(tidyTag("video_editing_101")).toBe("video_editing_101");
  });

  it("refuses an empty one", () => {
    expect(tidyTag("")).toBeNull();
    expect(tidyTag("#")).toBeNull();
    expect(tidyTag("   ")).toBeNull();
  });

  it("refuses an absurdly long one", () => {
    expect(tidyTag("a".repeat(60))).toBeNull();
  });
});

/**
 * The failure this exists to stop: a caption writer left alone returns
 * #marketing, #contentcreation and #growth every time. They describe nothing,
 * they reach nobody, and they are the fabrication problem in a different
 * costume, words asserted about somebody's post that the post does not contain.
 */
describe("only tags the carousel can support", () => {
  it("keeps a tag the deck actually uses", () => {
    expect(groundedTags(["editing"], DECK, 5)).toEqual(["editing"]);
    expect(groundedTags(["movement"], DECK, 5)).toEqual(["movement"]);
  });

  it("drops the generic ones nobody asked for", () => {
    expect(groundedTags(["marketing", "contentcreation", "growth"], DECK, 5)).toEqual([]);
  });

  /** How hashtags are actually written: a phrase closed up. */
  it("supports a two-word phrase from the deck as one tag", () => {
    expect(groundedTags(["cutonmovement"], DECK, 5)).toEqual(["cutonmovement"]);
  });

  it("matches across the deck's own punctuation", () => {
    expect(groundedTags(["framechanges"], DECK, 5)).toEqual(["framechanges"]);
  });

  it("ignores case on both sides", () => {
    expect(groundedTags(["EDITING"], DECK, 5)).toEqual(["EDITING"]);
  });

  it("keeps the tag as written, not as matched", () => {
    expect(groundedTags(["VideoEdits"], ["video edits are hard"], 5)).toEqual(["VideoEdits"]);
  });

  it("drops duplicates that differ only by case", () => {
    expect(groundedTags(["editing", "Editing", "#editing"], DECK, 5)).toEqual(["editing"]);
  });

  it("honours the platform's allowance", () => {
    const many = ["editing", "movement", "attention", "frame", "snare"];
    expect(groundedTags(many, DECK, 2)).toHaveLength(2);
  });

  it("returns nothing rather than filling up with junk", () => {
    expect(groundedTags([], DECK, 5)).toEqual([]);
    expect(groundedTags(["marketing", "!!!", ""], DECK, 5)).toEqual([]);
  });

  it("survives an empty deck without matching everything", () => {
    expect(groundedTags(["editing"], [], 5)).toEqual([]);
  });
});

describe("seeing that two words are the same word", () => {
  it("collapses a verb's forms", () => {
    expect(stem("edits")).toBe(stem("editing"));
    expect(stem("edit")).toBe(stem("edits"));
  });

  /** Without the doubled-consonant rule this stops at "cutt". */
  it("handles a doubled consonant before ing", () => {
    expect(stem("cutting")).toBe("cut");
  });

  it("leaves a short word alone rather than mangling it", () => {
    expect(stem("cut")).toBe("cut");
    expect(stem("is")).toBe("is");
    expect(stem("ads")).toBe("ads");
  });

  /**
   * The pair that decides how loose this is allowed to be. A prefix match would
   * have joined them on "cont" and let #content through on any deck that says
   * "contains".
   */
  it("does not join two words that merely start alike", () => {
    expect(stem("content")).not.toBe(stem("contains"));
    expect(stem("marketing")).not.toBe(stem("market1"));
  });
});

describe("a tag has to be a phrase the deck actually says", () => {
  const words = "cutting on the beat makes your edits feel mechanical and not on movement".split(" ");

  /** A real phrase from the deck, whose longest word is only four letters. */
  it("accepts a consecutive phrase, stemming the deck side", () => {
    expect(phraseIn("cutonthebeat", words)).toBe(true);
    expect(phraseIn("cuttingonthebeat", words)).toBe(true);
  });

  /**
   * The case a length rule could not separate from the one above. These three
   * words are all in the deck and never next to each other.
   */
  it("refuses words the deck never puts together", () => {
    expect(phraseIn("theandnot", words)).toBe(false);
  });

  /** A tag that merges two separate phrases. The deck never said it. */
  it("refuses a phrase assembled out of two others", () => {
    expect(phraseIn("cuttingonmovement", words)).toBe(false);
  });

  it("refuses a phrase with a word the deck never uses", () => {
    expect(phraseIn("videoediting", words)).toBe(false);
  });

  it("does not fall over on a long tag of nonsense", () => {
    expect(phraseIn("x".repeat(40), words)).toBe(false);
    expect(phraseIn("anything", [])).toBe(false);
  });
});
