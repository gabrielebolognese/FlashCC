import { describe, expect, it } from "vitest";

import { buildSlides, MAX_SLIDES } from "./compositions.js";
import { THEMES } from "./presets.js";
import { STRUCTURES } from "./structures.js";
import { clampY, fitToBox, ladder, lineCount, textWidth, wrapLines } from "./text.js";

const theme = THEMES.ink!;
const H = 1350;
const W = 1080;

describe("textWidth", () => {
  it("grows with length and with size", () => {
    expect(textWidth("aa", 40)).toBeGreaterThan(textWidth("a", 40));
    expect(textWidth("hello", 80)).toBeCloseTo(textWidth("hello", 40) * 2, 5);
  });

  it("knows narrow and wide letters apart", () => {
    expect(textWidth("iiii", 40)).toBeLessThan(textWidth("mmmm", 40));
  });

  it("counts letter spacing and uppercasing", () => {
    expect(textWidth("hello", 40, { letterSpacing: 0.1 })).toBeGreaterThan(textWidth("hello", 40));
    expect(textWidth("hello", 40, { uppercase: true })).toBeGreaterThan(textWidth("hello", 40));
  });

  it("treats mono as fixed pitch", () => {
    expect(textWidth("iiii", 40, { family: "mono" })).toBeCloseTo(
      textWidth("mmmm", 40, { family: "mono" }),
      5,
    );
  });
});

describe("wrapLines", () => {
  it("keeps a short line whole", () => {
    expect(wrapLines("hello world", 40, 2000)).toEqual(["hello world"]);
  });

  it("wraps when the box is narrow", () => {
    // "hello world" measures ~189px at 40px, so the box has to be under that.
    expect(wrapLines("hello world", 40, 240)).toHaveLength(1);
    expect(wrapLines("hello world", 40, 120)).toHaveLength(2);
  });

  it("honours explicit newlines as hard breaks", () => {
    expect(wrapLines("one\ntwo", 40, 4000)).toEqual(["one", "two"]);
  });

  it("breaks a single word too wide to fit rather than letting it overhang", () => {
    const lines = wrapLines("supercalifragilistic", 80, 200);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(textWidth(l, 80)).toBeLessThanOrEqual(200 + 0.01);
  });

  it("never returns a line wider than the box", () => {
    const text = "The quick brown fox jumps over the lazy dog and keeps running for a while";
    for (const width of [200, 400, 900]) {
      for (const l of wrapLines(text, 48, width)) {
        expect(textWidth(l, 48), `${width}: "${l}"`).toBeLessThanOrEqual(width + 0.01);
      }
    }
  });

  it("produces more lines as the box narrows", () => {
    const t = "one two three four five six seven eight nine ten eleven twelve";
    expect(lineCount(t, 40, 300)).toBeGreaterThanOrEqual(lineCount(t, 40, 900));
  });
});

describe("fitToBox", () => {
  const sizes = ladder(100, 20);

  it("picks a size whose real height fits", () => {
    const f = fitToBox("A short hook", { maxWidth: 800, maxHeight: 400, sizes, lineHeight: 1.1 });
    expect(f.overflows).toBe(false);
    expect(f.height).toBeLessThanOrEqual(400);
    expect(f.lines * f.fontSize * 1.1).toBeCloseTo(f.height, 5);
  });

  it("shrinks rather than overflowing as the text grows", () => {
    const short = fitToBox("Short", { maxWidth: 800, maxHeight: 300, sizes, lineHeight: 1.1 });
    const long = fitToBox("word ".repeat(120), { maxWidth: 800, maxHeight: 300, sizes, lineHeight: 1.1 });
    expect(long.fontSize).toBeLessThan(short.fontSize);
    expect(long.height).toBeLessThanOrEqual(300);
  });

  it("reports overflow instead of pretending, when even the floor will not fit", () => {
    const f = fitToBox("word ".repeat(4000), { maxWidth: 400, maxHeight: 100, sizes, lineHeight: 1.2 });
    expect(f.overflows).toBe(true);
    expect(f.fontSize).toBe(Math.min(...sizes));
  });

  it("is monotone: a bigger box never yields a smaller size", () => {
    const t = "The quick brown fox jumps over the lazy dog";
    let last = 0;
    for (const h of [80, 160, 320, 640]) {
      const f = fitToBox(t, { maxWidth: 800, maxHeight: h, sizes, lineHeight: 1.2 });
      expect(f.fontSize).toBeGreaterThanOrEqual(last);
      last = f.fontSize;
    }
  });
});

describe("clampY", () => {
  it("leaves a block that already fits where it is", () => {
    expect(clampY(200, 100, 100, 400)).toBe(200);
  });

  it("pulls a block up rather than letting it spill past the bottom", () => {
    expect(clampY(450, 100, 100, 400)).toBe(400);
  });

  it("never pushes above the top", () => {
    expect(clampY(-50, 100, 100, 400)).toBe(100);
  });

  it("pins an oversized block to the top so the start stays readable", () => {
    expect(clampY(300, 900, 100, 400)).toBe(100);
  });
});

/** The regression this whole module exists for. */
describe("generated slides never overflow", () => {
  const brutal = [
    "Short",
    "A hook of a fairly ordinary length that says something",
    "This is an extremely long hook that somebody pasted in without thinking about how much room a slide actually has, and it keeps going well past any reasonable length for a first slide",
    "Supercalifragilisticexpialidocious antidisestablishmentarianism pneumonoultramicroscopicsilicovolcanoconiosis",
    "word ".repeat(140),
    "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM",
    "line one\nline two\nline three\nline four\nline five\nline six\nline seven",
    "  ",
  ];

  it("keeps every layer inside the artboard, for every length and every slot", () => {
    for (const s of STRUCTURES) {
      for (const sample of brutal) {
        const texts = s.slots.map(() => sample);
        for (const slide of buildSlides(texts, theme, s.slots.map((x) => x.id))) {
          for (const l of slide.layers) {
            expect(l.y, `${s.name} top: ${l.name}`).toBeGreaterThanOrEqual(-0.5);
            expect(l.y + l.h, `${s.name} bottom: ${l.name} on "${sample.slice(0, 24)}"`).toBeLessThanOrEqual(H + 0.5);
            expect(l.x).toBeGreaterThanOrEqual(-0.5);
            expect(l.x + l.w).toBeLessThanOrEqual(W + 0.5);
          }
        }
      }
    }
  });

  it("keeps a very long hook inside the slide, at a smaller size", () => {
    const long = brutal[2]!;
    const short = buildSlides(["Short"], theme, ["hook"])[0]!;
    const huge = buildSlides([long], theme, ["hook"])[0]!;

    const title = (s: typeof short) => s.layers.find((l) => l.name === "Title")!;
    expect(title(huge).fontSize).toBeLessThan(title(short).fontSize!);
    expect(title(huge).y + title(huge).h).toBeLessThanOrEqual(H);
  });

  it("holds at the full 35 slides", () => {
    const texts = Array.from({ length: MAX_SLIDES }, (_, i) => `${"long ".repeat(i * 3)}slide ${i}`);
    for (const slide of buildSlides(texts, theme)) {
      for (const l of slide.layers) {
        expect(l.y + l.h).toBeLessThanOrEqual(H + 0.5);
      }
    }
  });
});
