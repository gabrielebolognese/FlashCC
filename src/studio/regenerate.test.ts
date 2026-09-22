import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { makeDoc, makeLayer, type Doc, type Layer } from "./model.js";
import { styleById } from "./styles.js";
import { handEditedCount, markEdited, mergeRegenerated, regenerate, textsOf } from "./regenerate.js";

const THEME = styleById("ink").theme;
const COPY = ["A hook that earns the swipe.", "Some body copy in the middle.", "Follow for more."];

const deck = (): Doc => ({ ...makeDoc("Test"), styleId: "ink", slides: buildSlides(COPY, THEME) });

const mine = (name = "Mine"): Layer => ({
  ...makeLayer("rect", { x: 40, y: 40, w: 120, h: 120 }, "#ff00ff"),
  name,
  handEdited: true,
});

describe("marking", () => {
  it("flags a layer once and leaves it flagged", () => {
    const l = makeLayer("rect", { x: 0, y: 0, w: 10, h: 10 }, "#fff");
    expect(l.handEdited).toBeUndefined();
    const once = markEdited(l);
    expect(once.handEdited).toBe(true);
    // Already flagged: same object back, so it never churns the history.
    expect(markEdited(once)).toBe(once);
  });

  it("counts across a document", () => {
    const doc = deck();
    expect(handEditedCount(doc)).toBe(0);
    doc.slides[0]!.layers.push(mine());
    expect(handEditedCount(doc)).toBe(1);
  });
});

describe("reading the copy back out", () => {
  it("recovers one entry per slide", () => {
    expect(textsOf(deck())).toHaveLength(3);
  });

  it("keeps the words", () => {
    const out = textsOf(deck()).join(" ");
    for (const word of ["hook", "body", "Follow"]) expect(out).toContain(word);
  });

  it("reassembles a heading and its body largest first", () => {
    const doc = { ...makeDoc(), slides: buildSlides(["The point. And the evidence for it."], THEME) };
    const text = textsOf(doc)[0] ?? "";
    expect(text.indexOf("point")).toBeLessThan(text.indexOf("evidence"));
  });

  it("returns an empty entry for a slide with no copy", () => {
    const doc = { ...makeDoc(), slides: [{ ...deck().slides[0]!, layers: [] }] };
    expect(textsOf(doc)).toEqual([""]);
  });
});

describe("regenerating", () => {
  it("replaces the generated layers", () => {
    const doc = deck();
    const before = doc.slides.flatMap((s) => s.layers).map((l) => l.id);
    const { doc: out, replaced } = regenerate(doc, THEME);

    expect(replaced).toBeGreaterThan(0);
    const after = out.slides.flatMap((s) => s.layers).map((l) => l.id);
    expect(after.some((id) => before.includes(id))).toBe(false);
  });

  /** The whole point: a re-run must not cost you the work you did by hand. */
  it("keeps hand-edited layers", () => {
    const doc = deck();
    doc.slides[1]!.layers.push(mine());

    const { doc: out, kept } = regenerate(doc, THEME);
    expect(kept).toBe(1);
    expect(out.slides[1]?.layers.some((l) => l.name === "Mine")).toBe(true);
  });

  it("keeps them on top, where they were put", () => {
    const doc = deck();
    doc.slides[0]!.layers.push(mine());
    const out = regenerate(doc, THEME).doc;
    const layers = out.slides[0]?.layers ?? [];
    expect(layers[layers.length - 1]?.name).toBe("Mine");
  });

  it("restyles through the new theme", () => {
    const paper = styleById("paper").theme;
    const out = regenerate(deck(), paper).doc;
    for (const slide of out.slides) expect(slide.background).toBe(paper.bg);
  });

  /**
   * A shorter regeneration would otherwise strand hand-edited layers on slides
   * that no longer exist — silently losing exactly the work this protects.
   */
  it("rescues hand edits from slides the regeneration removed", () => {
    const doc = deck();
    doc.slides[2]!.layers.push(mine("Orphan"));

    const shorter = buildSlides(["Only one slide now."], THEME);
    const { doc: out, kept } = mergeRegenerated(doc, shorter);

    expect(out.slides).toHaveLength(1);
    expect(kept).toBe(1);
    expect(out.slides[0]?.layers.some((l) => l.name === "Orphan")).toBe(true);
  });

  it("is a no-op on a document with nothing in it", () => {
    const empty = { ...makeDoc(), slides: [] };
    expect(() => regenerate(empty, THEME)).not.toThrow();
  });
});
