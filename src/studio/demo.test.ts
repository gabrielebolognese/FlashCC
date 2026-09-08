import { describe, expect, it } from "vitest";

import { demoPosts } from "./demo.js";
import { baselineOf, findings, MIN_GROUP, outliers, whatOutliersShare } from "./insights.js";
import { isMeasured, overdue, upcoming } from "./pipeline.js";

/**
 * The sample account is shipped product data, and the failure it guards against is a
 * silent one: edit the seeds carelessly and every insight screen renders correctly
 * while saying nothing at all. Each assertion here is something a person would
 * actually notice missing when they clicked "Load sample data".
 */
describe("the sample account", () => {
  const posts = demoPosts();

  it("has enough measured history for the baseline to be ready", () => {
    expect(baselineOf(posts, "impressions").ready).toBe(true);
  });

  it("fills every stage of the board", () => {
    for (const stage of ["idea", "drafting", "ready", "scheduled", "posted"] as const) {
      expect(posts.filter((p) => p.stage === stage).length, stage).toBeGreaterThan(0);
    }
  });

  it("has something in the queue, including one that has slipped its slot", () => {
    expect(upcoming(posts).length).toBeGreaterThan(0);
    expect(overdue(posts).length).toBeGreaterThan(0);
  });

  it("produces real outliers rather than a flat line", () => {
    expect(outliers(posts, "impressions").length).toBeGreaterThan(0);
  });

  it("says something on the analytics screen", () => {
    expect(findings(posts, "impressions").length).toBeGreaterThan(0);
  });

  it("finds a trait the winners share", () => {
    expect(whatOutliersShare(posts, "impressions").length).toBeGreaterThan(0);
  });

  /**
   * The demo deliberately gives Story only two posts, with excellent numbers. If it
   * ever showed up as a conclusion, the gate would be broken in the one place a
   * person would be most likely to believe it.
   */
  it("refuses to draw a conclusion from the two Story posts, good as they look", () => {
    const story = posts.filter((p) => p.framework === "story" && isMeasured(p));
    expect(story.length).toBeLessThan(MIN_GROUP);
    expect(findings(posts, "impressions").filter((f) => f.value.includes("Story"))).toEqual([]);
  });
});
