import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { customFrom, DEFAULT_STYLE, STYLES, styleById } from "./styles.js";
import { STRUCTURES } from "./structures.js";

const H = 1350;

/** Relative luminance, for checking a palette is actually readable. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

describe("styles", () => {
  it("offers a plain dark and a plain light first", () => {
    expect(STYLES[0]?.id).toBe("dark");
    expect(STYLES[1]?.id).toBe("light");
  });

  it("has unique ids and names", () => {
    expect(new Set(STYLES.map((s) => s.id)).size).toBe(STYLES.length);
    expect(new Set(STYLES.map((s) => s.name)).size).toBe(STYLES.length);
  });

  it("gives body text a readable contrast in every style", () => {
    for (const s of STYLES) {
      expect(contrast(s.theme.fg, s.theme.bg), `${s.name} text`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps muted text legible, not decorative", () => {
    for (const s of STYLES) {
      expect(contrast(s.theme.muted, s.theme.bg), `${s.name} muted`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the accent visible against its own background", () => {
    for (const s of STYLES) {
      expect(contrast(s.theme.accent, s.theme.bg), `${s.name} accent`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the colour block readable — its text sits on the accent", () => {
    for (const s of STYLES) {
      expect(contrast(s.theme.bg, s.theme.accent), `${s.name} block`).toBeGreaterThanOrEqual(3);
    }
  });

  it("falls back to the default for an unknown id", () => {
    expect(styleById("nope")).toBe(DEFAULT_STYLE);
    expect(styleById("paper").id).toBe("paper");
  });

  it("seeds a custom style from whichever was selected", () => {
    const base = styleById("forest");
    const c = customFrom(base);
    expect(c.id).toBe("custom");
    expect(c.theme).toEqual(base.theme);
    // ...and does not alias it, so editing the copy leaves the original alone.
    c.theme.bg = "#123456";
    expect(base.theme.bg).not.toBe("#123456");
  });
});

describe("styles applied to slides", () => {
  const problem = STRUCTURES[0]!;
  const texts = problem.slots.map((s) => s.placeholder);
  const roles = problem.slots.map((s) => s.id);

  it("paints every style without overflowing the artboard", () => {
    for (const s of STYLES) {
      for (const slide of buildSlides(texts, s.theme, roles)) {
        expect(slide.background).toBe(s.theme.bg);
        for (const l of slide.layers) {
          expect(l.y + l.h, `${s.name}/${l.name}`).toBeLessThanOrEqual(H + 0.5);
        }
      }
    }
  });

  it("puts the display face on headings and the body face on prose", () => {
    // Sand is the one style whose two faces differ, so it proves the split.
    const sand = styleById("sand");
    expect(sand.theme.displayFont).not.toBe(sand.theme.bodyFont);

    // Slide 2 with no role is heading + body, which is the composition that has both.
    const slides = buildSlides(
      ["First slide.", "Lead line. And the supporting detail after it."],
      sand.theme,
    );
    const layers = slides[1]!.layers.filter((l) => l.kind === "text");
    const heading = layers.find((l) => l.name === "Heading");
    const body = layers.find((l) => l.name === "Body");

    expect(heading?.fontFamily, "heading").toBe(sand.theme.displayFont);
    expect(body?.fontFamily, "body").toBe(sand.theme.bodyFont);
  });

  it("gives every generated text layer the style's face, whatever the composition", () => {
    const terminal = styleById("terminal");
    for (const slide of buildSlides(texts, terminal.theme, roles)) {
      for (const l of slide.layers) {
        if (l.kind === "text") expect(l.fontFamily, l.name).toBe("mono");
      }
    }
  });

  it("changes the rendered result when the style changes", () => {
    const a = JSON.stringify(buildSlides(texts, styleById("dark").theme, roles));
    const b = JSON.stringify(buildSlides(texts, styleById("paper").theme, roles));
    expect(a).not.toBe(b);
  });
});
