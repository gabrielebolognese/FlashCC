import { describe, expect, it } from "vitest";

import { contrast } from "./colour.js";
import { buildSlides } from "./compositions.js";
import {
  addStop,
  averageColour,
  gradientCss,
  GRADIENT_PRESETS,
  makeGradient,
  MAX_STOPS,
  MIN_STOPS,
  presetGradient,
  removeStop,
  sampleAt,
  setStop,
  sortStops,
} from "./gradient.js";
import { STYLES } from "./styles.js";

const g3 = () => makeGradient(["#000000", "#808080", "#ffffff"]);

describe("gradientCss", () => {
  it("writes a linear ramp with ordered stops and percentages", () => {
    const css = gradientCss(makeGradient(["#ff0000", "#0000ff"], "linear", 90));
    expect(css).toBe("linear-gradient(90deg, #ff0000 0%, #0000ff 100%)");
  });

  it("writes radial and conic with an origin", () => {
    expect(gradientCss({ ...g3(), kind: "radial", cx: 0.25, cy: 0.75 })).toContain(
      "radial-gradient(circle at 25% 75%",
    );
    expect(gradientCss({ ...g3(), kind: "conic", angle: 45 })).toContain("conic-gradient(from 45deg");
  });

  it("emits stops in ramp order even when they were stored out of order", () => {
    const messy = { ...g3(), stops: [{ colour: "#ffffff", at: 1 }, { colour: "#000000", at: 0 }] };
    expect(gradientCss(messy)).toBe("linear-gradient(160deg, #000000 0%, #ffffff 100%)");
  });
});

describe("stops", () => {
  it("spreads a new gradient evenly", () => {
    expect(makeGradient(["#a", "#b", "#c"].map((_, i) => `#00000${i}`)).stops.map((s) => s.at)).toEqual([
      0, 0.5, 1,
    ]);
  });

  it("refuses to go below two stops or above the maximum", () => {
    const two = makeGradient(["#000000", "#ffffff"]);
    expect(removeStop(two, 0).stops).toHaveLength(MIN_STOPS);

    let many = two;
    for (let i = 0; i < 20; i += 1) many = addStop(many, Math.random());
    expect(many.stops.length).toBeLessThanOrEqual(MAX_STOPS);
  });

  it("adds a stop in the colour the ramp already shows there", () => {
    const added = addStop(makeGradient(["#000000", "#ffffff"]), 0.5);
    const middle = added.stops.find((s) => Math.abs(s.at - 0.5) < 0.001);
    expect(middle?.colour).toBe("#808080");
  });

  it("keeps stops sorted and clamped when one is dragged past an end", () => {
    const moved = setStop(g3(), 0, { at: 4 });
    expect(moved.stops.every((s) => s.at >= 0 && s.at <= 1)).toBe(true);
    const ats = sortStops(moved.stops).map((s) => s.at);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
  });

  it("samples the ends flat and the middle blended", () => {
    const g = makeGradient(["#000000", "#ffffff"]);
    expect(sampleAt(g, -1)).toBe("#000000");
    expect(sampleAt(g, 2)).toBe("#ffffff");
    expect(sampleAt(g, 0.5)).toBe("#808080");
  });

  it("averages to something between the ends", () => {
    const avg = averageColour(makeGradient(["#000000", "#ffffff"]));
    expect(avg).not.toBe("#000000");
    expect(avg).not.toBe("#ffffff");
  });
});

describe("presets", () => {
  it("all build, with at least two stops and valid hex", () => {
    GRADIENT_PRESETS.forEach((_, i) => {
      const g = presetGradient(i);
      expect(g.stops.length).toBeGreaterThanOrEqual(MIN_STOPS);
      for (const s of g.stops) expect(s.colour).toMatch(/^#[0-9a-f]{6}$/i);
      expect(gradientCss(g)).toContain("gradient(");
    });
  });

  it("falls back to the first rather than throwing on a bad index", () => {
    expect(presetGradient(999)).toEqual(presetGradient(0));
  });
});

describe("gradient styles", () => {
  const gradients = STYLES.filter((s) => s.theme.bgGradient);

  it("ships several", () => {
    expect(gradients.length).toBeGreaterThanOrEqual(5);
  });

  /**
   * The trap: contrast against theme.bg only checks the first stop. Text sits over
   * the whole ramp, so it has to clear every one of them.
   */
  it("keeps body text readable against every stop, not just the first", () => {
    for (const s of gradients) {
      for (const stop of s.theme.bgGradient!.stops) {
        expect(contrast(s.theme.fg, stop.colour), `${s.name} @ ${stop.colour}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps muted legible across the ramp too", () => {
    for (const s of gradients) {
      for (const stop of s.theme.bgGradient!.stops) {
        expect(contrast(s.theme.muted, stop.colour), `${s.name} muted @ ${stop.colour}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("puts the ramp on every generated slide", () => {
    for (const s of gradients) {
      const slides = buildSlides(["A hook.", "A body slide."], s.theme);
      for (const slide of slides) expect(slide.gradient, s.name).toEqual(s.theme.bgGradient);
    }
  });

  it("leaves flat styles flat", () => {
    const flat = STYLES.find((s) => s.id === "dark")!;
    for (const slide of buildSlides(["A hook."], flat.theme)) {
      expect(slide.gradient).toBeUndefined();
    }
  });
});
