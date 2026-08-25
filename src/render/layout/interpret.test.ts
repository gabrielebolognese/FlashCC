import { describe, expect, it } from "vitest";

import { defaultBrandKit, SAMPLE_POST } from "../../doc/defaults.js";
import { LENGTHS, specimen } from "../../doc/specimens.js";
import { splitToSlides } from "../../doc/split.js";
import { ANCHORED, BLANK, STARTERS } from "../../doc/templates/starters.js";
import { blockText } from "../../doc/parse.js";
import { MARGIN } from "../../doc/template.js";
import type { SlideRole } from "../../doc/types.js";
import { computeLayout } from "./computeLayout.js";
import { FORMATS } from "./node.js";

const brand = defaultBrandKit();
const format = FORMATS["portrait-4x5"]!;
const ROLES: SlideRole[] = ["cover", "body", "list", "quote", "cta"];

describe("interpret", () => {
  it("renders every starter × every role × every content length", () => {
    for (const template of STARTERS) {
      for (const role of ROLES) {
        for (const length of LENGTHS) {
          const nodes = computeLayout(template, specimen(role, length), brand, format, 3);
          expect(nodes.length, `${template.name}/${role}/${length}`).toBeGreaterThan(1);
        }
      }
    }
  });

  it("always emits a background node first", () => {
    for (const template of STARTERS) {
      const nodes = computeLayout(template, specimen("cover", "typical"), brand, format, 1);
      expect(nodes[0]?.band).toBe("background");
      expect(nodes[0]?.w).toBe(format.w);
    }
  });

  it("never drops a word — every input word reaches some node", () => {
    const slides = splitToSlides(SAMPLE_POST, "balanced");
    for (const template of STARTERS) {
      slides.forEach((slide, i) => {
        const nodes = computeLayout(template, slide, brand, format, i + 1);
        const rendered = nodes.map((n) => n.text ?? "").join(" ").toLowerCase();
        const words = slide.blocks.flatMap((b) => blockText(b).split(/\s+/)).filter((w) => w.length > 3);
        for (const word of words) {
          expect(rendered, `${template.name} slide ${i + 1} lost "${word}"`).toContain(
            word.replace(/[^a-z0-9]/gi, "").toLowerCase(),
          );
        }
      });
    }
  });

  it("keeps text and decoration inside the safe margin", () => {
    for (const template of STARTERS) {
      const m = Math.round(format.w * MARGIN[template.page.grid.margin]);
      for (const role of ROLES) {
        const nodes = computeLayout(template, specimen(role, "long"), brand, format, 2);
        for (const n of nodes) {
          if (n.band === "background") continue;
          expect(n.x, `${template.name}/${role}/${n.id} left`).toBeGreaterThanOrEqual(m - 1);
          expect(n.x + n.w, `${template.name}/${role}/${n.id} right`).toBeLessThanOrEqual(
            format.w - m + 1,
          );
        }
      }
    }
  });

  it("is deterministic — same input, same output", () => {
    const slide = specimen("body", "long");
    const a = computeLayout(ANCHORED, slide, brand, format, 1);
    const b = computeLayout(ANCHORED, slide, brand, format, 1);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("scales to other formats without per-format authoring", () => {
    const square = FORMATS["square-1x1"]!;
    const nodes = computeLayout(ANCHORED, specimen("cover", "typical"), brand, square, 1);
    expect(nodes[0]?.h).toBe(square.h);
    for (const n of nodes) expect(n.y + n.h).toBeLessThanOrEqual(square.h + 1);
  });

  it("gives every starter visibly different geometry", () => {
    const slide = specimen("cover", "typical");
    const signatures = STARTERS.map((t) =>
      computeLayout(t, slide, brand, format, 1)
        .filter((n) => n.kind === "text")
        .map((n) => `${Math.round(n.x)},${Math.round(n.y)},${n.fontSize}`)
        .join("|"),
    );
    expect(new Set(signatures).size).toBe(STARTERS.length);
  });

  it("emits no node with a NaN or negative dimension", () => {
    for (const template of STARTERS) {
      for (const role of ROLES) {
        for (const length of LENGTHS) {
          for (const n of computeLayout(template, specimen(role, length), brand, format, 4)) {
            for (const key of ["x", "y", "w", "h"] as const) {
              expect(Number.isFinite(n[key]), `${template.name}/${role}/${n.id}.${key}`).toBe(true);
            }
            expect(n.w, `${template.name}/${role}/${n.id}.w`).toBeGreaterThanOrEqual(0);
            expect(n.h, `${template.name}/${role}/${n.id}.h`).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});

