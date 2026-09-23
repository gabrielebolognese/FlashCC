import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { makeDoc, makeLayer, makeSlide, type Doc, type Layer } from "./model.js";
import { THEMES } from "./presets.js";
import {
  canMergeUp,
  canSplit,
  findOverflows,
  mainText,
  mergeSlideUp,
  needsSplit,
  sizeWithin,
  splitOverflowing,
  splitSlide,
  splitToFit,
  type FitSpec,
} from "./split.js";
import { ladder } from "./text.js";

const spec = (w: number, h: number, max = 60, min = 24): FitSpec => ({
  box: { w, h },
  sizes: ladder(max, min),
  lineHeight: 1.3,
});

const SHORT = "A single short line.";
const LONG =
  "Most cuts happen on the beat. That is why your edit feels mechanical. " +
  "Cut on motion instead and the join disappears. " +
  "The viewer is already following the movement, so they never notice the edit at all. " +
  "That is the whole trick, and it takes about ten minutes to learn.";

/** Words in, words out, the promise the whole module rests on. */
const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);

describe("fitting within an allowance", () => {
  it("finds a size for copy that comfortably fits", () => {
    expect(sizeWithin(SHORT, spec(880, 400))).not.toBeNull();
  });

  it("refuses when the copy would need more than two steps down", () => {
    expect(sizeWithin(LONG, spec(880, 120))).toBeNull();
    expect(needsSplit(LONG, spec(880, 120))).toBe(true);
  });

  /**
   * The behaviour being refused, stated as a test: the full ladder WOULD have
   * found a size here. Two steps deliberately does not, so the copy gets another
   * slide instead of being squashed into this one.
   */
  it("would have accepted it with the whole ladder, which is the point", () => {
    const box = spec(880, 170);
    expect(sizeWithin(LONG, box, 2)).toBeNull();
    expect(sizeWithin(LONG, box, 11)).not.toBeNull();
  });

  it("treats empty copy as needing nothing", () => {
    expect(needsSplit("   ", spec(880, 100))).toBe(false);
  });
});

describe("splitting copy", () => {
  it("leaves copy that fits alone", () => {
    expect(splitToFit(SHORT, spec(880, 400))).toEqual([SHORT]);
  });

  it("splits copy that does not", () => {
    expect(splitToFit(LONG, spec(880, 120)).length).toBeGreaterThan(1);
  });

  /**
   * The whole promise: "our copy is client-approved and must not be reworded."
   * Every word, in order, with nothing added or lost.
   */
  it("never changes a single word", () => {
    const pieces = splitToFit(LONG, spec(880, 120));
    expect(words(pieces.join(" "))).toEqual(words(LONG));
  });

  /**
   * Given room to work, every piece starts a sentence. Squeeze the box hard
   * enough and it has to fall through to word breaks, that is the documented
   * ladder, and better than refusing to split at all.
   */
  it("cuts on sentence boundaries when the box leaves it the choice", () => {
    for (const piece of splitToFit(LONG, spec(880, 220))) {
      expect(piece).not.toMatch(/^[a-z]/);
    }
  });

  it("makes every piece actually fit", () => {
    const s = spec(880, 120);
    for (const piece of splitToFit(LONG, s)) {
      expect(needsSplit(piece, s)).toBe(false);
    }
  });

  it("produces pieces of roughly similar length, not one long and one stub", () => {
    const pieces = splitToFit(LONG, spec(880, 200));
    expect(pieces.length).toBeGreaterThan(1);
    const lengths = pieces.map((p) => p.length);
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(4);
  });

  /** A single enormous word cannot be cut without rewording, so it is not. */
  it("returns an unsplittable run whole rather than breaking a word", () => {
    const word = "a".repeat(400);
    expect(splitToFit(word, spec(200, 60))).toEqual([word]);
  });

  it("terminates on pathological input", () => {
    expect(splitToFit(LONG.repeat(6), spec(300, 40)).length).toBeLessThanOrEqual(12);
  });
});

/* ── slide operations ─────────────────────────────────────────────────────── */

const deck = (): Doc => ({
  ...makeDoc("Test"),
  slides: buildSlides(["A hook that earns the swipe.", LONG, "Follow for more."], THEMES.ink!),
});

const textOf = (doc: Doc, i: number): string => mainText(doc.slides[i]!)?.text ?? "";
const allLayerIds = (doc: Doc): string[] => doc.slides.flatMap((s) => s.layers.map((l) => l.id));

describe("splitting a slide", () => {
  it("turns one slide into two", () => {
    const doc = deck();
    const out = splitSlide(doc, 1);
    expect(out.slides).toHaveLength(doc.slides.length + 1);
  });

  it("keeps every word across the two", () => {
    const doc = deck();
    const before = textOf(doc, 1);
    const out = splitSlide(doc, 1);
    expect(words(`${textOf(out, 1)} ${textOf(out, 2)}`)).toEqual(words(before));
  });

  /** Duplicate ids across slides break selection, undo and sync silently. */
  it("gives the copied slide fresh layer ids", () => {
    const ids = allLayerIds(splitSlide(deck(), 1));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the hand-drawn shapes on both halves", () => {
    const doc = deck();
    const drawn = { ...makeLayer("rect", { x: 0, y: 0, w: 50, h: 50 }, "#fff"), name: "Mine" };
    doc.slides[1]!.layers.push(drawn);

    const out = splitSlide(doc, 1);
    expect(out.slides[1]?.layers.some((l) => l.name === "Mine")).toBe(true);
    expect(out.slides[2]?.layers.some((l) => l.name === "Mine")).toBe(true);
  });

  it("refuses rather than mangling a slide it cannot split", () => {
    const doc: Doc = {
      ...makeDoc(),
      slides: [
        {
          ...makeSlide(),
          layers: [{ ...(makeLayer("text", { x: 0, y: 0, w: 100, h: 100 }, "#fff") as Layer), text: "Indivisible" }],
        },
      ],
    };
    expect(canSplit(doc.slides[0])).toBe(false);
    expect(splitSlide(doc, 0).slides).toHaveLength(1);
  });

  it("does nothing on an out-of-range index", () => {
    const doc = deck();
    expect(splitSlide(doc, 99)).toBe(doc);
  });
});

describe("merging a slide up", () => {
  it("joins the copy and drops the slide", () => {
    const doc = deck();
    const joined = `${textOf(doc, 0)} ${textOf(doc, 1)}`;
    const out = mergeSlideUp(doc, 1);

    expect(out.slides).toHaveLength(doc.slides.length - 1);
    expect(words(textOf(out, 0))).toEqual(words(joined));
  });

  it("refuses to merge the first slide upward", () => {
    const doc = deck();
    expect(mergeSlideUp(doc, 0)).toBe(doc);
    expect(canMergeUp(doc, 0)).toBe(false);
  });

  /** Split then merge should land back on the words you started with. */
  it("round-trips with split", () => {
    const doc = deck();
    const before = words(textOf(doc, 1));
    const out = mergeSlideUp(splitSlide(doc, 1), 2);
    expect(words(textOf(out, 1))).toEqual(before);
  });
});

describe("finding and fixing overflow across a batch", () => {
  const cramped = (): Doc => {
    const doc = deck();
    const layer = mainText(doc.slides[1]!);
    if (layer) layer.h = 60;
    return doc;
  };

  it("names the document and the slide", () => {
    const found = findOverflows([cramped()]);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.slide).toBe(2);
    expect(found[0]?.docName).toBe("Test");
  });

  it("says nothing about a healthy deck", () => {
    expect(findOverflows([deck()])).toEqual([]);
  });

  it("reports across several documents at once", () => {
    expect(findOverflows([cramped(), cramped()]).length).toBeGreaterThan(1);
  });

  it("splits until the deck stops overflowing", () => {
    const fixed = splitOverflowing(cramped());
    expect(fixed.slides.length).toBeGreaterThan(3);
  });

  it("terminates rather than spinning on a deck it cannot fix", () => {
    const doc: Doc = {
      ...makeDoc(),
      slides: [
        {
          ...makeSlide(),
          layers: [
            {
              ...(makeLayer("text", { x: 0, y: 0, w: 100, h: 10 }, "#fff") as Layer),
              text: "Indivisible",
              fontSize: 80,
            },
          ],
        },
      ],
    };
    expect(() => splitOverflowing(doc)).not.toThrow();
    expect(splitOverflowing(doc).slides).toHaveLength(1);
  });
});
