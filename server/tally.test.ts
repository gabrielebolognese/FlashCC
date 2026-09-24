import { beforeEach, describe, expect, it } from "vitest";

import type { Finding } from "./checks.js";
import { countFindings, resetTally, tally } from "./tally.js";

const finding = (code: string): Finding => ({ at: 0, tier: "flag", code, message: "m" });

describe("counting which checks fire", () => {
  beforeEach(resetTally);

  it("starts empty", () => {
    expect(tally()).toEqual({});
  });

  it("counts by route and code together", () => {
    countFindings("draft", [finding("empty-slide")]);
    countFindings("caption", [finding("empty-slide")]);
    expect(tally()).toEqual({ "draft.empty-slide": 1, "caption.empty-slide": 1 });
  });

  it("accumulates across calls", () => {
    countFindings("draft", [finding("a"), finding("a")]);
    countFindings("draft", [finding("a")]);
    expect(tally()["draft.a"]).toBe(3);
  });

  /** The question is always "what fires most", so the answer is ordered. */
  it("puts the loudest first", () => {
    countFindings("draft", [finding("rare")]);
    countFindings("draft", [finding("common"), finding("common"), finding("common")]);
    expect(Object.keys(tally())[0]).toBe("draft.common");
  });

  it("does nothing with nothing", () => {
    countFindings("draft", []);
    expect(tally()).toEqual({});
  });

  /**
   * Codes only. A message can carry the offending text, which would make this a
   * record of somebody's carousel rather than of a category of defect.
   */
  it("records no text from the finding", () => {
    countFindings("draft", [
      { at: 0, tier: "flag", code: "measure-not-in-brief", message: 'They said "$40k"', detail: "$40k" },
    ]);
    expect(JSON.stringify(tally())).not.toContain("40k");
  });
});
