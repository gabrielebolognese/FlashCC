import { describe, expect, it } from "vitest";

import { MEASURED_IDS } from "../render/fonts/ids.js";
import { buildSlides } from "./compositions.js";
import { FORMATS, makeDoc, type Doc } from "./model.js";
import { PAIRS, pairOf, VOICES, withPair } from "./pairs.js";
import { THEMES } from "./presets.js";
import { RAMPS } from "./ramps.js";
import { reflowDoc } from "./reflow.js";
import { layerLines } from "./text.js";
import { isMeasured } from "./typemetrics.js";

/** Decks with the copy that overflows first: a long hook, long bodies, a marked headline, a one-word slide. */
const DECKS: string[][] = [
  [
    "Why most carousels fail at slide two, and the three fixes that take ten minutes each",
    "The hook makes a promise. Slide two has to start paying it, not restate it in different words.",
    "Most people *bury* the useful part under a paragraph of setup that nobody asked to read.",
    "Fix one: lead with the number. Fix two: cut the throat-clearing. Fix three: end on the ask.",
    "Do this on your next post and watch the swipe-through rate.",
  ],
  [
    "Stop **guessing**",
    "Measure what people actually do on each slide, not what you hoped they would do when you wrote it, because the gap between the two is where your next post gets better.",
    "Typography, Waves & AVATARS: the WAWAWA test for wide letters and tight kerning pairs",
    "One ==small== change, repeated, beats one big launch",
    "Go",
  ],
];

function overflows(doc: Doc): string[] {
  const out: string[] = [];
  doc.slides.forEach((s, i) => {
    for (const l of s.layers) {
      if (l.kind !== "text" || !(l.text ?? "").trim()) continue;
      const size = l.fontSize ?? 64;
      const needed = layerLines(l, size, l.w) * size * (l.lineHeight ?? 1.2);
      if (needed > l.h + 1) out.push(`slide ${i + 1} "${l.name}" needs ${Math.round(needed)} in ${Math.round(l.h)}`);
      if (l.y < -0.5 || l.y + l.h > doc.height + 0.5) out.push(`slide ${i + 1} "${l.name}" leaves the board`);
    }
  });
  return out;
}

const deckIn = (texts: string[], theme: (typeof THEMES)[string], w: number, h: number): Doc => {
  const doc: Doc = { ...makeDoc("t"), slides: buildSlides(texts, theme) };
  return w === 1080 && h === 1350 ? doc : reflowDoc(doc, w, h);
};

describe("the pairing library", () => {
  it("is about two dozen pairs across all six voices, every face measured", () => {
    expect(PAIRS.length).toBeGreaterThanOrEqual(24);
    for (const v of VOICES) expect(PAIRS.filter((p) => p.voice === v.id).length).toBeGreaterThanOrEqual(3);
    for (const p of PAIRS) {
      expect(isMeasured(p.display)).toBe(true);
      expect(isMeasured(p.body)).toBe(true);
      expect((MEASURED_IDS as readonly string[]).includes(p.display)).toBe(true);
    }
    expect(new Set(PAIRS.map((p) => p.id)).size).toBe(PAIRS.length);
  });

  it("is found again from a theme set in it", () => {
    for (const p of PAIRS) expect(pairOf(withPair(THEMES.ink!, p))?.id).toBe(p.id);
  });

  // The 22.2 done-when: every pair, every format, zero overflow.
  for (const pair of PAIRS) {
    it(`${pair.name} (${pair.display} + ${pair.body}) never overflows, at every format`, () => {
      const theme = withPair(THEMES.ink!, pair);
      const problems: string[] = [];
      for (const f of FORMATS) {
        for (const texts of DECKS) {
          for (const p of overflows(deckIn(texts, theme, f.w, f.h))) problems.push(`${f.label}: ${p}`);
        }
      }
      expect(problems).toEqual([]);
    });
  }

  it("holds under every ramp too", () => {
    const problems: string[] = [];
    for (const ramp of RAMPS) {
      for (const pair of PAIRS) {
        const theme = { ...withPair(THEMES.ink!, pair), ramp: ramp.id };
        for (const texts of DECKS) for (const p of overflows(deckIn(texts, theme, 1080, 1350))) problems.push(`${ramp.id} ${pair.id}: ${p}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
