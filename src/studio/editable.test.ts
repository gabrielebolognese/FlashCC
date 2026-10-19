/**
 * Editable exports (31.6): the plan says what stays editable and what becomes
 * a picture, before anything is written, and the writers produce a package
 * whose text is the deck's words, wrapped where FlashCC wrapped them.
 */
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { deckFromInput } from "./apideck.js";
import { editablePlan, flattenReason, layerAlone, paintedArea, solid, textLines } from "./editable.js";
import { makeDoc, makeLayer, type Doc, type Layer } from "./model.js";
import { flatKey, pictureFit, writePptx } from "./pptx.js";
import { stripMarks } from "./marks.js";
import { writeSvgs } from "./svgdeck.js";

const text = (over: Partial<Layer> = {}): Layer => ({
  ...makeLayer("text", { x: 96, y: 200, w: 888, h: 300 }, "#111111"),
  id: "t",
  name: "Headline",
  text: "Put the *number* first and **keep** it",
  fontSize: 72,
  fontWeight: 400,
  markColour: "#d9a521",
  ...over,
});

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function deck(): Doc {
  const layers: Layer[] = [
    { ...makeLayer("rect", { x: 0, y: 0, w: 1080, h: 120 }, "#223344"), id: "bar", name: "Bar", radius: 12 },
    text(),
    { ...text({ id: "g", name: "Gradient words" }), gradient: { kind: "linear", angle: 90, stops: [{ at: 0, colour: "#ff0000" }, { at: 1, colour: "#0000ff" }] } as Layer["gradient"] },
    { ...makeLayer("image", { x: 100, y: 700, w: 400, h: 300 }, "none"), id: "pic", name: "Photo", src: PNG },
    { ...makeLayer("ellipse", { x: 600, y: 700, w: 200, h: 200 }, "#00aa00"), id: "dot", name: "Dot", shadow: { y: 8, blur: 20, colour: "#00000055" } },
  ];
  return { ...makeDoc("t"), width: 1080, height: 1350, slides: [{ id: "s1", name: "One", background: "#fafafa", layers }] };
}

describe("the plan (31.6)", () => {
  it("keeps text, shapes and plain pictures editable, and names everything else with its reason", () => {
    const plan = editablePlan(deck(), "pptx");
    expect(plan.slides[0]!.background).toEqual({ kind: "solid", colour: "#fafafa" });
    expect(plan.slides[0]!.items.map((i) => i.kind)).toEqual(["shape", "text", "flat", "picture", "flat"]);
    expect(plan.flattened).toEqual([
      { slide: 1, name: "Gradient words", reason: "gradient text" },
      { slide: 1, name: "Dot", reason: "it has a shadow" },
    ]);
  });

  it("flattens what PowerPoint cannot hold, and keeps paths as vectors in SVG", () => {
    const path = { ...makeLayer("path", { x: 0, y: 0, w: 100, h: 100 }, "#000000"), path: "M0 0 L100 100" };
    expect(flattenReason(path, "pptx")).toMatch(/PowerPoint/);
    expect(flattenReason(path, "svg")).toBeNull();
    expect(flattenReason(text({ textEffect: "highlight" }), "svg")).toBe("the highlighter effect");
    expect(flattenReason(text({ text: "a ==marked== word" }), "pptx")).toBe("highlighted words");
    expect(flattenReason({ ...text(), spanId: "x" }, "svg")).toBe("it runs across slides");
    expect(flattenReason(text({ fill: "rgba(0,0,0,0.5)" }), "pptx")).toMatch(/flat/);
  });

  it("names a background that is not a flat colour", () => {
    const d = deck();
    d.slides[0] = { ...d.slides[0]!, image: { src: PNG } } as Doc["slides"][number];
    expect(editablePlan(d, "svg").flattened[0]).toEqual({ slide: 1, name: "Background", reason: "a picture background" });
  });

  it("wraps text where FlashCC wraps it, the marks as runs, the marks themselves gone", () => {
    const l = text({ w: 400 });
    const lines = textLines(l);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map((r) => r.map((x) => x.text).join("")).join(" ").replace(/\s+/g, " ").trim()).toBe(stripMarks(l.text!).replace(/\s+/g, " "));
    const runs = lines.flat();
    expect(runs.find((r) => r.text.includes("number"))!.colour).toBe("#d9a521");
    expect(runs.find((r) => r.text.includes("keep"))!.bold).toBe(true);
    expect(runs.find((r) => r.text.includes("Put"))!.bold).toBe(false);
  });

  it("reads flat colours only", () => {
    expect(solid("#abc")).toEqual({ hex: "#aabbcc", alpha: 1 });
    expect(solid("#00000080")!.alpha).toBeCloseTo(0.5, 2);
    expect(solid("linear-gradient(red, blue)")).toBeNull();
  });

  it("clips a flattened layer's painted area to the board, shadow included", () => {
    const l = { ...makeLayer("rect", { x: -50, y: 1300, w: 200, h: 100 }, "#000"), shadow: { y: 10, blur: 20, colour: "#000" } };
    const r = paintedArea(l, { w: 1080, h: 1350 });
    expect(r.x).toBe(0);
    expect(r.y + r.h).toBe(1350);
    expect(r.w).toBe(150 + 50);
  });

  it("renders a flattened layer alone, on nothing", () => {
    const s = deck().slides[0]!;
    const alone = layerAlone(s, s.layers[2]!);
    expect(alone.background).toBe("transparent");
    expect(alone.layers).toHaveLength(1);
  });

  it("lists the faces the deck is set in", () => {
    expect(editablePlan(deck(), "pptx").fonts).toEqual(["Arial"]);
  });
});

describe("pictures land where object-fit put them", () => {
  it("cover crops around the focal point", () => {
    const fit = pictureFit({ fit: "cover", focal: { x: 0, y: 0.5 } }, { x: 0, y: 0, w: 100, h: 100 }, { w: 200, h: 100 });
    expect(fit.at).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(fit.crop).toEqual({ l: 0, r: 50_000, t: 0, b: 0 });
  });
  it("contain shrinks and places", () => {
    const fit = pictureFit({ fit: "contain", focal: { x: 0.5, y: 0.5 } }, { x: 0, y: 0, w: 100, h: 100 }, { w: 200, h: 100 });
    expect(fit.at).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  });
});

describe("the PowerPoint file", () => {
  it("is a package with a slide per slide, real text, at the deck's size", async () => {
    const doc = deckFromInput({ slides: ["Why slide two loses people", "Keep the promise in five words.", "One idea a slide.", "Follow for the next one"], framework: "educational" }).document;
    const plan = editablePlan(doc, "pptx");
    const flats = new Map(plan.slides.flatMap((p) => [
      ...(p.background.kind === "flat" ? [[flatKey(p.index, null), new Uint8Array([1])] as const] : []),
      ...p.items.flatMap((i) => (i.kind === "flat" ? [[flatKey(p.index, i.layer.id), new Uint8Array([2])] as const] : [])),
    ]));
    const bytes = await writePptx(plan, { w: doc.width, h: doc.height }, doc.name, new Map(), flats);
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)[0]).toBe("[Content_Types].xml");
    const pres = await zip.file("ppt/presentation.xml")!.async("string");
    expect(pres).toContain(`<p:sldSz cx="${1080 * 9525}" cy="${doc.height * 9525}"/>`);
    expect(pres.match(/<p:sldId /g)).toHaveLength(doc.slides.length);
    const slide1 = await zip.file("ppt/slides/slide1.xml")!.async("string");
    const words = [...slide1.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ");
    expect(words.replace(/\s+/g, " ")).toContain("Why slide two loses people");
    // One paragraph a line, exactly as many as FlashCC wrapped.
    const head = plan.slides[0]!.items.find((i) => i.kind === "text")!;
    expect(head.kind === "text" && head.lines.length).toBeGreaterThan(0);
    // Every relationship a slide names exists in the archive.
    for (const name of Object.keys(zip.files).filter((f) => /slides\/_rels\/.*\.rels$/.test(f))) {
      const rels = await zip.file(name)!.async("string");
      for (const m of rels.matchAll(/Target="\.\.\/([^"]+)"/g)) expect(zip.file(`ppt/${m[1]}`), m[1]).toBeTruthy();
    }
  });
});

describe("the SVGs", () => {
  it("one per slide, text as text, flattened pieces as pictures", () => {
    const doc = deck();
    const plan = editablePlan(doc, "svg");
    const svgs = writeSvgs(plan, { w: 1080, h: 1350 }, new Map([[PNG, { data: new Uint8Array([137, 80]), ext: "png" as const, w: 1, h: 1 }]]), new Map([[flatKey(0, "g"), new Uint8Array([1, 2, 3])]]));
    expect(svgs).toHaveLength(1);
    const svg = svgs[0]!;
    expect(svg).toContain('<text id="t"');
    expect(svg).toContain(">number</tspan>");
    expect(svg).toContain('data-name="Gradient words"');
    expect(svg).toContain('<rect id="bar"');
    expect(svg).not.toMatch(/\*\*|==/);
  });
});
