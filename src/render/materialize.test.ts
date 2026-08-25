import { describe, expect, it } from "vitest";

import { defaultBrandKit } from "../doc/defaults.js";
import { specimen } from "../doc/specimens.js";
import { ANCHORED, BLANK, STARTERS } from "../doc/templates/starters.js";
import type { Element, Slide } from "../doc/types.js";
import { FORMATS } from "./layout/node.js";
import { elementsToNodes, materialize, syncTextToElements } from "./materialize.js";

const brand = defaultBrandKit();
const format = FORMATS["portrait-4x5"]!;

describe("materialize", () => {
  it("turns every template's output into free elements", () => {
    for (const template of STARTERS) {
      const { elements } = materialize(specimen("body", "typical"), template, brand, format, 2);
      expect(elements.length, template.name).toBeGreaterThan(0);
      for (const el of elements) {
        // Fractions, never pixels — that is what survives a format change.
        expect(el.x).toBeGreaterThan(-1);
        expect(el.x).toBeLessThan(2);
        expect(el.w).toBeGreaterThan(0);
        expect(el.w).toBeLessThanOrEqual(2);
        expect(Number.isFinite(el.z)).toBe(true);
      }
    }
  });

  it("marks template output as template-seeded, so the UI can tell", () => {
    const { elements } = materialize(specimen("cover", "typical"), ANCHORED, brand, format, 1);
    expect(elements.every((e) => e.fromTemplate === true)).toBe(true);
  });

  it("links text elements back to their block, so the list stays in sync", () => {
    const slide = specimen("body", "typical");
    const { elements } = materialize(slide, ANCHORED, brand, format, 2);
    const linked = elements.filter((e) => e.kind === "text" && e.blockId);
    expect(linked.length).toBeGreaterThan(0);
    for (const el of linked) {
      expect(slide.blocks.some((b) => b.id === el.blockId)).toBe(true);
    }
  });

  it("gives the Blank template an all-but-empty canvas", () => {
    const anchored = materialize(specimen("cover", "typical"), ANCHORED, brand, format, 1);
    const blank = materialize(specimen("cover", "typical"), BLANK, brand, format, 1);
    expect(blank.elements.length).toBeLessThan(anchored.elements.length);
  });

  it("carries a background colour out of the template", () => {
    const { background } = materialize(specimen("cover", "typical"), ANCHORED, brand, format, 1);
    expect(background).toMatch(/^#/);
  });
});

describe("elementsToNodes", () => {
  const els: Element[] = [
    { id: "a", kind: "text", x: 0.1, y: 0.2, w: 0.5, h: 0.1, z: 1, colour: "#fff", text: "hi", fontSize: 40 },
    { id: "b", kind: "shape", x: 0.5, y: 0.5, w: 0.2, h: 0.2, z: 0, colour: "#f00", shape: "ellipse", filled: true },
  ];

  it("puts the background first and paints in z order", () => {
    const nodes = elementsToNodes(els, format, "#000000");
    expect(nodes[0]?.band).toBe("background");
    const ids = nodes.slice(1).map((n) => n.id);
    expect(ids).toEqual(["b", "a"]);
  });

  it("resolves fractions against the format", () => {
    const portrait = elementsToNodes(els, format, "#000").find((n) => n.id === "a")!;
    const square = elementsToNodes(els, FORMATS["square-1x1"]!, "#000").find((n) => n.id === "a")!;
    expect(portrait.x).toBeCloseTo(0.1 * format.w);
    expect(square.x).toBeCloseTo(0.1 * FORMATS["square-1x1"]!.w);
    expect(portrait.y).not.toBeCloseTo(square.y);
  });

  it("round-trips a materialised slide without losing elements", () => {
    const { elements, background } = materialize(specimen("list", "typical"), ANCHORED, brand, format, 3);
    const nodes = elementsToNodes(elements, format, background);
    expect(nodes).toHaveLength(elements.length + 1);
  });

  it("makes every element selectable by carrying its id", () => {
    const nodes = elementsToNodes(els, format, "#000").filter((n) => n.band !== "background");
    expect(nodes.every((n) => n.overlayId)).toBe(true);
  });
});

describe("syncTextToElements", () => {
  it("pushes edited block text onto the element that came from it", () => {
    const base = specimen("body", "typical");
    const { elements } = materialize(base, ANCHORED, brand, format, 2);
    const firstBlock = base.blocks[0]!;
    const slide: Slide = {
      ...base,
      elements,
      blocks: base.blocks.map((b) => (b.id === firstBlock.id && b.type !== "list" ? { ...b, text: "CHANGED" } : b)),
    };
    const synced = syncTextToElements(slide);
    const el = synced.find((e) => e.blockId === firstBlock.id);
    expect(el?.text).toBe("CHANGED");
  });

  it("leaves hand-placed elements alone", () => {
    const base = specimen("body", "typical");
    const hand: Element = {
      id: "hand", kind: "text", x: 0.1, y: 0.1, w: 0.2, h: 0.1, z: 9, colour: "#fff", text: "mine",
    };
    const synced = syncTextToElements({ ...base, elements: [hand] });
    expect(synced[0]?.text).toBe("mine");
  });
});
