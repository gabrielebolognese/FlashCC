import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { bestText, contrast, fadeToContrast, isValidHex, luminance, mix, textFor } from "./colour.js";
import { FONT_FORMATS, FONT_SOURCES } from "./fonts.js";
import { allFonts, FONTS, fontStack, registerFont, unregisterFont } from "./model.js";
import { CUSTOM_GROUND, DEFAULT_PREFS, groundFor, styleFromPrefs, type Prefs } from "./onboarding.js";

const prefs = (patch: Partial<Prefs> = {}): Prefs => ({ ...DEFAULT_PREFS, ...patch });

describe("contrast maths", () => {
  it("matches the WCAG extremes", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrast("#123456", "#abcdef")).toBeCloseTo(contrast("#abcdef", "#123456"), 6);
  });

  it("orders luminance sensibly", () => {
    expect(luminance("#000000")).toBeLessThan(luminance("#808080"));
    expect(luminance("#808080")).toBeLessThan(luminance("#ffffff"));
  });

  it("mixes toward the far end", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(luminance(mix("#000000", "#ffffff", 0.5))).toBeGreaterThan(0);
  });

  it("validates hex", () => {
    expect(isValidHex("#aabbcc")).toBe(true);
    expect(isValidHex("#abc")).toBe(false);
    expect(isValidHex("nope")).toBe(false);
  });
});

/**
 * The reason this module exists: literal RGB inversion is not contrast. Mid-grey
 * inverts to itself and disappears.
 */
describe("bestText", () => {
  it("beats naive inversion on the colour where inversion fails", () => {
    const grey = "#808080";
    const inverted = "#7f7f7f";
    expect(contrast(inverted, grey)).toBeLessThan(1.1);
    expect(contrast(bestText(grey), grey)).toBeGreaterThan(4);
  });

  it("goes light on dark grounds and dark on light ones", () => {
    expect(luminance(bestText("#101010"))).toBeGreaterThan(0.5);
    expect(luminance(bestText("#f5f5f5"))).toBeLessThan(0.1);
  });

  it("clears 4.5:1 on every hue at every lightness", () => {
    for (let h = 0; h < 360; h += 15) {
      for (const l of [8, 20, 35, 50, 65, 80, 95]) {
        const bg = hsl(h, 70, l);
        expect(contrast(bestText(bg), bg), `${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("textFor", () => {
  it("gives muted text that is quieter than body text but still legible", () => {
    for (const bg of ["#101215", "#ffffff", "#1a1330", "#e8d5a0", "#2b0f0f"]) {
      const { fg, muted } = textFor(bg);
      expect(contrast(muted, bg), `${bg} muted floor`).toBeGreaterThanOrEqual(3);
      expect(contrast(muted, bg), `${bg} muted vs body`).toBeLessThan(contrast(fg, bg));
    }
  });

  it("leaves a colour alone when it is already below the target", () => {
    const faded = fadeToContrast("#808080", "#7d7d7d", 4.6);
    expect(faded).toBe("#808080");
  });
});

describe("custom ground in preferences", () => {
  it("uses the custom colour and derives its text", () => {
    const g = groundFor(prefs({ ground: CUSTOM_GROUND, customBg: "#3b0764" }));
    expect(g.bg).toBe("#3b0764");
    expect(contrast(g.fg, g.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(g.muted, g.bg)).toBeGreaterThanOrEqual(3);
  });

  it("falls back to a preset when custom is selected with no colour", () => {
    expect(groundFor(prefs({ ground: CUSTOM_GROUND })).id).toBe("dark");
  });

  it("builds readable slides on any custom background", () => {
    for (const bg of ["#3b0764", "#f0e6d2", "#808080", "#000000", "#ffffff", "#7a1f1f"]) {
      const p = prefs({ ground: CUSTOM_GROUND, customBg: bg });
      const theme = styleFromPrefs(p).theme;
      expect(contrast(theme.fg, theme.bg), bg).toBeGreaterThanOrEqual(4.5);
      for (const slide of buildSlides(["A hook.", "Some body text here."], theme)) {
        expect(slide.background).toBe(bg);
        for (const l of slide.layers) expect(l.y + l.h).toBeLessThanOrEqual(1350.5);
      }
    }
  });
});

/** Minimal HSL → hex, for sweeping the colour space. */
function hsl(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v);
  };
  return `#${[f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

describe("fonts", () => {
  it("ships eight built-ins with unique ids, labels and stacks", () => {
    expect(FONTS).toHaveLength(8);
    expect(new Set(FONTS.map((f) => f.id)).size).toBe(8);
    expect(new Set(FONTS.map((f) => f.label)).size).toBe(8);
    expect(new Set(FONTS.map((f) => f.stack)).size).toBe(8);
  });

  it("ends every stack in a generic family, so nothing falls back to nothing", () => {
    for (const f of FONTS) {
      expect(f.stack, f.label).toMatch(/(sans-serif|serif|monospace)$/);
    }
  });

  it("resolves an unknown id to the first built-in rather than undefined", () => {
    expect(fontStack("nope")).toBe(FONTS[0]!.stack);
    expect(fontStack(undefined)).toBe(FONTS[0]!.stack);
    expect(fontStack("slab")).toContain("Rockwell");
  });

  it("lets a registered font win over the built-ins, and gives it back on unregister", () => {
    registerFont({ id: "mine", label: "Mine", stack: '"FCC Mine", sans-serif' });
    expect(allFonts().some((f) => f.id === "mine")).toBe(true);
    expect(fontStack("mine")).toContain("FCC Mine");

    unregisterFont("mine");
    expect(allFonts().some((f) => f.id === "mine")).toBe(false);
    expect(fontStack("mine")).toBe(FONTS[0]!.stack);
  });

  it("names a real format and a real source for every entry", () => {
    for (const f of FONT_FORMATS) expect(f.ext).toMatch(/^\.(woff2|woff|ttf|otf)$/);
    for (const s of FONT_SOURCES) expect(s.url).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
    expect(FONT_FORMATS[0]?.ext, "woff2 should lead — it is the smallest").toBe(".woff2");
  });
});
