import { describe, expect, it } from "vitest";

import { defaultBrandKit, SAMPLE_POST } from "../../doc/defaults.js";
import { LENGTHS, specimen } from "../../doc/specimens.js";
import { splitToSlides } from "../../doc/split.js";
import { STARTERS } from "../../doc/templates/starters.js";
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
    const a = computeLayout(STARTERS[0]!, slide, brand, format, 1);
    const b = computeLayout(STARTERS[0]!, slide, brand, format, 1);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("scales to other formats without per-format authoring", () => {
    const square = FORMATS["square-1x1"]!;
    const nodes = computeLayout(STARTERS[0]!, specimen("cover", "typical"), brand, square, 1);
    expect(nodes[0]?.h).toBe(square.h);
    for (const n of nodes) expect(n.y + n.h).toBeLessThanOrEqual(square.h + 1);
  });

  it("gives the six starters visibly different geometry", () => {
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

describe("overlays", () => {
  const withOverlays = () => ({
    ...specimen("body", "typical"),
    overlays: [
      { id: "t1", kind: "text" as const, x: 0.1, y: 0.2, w: 0.5, h: 0.1, colour: "#ff0000", text: "Hand placed", fontSize: 60 },
      { id: "s1", kind: "shape" as const, x: 0.6, y: 0.7, w: 0.2, h: 0.1, colour: "#00ff00", shape: "ellipse" as const, filled: true },
      { id: "i1", kind: "icon" as const, x: 0.8, y: 0.1, w: 0.1, h: 0.08, colour: "#0000ff", glyph: "star" },
    ],
  });

  it("emits one node per overlay, above the template content", () => {
    const nodes = computeLayout(STARTERS[0]!, withOverlays(), brand, format, 1);
    const overlayNodes = nodes.filter((n) => n.overlayId);
    expect(overlayNodes).toHaveLength(3);
    const maxContentZ = Math.max(...nodes.filter((n) => !n.overlayId).map((n) => n.z));
    for (const n of overlayNodes) expect(n.z).toBeGreaterThan(maxContentZ);
  });

  it("resolves fractions against the format, so overlays survive a format change", () => {
    const portrait = computeLayout(STARTERS[0]!, withOverlays(), brand, format, 1).find((n) => n.overlayId === "t1")!;
    const square = computeLayout(STARTERS[0]!, withOverlays(), brand, FORMATS["square-1x1"]!, 1).find((n) => n.overlayId === "t1")!;
    expect(portrait.x).toBeCloseTo(0.1 * format.w);
    expect(square.y).toBeCloseTo(0.2 * FORMATS["square-1x1"]!.h);
    expect(portrait.x).toBeCloseTo(square.x);
  });

  it("carries each overlay kind's own paint fields", () => {
    const nodes = computeLayout(STARTERS[0]!, withOverlays(), brand, format, 1);
    expect(nodes.find((n) => n.overlayId === "t1")?.kind).toBe("text");
    expect(nodes.find((n) => n.overlayId === "s1")?.shape).toBe("ellipse");
    expect(nodes.find((n) => n.overlayId === "i1")?.glyph).toBe("star");
  });

  it("leaves template layout untouched when overlays are added", () => {
    const without = computeLayout(STARTERS[0]!, specimen("body", "typical"), brand, format, 1);
    const with_ = computeLayout(STARTERS[0]!, withOverlays(), brand, format, 1).filter((n) => !n.overlayId);
    expect(with_.map((n) => `${n.id}:${Math.round(n.x)},${Math.round(n.y)}`)).toEqual(
      without.map((n) => `${n.id}:${Math.round(n.x)},${Math.round(n.y)}`),
    );
  });
});

describe("per-block style overrides", () => {
  it("wins over the template's chosen size, weight and colour", () => {
    const base = specimen("body", "typical");
    const styled = {
      ...base,
      blocks: base.blocks.map((b, i) =>
        i === 0 ? { ...b, style: { fontSize: 123, weight: 400 as const, colour: "#abcdef" } } : b,
      ),
    };
    const before = computeLayout(STARTERS[0]!, base, brand, format, 1).find((n) => n.slot === "title")!;
    const after = computeLayout(STARTERS[0]!, styled, brand, format, 1).find((n) => n.slot === "title")!;
    expect(before.fontSize).not.toBe(123);
    expect(after.fontSize).toBe(123);
    expect(after.weight).toBe(400);
    expect(after.color).toBe("#abcdef");
  });

  it("renders identically to the template when no override is set", () => {
    const base = specimen("body", "typical");
    const empty = { ...base, blocks: base.blocks.map((b) => ({ ...b, style: undefined })) };
    expect(JSON.stringify(computeLayout(STARTERS[0]!, empty, brand, format, 1))).toBe(
      JSON.stringify(computeLayout(STARTERS[0]!, base, brand, format, 1)),
    );
  });
});
