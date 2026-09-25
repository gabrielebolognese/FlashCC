import { describe, expect, it } from "vitest";

import {
  addSpend,
  briefFor,
  clampRun,
  MAX_RUN,
  MAX_RUN_STYLES,
  MIN_RUN,
  NO_SPEND,
  clampPerIdea,
  LENGTHS,
  lengthLabel,
  perIdeaCeiling,
  perIdeaFloor,
  planRun,
  recapHeadline,
  RUN_STEPS,
  runDone,
  runPercent,
  SETTLE_MS,
  settleNote,
  slidesFor,
  tidyIdeas,
  totalFor,
  totalTokens,
  usedHooks,
  type RunStep,
  type StepState,
} from "./run.js";

const IDEAS = ["Cut on movement", "Price by value", "Gear matters least"];

const steps = (states: RunStep["state"][]): RunStep[] =>
  states.map((state, i) => ({ ...planRun(IDEAS, 3, ["ink"])[i % 3]!, state }));

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

/**
 * "Nine carousels, three ideas, three each" is how somebody says this. Asking
 * for the total made them do the division, and hid that an uneven total means
 * one idea silently gets fewer.
 */
describe("carousels per idea", () => {
  it("multiplies out to the total", () => {
    expect(totalFor(3, 3)).toBe(9);
    expect(totalFor(1, 5)).toBe(5);
    expect(totalFor(2, 4)).toBe(8);
  });

  it("never lets the total pass the ceiling", () => {
    expect(perIdeaCeiling(1)).toBe(MAX_RUN);
    expect(perIdeaCeiling(3)).toBe(4);
    expect(perIdeaCeiling(5)).toBe(2);
    expect(perIdeaCeiling(14)).toBe(1);
    for (const ideas of [1, 2, 3, 5, 7, 14]) {
      expect(totalFor(ideas, 99)).toBeLessThanOrEqual(MAX_RUN);
    }
  });

  /** A batch of one carousel is the single-carousel flow with a progress bar. */
  it("makes one idea produce at least the floor", () => {
    expect(perIdeaFloor(1)).toBe(MIN_RUN);
    expect(totalFor(1, 1)).toBe(MIN_RUN);
  });

  it("lets one each be enough once there are enough ideas", () => {
    expect(perIdeaFloor(3)).toBe(1);
    expect(perIdeaFloor(5)).toBe(1);
    expect(totalFor(3, 1)).toBe(3);
  });

  it("is always balanced, so no idea quietly gets fewer", () => {
    for (const ideas of [1, 2, 3, 4, 5]) {
      for (const per of [1, 2, 3, 4]) {
        expect(totalFor(ideas, per) % ideas).toBe(0);
      }
    }
  });

  it("copes with no ideas yet", () => {
    expect(totalFor(0, 3)).toBe(0);
    expect(perIdeaCeiling(0)).toBe(1);
  });

  it("rounds rather than producing a fraction", () => {
    expect(clampPerIdea(2, 2.4)).toBe(2);
    expect(clampPerIdea(2, 2.6)).toBe(3);
  });
});

/**
 * The bug this guards is the one somebody actually reported: a run that was
 * working sat on 0% for two and a half minutes because the three searched calls
 * ahead of the drafting counted for nothing.
 */
describe("research counts toward the bar", () => {
  const three = steps(["waiting", "waiting", "waiting"]);

  it("moves off zero when an idea comes back, before any carousel exists", () => {
    const research: StepState[] = ["done", "running", "waiting"];
    expect(runPercent(three, research)).toBe(17);
    expect(runPercent(three, [])).toBe(0);
  });

  it("weights one idea against one carousel", () => {
    expect(runPercent(steps(["done"]), ["done"])).toBe(100);
    expect(runPercent(steps(["done", "waiting"]), ["done", "done"])).toBe(75);
  });

  it("counts a failed search as settled, since it is not coming back", () => {
    expect(runPercent(steps(["waiting"]), ["failed", "failed"])).toBe(67);
  });

  it("still answers zero for a run with nothing in it at all", () => {
    expect(runPercent([], [])).toBe(0);
  });
});

describe("how long each carousel should be", () => {
  it("offers three bands and one opt-out, and only the opt-out has no number", () => {
    expect(LENGTHS.map((l) => l.id)).toEqual(["small", "medium", "long", "auto"]);
    expect(LENGTHS.filter((l) => l.slides === null).map((l) => l.id)).toEqual(["auto"]);
  });

  it("asks for the middle of a band, not its edge", () => {
    // Told "8 to 12" a model picks an end, and the end it picks is the short one.
    expect(slidesFor("small", 8)).toBe(6);
    expect(slidesFor("medium", 8)).toBe(10);
    expect(slidesFor("long", 8)).toBe(14);
  });

  it("hands the framework's own count back for auto, and for anything unknown", () => {
    expect(slidesFor("auto", 8)).toBe(8);
    expect(slidesFor("auto", 11)).toBe(11);
    expect(slidesFor("nonsense" as never, 9)).toBe(9);
  });

  it("gets longer as the band does", () => {
    const sizes = LENGTHS.filter((l) => l.slides !== null).map((l) => l.slides!);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  });

  it("names them in words somebody would use", () => {
    expect(lengthLabel("small")).toBe("Short");
    expect(lengthLabel("auto")).toBe("Let me decide");
  });
});

describe("the recap sentence", () => {
  it("is the whole run in one line", () => {
    expect(recapHeadline(12, "Problem → Solution", 3, "medium")).toBe(
      "12 medium Problem → Solution carousels, cycling between 3 ideas",
    );
  });

  it("drops the cycling clause for one idea, where it would be a lie", () => {
    expect(recapHeadline(3, "Educational", 1, "long")).toBe("3 long Educational carousels");
  });

  it("says nothing about size when the framework decides it", () => {
    expect(recapHeadline(6, "Story", 2, "auto")).toBe(
      "6 Story carousels, cycling between 2 ideas",
    );
  });

  it("counts one carousel as one", () => {
    expect(recapHeadline(1, "Story", 1, "small")).toBe("1 short Story carousel");
  });
});

describe("the beat between questions", () => {
  it("is long enough to notice and short enough not to resent", () => {
    expect(SETTLE_MS).toBeGreaterThanOrEqual(300);
    expect(SETTLE_MS).toBeLessThanOrEqual(800);
  });

  it("says something different at every step, so it is not a spinner with a caption", () => {
    const notes = RUN_STEPS.map((_, i) => settleNote(i));
    expect(new Set(notes).size).toBe(RUN_STEPS.length);
    expect(notes.every((n) => n.length > 0)).toBe(true);
  });

  it("has something to say past the end rather than nothing", () => {
    expect(settleNote(99)).toBe("Working");
  });
});
