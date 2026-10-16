import { describe, expect, it } from "vitest";

import {
  floorFor,
  MAX_DRAFT_SLIDES,
  MIN_DRAFT_SLIDES,
  repeatableOf,
  shapeFor,
  slotsFor,
  stepFor,
  STRUCTURES,
} from "./structures.js";

/**
 * The bug this fixes: the slot list WAS the slide count, so a brief asking for
 * sixteen slides got a prompt listing eight slots and came back with eight.
 */
/** Frameworks built in pairs (a myth and its fact) step by the pair; see below. */
const paired = (s: (typeof STRUCTURES)[number]) => (s.rhythms?.[0]?.unit.length ?? 1) > 1;

describe("asking a framework for a different number of slides", () => {
  for (const structure of STRUCTURES.filter((s) => !paired(s))) {
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

describe("a framework built in pairs (25.1)", () => {
  for (const structure of STRUCTURES.filter(paired)) {
    describe(structure.name, () => {
      it("never ends on half a pair, and lands within one slide of the count asked for", () => {
        for (const want of [5, 6, 7, 10, 13]) {
          const out = slotsFor(structure, want);
          expect(Math.abs(out.length - want)).toBeLessThanOrEqual(1);
          const unit = structure.rhythms![0]!.unit.map((u) => u.id);
          const middle = out.slice(structure.rhythms![0]!.open.length, out.length - structure.rhythms![0]!.close.length);
          middle.forEach((s, i) => expect(s.id).toBe(unit[i % unit.length]));
        }
      });

      it("steps by the pair, and its floor is an opening, one pair and a close", () => {
        expect(stepFor(structure)).toBe(2);
        expect(slotsFor(structure, 1)).toHaveLength(floorFor(structure));
      });
    });
  }
});

describe("rhythms (25.1)", () => {
  it("every framework has two or three, each opening and closing like the framework", () => {
    for (const s of STRUCTURES) {
      expect(s.rhythms?.length, s.name).toBeGreaterThanOrEqual(2);
      expect(s.rhythms?.length, s.name).toBeLessThanOrEqual(3);
      for (const r of s.rhythms!) {
        const out = slotsFor(s, s.slots.length, r.id);
        expect(out[0]?.id, `${s.name} ${r.id}`).toBe("hook");
        expect(out.at(-1)?.id, `${s.name} ${r.id}`).toBe("cta");
      }
    }
  });

  it("the first rhythm of the four original frameworks is exactly their running order", () => {
    for (const id of ["problem", "showcase", "educational", "story"]) {
      const s = STRUCTURES.find((x) => x.id === id)!;
      expect(slotsFor(s, s.slots.length).map((x) => x.id)).toEqual(s.slots.map((x) => x.id));
    }
  });

  it("every framework has a slide-count range around its natural length", () => {
    for (const s of STRUCTURES) {
      const [lo, hi] = s.range!;
      expect(lo, s.name).toBeLessThanOrEqual(s.slots.length);
      expect(hi, s.name).toBeGreaterThanOrEqual(s.slots.length);
    }
  });

  it("a brief gets a rhythm and a count from its own words, inside the range", () => {
    for (const s of STRUCTURES) {
      const shapes = new Set<string>();
      for (let n = 0; n < 20; n += 1) {
        const brief = `Brief number ${n} about ${s.name}, with its own words ${"x".repeat(n)}`;
        const a = shapeFor(s, brief);
        expect(shapeFor(s, brief)).toEqual(a);
        const [lo, hi] = s.range!;
        expect(a.count, s.name).toBeGreaterThanOrEqual(lo - 1);
        expect(a.count, s.name).toBeLessThanOrEqual(hi + 1);
        shapes.add(`${a.rhythm}/${a.count}`);
      }
      // Twenty briefs, more than one shape: the sameness constraint.
      expect(shapes.size, s.name).toBeGreaterThan(1);
    }
  });
});
