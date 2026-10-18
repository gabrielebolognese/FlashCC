import { describe, expect, it } from "vitest";

import { makeLayer, makeSlide, type Slide } from "./model.js";
import {
  ANIMATIONS,
  entrancesFor,
  flashRate,
  flashSafe,
  FPS,
  planVideo,
  slideFrames,
  slideLuma,
  transitionOf,
  TRANSITIONS,
  type Entrance,
} from "./motion.js";

const words = (text: string, size: number, extra = {}) => ({ ...makeLayer("text", { x: 96, y: 300, w: 888, h: 200 }, "#fff"), text, fontSize: size, ...extra });
const slide: Slide = { ...makeSlide("#000"), layers: [words("A *big* ==headline==", 96), words("73%", 80), words("The body line", 40)] };

describe("reduced motion (30.5)", () => {
  it("has a variant of every preset: fades only, at the same moments, no highlight drawn on", () => {
    for (const a of ANIMATIONS) {
      const full = entrancesFor(slide, a.id);
      const reduced = entrancesFor(slide, a.id, true);
      for (const e of reduced.values()) expect(e.kind).toBe("fade");
      expect([...reduced.keys()].some((k) => k.endsWith("#mark"))).toBe(false);
      for (const [id, e] of reduced) expect(e.delay).toBe((full.get(id) as Entrance).delay);
      if (a.id === "none") expect(reduced.size).toBe(0);
    }
  });

  it("turns a push or a zoom into a fade, and leaves a cut and a fade alone", () => {
    expect(TRANSITIONS.map((t) => transitionOf({ transition: t.id, reduced: true }))).toEqual(["cut", "fade", "fade", "fade"]);
    expect(TRANSITIONS.map((t) => transitionOf({ transition: t.id }))).toEqual(TRANSITIONS.map((t) => t.id));
  });
});

describe("flashing (30.5)", () => {
  it("reads a slide's ground: a colour, a gradient's mean, a picture unknown", () => {
    expect(slideLuma({ background: "#000000" })).toBe(0);
    expect(slideLuma({ background: "#ffffff" })).toBeCloseTo(1, 5);
    expect(slideLuma({ background: "#000", gradient: { stops: [{ colour: "#000000" }, { colour: "#ffffff" }] } })).toBeCloseTo(0.5, 5);
    expect(slideLuma({ background: "#000000", image: { src: "x.jpg" } })).toBeNull();
  });

  const alternating = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 ? 1 : 0));

  it("counts a black and white strobe of tenth-of-a-second slides as five flashes a second", () => {
    const plan = planVideo(Array.from({ length: 30 }, () => 3), "cut");
    expect(flashRate(plan, alternating(30)).rate).toBe(5);
    expect(flashSafe(plan, alternating(30))).toBe(false);
  });

  it("ignores slides too close in luminance to count, and counts unknown grounds as changes", () => {
    const plan = planVideo(Array.from({ length: 30 }, () => 3), "cut");
    expect(flashRate(plan, Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.05 : 0.08))).rate).toBe(0);
    expect(flashRate(plan, Array.from({ length: 30 }, () => null)).rate).toBe(5);
  });

  it("passes every transition and animation preset at the shortest hold a person can set", () => {
    const slides = Array.from({ length: 20 }, (_, i) => ({ ...slide, hold: 0.5, background: i % 2 ? "#ffffff" : "#000000" }));
    const frames = slides.map((s, i) => slideFrames(s, i, slides.length));
    expect(frames[0]).toBe(0.5 * FPS);
    for (const t of TRANSITIONS) {
      const plan = planVideo(frames, t.id);
      expect(flashSafe(plan, slides.map(slideLuma)), t.id).toBe(true);
    }
  });
});
