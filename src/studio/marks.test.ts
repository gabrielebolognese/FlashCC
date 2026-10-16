import { describe, expect, it } from "vitest";

import {
  boldWeight,
  hasMarks,
  highlightsToAccent,
  limitMarks,
  markCount,
  outsideMarks,
  parseMarks,
  stripMarks,
} from "./marks.js";

describe("parseMarks", () => {
  it("reads the three marks as runs, in order", () => {
    expect(parseMarks("Stop *guessing*, **measure** the ==cost==.")).toEqual([
      { text: "Stop " },
      { text: "guessing", mark: "accent" },
      { text: ", " },
      { text: "measure", mark: "bold" },
      { text: " the " },
      { text: "cost", mark: "highlight" },
      { text: "." },
    ]);
  });

  it("parses the first mark even right after hasMarks was asked (a shared-regex bug)", () => {
    const t = "Stop *guessing*. Start **measuring** the ==swipe==.";
    expect(hasMarks(t)).toBe(true);
    expect(parseMarks(t).filter((r) => r.mark).map((r) => r.text)).toEqual(["guessing", "measuring", "swipe"]);
    expect(hasMarks(t)).toBe(true);
    expect(stripMarks(t)).toBe("Stop guessing. Start measuring the swipe.");
  });

  it("is one plain run for plain text", () => {
    expect(parseMarks("Nothing marked")).toEqual([{ text: "Nothing marked" }]);
    expect(parseMarks("")).toEqual([{ text: "" }]);
  });

  it("leaves arithmetic, stray asterisks and empty marks alone", () => {
    for (const t of ["5 * 3 * 2", "a * b", "**", "* not *", "== x ==", "rated 4*"]) {
      expect(hasMarks(t)).toBe(false);
      expect(stripMarks(t)).toBe(t);
    }
  });

  it("does not cross a line break", () => {
    expect(hasMarks("*one\ntwo*")).toBe(false);
  });

  it("marks a phrase, not just a word", () => {
    expect(parseMarks("the *one thing* that matters")[1]).toEqual({ text: "one thing", mark: "accent" });
  });
});

describe("stripMarks", () => {
  it("leaves the words a reader sees", () => {
    expect(stripMarks("Stop *guessing*, **measure** the ==cost==.")).toBe("Stop guessing, measure the cost.");
  });
});

describe("limitMarks", () => {
  it("keeps the first marked span and unwraps the rest (the 22.3 done-when)", () => {
    expect(limitMarks("Stop *guessing* and **measure**", 1)).toBe("Stop *guessing* and measure");
    expect(markCount(limitMarks("*a* *b* *c*", 1))).toBe(1);
    expect(limitMarks("*a* *b*", 0)).toBe("a b");
  });
});

describe("outsideMarks", () => {
  it("drops cut positions inside a marked span", () => {
    const t = "One *two three* four";
    // 4 is the start of the mark, 9 is inside it, 16 after it.
    expect(outsideMarks(t, [4, 9, 16])).toEqual([4, 16]);
  });
});

describe("highlightsToAccent", () => {
  it("turns highlight marks into accent marks and leaves the rest", () => {
    expect(highlightsToAccent("a ==b== **c** *d*")).toBe("a *b* **c** *d*");
  });
});

describe("boldWeight", () => {
  it("steps a regular line to 700 and a bold one to 900", () => {
    expect(boldWeight(400)).toBe(700);
    expect(boldWeight(500)).toBe(700);
    expect(boldWeight(700)).toBe(900);
  });
});
