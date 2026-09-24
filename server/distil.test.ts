import { describe, expect, it } from "vitest";

import { verbatimOnly } from "./verbatim.js";
import { assembleDistil, clipSource, DISTIL_SYSTEM, MAX_SOURCE_CHARS } from "./prompts.js";

const SOURCE = [
  "So the thing nobody tells you is that cutting on the beat makes an edit feel mechanical.",
  "Attention resets when the frame changes, not when the snare hits.",
  "I spent about three years cutting to music before anyone pointed that out.",
  "It isn't the rhythm that's wrong, it's where you're putting the cut.",
].join(" ");

describe("only the quotes the source actually contains", () => {
  it("keeps one copied exactly", () => {
    const quote = "Attention resets when the frame changes, not when the snare hits.";
    expect(verbatimOnly([quote], SOURCE)).toEqual([quote]);
  });

  /**
   * 13.5's acceptance criterion. A model asked for verbatim will occasionally
   * tidy one, and a quote attributed to a transcript that does not contain it
   * is the failure that actually hurts.
   */
  it("drops a near miss rather than repairing it", () => {
    const tidied = "Attention resets when the frame changes, not when the snare hits hard.";
    expect(verbatimOnly([tidied], SOURCE)).toEqual([]);
  });

  it("drops one with a word quietly removed", () => {
    expect(verbatimOnly(["I spent three years cutting to music"], SOURCE)).toEqual([]);
  });

  it("drops one that joins two sentences that were apart", () => {
    const joined = "Attention resets when the frame changes. I spent about three years cutting to music";
    expect(verbatimOnly([joined], SOURCE)).toEqual([]);
  });

  it("drops one invented outright", () => {
    expect(verbatimOnly(["Always cut on the downbeat for maximum impact."], SOURCE)).toEqual([]);
  });

  /**
   * The characters that differ between what somebody pasted and what a model
   * typed back without either meaning anything different. Without this step
   * nearly every real quote fails on an apostrophe.
   */
  it("matches through a curly apostrophe", () => {
    const curly = "It isn’t the rhythm that’s wrong, it’s where you’re putting the cut.";
    expect(verbatimOnly([curly], SOURCE)).toHaveLength(1);
  });

  it("matches through collapsed whitespace and a line break", () => {
    const spaced = "Attention resets when the frame changes,\n   not when the snare hits.";
    expect(verbatimOnly([spaced], SOURCE)).toHaveLength(1);
  });

  it("matches regardless of case", () => {
    expect(verbatimOnly(["ATTENTION RESETS WHEN THE FRAME CHANGES"], SOURCE)).toHaveLength(1);
  });

  /** Short strings match by accident, and are not quotes anybody wants. */
  it("drops something too short to be a quote", () => {
    expect(verbatimOnly(["the cut", "beat", "So the"], SOURCE)).toEqual([]);
  });

  it("drops a duplicate that differs only by punctuation", () => {
    const a = "Attention resets when the frame changes, not when the snare hits.";
    const b = "attention resets when the frame changes,  not when the snare hits";
    expect(verbatimOnly([a, b], SOURCE)).toHaveLength(1);
  });

  it("keeps the quote as written, not as matched", () => {
    const upper = "ATTENTION RESETS WHEN THE FRAME CHANGES";
    expect(verbatimOnly([upper], SOURCE)[0]).toBe(upper);
  });

  it("survives an empty list and an empty source", () => {
    expect(verbatimOnly([], SOURCE)).toEqual([]);
    expect(verbatimOnly(["Attention resets when the frame changes."], "")).toEqual([]);
  });
});

describe("the source ceiling", () => {
  it("leaves an ordinary source alone", () => {
    const out = clipSource(SOURCE);
    expect(out.clipped).toBe(false);
    expect(out.used).toBe(SOURCE.trim().length);
    expect(out.total).toBe(SOURCE.trim().length);
  });

  /**
   * Clips rather than refuses, because reading most of a transcript beats
   * refusing all of it. What must not happen is reading half and saying
   * nothing, which is why the counts come back.
   */
  it("clips an enormous one and reports both numbers", () => {
    const huge = "x".repeat(MAX_SOURCE_CHARS + 5000);
    const out = clipSource(huge);
    expect(out.clipped).toBe(true);
    expect(out.used).toBe(MAX_SOURCE_CHARS);
    expect(out.total).toBe(MAX_SOURCE_CHARS + 5000);
    expect(out.text).toHaveLength(MAX_SOURCE_CHARS);
  });
});

describe("the distil request", () => {
  it("is byte identical in the system block whatever the source", () => {
    const a = assembleDistil({ source: SOURCE });
    const b = assembleDistil({ source: "Something else entirely, at length." });
    expect(a.system).toBe(b.system);
    expect(a.system).toBe(DISTIL_SYSTEM);
  });

  /** The whole design decision, stated in the prompt so it cannot drift. */
  it("asks for several different carousels, not one", () => {
    expect(DISTIL_SYSTEM).toContain("three to five angles");
    expect(DISTIL_SYSTEM).toContain("DIFFERENT carousel");
  });

  it("asks for quotes copied exactly", () => {
    expect(DISTIL_SYSTEM).toContain("COPIED EXACTLY");
  });

  /** Padding a thin source with angles it cannot support is the failure here. */
  it("tells it to return fewer angles rather than pad", () => {
    expect(DISTIL_SYSTEM).toContain("fewer angles rather than padding");
  });

  it("names the kind when it is given one", () => {
    expect(assembleDistil({ source: SOURCE, kind: "transcript" }).user).toContain("is a transcript");
    expect(assembleDistil({ source: SOURCE }).user).not.toContain("The source is a");
  });

  it("puts the source last, after everything that frames it", () => {
    const { user } = assembleDistil({ source: SOURCE, kind: "transcript" });
    expect(user.indexOf(SOURCE)).toBeGreaterThan(user.indexOf("is a transcript"));
  });

  it("carries voice in the user message, never the system block", () => {
    const { system, user } = assembleDistil({ source: SOURCE, voice: { tone: "Blunt" } });
    expect(user).toContain("Blunt");
    expect(system).not.toContain("Blunt");
  });

  it("reports the clipping alongside the request", () => {
    const out = assembleDistil({ source: "x".repeat(MAX_SOURCE_CHARS + 100) });
    expect(out.clipped.clipped).toBe(true);
  });
});
