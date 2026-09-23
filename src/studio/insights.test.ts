import { describe, expect, it } from "vitest";

import {
  baselineOf,
  compact,
  DIMENSIONS,
  findings,
  groupBy,
  hookShape,
  lengthBand,
  liftLabel,
  median,
  MIN_TOTAL,
  outliers,
  score,
  totals,
  whatOutliersShare,
  type MetricKey,
} from "./insights.js";
import { EMPTY_METRICS, makePost, type Post } from "./pipeline.js";

/** A measured post, described only by the things analytics actually reads. */
const post = (impressions: number, patch: Partial<Post> = {}, day = 10): Post =>
  makePost({
    stage: "posted",
    postedAt: `2026-01-${String(day).padStart(2, "0")}T09:00:00.000Z`,
    metrics: { ...EMPTY_METRICS, impressions, likes: Math.round(impressions / 20) },
    slideCount: 7,
    hook: "A plain statement.",
    framework: "problem",
    ...patch,
  });

const REACH: MetricKey = "impressions";

describe("median", () => {
  it("takes the middle of an odd set and the mean of the middle two of an even one", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("is zero for an empty set rather than NaN", () => {
    expect(median([])).toBe(0);
  });

  it("does not mutate what it was given", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe("baseline", () => {
  /**
   * The reason this is a median and not a mean. With one 100k post among five
   * ordinary ones, a mean baseline lands around 18k and NOTHING is ever an outlier
   * again, the feature silently switches itself off at the exact moment it becomes
   * interesting. The median shrugs the spike off.
   */
  it("is not dragged upward by a single viral post", () => {
    const posts = [post(1000), post(1100), post(900), post(1000), post(100_000)];
    const base = baselineOf(posts, REACH);

    expect(base.value).toBeLessThan(2000);
    expect(outliers(posts, REACH).map((s) => s.value)).toEqual([100_000]);
  });

  it("only counts measured posts", () => {
    const base = baselineOf([post(1000), makePost({ stage: "scheduled" }), makePost()], REACH);
    expect(base.n).toBe(1);
  });

  it("is not ready until there is enough history to mean anything", () => {
    const few = Array.from({ length: MIN_TOTAL - 1 }, (_, i) => post(1000, {}, i + 1));
    expect(baselineOf(few, REACH).ready).toBe(false);
    expect(baselineOf([...few, post(1000, {}, 9)], REACH).ready).toBe(true);
  });

  it("looks only at the most recent window", () => {
    const old = Array.from({ length: 20 }, (_, i) => post(10_000, {}, (i % 28) + 1));
    const recent = Array.from({ length: 20 }, (_, i) => post(100, {}, (i % 28) + 1));
    // Recent posts are dated later, so a window of 20 should see only them.
    const dated = [
      ...old.map((p) => ({ ...p, postedAt: "2025-01-01T00:00:00.000Z" })),
      ...recent.map((p) => ({ ...p, postedAt: "2026-06-01T00:00:00.000Z" })),
    ];
    expect(baselineOf(dated, REACH, 20).value).toBe(100);
  });
});

describe("scoring", () => {
  it("ranks by multiple of the baseline, best first", () => {
    const scored = score([post(500), post(1000), post(4000)], REACH);
    expect(scored.map((s) => s.band)).toEqual(["outlier", "normal", "weak"]);
    expect(scored[0]!.ratio).toBe(4);
  });

  it("ignores posts that are not live and measured", () => {
    expect(score([post(1000), makePost({ stage: "ready" })], REACH)).toHaveLength(1);
  });
});

describe("hook shapes", () => {
  it("sorts the four kinds", () => {
    expect(hookShape("5 mistakes killing your edits")).toBe("Number");
    expect(hookShape("How to fix your pacing")).toBe("How-to");
    expect(hookShape("Why do your edits feel slow?")).toBe("Question");
    expect(hookShape("Your videos feel boring.")).toBe("Statement");
  });

  it("calls a leading number a listicle even when it also asks something", () => {
    expect(hookShape("3 reasons your edit drags. Recognise any?")).toBe("Number");
  });

  it("does not mistake an open question for a how-to", () => {
    expect(hookShape("How do you know when it is done?")).toBe("Question");
  });

  it("has something to say about an empty hook without throwing", () => {
    expect(hookShape("")).toBe("Statement");
  });
});

describe("length bands", () => {
  it("splits short, medium and long", () => {
    expect(lengthBand(4)).toContain("Short");
    expect(lengthBand(7)).toContain("Medium");
    expect(lengthBand(12)).toContain("Long");
  });
});

describe("attribution", () => {
  const mixed = (): Post[] => [
    ...Array.from({ length: 4 }, (_, i) => post(4000, { framework: "problem" }, i + 1)),
    ...Array.from({ length: 4 }, (_, i) => post(1000, { framework: "showcase" }, i + 10)),
  ];

  it("groups by a dimension and reports each bucket against the overall median", () => {
    const dim = DIMENSIONS.find((d) => d.id === "framework")!;
    const groups = groupBy(mixed(), dim, REACH);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.value).toContain("Problem");
    expect(groups[0]!.n).toBe(4);
    expect(groups[0]!.lift).toBeGreaterThan(1);
    expect(groups[1]!.lift).toBeLessThan(1);
  });

  it("resolves framework ids to their real names, not raw slugs", () => {
    const dim = DIMENSIONS.find((d) => d.id === "framework")!;
    expect(groupBy([post(1000, { framework: "educational" })], dim, REACH)[0]!.value).toBe(
      "Educational / Value",
    );
  });

  it("skips posts that cannot answer a dimension instead of bucketing them as empty", () => {
    const dim = DIMENSIONS.find((d) => d.id === "framework")!;
    const groups = groupBy([post(1000, { framework: null }), post(1000)], dim, REACH);
    expect(groups).toHaveLength(1);
  });

  /**
   * The whole reason the gates exist. Two posts in a bucket will happily produce a
   * "3x" that means nothing, and a tool that says it with a straight face is worse
   * than one that stays quiet.
   */
  it("says nothing at all until there is enough history", () => {
    const four = Array.from({ length: 4 }, (_, i) => post(4000, { framework: "problem" }, i + 1));
    expect(four.length).toBeLessThan(MIN_TOTAL);
    expect(findings(four, REACH)).toEqual([]);
  });

  it("suppresses a group that is too thin even when the whole set is big enough", () => {
    const posts = [
      ...Array.from({ length: 6 }, (_, i) => post(1000, { framework: "problem" }, i + 1)),
      post(50_000, { framework: "story" }, 20),
    ];
    const story = findings(posts, REACH).filter((f) => f.value.includes("Story"));
    expect(story).toEqual([]);
  });

  it("reports a real difference once both gates are cleared, strongest first", () => {
    const out = findings(mixed(), REACH);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.n).toBeGreaterThanOrEqual(3);
    expect(out.every((f) => (f.direction === "up") === (f.lift >= 1))).toBe(true);
  });

  it("carries its own sample size so nothing can be quoted without the caveat", () => {
    for (const f of findings(mixed(), REACH)) {
      expect(f.n).toBeGreaterThan(0);
      expect(f.note).toBeTruthy();
    }
  });
});

describe("what the outliers share", () => {
  it("names a trait the winners have and the rest mostly do not", () => {
    const posts = [
      ...Array.from({ length: 3 }, (_, i) => post(10_000, { hook: "Why is this so hard?" }, i + 1)),
      ...Array.from({ length: 6 }, (_, i) => post(1000, { hook: "A plain statement." }, i + 10)),
    ];
    const shared = whatOutliersShare(posts, REACH);
    expect(shared.some((s) => s.value === "Question")).toBe(true);
  });

  /** A trait every single post has explains nothing about why five took off. */
  it("stays quiet about a trait that everything shares", () => {
    const posts = [
      ...Array.from({ length: 3 }, (_, i) => post(10_000, { framework: "problem" }, i + 1)),
      ...Array.from({ length: 6 }, (_, i) => post(1000, { framework: "problem" }, i + 10)),
    ];
    const shared = whatOutliersShare(posts, REACH);
    expect(shared.some((s) => s.value.includes("Problem"))).toBe(false);
  });

  it("returns nothing when there are no outliers at all", () => {
    expect(whatOutliersShare([post(1000), post(1000), post(1100)], REACH)).toEqual([]);
  });
});

describe("totals", () => {
  it("sums only measured posts but counts every record", () => {
    const t = totals([post(1000), post(3000), makePost({ stage: "idea" })]);
    expect(t.posts).toBe(3);
    expect(t.measured).toBe(2);
    expect(t.impressions).toBe(4000);
  });

  it("has a rate of zero rather than NaN with nothing measured", () => {
    expect(totals([makePost()]).rate).toBe(0);
  });
});

describe("formatting", () => {
  it("shortens big numbers the way a dashboard should", () => {
    expect(compact(942)).toBe("942");
    expect(compact(1240)).toBe("1.2k");
    expect(compact(24_500)).toBe("25k");
    expect(compact(1_400_000)).toBe("1.4M");
  });

  it("says multiples above average and percentages below", () => {
    expect(liftLabel(2.4)).toBe("2.4x");
    expect(liftLabel(0.62)).toBe("-38%");
    expect(liftLabel(0)).toBe("n/a");
  });
});
