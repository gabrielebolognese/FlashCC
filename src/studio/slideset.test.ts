import { describe, expect, it } from "vitest";

import { makeSlide, type Slide } from "./model.js";
import { deleteSet, duplicateSet, inDeckOrder, moveSet, rangeSelect, toggleSelect } from "./slideset.js";

const deck = (n: number): Slide[] =>
  Array.from({ length: n }, (_, i) => ({ ...makeSlide(), id: `s${i + 1}`, name: `${i + 1}` }));
const names = (slides: Slide[]) => slides.map((s) => s.name);

describe("selecting slides", () => {
  it("selects a range with shift, either direction", () => {
    expect(rangeSelect(deck(8), "s3", "s6")).toEqual(["s3", "s4", "s5", "s6"]);
    expect(rangeSelect(deck(8), "s6", "s3")).toEqual(["s3", "s4", "s5", "s6"]);
  });

  it("toggles one in or out with the modifier", () => {
    expect(toggleSelect(["s1", "s3"], "s3")).toEqual(["s1"]);
    expect(toggleSelect(["s1"], "s3")).toEqual(["s1", "s3"]);
  });

  it("reads a selection in deck order, however it was clicked", () => {
    expect(inDeckOrder(deck(5), ["s4", "s2"])).toEqual(["s2", "s4"]);
  });
});

describe("acting on a set", () => {
  /** 18.5's done-when. */
  it("duplicates 3 to 6 directly after 6, in order", () => {
    const out = duplicateSet(deck(8), ["s5", "s3", "s6", "s4"], (s) => ({ ...s, id: `${s.id}c`, name: `${s.name}'` }));
    expect(names(out)).toEqual(["1", "2", "3", "4", "5", "6", "3'", "4'", "5'", "6'", "7", "8"]);
  });

  it("deletes the set, and never the whole deck", () => {
    expect(names(deleteSet(deck(5), ["s2", "s4"]))).toEqual(["1", "3", "5"]);
    expect(deleteSet(deck(2), ["s1", "s2"])).toHaveLength(2);
  });

  it("moves the set as a block, keeping its order", () => {
    // Right: lands after the target.
    expect(names(moveSet(deck(6), ["s1", "s3"], "s5"))).toEqual(["2", "4", "5", "1", "3", "6"]);
    // Left: lands before it.
    expect(names(moveSet(deck(6), ["s4", "s6"], "s2"))).toEqual(["1", "4", "6", "2", "3", "5"]);
    // Onto itself: nothing.
    expect(names(moveSet(deck(4), ["s2", "s3"], "s3"))).toEqual(["1", "2", "3", "4"]);
  });

  it("keeps the selection valid across a reorder, because it holds ids", () => {
    const moved = moveSet(deck(6), ["s1", "s3"], "s5");
    expect(inDeckOrder(moved, ["s1", "s3"])).toEqual(["s1", "s3"]);
  });
});
