import { describe, expect, it } from "vitest";

import { ctaBlanks, ctaLines, CTAS } from "./ctas.js";
import { blanksOf, fillFormula, HOOK_FORMULAS, HOOK_KINDS, isFilled } from "./hooks.js";

describe("hook formulas (25.3)", () => {
  it("about thirty, every kind represented, unique ids", () => {
    expect(HOOK_FORMULAS.length).toBeGreaterThanOrEqual(28);
    expect(new Set(HOOK_FORMULAS.map((h) => h.id)).size).toBe(HOOK_FORMULAS.length);
    for (const k of HOOK_KINDS) expect(HOOK_FORMULAS.filter((h) => h.kind === k.id).length, k.id).toBeGreaterThanOrEqual(5);
  });

  it("are listed by kind and carry nothing that ranks them", () => {
    for (const h of HOOK_FORMULAS) expect(Object.keys(h).sort()).toEqual(["id", "kind", "template"]);
    for (const h of HOOK_FORMULAS) expect(h.template).not.toMatch(/\u2014/);
  });

  it("every formula has at least one blank and fits a hook once filled with short words", () => {
    for (const h of HOOK_FORMULAS) {
      const blanks = blanksOf(h.template);
      expect(blanks.length, h.id).toBeGreaterThan(0);
      const filled = fillFormula(h.template, Object.fromEntries(blanks.map((b) => [b, "word"])));
      expect(isFilled(filled), h.id).toBe(true);
      expect(filled.length, h.id).toBeLessThanOrEqual(90);
    }
  });

  it("fills blanks, capitalises one that starts the line, and leaves an empty one showing", () => {
    expect(fillFormula("Stop [doing the common thing].", { "doing the common thing": "cutting on the beat" })).toBe("Stop cutting on the beat.");
    expect(fillFormula("[Number] [things] nobody tells you about [topic].", { number: "5", things: "edits", topic: "pacing" })).toBe(
      "5 edits nobody tells you about pacing.",
    );
    expect(fillFormula("[Topic] is not about [what people think].", { topic: "editing" })).toBe("Editing is not about [what people think].");
    expect(blanksOf("I [did X] for [time]. [Time] later, [did X] again.")).toEqual(["did X", "time"]);
  });
});

describe("calls to action by goal (25.4)", () => {
  it("covers the goals the roadmap lists", () => {
    expect(CTAS.map((c) => c.id)).toEqual(
      expect.arrayContaining(["follow", "save", "share", "comment-keyword", "dm-keyword", "link", "newsletter", "book-call", "part-two"]),
    );
  });

  it("words the same ask the way each platform says it", () => {
    expect(ctaLines("share", "linkedin").join(" ")).toMatch(/repost/i);
    expect(ctaLines("share", "instagram").join(" ")).toMatch(/share/i);
    expect(ctaLines("link", "linkedin").join(" ")).not.toMatch(/bio/i);
    expect(ctaLines("link", "instagram").join(" ")).toMatch(/bio/i);
  });

  it("fills a keyword and leaves a missing blank showing", () => {
    const lines = ctaLines("comment-keyword", "instagram", { keyword: "GUIDE", thing: "checklist" });
    expect(lines[0]).toBe("Comment GUIDE and I will send you the checklist.");
    expect(ctaLines("comment-keyword", "instagram")[0]).toContain("[keyword]");
    expect(ctaBlanks("comment-keyword")).toEqual(["keyword", "thing"]);
  });

  it("no wording uses an em dash or claims a result", () => {
    for (const c of CTAS) for (const l of Object.values(c.lines).flat()) {
      expect(l).not.toMatch(/\u2014/);
      expect(l).not.toMatch(/\d+%|guaranteed|best/i);
    }
  });
});
