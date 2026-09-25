import { describe, expect, it } from "vitest";

import {
  addSpend,
  briefFor,
  clampRun,
  MAX_RUN,
  MAX_RUN_STYLES,
  MIN_RUN,
  NO_SPEND,
  planRun,
  runDone,
  runPercent,
  tidyIdeas,
  totalTokens,
  usedHooks,
  type RunStep,
} from "./run.js";

const IDEAS = ["Cut on movement", "Price by value", "Gear matters least"];

describe("how many carousels", () => {
  it("clamps to a range somebody will actually watch", () => {
    expect(clampRun(1)).toBe(MIN_RUN);
    expect(clampRun(0)).toBe(MIN_RUN);
    expect(clampRun(99)).toBe(MAX_RUN);
    expect(clampRun(9)).toBe(9);
  });

  it("rounds rather than producing a fraction of a carousel", () => {
    expect(clampRun(8.4)).toBe(8);
    expect(clampRun(8.6)).toBe(9);
  });

  it("copes with nonsense", () => {
    expect(clampRun(Number.NaN)).toBe(MIN_RUN);
  });
});

describe("tidying the ideas", () => {
  it("drops blanks and trims", () => {
    expect(tidyIdeas(["  a  ", "", "   ", "b"])).toEqual(["a", "b"]);
  });
});

describe("the run sheet", () => {
  /**
   * The behaviour the whole feature was described by: nine carousels, three
   * ideas, cycling. Not three of the first then three of the second.
   */
  it("cycles the ideas rather than grouping them", () => {
    const steps = planRun(IDEAS, 9, ["ink"]);
    expect(steps.map((s) => s.ideaIndex)).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2]);
  });

  /**
   * The reason cycling matters more than it looks: a run that stalls at step
   * four has one carousel per idea rather than four about the first and none
   * about the others.
   */
  it("has covered every idea once by the time it is a third done", () => {
    const steps = planRun(IDEAS, 9, ["ink"]).slice(0, 3);
    expect(new Set(steps.map((s) => s.ideaIndex)).size).toBe(3);
  });

  it("numbers the steps from one, because they are shown", () => {
    expect(planRun(IDEAS, 4, ["ink"]).map((s) => s.n)).toEqual([1, 2, 3, 4]);
  });

  it("carries the idea text, not just its index", () => {
    expect(planRun(IDEAS, 3, ["ink"]).map((s) => s.idea)).toEqual(IDEAS);
  });

  it("gives every step the one style when there is one", () => {
    const steps = planRun(IDEAS, 5, ["ink"]);
    expect(steps.every((s) => s.styleId === "ink")).toBe(true);
  });

  it("alternates two styles", () => {
    const steps = planRun(IDEAS, 6, ["ink", "sun"]);
    expect(steps.map((s) => s.styleId)).toEqual(["ink", "sun", "ink", "sun", "ink", "sun"]);
  });

  /**
   * The two cycles have different lengths on purpose, so the same idea does not
   * keep landing in the same style.
   */
  it("shifts the pairing as the run goes", () => {
    const steps = planRun(IDEAS, 6, ["ink", "sun"]);
    const first = steps.find((s) => s.ideaIndex === 0);
    const again = steps.filter((s) => s.ideaIndex === 0)[1];
    expect(again?.styleId).not.toBe(first?.styleId);
  });

  it("ignores a third style rather than using it", () => {
    const steps = planRun(IDEAS, 6, ["a", "b", "c"]);
    expect(new Set(steps.map((s) => s.styleId))).toEqual(new Set(["a", "b"]));
    expect(MAX_RUN_STYLES).toBe(2);
  });

  it("works from a single idea", () => {
    const steps = planRun(["Only one"], 4, ["ink"]);
    expect(steps).toHaveLength(4);
    expect(steps.every((s) => s.ideaIndex === 0)).toBe(true);
  });

  it("plans nothing without an idea or a style", () => {
    expect(planRun([], 9, ["ink"])).toEqual([]);
    expect(planRun(["  "], 9, ["ink"])).toEqual([]);
    expect(planRun(IDEAS, 9, [])).toEqual([]);
  });

  it("clamps the count it was given", () => {
    expect(planRun(IDEAS, 1, ["ink"])).toHaveLength(MIN_RUN);
    expect(planRun(IDEAS, 100, ["ink"])).toHaveLength(MAX_RUN);
  });
});

/**
 * Three carousels drafted from the same sentence with no knowledge of each other
 * come back as three versions of one carousel. The model is not being careless:
 * it was asked the same question three times.
 */
describe("keeping the angles apart", () => {
  const step = planRun(IDEAS, 3, ["ink"])[0]!;

  it("is just the idea for the first carousel on it", () => {
    expect(briefFor(step, [])).toBe(step.idea);
  });

  it("tells a later one what the earlier ones already said", () => {
    const brief = briefFor(step, ["Your edits feel robotic.", "Stop cutting on the beat."]);
    expect(brief).toContain(step.idea);
    expect(brief).toContain("Your edits feel robotic.");
    expect(brief).toContain("carousel 3 on this idea");
    expect(brief).toContain("genuinely different angle");
  });

  it("ignores blank hooks rather than listing an empty bullet", () => {
    expect(briefFor(step, ["  ", ""])).toBe(step.idea);
  });

  it("collects the hooks for one idea and no others", () => {
    const steps: RunStep[] = [
      { ...planRun(IDEAS, 3, ["ink"])[0]!, state: "done", hook: "First on A" },
      { ...planRun(IDEAS, 3, ["ink"])[1]!, state: "done", hook: "First on B" },
    ];
    expect(usedHooks(steps, 0)).toEqual(["First on A"]);
    expect(usedHooks(steps, 1)).toEqual(["First on B"]);
  });

  it("does not count a step that has not finished", () => {
    const steps: RunStep[] = [
      { ...planRun(IDEAS, 3, ["ink"])[0]!, state: "running", hook: "Not yet" },
      { ...planRun(IDEAS, 3, ["ink"])[0]!, state: "failed", hook: "Never" },
    ];
    expect(usedHooks(steps, 0)).toEqual([]);
  });
});

describe("how far along", () => {
  const steps = (states: RunStep["state"][]): RunStep[] =>
    states.map((state, i) => ({ ...planRun(IDEAS, 3, ["ink"])[i % 3]!, state }));

  /**
   * Counted from what has FINISHED, not from what is in flight. A bar that jumps
   * when a step starts claims a step is done when it is not, and then sits still
   * for fifteen seconds.
   */
  it("does not count the step in flight", () => {
    expect(runPercent(steps(["done", "running", "waiting"]))).toBe(33);
  });

  /** A failed step is not coming back on its own. */
  it("counts a failure as settled rather than stalling forever", () => {
    expect(runPercent(steps(["done", "failed", "done"]))).toBe(100);
    expect(runDone(steps(["done", "failed", "done"]))).toBe(true);
  });

  it("is zero before anything happens, and for nothing at all", () => {
    expect(runPercent(steps(["waiting", "waiting", "waiting"]))).toBe(0);
    expect(runPercent([])).toBe(0);
    expect(runDone([])).toBe(false);
  });

  it("is not done while one is still running", () => {
    expect(runDone(steps(["done", "done", "running"]))).toBe(false);
  });
});

describe("what it cost", () => {
  it("adds up and starts at nothing", () => {
    const one = addSpend(NO_SPEND, { input: 100, output: 50, searches: 1 });
    const two = addSpend(one, { input: 40, cached: 900 });
    expect(two).toEqual({ input: 140, output: 50, cached: 900, searches: 1 });
    expect(totalTokens(two)).toBe(1090);
  });

  /** Searches are billed per search, on top of tokens, so they are not tokens. */
  it("keeps searches out of the token total", () => {
    const s = addSpend(NO_SPEND, { input: 10, searches: 5 });
    expect(totalTokens(s)).toBe(10);
  });

  it("does not mutate what it was given", () => {
    const before = { ...NO_SPEND };
    addSpend(NO_SPEND, { input: 5 });
    expect(NO_SPEND).toEqual(before);
  });
});
