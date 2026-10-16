/**
 * Scripts other than Latin (22.5), one suite each, as the roadmap asks: each
 * script breaks the assumptions of the Latin code in its own way.
 */
import { describe, expect, it } from "vitest";

import { FACES } from "../render/fonts/faces.js";
import { FACES as CJK_FACES } from "../render/fonts/faces-cjk.js";
import { buildSlides } from "./compositions.js";
import { sentences } from "./longform.js";
import { fontStack, makeDoc, makeLayer, makeSlide, type Doc } from "./model.js";
import { THEMES } from "./presets.js";
import { splitToFit } from "./split.js";
import { isRtl, layerLines, textWidth, wrapLines } from "./text.js";
import { facesFor } from "./typefaces.js";

const theme = THEMES.ink!;

function noOverflow(texts: string[]): string[] {
  const out: string[] = [];
  for (const s of buildSlides(texts, theme)) {
    for (const l of s.layers) {
      if (l.kind !== "text" || !l.text) continue;
      const size = l.fontSize ?? 64;
      if (layerLines(l, size, l.w) * size * (l.lineHeight ?? 1.2) > l.h + 1) out.push(l.text);
      if (l.y + l.h > 1350.5) out.push(`off board: ${l.text}`);
    }
  }
  return out;
}

const docWith = (text: string): Doc => ({
  ...makeDoc("t"),
  slides: [{ ...makeSlide(), layers: [{ ...makeLayer("text", { x: 0, y: 0, w: 800, h: 200 }, "#fff"), text, fontWeight: 700 }] }],
});

const families = (faces: { family: string }[]) => [...new Set(faces.map((f) => f.family))];

describe("every stack falls back to the bundled scripts and emoji", () => {
  it("lists them before the generic family, for system and bundled faces alike", () => {
    for (const id of ["sans", "serif", "mono", "inter", "playfair"]) {
      const stack = fontStack(id);
      for (const f of ["FCC Twemoji", "FCC Noto Sans", "FCC Noto Sans Arabic", "FCC Noto Sans Hebrew", "FCC Noto Sans JP"]) {
        expect(stack).toContain(`"${f}"`);
      }
      expect(stack.trim().endsWith("serif") || stack.trim().endsWith("monospace") || stack.trim().endsWith("sans-serif")).toBe(true);
    }
  });
});

describe("Cyrillic", () => {
  const text = "Почему большинство каруселей теряют людей на втором слайде. Три простых исправления.";
  it("measures, wraps on spaces and splits into sentences", () => {
    expect(textWidth("Привет", 48, { family: "inter", weight: 700 })).toBeGreaterThan(100);
    expect(wrapLines(text, 48, 600).length).toBeGreaterThan(1);
    expect(sentences(text)).toHaveLength(2);
  });
  it("generates without overflow", () => {
    expect(noOverflow([text, "Первое: начните с числа, а не с категории.", "Подпишитесь"])).toEqual([]);
  });
  it("ships the Cyrillic subset of a face that has one, and Noto Sans for the rest", () => {
    const fams = families(facesFor(docWith("Привет"), FACES));
    expect(fams).toContain("FCC Noto Sans");
  });
});

describe("Greek", () => {
  const text = "Γιατί τα περισσότερα καρούσελ χάνουν κόσμο. Τρεις διορθώσεις.";
  it("measures, wraps and splits into sentences", () => {
    expect(wrapLines(text, 48, 500).length).toBeGreaterThan(1);
    expect(sentences(text)).toHaveLength(2);
  });
  it("generates without overflow", () => {
    expect(noOverflow([text, "Ξεκινήστε με έναν αριθμό."])).toEqual([]);
  });
});

describe("Japanese", () => {
  const text = "ほとんどのカルーセルは二枚目で読者を失います。理由は三つあります。今日すぐ直せます。";
  it("measures a full em per character and breaks without spaces", () => {
    expect(textWidth("日本語", 100)).toBeCloseTo(306, 0);
    const lines = wrapLines(text, 60, 600);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.join("")).toBe(text);
  });
  it("splits sentences on 。 with no space after it", () => {
    expect(sentences(text)).toEqual(["ほとんどのカルーセルは二枚目で読者を失います。", "理由は三つあります。", "今日すぐ直せます。"]);
  });
  it("splits a long slide between characters when it has no sentence end", () => {
    const long = "数字から始める".repeat(40);
    const pieces = splitToFit(long, { box: { w: 888, h: 300 }, sizes: [60, 50, 40], lineHeight: 1.2 });
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join("")).toBe(long);
  });
  it("generates without overflow", () => {
    expect(noOverflow([text, "まず数字から始めましょう。", "フォローしてください"])).toEqual([]);
  });
  it("ships the Japanese face, only the subsets the deck's characters need", () => {
    const faces = facesFor(docWith("日本語のテスト"), [...FACES, ...CJK_FACES]);
    expect(families(faces)).toContain("FCC Noto Sans JP");
    expect(faces.filter((f) => f.family === "FCC Noto Sans JP").length).toBeLessThan(10);
  });
});

describe("Chinese", () => {
  const text = "大多数轮播图在第二张就失去了读者。原因有三个。";
  it("wraps and splits sentences", () => {
    expect(wrapLines(text, 60, 500).length).toBeGreaterThan(1);
    expect(sentences(text)).toHaveLength(2);
  });
  it("generates without overflow", () => {
    expect(noOverflow([text, "先从数字开始。"])).toEqual([]);
  });
});

describe("Korean", () => {
  const text = "대부분의 캐러셀은 두 번째 슬라이드에서 독자를 잃습니다. 세 가지 이유가 있습니다.";
  it("measures Hangul as full width and wraps on spaces", () => {
    expect(textWidth("한국어", 100)).toBeCloseTo(306, 0);
    expect(wrapLines(text, 60, 600).length).toBeGreaterThan(1);
  });
  it("generates without overflow and ships the Korean face", () => {
    expect(noOverflow([text, "숫자로 시작하세요."])).toEqual([]);
    expect(families(facesFor(docWith("한국어"), [...FACES, ...CJK_FACES]))).toContain("FCC Noto Sans KR");
  });
});

describe("Arabic", () => {
  const text = "معظم العروض تفقد القراء في الشريحة الثانية. هناك ثلاثة أسباب.";
  it("is right to left, wraps on spaces and splits sentences", () => {
    expect(isRtl(text)).toBe(true);
    expect(wrapLines(text, 48, 500).length).toBeGreaterThan(1);
    expect(sentences(text)).toHaveLength(2);
  });
  it("mirrors the composition: the rule moves to the right, where the line starts", () => {
    const [ltr] = buildSlides(["Most decks lose readers at slide two"], theme);
    const [rtl] = buildSlides([text], theme);
    const rule = (s: typeof ltr) => s!.layers.find((l) => l.name === "Rule")!;
    expect(rule(ltr).x).toBeLessThan(540);
    expect(rule(rtl).x + rule(rtl).w).toBeGreaterThan(540);
    expect(rule(rtl).x + rule(rtl).w).toBeCloseTo(1080 - rule(ltr).x, 0);
  });
  it("generates without overflow and ships the Arabic face", () => {
    expect(noOverflow([text, "ابدأ برقم وليس بفئة."])).toEqual([]);
    expect(families(facesFor(docWith(text), FACES))).toContain("FCC Noto Sans Arabic");
  });
});

describe("Hebrew", () => {
  const text = "רוב הקרוסלות מאבדות קוראים בשקופית השנייה. יש שלוש סיבות.";
  it("is right to left, wraps and splits sentences", () => {
    expect(isRtl(text)).toBe(true);
    expect(wrapLines(text, 48, 500).length).toBeGreaterThan(1);
    expect(sentences(text)).toHaveLength(2);
  });
  it("generates without overflow and ships the Hebrew face", () => {
    expect(noOverflow([text, "התחילו במספר."])).toEqual([]);
    expect(families(facesFor(docWith(text), FACES))).toContain("FCC Noto Sans Hebrew");
  });
});

describe("Emoji", () => {
  it("ships the emoji face only to a deck that has an emoji", () => {
    const some = facesFor(docWith("Ship it 🚀🔥"), FACES).filter((f) => f.family === "FCC Twemoji");
    expect(some).toHaveLength(1);
    expect(facesFor(docWith("No pictures here"), FACES).some((f) => f.family === "FCC Twemoji")).toBe(false);
    // Digits and © are the text face's, never the emoji face's.
    expect(facesFor(docWith("Rated 5/5 ©"), FACES).some((f) => f.family === "FCC Twemoji")).toBe(false);
  });
  it("ships the bundled face at the weights drawn, bold marks included", () => {
    const doc = docWith("Stop **guessing**");
    doc.slides[0]!.layers[0] = { ...doc.slides[0]!.layers[0]!, fontFamily: "inter", fontWeight: 400 };
    const weights = facesFor(doc, FACES)
      .filter((f) => f.family === "FCC Inter")
      .map((f) => f.weight);
    expect([...new Set(weights)].sort()).toEqual([400, 700]);
  });
});
