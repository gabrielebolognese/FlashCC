import { describe, expect, it } from "vitest";

import { ideaFromSelection, importIdeas, mapIdeaColumns, outlineFromText, readHandoff, sourceFromText } from "./fileimport.js";
import { parseOutline } from "./outline.js";

describe("the extension's hand-off (31.4)", () => {
  it("reads an idea or a source, and ignores anything else", () => {
    expect(readHandoff("#send=idea&text=Cut%20on%20the%20beat")).toEqual({ kind: "idea", text: "Cut on the beat" });
    expect(readHandoff("#send=distil&text=Long%20source")).toEqual({ kind: "distil", text: "Long source" });
    expect(readHandoff("#send=publish&text=x")).toBeNull();
    expect(readHandoff("#send=idea&text=%20")).toBeNull();
    expect(readHandoff("")).toBeNull();
  });
  it("caps what it takes", () => {
    expect(readHandoff(`#send=idea&text=${"a".repeat(5000)}`)!.text).toHaveLength(2000);
  });
  it("makes the selection's first line the idea and keeps the rest as notes", () => {
    expect(ideaFromSelection("  Why cuts land late\nBecause the beat is early.\n")).toEqual({ line: "Why cuts land late", notes: "Why cuts land late\nBecause the beat is early." });
    expect(ideaFromSelection("One line")).toEqual({ line: "One line", notes: "" });
    expect(ideaFromSelection(`${"word ".repeat(60)}`).line.length).toBeLessThanOrEqual(141);
  });
});

describe("ideas from a CSV (31.5)", () => {
  const csv = `Name,Description,Category,Client\nCut on the beat,Why late cuts feel late,Editing,Acme\nThe hook,,Growth,Nobody Inc\n,,,\nPricing myths,Three of them,editing,`;
  const existing = { pillars: ["Editing", "Craft"], clients: [{ id: "c1", name: "Acme" }] };

  it("reads Notion's and Airtable's headers without being told", () => {
    expect(mapIdeaColumns(["Name", "Description", "Category", "Client"])).toEqual({ title: 0, notes: 1, pillar: 2, client: 3 });
  });

  it("matches pillars and clients that exist, names the rest, and never creates one", () => {
    const r = importIdeas(csv, existing);
    expect(r.ideas).toEqual([
      { title: "Cut on the beat", notes: "Why late cuts feel late", pillar: "Editing", clientId: "c1" },
      { title: "The hook", notes: "", pillar: "" },
      { title: "Pricing myths", notes: "Three of them", pillar: "Editing" },
    ]);
    expect(r.unknownPillars).toEqual(["Growth"]);
    expect(r.unknownClients).toEqual(["Nobody Inc"]);
  });

  it("follows a mapping the person changed", () => {
    const r = importIdeas(csv, existing, { title: 1 });
    expect(r.ideas.map((i) => i.title)).toEqual(["Why late cuts feel late", "Three of them"]);
    expect(r.skipped).toBe(1);
  });
});

describe("a text or Markdown file (31.5)", () => {
  it("turns headings into slides and lists into body lines", () => {
    const md = "---\ntitle: x\n---\n# Why carousels lose people\nIntro line.\n\n## One idea per slide\n- Two sentences is two slides\n- Cut the rest\n\n<!-- note -->\n## End on one ask";
    const outline = outlineFromText(md);
    expect(parseOutline(outline).map((s) => [s.head, s.body])).toEqual([
      ["Why carousels lose people", ["Intro line."]],
      ["One idea per slide", ["Two sentences is two slides", "Cut the rest"]],
      ["End on one ask", []],
    ]);
  });
  it("gives each paragraph of plain text a slide, its first sentence the headline", () => {
    const outline = outlineFromText("Cut on the beat. It reads as intent.\n\nHold the last frame");
    expect(parseOutline(outline).map((s) => [s.head, s.body])).toEqual([
      ["Cut on the beat.", ["It reads as intent."]],
      ["Hold the last frame", []],
    ]);
  });
  it("hands distil the words, front matter and comments gone", () => {
    expect(sourceFromText("---\na: b\n---\nHello <!-- hidden -->world")).toBe("Hello world");
  });
});
