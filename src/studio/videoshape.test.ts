/**
 * A deck into a video's shape (26.2): reflow by default, through the same
 * path as a canvas resize, and letterbox only when asked. Kept in `src`
 * because the exporter reaches modules only Vite can load.
 */
import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { videoDoc } from "./exporter.js";
import { makeDoc, type Doc } from "./model.js";
import { DEFAULT_MOTION, entrancesFor, movingFrames, planVideo, slideFrames } from "./motion.js";
import { platformById } from "./platforms.js";
import { preflight } from "./preflight.js";
import { STRUCTURES } from "./structures.js";
import { STYLES } from "./styles.js";

const COPY = [
  "Your edits feel mechanical",
  "You cut on the beat",
  "The beat is predictable",
  "Cut on movement instead",
  "A hand leaving frame",
  "A door closing",
  "Motion hides the cut",
  "Try it on one scene",
  "Follow for part two",
];

const deck = (): Doc => {
  const roles = STRUCTURES[0]!.slots.map((s) => s.id);
  return { ...makeDoc("Cutting"), slides: buildSlides(COPY, STYLES[0]!.theme, roles.slice(0, COPY.length)) };
};

describe("videoDoc", () => {
  it("reflows a 4:5 deck to 9:16 clear of TikTok's interface, leaving the deck itself alone", () => {
    const doc = deck();
    const before = JSON.stringify(doc);
    const shaped = videoDoc(doc, DEFAULT_MOTION);
    expect([shaped.width, shaped.height]).toEqual([1080, 1920]);
    const bad = preflight(shaped, platformById("tiktok")).filter(
      (f) => f.severity === "block" || f.code === "outside-safe-zone" || f.code === "wrong-size",
    );
    expect(bad).toEqual([]);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("sends the deck as it is when letterboxed, or already the shape", () => {
    const doc = deck();
    expect(videoDoc(doc, { ...DEFAULT_MOTION, fit: "letterbox" })).toBe(doc);
    expect(videoDoc(doc, { ...DEFAULT_MOTION, target: "linkedin-45" })).toBe(doc);
  });

  it("times a reflowed deck exactly as the deck it came from", () => {
    const doc = deck();
    const shaped = videoDoc(doc, DEFAULT_MOTION);
    const n = doc.slides.length;
    expect(shaped.slides.map((s, i) => slideFrames(s, i, n))).toEqual(doc.slides.map((s, i) => slideFrames(s, i, n)));
  });

  it("gives a generated deck's slides entrances, and a still deck none", () => {
    const doc = deck();
    const moving = doc.slides.map((s) => movingFrames(entrancesFor(s, "entrances")));
    expect(moving.every((m) => m > 0)).toBe(true);
    expect(doc.slides.map((s) => movingFrames(entrancesFor(s, "none")))).toEqual(doc.slides.map(() => 0));
    // Moving frames never outrun the hold: the plan caps them.
    const plan = planVideo(doc.slides.map((s, i) => slideFrames(s, i, doc.slides.length)), "push", moving);
    for (const s of plan.slides) expect(s.moving).toBeLessThanOrEqual(s.frames - s.out);
  });
});
