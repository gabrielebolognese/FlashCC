import { describe, expect, it } from "vitest";

import { placeBlock } from "./blockplace.js";
import { buildSlides } from "./compositions.js";
import { makeDoc, type Doc, type Slide } from "./model.js";
import { platformById } from "./platforms.js";
import { preflight } from "./preflight.js";
import { THEMES } from "./presets.js";
import { slideCopy } from "./regenerate.js";
import {
  applyTranslation,
  crowded,
  editedSince,
  languageFolder,
  languageSet,
  referenceOf,
  reportLine,
  retranslate,
  unitsOf,
  restoreOriginal,
  voiceFor,
  type Translated,
} from "./translate.js";

const theme = THEMES.ink!;

const ENGLISH = [
  "Why most carousels lose people on slide two",
  "Your hook makes a promise. Slide two has to keep it in the first five words, or the swipe stops there.",
  "Cut every slide to one idea. If a slide needs two sentences to make its point, it is two slides, and the reader feels the difference long before they can name it.",
  "Put the number first. 61,000 views came from one change: the result on the cover, not the topic.",
  "Follow @maya_edits for one fix a week",
];

const deck = (texts: string[] = ENGLISH): Doc => ({ ...makeDoc("Slide two"), id: "src", slides: buildSlides(texts, theme) });

/** Fixture translations: what a good answer from the route looks like, no key needed. */
const FIXTURES: Record<string, string[]> = {
  de: [
    "Warum die meisten Karussells ihre Leserinnen und Leser auf Folie zwei verlieren",
    "Dein Hook gibt ein Versprechen. Folie zwei muss es in den ersten fünf Wörtern einlösen, sonst hört das Wischen genau dort auf.",
    "Reduziere jede einzelne Folie auf eine einzige Idee. Wenn eine Folie zwei vollständige Sätze braucht, um ihren Gedanken klarzumachen, dann sind es in Wahrheit zwei Folien. Die Leserinnen und Leser spüren diesen Unterschied schon lange, bevor sie ihn überhaupt benennen könnten, und genau deshalb fühlen sich überladene Folien so anstrengend an.",
    "Die Zahl kommt zuerst. 61.000 Aufrufe kamen von einer einzigen Änderung: das Ergebnis auf dem Titelbild, nicht das Thema.",
    "Folge @maya_edits für eine Verbesserung pro Woche",
  ],
  ja: [
    "ほとんどのカルーセルが二枚目で読者を失う理由",
    "フックは約束をします。二枚目は最初の五語でその約束を守らなければ、スワイプはそこで止まります。",
    "各スライドをひとつのアイデアに絞りましょう。要点を伝えるのに二文が必要なら、それは二枚のスライドです。読者はその違いを言葉にできるずっと前に感じ取ります。",
    "数字を先に。61,000回の再生はひとつの変更から生まれました。表紙にテーマではなく結果を載せたことです。",
    "@maya_edits をフォローして、毎週ひとつの改善を",
  ],
  ar: [
    "لماذا تفقد معظم الكاروسيلات قراءها في الشريحة الثانية",
    "الخطاف يقدّم وعدًا. على الشريحة الثانية أن تفي به في أول خمس كلمات، وإلا توقف التمرير هناك.",
    "اختصر كل شريحة إلى فكرة واحدة. إذا احتاجت الشريحة إلى جملتين لتوضيح فكرتها، فهي شريحتان، ويشعر القارئ بالفرق قبل أن يستطيع تسميته بوقت طويل.",
    "ضع الرقم أولًا. جاءت 61,000 مشاهدة من تغيير واحد: النتيجة على الغلاف، لا الموضوع.",
    "تابع @maya_edits لإصلاح واحد كل أسبوع",
  ],
};

const translated = (code: string, doc = deck()): Translated => ({ slides: FIXTURES[code]!, fields: unitsOf(doc).fields.map((f) => f.text), findings: [] });

const layoutFindings = (doc: Doc): string[] =>
  ["instagram", "linkedin"].flatMap((p) =>
    preflight(doc, platformById(p as "instagram")!)
      .filter((f) => f.code === "text-overflows" || f.code === "outside-safe-zone")
      .map((f) => `${p} slide ${f.slide}: ${f.code}`),
  );

describe("done when: English to German, Japanese and Arabic (29.2)", () => {
  it("the source deck itself lays out clean", () => {
    expect(layoutFindings(deck())).toEqual([]);
  });

  for (const code of ["de", "ja", "ar"]) {
    it(`lays out in ${code} with no overflow and no safe-zone warning`, () => {
      const src = deck();
      const { doc, report } = applyTranslation(src, translated(code), { target: code, theme, id: `t-${code}` });
      expect(layoutFindings(doc)).toEqual([]);
      const refs = new Map(src.slides.slice(1).map((s) => [s.id, referenceOf(s)]));
      expect(doc.slides.every((s) => !crowded(s, doc.height, refs.get(s.translation!.source)))).toBe(true);
      expect(report.from).toBe(5);
      expect(report.to).toBe(doc.slides.length);
      expect(report.long).toEqual([]);
      // Every word arrived: the pieces of each slide, joined, are the translation.
      const joined = new Map<string, string[]>();
      for (const s of doc.slides) joined.set(s.translation!.source, [...(joined.get(s.translation!.source) ?? []), slideCopy(s)]);
      expect([...joined.values()].map((p) => p.join(" ").replace(/\s+/g, " "))).toEqual(FIXTURES[code]!.map((t) => t.replace(/\s+/g, " ")));
    });
  }

  it("splits the long German slide rather than shrinking it, and says so", () => {
    const src = deck();
    const { doc, report } = applyTranslation(src, translated("de"), { target: "de", theme, id: "t-de" });
    expect(report.split).toEqual([3]);
    expect(report.to).toBe(6);
    expect(reportLine(report, "de")).toBe("5 slides became 6 in German, slide 3 was split.");
    // The two halves of slide 3 are both stamped as slide 3's.
    const halves = doc.slides.filter((s) => s.translation!.source === src.slides[2]!.id);
    expect(halves).toHaveLength(2);
    // In the layout the original slide had, at the size it had.
    expect(halves.map((s) => s.composition)).toEqual([src.slides[2]!.composition, src.slides[2]!.composition]);
  });

  it("keeps the layout each slide had", () => {
    const src = deck();
    const { doc } = applyTranslation(src, translated("ja"), { target: "ja", theme, id: "t-ja" });
    expect(doc.slides.map((s) => s.composition)).toEqual(src.slides.map((s) => s.composition));
  });

  it("says when nothing moved", () => {
    const { report } = applyTranslation(deck(), translated("ja"), { target: "ja", theme, id: "t-ja" });
    expect(reportLine(report, "ja")).toBe("5 slides in Japanese, the same as the original.");
  });

  it("mirrors the Arabic layout so each line starts where it reads from", () => {
    const { doc } = applyTranslation(deck(), translated("ar"), { target: "ar", theme, id: "t-ar" });
    const src = deck();
    // At least one composition has a rule or bar that moves to the other side.
    const moved = doc.slides.some((s, i) => {
      const before = src.slides[i]!.layers.filter((l) => l.kind === "rect").map((l) => Math.round(l.x));
      const after = s.layers.filter((l) => l.kind === "rect").map((l) => Math.round(l.x));
      return before.length > 0 && before.join() !== after.join();
    });
    expect(moved).toBe(true);
  });
});

describe("a translation is its own document (29.5)", () => {
  const src: Doc = { ...deck(), series: { id: "s", part: 3 }, slides: deck().slides.map((s) => ({ ...s, alt: "English alt" })) };
  const { doc } = applyTranslation(src, translated("de", src), { target: "de", theme, id: "t-de", now: "2026-10-18T00:00:00.000Z" });

  it("points home, names its language, and leaves the series to the original", () => {
    expect(doc).toMatchObject({ id: "t-de", variantOf: "src", language: "de", name: "Slide two (Deutsch)", createdAt: "2026-10-18T00:00:00.000Z" });
    expect(doc.series).toBeUndefined();
  });
  it("drops the original's alt text, which describes English slides", () => {
    expect(doc.slides.every((s) => s.alt === undefined)).toBe(true);
  });
  it("is untouched by an edit to the original", () => {
    const edited = { ...src, slides: src.slides.map((s, i) => (i === 0 ? { ...s, name: "changed" } : s)) };
    expect(edited.slides[0]!.name).toBe("changed");
    expect(doc.slides[0]!.name).not.toBe("changed");
  });
  it("forms a set with its original, folder per language", () => {
    const fr = { ...doc, id: "t-fr", language: "fr" };
    const set = languageSet(doc, [src, fr, doc]);
    expect(set.map((d) => d.id)).toEqual(["src", "t-fr", "t-de"]);
    expect(set.map(languageFolder)).toEqual(["original", "fr", "de"]);
  });
});

describe("words inside blocks", () => {
  const withBlocks = (): Doc => {
    const base = deck(["A quote from a client", "What to check", "Follow for more"]);
    const quote = placeBlock(base.slides[0]!, "quote", { text: "The first one that felt like us.", by: "Dana Ruiz, founder" }, { x: 96, y: 500, w: 888, h: 500 }, {
      theme,
      board: { w: 1080, h: 1350 },
      quotes: ["The first one that felt like us."],
      instance: "q1",
    })!;
    const list = placeBlock(base.slides[1]!, "checklist", { items: "Shoot in daylight\nx Shoot into the sun" }, { x: 96, y: 500, w: 888, h: 500 }, {
      theme,
      board: { w: 1080, h: 1350 },
      instance: "c1",
    })!;
    const icons = placeBlock(base.slides[2]!, "icon-grid", { items: "zap | Fast\ncheck | Simple" }, { x: 96, y: 500, w: 888, h: 500 }, {
      theme,
      board: { w: 1080, h: 1350 },
      instance: "i1",
    })!;
    return { ...base, quotes: ["The first one that felt like us."], slides: [quote.slide, list.slide, icons.slide] };
  };

  it("sends a block's words and never its names, marks or icon names", () => {
    const units = unitsOf(withBlocks()).fields.map((f) => f.text);
    expect(units).toEqual(["The first one that felt like us.", "Shoot in daylight", "Shoot into the sun", "Fast", "Simple"]);
  });

  it("translates a quote, labels it, takes the verbatim mark away, and keeps the original one click away", () => {
    const src = withBlocks();
    expect(src.slides[0]!.layers.some((l) => l.verbatim)).toBe(true);
    const t: Translated = {
      slides: ["Ein Zitat von einer Kundin", "Was zu prüfen ist", "Folge für mehr"],
      fields: ["Das erste, das sich nach uns angefühlt hat.", "Bei Tageslicht drehen", "Gegen die Sonne drehen", "Schnell", "Einfach"],
      findings: [],
    };
    const { doc } = applyTranslation(src, t, { target: "de", theme, id: "t" });
    const slide = doc.slides[0]!;
    const rec = slide.blocks!.find((b) => b.instance === "q1")!;
    expect(rec.fields.text).toBe("Das erste, das sich nach uns angefühlt hat.");
    expect(rec.fields.by).toBe("Dana Ruiz, founder (Übersetzung)");
    expect(rec.original).toEqual(expect.objectContaining({ text: "The first one that felt like us." }));
    expect(slide.layers.some((l) => l.verbatim)).toBe(false);
    expect(slide.layers.some((l) => l.text === "Dana Ruiz, founder (Übersetzung)")).toBe(true);

    // The checklist keeps its cross; the icon grid keeps its icon names.
    expect(doc.slides[1]!.blocks![0]!.fields.items).toBe("Bei Tageslicht drehen\nx Gegen die Sonne drehen");
    expect(doc.slides[2]!.blocks![0]!.fields.items).toBe("zap | Schnell\ncheck | Einfach");

    const back = restoreOriginal(doc, 0, "q1", theme);
    expect(back.slides[0]!.blocks!.find((b) => b.instance === "q1")!.fields.text).toBe("The first one that felt like us.");
    expect(back.slides[0]!.layers.some((l) => l.verbatim)).toBe(true);
  });

  it("translates a column preset's headings by making them its own", () => {
    const base = deck(["Do this, not that"]);
    const placed = placeBlock(base.slides[0]!, "compare", { preset: "Do / Don't", rows: "Cut on the beat | Cut on movement" }, { x: 96, y: 500, w: 888, h: 500 }, {
      theme,
      board: { w: 1080, h: 1350 },
      instance: "k1",
    })!;
    const src = { ...base, slides: [placed.slide] };
    expect(unitsOf(src).fields.map((f) => f.text)).toEqual(["Do", "Don't", "Cut on the beat", "Cut on movement"]);
    const { doc } = applyTranslation(src, { slides: ["Mach das"], fields: ["Mach", "Lass", "Auf den Beat", "Auf die Bewegung"], findings: [] }, { target: "de", theme, id: "t" });
    expect(doc.slides[0]!.blocks![0]!.fields).toMatchObject({ preset: "Custom", left: "Mach", right: "Lass", rows: "Auf den Beat | Auf die Bewegung" });
  });
});

describe("re-translate keeps hand edits (29.5)", () => {
  const src = deck();
  const first = applyTranslation(src, translated("ja"), { target: "ja", theme, id: "t-ja" }).doc;

  /** Somebody types into slide 2 of the Japanese deck. */
  const touched: Doc = {
    ...first,
    slides: first.slides.map((s, i): Slide => {
      if (i !== 1) return s;
      const [main] = [...s.layers].filter((l) => l.kind === "text" && (l.text ?? "").trim()).sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0));
      return { ...s, layers: s.layers.map((l) => (l.id === main!.id ? { ...l, text: "手で直した一文", handEdited: true } : l)) };
    }),
  };

  it("knows which slides were edited since", () => {
    expect(first.slides.map(editedSince)).toEqual([false, false, false, false, false]);
    expect(touched.slides.map(editedSince)).toEqual([false, true, false, false, false]);
  });

  it("replaces the untouched slides, keeps the edited one exactly, and counts both", () => {
    const again = { ...translated("ja"), slides: FIXTURES.ja!.map((t) => `${t}！`) };
    const fresh = applyTranslation(src, again, { target: "ja", theme, id: "fresh" }).doc;
    const r = retranslate(touched, fresh);
    expect(r).toMatchObject({ kept: 1, replaced: 4 });
    expect(r.doc.id).toBe("t-ja");
    expect(r.doc.slides[1]).toBe(touched.slides[1]);
    expect(slideCopy(r.doc.slides[0]!)).toBe(`${FIXTURES.ja![0]}！`);
  });

  it("keeps a slide added by hand where it was", () => {
    const added: Slide = { id: "mine", name: "Mine", background: "#000", layers: [] };
    const withMine = { ...first, slides: [first.slides[0]!, added, ...first.slides.slice(1)] };
    const fresh = applyTranslation(src, translated("ja"), { target: "ja", theme, id: "fresh" }).doc;
    const r = retranslate(withMine, fresh);
    expect(r.doc.slides.map((s) => s.id)[1]).toBe("mine");
    expect(r.doc.slides).toHaveLength(6);
  });
});

describe("the voice a translation carries", () => {
  it("keeps tone and banned words, and only the samples already in the target's script", () => {
    const voice = { tone: "Blunt", avoid: ["synergy"], samples: ["Cut it.", "切ってください。"] };
    expect(voiceFor(voice, "ja")).toEqual({ tone: "Blunt", avoid: ["synergy"], samples: ["切ってください。"] });
    expect(voiceFor(voice, "de")).toEqual({ tone: "Blunt", avoid: ["synergy"] });
  });
});
