import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { makeDoc, makeLayer, makeSlide, type Layer, type Slide } from "./model.js";
import { THEMES } from "./presets.js";
import { reflowDoc, reflowLayer, reflowSlide, verticalFill } from "./reflow.js";

const PORTRAIT = { w: 1080, h: 1350 };
const STORY = { w: 1080, h: 1920 };
const SQUARE = { w: 1080, h: 1080 };

const text = (patch: Partial<Layer> = {}): Layer => ({
  ...makeLayer("text", { x: 96, y: 930, w: 888, h: 300 }, "#ffffff"),
  text: "Your hook goes here and it runs to about two lines.",
  fontSize: 88,
  lineHeight: 1.1,
  ...patch,
});

const slideOf = (layers: Layer[]): Slide => ({ ...makeSlide("#101215"), layers });

const inside = (s: Slide, board: { w: number; h: number }): boolean =>
  s.layers.every(
    (l) => l.x >= -0.5 && l.y >= -0.5 && l.x + l.w <= board.w + 0.5 && l.y + l.h <= board.h + 0.5,
  );

describe("the bug this replaces", () => {
  /**
   * The shipped behaviour keeps every pixel position, so going taller strands the
   * content in the top two-thirds. This is the test that fails against the old
   * setFormat and passes against reflow.
   */
  it("does not strand content at the top of a taller board", () => {
    const s = slideOf([text({ y: 930 })]);
    const out = reflowSlide(s, PORTRAIT, STORY);
    const moved = out.layers[0]!;

    expect(moved.y).toBeGreaterThan(1200);
    expect(moved.y / STORY.h).toBeCloseTo(930 / PORTRAIT.h, 1);
  });

  it("keeps everything on the board in both directions", () => {
    const s = slideOf([text(), text({ y: 200, fontSize: 40, h: 200 })]);
    expect(inside(reflowSlide(s, PORTRAIT, STORY), STORY)).toBe(true);
    expect(inside(reflowSlide(s, PORTRAIT, SQUARE), SQUARE)).toBe(true);
  });
});

describe("type is not squashed", () => {
  it("keeps the font size exactly", () => {
    const out = reflowLayer(text({ fontSize: 88 }), PORTRAIT, STORY);
    expect(out.fontSize).toBe(88);
  });

  it("keeps it on a shorter board too, rather than scaling it down", () => {
    const out = reflowLayer(text({ fontSize: 88 }), PORTRAIT, SQUARE);
    expect(out.fontSize).toBe(88);
  });

  /** The box is measured from the copy, not carried over or guessed. */
  it("re-measures the box from the lines the copy actually needs", () => {
    const long = text({ text: "word ".repeat(40), h: 100, fontSize: 40, lineHeight: 1.4 });
    const out = reflowLayer(long, PORTRAIT, STORY);
    expect(out.h).toBeGreaterThan(100);
    expect(out.y + out.h).toBeLessThanOrEqual(STORY.h + 0.5);
  });

  it("gives a one-word layer a single line, not zero height", () => {
    const out = reflowLayer(text({ text: "Go", fontSize: 60, lineHeight: 1.2 }), PORTRAIT, STORY);
    expect(out.h).toBeCloseTo(72, 0);
  });
});

describe("shapes", () => {
  it("does not stretch a circle when only the height changes", () => {
    const dot = makeLayer("ellipse", { x: 100, y: 100, w: 200, h: 200 }, "#d9a521");
    const out = reflowLayer(dot, PORTRAIT, STORY);
    expect(out.w).toBeCloseTo(out.h, 5);
  });

  it("leaves shape sizes alone when the board only grows", () => {
    const dot = makeLayer("ellipse", { x: 100, y: 100, w: 200, h: 200 }, "#d9a521");
    const out = reflowLayer(dot, PORTRAIT, STORY);
    expect(out.w).toBe(200);
  });

  it("shrinks them uniformly when the board loses height", () => {
    const dot = makeLayer("ellipse", { x: 100, y: 100, w: 200, h: 200 }, "#d9a521");
    const out = reflowLayer(dot, PORTRAIT, SQUARE);
    expect(out.w).toBeCloseTo(out.h, 5);
    expect(out.w).toBeLessThan(200);
  });
});

describe("backgrounds", () => {
  /** A full-bleed rect is a background; if it stops covering it stops working. */
  it("re-covers the whole board", () => {
    const bg = makeLayer("rect", { x: 0, y: 0, w: 1080, h: 1350 }, "#12161c");
    const out = reflowLayer(bg, PORTRAIT, STORY);
    expect(out).toMatchObject({ x: 0, y: 0, w: 1080, h: 1920 });
  });

  it("does not mistake a large but non-bleeding block for one", () => {
    const band = makeLayer("rect", { x: 96, y: 200, w: 888, h: 600 }, "#12161c");
    const out = reflowLayer(band, PORTRAIT, STORY);
    expect(out.h).not.toBe(STORY.h);
  });
});

describe("hand edits survive", () => {
  /**
   * The whole reason this re-lays layers instead of regenerating from text: a
   * regenerate is easier and silently deletes everything the user drew.
   */
  it("keeps layers the generator never made", () => {
    const drawn = { ...makeLayer("triangle", { x: 400, y: 400, w: 200, h: 200 }, "#e5545a"), name: "Mine" };
    const out = reflowSlide(slideOf([text(), drawn]), PORTRAIT, STORY);

    expect(out.layers).toHaveLength(2);
    expect(out.layers[1]!.name).toBe("Mine");
    expect(out.layers[1]!.kind).toBe("triangle");
  });

  it("keeps edited copy word for word", () => {
    const mine = text({ text: "Something I typed myself." });
    expect(reflowLayer(mine, PORTRAIT, STORY).text).toBe("Something I typed myself.");
  });

  it("keeps ids, so selection and undo still line up", () => {
    const l = text();
    expect(reflowLayer(l, PORTRAIT, STORY).id).toBe(l.id);
  });
});

describe("whole documents", () => {
  it("is a no-op when the size has not changed", () => {
    const doc = { ...makeDoc(), slides: [slideOf([text()])] };
    expect(reflowDoc(doc, 1080, 1350)).toBe(doc);
  });

  it("re-lays every slide and records the new size", () => {
    const doc = { ...makeDoc(), slides: buildSlides(["A hook.", "A body slide.", "A close."], THEMES.ink!) };
    const out = reflowDoc(doc, 1080, 1920);

    expect(out.width).toBe(1080);
    expect(out.height).toBe(1920);
    expect(out.slides).toHaveLength(3);
    for (const s of out.slides) expect(inside(s, STORY)).toBe(true);
  });

  /**
   * "Everything is inside the artboard" passes for the broken version too, it
   * strands content at the top and nothing overflows. This is the assertion that
   * actually distinguishes them.
   */
  it("spreads generated content across the new height rather than clumping it", () => {
    const doc = { ...makeDoc(), slides: buildSlides(["A hook that earns the swipe."], THEMES.ink!) };
    const before = verticalFill(doc.slides[0]!, PORTRAIT);
    const after = verticalFill(reflowDoc(doc, 1080, 1920).slides[0]!, STORY);

    // Allowed to drift a little; not allowed to collapse into part of the board.
    expect(after).toBeGreaterThan(before * 0.7);
  });

  it("survives a round trip without drifting off the board", () => {
    const doc = { ...makeDoc(), slides: buildSlides(["A hook.", "Some body copy here."], THEMES.ink!) };
    const there = reflowDoc(doc, 1080, 1920);
    const back = reflowDoc(there, 1080, 1350);

    expect(back.height).toBe(1350);
    for (const s of back.slides) expect(inside(s, PORTRAIT)).toBe(true);
  });
});
