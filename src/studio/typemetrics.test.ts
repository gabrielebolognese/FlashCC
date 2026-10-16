import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import * as fontkit from "fontkit";
import { describe, expect, it } from "vitest";

import { FONTS } from "./model.js";
import { faceFor, loadKerning, matchWeight, MEASURED, weightsOf } from "./typemetrics.js";
import { rawTextWidth, textWidth } from "./text.js";

const require = createRequire(import.meta.url);
const file = (pkg: string, weight: number) =>
  join(dirname(require.resolve(`@fontsource/${pkg}/package.json`)), "files", `${pkg}-latin-${weight}-normal.woff2`);

/** The width a browser's shaper gives, from the woff2 itself: the ground truth. */
const shaped = (pkg: string, weight: number, text: string, size: number): number => {
  const font = fontkit.openSync(file(pkg, weight)) as unknown as {
    layout(t: string): { advanceWidth: number };
    unitsPerEm: number;
  };
  return (font.layout(text).advanceWidth / font.unitsPerEm) * size;
};

describe("matchWeight follows the CSS font-matching rules", () => {
  it("prefers the exact weight, then the rules' direction", () => {
    expect(matchWeight([400, 700], 700)).toBe(700);
    expect(matchWeight([400, 700], 600)).toBe(700);
    expect(matchWeight([400, 700], 500)).toBe(400);
    expect(matchWeight([400, 500, 700], 450)).toBe(500);
    expect(matchWeight([400, 700], 300)).toBe(400);
    expect(matchWeight([400], 900)).toBe(400);
    expect(matchWeight([400, 900], 700)).toBe(900);
  });
});

describe("every bundled face is measured", () => {
  it("has advances for every weight it ships, and a picker entry", () => {
    for (const [id, fam] of Object.entries(MEASURED)) {
      expect(weightsOf(id).length).toBeGreaterThan(0);
      for (const w of weightsOf(id)) expect(fam.weights[String(w)]!.adv.length).toBeGreaterThan(190);
      expect(FONTS.some((f) => f.id === id && f.bundled)).toBe(true);
    }
  });
});

describe("a bundled face measures what the browser draws (22.3 done-when)", () => {
  const cases: [string, string, number, string][] = [
    ["inter", "inter", 700, "Your hook goes here"],
    ["playfair", "playfair-display", 700, "Why most carousels fail at slide two"],
    ["poppins", "poppins", 500, "AVOID Typography, Waves & Tables"],
    ["lato", "lato", 400, "The quick brown fox jumps over the lazy dog."],
  ];

  it.each(cases)("%s %i within a pixel at 96px, kerning loaded", async (id, pkg, weight, text) => {
    await loadKerning([id]);
    const ours = rawTextWidth(text, 96, { family: id, weight });
    const truth = shaped(pkg, weight, text, 96);
    expect(Math.abs(ours - truth)).toBeLessThanOrEqual(1);
  });

  it("measures a marked headline as its runs: the bold word at the bold weight", async () => {
    await loadKerning(["inter"]);
    const ours = rawTextWidth("Stop **guessing** now", 80, { family: "inter", weight: 400 });
    const truth = shaped("inter", 400, "Stop ", 80) + shaped("inter", 700, "guessing", 80) + shaped("inter", 400, " now", 80);
    expect(Math.abs(ours - truth)).toBeLessThanOrEqual(1);
    // And the accent mark changes nothing but colour.
    expect(rawTextWidth("Stop *guessing* now", 80, { family: "inter", weight: 400 })).toBeCloseTo(
      rawTextWidth("Stop guessing now", 80, { family: "inter", weight: 400 }),
      5,
    );
  });

  it("keeps a small safety margin for subpixel rounding, much smaller than the estimate's", () => {
    const raw = rawTextWidth("Your hook goes here", 96, { family: "inter", weight: 700 });
    expect(textWidth("Your hook goes here", 96, { family: "inter", weight: 700 }) / raw).toBeCloseTo(1.005, 4);
    expect(textWidth("Your hook", 96, { family: "sans" }) / rawTextWidth("Your hook", 96, { family: "sans" })).toBeCloseTo(1.02, 4);
  });

  it("measures a heavier weight wider", () => {
    expect(rawTextWidth("Measured", 64, { family: "inter", weight: 900 })).toBeGreaterThan(
      rawTextWidth("Measured", 64, { family: "inter", weight: 400 }),
    );
    expect(faceFor("not-a-font")).toBeNull();
  });
});
