import { describe, expect, it } from "vitest";

import { contrast } from "./colour.js";
import { decorScale, DEFAULT_PREFS, styleFromPrefs, wantsImages, type Prefs } from "./onboarding.js";
import { buildFrameworkSamples, EXAMPLES_GROUP } from "./samples.js";
import { STRUCTURES } from "./structures.js";

const H = 1350;
const prefs = (patch: Partial<Prefs> = {}): Prefs => ({ ...DEFAULT_PREFS, ...patch });
const optionsFor = (p: Prefs) => ({ images: wantsImages(p.images), decor: decorScale(p.decor) });
const samplesFor = (p: Prefs) => buildFrameworkSamples(styleFromPrefs(p).theme, optionsFor(p));

describe("framework samples", () => {
  it("makes exactly one per framework, named after it", () => {
    const docs = samplesFor(prefs());
    expect(docs).toHaveLength(STRUCTURES.length);
    expect(docs.map((d) => d.name)).toEqual(STRUCTURES.map((s) => s.name));
  });

  it("gives each one a slide per slot", () => {
    samplesFor(prefs()).forEach((d, i) => {
      expect(d.slides, d.name).toHaveLength(STRUCTURES[i]!.slots.length);
    });
  });

  it("files them together so they are easy to delete later", () => {
    for (const d of samplesFor(prefs())) expect(d.group).toBe(EXAMPLES_GROUP);
  });

  it("gives each its own id", () => {
    const docs = samplesFor(prefs());
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
  });

  it("uses finished example copy, not placeholder mush", () => {
    for (const d of samplesFor(prefs())) {
      for (const s of d.slides) {
        const text = s.layers
          .filter((l) => l.kind === "text")
          .map((l) => l.text ?? "")
          .join(" ");
        expect(text.trim().length, `${d.name} has an empty slide`).toBeGreaterThan(0);
        expect(text.toLowerCase()).not.toContain("lorem");
        expect(text.toLowerCase()).not.toContain("your hook here");
      }
    }
  });

  /** The whole point: they demonstrate the settings that were just chosen. */
  it("carries the chosen style through every sample", () => {
    const p = prefs({ ground: "forest", accent: "#ff00aa", displayFont: "slab" });
    const theme = styleFromPrefs(p).theme;
    for (const d of samplesFor(p)) {
      for (const s of d.slides) {
        expect(s.background).toBe(theme.bg);
        for (const l of s.layers) {
          if (l.kind === "text" && l.name !== "Body") expect(l.fontFamily).toBe("slab");
        }
      }
    }
  });

  it("honours the photo and line-work answers", () => {
    const bare = samplesFor(prefs({ images: "never", decor: "none" }));
    for (const d of bare) {
      for (const s of d.slides) {
        expect(s.layers.some((l) => l.kind === "image"), d.name).toBe(false);
        expect(s.layers.some((l) => l.kind === "rect" && l.name !== "Block"), d.name).toBe(false);
      }
    }

    const full = samplesFor(prefs({ images: "always", decor: "bold" }));
    expect(full.some((d) => d.slides.some((s) => s.layers.some((l) => l.kind === "image")))).toBe(true);
  });

  it("stays inside the artboard and readable on every ground", () => {
    for (const ground of ["dark", "light", "forest", "sand"]) {
      const p = prefs({ ground });
      const theme = styleFromPrefs(p).theme;
      expect(contrast(theme.fg, theme.bg)).toBeGreaterThanOrEqual(4.5);
      for (const d of samplesFor(p)) {
        for (const s of d.slides) {
          for (const l of s.layers) {
            expect(l.y + l.h, `${ground}/${d.name}/${l.name}`).toBeLessThanOrEqual(H + 0.5);
            expect(l.y).toBeGreaterThanOrEqual(-0.5);
          }
        }
      }
    }
  });
});
