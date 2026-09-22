import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { makeDoc, type Doc } from "./model.js";
import { THEMES } from "./presets.js";
import {
  applyFilters,
  facetsOf,
  isUnfiled,
  isUnnamed,
  matchesQuery,
  MAX_BLOB,
  nameFromDoc,
  nameFromHook,
  NO_FILTERS,
  searchBlob,
  type Filters,
} from "./search.js";
import type { DocSummary } from "./storage.js";

const doc = (patch: Partial<Doc> = {}): Doc => ({
  ...makeDoc("Why your edits drag"),
  slides: buildSlides(["Why do your edits feel slow?", "Because the pacing never lands."], THEMES.ink!),
  framework: "problem",
  styleId: "ink",
  ...patch,
});

const sum = (patch: Partial<DocSummary> = {}): DocSummary => ({
  id: "d1",
  name: "Why your edits drag",
  updatedAt: "2026-09-01T00:00:00.000Z",
  slideCount: 6,
  background: "#12161c",
  width: 1080,
  height: 1350,
  search: "why your edits drag why do your edits feel slow",
  framework: "problem",
  styleId: "ink",
  ...patch,
});

const filters = (patch: Partial<Filters> = {}): Filters => ({ ...NO_FILTERS, ...patch });

describe("the search blob", () => {
  it("carries the copy off the slides, not just the name", () => {
    const blob = searchBlob(doc());
    expect(blob).toContain("pacing");
  });

  it("includes the framework and style by their real names", () => {
    const blob = searchBlob(doc());
    expect(blob).toContain("problem");
    expect(blob).toContain("ink");
  });

  it("is lowercased, so matching never has to care", () => {
    expect(searchBlob(doc({ name: "SHOUTING TITLE" }))).toContain("shouting title");
  });

  /** Fifty documents share one localStorage quota with the media pool. */
  it("is capped so a long deck cannot bloat the index", () => {
    const huge = doc({
      slides: buildSlides(Array.from({ length: 30 }, () => "word ".repeat(200)), THEMES.ink!),
    });
    expect(searchBlob(huge).length).toBeLessThanOrEqual(MAX_BLOB);
  });

  it("survives a document with no slides", () => {
    expect(() => searchBlob({ ...makeDoc("Empty"), slides: [] })).not.toThrow();
  });
});

describe("matching", () => {
  it("finds a phrase that only appears deep in the deck", () => {
    expect(matchesQuery(searchBlob(doc()), "pacing")).toBe(true);
  });

  /** Two words returning everything matching either is a broken search box. */
  it("requires every word, in any order", () => {
    const blob = "why do your edits feel slow";
    expect(matchesQuery(blob, "edits slow")).toBe(true);
    expect(matchesQuery(blob, "slow edits")).toBe(true);
    expect(matchesQuery(blob, "edits thumbnails")).toBe(false);
  });

  it("treats an empty query as no filter at all", () => {
    expect(matchesQuery("anything", "")).toBe(true);
    expect(matchesQuery("anything", "   ")).toBe(true);
  });

  it("ignores case and extra whitespace in the query", () => {
    expect(matchesQuery("why your edits drag", "  EDITS   drag ")).toBe(true);
  });
});

describe("filtering", () => {
  it("matches on copy through the summary blob", () => {
    expect(applyFilters([sum()], filters({ query: "slow" }))).toHaveLength(1);
    expect(applyFilters([sum()], filters({ query: "thumbnails" }))).toHaveLength(0);
  });

  /**
   * Summaries written before the blob existed have no `search`. Falling back to
   * the name means old work degrades to name-only search instead of vanishing.
   */
  it("falls back to the name when a summary predates the blob", () => {
    const old = sum({ search: undefined });
    expect(applyFilters([old], filters({ query: "edits" }))).toHaveLength(1);
    expect(applyFilters([old], filters({ query: "pacing" }))).toHaveLength(0);
  });

  it("filters by framework, style and format", () => {
    const docs = [sum(), sum({ id: "d2", framework: "showcase", styleId: "paper", height: 1080 })];
    expect(applyFilters(docs, filters({ framework: "showcase" }))).toHaveLength(1);
    expect(applyFilters(docs, filters({ style: "ink" }))).toHaveLength(1);
    expect(applyFilters(docs, filters({ format: "1080x1080" }))).toHaveLength(1);
  });

  it("combines a query with a facet rather than choosing between them", () => {
    const docs = [sum(), sum({ id: "d2", framework: "showcase" })];
    expect(applyFilters(docs, filters({ query: "edits", framework: "showcase" }))).toHaveLength(1);
    expect(applyFilters(docs, filters({ query: "nothing", framework: "showcase" }))).toHaveLength(0);
  });
});

describe("archive", () => {
  /** Archived work is still yours; it is just not what you are looking at. */
  it("is hidden from every scope except its own", () => {
    // d2 is archived AND unfiled, so the unfiled scope is the real test: being
    // unfiled must not drag archived work back into view.
    const docs = [sum(), sum({ id: "d2", archived: true })];
    expect(applyFilters(docs, filters()).map((d) => d.id)).toEqual(["d1"]);
    expect(applyFilters(docs, filters({ scope: "unfiled" })).map((d) => d.id)).toEqual(["d1"]);
    expect(applyFilters(docs, filters({ scope: "archived" })).map((d) => d.id)).toEqual(["d2"]);
  });

  it("stays hidden even when it matches the query", () => {
    const docs = [sum({ id: "d2", archived: true })];
    expect(applyFilters(docs, filters({ query: "edits" }))).toHaveLength(0);
  });
});

describe("unfiled", () => {
  it("counts a document with no group", () => {
    expect(isUnfiled(sum())).toBe(true);
    expect(isUnfiled(sum({ group: "Client work" }))).toBe(false);
  });

  /** A filed document the app named itself is still lost work. */
  it("counts a filed document the app named itself", () => {
    expect(isUnfiled(sum({ group: "Client work", name: "Untitled" }))).toBe(true);
  });

  it("knows which names were chosen and which were defaults", () => {
    expect(isUnnamed("Untitled")).toBe(true);
    expect(isUnnamed("  blank  ")).toBe(true);
    expect(isUnnamed("Why your edits drag")).toBe(false);
  });
});

describe("published", () => {
  const ctx = { publishedIds: new Set(["d1"]) };

  it("splits what went out from what did not", () => {
    const docs = [sum(), sum({ id: "d2" })];
    expect(applyFilters(docs, filters({ published: "yes" }), ctx).map((d) => d.id)).toEqual(["d1"]);
    expect(applyFilters(docs, filters({ published: "no" }), ctx).map((d) => d.id)).toEqual(["d2"]);
  });

  it("ignores the split unless asked", () => {
    expect(applyFilters([sum(), sum({ id: "d2" })], filters(), ctx)).toHaveLength(2);
  });
});

describe("facets", () => {
  const docs = [
    sum(),
    sum({ id: "d2", framework: "problem" }),
    sum({ id: "d3", framework: "showcase", styleId: "paper" }),
    sum({ id: "d4", archived: true, framework: "story" }),
  ];

  it("counts what is there and names it properly", () => {
    const f = facetsOf(docs);
    const problem = f.frameworks.find((x) => x.id === "problem");
    expect(problem?.count).toBe(2);
    expect(problem?.label).toContain("Problem");
  });

  it("orders by how much there is", () => {
    expect(facetsOf(docs).frameworks[0]?.id).toBe("problem");
  });

  /**
   * Counted over the active set, not the filtered one. A facet reading "3" that
   * then shows one result is a bug report, not a feature.
   */
  it("leaves archived work out of the live counts but counts it separately", () => {
    const f = facetsOf(docs);
    expect(f.frameworks.some((x) => x.id === "story")).toBe(false);
    expect(f.archived).toBe(1);
  });

  it("labels formats the way the format picker does", () => {
    expect(facetsOf([sum()]).formats[0]?.label).toBe("4:5");
  });

  it("reports nothing rather than throwing on an empty library", () => {
    const f = facetsOf([]);
    expect(f.frameworks).toEqual([]);
    expect(f.unfiled).toBe(0);
  });
});

describe("naming", () => {
  it("takes the hook as the name", () => {
    expect(nameFromHook("Why do your edits feel slow?")).toBe("Why do your edits feel slow");
  });

  /** The old version sliced at 40 characters and left names cut mid-word. */
  it("cuts at a word boundary, never mid-word", () => {
    const name = nameFromHook("Stop editing your videos like it is still two thousand and fifteen");
    expect(name.length).toBeLessThanOrEqual(48);
    expect(name.endsWith(" ")).toBe(false);
    expect(/\w$/.test(name)).toBe(true);
    expect("Stop editing your videos like it is still two thousand and fifteen").toContain(name);
  });

  it("drops trailing punctuation left by the cut", () => {
    expect(nameFromHook("Three things, and a fourth,")).toBe("Three things, and a fourth");
  });

  it("falls back rather than producing an empty name", () => {
    expect(nameFromHook("")).toBe("Untitled");
    expect(nameFromHook("   ")).toBe("Untitled");
    expect(nameFromHook("...")).toBe("Untitled");
  });

  it("handles a single very long word without producing nothing", () => {
    expect(nameFromHook("a".repeat(120)).length).toBe(48);
  });

  it("reads the first real text layer off a document", () => {
    expect(nameFromDoc(doc())).toContain("edits");
  });

  it("gives an empty document a name rather than throwing", () => {
    expect(nameFromDoc({ ...makeDoc(), slides: [] })).toBe("Untitled");
  });
});
