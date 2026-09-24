import { describe, expect, it } from "vitest";

import { mostlyDrafted, pickDecks, toneFrom, type Learned } from "./learn.js";
import type { DocSummary } from "./storage.js";

const deck = (id: string, updatedAt: string, styleId?: string): DocSummary => ({
  id,
  name: id,
  updatedAt,
  slideCount: 8,
  background: "#000000",
  width: 1080,
  height: 1350,
  ...(styleId ? { styleId } : {}),
});

describe("which decks a brand learns from", () => {
  /**
   * A brand's voice learned from another brand's decks is straightforwardly
   * wrong, and `styleId` carries `brand:<id>` so the right ones are knowable.
   */
  it("prefers this brand's own decks", () => {
    const out = pickDecks(
      [
        deck("a", "2026-09-01", "brand:acme"),
        deck("b", "2026-09-02", "brand:other"),
        deck("c", "2026-09-03", "brand:acme"),
        deck("d", "2026-09-04", "brand:acme"),
      ],
      "acme",
    );
    expect(out.scope).toBe("brand");
    expect(out.picked.map((d) => d.id)).toEqual(["d", "c", "a"]);
  });

  /**
   * Strict filtering usually returns nothing: most people have one brand, and
   * everything made before it existed carries a stock style. Reading none is
   * the failure that makes the button look broken.
   */
  it("falls back to everything when the brand has too few of its own", () => {
    const out = pickDecks(
      [deck("a", "2026-09-01", "brand:acme"), deck("b", "2026-09-02", "ink"), deck("c", "2026-09-03")],
      "acme",
    );
    expect(out.scope).toBe("all");
    expect(out.picked).toHaveLength(3);
  });

  it("takes the newest first", () => {
    const out = pickDecks([deck("old", "2026-01-01"), deck("new", "2026-09-09")], "acme");
    expect(out.picked[0]?.id).toBe("new");
  });

  it("stops at the ceiling", () => {
    const many = Array.from({ length: 30 }, (_, i) => deck(`d${i}`, `2026-09-${String(i + 1).padStart(2, "0")}`));
    expect(pickDecks(many, "acme").picked).toHaveLength(12);
  });

  it("copes with nothing saved at all", () => {
    const out = pickDecks([], "acme");
    expect(out.picked).toEqual([]);
    expect(out.scope).toBe("all");
  });

  /** A stock style is not a brand, and must not be mistaken for one. */
  it("does not treat a stock styleId as a brand", () => {
    const out = pickDecks([deck("a", "2026-09-01", "ink"), deck("b", "2026-09-02", "sunset")], "ink");
    expect(out.scope).toBe("all");
  });
});

describe("whether these decks were written by a model", () => {
  it("warns when more than half have no hand edits", () => {
    expect(mostlyDrafted([0, 0, 0, 4])).toBe(true);
    expect(mostlyDrafted([0, 0, 3])).toBe(true);
  });

  it("stays quiet when half or fewer are untouched", () => {
    expect(mostlyDrafted([0, 0, 3, 7])).toBe(false);
    expect(mostlyDrafted([2, 5, 9])).toBe(false);
  });

  it("says nothing about nothing", () => {
    expect(mostlyDrafted([])).toBe(false);
  });
});

describe("the tone that actually gets written", () => {
  const learned: Learned = {
    tone: "Blunt, short sentences, no throat-clearing.",
    avoid: [],
    observed: [
      { trait: "Short sentences", evidence: "Cut on movement." },
      { trait: "No hedging", evidence: "It does not work." },
      { trait: "Second person", evidence: "Your edits feel mechanical." },
    ],
  };

  /** The model's own sentence reads better than a list, when it all stands. */
  it("uses the edited tone when every trait is kept", () => {
    expect(toneFrom(learned, [true, true, true], "Blunt and direct.")).toBe("Blunt and direct.");
  });

  /** Unchecking has to change the result, or the checkboxes are theatre. */
  it("rebuilds from the surviving traits once anything is dropped", () => {
    expect(toneFrom(learned, [true, false, true], "Blunt and direct.")).toBe(
      "Short sentences. Second person",
    );
  });

  it("produces nothing when everything is unchecked", () => {
    expect(toneFrom(learned, [false, false, false], "Blunt and direct.")).toBe("");
  });
});
