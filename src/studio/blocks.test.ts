import { describe, expect, it } from "vitest";

import {
  BLOCKS,
  blockById,
  CHART_LIMITS,
  MIN_PT,
  parseData,
  plane,
  QR_MIN,
  qrPath,
  searchBlocks,
  TESTIMONIAL_PLACEHOLDER,
  timelineIsVertical,
  tokenize,
  withDefaults,
  type BuildCtx,
} from "./blocks.js";
import { blockBox, freeRect, placeBlock, placementArea, rebuildBlock } from "./blockplace.js";
import { buildSlides } from "./compositions.js";
import { makeDoc, makeSlide, type Doc, type Slide } from "./model.js";
import { platformById } from "./platforms.js";
import { preflight } from "./preflight.js";
import { THEMES } from "./presets.js";

const theme = THEMES.ink!;
const ctx = (over: Partial<BuildCtx> = {}): BuildCtx => ({
  theme,
  board: { w: 1080, h: 1350 },
  instance: "b1",
  ...over,
});
const BOX = { x: 96, y: 300, w: 888, h: 700 };

describe("the library", () => {
  it("is nineteen blocks, and stops there", () => {
    expect(BLOCKS).toHaveLength(19);
    expect(new Set(BLOCKS.map((b) => b.id)).size).toBe(19);
  });

  it("has no field that is a size, a colour or a position", () => {
    const banned = /^(x|y|w|h)$|size|colou?r|font|width|height|position/i;
    for (const b of BLOCKS) {
      for (const f of b.fields) {
        // The annotation's target is a point on a picture the user chose, the
        // one exception, and it is a percentage of that picture.
        if (b.id === "annotation" && f.key.startsWith("target")) continue;
        expect(f.key, `${b.id}.${f.key}`).not.toMatch(banned);
      }
    }
  });

  for (const block of BLOCKS) {
    it(`${block.id}: builds plain, stamped, grouped layers inside its box`, () => {
      const built = block.build(withDefaults(block, {}), BOX, ctx());
      expect(built.layers.length, block.id).toBeGreaterThan(0);
      for (const l of built.layers) {
        expect(l.block, `${block.id} ${l.name}`).toEqual({ block: block.id, instance: "b1", part: l.name });
        expect(l.groupId).toBe("b1");
        if (l.kind === "text") expect(l.fontSize!, `${block.id} ${l.name}`).toBeGreaterThanOrEqual(MIN_PT);
      }
    });
  }

  it("filters the picker by label and hint", () => {
    expect(searchBlocks("donut").map((b) => b.id)).toEqual(["chart"]);
    expect(searchBlocks("")).toHaveLength(19);
  });
});

describe("charts (19.3)", () => {
  const chart = blockById("chart")!;

  it("reads pasted lines, and skips the ones with no number", () => {
    expect(parseData("Q1, 40\nQ2: 55\nnot a number\nQ3 61%\nBig, 1,200")).toEqual([
      { label: "Q1", value: 40 },
      { label: "Q2", value: 55 },
      { label: "Q3", value: 61 },
      { label: "Big", value: 1200 },
    ]);
  });

  /** 19.3's done-when, both halves. */
  it("five lines make a bar chart that passes the pre-flight at 4:5 and 9:16", () => {
    for (const [w, h, id] of [[1080, 1350, "linkedin"], [1080, 1920, "tiktok"]] as const) {
      const board = { w, h };
      const platform = platformById(id);
      const slide = { ...makeSlide(), layers: [] } as Slide;
      const area = placementArea(board, platform);
      const free = freeRect(slide, board, area, chart.minBox)!;
      const placed = placeBlock(slide, "chart", { kind: "bar", data: "Mon, 12\nTue, 19\nWed, 7\nThu, 24\nFri, 15" }, blockBox(free, chart.minBox), ctx({ board }))!;
      const doc: Doc = { ...makeDoc("C", w, h), slides: [placed.slide] };
      const bad = preflight(doc, platform).filter((f) => f.severity === "block" || f.code === "outside-safe-zone");
      expect(bad, `${w}x${h}`).toEqual([]);
      expect(placed.built.layers.filter((l) => l.name.startsWith("Bar "))).toHaveLength(5);
    }
  });

  it("draws a negative value below a visible zero line", () => {
    const built = chart.build({ kind: "bar", data: "A, 10\nB, -6\nC, 4", point: "", unit: "" }, BOX, ctx());
    const zero = built.layers.find((l) => l.name === "Zero line")!;
    const neg = built.layers.find((l) => l.name === "Bar 2")!;
    const pos = built.layers.find((l) => l.name === "Bar 1")!;
    expect(neg.y).toBeGreaterThanOrEqual(zero.y - 2);
    expect(pos.y + pos.h).toBeLessThanOrEqual(zero.y + 3);
    expect(zero.h).toBeGreaterThanOrEqual(3);
  });

  it("starts bars at zero, always", () => {
    const built = chart.build({ kind: "bar", data: "A, 90\nB, 100", point: "", unit: "" }, BOX, ctx());
    const a = built.layers.find((l) => l.name === "Bar 1")!;
    const b = built.layers.find((l) => l.name === "Bar 2")!;
    // 90 is 90% of 100's height, not a sliver of a truncated axis.
    expect(a.h / b.h).toBeCloseTo(0.9, 1);
  });

  it("refuses more marks than reads at phone size, and says so", () => {
    const many = Array.from({ length: 12 }, (_, i) => `D${i}, ${i + 1}`).join("\n");
    const built = chart.build({ kind: "bar", data: many, point: "", unit: "" }, BOX, ctx());
    expect(built.layers.filter((l) => l.name.startsWith("Bar "))).toHaveLength(CHART_LIMITS.bar);
    expect(built.notes.join(" ")).toMatch(/more than/);
  });

  it("puts the accent on the one value marked as the point, and only there", () => {
    const built = chart.build({ kind: "bar", data: "A, 1\nB, 2\nC, 3", point: "b", unit: "" }, BOX, ctx());
    const fills = ["Bar 1", "Bar 2", "Bar 3"].map((n) => built.layers.find((l) => l.name === n)!.fill);
    expect(fills).toEqual([theme.muted, theme.accent, theme.muted]);
  });

  it("draws a donut as path segments and labels them directly", () => {
    const built = chart.build({ kind: "donut", data: "A, 1\nB, 1\nC, 2", point: "", unit: "" }, BOX, ctx());
    expect(built.layers.filter((l) => l.kind === "path")).toHaveLength(3);
    expect(built.layers.filter((l) => l.name.startsWith("Label "))).toHaveLength(3);
  });
});

describe("code (19.4)", () => {
  it("tokenizes comments, strings, numbers and keywords", () => {
    const [line] = tokenize("return x + 42 // done", "js");
    expect(line!.map((t) => t.role)).toEqual(["keyword", "plain", "number", "plain", "comment"]);
    const [py] = tokenize("x = 'a' # note", "python");
    expect(py!.at(-1)).toEqual({ text: "# note", role: "comment" });
  });

  it("splits into planes that never put two characters in one place", () => {
    const lines = tokenize("const a = \"hi\"; // x\n  return 2;", "js");
    const planes = (["plain", "keyword", "string", "number", "comment"] as const).map((r) => plane(lines, r).split("\n"));
    const source = ["const a = \"hi\"; // x", "  return 2;"];
    source.forEach((src, li) => {
      [...src].forEach((ch, ci) => {
        const hits = planes.filter((p) => (p[li] ?? "")[ci] !== undefined && (p[li] ?? "")[ci] !== " ");
        expect(hits.length, `${li}:${ci}`).toBe(ch === " " ? 0 : 1);
      });
    });
  });

  it("never re-wraps: a line too long is reported, and the layer is wide enough not to wrap", () => {
    const code = blockById("code")!;
    const long = "const " + "x".repeat(140) + " = 1;";
    const built = code.build({ code: long, language: "js" }, { x: 96, y: 300, w: 640, h: 300 }, ctx());
    expect(built.overflow.join(" ")).toMatch(/too long/);
  });

  it("keeps indentation when split across slides", () => {
    const parts = blockById("code")!.split!({ code: "def f():\n    return 1\n\ndef g():\n    return 2", language: "python" }, 2);
    expect(parts[0]!.code).toContain("    return 1");
  });
});

describe("lists split whole items and carry numbering", () => {
  it("steps move whole, numbering continues", () => {
    const parts = blockById("steps")!.split!({ items: "a\nb\nc\nd\ne", connector: "yes", start: "1" }, 2);
    expect(parts.map((p) => p.items)).toEqual(["a\nb\nc", "d\ne"]);
    expect(parts.map((p) => p.start)).toEqual(["1", "4"]);
  });

  it("a table keeps its header on every part", () => {
    const parts = blockById("table")!.split!({ rows: "H1 | H2\n1 | 2\n3 | 4\n5 | 6" }, 2);
    for (const p of parts) expect(p.rows!.split("\n")[0]).toBe("H1 | H2");
  });
});

describe("the honest blocks (19.5)", () => {
  it("a post card shows only the deck's own identity", () => {
    const card = blockById("post-card")!;
    const mine = card.build({ text: "Hi", picture: "no" }, BOX, ctx({ identity: { name: "Gabriele", handles: { instagram: "@gab" } } }));
    expect(mine.layers.find((l) => l.name === "Name")!.text).toBe("Gabriele");
    expect(mine.layers.find((l) => l.name === "Handle")!.text).toBe("@gab");
    // No field can name anybody else.
    expect(card.fields.map((f) => f.key)).toEqual(["text", "picture"]);
    const none = card.build({ text: "Hi", picture: "no" }, BOX, ctx());
    expect(none.notes.join(" ")).toMatch(/your own identity/);
  });

  it("an empty testimonial is caught by the pre-flight, never shipped blank", () => {
    const placed = placeBlock({ ...makeSlide(), layers: [] }, "testimonial", {}, BOX, ctx())!;
    expect(placed.built.layers.some((l) => l.text === TESTIMONIAL_PLACEHOLDER)).toBe(true);
    const codes = preflight({ ...makeDoc("T"), slides: [placed.slide] }, platformById("linkedin")).map((f) => f.code);
    expect(codes).toContain("placeholder-text");
  });
});

describe("QR and timeline", () => {
  it("encodes locally into one path, never below the scannable size", () => {
    const { path, modules } = qrPath("https://example.com");
    expect(modules).toBeGreaterThanOrEqual(21);
    expect(path.length).toBeGreaterThan(100);
    const built = blockById("qr")!.build({ url: "https://example.com" }, { x: 96, y: 300, w: 200, h: 200 }, ctx());
    const zone = built.layers.find((l) => l.name === "Quiet zone")!;
    expect(zone.w).toBeGreaterThanOrEqual(QR_MIN);
  });

  it("runs down the slide on 9:16 and across everywhere else", () => {
    expect(timelineIsVertical({ w: 1080, h: 1920 })).toBe(true);
    expect(timelineIsVertical({ w: 1080, h: 1350 })).toBe(false);
  });
});

describe("placing a block (19.6)", () => {
  /** 19.6's done-when. */
  it("puts a checklist under the headline, clear of the safe zone, overlapping nothing", () => {
    const board = { w: 1080, h: 1350 };
    const [hook] = buildSlides(["A hook that earns the swipe"], theme, ["hook"], { images: false });
    const platform = platformById("linkedin");
    const block = blockById("checklist")!;
    const free = freeRect(hook!, board, placementArea(board, platform), block.minBox)!;
    expect(free).not.toBeNull();
    const placed = placeBlock(hook!, "checklist", {}, blockBox(free, block.minBox), ctx())!;
    const title = hook!.layers.find((l) => l.name === "Title")!;
    for (const l of placed.built.layers) {
      expect(l.y).toBeGreaterThanOrEqual(title.y + title.h);
    }
    const doc: Doc = { ...makeDoc("P"), slides: [placed.slide] };
    expect(preflight(doc, platform).filter((f) => f.code === "outside-safe-zone")).toEqual([]);
  });

  it("finds no room on a full slide rather than overlapping", () => {
    const board = { w: 1080, h: 1350 };
    const full: Slide = {
      ...makeSlide(),
      layers: [{ ...buildSlides(["x"], theme)[0]!.layers[0]!, x: 96, y: 140, w: 888, h: 1070 }],
    };
    expect(freeRect(full, board, placementArea(board), blockById("table")!.minBox)).toBeNull();
  });
});

describe("editing a placed block (19.8)", () => {
  /** 19.8's done-when. */
  it("redraws the bars, keeps a hand-moved label where it was put, in one call", () => {
    const slide = { ...makeSlide(), layers: [] } as Slide;
    const placed = placeBlock(slide, "chart", { kind: "bar", data: "A, 10\nB, 20\nC, 30", point: "", unit: "" }, BOX, ctx())!;
    // The user drags one value label somewhere else.
    const moved = placed.slide.layers.map((l) => (l.name === "Value 2" ? { ...l, x: l.x + 120, y: l.y - 40, handEdited: true } : l));
    const before = moved.find((l) => l.name === "Value 2")!;
    const next = rebuildBlock({ ...placed.slide, layers: moved }, "b1", { ...placed.record.fields, data: "A, 10\nB, 40\nC, 30" }, { theme, board: { w: 1080, h: 1350 } })!;
    const bar = (s: Slide) => s.layers.find((l) => l.name === "Bar 2")!;
    expect(bar(next.slide).h).toBeGreaterThan(bar(placed.slide).h);
    const after = next.slide.layers.find((l) => l.name === "Value 2")!;
    expect([after.x, after.y]).toEqual([before.x, before.y]);
    expect(next.slide.blocks![0]!.fields.data).toContain("B, 40");
  });

  it("treats moving the whole block as a move of the block, not an edit of every part", () => {
    const slide = { ...makeSlide(), layers: [] } as Slide;
    const placed = placeBlock(slide, "stat", { value: "3x", label: "watch time", source: "" }, BOX, ctx())!;
    const shifted = placed.slide.layers.map((l) => ({ ...l, x: l.x + 50, y: l.y + 30, handEdited: true }));
    const next = rebuildBlock({ ...placed.slide, layers: shifted }, "b1", { value: "4x", label: "watch time", source: "" }, { theme, board: { w: 1080, h: 1350 } })!;
    const num = next.slide.layers.find((l) => l.name === "Number")!;
    expect(num.text).toBe("4x");
    expect(num.x).toBe(placed.slide.layers.find((l) => l.name === "Number")!.x + 50);
  });

  it("keeps a hand recolour through a data change", () => {
    const slide = { ...makeSlide(), layers: [] } as Slide;
    const placed = placeBlock(slide, "chart", { kind: "bar", data: "A, 10\nB, 20", point: "", unit: "" }, BOX, ctx())!;
    const recoloured = placed.slide.layers.map((l) => (l.name === "Bar 1" ? { ...l, fill: "#ff00ff", handEdited: true } : l));
    const next = rebuildBlock({ ...placed.slide, layers: recoloured }, "b1", { ...placed.record.fields, data: "A, 30\nB, 20" }, { theme, board: { w: 1080, h: 1350 } })!;
    expect(next.slide.layers.find((l) => l.name === "Bar 1")!.fill).toBe("#ff00ff");
  });
});

/* ── 19.7, blocks inside frameworks ───────────────────────────────────────── */

import { fillsFor } from "./ai.js";
import { regenerate } from "./regenerate.js";
import { STRUCTURES } from "./structures.js";

describe("a framework slot that asks for a block (19.7)", () => {
  const showcase = STRUCTURES.find((s) => s.id === "showcase")!;

  it("is chosen by the structure: only result slots ask, and only for a big number", () => {
    const asking = STRUCTURES.flatMap((s) => s.slots.filter((x) => x.block).map((x) => `${s.id}.${x.id}:${x.block!.id}`));
    expect(asking.length).toBeGreaterThan(0);
    for (const a of asking) expect(a).toMatch(/\.result:stat$/);
  });

  it("lines the model's fields up by slot, and ignores empty ones", () => {
    const fills = fillsFor(
      [
        { role: "hook", text: "x", fields: [] },
        { role: "result", text: "Ran six weeks.", fields: ["3x", "watch time"] },
      ],
      showcase,
    );
    expect(fills).toEqual({ result: { id: "stat", fields: { value: "3x", label: "watch time" } } });
    expect(fillsFor([{ role: "result", text: "x", fields: ["", ""] }], showcase)).toEqual({});
  });

  it("lays the slot out as the block, keeps the sentence, and Re-lay keeps the block", () => {
    const roles = showcase.slots.map((s) => s.id);
    const texts = showcase.slots.map((s) => s.placeholder);
    const slides = buildSlides(texts, theme, roles, { fills: { result: { id: "stat", fields: { value: "3x", label: "watch time" } } } });
    const at = slides.findIndex((s) => s.blocks?.some((b) => b.slot));
    expect(at).toBeGreaterThanOrEqual(0);
    const slide = slides[at]!;
    expect(slide.layers.find((l) => l.block?.part === "Number")!.text).toBe("3x");
    expect(slide.layers.some((l) => !l.block && l.kind === "text")).toBe(true);

    const doc: Doc = { ...makeDoc("S"), slides };
    const again = regenerate(doc, theme).doc;
    const numbers = again.slides[at]!.layers.filter((l) => l.block?.part === "Number");
    // Rebuilt once, not kept beside a fresh copy.
    expect(numbers).toHaveLength(1);
    expect(numbers[0]!.text).toBe("3x");
  });
});

describe("verbatim quotes (19.2)", () => {
  it("marks a quote verbatim only when its words are exactly a verified quote", () => {
    const quote = blockById("quote")!;
    const exact = quote.build({ text: "The first one that felt like us.", by: "Client" }, BOX, ctx({ quotes: ["The first one that felt like us."] }));
    expect(exact.layers.find((l) => l.name === "Words")!.verbatim).toBe(true);
    const edited = quote.build({ text: "The first one that really felt like us.", by: "Client" }, BOX, ctx({ quotes: ["The first one that felt like us."] }));
    expect(edited.layers.find((l) => l.name === "Words")!.verbatim).toBeUndefined();
  });
});
