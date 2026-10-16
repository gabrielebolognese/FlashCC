/**
 * The block library (Batch 19): presets for content with a shape.
 *
 * A block is a pure function, FIELDS IN, PLAIN LAYERS OUT, sized to a box it is
 * given. It runs once. What it leaves behind are ordinary layers with the same
 * handles as anything drawn by hand, each stamped `{ block, instance, part }` so
 * "Edit as block" can find them again, and nothing reads the block definition
 * at render time. Changing the theme afterwards restyles the layers through the
 * normal brand path, because they are ordinary layers.
 *
 * ── Fields are words and numbers ─────────────────────────────────────────────
 *
 * That is what lets a framework slot ask the model to fill one without
 * breaking invariant 5: the model writes the words, the block decides where
 * they go. No field is a size, a colour or a position.
 *
 * ── A block never measures itself into overflow ──────────────────────────────
 *
 * Text runs the same ladder as the compositions, down to the same 60% floor,
 * and if the words still do not fit it says so in `overflow` rather than
 * shrinking further. The insert dialog shows it; the pre-flight catches the
 * layer the same way it catches any other text that does not fit its box.
 *
 * Pure and DOM-free.
 */

import qrcode from "qrcode-generator";

import { ICON_PATHS } from "../render/icons.js";
import { bestText, contrast, mix } from "./colour.js";
import { makeLayer, type Identity, type Layer, type LayerKind } from "./model.js";
import type { Theme } from "./presets.js";
import { fitToBox, ladder, textWidth, type Measure } from "./text.js";

/* ── the shape of a block ─────────────────────────────────────────────────── */

export type FieldKind = "text" | "lines" | "choice";

export type FieldSpec = {
  key: string;
  label: string;
  kind: FieldKind;
  /** Shown in the empty field. For "lines", one example per line. */
  placeholder?: string | undefined;
  options?: string[] | undefined;
  /** What the field means, in one line, under it. */
  hint?: string | undefined;
};

export type Fields = Record<string, string>;
export type Box = { x: number; y: number; w: number; h: number };

export type BuildCtx = {
  theme: Theme;
  board: { w: number; h: number };
  /** Stamped on every layer, and the group every layer shares. */
  instance: string;
  /** The deck's own identity, for the post card. Never anyone else's. */
  identity?: Identity | undefined;
  /** A picture to start from, when the block frames an image already chosen. */
  src?: string | undefined;
  /**
   * Verified source quotes (Batch 13). A Quote block whose words are exactly
   * one of these is marked verbatim; any other words, including an edited
   * version of one, are not.
   */
  quotes?: readonly string[] | undefined;
};

export type Built = {
  layers: Layer[];
  /** Parts whose words do not fit at the ladder's floor. Named, never hidden. */
  overflow: string[];
  /** Anything else the user should know before placing it. */
  notes: string[];
};

export type Block = {
  id: string;
  label: string;
  /** One line in the picker. */
  hint: string;
  fields: FieldSpec[];
  defaults: Fields;
  minBox: { w: number; h: number };
  build: (fields: Fields, box: Box, ctx: BuildCtx) => Built;
  /**
   * Splits the fields into slide-sized parts, for blocks whose content is a
   * list. Only ever on whole items: a step is never cut in half, a table keeps
   * its header on every part, and numbering carries on (`start`).
   */
  split?: ((fields: Fields, parts: number) => Fields[]) | undefined;
};

/* ── shared helpers ───────────────────────────────────────────────────────── */

/** The compositions' floor: below 60% of the top size, it reads as crammed. */
const FLOOR = 0.6;
/**
 * And never below 20pt, whatever the top size: TikTok's pre-flight floor is
 * 20, LinkedIn's and Instagram's 18, and a block that fails the check the
 * product runs on it is not a preset.
 */
export const MIN_PT = 20;

const steps = (max: number): number[] => ladder(Math.max(max, MIN_PT), Math.max(MIN_PT, Math.round(max * FLOOR)));

const display = (t: Theme): Measure => ({ family: t.displayFont ?? "sans" });
const prose = (t: Theme): Measure => ({ family: t.bodyFont ?? t.displayFont ?? "sans" });

/** Lines of a "lines" field, trimmed, blanks dropped. */
export const linesOf = (v: string | undefined): string[] =>
  (v ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

/** "left | right" → ["left", "right"]. Commas are words, so the bar is the split. */
const cells = (line: string): string[] => line.split("|").map((c) => c.trim());

class Out {
  layers: Layer[] = [];
  overflow: string[] = [];
  notes: string[] = [];
  constructor(
    private readonly block: string,
    private readonly ctx: BuildCtx,
  ) {}

  add(kind: LayerKind, part: string, at: Box, fill: string, extra: Partial<Layer> = {}): Layer {
    const layer: Layer = {
      ...makeLayer(kind, { x: Math.round(at.x), y: Math.round(at.y), w: Math.max(4, Math.round(at.w)), h: Math.max(4, Math.round(at.h)) }, fill),
      name: part,
      block: { block: this.block, instance: this.ctx.instance, part },
      // One block, one group (18.6): it moves as one thing, and the layers
      // list is where a single part is reached.
      groupId: this.ctx.instance,
      ...extra,
    };
    this.layers.push(layer);
    return layer;
  }

  /**
   * Text on the ladder. Returns the layer and the height it used; records the
   * part as overflowing when even the floor will not hold it.
   */
  text(
    part: string,
    t: string,
    at: Box,
    fill: string,
    o: { max: number; lh?: number; weight?: number; m?: Measure; extra?: Partial<Layer> },
  ): { layer: Layer; height: number } {
    const lh = o.lh ?? 1.25;
    const m = o.m ?? {};
    const f = fitToBox(t, {
      maxWidth: at.w,
      maxHeight: at.h,
      sizes: steps(o.max),
      lineHeight: lh,
      ...m,
    });
    if (f.overflows && t.trim()) this.overflow.push(part);
    const height = Math.min(Math.max(f.height, f.fontSize * lh), Math.max(at.h, f.height));
    // The layer is only as tall as its lines, so "middle" and "bottom" are
    // honoured by WHERE it goes in the box it was given, not inside itself.
    const v = o.extra?.valign;
    const y = v === "middle" ? at.y + Math.max(0, (at.h - height) / 2) : v === "bottom" ? at.y + Math.max(0, at.h - height) : at.y;
    const layer = this.add("text", part, { ...at, y, h: height }, fill, {
      text: t,
      fontSize: f.fontSize,
      fontWeight: o.weight ?? 500,
      lineHeight: lh,
      fontFamily: m.family ?? "sans",
      ...o.extra,
    });
    return { layer, height };
  }

  done(): Built {
    return { layers: this.layers, overflow: this.overflow, notes: this.notes };
  }
}

/** A quiet card colour: the foreground faded most of the way into the ground. */
const surface = (t: Theme): string => mix(t.bg, t.fg, 0.08);
/** A hairline that still survives recompression. */
const rule = (t: Theme): string => mix(t.bg, t.fg, 0.22);

const icon = (out: Out, part: string, glyph: string, at: Box, colour: string, width = 2.4): Layer =>
  out.add("icon", part, at, "none", { glyph, stroke: colour, strokeWidth: width });

/* ── 1. Checklist ─────────────────────────────────────────────────────────── */

const CHECKLIST: Block = {
  id: "checklist",
  label: "Checklist",
  hint: "3 to 7 items, each ticked or crossed",
  fields: [
    {
      key: "items",
      label: "Items",
      kind: "lines",
      placeholder: "Shoot in daylight\nx Shoot into the sun",
      hint: "One per line. Start a line with x for a cross.",
    },
    { key: "numbered", label: "Numbered", kind: "choice", options: ["no", "yes"] },
    { key: "start", label: "Start at", kind: "text", hint: "Numbering carries on across slides" },
  ],
  defaults: { items: "First thing to check\nSecond thing to check\nx The thing to avoid", numbered: "no", start: "1" },
  minBox: { w: 520, h: 300 },
  build: (f, box, ctx) => {
    const out = new Out("checklist", ctx);
    const t = ctx.theme;
    const items = linesOf(f.items).slice(0, 7);
    if (linesOf(f.items).length > 7) out.notes.push("Seven items at most. Split the rest onto another slide.");
    const start = Math.max(1, parseInt(f.start ?? "1", 10) || 1);
    const rowH = box.h / Math.max(1, items.length);
    const mark = Math.min(56, rowH * 0.6);
    items.forEach((raw, i) => {
      const cross = /^(x|✗|no:)\s+/i.test(raw);
      const words = raw.replace(/^(x|✗|no:|-|✓)\s+/i, "");
      const y = box.y + i * rowH;
      icon(out, `Mark ${i + 1}`, cross ? "x" : "check", { x: box.x, y: y + (rowH - mark) / 2, w: mark, h: mark }, cross ? t.muted : t.accent, 3);
      const lead = f.numbered === "yes" ? `${start + i}. ` : "";
      out.text(`Item ${i + 1}`, `${lead}${words}`, { x: box.x + mark + 28, y: y + rowH * 0.12, w: box.w - mark - 28, h: rowH * 0.76 }, cross ? t.muted : t.fg, {
        max: 44,
        m: prose(t),
        extra: { valign: "middle" },
      });
    });
    return out.done();
  },
  split: (f, parts) => splitLines(f, "items", parts, true),
};

/** Whole lines into `parts` chunks, numbering carried on through `start`. */
function splitLines(f: Fields, key: string, parts: number, numbered: boolean): Fields[] {
  const lines = linesOf(f[key]);
  const size = Math.ceil(lines.length / Math.max(1, parts));
  const start = Math.max(1, parseInt(f.start ?? "1", 10) || 1);
  const out: Fields[] = [];
  for (let i = 0; i < lines.length; i += size) {
    out.push({ ...f, [key]: lines.slice(i, i + size).join("\n"), ...(numbered ? { start: String(start + i) } : {}) });
  }
  return out;
}

/* ── 2. Steps ─────────────────────────────────────────────────────────────── */

const STEPS: Block = {
  id: "steps",
  label: "Steps",
  hint: "3 to 6 numbered steps",
  fields: [
    { key: "items", label: "Steps", kind: "lines", placeholder: "Find the beat\nCut on the movement\nHold the last frame" },
    { key: "connector", label: "Connector", kind: "choice", options: ["yes", "no"] },
    { key: "start", label: "Start at", kind: "text" },
  ],
  defaults: { items: "First step\nSecond step\nThird step", connector: "yes", start: "1" },
  minBox: { w: 520, h: 330 },
  build: (f, box, ctx) => {
    const out = new Out("steps", ctx);
    const t = ctx.theme;
    const items = linesOf(f.items).slice(0, 6);
    if (linesOf(f.items).length > 6) out.notes.push("Six steps at most. A split moves whole steps, never half of one.");
    const start = Math.max(1, parseInt(f.start ?? "1", 10) || 1);
    const rowH = box.h / Math.max(1, items.length);
    const d = Math.min(72, rowH * 0.62);
    if (f.connector !== "no" && items.length > 1) {
      out.add("rect", "Connector", { x: box.x + d / 2 - 2, y: box.y + rowH / 2, w: 4, h: rowH * (items.length - 1) }, rule(t));
    }
    items.forEach((words, i) => {
      const y = box.y + i * rowH;
      out.add("ellipse", `Dot ${i + 1}`, { x: box.x, y: y + (rowH - d) / 2, w: d, h: d }, t.accent);
      out.text(`Number ${i + 1}`, String(start + i), { x: box.x, y: y + (rowH - d) / 2, w: d, h: d }, bestText(t.accent), {
        max: Math.round(d * 0.5),
        weight: 700,
        lh: 1,
        m: display(t),
        extra: { align: "center", valign: "middle" },
      });
      out.text(`Step ${i + 1}`, words, { x: box.x + d + 32, y: y + rowH * 0.1, w: box.w - d - 32, h: rowH * 0.8 }, t.fg, {
        max: 44,
        m: prose(t),
        extra: { valign: "middle" },
      });
    });
    return out.done();
  },
  split: (f, parts) => splitLines(f, "items", parts, true),
};

/* ── 3. Big number ────────────────────────────────────────────────────────── */

const STAT: Block = {
  id: "stat",
  label: "Big number",
  hint: "One figure, what it means, where it came from",
  fields: [
    { key: "value", label: "Number", kind: "text", placeholder: "3x" },
    { key: "label", label: "What it means", kind: "text", placeholder: "watch time on the next video" },
    { key: "source", label: "Source", kind: "text", placeholder: "Optional" },
  ],
  defaults: { value: "3x", label: "what the number means", source: "" },
  minBox: { w: 480, h: 320 },
  build: (f, box, ctx) => {
    const out = new Out("stat", ctx);
    const t = ctx.theme;
    const source = (f.source ?? "").trim();
    const valueH = box.h * (source ? 0.55 : 0.62);
    out.text("Number", f.value ?? "", { x: box.x, y: box.y, w: box.w, h: valueH }, t.accent, {
      max: 220,
      weight: 800,
      lh: 1,
      m: { ...display(t), letterSpacing: -0.03 },
      extra: { letterSpacing: -0.03, valign: "bottom" },
    });
    const label = out.text("Label", f.label ?? "", { x: box.x, y: box.y + valueH + 20, w: box.w, h: box.h - valueH - (source ? 80 : 20) }, t.fg, {
      max: 48,
      weight: 600,
      m: display(t),
    });
    if (source) {
      out.text("Source", source, { x: box.x, y: box.y + valueH + 32 + label.height, w: box.w, h: 60 }, t.muted, { max: 24, m: prose(t) });
    }
    return out.done();
  },
};

/* ── 4. Quote ─────────────────────────────────────────────────────────────── */

const QUOTE: Block = {
  id: "quote",
  label: "Quote",
  hint: "Somebody's words, and who said them",
  fields: [
    { key: "text", label: "Quote", kind: "text", placeholder: "The first one that felt like us." },
    { key: "by", label: "Who said it", kind: "text", placeholder: "Name, role" },
  ],
  defaults: { text: "The words exactly as they were said.", by: "Name, role" },
  minBox: { w: 520, h: 300 },
  build: (f, box, ctx) => {
    const out = new Out("quote", ctx);
    const t = ctx.theme;
    icon(out, "Mark", "quote", { x: box.x, y: box.y, w: 72, h: 72 }, t.accent, 2.6);
    const words = out.text("Words", f.text ?? "", { x: box.x, y: box.y + 96, w: box.w, h: box.h - 96 - 72 }, t.fg, {
      max: 56,
      weight: 500,
      m: display(t),
      // Verbatim only when the words ARE a verified quote, exactly. The studio
      // clears the mark the moment the words are edited on the canvas.
      extra: { italic: true, ...((ctx.quotes ?? []).includes((f.text ?? "").trim()) ? { verbatim: true } : {}) },
    });
    out.text("Attribution", f.by ?? "", { x: box.x, y: box.y + 96 + words.height + 24, w: box.w, h: 48 }, t.muted, { max: 28, m: prose(t) });
    return out.done();
  },
};

/* ── 5. Two columns ───────────────────────────────────────────────────────── */

export const COLUMN_PRESETS: Record<string, [string, string]> = {
  "Do / Don't": ["Do", "Don't"],
  "Myth / Fact": ["Myth", "Fact"],
  "Before / After": ["Before", "After"],
  "Us / Them": ["Us", "Them"],
  "Old way / New way": ["Old way", "New way"],
};

const COMPARE: Block = {
  id: "compare",
  label: "Two columns",
  hint: "Do / Don't, Myth / Fact, Before / After",
  fields: [
    { key: "preset", label: "Columns", kind: "choice", options: [...Object.keys(COLUMN_PRESETS), "Custom"] },
    { key: "left", label: "Left heading", kind: "text", hint: "Only for Custom" },
    { key: "right", label: "Right heading", kind: "text", hint: "Only for Custom" },
    { key: "rows", label: "Rows", kind: "lines", placeholder: "Cut on the beat | Cut on movement", hint: "left | right, one row per line" },
  ],
  defaults: { preset: "Do / Don't", left: "", right: "", rows: "One thing | The better thing\nAnother | Its better version" },
  minBox: { w: 640, h: 360 },
  build: (f, box, ctx) => {
    const out = new Out("compare", ctx);
    const t = ctx.theme;
    const [lh, rh] = COLUMN_PRESETS[f.preset ?? ""] ?? [f.left || "Left", f.right || "Right"];
    const rows = linesOf(f.rows).slice(0, 6).map(cells);
    const gap = 24;
    const colW = (box.w - gap) / 2;
    const headH = 72;
    out.add("rect", "Left card", { x: box.x, y: box.y, w: colW, h: box.h }, surface(t), { radius: 24 });
    out.add("rect", "Right card", { x: box.x + colW + gap, y: box.y, w: colW, h: box.h }, mix(t.bg, t.accent, 0.14), { radius: 24 });
    out.text("Left heading", lh, { x: box.x + 32, y: box.y + 28, w: colW - 64, h: headH }, t.muted, { max: 40, weight: 700, m: display(t) });
    out.text("Right heading", rh, { x: box.x + colW + gap + 32, y: box.y + 28, w: colW - 64, h: headH }, t.accent, { max: 40, weight: 700, m: display(t) });
    const rowH = (box.h - headH - 56) / Math.max(1, rows.length);
    rows.forEach(([l = "", r = ""], i) => {
      const y = box.y + headH + 40 + i * rowH;
      out.text(`Left ${i + 1}`, l, { x: box.x + 32, y, w: colW - 64, h: rowH - 12 }, t.muted, { max: 34, m: prose(t) });
      out.text(`Right ${i + 1}`, r, { x: box.x + colW + gap + 32, y, w: colW - 64, h: rowH - 12 }, t.fg, { max: 34, weight: 600, m: prose(t) });
    });
    return out.done();
  },
};

/* ── 6. Before and after ──────────────────────────────────────────────────── */

const BEFORE_AFTER: Block = {
  id: "before-after",
  label: "Before and after",
  hint: "Two pictures or two texts, with a divider",
  fields: [
    { key: "mode", label: "Show", kind: "choice", options: ["pictures", "words"] },
    { key: "left", label: "Left label", kind: "text", placeholder: "Before" },
    { key: "right", label: "Right label", kind: "text", placeholder: "After" },
    { key: "leftText", label: "Left words", kind: "text", hint: "Only when showing words" },
    { key: "rightText", label: "Right words", kind: "text", hint: "Only when showing words" },
  ],
  defaults: { mode: "pictures", left: "Before", right: "After", leftText: "", rightText: "" },
  minBox: { w: 640, h: 400 },
  build: (f, box, ctx) => {
    const out = new Out("before-after", ctx);
    const t = ctx.theme;
    const half = (box.w - 8) / 2;
    const labelH = 56;
    const bodyH = box.h - labelH - 20;
    if (f.mode === "words") {
      out.add("rect", "Left card", { x: box.x, y: box.y + labelH + 20, w: half, h: bodyH }, surface(t), { radius: 20 });
      out.add("rect", "Right card", { x: box.x + half + 8, y: box.y + labelH + 20, w: half, h: bodyH }, mix(t.bg, t.accent, 0.14), { radius: 20 });
      out.text("Left words", f.leftText ?? "", { x: box.x + 28, y: box.y + labelH + 48, w: half - 56, h: bodyH - 56 }, t.muted, { max: 40, m: prose(t) });
      out.text("Right words", f.rightText ?? "", { x: box.x + half + 36, y: box.y + labelH + 48, w: half - 56, h: bodyH - 56 }, t.fg, { max: 40, weight: 600, m: prose(t) });
    } else {
      out.add("image", "Left picture", { x: box.x, y: box.y + labelH + 20, w: half, h: bodyH }, t.muted, { radius: 20, fit: "cover" });
      out.add("image", "Right picture", { x: box.x + half + 8, y: box.y + labelH + 20, w: half, h: bodyH }, t.muted, { radius: 20, fit: "cover" });
    }
    // The divider is its own layer on purpose: Batch 23 can sit it on a slide
    // boundary without rebuilding the block.
    out.add("rect", "Divider", { x: box.x + half + 2, y: box.y + labelH + 20, w: 4, h: bodyH }, t.accent, { radius: 2 });
    out.text("Left label", f.left || "Before", { x: box.x, y: box.y, w: half, h: labelH }, t.muted, { max: 34, weight: 700, m: display(t), extra: { uppercase: true, letterSpacing: 0.06 } });
    out.text("Right label", f.right || "After", { x: box.x + half + 8, y: box.y, w: half, h: labelH }, t.accent, { max: 34, weight: 700, m: display(t), extra: { uppercase: true, letterSpacing: 0.06 } });
    return out.done();
  },
};

/* ── 7. Timeline ──────────────────────────────────────────────────────────── */

/** Tall boards (9:16) run the timeline down the slide; everything else across. */
export const timelineIsVertical = (board: { w: number; h: number }): boolean => board.h / board.w > 1.6;

const TIMELINE: Block = {
  id: "timeline",
  label: "Timeline",
  hint: "3 to 6 points, each a label and a short line",
  fields: [{ key: "points", label: "Points", kind: "lines", placeholder: "2019 | Started editing\n2022 | First client\n2025 | 61K followers", hint: "label | short line" }],
  defaults: { points: "Start | Where it began\nMiddle | What changed\nNow | Where it is" },
  minBox: { w: 640, h: 320 },
  build: (f, box, ctx) => {
    const out = new Out("timeline", ctx);
    const t = ctx.theme;
    const points = linesOf(f.points).slice(0, 6).map(cells);
    if (linesOf(f.points).length > 6) out.notes.push("Six points at most.");
    const n = Math.max(1, points.length);
    const dot = 28;
    if (timelineIsVertical(ctx.board)) {
      const rowH = box.h / n;
      out.add("rect", "Line", { x: box.x + dot / 2 - 2, y: box.y + rowH / 2, w: 4, h: rowH * (n - 1) }, rule(t));
      points.forEach(([label = "", line = ""], i) => {
        const y = box.y + i * rowH;
        out.add("ellipse", `Dot ${i + 1}`, { x: box.x, y: y + rowH / 2 - dot / 2, w: dot, h: dot }, t.accent);
        out.text(`Label ${i + 1}`, label, { x: box.x + dot + 28, y: y + rowH * 0.1, w: box.w - dot - 28, h: rowH * 0.36 }, t.accent, { max: 34, weight: 700, m: display(t) });
        out.text(`Point ${i + 1}`, line, { x: box.x + dot + 28, y: y + rowH * 0.48, w: box.w - dot - 28, h: rowH * 0.46 }, t.fg, { max: 30, m: prose(t) });
      });
    } else {
      const colW = box.w / n;
      const lineY = box.y + box.h * 0.3;
      out.add("rect", "Line", { x: box.x + colW / 2, y: lineY - 2, w: colW * (n - 1), h: 4 }, rule(t));
      points.forEach(([label = "", line = ""], i) => {
        const x = box.x + i * colW;
        out.text(`Label ${i + 1}`, label, { x: x + 8, y: box.y, w: colW - 16, h: lineY - box.y - dot }, t.accent, { max: 34, weight: 700, m: display(t), extra: { align: "center", valign: "bottom" } });
        out.add("ellipse", `Dot ${i + 1}`, { x: x + colW / 2 - dot / 2, y: lineY - dot / 2, w: dot, h: dot }, t.accent);
        out.text(`Point ${i + 1}`, line, { x: x + 8, y: lineY + dot, w: colW - 16, h: box.y + box.h - lineY - dot }, t.fg, { max: 28, m: prose(t), extra: { align: "center" } });
      });
    }
    return out.done();
  },
};

/* ── 8. Table ─────────────────────────────────────────────────────────────── */

const TABLE: Block = {
  id: "table",
  label: "Table",
  hint: "Up to 4 columns and 6 rows",
  fields: [{ key: "rows", label: "Rows", kind: "lines", placeholder: "Tool | Price | Best for\nA | $9 | Solo\nB | $29 | Teams", hint: "First line is the header. Cells split with |" }],
  defaults: { rows: "Column | Column | Column\nCell | Cell | Cell\nCell | Cell | Cell" },
  minBox: { w: 640, h: 300 },
  build: (f, box, ctx) => {
    const out = new Out("table", ctx);
    const t = ctx.theme;
    const all = linesOf(f.rows).map(cells);
    const [head = [], ...body] = all;
    const cols = Math.min(4, Math.max(1, ...all.map((r) => r.length)));
    if (all.some((r) => r.length > 4)) out.notes.push("Four columns at most; the rest were left off.");
    if (body.length > 6) out.notes.push(`${body.length} rows will not read at phone size. Split it across slides rather than shrinking it.`);
    const rows = [head, ...body.slice(0, 6)];
    const rowH = box.h / rows.length;
    const colW = box.w / cols;
    out.add("rect", "Header band", { x: box.x, y: box.y, w: box.w, h: rowH }, mix(t.bg, t.accent, 0.18), { radius: 12 });
    rows.forEach((row, r) => {
      if (r > 1) out.add("rect", `Rule ${r}`, { x: box.x, y: box.y + r * rowH - 1, w: box.w, h: 2 }, rule(t));
      for (let c = 0; c < cols; c += 1) {
        out.text(r === 0 ? `Header ${c + 1}` : `Cell ${r}.${c + 1}`, row[c] ?? "", { x: box.x + c * colW + 20, y: box.y + r * rowH + rowH * 0.15, w: colW - 40, h: rowH * 0.7 }, r === 0 ? t.fg : t.muted, {
          max: 32,
          weight: r === 0 ? 700 : 500,
          m: prose(t),
          extra: { valign: "middle" },
        });
      }
    });
    return out.done();
  },
  // Every part keeps the header, so slide 2 of a table is still a table.
  split: (f, parts) => {
    const [head = "", ...body] = linesOf(f.rows);
    const size = Math.ceil(body.length / Math.max(1, parts));
    const out: Fields[] = [];
    for (let i = 0; i < body.length; i += size) out.push({ ...f, rows: [head, ...body.slice(i, i + size)].join("\n") });
    return out;
  },
};

/* ── 9. Chart (19.3) ──────────────────────────────────────────────────────── */

export type Datum = { label: string; value: number };

/** `Q1, 40` or `Q1: 40` or `Q1 40`, one per line. Lines without a number are skipped. */
export function parseData(text: string | undefined): Datum[] {
  const out: Datum[] = [];
  for (const line of linesOf(text)) {
    const m = line.match(/^(.*?)[\s,:;|]+(-?\d[\d,]*(?:\.\d+)?)\s*%?$/);
    if (!m) continue;
    const value = Number((m[2] ?? "").replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    out.push({ label: (m[1] ?? "").trim(), value });
  }
  return out;
}

export const CHART_LIMITS = { bar: 8, hbar: 8, line: 12, donut: 6, progress: 1 } as const;
export type ChartKind = keyof typeof CHART_LIMITS;

const fmt = (v: number, unit: string): string => {
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return unit ? (unit === "%" ? `${s}%` : `${s}${unit}`) : s;
};

/** A donut segment from angle a0 to a1 (radians, 0 at the top, clockwise). */
function arc(cx: number, cy: number, r: number, inner: number, a0: number, a1: number): string {
  const pt = (rad: number, a: number) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)].map((n) => n.toFixed(2)).join(" ");
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(r, a0)} A${r} ${r} 0 ${large} 1 ${pt(r, a1)} L${pt(inner, a1)} A${inner} ${inner} 0 ${large} 0 ${pt(inner, a0)} Z`;
}

const CHART: Block = {
  id: "chart",
  label: "Chart",
  hint: "Bar, line, donut or progress, from pasted lines",
  fields: [
    { key: "kind", label: "Kind", kind: "choice", options: ["bar", "hbar", "line", "donut", "progress"] },
    { key: "data", label: "Data", kind: "lines", placeholder: "Q1, 40\nQ2, 55\nQ3, 61", hint: "label, value, one per line" },
    { key: "point", label: "The point", kind: "text", hint: "The one label drawn in the accent colour" },
    { key: "unit", label: "Unit", kind: "text", placeholder: "%" },
  ],
  defaults: { kind: "bar", data: "Q1, 40\nQ2, 55\nQ3, 61\nQ4, 72", point: "Q4", unit: "" },
  minBox: { w: 600, h: 400 },
  build: (f, box, ctx) => {
    const out = new Out("chart", ctx);
    const t = ctx.theme;
    const kind = (Object.keys(CHART_LIMITS).includes(f.kind ?? "") ? f.kind : "bar") as ChartKind;
    const all = parseData(f.data);
    const limit = CHART_LIMITS[kind];
    if (all.length > limit) {
      out.notes.push(`${all.length} values is more than a ${kind} chart can show at phone size. Only the first ${limit} are drawn.`);
    }
    const data = all.slice(0, limit);
    if (data.length === 0) {
      out.notes.push("No numbers found. One `label, value` per line.");
      return out.done();
    }
    const unit = (f.unit ?? "").trim();
    const point = (f.point ?? "").trim().toLowerCase();
    const colour = (d: Datum) => (point && d.label.toLowerCase() === point ? t.accent : t.muted);
    const labelM = prose(t);

    if (kind === "progress") {
      const d = data[0]!;
      const pct = Math.max(0, Math.min(100, d.value));
      const barH = Math.min(64, box.h * 0.25);
      const y = box.y + box.h - barH;
      out.text("Value", fmt(d.value, unit || "%"), { x: box.x, y: box.y, w: box.w, h: y - box.y - 24 }, t.accent, { max: 160, weight: 800, lh: 1, m: display(t), extra: { valign: "bottom" } });
      out.text("Label", d.label, { x: box.x, y: y - 72, w: box.w, h: 48 }, t.fg, { max: 32, m: labelM, extra: { align: "right" } });
      out.add("rect", "Track", { x: box.x, y, w: box.w, h: barH }, surface(t), { radius: barH / 2 });
      if (pct > 0) out.add("rect", "Fill", { x: box.x, y, w: Math.max(barH, (box.w * pct) / 100), h: barH }, t.accent, { radius: barH / 2 });
      return out.done();
    }

    if (kind === "donut") {
      if (data.some((d) => d.value < 0)) {
        out.notes.push("A donut cannot show a negative value. Use a bar chart.");
        return out.done();
      }
      const total = data.reduce((n, d) => n + d.value, 0) || 1;
      const size = Math.min(box.h, box.w * 0.55);
      const r = size / 2;
      const inner = r * 0.58;
      const cx = box.x + r;
      const cy = box.y + box.h / 2;
      let a = 0;
      const shades = [t.accent, t.muted, mix(t.muted, t.bg, 0.35), mix(t.muted, t.bg, 0.55), mix(t.fg, t.bg, 0.3), mix(t.accent, t.bg, 0.5)];
      data.forEach((d, i) => {
        const span = (d.value / total) * Math.PI * 2;
        const gapA = data.length > 1 ? 0.025 : 0;
        const fill = point ? colour(d) === t.accent ? t.accent : shades[(i % (shades.length - 1)) + 1]! : shades[i % shades.length]!;
        out.add("path", `Segment ${i + 1}`, { x: cx - r, y: cy - r, w: size, h: size }, fill, {
          path: arc(r, r, r, inner, a + gapA, a + Math.max(gapA * 2, span) - gapA),
          pathW: size,
          pathH: size,
        });
        a += span;
      });
      // Labelled directly, beside the ring: no legend for one series.
      const listX = box.x + size + 40;
      const rowH = Math.min(72, box.h / data.length);
      const startY = cy - (rowH * data.length) / 2;
      data.forEach((d, i) => {
        const fill = point ? colour(d) === t.accent ? t.accent : shades[(i % (shades.length - 1)) + 1]! : shades[i % shades.length]!;
        out.add("rect", `Key ${i + 1}`, { x: listX, y: startY + i * rowH + rowH / 2 - 10, w: 20, h: 20 }, fill, { radius: 6 });
        out.text(`Label ${i + 1}`, `${d.label}  ${fmt(d.value, unit)}`, { x: listX + 36, y: startY + i * rowH, w: box.x + box.w - listX - 36, h: rowH }, t.fg, { max: 30, m: labelM, extra: { valign: "middle" } });
      });
      return out.done();
    }

    // Bars and lines share a value axis. Zero is always on it: bars start at
    // zero, always, and a negative value draws below a visible zero line.
    const max = Math.max(0, ...data.map((d) => d.value));
    const min = Math.min(0, ...data.map((d) => d.value));
    const span = max - min || 1;

    if (kind === "hbar") {
      const labelW = Math.min(box.w * 0.3, 260);
      const valueW = 120;
      const plotX = box.x + labelW + 16;
      const plotW = box.w - labelW - 16 - valueW;
      const zeroX = plotX + (-min / span) * plotW;
      const rowH = box.h / data.length;
      const barH = Math.min(64, rowH * 0.6);
      data.forEach((d, i) => {
        const y = box.y + i * rowH + (rowH - barH) / 2;
        const len = (Math.abs(d.value) / span) * plotW;
        out.text(`Label ${i + 1}`, d.label, { x: box.x, y: box.y + i * rowH, w: labelW, h: rowH }, t.fg, { max: 30, m: labelM, extra: { align: "right", valign: "middle" } });
        out.add("rect", `Bar ${i + 1}`, { x: d.value >= 0 ? zeroX : zeroX - len, y, w: Math.max(4, len), h: barH }, colour(d), { radius: 8 });
        out.text(`Value ${i + 1}`, fmt(d.value, unit), { x: (d.value >= 0 ? zeroX + len : zeroX) + 12, y: box.y + i * rowH, w: valueW, h: rowH }, colour(d) === t.accent ? t.accent : t.fg, { max: 30, weight: 700, m: labelM, extra: { valign: "middle" } });
      });
      if (min < 0) out.add("rect", "Zero line", { x: zeroX - 1, y: box.y, w: 3, h: box.h }, t.fg);
      return out.done();
    }

    const labelH = 56;
    const valueH = 48;
    const plotY = box.y + valueH;
    const plotH = box.h - valueH - labelH - (min < 0 ? valueH : 0);
    const zeroY = plotY + (max / span) * plotH;
    const colW = box.w / data.length;

    if (kind === "line") {
      const pts = data.map((d, i) => ({ x: colW * i + colW / 2, y: plotY + ((max - d.value) / span) * plotH - box.y }));
      out.add("path", "Line", { x: box.x, y: box.y, w: box.w, h: box.h }, "none", {
        path: pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "),
        pathW: box.w,
        pathH: box.h,
        stroke: t.muted,
        strokeWidth: 6,
      });
      data.forEach((d, i) => {
        const p = pts[i]!;
        const r = colour(d) === t.accent ? 16 : 11;
        out.add("ellipse", `Point ${i + 1}`, { x: box.x + p.x - r, y: box.y + p.y - r, w: r * 2, h: r * 2 }, colour(d));
        out.text(`Value ${i + 1}`, fmt(d.value, unit), { x: box.x + colW * i, y: box.y + p.y - r - valueH, w: colW, h: valueH - 4 }, colour(d) === t.accent ? t.accent : t.fg, { max: 28, weight: 700, m: labelM, extra: { align: "center", valign: "bottom" } });
      });
    } else {
      const barW = Math.min(140, colW * 0.62);
      data.forEach((d, i) => {
        const len = (Math.abs(d.value) / span) * plotH;
        const x = box.x + colW * i + (colW - barW) / 2;
        const y = d.value >= 0 ? zeroY - len : zeroY;
        out.add("rect", `Bar ${i + 1}`, { x, y, w: barW, h: Math.max(4, len) }, colour(d), { radius: 10 });
        out.text(`Value ${i + 1}`, fmt(d.value, unit), { x: box.x + colW * i, y: d.value >= 0 ? y - valueH : y + Math.max(4, len) + 4, w: colW, h: valueH - 4 }, colour(d) === t.accent ? t.accent : t.fg, {
          max: 30,
          weight: 700,
          m: labelM,
          extra: { align: "center", valign: d.value >= 0 ? "bottom" : "top" },
        });
      });
    }
    // The zero line is always drawn when anything is negative, so a bar below
    // it reads as below zero rather than as a broken chart.
    out.add("rect", "Zero line", { x: box.x, y: zeroY - 1, w: box.w, h: min < 0 ? 3 : 2 }, min < 0 ? t.fg : rule(t));
    data.forEach((d, i) => {
      out.text(`Label ${i + 1}`, d.label, { x: box.x + colW * i, y: box.y + box.h - labelH, w: colW, h: labelH }, t.muted, { max: 26, m: labelM, extra: { align: "center", valign: "top" } });
    });
    return out.done();
  },
};

/* ── 10. Code (19.4) ──────────────────────────────────────────────────────── */

export type TokenRole = "plain" | "keyword" | "string" | "number" | "comment";
export type Token = { text: string; role: TokenRole };

const KEYWORDS: Record<string, string[]> = {
  js: "const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this null undefined true false type interface".split(" "),
  python: "def return if elif else for while in not and or is import from as class with try except finally raise lambda yield pass break continue None True False self async await".split(" "),
  yaml: "true false null yes no on off".split(" "),
  json: "true false null".split(" "),
  bash: "if then else elif fi for do done while case esac function return export echo local in".split(" "),
  css: "important inherit initial none auto".split(" "),
};

export const CODE_LANGUAGES = ["auto", "js", "python", "yaml", "json", "bash", "css"] as const;

/** A guess good enough to colour by. Never sent anywhere. */
export function guessLanguage(code: string): string {
  if (/^\s*(def|import|from)\s|:\s*$/m.test(code) && !/[{;]\s*$/m.test(code)) return "python";
  if (/^\s*[{[]/.test(code) && /"\s*:/.test(code)) return "json";
  if (/^\s*[\w-]+:\s/m.test(code) && !/[{};]/.test(code)) return "yaml";
  if (/^\s*(\$|#!|echo |export )/m.test(code)) return "bash";
  if (/^\s*[.#]?[\w-]+\s*\{[^}]*:/m.test(code)) return "css";
  return "js";
}

/**
 * Deterministic and local: comments, strings, numbers, keywords, everything
 * else. Five roles is all the brand has colours for, and all a slide needs.
 */
export function tokenize(code: string, language: string): Token[][] {
  const lang = language === "auto" ? guessLanguage(code) : language;
  const keywords = new Set(KEYWORDS[lang] ?? KEYWORDS.js!);
  const hash = lang === "python" || lang === "yaml" || lang === "bash";
  const pattern = new RegExp(
    [
      hash ? "(#.*$)" : "(\\/\\/.*$|\\/\\*.*?\\*\\/)",
      "(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)",
      "(\\b\\d+(?:\\.\\d+)?\\b)",
      "([A-Za-z_$][\\w$-]*)",
    ].join("|"),
    "g",
  );
  return code.replace(/\t/g, "  ").split("\n").map((line) => {
    const out: Token[] = [];
    let at = 0;
    const push = (text: string, role: TokenRole) => {
      if (!text) return;
      const last = out.at(-1);
      if (last && last.role === role) last.text += text;
      else out.push({ text, role });
    };
    for (const m of line.matchAll(pattern)) {
      const i = m.index ?? 0;
      push(line.slice(at, i), "plain");
      if (m[1]) push(m[1], "comment");
      else if (m[2]) push(m[2], "string");
      else if (m[3]) push(m[3], "number");
      else push(m[4] ?? "", keywords.has(m[4] ?? "") ? "keyword" : "plain");
      at = i + m[0].length;
    }
    push(line.slice(at), "plain");
    return out;
  });
}

/**
 * One role's characters, everything else blanked to spaces.
 *
 * The trick that makes highlighting possible without styled runs: one text
 * layer per role, all the same size and position, each holding the whole
 * snippet with the other roles' characters replaced by spaces. Monospace keeps
 * every layer on the same character grid whatever the real font's advance is,
 * so the tokens line up exactly and nothing is positioned token by token.
 */
export function plane(lines: Token[][], role: TokenRole): string {
  return lines
    .map((line) => line.map((tok) => (tok.role === role ? tok.text : " ".repeat([...tok.text].length))).join("").replace(/\s+$/, ""))
    .join("\n");
}

const MONO: Measure = { family: "mono" };

const CODE: Block = {
  id: "code",
  label: "Code",
  hint: "Monospace, highlighted, never re-wrapped",
  fields: [
    { key: "code", label: "Code", kind: "lines", placeholder: "const cut = beat ? 'late' : 'now';" },
    { key: "language", label: "Language", kind: "choice", options: [...CODE_LANGUAGES] },
  ],
  defaults: { code: "function cut(frame) {\n  // on the movement, not the beat\n  return frame.motion > 0.4;\n}", language: "auto" },
  minBox: { w: 640, h: 260 },
  build: (f, box, ctx) => {
    const out = new Out("code", ctx);
    const t = ctx.theme;
    // Kept raw: indentation is meaning in Python and YAML, so lines are never trimmed.
    const source = (f.code ?? "").replace(/\s+$/, "");
    const lines = tokenize(source, f.language ?? "auto");
    const pad = 36;
    const lh = 1.45;
    const innerW = box.w - pad * 2;
    const innerH = box.h - pad * 2;
    const longest = Math.max(1, ...source.split("\n").map((l) => [...l.replace(/\t/g, "  ")].length));
    // The biggest step of the ladder at which every line fits ACROSS and the
    // whole snippet fits DOWN. Never soft-wrapped: a wrapped line can change
    // meaning, so over the width it is reported, not reflowed.
    const sizes = steps(34);
    let size = sizes.at(-1)!;
    for (const s of sizes) {
      if (textWidth("m".repeat(longest), s, MONO) <= innerW && lines.length * s * lh <= innerH) {
        size = s;
        break;
      }
    }
    const fitsAcross = textWidth("m".repeat(longest), size, MONO) <= innerW;
    const fitsDown = lines.length * size * lh <= innerH;
    if (!fitsAcross) out.overflow.push("Code (lines too long)");
    if (!fitsDown) out.overflow.push("Code (too many lines)");
    if (!fitsAcross || !fitsDown) {
      out.notes.push("Code is never re-wrapped, because a wrapped line can change what it means. Shorten the lines, or split the snippet across slides.");
    }

    out.add("rect", "Panel", box, mix(t.bg, t.fg, 0.06), { radius: 24, stroke: rule(t), strokeWidth: 2 });
    const colours: Record<TokenRole, string> = {
      plain: t.fg,
      keyword: t.accent,
      string: mix(t.fg, t.accent, 0.5),
      number: t.accent,
      comment: t.muted,
    };
    // Wide enough that no line can wrap: wrapping differently in two planes
    // would break the alignment the planes depend on.
    const w = Math.max(innerW, textWidth("m".repeat(longest), size, MONO) + size);
    const h = Math.max(lines.length * size * lh, size * lh);
    for (const role of ["plain", "keyword", "string", "number", "comment"] as TokenRole[]) {
      const text = plane(lines, role);
      if (!text.trim()) continue;
      out.add("text", `Code ${role}`, { x: box.x + pad, y: box.y + pad, w, h }, colours[role], {
        text,
        fontFamily: "mono",
        fontSize: size,
        fontWeight: role === "keyword" ? 700 : 500,
        lineHeight: lh,
        italic: role === "comment",
      });
    }
    return out.done();
  },
  // By lines, kept raw: a code split must never trim, because indentation is
  // part of what the code says.
  split: (f, parts) => {
    const raw = (f.code ?? "").replace(/\s+$/, "").split("\n");
    const size = Math.ceil(raw.length / Math.max(1, parts));
    const out: Fields[] = [];
    for (let i = 0; i < raw.length; i += size) out.push({ ...f, code: raw.slice(i, i + size).join("\n") });
    return out;
  },
};

/* ── 11. Post card, 12. Testimonial (19.5) ────────────────────────────────── */

const POST_CARD: Block = {
  id: "post-card",
  label: "Post card",
  hint: "Looks like a post. Your own name only",
  fields: [
    { key: "text", label: "Post", kind: "text", placeholder: "What you posted" },
    { key: "picture", label: "Picture", kind: "choice", options: ["no", "yes"] },
  ],
  defaults: { text: "The thing you said, the way you said it.", picture: "no" },
  minBox: { w: 640, h: 300 },
  build: (f, box, ctx) => {
    const out = new Out("post-card", ctx);
    const t = ctx.theme;
    // Filled ONLY from the deck's own identity. There is no field for a name or
    // a handle: a post card that could be set to somebody else's is a fake
    // screenshot generator. No platform logo, no verified mark, no numbers.
    const id = ctx.identity;
    const name = id?.name?.trim() || "Your name";
    const handle = id?.handles?.instagram ?? id?.handles?.x ?? Object.values(id?.handles ?? {})[0] ?? "";
    if (!id?.name) out.notes.push("Add your name and avatar to the brand to fill this in. It only ever shows your own identity.");
    out.add("rect", "Card", box, surface(t), { radius: 28, stroke: rule(t), strokeWidth: 2 });
    const av = 88;
    if (id?.avatarSrc) {
      out.add("image", "Avatar", { x: box.x + 36, y: box.y + 36, w: av, h: av }, t.muted, { src: id.avatarSrc, ...(id.avatar ? { assetId: id.avatar } : {}), radius: av / 2, fit: "cover" });
    } else {
      out.add("ellipse", "Avatar", { x: box.x + 36, y: box.y + 36, w: av, h: av }, t.muted);
    }
    out.text("Name", name, { x: box.x + 36 + av + 24, y: box.y + 40, w: box.w - av - 96, h: 44 }, t.fg, { max: 34, weight: 700, m: display(t) });
    if (handle) out.text("Handle", handle, { x: box.x + 36 + av + 24, y: box.y + 86, w: box.w - av - 96, h: 36 }, t.muted, { max: 26, m: prose(t) });
    const textY = box.y + 36 + av + 28;
    const pic = f.picture === "yes";
    const textH = (box.y + box.h - 36 - textY) * (pic ? 0.4 : 1);
    out.text("Post", f.text ?? "", { x: box.x + 36, y: textY, w: box.w - 72, h: textH }, t.fg, { max: 38, m: prose(t) });
    if (pic) out.add("image", "Picture", { x: box.x + 36, y: textY + textH + 20, w: box.w - 72, h: box.y + box.h - 36 - textY - textH - 20 }, t.muted, { radius: 16, fit: "cover" });
    return out.done();
  },
};

/** What an empty testimonial says. The pre-flight treats it as a placeholder. */
export const TESTIMONIAL_PLACEHOLDER = "Their words go here";

const TESTIMONIAL: Block = {
  id: "testimonial",
  label: "Testimonial",
  hint: "A client's words. Never written by a model",
  fields: [
    { key: "words", label: "Their words", kind: "text", hint: "Exactly what they said. Left empty, the pre-flight will stop it shipping blank." },
    { key: "name", label: "Name", kind: "text" },
    { key: "role", label: "Role", kind: "text" },
  ],
  defaults: { words: "", name: "", role: "" },
  minBox: { w: 600, h: 320 },
  build: (f, box, ctx) => {
    const out = new Out("testimonial", ctx);
    const t = ctx.theme;
    const words = (f.words ?? "").trim() || TESTIMONIAL_PLACEHOLDER;
    out.add("rect", "Card", box, surface(t), { radius: 28 });
    icon(out, "Mark", "quote", { x: box.x + 36, y: box.y + 32, w: 64, h: 64 }, t.accent, 2.6);
    const body = out.text("Words", words, { x: box.x + 36, y: box.y + 116, w: box.w - 72, h: box.h - 116 - 110 }, t.fg, { max: 44, weight: 500, m: display(t) });
    const y = box.y + 116 + body.height + 28;
    out.text("Name", (f.name ?? "").trim() || "Name", { x: box.x + 36, y, w: box.w - 72, h: 40 }, t.fg, { max: 30, weight: 700, m: prose(t) });
    out.text("Role", (f.role ?? "").trim() || "Role", { x: box.x + 36, y: y + 44, w: box.w - 72, h: 36 }, t.muted, { max: 24, m: prose(t) });
    return out.done();
  },
};

/* ── 13. Annotation ───────────────────────────────────────────────────────── */

const ANNOTATION: Block = {
  id: "annotation",
  label: "Annotation",
  hint: "A picture, a note, and an arrow to the point",
  fields: [
    { key: "note", label: "Note", kind: "text", placeholder: "Cut here, on the movement" },
    { key: "targetX", label: "Point across (%)", kind: "text", placeholder: "60" },
    { key: "targetY", label: "Point down (%)", kind: "text", placeholder: "40" },
  ],
  defaults: { note: "This is the bit that matters", targetX: "62", targetY: "38" },
  minBox: { w: 600, h: 420 },
  build: (f, box, ctx) => {
    const out = new Out("annotation", ctx);
    const t = ctx.theme;
    const imgH = box.h * 0.72;
    out.add("image", "Picture", { x: box.x, y: box.y, w: box.w, h: imgH }, t.muted, { radius: 20, fit: "cover", ...(ctx.src ? { src: ctx.src } : {}) });
    const pct = (v: string | undefined, d: number) => Math.max(5, Math.min(95, Number(v) || d)) / 100;
    const tx = box.x + box.w * pct(f.targetX, 62);
    const ty = box.y + imgH * pct(f.targetY, 38);
    const noteY = box.y + imgH + 28;
    out.text("Note", f.note ?? "", { x: box.x, y: noteY, w: box.w * 0.6, h: box.y + box.h - noteY }, t.fg, { max: 36, weight: 600, m: display(t) });
    // The arrow runs from the note to the target, drawn in the frame of the
    // whole block. One group with the picture (18.6), so moving the picture
    // moves the arrow with it.
    const sx = box.x + box.w * 0.62;
    const sy = noteY + 20;
    const x0 = Math.min(sx, tx) - 24;
    const y0 = Math.min(sy, ty) - 24;
    const w = Math.abs(tx - sx) + 48;
    const h = Math.abs(ty - sy) + 48;
    const a = { x: sx - x0, y: sy - y0 };
    const b = { x: tx - x0, y: ty - y0 };
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const head = (d: number) => `${(b.x - 26 * Math.cos(ang + d)).toFixed(1)} ${(b.y - 26 * Math.sin(ang + d)).toFixed(1)}`;
    out.add("path", "Arrow", { x: x0, y: y0, w, h }, "none", {
      path: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)} M${head(0.5)} L${b.x.toFixed(1)} ${b.y.toFixed(1)} L${head(-0.5)}`,
      pathW: w,
      pathH: h,
      stroke: t.accent,
      strokeWidth: 6,
    });
    out.add("ellipse", "Target", { x: tx - 14, y: ty - 14, w: 28, h: 28 }, "none", { stroke: t.accent, strokeWidth: 5 });
    return out.done();
  },
};

/* ── 14. Screen frame, 15. Screenshot polish ──────────────────────────────── */

const FRAME: Block = {
  id: "screen-frame",
  label: "Screen frame",
  hint: "A phone, a browser or a plain card around a picture",
  fields: [{ key: "style", label: "Frame", kind: "choice", options: ["phone", "browser", "card"] }],
  defaults: { style: "browser" },
  minBox: { w: 360, h: 420 },
  build: (f, box, ctx) => {
    const out = new Out("screen-frame", ctx);
    const t = ctx.theme;
    const src = ctx.src ? { src: ctx.src } : {};
    // Generic frames drawn from shapes. No manufacturer outline, no browser
    // logo, nothing anybody holds a trademark on.
    if (f.style === "phone") {
      const h = box.h;
      const w = Math.min(box.w, h * 0.5);
      const x = box.x + (box.w - w) / 2;
      out.add("rect", "Body", { x, y: box.y, w, h }, mix(t.fg, t.bg, 0.15), { radius: w * 0.14 });
      out.add("image", "Screen", { x: x + 14, y: box.y + 14, w: w - 28, h: h - 28 }, t.muted, { radius: w * 0.11, fit: "cover", ...src });
      out.add("rect", "Notch", { x: x + w * 0.36, y: box.y + 26, w: w * 0.28, h: 22 }, mix(t.fg, t.bg, 0.15), { radius: 11 });
    } else if (f.style === "card") {
      out.add("image", "Screen", box, t.muted, { radius: 24, fit: "cover", shadow: { y: 18, blur: 48, colour: "rgba(0,0,0,0.35)" }, ...src });
    } else {
      const bar = 56;
      out.add("rect", "Window", box, surface(t), { radius: 20, stroke: rule(t), strokeWidth: 2, shadow: { y: 18, blur: 48, colour: "rgba(0,0,0,0.3)" } });
      [0, 1, 2].forEach((i) => out.add("ellipse", `Light ${i + 1}`, { x: box.x + 24 + i * 30, y: box.y + bar / 2 - 9, w: 18, h: 18 }, rule(t)));
      out.add("rect", "Address", { x: box.x + 130, y: box.y + 14, w: box.w - 160, h: bar - 28 }, mix(t.bg, t.fg, 0.14), { radius: 14 });
      out.add("image", "Screen", { x: box.x + 2, y: box.y + bar, w: box.w - 4, h: box.h - bar - 2 }, t.muted, { radius: 0, fit: "cover", ...src });
    }
    return out.done();
  },
};

const POLISH: Block = {
  id: "screenshot-polish",
  label: "Screenshot polish",
  hint: "Padding, rounded corners, a shadow and a backdrop",
  fields: [
    { key: "padding", label: "Padding", kind: "choice", options: ["medium", "small", "large"] },
    { key: "shadow", label: "Shadow", kind: "choice", options: ["yes", "no"] },
    { key: "backdrop", label: "Backdrop", kind: "choice", options: ["accent", "soft", "none"] },
  ],
  defaults: { padding: "medium", shadow: "yes", backdrop: "accent" },
  minBox: { w: 480, h: 360 },
  build: (f, box, ctx) => {
    const out = new Out("screenshot-polish", ctx);
    const t = ctx.theme;
    const pad = f.padding === "small" ? 32 : f.padding === "large" ? 88 : 56;
    if (f.backdrop !== "none") {
      out.add("rect", "Backdrop", box, f.backdrop === "soft" ? surface(t) : t.accent, { radius: 32 });
    }
    out.add("image", "Screenshot", { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 }, t.muted, {
      radius: 18,
      fit: "cover",
      ...(f.shadow !== "no" ? { shadow: { y: 20, blur: 50, colour: "rgba(0,0,0,0.35)" } } : {}),
      ...(ctx.src ? { src: ctx.src } : {}),
    });
    return out.done();
  },
};

/* ── 16. QR code ──────────────────────────────────────────────────────────── */

/**
 * The smallest a code is drawn, in artboard pixels. A 1080px slide shows at
 * roughly 400 CSS pixels in a phone feed, so 300 here is about 110 on screen,
 * which a phone camera reads from the same phone's screenshot or a second one.
 */
export const QR_MIN = 300;

/** The modules as one path, plus how many there are a side. Encoded locally. */
export function qrPath(url: string): { path: string; modules: number } {
  const qr = qrcode(0, "M");
  qr.addData(url || " ");
  qr.make();
  const n = qr.getModuleCount();
  const parts: string[] = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) parts.push(`M${c} ${r}h1v1h-1z`);
  }
  return { path: parts.join(""), modules: n };
}

const QR: Block = {
  id: "qr",
  label: "QR code",
  hint: "A link, generated on this device",
  fields: [{ key: "url", label: "Link", kind: "text", placeholder: "https://" }],
  defaults: { url: "https://" },
  minBox: { w: QR_MIN, h: QR_MIN },
  build: (f, box, ctx) => {
    const out = new Out("qr", ctx);
    const t = ctx.theme;
    const size = Math.max(QR_MIN, Math.min(box.w, box.h));
    if (Math.min(box.w, box.h) < QR_MIN) out.notes.push(`Drawn at ${QR_MIN}px, the smallest a phone can scan at feed size.`);
    const { path, modules } = qrPath((f.url ?? "").trim());
    // Contrast checked: the brand's own pair when it is strong enough and dark
    // on light, which is the way round every scanner expects; black on white
    // when it is not.
    const darkOnLight = contrast(t.fg, t.bg) >= 7 && contrast(t.fg, "#ffffff") > contrast(t.bg, "#ffffff");
    const ink = darkOnLight ? t.fg : "#000000";
    const paper = darkOnLight ? t.bg : "#ffffff";
    const quiet = size * 0.06;
    out.add("rect", "Quiet zone", { x: box.x, y: box.y, w: size, h: size }, paper, { radius: 16 });
    out.add("path", "Code", { x: box.x + quiet, y: box.y + quiet, w: size - quiet * 2, h: size - quiet * 2 }, ink, {
      path,
      pathW: modules,
      pathH: modules,
    });
    return out.done();
  },
};

/* ── 17. Icon grid, 18. Question, 19. Section title ───────────────────────── */

export const ICON_NAMES = Object.keys(ICON_PATHS);

const ICON_GRID: Block = {
  id: "icon-grid",
  label: "Icon grid",
  hint: "3 to 6 icons with labels",
  fields: [{ key: "items", label: "Items", kind: "lines", placeholder: "zap | Fast\ncheck | Simple\nstar | Loved", hint: `icon | label. Icons: ${ICON_NAMES.join(", ")}` }],
  defaults: { items: "zap | Fast\ncheck | Simple\nstar | Loved" },
  minBox: { w: 600, h: 300 },
  build: (f, box, ctx) => {
    const out = new Out("icon-grid", ctx);
    const t = ctx.theme;
    const items = linesOf(f.items).slice(0, 6).map(cells);
    const cols = items.length === 4 ? 2 : Math.min(3, items.length);
    const rows = Math.ceil(items.length / Math.max(1, cols));
    const cw = box.w / Math.max(1, cols);
    const rh = box.h / Math.max(1, rows);
    const size = Math.min(88, rh * 0.45, cw * 0.4);
    items.forEach(([name = "", label = ""], i) => {
      const glyph = ICON_PATHS[name.toLowerCase()] ? name.toLowerCase() : "star";
      const x = box.x + (i % cols) * cw;
      const y = box.y + Math.floor(i / cols) * rh;
      out.add("rect", `Tile ${i + 1}`, { x: x + cw / 2 - size * 0.8, y: y + 8, w: size * 1.6, h: size * 1.6 }, mix(t.bg, t.accent, 0.14), { radius: size * 0.4 });
      icon(out, `Icon ${i + 1}`, glyph, { x: x + cw / 2 - size / 2, y: y + 8 + size * 0.3, w: size, h: size }, t.accent, 2.4);
      out.text(`Label ${i + 1}`, label, { x: x + 12, y: y + 8 + size * 1.6 + 16, w: cw - 24, h: rh - size * 1.6 - 32 }, t.fg, { max: 32, weight: 600, m: prose(t), extra: { align: "center" } });
    });
    return out.done();
  },
};

const QUESTION: Block = {
  id: "question",
  label: "Question",
  hint: "A prompt and 2 to 4 options",
  fields: [
    { key: "prompt", label: "Question", kind: "text", placeholder: "Which one are you?" },
    { key: "options", label: "Options", kind: "lines", placeholder: "Cut on the beat\nCut on movement" },
  ],
  defaults: { prompt: "Which one are you?", options: "The first kind\nThe second kind\nThe third kind" },
  minBox: { w: 600, h: 360 },
  build: (f, box, ctx) => {
    const out = new Out("question", ctx);
    const t = ctx.theme;
    const options = linesOf(f.options).slice(0, 4);
    const promptH = box.h * 0.3;
    out.text("Question", f.prompt ?? "", { x: box.x, y: box.y, w: box.w, h: promptH }, t.fg, { max: 56, weight: 700, m: display(t), extra: { valign: "bottom" } });
    const rowH = (box.h - promptH - 32) / Math.max(1, options.length);
    options.forEach((o, i) => {
      const y = box.y + promptH + 32 + i * rowH;
      const h = rowH - 16;
      out.add("rect", `Option ${i + 1}`, { x: box.x, y, w: box.w, h }, "none", { stroke: rule(t), strokeWidth: 3, radius: h / 2 });
      out.text(`Letter ${i + 1}`, String.fromCharCode(65 + i), { x: box.x + 24, y, w: h, h }, t.accent, { max: Math.round(h * 0.45), weight: 800, lh: 1, m: display(t), extra: { valign: "middle" } });
      out.text(`Answer ${i + 1}`, o, { x: box.x + 24 + h, y: y + h * 0.1, w: box.w - 48 - h, h: h * 0.8 }, t.fg, { max: 34, m: prose(t), extra: { valign: "middle" } });
    });
    return out.done();
  },
};

const SECTION: Block = {
  id: "section",
  label: "Section title",
  hint: "The \"Part 2\" divider in a long deck",
  fields: [
    { key: "number", label: "Number", kind: "text", placeholder: "02" },
    { key: "title", label: "Title", kind: "text", placeholder: "The fix" },
  ],
  defaults: { number: "02", title: "The next part" },
  minBox: { w: 480, h: 320 },
  build: (f, box, ctx) => {
    const out = new Out("section", ctx);
    const t = ctx.theme;
    const numH = box.h * 0.5;
    out.text("Number", f.number ?? "", { x: box.x, y: box.y, w: box.w, h: numH }, t.accent, { max: 200, weight: 800, lh: 1, m: { ...display(t), letterSpacing: -0.04 }, extra: { letterSpacing: -0.04, valign: "bottom" } });
    out.add("rect", "Rule", { x: box.x, y: box.y + numH + 24, w: 120, h: 8 }, t.accent, { radius: 4 });
    out.text("Title", f.title ?? "", { x: box.x, y: box.y + numH + 60, w: box.w, h: box.h - numH - 60 }, t.fg, { max: 72, weight: 700, m: display(t) });
    return out.done();
  },
};

/* ── the library ──────────────────────────────────────────────────────────── */

/**
 * Nineteen, and it stops there until somebody asks for the twentieth. Each is
 * a decision a person makes by hand today; a twentieth nobody asked for is a
 * menu item.
 */
export const BLOCKS: Block[] = [
  CHECKLIST,
  STEPS,
  STAT,
  QUOTE,
  COMPARE,
  BEFORE_AFTER,
  TIMELINE,
  TABLE,
  CHART,
  CODE,
  POST_CARD,
  TESTIMONIAL,
  ANNOTATION,
  FRAME,
  POLISH,
  QR,
  ICON_GRID,
  QUESTION,
  SECTION,
];

export const blockById = (id: string): Block | undefined => BLOCKS.find((b) => b.id === id);

/** The picker's filter: label or hint, any word, case aside. */
export function searchBlocks(query: string): Block[] {
  const q = query.trim().toLowerCase();
  if (!q) return BLOCKS;
  return BLOCKS.filter((b) => `${b.label} ${b.hint} ${b.id}`.toLowerCase().includes(q));
}

/** Defaults under whatever the user has typed, so a missing field is never undefined. */
export const withDefaults = (block: Block, fields: Fields): Fields => ({ ...block.defaults, ...fields });
