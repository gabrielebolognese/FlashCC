import { describe, expect, it } from "vitest";

import { insertBlock } from "./blockplace.js";
import { buildSlides } from "./compositions.js";
import { stampFurniture } from "./furniture.js";
import { makeDoc, makeLayer, type Doc } from "./model.js";
import { stepLayout, textsOf } from "./regenerate.js";
import { styleById } from "./styles.js";
import { deckFromTemplate, placeholderTexts, reapplyTemplate, templateFrom, type Template } from "./templates.js";

const THEME = styleById("ink").theme;
const SEVEN = [
  "Seven slides about cutting.",
  "Cut on movement\nNot on the beat.",
  "Hold the first frame\nLonger than feels right.",
  "Kill the filler\nEvery shot earns its place.",
  "Match the energy\nThe speaker sets the pace.",
  "Mute and check\nIf it works silent, it works.",
  "Follow for more editing notes",
];

const source = (): Doc => {
  let doc: Doc = { ...makeDoc("Source"), styleId: "ink", slides: buildSlides(SEVEN, THEME, undefined, { images: false }) };
  doc = stepLayout(doc, 2, 1, THEME).doc;
  doc.slides[3] = { ...doc.slides[3]!, background: "#223344" };
  doc.slides[4]!.layers.push({ ...makeLayer("ellipse", { x: 800, y: 100, w: 120, h: 120 }, "#ff0066"), name: "Dot", handEdited: true });
  const r = insertBlock(doc, 5, "stat", { value: "73%", label: "watch to the end" }, { theme: THEME }, "here", () => "blk1");
  if (r.ok) doc = r.doc;
  return stampFurniture(doc, "minimal", { name: "Ada", handles: {} });
};

const brief = [
  "A different deck, from a new brief.",
  "First\nThe first point.",
  "Second\nThe second point.",
  "Third\nThe third point.",
  "Fourth\nThe fourth point.",
  "Fifth\nThe fifth point.",
  "Save this.",
];

describe("saved templates (25.5)", () => {
  it("captures the structure and not the words, unless asked", () => {
    const t = templateFrom(source(), "Seven");
    expect(t.slides).toHaveLength(7);
    expect(t.example).toBeUndefined();
    expect(JSON.stringify(t)).not.toContain("Cut on movement");
    expect(JSON.stringify(t)).not.toContain("73%");
    expect(t.furniture).toBe("minimal");
    expect(t.slides[4]!.decor.map((l) => l.name)).toEqual(["Dot"]);
    const kept = templateFrom(source(), "Seven", { keepExample: true });
    expect(kept.example).toEqual(textsOf(source()));
    expect(placeholderTexts(kept)).toEqual(textsOf(source()));
  });

  it("done-when: a template from a 7-slide deck makes, from a new brief, a 7-slide deck with the same composition per position", () => {
    const src = source();
    const t = templateFrom(src, "Seven");
    const made = deckFromTemplate(t, { theme: THEME, texts: brief });
    expect(made.slides).toHaveLength(7);
    expect(made.slides.map((s) => s.composition)).toEqual(src.slides.map((s) => s.composition));
    expect(textsOf(made)).toEqual(brief);
    expect(made.slides[3]!.background).toBe("#223344");
    expect(made.slides[4]!.layers.some((l) => l.name === "Dot")).toBe(true);
    expect(made.slides[5]!.blocks?.[0]?.block).toBe("stat");
    expect(made.furniture?.set).toBe("minimal");
    expect(made.template).toBe(t.id);
  });

  it("done-when: changing the template afterwards leaves that deck untouched", () => {
    const t = templateFrom(source(), "Seven");
    const made = deckFromTemplate(t, { theme: THEME, texts: brief });
    const before = JSON.stringify(made);
    const changed: Template = { ...t, slides: t.slides.map((s) => ({ ...s, background: "#000000", composition: "card" })) };
    deckFromTemplate(changed, { theme: THEME, texts: brief });
    expect(JSON.stringify(made)).toBe(before);
  });

  it("re-apply is the explicit way in: by position, the words and hand edits stay", () => {
    const t = templateFrom(source(), "Seven");
    const made = deckFromTemplate(t, { theme: THEME, texts: brief });
    made.slides[1]!.layers.push({ ...makeLayer("rect", { x: 10, y: 10, w: 50, h: 50 }, "#00ff00"), name: "Mine", handEdited: true });
    const changed: Template = { ...t, slides: t.slides.map((s, i) => (i === 1 ? { ...s, background: "#335577", composition: "card" } : s)) };
    const out = reapplyTemplate(made, changed, { theme: THEME });
    expect(textsOf(out)).toEqual(brief);
    expect(out.slides[1]!.background).toBe("#335577");
    expect(out.slides[1]!.composition).toBe("card");
    expect(out.slides[1]!.layers.some((l) => l.name === "Mine")).toBe(true);
    expect(out.slides[0]).toEqual(made.slides[0]);
  });

  it("never keeps a picture's file", () => {
    const doc = source();
    doc.slides[2]!.layers.push({ ...makeLayer("image", { x: 0, y: 0, w: 2160, h: 1350 }, "#000"), src: "data:image/png;base64,AAAA", spanId: "s1", name: "Strip" });
    const t = templateFrom(doc, "x");
    expect(JSON.stringify(t)).not.toContain("base64,AAAA");
  });
});
