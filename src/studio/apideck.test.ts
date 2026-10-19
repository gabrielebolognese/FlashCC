import { describe, expect, it } from "vitest";

import { catalogue, deckFromIdea, deckFromInput, draftStructure, InputError, wordsOf } from "./apideck.js";
import { slideCopy } from "./regenerate.js";

const article = `# Why most carousels lose people on slide two

Your hook makes a promise. Slide two has to keep it in the first five words, or the swipe stops there. Most decks spend slide two on context nobody asked for.

Cut every slide to one idea. If a slide needs two sentences to make its point, it is two slides, and the reader feels the difference long before they can name it.

Put the number first. A figure on the cover outperforms a topic because it is a promise with a shape. Then keep it: the slide after the cover is where the number is explained.

End on one ask. A carousel that asks for a follow, a save and a comment gets none of them.`;

describe("/v1/decks, the splitter (31.3)", () => {
  it("lays out one string per slide in a framework and a look", () => {
    const out = deckFromInput({ slides: ["The hook", "Point one. With a reason.", "Point two.", "Follow for more"], framework: "educational", look: "pack:kitchen", platform: "instagram" });
    expect(out.slides).toBe(4);
    expect(out.document.framework).toBe("educational");
    expect(out.document.styleId).toBe("pack:kitchen");
    expect(out.document.slides.map(slideCopy)[0]).toContain("The hook");
  });

  it("splits long-form text into slides deterministically, no key", () => {
    const a = deckFromInput({ text: article });
    const b = deckFromInput({ text: article });
    expect(a.slides).toBeGreaterThanOrEqual(3);
    expect(a.document.slides.map(slideCopy)).toEqual(b.document.slides.map(slideCopy));
    expect(slideCopy(a.document.slides[0]!)).toContain("Why most carousels lose people");
  });

  it("fits a deck to the platform's artboard and safe area", () => {
    const out = deckFromInput({ slides: ["Hook", "Body"], platform: "tiktok" });
    expect([out.document.width, out.document.height]).toEqual([1080, 1920]);
  });

  it("refuses what it cannot make, as an input error", () => {
    expect(() => deckFromInput({ slides: ["a"], framework: "nope" })).toThrow(InputError);
    expect(() => deckFromInput({ slides: ["a"], look: "nope" })).toThrow(/Unknown look/);
    expect(() => deckFromInput({ slides: ["a"], platform: "myspace" })).toThrow(/Unknown platform/);
    expect(() => wordsOf({})).toThrow(/slides.*or.*text/);
    expect(() => wordsOf({ slides: ["x".repeat(601)] })).toThrow(/send long text as "text"/);
  });

  it("lists what a caller may name", () => {
    const c = catalogue();
    expect(c.frameworks.length).toBe(16);
    expect(c.looks.some((l) => l.id.startsWith("pack:"))).toBe(true);
    expect(c.platforms.map((p) => p.id)).toContain("linkedin");
  });
});

describe("/v1/runs without drafting", () => {
  it("puts the idea on the cover of the framework's own words", () => {
    const out = deckFromIdea("Three edits that keep people watching", { framework: "educational" });
    expect(slideCopy(out.document.slides[0]!)).toContain("Three edits that keep people watching");
    expect(out.framework).toBe("educational");
  });
  it("asks the drafting route for the framework's slots, in its shape", () => {
    const ask = draftStructure("An idea", "educational");
    expect(ask.structure.slots.length).toBeGreaterThan(2);
    expect(ask.structure.slots[0]).toHaveProperty("note");
  });
});
