import { describe, expect, it } from "vitest";

import { arrangementsFor, BLOCK_ARRANGEMENTS, insertBlock } from "./blockplace.js";
import { BLOCKS } from "./blocks.js";
import { buildSlides, ringFor } from "./compositions.js";
import { makeDoc, type Doc } from "./model.js";
import { platformById, type PlatformId } from "./platforms.js";
import { preflight } from "./preflight.js";
import { regenerate, shuffleRhythm, stepLayout, textsOf } from "./regenerate.js";
import { styleById } from "./styles.js";

const COPY = [
  "Your edits feel mechanical. Here is why.",
  "You cut on the beat\nThe beat is the most predictable moment in the track, so the cut lands where everybody expects it.",
  "Cut on movement instead",
  "Follow for more editing notes",
];

const deck = (style = "ink"): Doc => ({ ...makeDoc("Test"), styleId: style, slides: buildSlides(COPY, styleById(style).theme, undefined, { images: false }) });

const signature = (doc: Doc, i: number) =>
  doc.slides[i]!.layers.map((l) => `${l.name}@${Math.round(l.x)},${Math.round(l.y)},${Math.round(l.w)}`).join("+");

/** Pre-flight problems on one slide that a layout could cause. */
const problems = (doc: Doc, i: number, platform: string) =>
  preflight(doc, platformById(platform as PlatformId)!)
    .filter((f) => f.slide === i + 1 && ["text-overflows", "outside-safe-zone", "type-too-small"].includes(f.code))
    .map((f) => `${f.code}: ${f.message}`);

describe("layouts you cycle (25.2 done-when)", () => {
  for (const style of ["ink", "terminal", "editorial"]) {
    for (const platform of ["linkedin", "instagram"]) {
      it(`${style} on ${platform}: a headline-and-body slide cycles through at least six distinct layouts, none overflowing, all inside the safe zone`, () => {
        let doc = deck(style);
        const ring = ringFor("body");
        const seen = new Set<string>();
        for (let k = 0; k < ring.length; k += 1) {
          doc = stepLayout(doc, 1, 1, styleById(style).theme).doc;
          expect(textsOf(doc)[1]).toBe(COPY[1]);
          expect(problems(doc, 1, platform), `${doc.slides[1]!.composition}`).toEqual([]);
          seen.add(signature(doc, 1));
        }
        expect(seen.size).toBeGreaterThanOrEqual(6);
      });
    }
  }

  it("a headline-only slide has at least six too, and never lands on a layout built for a body", () => {
    let doc = deck();
    const seen = new Set<string>();
    for (let k = 0; k < ringFor("head").length; k += 1) {
      doc = stepLayout(doc, 2, 1, styleById("ink").theme).doc;
      expect(["heading-body", "kicker", "top-bottom"]).not.toContain(doc.slides[2]!.composition);
      expect(problems(doc, 2, "linkedin")).toEqual([]);
      seen.add(signature(doc, 2));
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it("L three times and Shift+L three times comes back to where it started", () => {
    const start = deck();
    let doc = start;
    for (let k = 0; k < 3; k += 1) doc = stepLayout(doc, 1, 1, styleById("ink").theme).doc;
    for (let k = 0; k < 3; k += 1) doc = stepLayout(doc, 1, -1, styleById("ink").theme).doc;
    expect(doc.slides[1]!.composition).toBe(start.slides[1]!.composition);
  });
});

describe("a slide holding a block (25.2)", () => {
  const withBlock = (id: string): Doc => {
    const base = { ...deck(), slides: [deck().slides[0]!, { ...deck().slides[2]!, layers: deck().slides[2]!.layers }] };
    const block = BLOCKS.find((b) => b.id === id)!;
    const r = insertBlock(base, 1, id, block.defaults, { theme: styleById("ink").theme }, "new", () => "blk1");
    if (!r.ok) throw new Error(`no room for ${id}`);
    return r.doc;
  };

  it("the common blocks get six arrangements each", () => {
    for (const id of ["stat", "quote", "checklist", "steps", "compare", "question"]) {
      expect(arrangementsFor(id, { w: 1080, h: 1350 }), id).toEqual([...BLOCK_ARRANGEMENTS]);
    }
  });

  it("cycles the block and its words, keeps the block, and comes back to the start", () => {
    let doc = withBlock("stat");
    const i = doc.slides.findIndex((s) => s.blocks?.length);
    const instance = doc.slides[i]!.blocks![0]!.instance;
    const seen = new Set<string>();
    for (let k = 0; k < BLOCK_ARRANGEMENTS.length; k += 1) {
      doc = stepLayout(doc, i, 1, styleById("ink").theme).doc;
      expect(doc.slides[i]!.blocks![0]!.instance).toBe(instance);
      expect(problems(doc, i, "linkedin")).toEqual([]);
      seen.add(doc.slides[i]!.blocks![0]!.box.y + ":" + doc.slides[i]!.blocks![0]!.box.h);
    }
    expect(seen.size).toBe(BLOCK_ARRANGEMENTS.length);
    expect(doc.slides[i]!.composition).toBe(BLOCK_ARRANGEMENTS.at(-1));
  });
});

describe("reading a slide's words back", () => {
  it("leaves out the numbered layout's numeral, which is decoration, not copy", () => {
    let doc = deck();
    while (doc.slides[1]!.composition !== "numbered") doc = stepLayout(doc, 1, 1, styleById("ink").theme).doc;
    expect(doc.slides[1]!.layers.some((l) => l.name === "Number")).toBe(true);
    expect(textsOf(doc)[1]).toBe(COPY[1]);
  });
});

describe("Shuffle rhythm (25.2)", () => {
  const long = [
    "A hook that earns the swipe.",
    "First point\nWith a body under it.",
    "Second point\nWith a body under it too.",
    "Third point, a single line.",
    "Fourth point\nAnd its body.",
    "Follow for more.",
  ];
  const six = (): Doc => ({ ...makeDoc("Six"), styleId: "ink", slides: buildSlides(long, styleById("ink").theme) });
  const rhythm = (d: Doc) => d.slides.map((s) => s.composition).join(",");

  it("re-runs the cycle from another offset: the words stay, the rhythm changes, and it is remembered", () => {
    const doc = six();
    const once = shuffleRhythm(doc, styleById("ink").theme).doc;
    expect(textsOf(once)).toEqual(textsOf(doc));
    expect(rhythm(once)).not.toBe(rhythm(doc));
    expect(once.rhythmShift).toBe(1);
    // A later Re-lay keeps the shuffled rhythm rather than snapping back.
    expect(rhythm(regenerate(once, styleById("ink").theme).doc)).toBe(rhythm(once));
    expect(shuffleRhythm(once, styleById("ink").theme).doc.rhythmShift).toBe(2);
  });

  it("the cover and the close keep their jobs", () => {
    const once = shuffleRhythm(six(), styleById("ink").theme).doc;
    expect(once.slides[0]!.composition).toBe("title");
    expect(once.slides.at(-1)!.composition).toBe("block");
  });
});
