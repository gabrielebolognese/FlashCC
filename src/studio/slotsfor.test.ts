import { describe, expect, it } from "vitest";

import {
  floorFor,
  MAX_DRAFT_SLIDES,
  MIN_DRAFT_SLIDES,
  repeatableOf,
  slotsFor,
  STRUCTURES,
} from "./structures.js";

/**
 * The bug this fixes: the slot list WAS the slide count, so a brief asking for
 * sixteen slides got a prompt listing eight slots and came back with eight.
 */
describe("asking a framework for a different number of slides", () => {
  for (const structure of STRUCTURES) {
    describe(structure.name, () => {
      const natural = structure.slots.length;

      it("returns its natural shape unchanged", () => {
        expect(slotsFor(structure, natural)).toEqual(structure.slots);
      });

      it("gives exactly the count asked for, longer and shorter", () => {
        for (const want of [floorFor(structure), natural + 1, 12, 16, 24]) {
          expect(slotsFor(structure, want)).toHaveLength(want);
        }
      });

      /** The frame is the framework. Losing it means losing the choice. */
      it("keeps the opening and closing slots at every length", () => {
        const first = structure.slots[0];
        const last = structure.slots[natural - 1];
        for (const want of [floorFor(structure), natural, 16]) {
          const out = slotsFor(structure, want);
          expect(out[0]?.id).toBe(first?.id);
          expect(out[out.length - 1]?.id).toBe(last?.id);
        }
      });

      it("only ever adds the repeatable slot", () => {
        const rep = repeatableOf(structure);
        const grown = slotsFor(structure, natural + 5);
        const added = grown.length - natural;
        expect(grown.filter((s) => s.id === rep?.id)).toHaveLength(
          structure.slots.filter((s) => s.id === rep?.id).length + added,
        );
      });

      it("refuses to go below an opening, a middle and a close", () => {
        expect(floorFor(structure)).toBe(MIN_DRAFT_SLIDES);
        for (const silly of [1, 0, -5]) {
          expect(slotsFor(structure, silly)).toHaveLength(MIN_DRAFT_SLIDES);
        }
      });

      it("refuses to go past what the generator can build", () => {
        expect(slotsFor(structure, 500)).toHaveLength(MAX_DRAFT_SLIDES);
      });

      /**
       * The floor used to be every fixed slot plus one, so asking a
       * five-fixed-slot framework for four gave six. A framework is a suggested
       * running order, not a minimum word count.
       */
      it("can go down to an opening, a middle and a close", () => {
        const out = slotsFor(structure, 3);
        expect(out).toHaveLength(3);
        expect(out[0]?.id).toBe(structure.slots[0]?.id);
        expect(out[2]?.id).toBe(structure.slots[natural - 1]?.id);
      });

      /** Somebody asking for four slides wants four slides. */
      it("gives four when four are asked for", () => {
        expect(slotsFor(structure, 4)).toHaveLength(4);
      });

      /** Repeatable slots are the elaboration, so they go before the fixed jobs. */
      it("spends the repeatable slots before it touches a fixed one", () => {
        const rep = repeatableOf(structure);
        const repeats = structure.slots.filter((s) => s.id === rep?.id).length;
        const trimmedByOne = slotsFor(structure, natural - 1);
        expect(trimmedByOne.filter((s) => s.id === rep?.id)).toHaveLength(repeats - 1);
      });

      it("rounds a fractional count rather than producing a fraction of a slide", () => {
        expect(slotsFor(structure, 10.4)).toHaveLength(10);
        expect(slotsFor(structure, 10.6)).toHaveLength(11);
      });

      /** Callers hand this straight to a prompt; a shared array would be edited. */
      it("never returns the structure's own array", () => {
        expect(slotsFor(structure, natural)).not.toBe(structure.slots);
      });
    });
  }

  /** A framework with a fixed shape has nothing to stretch, and says so. */
  it("leaves a framework with no repeatable slot alone", () => {
    const fixed = { ...STRUCTURES[0]!, slots: STRUCTURES[0]!.slots.map((s) => ({ ...s, repeatable: false })) };
    expect(slotsFor(fixed, 20)).toHaveLength(fixed.slots.length);
  });
});

/**
 * The bug this covers would have shipped: `Compose` built its boxes from the
 * framework, so a sixteen-slide draft arrived at a screen with eight of them
 * and half the carousel was dropped with nothing to show it had happened.
 */
describe("fitting a screen to a draft that is longer than its framework", () => {
  const structure = STRUCTURES[0]!;

  it("makes a box for every slide that arrived", () => {
    for (const n of [4, 8, 16, 24]) {
      expect(slotsFor(structure, n)).toHaveLength(n);
    }
  });

  it("gives every box a real slot to label it", () => {
    for (const slot of slotsFor(structure, 16)) {
      expect(slot.id).toBeTruthy();
      expect(slot.label).toBeTruthy();
    }
  });
});
