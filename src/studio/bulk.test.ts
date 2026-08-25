import { describe, expect, it } from "vitest";

import { buildDocs, countSlides, parseBulk, SAMPLE_BULK } from "./bulk.js";
import { STRUCTURES } from "./structures.js";
import { STYLES } from "./styles.js";

const theme = STYLES[0]!.theme;
const problem = STRUCTURES[0]!;
const H = 1350;

describe("parseBulk", () => {
  it("splits carousels on a dashed line and slides on blank lines", () => {
    const blocks = parseBulk("A\n\nB\n\nC\n---\nD\n\nE");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.texts).toEqual(["A", "B", "C"]);
    expect(blocks[1]?.texts).toEqual(["D", "E"]);
  });

  it("accepts more than three dashes, and surrounding spaces", () => {
    expect(parseBulk("A\n-----\nB")).toHaveLength(2);
    expect(parseBulk("A\n   ---   \nB")).toHaveLength(2);
  });

  it("does not split on a dash that is part of a sentence", () => {
    expect(parseBulk("A --- B")).toHaveLength(1);
    expect(parseBulk("Cut on motion - not on beat")).toHaveLength(1);
  });

  it("names each carousel from its own first line", () => {
    const blocks = parseBulk("The hook line\nsecond line\n\nBody\n---\nAnother hook\n\nBody");
    expect(blocks[0]?.title).toBe("The hook line");
    expect(blocks[1]?.title).toBe("Another hook");
  });

  it("drops empty blocks rather than making blank carousels", () => {
    expect(parseBulk("---\n\n---\n\nA\n---\n   \n---")).toHaveLength(1);
    expect(parseBulk("")).toHaveLength(0);
    expect(parseBulk("   \n\n  ")).toHaveLength(0);
  });

  it("handles CRLF", () => {
    expect(parseBulk("A\r\n\r\nB\r\n---\r\nC")).toHaveLength(2);
  });

  it("counts slides across the batch", () => {
    expect(countSlides(parseBulk("A\n\nB\n---\nC"))).toBe(3);
  });

  it("reads the shipped example as two carousels", () => {
    const blocks = parseBulk(SAMPLE_BULK);
    expect(blocks).toHaveLength(2);
    expect(countSlides(blocks)).toBeGreaterThan(6);
  });
});

describe("buildDocs", () => {
  const blocks = parseBulk(SAMPLE_BULK);

  it("makes one document per block", () => {
    const docs = buildDocs(blocks, problem, theme);
    expect(docs).toHaveLength(blocks.length);
    docs.forEach((d, i) => expect(d.slides).toHaveLength(blocks[i]!.texts.length));
  });

  it("gives every document its own id", () => {
    const docs = buildDocs(blocks, problem, theme);
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
  });

  it("names each from its own first line", () => {
    const docs = buildDocs(blocks, problem, theme);
    docs.forEach((d, i) => expect(d.name).toBe(blocks[i]!.title));
  });

  it("applies the group to all of them, and omits it when blank", () => {
    expect(buildDocs(blocks, problem, theme, {}, "March").every((d) => d.group === "March")).toBe(true);
    expect(buildDocs(blocks, problem, theme).every((d) => d.group === undefined)).toBe(true);
  });

  it("applies the same style to every document", () => {
    for (const d of buildDocs(blocks, problem, theme)) {
      for (const s of d.slides) expect(s.background).toBe(theme.bg);
    }
  });

  it("honours build options across the batch", () => {
    const noPics = buildDocs(blocks, problem, theme, { images: false, decor: 0 });
    for (const d of noPics) {
      for (const s of d.slides) {
        expect(s.layers.some((l) => l.kind === "image")).toBe(false);
        expect(s.layers.some((l) => l.kind === "rect" && l.name !== "Block")).toBe(false);
      }
    }
  });

  it("never overflows, even when a block has more slides than the framework has slots", () => {
    const long = parseBulk(Array.from({ length: 14 }, (_, i) => `Slide ${i} text here`).join("\n\n"));
    for (const d of buildDocs(long, problem, theme)) {
      expect(d.slides.length).toBe(14);
      for (const s of d.slides) {
        for (const l of s.layers) expect(l.y + l.h).toBeLessThanOrEqual(H + 0.5);
      }
    }
  });

  it("works with every framework", () => {
    for (const structure of STRUCTURES) {
      const docs = buildDocs(blocks, structure, theme);
      expect(docs.length, structure.name).toBe(blocks.length);
      for (const d of docs) expect(d.slides.length).toBeGreaterThan(0);
    }
  });
});
