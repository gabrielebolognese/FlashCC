import { describe, expect, it } from "vitest";

import { alignToSlots, type DraftedSlide } from "./ai.js";
import { STRUCTURES } from "./structures.js";

const problem = STRUCTURES.find((s) => s.id === "problem")!;

describe("alignToSlots", () => {
  it("puts each drafted slide in its own slot", () => {
    const drafted: DraftedSlide[] = problem.slots.map((s, i) => ({ role: s.id, text: `t${i}` }));
    expect(alignToSlots(drafted, problem)).toEqual(problem.slots.map((_, i) => `t${i}`));
  });

  it("keeps repeated slots distinct rather than reusing one draft", () => {
    // Three slots share the id "point" — each must get its own text.
    const drafted: DraftedSlide[] = [
      { role: "hook", text: "H" },
      { role: "problem", text: "P" },
      { role: "why", text: "W" },
      { role: "solution", text: "S" },
      { role: "point", text: "one" },
      { role: "point", text: "two" },
      { role: "point", text: "three" },
      { role: "cta", text: "C" },
    ];
    const out = alignToSlots(drafted, problem);
    const points = problem.slots
      .map((s, i) => (s.id === "point" ? out[i] : null))
      .filter((x): x is string => x !== null);
    expect(points).toEqual(["one", "two", "three"]);
  });

  it("survives a model that returns slots out of order", () => {
    const drafted: DraftedSlide[] = [
      { role: "cta", text: "C" },
      { role: "hook", text: "H" },
      { role: "problem", text: "P" },
    ];
    const out = alignToSlots(drafted, problem);
    expect(out[0]).toBe("H");
    expect(out[problem.slots.length - 1]).toBe("C");
  });

  it("returns one entry per slot even when the draft is short", () => {
    const out = alignToSlots([{ role: "hook", text: "H" }], problem);
    expect(out).toHaveLength(problem.slots.length);
    expect(out[0]).toBe("H");
    expect(out.slice(1).every((t) => t === "")).toBe(true);
  });

  it("falls back positionally when roles are unrecognised", () => {
    const drafted: DraftedSlide[] = [
      { role: "???", text: "first" },
      { role: "???", text: "second" },
    ];
    const out = alignToSlots(drafted, problem);
    expect(out[0]).toBe("first");
    expect(out[1]).toBe("second");
  });

  it("never mutates the caller's array", () => {
    const drafted: DraftedSlide[] = [{ role: "hook", text: "H" }];
    alignToSlots(drafted, problem);
    expect(drafted).toHaveLength(1);
  });
});
