import { describe, expect, it, vi } from "vitest";

import {
  checkAlt,
  checkCaption,
  checkDraft,
  checkHooks,
  checkRewrite,
  flagged,
  inventedMeasures,
  repair,
  retryable,
  retryNote,
  withContentRetry,
  type Finding,
} from "./checks.js";

const SLOTS = [
  { id: "hook", label: "Hook", note: "Earn the swipe", placeholder: "" },
  { id: "problem", label: "Problem", note: "Name it", placeholder: "" },
  { id: "cta", label: "Close", note: "Ask", placeholder: "" },
];

const slide = (role: string, text: string) => ({ role, text });
const codes = (f: readonly Finding[]) => f.map((x) => x.code);

describe("the repair tier", () => {
  it("removes the punctuation the house style does not use", () => {
    expect(repair("fast\u2014cheap")).toBe("fast, cheap");
    expect(repair("it’s here")).toBe("it's here");
    expect(repair("say “this”")).toBe('say "this"');
  });

  it("collapses doubled spaces and trims the ends of lines", () => {
    expect(repair("two  spaces")).toBe("two spaces");
    expect(repair("trailing   \nnext")).toBe("trailing\nnext");
  });

  it("leaves ordinary copy exactly as it is", () => {
    const copy = "Cut on movement, not on the beat. The eye follows motion.";
    expect(repair(copy)).toBe(copy);
  });

  it("survives an empty string", () => {
    expect(repair("")).toBe("");
  });
});

describe("measurements the brief never gave", () => {
  const brief = "Cutting on the beat feels mechanical. Attention resets on the frame change.";

  it("flags a currency amount, a percentage, a multiplier and a duration", () => {
    for (const made of ["$40k", "127%", "3x", "30-second"]) {
      expect(inventedMeasures([`We saw ${made} from it.`], brief)).toHaveLength(1);
    }
  });

  /**
   * The check that was wrong first. "3 cutting rules" on a deck with three of
   * them is a deck counting its own slides, and flagging every educational
   * draft made the whole thing worth ignoring.
   */
  it("ignores a bare integer, which is usually a deck counting itself", () => {
    expect(inventedMeasures(["3 cutting rules that work"], brief)).toEqual([]);
    expect(inventedMeasures(["1 editing rule"], brief)).toEqual([]);
  });

  it("says nothing about a measurement the brief does contain", () => {
    expect(inventedMeasures(["It took 3 weeks."], "It took 3 weeks and cost nothing.")).toEqual([]);
  });

  /** A flag is information, never a refusal: the brief is not everything. */
  it("flags rather than retries, because the number may be correct", () => {
    expect(inventedMeasures(["$40k"], brief)[0]?.tier).toBe("flag");
  });

  it("reports one per slide rather than three", () => {
    expect(inventedMeasures(["$40k and 127% and 3x"], brief)).toHaveLength(1);
  });

  it("carries the offending text so it can be highlighted", () => {
    expect(inventedMeasures(["We saw $40k"], brief)[0]?.detail).toBe("$40k");
  });
});

describe("checking a draft", () => {
  it("passes a clean one", () => {
    const out = checkDraft(
      [slide("hook", "A short hook."), slide("problem", "The problem."), slide("cta", "Save this.")],
      SLOTS,
      "brief",
    );
    expect(out).toEqual([]);
  });

  it("catches the wrong number of slides", () => {
    expect(codes(checkDraft([slide("hook", "One.")], SLOTS, ""))).toContain("slot-count");
  });

  it("catches an empty slide", () => {
    const out = checkDraft(
      [slide("hook", "A hook."), slide("problem", "   "), slide("cta", "Go.")],
      SLOTS,
      "",
    );
    expect(codes(out)).toContain("empty-slide");
    expect(out.find((f) => f.code === "empty-slide")?.at).toBe(1);
  });

  it("catches a placeholder shipped as finished copy", () => {
    const out = checkDraft(
      [slide("hook", "Your hook here"), slide("problem", "P."), slide("cta", "C.")],
      SLOTS,
      "",
    );
    expect(codes(out)).toContain("placeholder");
  });

  it("holds the hook to 90 and the body to 220", () => {
    const longHook = checkDraft(
      [slide("hook", "x".repeat(100)), slide("problem", "P."), slide("cta", "C.")],
      SLOTS,
      "",
    );
    expect(codes(longHook)).toContain("over-ceiling");

    const okBody = checkDraft(
      [slide("hook", "Short."), slide("problem", "x".repeat(200)), slide("cta", "C.")],
      SLOTS,
      "",
    );
    expect(codes(okBody)).not.toContain("over-ceiling");
  });

  it("catches a slot id the framework does not have", () => {
    const out = checkDraft(
      [slide("hook", "H."), slide("invented", "P."), slide("cta", "C.")],
      SLOTS,
      "",
    );
    expect(codes(out)).toContain("unknown-slot");
  });

  /** Adjacent only: returning to an idea later is writing, not a bug. */
  it("catches two slides in a row saying the same thing", () => {
    const out = checkDraft(
      [slide("hook", "Same thing."), slide("problem", "Same thing!"), slide("cta", "C.")],
      SLOTS,
      "",
    );
    expect(codes(out)).toContain("duplicate-slide");
  });

  it("allows an idea to come back later in the deck", () => {
    const out = checkDraft(
      [slide("hook", "Same thing."), slide("problem", "Different."), slide("cta", "Same thing.")],
      SLOTS,
      "",
    );
    expect(codes(out)).not.toContain("duplicate-slide");
  });
});

describe("checking the other routes", () => {
  it("catches a hook over its ceiling and a repeated one", () => {
    const out = checkHooks(
      [
        { angle: "a", text: "x".repeat(100) },
        { angle: "b", text: "Same." },
        { angle: "c", text: "Same!" },
      ],
      [],
    );
    expect(codes(out)).toContain("over-ceiling");
    expect(codes(out)).toContain("duplicate-hook");
  });

  it("catches a hashtag inside a caption and an opener that says swipe", () => {
    const out = checkCaption(
      [
        { note: "a", text: "Great stuff #editing here." },
        { note: "b", text: "Swipe to learn more about editing." },
      ],
      { limit: 3000 },
      [],
    );
    expect(codes(out)).toContain("hashtag-inline");
    expect(codes(out)).toContain("swipe-opener");
  });

  /** Read positionally, so a short answer shifts every later slide's alt text. */
  it("catches the wrong number of alt descriptions", () => {
    expect(codes(checkAlt(["one", "two"], 3))).toContain("alt-count");
  });

  it("catches an alt preamble and an over-long one", () => {
    const out = checkAlt(["Text saying the thing", "x".repeat(200)], 2);
    expect(codes(out)).toContain("alt-preamble");
    expect(codes(out)).toContain("over-ceiling");
  });

  it("catches a rewrite that returns the line it was given", () => {
    const out = checkRewrite([{ note: "n", text: "The same line." }], "The same line!", 220);
    expect(codes(out)).toContain("unchanged");
  });

  it("catches two options claiming the same thing", () => {
    const out = checkRewrite(
      [
        { note: "tighter", text: "One." },
        { note: "tighter", text: "Two." },
      ],
      "Original",
      220,
    );
    expect(codes(out)).toContain("duplicate-note");
  });

  it("catches an option with no note at all", () => {
    expect(codes(checkRewrite([{ note: "  ", text: "One." }], "Other", 220))).toContain("no-note");
  });
});

describe("sorting findings by what to do about them", () => {
  const findings: Finding[] = [
    { at: 0, tier: "retry", code: "empty-slide", message: "Empty." },
    { at: 1, tier: "flag", code: "measure-not-in-brief", message: "Check it." },
  ];

  it("separates the two", () => {
    expect(retryable(findings)).toHaveLength(1);
    expect(flagged(findings)).toHaveLength(1);
  });

  /**
   * A model told its answer was unsatisfactory produces a different
   * unsatisfactory answer. Told slide one is empty, it fixes slide one.
   */
  it("names each failure and numbers the slide for a human count", () => {
    const note = retryNote(findings);
    expect(note).toContain("Item 1: Empty.");
    expect(note).toContain("change nothing else");
  });

  /** Flags are not the model's fault and must not be sent back to it. */
  it("never asks it to fix a flag", () => {
    expect(retryNote(findings)).not.toContain("Check it.");
  });
});

describe("the retry, and its cap", () => {
  const bad = (): Finding[] => [{ at: 0, tier: "retry", code: "x", message: "Broken." }];

  it("does not call twice when the first answer is clean", async () => {
    const run = vi.fn().mockResolvedValue("good");
    const out = await withContentRetry(run, () => []);
    expect(run).toHaveBeenCalledTimes(1);
    expect(out.retried).toBe(false);
  });

  it("calls again with the failure named", async () => {
    const run = vi.fn().mockResolvedValue("bad");
    await withContentRetry(run, bad);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0]?.[0]).toBeUndefined();
    expect(String(run.mock.calls[1]?.[0]?.note)).toContain("Broken.");
    // The previous answer travels with the note, or "Item 1" names nothing.
    expect(run.mock.calls[1]?.[0]?.previous).toBe("bad");
  });

  /**
   * The cap is the point. `callModel` already retries transport failures, so a
   * content retry wrapped naively gives two times two calls, which is how one
   * failure becomes four charges.
   */
  it("never calls more than twice, however bad the second answer is", async () => {
    const run = vi.fn().mockResolvedValue("still bad");
    const out = await withContentRetry(run, bad);
    expect(run).toHaveBeenCalledTimes(2);
    expect(out.retried).toBe(true);
  });

  it("takes the second answer when it is better", async () => {
    const run = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const out = await withContentRetry(run, (x) => (x === "first" ? bad() : []));
    expect(out.out).toBe("second");
    expect(out.findings).toEqual([]);
  });

  /** A retry usually improves things and occasionally makes them worse. */
  it("keeps the first answer when the retry made it worse", async () => {
    const worse: Finding[] = [...bad(), { at: 1, tier: "retry", code: "y", message: "Also broken." }];
    const run = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const out = await withContentRetry(run, (x) => (x === "first" ? bad() : worse));
    expect(out.out).toBe("first");
    expect(out.retried).toBe(true);
  });

  it("does not retry for a flag, which is not the model's fault", async () => {
    const run = vi.fn().mockResolvedValue("fine");
    const out = await withContentRetry(run, () => [
      { at: 0, tier: "flag", code: "measure-not-in-brief", message: "Check it." },
    ]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(flagged(out.findings)).toHaveLength(1);
  });
});
