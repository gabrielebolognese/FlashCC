import { describe, expect, it } from "vitest";

import { buildDocs } from "./bulk.js";
import { STRUCTURES } from "./structures.js";
import { STYLES } from "./styles.js";

const theme = STYLES[0]!.theme;
const problem = STRUCTURES[0]!;
const H = 1350;

/**
 * Blocks used to come from the `---` parser deleted in Batch 16. They were only
 * ever texts, so the tests make them directly.
 */
const block = (...texts: string[]) => ({ texts, title: texts[0] });

describe("buildDocs", () => {
  const blocks = [
    block("Your videos feel boring. Here's why.", "You cut on the beat.", "Save this."),
    block("Stop designing first.", "Write the words, then lay them out.", "Try it once."),
  ];

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
    const long = [block(...Array.from({ length: 14 }, (_, i) => `Slide ${i} text here`))];
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
