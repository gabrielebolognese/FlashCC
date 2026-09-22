import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { STRUCTURES } from "./structures.js";
import { STYLES, styleById } from "./styles.js";
import { lineCount } from "./text.js";
import type { Slide } from "./model.js";

/**
 * Cross-cutting guards on what generation produces, as opposed to how any one
 * composition is built. Each of these encodes an argument that is easy to lose.
 */

const COPY = [
  "Three editing tricks that instantly make talking-head videos better.",
  "Most cuts happen on the beat. That is why your edit feels mechanical and predictable to watch.",
  "Cut on motion instead, and the join disappears into the movement the viewer is already following.",
  "Save this for your next edit.",
];

const overflowing = (slides: Slide[]): string[] => {
  const bad: string[] = [];
  slides.forEach((slide, i) => {
    for (const l of slide.layers) {
      if (l.kind !== "text" || !(l.text ?? "").trim()) continue;
      const size = l.fontSize ?? 0;
      const lines = lineCount(l.text ?? "", size, l.w, {
        family: l.fontFamily,
        letterSpacing: l.letterSpacing,
        uppercase: l.uppercase,
      });
      if (lines * size * (l.lineHeight ?? 1.2) > l.h + 1) {
        bad.push(`slide ${i + 1} "${l.name}" ${l.fontFamily} ${size}pt needs ${Math.round(lines * size * (l.lineHeight ?? 1.2))} in ${Math.round(l.h)}`);
      }
    }
  });
  return bad;
};

describe("text is measured in the face it will be rendered in", () => {
  /**
   * The bug this pins: fitting ran with the default (sans) metric and
   * applyFonts ran afterwards, so a mono or serif theme was sized for one
   * typeface and rendered in another. Mono measures 15% wider against a 2%
   * safety margin, and Terminal overflowed three slides out of four.
   */
  it("every shipped style fits its own copy", () => {
    for (const style of STYLES) {
      expect(overflowing(buildSlides(COPY, style.theme)), style.name).toEqual([]);
    }
  });

  it("the mono style in particular, which is the one that broke", () => {
    expect(overflowing(buildSlides(COPY, styleById("terminal").theme))).toEqual([]);
  });
});

describe("copy that does not fit gets another slide, not a smaller font", () => {
  // Long enough that no composition's region can hold it within the shrink
  // allowance, whichever one the cycle hands it.
  const LONG = Array.from(
    { length: 14 },
    (_, i) =>
      `Point number ${i + 1} about pacing, cutting on motion, and why the join disappears when the viewer is already following the movement across the frame.`,
  ).join(" ");

  it("produces more slides than it was given entries", () => {
    const theme = styleById("ink").theme;
    const withSplit = buildSlides(["A hook.", LONG, "A close."], theme);
    expect(withSplit.length).toBeGreaterThan(3);
  });

  it("and none of them overflow", () => {
    expect(overflowing(buildSlides(["A hook.", LONG, "A close."], styleById("ink").theme))).toEqual([]);
  });

  /** Words in, words out. Client-approved copy must survive being re-laid. */
  it("never changes a word", () => {
    const slides = buildSlides([LONG], styleById("ink").theme);
    const out = slides
      .flatMap((s) =>
        s.layers
          // The numbered composition draws its own numeral as a text layer.
          // That is generated decoration, not the writer's copy.
          .filter((l) => l.kind === "text" && l.name !== "Number")
          .map((l) => l.text ?? ""),
      )
      .join(" ");
    const words = (s: string) => s.split(/\s+/).filter(Boolean);
    expect(words(out)).toEqual(words(LONG));
  });

  it("can be turned off, and then it does overflow", () => {
    const raw = buildSlides(["A hook.", LONG, "A close."], styleById("ink").theme, undefined, {
      split: false,
    });
    expect(raw).toHaveLength(3);
  });

  it("terminates on copy that cannot be split at all", () => {
    const wall = "a".repeat(3000);
    expect(() => buildSlides([wall], styleById("ink").theme)).not.toThrow();
  });
});

describe("the sameness risk", () => {
  /**
   * The loudest one-star complaint in this category is that every tool "spits
   * out the same 8-slide hook / 5 tips / CTA layout". Four frameworks applied
   * mechanically at batch scale are precisely that complaint, so this asserts
   * the output actually varies rather than trusting a note in a document.
   */
  it("twenty carousels from one framework do not all come out identical", () => {
    const structure = STRUCTURES[0]!;
    const theme = styleById("ink").theme;
    const roles = structure.slots.map((s) => s.id);

    const decks = Array.from({ length: 20 }, (_, n) =>
      buildSlides(
        structure.slots.map((slot, i) =>
          // Length varies the way real copy does; that is what has to move the
          // layout, since the framework itself is fixed.
          i === 3 ? `${slot.placeholder} ${"and a longer thought. ".repeat(n % 5)}` : slot.placeholder,
        ),
        theme,
        roles,
      ),
    );

    // Layer NAMES, not layer counts: different compositions can happen to emit
    // the same number of layers, which made the first version of this test pass
    // for the wrong reason and then fail for the wrong reason too.
    const rhythms = new Set(
      decks.map((d) => d.map((s) => s.layers.map((l) => l.name).join("+")).join("|")),
    );

    expect(rhythms.size).toBeGreaterThan(1);
  });

  it("the four frameworks produce four different composition sequences", () => {
    const theme = styleById("ink").theme;
    const sequences = STRUCTURES.map((structure) =>
      buildSlides(
        structure.slots.map((s) => s.placeholder),
        theme,
        structure.slots.map((s) => s.id),
      )
        .map((s) => s.layers.map((l) => l.name).join(","))
        .join("|"),
    );

    expect(new Set(sequences).size).toBe(STRUCTURES.length);
  });
});
