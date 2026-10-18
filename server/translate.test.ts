import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { withContentRetry } from "./checks.js";
import { assembleTranslate, TRANSLATE_SYSTEM } from "./prompts.js";
import { finish, prepare } from "./translate.js";

const DECK = ["3 cuts that keep people watching", "Cut on the beat. FlashCC does it in 2 clicks.", "Follow @maya_edits"];

/** What a well-behaved model returns for the German deck: tokens kept, numbers untouched. */
function german(units: { text: string }[]): { n: number; text: string }[] {
  const words: Record<string, string> = {
    "⟦0⟧ cuts that keep people watching": "⟦0⟧ Schnitte, bei denen alle dranbleiben",
    "Cut on the beat. ⟦0⟧ does it in ⟦1⟧ clicks.": "Schneide auf den Beat. ⟦0⟧ macht das in ⟦1⟧ Klicks.",
    "Follow ⟦0⟧": "Folge ⟦0⟧",
  };
  return units.map((u, i) => ({ n: i + 1, text: words[u.text] ?? u.text }));
}

describe("preparing a deck", () => {
  it("masks every unit, slides first, then fields", () => {
    const p = prepare(DECK, ["The first one that felt like us."], { keep: ["FlashCC"] });
    expect(p.units.map((u) => u.kind)).toEqual(["slide", "slide", "slide", "field"]);
    expect(p.units[1]!.text).toBe("Cut on the beat. ⟦0⟧ does it in ⟦1⟧ clicks.");
    expect(p.units.map((u) => u.text).join(" ")).not.toMatch(/FlashCC|@maya_edits|\b3\b|\b2\b/);
  });
});

describe("finishing a translation", () => {
  const p = prepare(DECK, [], { keep: ["FlashCC"] });

  it("restores every token and finds nothing wrong with a good answer", () => {
    const { texts, findings } = finish(german(p.units), p, "de");
    expect(texts).toEqual([
      "3 Schnitte, bei denen alle dranbleiben",
      "Schneide auf den Beat. FlashCC macht das in 2 Klicks.",
      "Folge @maya_edits",
    ]);
    expect(findings).toEqual([]);
  });

  it("aligns by number, not by position", () => {
    const out = german(p.units).reverse();
    expect(finish(out, p, "de").texts[0]).toBe("3 Schnitte, bei denen alle dranbleiben");
  });

  it("repairs house punctuation while the masks still stand", () => {
    const out = german(p.units);
    out[1] = { n: 2, text: "Schneide auf den Beat \u2014 ⟦0⟧ macht das in ⟦1⟧ Klicks." };
    expect(finish(out, p, "de").texts[1]).toBe("Schneide auf den Beat, FlashCC macht das in 2 Klicks.");
  });

  it("retries a missing unit, an untranslated one, a placeholder and a dropped term", () => {
    const out = [
      { n: 1, text: "⟦0⟧ cuts that keep people watching" },
      { n: 2, text: "[Übersetzung] ⟦1⟧ Klicks." },
    ];
    const codes = finish(out, p, "de").findings.map((f) => `${f.at}:${f.tier}:${f.code}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        "0:retry:translate-untranslated",
        "1:retry:translate-placeholder",
        "1:retry:translate-term-missing",
        "2:retry:translate-missing",
      ]),
    );
  });

  it("retries a unit far longer than its source", () => {
    const out = german(p.units);
    out[2] = { n: 3, text: `Folge ⟦0⟧ ${"und noch viel mehr ".repeat(10)}` };
    expect(finish(out, p, "de").findings.map((f) => f.code)).toContain("translate-too-long");
  });

  it("flags a number that differs, and never corrects it", () => {
    const out = german(p.units);
    // The model wrote a number of its own instead of the token.
    out[1] = { n: 2, text: "Schneide auf den Beat. ⟦0⟧ macht das in 3 Klicks." };
    const { texts, findings } = finish(out, p, "de");
    expect(texts[1]).toBe("Schneide auf den Beat. FlashCC macht das in 3 Klicks.");
    const number = findings.find((f) => f.code === "translate-number");
    expect(number).toMatchObject({ at: 1, tier: "flag" });
    expect(number!.message).toContain("2 is missing");
    expect(number!.message).toContain("3 was added");
  });

  it("accepts the target's own numerals as the same number", () => {
    const q = prepare(["Grew 61,000 followers"], []);
    const { findings } = finish([{ n: 1, text: "نما إلى ٦١٬٠٠٠ متابع" }], q, "ar");
    // The token was dropped (a retry), but the number itself is the same, so no flag.
    expect(findings.map((f) => f.code)).toEqual(["translate-token-missing"]);
  });

  it("restores a fixed rendering on every slide", () => {
    const q = prepare(["Start a swipe file.", "Your swipe file grows."], [], { glossary: [{ term: "swipe file", rendering: "Ideensammlung" }] });
    const { texts } = finish(
      [
        { n: 1, text: "Lege eine ⟦0⟧ an." },
        { n: 2, text: "Deine ⟦0⟧ wächst." },
      ],
      q,
      "de",
    );
    expect(texts).toEqual(["Lege eine Ideensammlung an.", "Deine Ideensammlung wächst."]);
  });

  it("keeps no more emphasis marks than the source had", () => {
    const q = prepare(["Cut on the *beat*"], []);
    const { texts } = finish([{ n: 1, text: "Schneide *auf* den *Beat*" }], q, "de");
    expect(texts[0]).toBe("Schneide *auf* den Beat");
  });

  it("is one retry at most, and keeps the better answer", async () => {
    let calls = 0;
    const result = await withContentRetry<ReturnType<typeof finish>>(
      async (retry) => {
        calls += 1;
        const units = retry ? german(p.units) : [{ n: 1, text: "⟦0⟧ cuts that keep people watching" }];
        return finish(units, p, "de");
      },
      (r) => r.findings,
    );
    expect(calls).toBe(2);
    expect(result.retried).toBe(true);
    expect(result.findings).toEqual([]);
  });
});

describe("the prompt", () => {
  it("is cached whole in the system block and tags every unit", () => {
    const p = prepare(DECK, ["Their words"], { keep: ["FlashCC"] });
    const { system, user } = assembleTranslate({ units: p.units, language: "German (Deutsch)" });
    expect(system).toBe(TRANSLATE_SYSTEM);
    expect(user).toContain("Translate into German (Deutsch).");
    expect(user).toContain("Return exactly 4, numbered 1 to 4.");
    expect(user).toContain('<unit n="4" kind="field">\nTheir words\n</unit>');
    expect(user).not.toContain("voice");
  });
  it("carries a voice when there is one", () => {
    const { user } = assembleTranslate({ units: [{ kind: "slide", text: "Hi there" }], language: "French (Français)", voice: { tone: "Blunt" } });
    expect(user).toContain("How they describe it: Blunt");
  });
  it("never asks for an em dash", () => {
    expect(TRANSLATE_SYSTEM).not.toMatch(/\u2014/);
  });
});

describe("the gate (29.6)", () => {
  const source = readFileSync(join("server", "translate.ts"), "utf8");
  // The comments explain why there are no credits; the code must not have any.
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  it("is Pro, with an abuse ceiling, and counts nothing a person can see", () => {
    expect(source).toMatch(/requirePro\(bearer\(req\), "Translation"\)/);
    expect(source).toMatch(/rateLimit\(`translate:\$\{caller\.id\}`/);
    expect(code).not.toMatch(/credit|remaining|quota/i);
  });
  it("asks for server-side refusal fallbacks in the scalar form, with its own header", () => {
    expect(source).toContain('fallbacks: "default"');
    expect(source).toContain('"server-side-fallback-2026-07-01"');
  });
});
