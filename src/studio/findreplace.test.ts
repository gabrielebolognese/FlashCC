import { describe, expect, it } from "vitest";

import { insertBlock } from "./blockplace.js";
import { findAcross, findInDoc, pattern, replaceInDoc } from "./findreplace.js";
import { makeDoc, makeLayer, uid, type Doc, type Layer } from "./model.js";
import { styleById } from "./styles.js";

const THEME = styleById("ink").theme;

const text = (t: string, extra: Partial<Layer> = {}): Layer => ({
  ...makeLayer("text", { x: 96, y: 200, w: 888, h: 200 }, "#ffffff"),
  name: "Text",
  text: t,
  fontSize: 48,
  lineHeight: 1.2,
  ...extra,
});

const deck = (name: string, ...slides: Layer[][]): Doc => ({
  ...makeDoc(name),
  id: uid("d"),
  slides: slides.map((layers, i) => ({ id: `s${i}`, name: `Slide ${i + 1}`, background: "#111111", layers })),
});

const ticked = (ms: { key: string; ticked: boolean }[]) => new Set(ms.filter((m) => m.ticked).map((m) => m.key));

describe("finding", () => {
  it("finds every occurrence, with the slide and a little context", () => {
    const doc = deck("A", [text("FlashCut is fast. FlashCut is cheap.")], [text("Try flashcut today")]);
    const ms = findInDoc(doc, "FlashCut");
    expect(ms.map((m) => [m.slide, m.at, m.found])).toEqual([
      [0, 0, "FlashCut"],
      [0, 18, "FlashCut"],
      [1, 4, "flashcut"],
    ]);
    expect(ms[1]!.before).toBe("FlashCut is fast. ");
  });

  it("can match case and whole words", () => {
    const doc = deck("A", [text("Pro, pro, product, PRO")]);
    expect(findInDoc(doc, "pro", { caseSensitive: true }).length).toBe(2);
    expect(findInDoc(doc, "pro", { wholeWord: true }).length).toBe(3);
    expect(findInDoc(doc, "pro", { wholeWord: true, caseSensitive: true }).length).toBe(1);
  });

  it("treats the query as text, not a pattern", () => {
    expect(pattern("$9.99 (a)")!.test("Now $9.99 (a) only")).toBe(true);
    expect(findInDoc(deck("A", [text("a.b axb")]), "a.b").length).toBe(1);
  });

  it("lists a verbatim quote and a furniture piece, unticked", () => {
    const doc = deck(
      "A",
      [text("Acme changed my life", { verbatim: true })],
      [text("@acme", { furniture: "handle" })],
      [text("Acme does it")],
    );
    const ms = findInDoc(doc, "acme");
    expect(ms.map((m) => m.ticked)).toEqual([false, false, true]);
  });
});

describe("replacing", () => {
  it("replaces only the ticked matches, from the end so offsets hold", () => {
    const doc = deck("A", [text("old one, old two, old three")]);
    const ms = findInDoc(doc, "old");
    const pick = new Set([ms[0]!.key, ms[2]!.key]);
    const r = replaceInDoc(doc, ms, "new", pick);
    expect(r.doc.slides[0]!.layers[0]!.text).toBe("new one, old two, new three");
    expect(r.replaced).toBe(2);
    expect(r.doc.slides[0]!.layers[0]!.handEdited).toBe(true);
  });

  it("ticking a quote's match makes it no longer verbatim", () => {
    const doc = deck("A", [text("Acme changed my life", { verbatim: true })]);
    const ms = findInDoc(doc, "Acme");
    const r = replaceInDoc(doc, ms, "Zeta", new Set([ms[0]!.key]));
    expect(r.doc.slides[0]!.layers[0]!.verbatim).toBeUndefined();
  });

  it("reports a layer that fitted before and does not now", () => {
    const doc = deck("A", [text("X", { h: 60 })], [text("X", { h: 600 })]);
    const ms = findInDoc(doc, "X");
    const long = "A replacement long enough to need several lines in an 888 pixel box at 48 points";
    const r = replaceInDoc(doc, ms, long, ticked(ms));
    expect(r.overflow.map((o) => o.slide)).toEqual([0]);
  });

  it("a match in a block goes into its fields too, so editing the block keeps it", () => {
    const base = deck("A", [text("Intro")]);
    const ins = insertBlock(base, 0, "stat", { value: "73%", label: "of Acme buyers" }, { theme: THEME }, "here", () => "blk1");
    if (!ins.ok) throw new Error("no room");
    const ms = findInDoc(ins.doc, "Acme");
    expect(ms.length).toBeGreaterThan(0);
    const r = replaceInDoc(ins.doc, ms, "Zeta", ticked(ms));
    expect(r.doc.slides[0]!.blocks![0]!.fields.label).toBe("of Zeta buyers");
  });

  it("24.4 done-when: a product renamed across twelve projects changes every match and leaves the rest alone", () => {
    const docs = Array.from({ length: 12 }, (_, i) => deck(`Client ${i}`, [text(`FlashCut ${i} is here`)], [text("Unrelated words")]));
    const ms = findAcross(docs, "FlashCut");
    expect(ms).toHaveLength(12);
    const pick = ticked(ms);
    const out = docs.map((d) => replaceInDoc(d, ms, "CutKit", pick));
    expect(out.every((r) => r.replaced === 1)).toBe(true);
    expect(out.map((r) => r.doc.slides[0]!.layers[0]!.text)).toEqual(docs.map((_, i) => `CutKit ${i} is here`));
    // The untouched slide is the same object.
    out.forEach((r, i) => expect(r.doc.slides[1]).toBe(docs[i]!.slides[1]));
  });
});
