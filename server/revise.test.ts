import { describe, expect, it } from "vitest";

import { assembleRevise, REVISE_SYSTEM } from "./prompts.js";
import { applyChanges, usableChanges } from "./revise.js";

const DECK = ["Slide one.", "Slide two.", "Slide three.", "Slide four."];

describe("which changes can be applied", () => {
  it("converts the number somebody sees to the index the array uses", () => {
    expect(usableChanges([{ slide: 1, text: "New one." }], 4)).toEqual([{ at: 0, text: "New one." }]);
    expect(usableChanges([{ slide: 4, text: "New four." }], 4)).toEqual([{ at: 3, text: "New four." }]);
  });

  /**
   * The one way this route could corrupt a deck. Applied blindly, an index past
   * the end appends a slide nobody asked for and silently lengthens the
   * carousel.
   *
   * Dropped rather than clamped: a clamped index is a change applied to the
   * WRONG slide, which is worse than a change that did not happen.
   */
  it("drops a slide number the deck does not have", () => {
    expect(usableChanges([{ slide: 5, text: "x" }], 4)).toEqual([]);
    expect(usableChanges([{ slide: 0, text: "x" }], 4)).toEqual([]);
    expect(usableChanges([{ slide: -2, text: "x" }], 4)).toEqual([]);
    expect(usableChanges([{ slide: 99, text: "x" }], 4)).toEqual([]);
  });

  it("drops one with no text rather than emptying a slide", () => {
    expect(usableChanges([{ slide: 2, text: "   " }], 4)).toEqual([]);
  });

  it("keeps the first of two changes to the same slide", () => {
    const out = usableChanges(
      [
        { slide: 2, text: "First answer." },
        { slide: 2, text: "Second answer." },
      ],
      4,
    );
    expect(out).toEqual([{ at: 1, text: "First answer." }]);
  });

  it("repairs the punctuation the house style does not use", () => {
    const out = usableChanges([{ slide: 1, text: "fast\u2014cheap" }], 4);
    expect(out[0]?.text).toBe("fast, cheap");
  });

  it("returns them in slide order whatever order they arrived in", () => {
    const out = usableChanges(
      [
        { slide: 3, text: "c" },
        { slide: 1, text: "a" },
      ],
      4,
    );
    expect(out.map((c) => c.at)).toEqual([0, 2]);
  });

  it("copes with nothing coming back", () => {
    expect(usableChanges([], 4)).toEqual([]);
  });
});

/**
 * The safety property of the whole feature: a slide the instruction did not ask
 * about cannot be altered by this route, because it never appears in the
 * response. The untouched ones are the same bytes, not a regenerated copy that
 * happens to be similar.
 */
describe("applying them", () => {
  it("changes only the slides named", () => {
    const out = applyChanges(DECK, [{ at: 2, text: "Replaced." }]);
    expect(out).toEqual(["Slide one.", "Slide two.", "Replaced.", "Slide four."]);
  });

  it("leaves the untouched slides byte identical", () => {
    const out = applyChanges(DECK, [{ at: 0, text: "New." }]);
    expect(out[1]).toBe(DECK[1]);
    expect(out[3]).toBe(DECK[3]);
  });

  it("never changes the length of the deck", () => {
    expect(applyChanges(DECK, [{ at: 1, text: "x" }])).toHaveLength(DECK.length);
    expect(applyChanges(DECK, [])).toHaveLength(DECK.length);
  });

  it("does not mutate the deck it was given", () => {
    const original = [...DECK];
    applyChanges(DECK, [{ at: 0, text: "Changed." }]);
    expect(DECK).toEqual(original);
  });
});

describe("the revise request", () => {
  const out = assembleRevise({ deck: DECK, instruction: "In slide 4 make it about pricing" });

  it("is byte identical in the system block whatever is asked", () => {
    const other = assembleRevise({ deck: DECK, instruction: "Something else" });
    expect(out.system).toBe(other.system);
    expect(out.system).toBe(REVISE_SYSTEM);
  });

  /** The whole design, stated in the prompt so it cannot drift out. */
  it("asks for only the changed slides, and says unchanged ones are not wanted", () => {
    expect(REVISE_SYSTEM).toContain("Return only the slides");
    expect(REVISE_SYSTEM).toContain("Returning it unchanged is not the same thing");
  });

  it("explains how the phrases people use map onto numbers", () => {
    expect(REVISE_SYSTEM).toContain('"The first three" is 1, 2 and 3');
    expect(REVISE_SYSTEM).toContain('"The last one"');
  });

  /** Numbered from 1 so the model and the person are looking at the same list. */
  it("numbers the slides the way the screen does", () => {
    expect(out.user).toContain("1. Slide one.");
    expect(out.user).toContain("4. Slide four.");
  });

  it("puts the instruction first, before the deck it applies to", () => {
    expect(out.user.startsWith("What to change: ")).toBe(true);
    expect(out.user.indexOf("In slide 4")).toBeLessThan(out.user.indexOf("Slide one."));
  });

  it("states the length twice so the count cannot drift", () => {
    expect(out.user).toContain("has 4 slides and must still have 4");
  });

  it("names what each slide is for when it knows", () => {
    const withJobs = assembleRevise({
      deck: DECK,
      instruction: "shorter",
      slots: [{ id: "hook", label: "Hook", note: "Earn the swipe", placeholder: "" }],
    });
    expect(withJobs.user).toContain("Hook: Earn the swipe");
    expect(out.user).not.toContain("What each slide is for");
  });

  it("carries voice in the user message, never the system block", () => {
    const voiced = assembleRevise({ deck: DECK, instruction: "x", voice: { tone: "Blunt" } });
    expect(voiced.user).toContain("Blunt");
    expect(voiced.system).not.toContain("Blunt");
  });

  it("clips an instruction long enough to be a mistake", () => {
    const long = assembleRevise({ deck: DECK, instruction: "x".repeat(3000) });
    expect(long.user.length).toBeLessThan(2000);
  });
});
