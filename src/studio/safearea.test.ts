import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { makeDoc, makeLayer, makeSlide, type Doc, type Layer, type Slide } from "./model.js";
import { PLATFORMS, platformById, safeBox } from "./platforms.js";
import { preflight } from "./preflight.js";
import { reflowDoc } from "./reflow.js";
import {
  applyTransform,
  bleedsX,
  bleedsY,
  fitSlide,
  fitToSafeArea,
  isIdentity,
  movableBounds,
  transformFor,
} from "./safearea.js";
import { STRUCTURES } from "./structures.js";
import { STYLES } from "./styles.js";

const W = 1080;
const H = 1920;

const rect = (x: number, y: number, w: number, h: number, name = "Rect"): Layer => ({
  ...makeLayer("rect", { x, y, w, h }, "#ffffff"),
  name,
});

const text = (x: number, y: number, w: number, h: number, size: number): Layer => ({
  ...makeLayer("text", { x, y, w, h }, "#ffffff"),
  text: "Some words",
  fontSize: size,
});

const slide = (layers: Layer[]): Slide => ({ ...makeSlide("#000000", "S"), layers });

describe("full bleed, per axis", () => {
  it("knows a full-width band from a boxed one", () => {
    expect(bleedsX(rect(0, 800, 1080, 200), W)).toBe(true);
    expect(bleedsX(rect(96, 800, 888, 200), W)).toBe(false);
  });

  /** A reflow lands a full-width layer at 1079.9997, which is the same design. */
  it("tolerates half a pixel", () => {
    expect(bleedsX(rect(0.2, 800, 1079.6, 200), W)).toBe(true);
  });

  it("judges the axes separately", () => {
    const band = rect(0, 800, 1080, 200);
    expect(bleedsX(band, W)).toBe(true);
    expect(bleedsY(band, H)).toBe(false);
  });
});

describe("what can be moved", () => {
  it("bounds the movable layers only", () => {
    const bounds = movableBounds(slide([rect(96, 200, 888, 400), rect(96, 700, 400, 100)]), W, H);
    expect(bounds).toEqual({ x: 96, y: 200, w: 888, h: 600 });
  });

  /**
   * Including a full-bleed band would report a span of the whole artboard and
   * conclude nothing fits — shrinking a slide that needed no correction.
   */
  it("ignores a full-width band on the axis it bleeds on", () => {
    const bounds = movableBounds(slide([rect(0, 800, 1080, 200, "Block"), rect(96, 200, 400, 100)]), W, H);
    expect(bounds?.x).toBe(96);
    expect(bounds?.w).toBe(400);
    // Vertically the band is not bleeding, so it still counts.
    expect(bounds?.y).toBe(200);
  });

  it("skips hidden layers", () => {
    const hidden = { ...rect(0, 0, 10, 10), visible: false };
    expect(movableBounds(slide([hidden, rect(96, 200, 400, 100)]), W, H)?.x).toBe(96);
  });

  it("is null for a slide with nothing to move", () => {
    expect(movableBounds(slide([rect(0, 0, 1080, 1920)]), W, H)).toBeNull();
    expect(movableBounds(slide([]), W, H)).toBeNull();
  });
});

describe("the transform", () => {
  const box = { x: 40, y: 100, w: 860, h: 1340 };

  it("does nothing to content that already fits", () => {
    expect(isIdentity(transformFor({ x: 100, y: 200, w: 700, h: 900 }, box))).toBe(true);
  });

  it("never scales up", () => {
    expect(transformFor({ x: 100, y: 200, w: 100, h: 100 }, box).scale).toBe(1);
  });

  it("pulls content off an edge it overhangs", () => {
    const t = transformFor({ x: 96, y: 200, w: 888, h: 400 }, box);
    const right = (96 + 888) * t.scale + t.dx;
    expect(right).toBeLessThanOrEqual(box.x + box.w + 0.01);
  });

  /** One factor for both axes, or an aligned composition stops being aligned. */
  it("uses one uniform scale", () => {
    const t = transformFor({ x: 0, y: 0, w: 2000, h: 4000 }, box);
    expect(t.scale).toBeCloseTo(Math.min(860 / 2000, 1340 / 4000), 5);
  });
});

describe("applying it", () => {
  const t = { scale: 0.5, dx: 10, dy: 20 };

  it("moves and scales an ordinary layer", () => {
    const out = applyTransform(rect(100, 200, 400, 300), t, W, H);
    expect(out.x).toBe(60);
    expect(out.y).toBe(120);
    expect(out.w).toBe(200);
    expect(out.h).toBe(150);
  });

  it("leaves a full-bleed axis exactly where it was", () => {
    const out = applyTransform(rect(0, 800, 1080, 200, "Block"), t, W, H);
    expect(out.x).toBe(0);
    expect(out.w).toBe(1080);
    // The other axis still moves.
    expect(out.y).toBe(420);
  });

  it("does not touch a layer that bleeds on both axes", () => {
    const bg = rect(0, 0, 1080, 1920, "Background");
    expect(applyTransform(bg, t, W, H)).toBe(bg);
  });

  /**
   * FLOOR. The box shrinks by exactly `scale`; a font rounded up is
   * proportionally larger than the box it now sits in, and one extra wrapped
   * line pushes the layer out the bottom.
   */
  it("floors the font rather than rounding it", () => {
    expect(applyTransform(text(100, 200, 400, 300, 61), { scale: 0.9, dx: 0, dy: 0 }, W, H).fontSize).toBe(54);
  });

  it("never floors a font to zero", () => {
    expect(applyTransform(text(0, 0, 10, 10, 2), { scale: 0.01, dx: 0, dy: 0 }, W, H).fontSize).toBe(1);
  });
});

describe("a whole slide", () => {
  const box = { x: 40, y: 100, w: 860, h: 1340 };

  it("returns the same object when nothing needs moving", () => {
    const s = slide([rect(100, 200, 400, 300)]);
    expect(fitSlide(s, box, W, H)).toBe(s);
  });

  it("brings an overhanging slide inside the box", () => {
    const out = fitSlide(slide([rect(96, 200, 888, 400), text(96, 700, 888, 200, 60)]), box, W, H);
    for (const l of out.layers) {
      expect(l.x).toBeGreaterThanOrEqual(box.x - 0.01);
      expect(l.x + l.w).toBeLessThanOrEqual(box.x + box.w + 0.01);
    }
  });
});

/* ── the whole document, and the regression this file exists for ──────────── */

const COPY = [
  "Your videos feel boring. Here's why.",
  "Every cut lands on the beat and it still feels flat.",
  "You're cutting to the rhythm of the audio, not the attention.",
  "Cut on movement, not on beat.",
  "A hand leaving frame. A head turning. A door closing.",
  "Save this for your next edit.",
];

const deckFor = (styleId: string, structureId: string): Doc => {
  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0]!;
  const structure = STRUCTURES.find((s) => s.id === structureId) ?? STRUCTURES[0]!;
  const roles = structure.slots.slice(0, COPY.length).map((s) => s.id);
  return { ...makeDoc("T"), slides: buildSlides(COPY, style.theme, roles) };
};

describe("Instagram's crop only reaches the cover", () => {
  const instagram = platformById("instagram");

  it("leaves slides after the first untouched", () => {
    const doc = { ...deckFor("ink", "problem"), width: 1080, height: 1350 };
    const out = fitToSafeArea(doc, instagram);
    for (let i = 1; i < doc.slides.length; i += 1) {
      expect(out.slides[i]).toBe(doc.slides[i]);
    }
  });
});

/**
 * The guard this whole change exists for.
 *
 * Every carousel this product generates used to fail the check this product runs
 * on it — "Image reaches into the area Instagram covers with its own interface",
 * on every slide of every deck. A template that cannot pass its own pre-flight
 * is not a template, and nothing was asserting it did.
 */
describe("every template passes its own pre-flight", () => {
  for (const platform of PLATFORMS) {
    it(`has no safe-zone warnings on ${platform.label}`, () => {
      const offenders: string[] = [];

      for (const style of STYLES) {
        for (const structure of STRUCTURES) {
          const base = deckFor(style.id, structure.id);
          const doc = fitToSafeArea(reflowDoc(base, platform.w, platform.h), platform);

          for (const f of preflight(doc, platform)) {
            if (f.code === "outside-safe-zone") {
              offenders.push(`${style.id}/${structure.id} slide ${f.slide}: ${f.message}`);
            }
          }
        }
      }

      expect(offenders.slice(0, 5)).toEqual([]);
    });
  }
});

describe("what the safe box means, per platform", () => {
  it("calls Instagram's a crop and says where it bites", () => {
    const doc = { ...deckFor("ink", "problem"), width: 1080, height: 1350 };
    // A layer deliberately dropped into the cropped band on the cover.
    doc.slides[0]!.layers.push(rect(100, 10, 400, 80, "Stray"));

    const message = preflight(doc, platformById("instagram")).find(
      (f) => f.code === "outside-safe-zone",
    )?.message;

    expect(message).toContain("crops off in the profile grid");
    expect(message).not.toContain("its own interface");
  });

  it("calls LinkedIn's an interface, because it is one", () => {
    const doc = { ...deckFor("ink", "problem"), width: 1080, height: 1350 };
    doc.slides[0]!.layers.push(rect(100, 10, 400, 40, "Stray"));

    expect(
      preflight(doc, platformById("linkedin")).find((f) => f.code === "outside-safe-zone")?.message,
    ).toContain("its own interface");
  });

  /** Every framework's closing block is one of these. All of them were flagged. */
  it("does not flag a deliberate full-width band", () => {
    const doc: Doc = {
      ...makeDoc("T"),
      slides: [slide([rect(0, 500, 1080, 200, "Block")])],
    };
    const box = safeBox(platformById("linkedin"), doc.width, doc.height);
    expect(box.x).toBeGreaterThan(0);
    expect(preflight(doc, platformById("linkedin")).filter((f) => f.code === "outside-safe-zone")).toEqual([]);
  });
});
