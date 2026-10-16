import { describe, expect, it } from "vitest";

import { buildSlides, cycleCompositionAt, ringFor, shapeOfText, stepComposition } from "./compositions.js";
import { insertBlock } from "./blockplace.js";
import { makeDoc, makeLayer, type Doc, type Layer } from "./model.js";
import { applyOutline, blockLine, parseBlockLine, parseOutline, planOutline, toOutline } from "./outline.js";
import { stepLayout, textsOf, typeSlide } from "./regenerate.js";
import { styleById } from "./styles.js";

const THEME = styleById("ink").theme;
const COPY = [
  "Your edits feel mechanical. Here is why.",
  "You cut on the beat\nThe beat is the most predictable moment in the track.",
  "Cut on movement instead\nA hand leaving frame. A door closing.",
  "Hold the cut a frame longer\nIt lets the eye land before the next shot.",
  "Follow for more editing notes",
];

const deck = (): Doc => ({ ...makeDoc("Test"), styleId: "ink", slides: buildSlides(COPY, THEME, undefined, { images: false }) });

const CTX = { theme: THEME };
let n = 0;
const make = () => `blk${(n += 1)}`;

const apply = (doc: Doc, text: string) => applyOutline(doc, text, THEME, CTX, make);

describe("outline text", () => {
  it("writes each slide as a # headline and its body lines", () => {
    const text = toOutline(deck());
    expect(text.split("\n").slice(0, 4)).toEqual([
      "# Your edits feel mechanical. Here is why.",
      "# You cut on the beat",
      "The beat is the most predictable moment in the track.",
      "# Cut on movement instead",
    ]);
  });

  it("reads back what it wrote", () => {
    const doc = deck();
    const parsed = parseOutline(toOutline(doc));
    expect(parsed).toHaveLength(doc.slides.length);
    expect(parsed.map((s) => [s.head, ...s.body].join("\n"))).toEqual(textsOf(doc));
  });

  it("starts a slide at every # and never at a blank line", () => {
    const parsed = parseOutline("# One\nfirst\n\nstill one\n#Two is not a heading\n# Two");
    expect(parsed.map((s) => s.head)).toEqual(["One", "Two"]);
    expect(parsed[0]!.body).toEqual(["first", "still one", "#Two is not a heading"]);
  });

  it("keeps emphasis marks as typed", () => {
    expect(parseOutline("# A *mechanical* cut")[0]!.head).toBe("A *mechanical* cut");
  });

  it("an unchanged outline changes nothing", () => {
    const doc = deck();
    const r = apply(doc, toOutline(doc));
    expect(r.doc).toBe(doc);
    expect(r.changed).toEqual([]);
  });

  it("an empty outline changes nothing: clearing the box does not delete the deck", () => {
    const doc = deck();
    expect(apply(doc, "  \n").doc).toBe(doc);
  });
});

describe("matching slides", () => {
  it("same count: slide for slide, by position", () => {
    const doc = deck();
    const lines = toOutline(doc).replace("# You cut on the beat", "# You cut on the downbeat");
    const plan = planOutline(doc, parseOutline(lines));
    expect(plan.structural).toBe(false);
    expect(plan.rows.map((r) => r.changed)).toEqual([false, true, false, false, false]);
  });

  it("a # added in the middle: the unchanged slides are found, the new one is new", () => {
    const doc = deck();
    const lines = toOutline(doc).replace("# Cut on movement instead", "# A new point\nWith a body.\n# Cut on movement instead");
    const plan = planOutline(doc, parseOutline(lines));
    expect(plan.structural).toBe(true);
    expect(plan.rows.map((r) => r.from)).toEqual([0, 1, null, 2, 3, 4]);
    expect(plan.rows.map((r) => r.changed)).toEqual([false, false, true, false, false, false]);
  });

  it("a slide deleted is removed, not merged into its neighbour", () => {
    const doc = deck();
    const text = toOutline(doc)
      .split("\n")
      .filter((l) => !l.startsWith("# Cut on movement") && !l.startsWith("A hand leaving"))
      .join("\n");
    const plan = planOutline(doc, parseOutline(text));
    expect(plan.removed).toEqual([2]);
    expect(plan.rows.map((r) => r.from)).toEqual([0, 1, 3, 4]);
  });
});

describe("applying an outline (24.1 done-when)", () => {
  it("rewrites three slides and adds a fourth, keeping every hand-moved layer where it was", () => {
    const doc = deck();
    // A layer the user drew on slide 2, and slide 4 left untouched to compare.
    const drawn: Layer = { ...makeLayer("rect", { x: 700, y: 900, w: 200, h: 200 }, "#ff00ff"), name: "Mine", handEdited: true };
    doc.slides[1]!.layers.push(drawn);
    const untouched = doc.slides[3]!;

    const text = toOutline(doc)
      .replace("# Your edits feel mechanical. Here is why.", "# Your cuts feel mechanical. Here is the fix.")
      .replace("The beat is the most predictable moment in the track.", "The beat is the one moment everybody expects.")
      .replace("A hand leaving frame. A door closing.", "A hand leaving frame.\nA door closing.")
      .replace("# Follow for more editing notes", "# One more thing\nCut early, not late.\n# Follow for more editing notes");
    const r = apply(doc, text);

    expect(r.doc.slides).toHaveLength(6);
    expect(textsOf(r.doc)).toEqual([
      "Your cuts feel mechanical. Here is the fix.",
      "You cut on the beat\nThe beat is the one moment everybody expects.",
      "Cut on movement instead\nA hand leaving frame.\nA door closing.",
      "Hold the cut a frame longer\nIt lets the eye land before the next shot.",
      "One more thing\nCut early, not late.",
      "Follow for more editing notes",
    ]);
    // The drawn layer is still on slide 2, exactly where it was.
    expect(r.doc.slides[1]!.layers.find((l) => l.id === drawn.id)).toEqual(drawn);
    // The untouched slide is the same object: nothing about it was rebuilt.
    expect(r.doc.slides[3]).toBe(untouched);
    // Slide ids survive a rewrite, so selection and history still point at them.
    expect(r.doc.slides.slice(0, 4).map((s) => s.id)).toEqual(doc.slides.slice(0, 4).map((s) => s.id));
    expect(r.changed).toEqual([1, 2, 3, 5]);
    expect(r.overflow).toEqual([]);
    expect(r.structural).toBe(true);
  });

  it("writes straight onto a slide whose copy layer the user moved, rather than printing it twice", () => {
    const doc = deck();
    const head = doc.slides[1]!.layers.find((l) => l.kind === "text")!;
    const moved = { ...head, x: head.x + 40, handEdited: true as const };
    doc.slides[1]!.layers = doc.slides[1]!.layers.map((l) => (l.id === head.id ? moved : l));

    const r = apply(doc, toOutline(doc).replace("# You cut on the beat", "# You cut on the downbeat"));
    const texts = r.doc.slides[1]!.layers.filter((l) => l.kind === "text");
    expect(texts.filter((l) => (l.text ?? "").includes("You cut on"))).toHaveLength(1);
    expect(textsOf(r.doc)[1]).toBe("You cut on the downbeat\nThe beat is the most predictable moment in the track.");
    const now = r.doc.slides[1]!.layers.find((l) => l.id === head.id)!;
    expect(now.text?.startsWith("You cut on the downbeat")).toBe(true);
    expect(now.x).toBe(moved.x);
    expect(r.doc.slides[1]!.layers.map((l) => l.id)).toEqual(doc.slides[1]!.layers.map((l) => l.id));
  });

  it("names a slide whose new words no longer fit, rather than splitting it", () => {
    const doc = deck();
    const long = Array.from({ length: 160 }, () => "This sentence keeps going and going.").join(" ");
    const r = apply(doc, toOutline(doc).replace("A hand leaving frame. A door closing.", long));
    expect(r.doc.slides).toHaveLength(doc.slides.length);
    expect(r.overflow).toEqual([3]);
  });
});

describe("blocks in the outline", () => {
  const withStat = (): Doc => {
    const doc = deck();
    const r = insertBlock(doc, 2, "stat", { value: "73%", label: "of buyers decide on the cover" }, CTX, "here", make);
    if (!r.ok) throw new Error("no room");
    return r.doc;
  };

  it("shows a block as one labelled line", () => {
    const doc = withStat();
    const rec = doc.slides[2]!.blocks![0]!;
    expect(toOutline(doc)).toContain(blockLine(rec));
    expect(blockLine(rec)).toMatch(/^\[Big number\] .*73%/);
  });

  it("reads a block line back into fields, keeping the ones it does not mention", () => {
    const doc = withStat();
    const rec = doc.slides[2]!.blocks![0]!;
    const edited = blockLine(rec).replace("73%", "81%");
    expect(parseBlockLine(edited, rec.fields)!.fields).toEqual({ ...rec.fields, value: "81%" });
  });

  it("an edited block line rebuilds that block in place; the slide's words are untouched", () => {
    const doc = withStat();
    const rec = doc.slides[2]!.blocks![0]!;
    const r = apply(doc, toOutline(doc).replace(blockLine(rec), blockLine(rec).replace("73%", "81%")));
    const after = r.doc.slides[2]!;
    expect(after.blocks![0]!.fields.value).toBe("81%");
    expect(after.blocks![0]!.instance).toBe(rec.instance);
    expect(after.layers.some((l) => l.block && (l.text ?? "").includes("81%"))).toBe(true);
    expect(textsOf(r.doc)[2]).toBe(textsOf(doc)[2]);
  });

  it("deleting a block line removes the block and its layers", () => {
    const doc = withStat();
    const rec = doc.slides[2]!.blocks![0]!;
    const r = apply(doc, toOutline(doc).replace(`\n${blockLine(rec)}`, ""));
    expect(r.doc.slides[2]!.blocks ?? []).toEqual([]);
    expect(r.doc.slides[2]!.layers.some((l) => l.block?.instance === rec.instance)).toBe(false);
  });
});

describe("the next layout, L (24.3)", () => {
  it("steps through a fixed ring and comes back to the start; Shift+L walks it backwards", () => {
    let doc = deck();
    const start = doc.slides[1]!.composition;
    const seen: string[] = [];
    // The ring for a headline-and-body slide (25.2), which this one is.
    const n = ringFor(shapeOfText(textsOf(doc)[1]!)).length;
    expect(ringFor(shapeOfText(textsOf(doc)[1]!))).toContain(start);
    for (let k = 0; k < n; k += 1) {
      doc = stepLayout(doc, 1, 1, THEME).doc;
      seen.push(doc.slides[1]!.composition!);
    }
    expect(seen.at(-1)).toBe(start);
    expect(new Set(seen).size).toBe(n);
    for (let k = 0; k < 3; k += 1) doc = stepLayout(doc, 1, -1, THEME).doc;
    for (let k = 0; k < 3; k += 1) doc = stepLayout(doc, 1, 1, THEME).doc;
    expect(doc.slides[1]!.composition).toBe(start);
  });

  it("keeps the words, the slide's id, and every layer of the user's that is not its words", () => {
    const doc = deck();
    const drawn: Layer = { ...makeLayer("rect", { x: 700, y: 900, w: 200, h: 200 }, "#ff00ff"), name: "Mine", handEdited: true };
    doc.slides[2]!.layers.push(drawn);
    const r = stepLayout(doc, 2, 1, THEME);
    expect(textsOf(r.doc)[2]).toBe(textsOf(doc)[2]);
    expect(r.doc.slides[2]!.id).toBe(doc.slides[2]!.id);
    expect(r.doc.slides[2]!.layers.find((l) => l.id === drawn.id)).toEqual(drawn);
    expect(r.doc.slides[0]).toBe(doc.slides[0]);
  });

  it("re-lays a headline the user moved rather than printing it twice", () => {
    const doc = deck();
    doc.slides[1]!.layers = doc.slides[1]!.layers.map((l) => (l.kind === "text" ? { ...l, x: l.x + 30, handEdited: true } : l));
    const r = stepLayout(doc, 1, 1, THEME);
    const copies = r.doc.slides[1]!.layers.filter((l) => (l.text ?? "").includes("You cut on the beat"));
    expect(copies).toHaveLength(1);
  });
});

describe("a slide typed into existence (24.5)", () => {
  it("adds the line as a headline, laid out by the cycle's composition for that position", () => {
    const doc = deck();
    const r = typeSlide(doc, doc.slides.length, "One more thing", THEME);
    expect(r.doc.slides).toHaveLength(doc.slides.length + 1);
    const added = r.doc.slides.at(-1)!;
    expect(textsOf(r.doc).at(-1)).toBe("One more thing");
    expect(added.composition).toBe(cycleCompositionAt(doc.slides.length, [...textsOf(doc), "One more thing"]));
    // Not the colour block a generated last slide gets: the cycle's, as asked.
    expect(added.composition).not.toBe("block");
    doc.slides.forEach((s, i) => expect(r.doc.slides[i]).toBe(s));
  });
});

describe("L on a slide no generator laid out", () => {
  it("steps from the cycle's composition for its position, not from the title", () => {
    const doc = deck();
    const bare = { ...doc, slides: doc.slides.map((s) => ({ ...s, composition: undefined })) };
    const r = stepLayout(bare, 2, 1, THEME);
    expect(r.doc.slides[2]!.composition).not.toBe("title");
    expect(r.doc.slides[2]!.composition).toBe(stepComposition(cycleCompositionAt(2, textsOf(bare)), 1, shapeOfText(textsOf(bare)[2]!)));
  });
});
