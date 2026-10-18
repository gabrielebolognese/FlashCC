import { describe, expect, it } from "vitest";

import { HONEST_BLANK } from "./honesty.js";
import {
  ceilingOf,
  glossaryFor,
  glossaryText,
  parseGlossary,
  LANGUAGES,
  mask,
  numberDrift,
  numbersIn,
  overCeiling,
  placeholderIn,
  tidyGlossary,
  translationLabel,
  unmask,
  untranslated,
  westernDigits,
} from "./languages.js";

describe("the language table", () => {
  it("has unique codes and a label word for every language", () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const l of LANGUAGES) expect(l.translation.trim()).not.toBe("");
  });
  it("marks Arabic and Hebrew right to left, and nothing else", () => {
    expect(LANGUAGES.filter((l) => l.rtl).map((l) => l.code).sort()).toEqual(["ar", "he"]);
  });
  it("labels a translation in the language itself", () => {
    expect(translationLabel("de")).toBe("(Übersetzung)");
    expect(translationLabel("ja")).toBe("（翻訳）");
  });
});

describe("masking", () => {
  it("hides names, handles, links, code and numbers, and puts them back", () => {
    const text = "FlashCC grew @maya_edits to 61,000 followers. See flashcc.app/start or `npm run dev`.";
    const m = mask(text, { keep: ["FlashCC"] });
    expect(m.text).not.toMatch(/FlashCC|@maya_edits|61,000|flashcc\.app|npm run dev/);
    expect(m.tokens.map((t) => t.kind).sort()).toEqual(["code", "handle", "link", "name", "number"]);
    expect(unmask(m.text, m.tokens)).toEqual({ text, missing: [], unknown: [] });
  });

  it("keeps a link's trailing full stop outside the link", () => {
    const m = mask("Read https://example.com/a.");
    expect(m.text).toBe("Read ⟦0⟧.");
    expect(m.tokens[0]!.value).toBe("https://example.com/a");
  });

  it("masks a glossary term as a whole word, longest first, and restores a fixed rendering", () => {
    const m = mask("Clip Studio Pro beats Clip. Clipboard stays.", {
      glossary: [{ term: "Clip" }, { term: "Clip Studio Pro", rendering: "Clip Studio Pro DE" }],
    });
    expect(m.text).toBe("⟦0⟧ beats ⟦1⟧. Clipboard stays.");
    expect(unmask(m.text, m.tokens).text).toBe("Clip Studio Pro DE beats Clip. Clipboard stays.");
  });

  it("masks a term written in a script without spaces wherever it appears", () => {
    const m = mask("新しいフラッシュ機能", { glossary: [{ term: "フラッシュ" }] });
    expect(m.text).toBe("新しい⟦0⟧機能");
  });

  it("never masks inside a token already placed", () => {
    const m = mask("Visit https://a.io/2025 in 2025");
    expect(m.tokens).toEqual([
      { kind: "link", value: "https://a.io/2025" },
      { kind: "number", value: "2025" },
    ]);
  });

  it("keeps the honesty rule's blank as it is", () => {
    const m = mask(`Result: ${HONEST_BLANK}`);
    expect(m.tokens[0]).toEqual({ kind: "blank", value: HONEST_BLANK });
  });

  it("reports a dropped token and removes one that was never handed out", () => {
    const m = mask("Grew 3x in 2 weeks");
    const back = unmask("Wuchs in ⟦ 1 ⟧ Wochen ⟦7⟧", m.tokens);
    expect(back.text).toBe("Wuchs in 2 Wochen");
    expect(back.missing).toEqual([0]);
    expect(back.unknown).toEqual([7]);
  });
});

describe("numbers, in any numeral system", () => {
  it("normalises Arabic-Indic, Persian, full-width and Devanagari digits", () => {
    expect(westernDigits("١٢٣ ۴۵۶ ７８９ ०१")).toBe("123 456 789 01");
  });
  it("compares the digits with the separators gone", () => {
    expect(numbersIn("1,200 and 3.5")).toEqual(["1200", "35"]);
    expect(numbersIn("١٬٢٠٠")).toEqual(["1200"]);
    // French groups with a narrow no-break space; a plain space separates two numbers.
    expect(numbersIn("1\u202f200")).toEqual(["1200"]);
    expect(numbersIn("1 200")).toEqual(["1", "200"]);
  });
  it("finds a number missing, a number added, and nothing when they match", () => {
    expect(numberDrift("3 rules, 61,000 views", "٣ قواعد، 61.000 مشاهدة")).toEqual({ missing: [], added: [] });
    expect(numberDrift("3 rules, 61,000 views", "3 Regeln, 16.000 Aufrufe")).toEqual({ missing: ["61000"], added: ["16000"] });
    expect(numberDrift("Day 1, day 1 again", "Tag 1")).toEqual({ missing: ["1"], added: [] });
  });
});

describe("the retry checks", () => {
  it("knows a slide came back in the wrong script", () => {
    expect(untranslated("Cut on the beat", "Cut on the beat", "ja")).toBe(true);
    expect(untranslated("Cut on the beat", "ビートでカット", "ja")).toBe(false);
    expect(untranslated("Cut on the beat", "Schneide auf den Beat", "de")).toBe(false);
    expect(untranslated("Cut on the beat", "Cut on the beat", "de")).toBe(true);
  });
  it("never calls a slide with nothing to translate untranslated", () => {
    expect(untranslated("⟦0⟧ ⟦1⟧", "⟦0⟧ ⟦1⟧", "ja")).toBe(false);
    expect(untranslated("OK", "OK", "de")).toBe(false);
  });
  it("finds a placeholder the source did not have", () => {
    expect(placeholderIn("Hello", "[Übersetzung hier]")).toBe("[Übersetzung hier]");
    expect(placeholderIn("[Label]", "[Label]")).toBeNull();
    expect(placeholderIn("Hello", "TODO")).toBe("TODO");
  });
  it("calls a translation more than twice as long over its ceiling", () => {
    const src = "A".repeat(100);
    expect(ceilingOf(src)).toBe(200);
    expect(overCeiling(src, "B".repeat(201))).toBe(true);
    expect(overCeiling("Hi", "B".repeat(60))).toBe(false);
  });
});

describe("the glossary", () => {
  it("is trimmed, deduplicated case aside, and drops renderings for unknown languages", () => {
    expect(
      tidyGlossary([
        { term: " FlashCC " },
        { term: "flashcc" },
        { term: "Swipe file", renderings: { de: " Ideensammlung ", xx: "nope", fr: "" } },
        { term: "" },
      ]),
    ).toEqual([{ term: "FlashCC" }, { term: "Swipe file", renderings: { de: "Ideensammlung" } }]);
  });
  it("gives one call its target's rendering and nothing for the others", () => {
    const g = [{ term: "Swipe file", renderings: { de: "Ideensammlung" } }];
    expect(glossaryFor(g, "de")).toEqual([{ term: "Swipe file", rendering: "Ideensammlung" }]);
    expect(glossaryFor(g, "fr")).toEqual([{ term: "Swipe file" }]);
  });
});

describe("the glossary as typed", () => {
  it("reads a term alone as never translated, and code: rendering pairs as fixed", () => {
    expect(parseGlossary("FlashCC\nSwipe file | de: Ideensammlung | fr: fichier d'idées | zz: no\n\n")).toEqual([
      { term: "FlashCC" },
      { term: "Swipe file", renderings: { de: "Ideensammlung", fr: "fichier d'idées" } },
    ]);
  });
  it("writes back what it reads", () => {
    const text = "FlashCC\nSwipe file | de: Ideensammlung";
    expect(glossaryText(parseGlossary(text))).toBe(text);
  });
});
