import { describe, expect, it } from "vitest";

import { makeDoc, makeLayer, makeSlide, type Doc, type Layer, type Slide } from "./model.js";
import { platformById, safeBox } from "./platforms.js";
import { blockers, canExport, preflight, sizeFinding } from "./preflight.js";

const LI = platformById("linkedin");
const IG = platformById("instagram");
const TT = platformById("tiktok");

const text = (patch: Partial<Layer> = {}): Layer => ({
  ...makeLayer("text", { x: 100, y: 200, w: 880, h: 300 }, "#ffffff"),
  text: "A line of perfectly ordinary copy.",
  fontSize: 40,
  lineHeight: 1.3,
  ...patch,
});

const deck = (layers: Layer[][], w = 1080, h = 1350): Doc => ({
  ...makeDoc("Test", w, h),
  slides: layers.map((ls, i): Slide => ({ ...makeSlide("#101215", `Slide ${i + 1}`), layers: ls })),
});

const codes = (d: Doc, p = LI): string[] => preflight(d, p).map((f) => f.code);

describe("slide counts", () => {
  it("passes a deck inside the ceiling", () => {
    expect(codes(deck([[text()], [text()]]))).not.toContain("too-many-slides");
  });

  it("blocks a deck over the platform ceiling", () => {
    const many = deck(Array.from({ length: 12 }, () => [text()]));
    expect(codes(many, IG)).toContain("too-many-slides");
    expect(canExport(preflight(many, IG))).toBe(false);
  });

  /**
   * The sharpest trap in the category: Instagram's app takes 20 slides and its
   * API takes 10, so a 15-slide deck is postable by hand and unpublishable by
   * every scheduler that exists. Silence here would be a lie by omission.
   */
  it("warns about the gap between what the app allows and what the API allows", () => {
    const fifteen = deck(Array.from({ length: 15 }, () => [text()]));
    const found = preflight(fifteen, IG);
    expect(found.map((f) => f.code)).toContain("app-only-slide-count");
    expect(found.find((f) => f.code === "app-only-slide-count")?.message).toMatch(/scheduler/i);
  });

  it("does not raise the app-versus-API warning where there is no gap", () => {
    const forty = deck(Array.from({ length: 40 }, () => [text()]));
    expect(codes(forty, TT)).not.toContain("app-only-slide-count");
  });

  it("blocks an empty deck and stops looking", () => {
    const found = preflight({ ...makeDoc(), slides: [] }, LI);
    expect(found.map((f) => f.code)).toEqual(["empty"]);
  });
});

describe("type size", () => {
  it("blocks body text below the legibility floor", () => {
    const found = preflight(deck([[text({ fontSize: 14, h: 200 })]]), LI);
    const hit = found.find((f) => f.code === "type-too-small");
    expect(hit?.severity).toBe("block");
    expect(hit?.slide).toBe(1);
  });

  it("names the slide it happened on, not just the problem", () => {
    const d = deck([[text()], [text()], [text({ fontSize: 12, h: 200, name: "Tiny" })]]);
    const hit = preflight(d, LI).find((f) => f.code === "type-too-small");
    expect(hit?.slide).toBe(3);
    expect(hit?.message).toContain("Tiny");
  });

  it("holds slide 1 to a higher bar than the rest", () => {
    const d = deck([[text({ fontSize: 20 })], [text({ fontSize: 20 })]]);
    const weak = preflight(d, LI).filter((f) => f.code === "weak-hook");
    expect(weak).toHaveLength(1);
    expect(weak[0]!.slide).toBe(1);
  });

  it("leaves a real hook alone", () => {
    expect(codes(deck([[text({ fontSize: 88, h: 400 })]]))).not.toContain("weak-hook");
  });

  it("applies the platform's own floor, not a global one", () => {
    const d = deck([[text({ fontSize: 19, h: 200 })]], 1080, 1920);
    expect(codes(d, LI)).not.toContain("type-too-small");
    expect(codes(d, TT)).toContain("type-too-small");
  });
});

describe("overflow", () => {
  /** The remedy is another slide, never smaller type — so the message says so. */
  it("blocks copy that does not fit its box and says what to do", () => {
    const long = text({ text: "word ".repeat(200), h: 120, fontSize: 40 });
    const hit = preflight(deck([[long]]), LI).find((f) => f.code === "text-overflows");
    expect(hit?.severity).toBe("block");
    // Shrink-to-fit is the complaint, so the remedy offered has to be a slide
    // and shrinking has to be named as the thing NOT to do.
    expect(hit?.message).toMatch(/another slide rather than shrinking/i);
  });

  it("passes copy that fits", () => {
    expect(codes(deck([[text({ text: "Short.", h: 300 })]]))).not.toContain("text-overflows");
  });
});

describe("safe zones", () => {
  it("warns when a layer reaches under the platform interface", () => {
    // TikTok covers the bottom ~480px; put something squarely in it.
    const low = text({ y: 1700, h: 150, fontSize: 40 });
    expect(codes(deck([[low]], 1080, 1920), TT)).toContain("outside-safe-zone");
  });

  it("leaves a layer inside the safe box alone", () => {
    const box = safeBox(TT, 1080, 1920);
    const inside = text({ x: box.x + 10, y: box.y + 10, w: box.w - 20, h: 200 });
    expect(codes(deck([[inside]], 1080, 1920), TT)).not.toContain("outside-safe-zone");
  });

  /** A background that covers the whole slide is the point, not a mistake. */
  it("does not flag a full-bleed layer", () => {
    const bg = { ...makeLayer("rect", { x: 0, y: 0, w: 1080, h: 1920 }, "#000000"), name: "BG" };
    expect(codes(deck([[bg]], 1080, 1920), TT)).not.toContain("outside-safe-zone");
  });

  it("scales the zone when the artboard is not the platform's own size", () => {
    // Instagram's zone is the centred square crop: 135px top and bottom at 4:5.
    const square = safeBox(IG, 1080, 1080);
    expect(square.y).toBeCloseTo(108, 0);
    const portrait = safeBox(IG, 1080, 1350);
    expect(portrait.y).toBe(135);
    expect(portrait.h).toBe(1080);
  });
});

describe("other checks", () => {
  it("warns about placeholder copy nobody replaced", () => {
    expect(codes(deck([[text({ text: "Type something" })]]))).toContain("placeholder-text");
  });

  it("warns about a hairline stroke", () => {
    const thin = { ...makeLayer("rect", { x: 100, y: 100, w: 300, h: 300 }, "none"), stroke: "#fff", strokeWidth: 1 };
    expect(codes(deck([[thin]]))).toContain("stroke-too-thin");
  });

  it("ignores hidden layers entirely", () => {
    const hidden = text({ fontSize: 8, visible: false, h: 100 });
    expect(codes(deck([[hidden]]))).not.toContain("type-too-small");
  });

  it("warns when the artboard does not match the target", () => {
    expect(codes(deck([[text()]], 1080, 1080), TT)).toContain("wrong-size");
    expect(codes(deck([[text()]], 1080, 1350), LI)).not.toContain("wrong-size");
  });
});

describe("blockers and export gating", () => {
  it("separates the fatal from the advisory", () => {
    const d = deck([[text({ fontSize: 10, h: 100 }), text({ text: "Type something", y: 900 })]]);
    const found = preflight(d, LI);
    expect(blockers(found).every((f) => f.severity === "block")).toBe(true);
    expect(found.length).toBeGreaterThan(blockers(found).length);
  });

  it("lets a clean deck through", () => {
    const clean = deck([
      [text({ fontSize: 88, y: 300, h: 500 })],
      [text({ fontSize: 40, y: 300, h: 500 })],
    ]);
    expect(canExport(preflight(clean, LI))).toBe(true);
  });
});

describe("file size, which is only knowable after rendering", () => {
  it("flags a file over the band", () => {
    expect(sizeFinding(5_000_000, LI)?.code).toBe("file-too-big");
  });

  it("flags a file suspiciously under it", () => {
    expect(sizeFinding(50_000, LI)?.code).toBe("file-too-small");
  });

  it("says nothing about a file in the band", () => {
    expect(sizeFinding(1_200_000, LI)).toBeNull();
  });
});
