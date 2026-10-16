/**
 * Compositions: one block of text in, one arranged slide out.
 *
 * These run ONCE, at generate time, and return plain layers. Nothing stays live.
 * The point is that consecutive slides do not look the same, a deck where every
 * slide is the same box of centred text reads as generated, which is the one thing
 * it must not do. Slide 1 is always the title.
 *
 * Every slide reserves an image band, above or below the text. It renders as an empty
 * placeholder until something is dropped on it, and it is an ordinary image layer the
 * whole time, movable, resizable, deletable like anything else.
 */
import { blockById, withDefaults } from "./blocks.js";
import { makeLayer, makeSlide, uid, type Layer, type Slide } from "./model.js";
import type { Theme } from "./presets.js";
import { outsideMarks } from "./marks.js";
import { rampRange, type Step } from "./ramps.js";
import { clampY, fitToBox, isRtl, ladder, lineCount, type Measure } from "./text.js";
import { markColourFor } from "./texteffects.js";

/**
 * How far type may shrink before splitting is the better answer, as a fraction
 * of the composition's own top size.
 */
const SHRINK_FLOOR = 0.6;

const W = 1080;
const H = 1350;

/**
 * The margin is split by AXIS, and the vertical one is the larger.
 *
 * It used to be one number, 96, and that number was smaller than Instagram's
 * safe inset, so every generated carousel failed its own pre-flight with
 * "reaches into the area Instagram covers", on every slide. A template that
 * cannot pass the check the same product runs on it is not a template.
 *
 * Instagram crops a 4:5 post to a centred square for the profile grid, which
 * takes (1350 - 1080) / 2 = 135 from the top and the bottom and NOTHING from the
 * sides. So the vertical margin has to clear 135 and the horizontal one does
 * not, one constant could only satisfy both by making every slide needlessly
 * narrow.
 *
 * 140 rather than 135 exactly: a margin equal to the boundary is a rounding
 * error away from crossing it, and a warning that fires on half your decks is a
 * warning people learn to ignore.
 */
const MX = 96;
const MY = 140;
const COL = W - MX * 2;

/** How much height the image band takes, and the air between it and the text. */
const BAND = 430;
const BAND_GAP = 56;

export type Region = { x: number; y: number; w: number; h: number };
export type ImagePlacement = "above" | "below";

/** `decor` scales every accent rule: 0 removes them, 1 is normal, 1.8 is bold. */
type Ctx = { text: string; index: number; total: number; theme: Theme; decor: number };

/**
 * The face a layer will actually be given, so it can be measured in that face.
 *
 * Fitting happened with the default (sans) metric and applyFonts ran afterwards,
 * so a mono or serif theme was sized for one typeface and then rendered in
 * another. Mono measures 15% wider against a 2% safety margin, which overflowed
 * three slides out of four on the Terminal style.
 */
const display = (t: Theme, weight: number): Measure => ({ family: t.displayFont ?? "sans", weight });
const body = (t: Theme, weight: number): Measure => ({ family: t.bodyFont ?? t.displayFont ?? "sans", weight });

/** A role's ladder: the composition's own range, or the style's ramp step (22.1). */
const range = (t: Theme, step: Step, own: [number, number]): [number, number] => rampRange(t.ramp, step, own);

/**
 * Fit text to a box by actually wrapping it.
 *
 * Everything here goes through this: the size comes off a ladder, and the HEIGHT is
 * the wrapped line count times the leading, never a guess from character count. That
 * is what stops a long hook running off the artboard.
 */
function fit(
  t: string,
  box: { w: number; h: number },
  range: [max: number, min: number],
  lineHeight: number,
  m: Measure = {},
) {
  return fitToBox(t, {
    maxWidth: box.w,
    maxHeight: box.h,
    // The ladder stops well short of its own floor. Below roughly 60% of the
    // top size a slide stops reading as designed and starts reading as crammed
    //, which is the single loudest complaint about every tool in this
    // category. Copy that needs to go lower does not get a smaller font; it
    // overflows here on purpose, and buildSlides gives it another slide.
    sizes: ladder(range[0], Math.max(range[1], Math.round(range[0] * SHRINK_FLOOR))),
    lineHeight,
    ...m,
  });
}

function text(t: string, at: Region, fill: string, extra: Partial<Layer> = {}): Layer {
  return { ...makeLayer("text", at, fill), text: t, ...extra };
}

const rect = (at: Region, fill: string, extra: Partial<Layer> = {}): Layer => ({
  ...makeLayer("rect", at, fill),
  ...extra,
});

/** An accent rule, scaled by the decoration setting and omitted entirely at zero. */
const accent = (decor: number, at: Region, fill: string, extra: Partial<Layer> = {}): Layer[] =>
  decor <= 0 ? [] : [rect({ ...at, h: Math.round(at.h * decor) }, fill, extra)];

/** Split a block into a lead line and the rest. */
function lead(t: string): [string, string] {
  const nl = t.indexOf("\n");
  if (nl > 0 && nl < 90) return [t.slice(0, nl).trim(), t.slice(nl + 1).trim()];
  const m = t.match(/^(.{4,90}?[.!?])\s+(.+)$/s);
  if (m && m[1] && m[2]) return [m[1].trim(), m[2].trim()];
  return [t.trim(), ""];
}

/** Vertically centre a block of height `h` inside a region. */
const centred = (region: Region, h: number): number => region.y + Math.max(0, (region.h - h) / 2);

type Composition = {
  id: string;
  label: string;
  /** Where this composition wants its picture. */
  image: ImagePlacement;
  /**
   * The gaps this composition is built from, smallest first (18.4).
   *
   * Read off the build below rather than invented: the air under a rule, the
   * gap between a heading and its body, `BAND_GAP` to the picture, and `MX`.
   * Tidy and the equal-gap tool snap to these, because equal gaps of 37px look
   * accidental and equal gaps of 40px look designed.
   */
  spacing: number[];
  build: (c: Ctx, region: Region) => Layer[];
};

const TITLE: Composition = {
  id: "title",
  label: "Title",
  image: "above",
  spacing: [24, 36, 56, 96],
  build: ({ text: t, theme, decor }, r) => {
    const LH = 1.06;
    const RULE = decor > 0 ? 56 : 0; // rule + the air under it
    const f = fit(t, { w: r.w, h: r.h - RULE }, range(theme, "display", [104, 40]), LH, { ...display(theme, 700), letterSpacing: -0.02 });
    // Sits in the upper third of its free space rather than on the floor of the
    // region: pinned to the bottom, a short hook stranded itself at the very edge
    // with a wall of dead space above it. A long one still grows upward from here.
    const LIFT = 0.34;
    const free = Math.max(0, r.h - RULE - f.height);
    const y = clampY(r.y + RULE + free * LIFT, f.height, r.y + RULE, r.h - RULE);
    return [
      ...accent(decor, { x: r.x, y: y - 46, w: 132, h: 10 }, theme.accent, { name: "Rule", radius: 5 }),
      text(t, { x: r.x, y, w: r.w, h: f.height }, theme.fg, {
        fontSize: f.fontSize,
        fontWeight: 700,
        lineHeight: LH,
        letterSpacing: -0.02,
        name: "Title",
      }),
    ];
  },
};

const UNDERLINE: Composition = {
  id: "underline",
  label: "Underlined",
  image: "below",
  spacing: [16, 28, 56, 96],
  build: ({ text: t, theme, decor }, r) => {
    const LH = 1.15;
    const RULE = decor > 0 ? 32 : 0;
    const f = fit(t, { w: r.w, h: r.h - RULE }, range(theme, "headline", [70, 30]), LH, display(theme, 700));
    return [
      text(t, { x: r.x, y: r.y, w: r.w, h: f.height }, theme.fg, {
        fontSize: f.fontSize,
        fontWeight: 700,
        lineHeight: LH,
        name: "Text",
      }),
      ...accent(decor, { x: r.x, y: r.y + f.height + 28, w: r.w, h: 4 }, theme.accent, {
        name: "Underline",
        radius: 2,
      }),
    ];
  },
};

const HEADING_BODY: Composition = {
  id: "heading-body",
  label: "Heading + body",
  image: "above",
  spacing: [16, 32, 56, 96],
  build: (ctx, r) => {
    const [head, rest] = lead(ctx.text);
    if (!rest) return UNDERLINE.build(ctx, r);
    const { theme } = ctx;
    const GAP = 32;
    // The heading gets at most 40% of the region; the body takes what is left, so a
    // long heading cannot squeeze the body off the slide.
    const hf = fit(head, { w: r.w, h: r.h * 0.4 }, range(theme, "subhead", [58, 30]), 1.15, display(theme, 700));
    const bf = fit(rest, { w: r.w, h: r.h - hf.height - GAP }, range(theme, "body", [40, 22]), 1.45, body(theme, 400));
    const total = hf.height + GAP + bf.height;
    const y = clampY(centred(r, total), total, r.y, r.h);
    return [
      text(head, { x: r.x, y, w: r.w, h: hf.height }, theme.fg, {
        fontSize: hf.fontSize,
        fontWeight: 700,
        lineHeight: 1.15,
        name: "Heading",
      }),
      text(rest, { x: r.x, y: y + hf.height + GAP, w: r.w, h: bf.height }, theme.muted, {
        fontSize: bf.fontSize,
        fontWeight: 400,
        lineHeight: 1.45,
        name: "Body",
      }),
    ];
  },
};

const STATEMENT: Composition = {
  id: "statement",
  label: "Statement",
  image: "below",
  spacing: [24, 40, 56, 96],
  build: ({ text: t, theme }, r) => {
    const LH = 1.18;
    const f = fit(t, { w: r.w, h: r.h }, range(theme, "headline", [76, 30]), LH, display(theme, 700));
    return [
      text(t, { x: r.x, y: clampY(centred(r, f.height), f.height, r.y, r.h), w: r.w, h: f.height }, theme.fg, {
        fontSize: f.fontSize,
        fontWeight: 700,
        lineHeight: LH,
        align: "center",
        name: "Statement",
      }),
    ];
  },
};

const NUMBERED: Composition = {
  id: "numbered",
  label: "Numbered",
  image: "below",
  spacing: [24, 36, 56, 96],
  build: ({ text: t, index, theme, decor }, r) => {
    const LH = 1.4;
    const numH = 110;
    const HEAD = numH + 24 + 6 + 36; // numeral, tick and the air around them
    const f = fit(t, { w: r.w, h: r.h - HEAD }, range(theme, "subhead", [46, 22]), LH, display(theme, 500));
    const total = HEAD + f.height;
    const y = clampY(centred(r, total), total, r.y, r.h);
    return [
      text(String(index + 1).padStart(2, "0"), { x: r.x, y, w: 240, h: numH }, theme.accent, {
        fontSize: 100,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: -0.04,
        name: "Number",
      }),
      ...accent(decor, { x: r.x, y: y + numH + 24, w: 72, h: 6 }, theme.accent, {
        name: "Tick",
        radius: 3,
      }),
      text(t, { x: r.x, y: y + HEAD, w: r.w, h: f.height }, theme.fg, {
        fontSize: f.fontSize,
        fontWeight: 500,
        lineHeight: LH,
        name: "Text",
      }),
    ];
  },
};

const QUOTE: Composition = {
  id: "quote",
  label: "Quote",
  image: "above",
  spacing: [24, 44, 56, 96],
  build: ({ text: t, theme, decor }, r) => {
    const LH = 1.25;
    const INDENT = 44;
    const f = fit(t, { w: r.w - INDENT, h: r.h }, range(theme, "subhead", [62, 26]), LH, display(theme, 500));
    const y = clampY(centred(r, f.height), f.height, r.y, r.h);
    return [
      ...(decor > 0
        ? [rect({ x: r.x, y, w: Math.round(8 * decor), h: f.height }, theme.accent, { name: "Bar", radius: 4 })]
        : []),
      text(t, { x: r.x + INDENT, y, w: r.w - INDENT, h: f.height }, theme.fg, {
        fontSize: f.fontSize,
        fontWeight: 500,
        lineHeight: LH,
        italic: true,
        name: "Quote",
      }),
    ];
  },
};

const BLOCK: Composition = {
  id: "block",
  label: "Colour block",
  image: "above",
  spacing: [28, 56, 64, 96],
  build: ({ text: t, theme }, r) => {
    const LH = 1.2;
    const MIN_PAD = 28;
    const f = fit(t, { w: r.w, h: r.h - MIN_PAD * 2 }, range(theme, "headline", [68, 26]), LH, display(theme, 700));
    const padY = Math.min(64, Math.max(MIN_PAD, (r.h - f.height) / 2));
    const blockH = Math.min(r.h, f.height + padY * 2);
    const y = clampY(centred(r, blockH), blockH, r.y, r.h);
    return [
      rect({ x: 0, y, w: W, h: blockH }, theme.accent, { name: "Block" }),
      text(t, { x: r.x, y: y + (blockH - f.height) / 2, w: r.w, h: f.height }, theme.bg, {
        fontSize: f.fontSize,
        fontWeight: 700,
        lineHeight: LH,
        align: "center",
        name: "Text",
      }),
    ];
  },
};

const CAPS: Composition = {
  id: "caps",
  label: "Caps",
  image: "below",
  spacing: [24, 40, 56, 96],
  build: ({ text: t, theme }, r) => {
    const LH = 1.3;
    // Measured uppercased and tracked out, since that is what actually renders.
    const m: Measure = { ...display(theme, 700), letterSpacing: 0.06, uppercase: true };
    const f = fit(t, { w: r.w, h: r.h }, range(theme, "headline", [56, 22]), LH, m);
    return [
      text(t, { x: r.x, y: clampY(centred(r, f.height), f.height, r.y, r.h), w: r.w, h: f.height }, theme.fg, {
        fontSize: f.fontSize,
        fontWeight: 700,
        lineHeight: LH,
        letterSpacing: 0.06,
        uppercase: true,
        align: "center",
        name: "Text",
      }),
    ];
  },
};

/* ── the catalogue for cycling (25.2) ─────────────────────────────────────── */

/**
 * Five more for a headline and a body, so `L` has at least six real layouts
 * for the commonest slide there is. They are not in the generation cycle, so
 * nothing generated before Batch 25 changes; they are reached by cycling.
 *
 * Each falls back to a sensible single block when there is no body, so a
 * headline-only slide cycled onto one still reads.
 */

/** Heading and body, both centred, the body a step quieter. */
const CENTRED_PAIR: Composition = {
  id: "centred-pair",
  label: "Centred pair",
  image: "above",
  spacing: [16, 28, 56, 96],
  build: (ctx, r) => {
    const [head, rest] = lead(ctx.text);
    const { theme } = ctx;
    const GAP = 28;
    const hf = fit(head, { w: r.w, h: r.h * (rest ? 0.42 : 1) }, range(theme, "subhead", [64, 30]), 1.15, display(theme, 700));
    const bf = rest ? fit(rest, { w: r.w, h: r.h - hf.height - GAP }, range(theme, "body", [40, 22]), 1.45, body(theme, 400)) : null;
    const total = hf.height + (bf ? GAP + bf.height : 0);
    const y = clampY(centred(r, total), total, r.y, r.h);
    return [
      text(head, { x: r.x, y, w: r.w, h: hf.height }, theme.fg, { fontSize: hf.fontSize, fontWeight: 700, lineHeight: 1.15, align: "center", name: "Heading" }),
      ...(bf && rest
        ? [text(rest, { x: r.x, y: y + hf.height + GAP, w: r.w, h: bf.height }, theme.muted, { fontSize: bf.fontSize, fontWeight: 400, lineHeight: 1.45, align: "center", name: "Body" })]
        : []),
    ];
  },
};

/** A vertical accent rule down the left of the heading and body. */
const SIDE_RULE: Composition = {
  id: "side-rule",
  label: "Side rule",
  image: "below",
  spacing: [16, 28, 40, 96],
  build: (ctx, r) => {
    const [head, rest] = lead(ctx.text);
    const { theme, decor } = ctx;
    const INDENT = 48;
    const GAP = 24;
    const w = r.w - INDENT;
    const hf = fit(head, { w, h: r.h * (rest ? 0.42 : 1) }, range(theme, "subhead", [58, 28]), 1.15, display(theme, 700));
    const bf = rest ? fit(rest, { w, h: r.h - hf.height - GAP }, range(theme, "body", [38, 22]), 1.45, body(theme, 400)) : null;
    const total = hf.height + (bf ? GAP + bf.height : 0);
    const y = clampY(centred(r, total), total, r.y, r.h);
    return [
      ...(decor > 0 ? [rect({ x: r.x, y, w: Math.round(10 * decor), h: total }, theme.accent, { name: "Rule", radius: 5 })] : []),
      text(head, { x: r.x + INDENT, y, w, h: hf.height }, theme.fg, { fontSize: hf.fontSize, fontWeight: 700, lineHeight: 1.15, name: "Heading" }),
      ...(bf && rest
        ? [text(rest, { x: r.x + INDENT, y: y + hf.height + GAP, w, h: bf.height }, theme.muted, { fontSize: bf.fontSize, fontWeight: 400, lineHeight: 1.45, name: "Body" })]
        : []),
    ];
  },
};

/** The heading as a small tracked kicker, the body as the big line. */
const KICKER: Composition = {
  id: "kicker",
  label: "Kicker",
  image: "below",
  spacing: [16, 32, 56, 96],
  build: (ctx, r) => {
    const [head, rest] = lead(ctx.text);
    if (!rest) return UNDERLINE.build(ctx, r);
    const { theme } = ctx;
    const GAP = 32;
    const km: Measure = { ...display(theme, 700), letterSpacing: 0.08, uppercase: true };
    const kf = fit(head, { w: r.w, h: r.h * 0.25 }, range(theme, "body", [30, 22]), 1.3, km);
    const bf = fit(rest, { w: r.w, h: r.h - kf.height - GAP }, range(theme, "headline", [60, 28]), 1.2, display(theme, 700));
    const total = kf.height + GAP + bf.height;
    const y = clampY(centred(r, total), total, r.y, r.h);
    return [
      text(head, { x: r.x, y, w: r.w, h: kf.height }, theme.accent, {
        fontSize: kf.fontSize,
        fontWeight: 700,
        lineHeight: 1.3,
        letterSpacing: 0.08,
        uppercase: true,
        name: "Kicker",
      }),
      text(rest, { x: r.x, y: y + kf.height + GAP, w: r.w, h: bf.height }, theme.fg, { fontSize: bf.fontSize, fontWeight: 700, lineHeight: 1.2, name: "Body" }),
    ];
  },
};

/** Heading at the top of the region, body at the bottom, a rule between. */
const TOP_AND_BOTTOM: Composition = {
  id: "top-bottom",
  label: "Top and bottom",
  image: "above",
  spacing: [24, 40, 56, 96],
  build: (ctx, r) => {
    const [head, rest] = lead(ctx.text);
    if (!rest) return STATEMENT.build(ctx, r);
    const { theme, decor } = ctx;
    const RULE = decor > 0 ? 40 : 0;
    const hf = fit(head, { w: r.w, h: r.h * 0.4 }, range(theme, "subhead", [60, 30]), 1.15, display(theme, 700));
    const bf = fit(rest, { w: r.w, h: r.h - hf.height - RULE - 40 }, range(theme, "body", [38, 22]), 1.45, body(theme, 400));
    const bodyY = r.y + r.h - bf.height;
    return [
      text(head, { x: r.x, y: r.y, w: r.w, h: hf.height }, theme.fg, { fontSize: hf.fontSize, fontWeight: 700, lineHeight: 1.15, name: "Heading" }),
      ...accent(decor, { x: r.x, y: bodyY - RULE, w: 96, h: 6 }, theme.accent, { name: "Rule", radius: 3 }),
      text(rest, { x: r.x, y: bodyY, w: r.w, h: bf.height }, theme.muted, { fontSize: bf.fontSize, fontWeight: 400, lineHeight: 1.45, name: "Body" }),
    ];
  },
};

/** Heading and body on a quiet card. */
const CARD: Composition = {
  id: "card",
  label: "Card",
  image: "below",
  spacing: [20, 32, 48, 96],
  build: (ctx, r) => {
    const [head, rest] = lead(ctx.text);
    const { theme } = ctx;
    const PAD = 48;
    const GAP = 24;
    const w = r.w - PAD * 2;
    const hf = fit(head, { w, h: (r.h - PAD * 2) * (rest ? 0.42 : 1) }, range(theme, "subhead", [54, 28]), 1.15, display(theme, 700));
    const bf = rest ? fit(rest, { w, h: r.h - PAD * 2 - hf.height - GAP }, range(theme, "body", [36, 22]), 1.45, body(theme, 400)) : null;
    const inner = hf.height + (bf ? GAP + bf.height : 0);
    const cardH = Math.min(r.h, inner + PAD * 2);
    const y = clampY(centred(r, cardH), cardH, r.y, r.h);
    return [
      rect({ x: r.x, y, w: r.w, h: cardH }, theme.fg, { name: "Card", radius: 28, opacity: 0.07 }),
      text(head, { x: r.x + PAD, y: y + PAD, w, h: hf.height }, theme.fg, { fontSize: hf.fontSize, fontWeight: 700, lineHeight: 1.15, name: "Heading" }),
      ...(bf && rest
        ? [text(rest, { x: r.x + PAD, y: y + PAD + hf.height + GAP, w, h: bf.height }, theme.muted, { fontSize: bf.fontSize, fontWeight: 400, lineHeight: 1.45, name: "Body" })]
        : []),
    ];
  },
};

const EXTRA: Composition[] = [CENTRED_PAIR, SIDE_RULE, KICKER, TOP_AND_BOTTOM, CARD];

/** The scale for a slide no composition built: every step any of them uses. */
export const DEFAULT_SPACING = [16, 24, 32, 40, 56, 64, 96];

/** The spacing steps a slide was built from, or the default scale. */
export function spacingFor(composition: string | undefined): number[] {
  const all = [TITLE, UNDERLINE, HEADING_BODY, STATEMENT, NUMBERED, QUOTE, BLOCK, CAPS, ...EXTRA];
  return all.find((c) => c.id === composition)?.spacing ?? DEFAULT_SPACING;
}

/**
 * The margins every composition lays out inside, on a board of this size.
 *
 * Proportional, because that is what `reflow.ts` does to them: a deck moved to
 * 1080x1920 keeps its 96px sides and its top margin scales with the height.
 * Snapping (18.1) offers these as lines.
 */
export function marginLines(w: number, h: number): { x: number[]; y: number[] } {
  const mx = (MX * w) / W;
  const my = (MY * h) / H;
  return { x: [mx, w - mx], y: [my, h - my] };
}

/** The rotation. Consecutive slides never share a composition. */
const CYCLE: Composition[] = [HEADING_BODY, STATEMENT, NUMBERED, QUOTE, UNDERLINE, CAPS];

/**
 * Every composition, in the fixed order `L` steps through (24.3): pressing it
 * as many times as there are entries comes back to where it started, and
 * `Shift+L` walks the same ring backwards.
 */
const RING: Composition[] = [TITLE, ...CYCLE, BLOCK, ...EXTRA];

/**
 * What a slide's words are (25.2): a headline alone, or a headline and a body.
 * `L` only steps through layouts that suit it, so a one-line slide never lands
 * on a layout built around a body it does not have.
 */
export type ContentShape = "head" | "body";

export const shapeOfText = (text: string): ContentShape => (lead(text.trim())[1] ? "body" : "head");

/**
 * The rings, per shape. Fixed order, so `L` pressed as many times as there are
 * entries comes back to the start, and `Shift+L` walks the same ring back.
 */
export function ringFor(shape: ContentShape | undefined): string[] {
  const ids =
    shape === "head"
      ? ["title", "underline", "statement", "caps", "quote", "block", "centred-pair", "side-rule", "card"]
      : shape === "body"
        ? ["heading-body", "centred-pair", "side-rule", "kicker", "top-bottom", "card", "numbered", "quote", "statement", "underline", "caps", "block"]
        : RING.map((c) => c.id);
  return ids;
}

/** The composition after (or before) `id` in the ring for this shape. An id not in it starts at the top. */
export function stepComposition(id: string | undefined, dir: 1 | -1 = 1, shape?: ContentShape): string {
  const ring = ringFor(shape);
  const at = ring.indexOf(id ?? "");
  const next = at < 0 ? (dir === 1 ? 0 : ring.length - 1) : (at + dir + ring.length) % ring.length;
  return ring[next]!;
}

/**
 * The composition the deck's cycle gives a body slide at `index`, from the
 * deck's own seed: what a slide typed into existence (24.5) is laid out with.
 * Never the title or the colour block, which belong to the first and the last.
 */
export const cycleCompositionAt = (index: number, texts: readonly string[], shift = 0): string =>
  CYCLE[(Math.max(1, index) - 1 + seedOf(texts.filter((t) => t.trim())) + shift) % CYCLE.length]!.id;

/**
 * Roles that always get the same treatment, whatever their position. The hook is the
 * title because it is the hook; the CTA is the one loud slide because it is the ask.
 */
const BY_ROLE: Record<string, Composition> = {
  hook: TITLE,
  cta: BLOCK,
  takeaway: STATEMENT,
  lesson: STATEMENT,
  turn: QUOTE,
  result: NUMBERED,
};

/**
 * A stable number from the deck's own words.
 *
 * Used to rotate where the composition cycle starts, which is the difference
 * between "four frameworks" and "the same eight-slide layout every time", the
 * loudest one-star complaint about every tool in this category. Two different
 * carousels get different rhythms; the same carousel twice gets the same one,
 * because the seed is the content rather than a clock or a counter.
 */
export function seedOf(texts: readonly string[]): number {
  let h = 0;
  for (const t of texts) {
    for (let i = 0; i < t.length; i += 1) {
      h = (h * 31 + t.charCodeAt(i)) | 0;
    }
  }
  return Math.abs(h);
}

export function compositionFor(
  index: number,
  total: number,
  role?: string,
  seed = 0,
): Composition {
  if (role) {
    const pinned = BY_ROLE[role];
    if (pinned) {
      // ...unless it would repeat its neighbour, which is the one thing to avoid.
      const prev = index > 0 ? compositionFor(index - 1, total) : null;
      if (!prev || prev.id !== pinned.id) return pinned;
    }
    return CYCLE[(index - 1 + seed + CYCLE.length) % CYCLE.length]!;
  }
  if (index === 0) return TITLE;
  // A short last slide closes on the colour block, the one loud slide in the deck.
  if (index === total - 1 && total > 2) return BLOCK;
  return CYCLE[(index - 1 + seed) % CYCLE.length]!;
}

export const compositionLabel = (index: number, total: number, role?: string): string =>
  compositionFor(index, total, role).label;

/** The picture band and the text region it leaves behind. */
export function bandsFor(
  placement: ImagePlacement,
  withImage = true,
): { image: Region; textRegion: Region } {
  const innerH = H - MY * 2;
  const full = { x: MX, y: MY, w: COL, h: innerH };
  // No pictures: the text gets the whole safe box rather than a band of dead space.
  if (!withImage) return { image: full, textRegion: full };
  if (placement === "above") {
    return {
      image: { x: MX, y: MY, w: COL, h: BAND },
      textRegion: { x: MX, y: MY + BAND + BAND_GAP, w: COL, h: innerH - BAND - BAND_GAP },
    };
  }
  return {
    image: { x: MX, y: H - MY - BAND, w: COL, h: BAND },
    textRegion: { x: MX, y: MY, w: COL, h: innerH - BAND - BAND_GAP },
  };
}

/** An empty picture slot. Dotted outline and an upload mark until something lands on it. */
export function imagePlaceholder(at: Region, theme: Theme, name = "Image"): Layer {
  return { ...makeLayer("image", at, theme.muted), name, radius: 12, fit: "cover" };
}

/**
 * The style's typefaces, applied by the job a layer does rather than by editing every
 * composition: prose takes the body face, everything else takes display.
 */
function applyFonts(layer: Layer, theme: Theme): Layer {
  if (layer.kind !== "text") return layer;
  const font = layer.name === "Body" ? theme.bodyFont : theme.displayFont;
  return font ? { ...layer, fontFamily: font } : layer;
}

/**
 * The colour emphasis takes on this layer (22.3): the style decides, once, at
 * generation. Its ground is the slide, except the colour block's own text,
 * which sits on the accent.
 */
function withMarkColour(l: Layer, theme: Theme, comp: string): Layer {
  if (l.kind !== "text") return l;
  const ground = comp === "block" && l.name === "Text" ? theme.accent : theme.bg;
  return { ...l, markColour: markColourFor(theme, ground, l.fill) };
}

/** A layer reflected across the artboard's vertical centre line. */
const mirrored = (l: Layer): Layer => ({ ...l, x: W - l.x - l.w, ...(l.align === "right" ? { align: "left" as const } : {}) });

export type BuildOptions = {
  /** Reserve a picture band on every slide. */
  images?: boolean | undefined;
  /** 0 removes accent rules, 1 is normal, 1.8 is bold. */
  decor?: number | undefined;
  /**
   * Set false to take the layout exactly as composed, overflow and all.
   * Only the tests that assert on overflow want this.
   */
  split?: boolean | undefined;
  /**
   * Blocks framework slots asked for (19.7), by slot id: the model's words for
   * the block's fields. The structure chose the block; this file places it.
   */
  fills?: Record<string, SlotFillSpec> | undefined;
  /**
   * The same, by slide position: how Re-lay hands a document's own slot blocks
   * back, since a document has no roles to key them by.
   */
  fillsAt?: (SlotFillSpec | undefined)[] | undefined;
  /**
   * A composition chosen for a slide, by position (24.3's `L`, 24.5's typed
   * slide): the slide is laid out with that one rather than the cycle's. A
   * user's choice, so it is honoured over the role and the position.
   */
  compositions?: (string | undefined)[] | undefined;
  /** Shuffle rhythm (25.2): the cycle starts this far from where the words put it. */
  seedShift?: number | undefined;
};

export type SlotFillSpec = { id: string; fields: Record<string, string> };
type Entry = { text: string; role: string | undefined; fill?: SlotFillSpec | undefined };

/**
 * Copy that does not fit gets ANOTHER SLIDE rather than a smaller font.
 *
 * Built, measured, and rebuilt with the offending entry split, rather than
 * predicted up front, because the region a slide gets depends on which
 * composition it lands on, which depends on how many slides there are, which is
 * the thing splitting changes. Measuring the real output sidesteps the circle,
 * and each pass strictly shrinks the worst slide, so it converges.
 *
 * The alternative is what every tool in this category does and what its users
 * complain about loudest: shrink until it fits. `fit()` still shrinks, a couple
 * of ladder steps is a reasonable accommodation, but it no longer falls to the
 * floor silently and calls that a layout.
 */
const MAX_SPLIT_PASSES = 10;

/**
 * The first slide whose copy does not fit the ARTBOARD.
 *
 * Against the artboard rather than against the layer's own box, which is the
 * subtle part: when `fit` runs out of ladder it returns the real height it
 * needed, and the layer is built at that height. So the box grows to match the
 * overflow and "does this fit its box" is answered yes by a slide that is
 * visibly hanging off the bottom of the canvas. The board is the only reference
 * that cannot move.
 */
function overflowingIndex(slides: Slide[]): number | null {
  for (let i = 0; i < slides.length; i += 1) {
    for (const l of slides[i]?.layers ?? []) {
      if (l.kind !== "text" || !(l.text ?? "").trim()) continue;
      if (l.y < -0.5 || l.y + l.h > H + 0.5) return i;
    }
  }
  return null;
}

export function buildSlides(
  texts: string[],
  theme: Theme,
  roles?: string[],
  options: BuildOptions = {},
): Slide[] {
  // A slot's block rides on the first slide carrying its role, and on the first
  // piece if that slide is split.
  const used = new Set<string>();
  let entries: Entry[] = texts.map((t, i) => {
    const role = roles?.[i];
    let fill = options.fillsAt?.[i];
    if (!fill && role && !used.has(role) && options.fills?.[role]) fill = options.fills[role];
    if (fill && role) used.add(role);
    return { text: t, role, ...(fill ? { fill } : {}) };
  });

  let slides = layout(entries, theme, options);
  if (options.split === false) return slides;

  for (let pass = 0; pass < MAX_SPLIT_PASSES; pass += 1) {
    const bad = overflowingIndex(slides);
    if (bad === null) break;

    const kept = entries.filter((e) => e.text.trim() !== "");
    const target = kept[bad];
    if (!target) break;

    const pieces = splitAtMiddle(target.text);
    if (pieces.length < 2) break;

    // The role rides with the first piece only. A repeated slot would otherwise
    // pin both halves to the same composition and print the same layout twice.
    const at = entries.indexOf(target);
    entries = [
      ...entries.slice(0, at),
      { text: pieces[0] ?? "", role: target.role, ...(target.fill ? { fill: target.fill } : {}) },
      ...pieces.slice(1).map((text) => ({ text, role: undefined })),
      ...entries.slice(at + 1),
    ];

    slides = layout(entries, theme, options);
  }

  return slides;
}

/** One cut at the sentence boundary nearest the middle. Never rewords. */
function splitAtMiddle(text: string): string[] {
  const t = text.trim();
  const breaks: number[] = [];
  const re = /[.!?؟]["')\]]*\s+|[。！？]+[」』）"']*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) breaks.push(m.index + m[0].length);

  if (breaks.length === 0) {
    for (let i = 1; i < t.length - 1; i += 1) if (/\s/.test(t[i] ?? "")) breaks.push(i + 1);
  }
  if (breaks.length === 0) {
    for (let i = 1; i < t.length; i += 1) if (/[\u3040-\u9fff\uac00-\ud7af]/.test((t[i - 1] ?? "") + (t[i] ?? ""))) breaks.push(i);
  }
  // Never between the two halves of an emphasis mark (22.3).
  const usable = outsideMarks(t, breaks).filter((i) => i > 0 && i < t.length);
  if (usable.length === 0) return [t];

  const middle = t.length / 2;
  const at = usable.reduce((a, b) => (Math.abs(a - middle) <= Math.abs(b - middle) ? a : b));
  const head = t.slice(0, at).trim();
  const tail = t.slice(at).trim();
  return head && tail ? [head, tail] : [t];
}

function layout(entries: Entry[], theme: Theme, options: BuildOptions): Slide[] {
  const images = options.images ?? true;
  const decor = options.decor ?? 1;

  const kept: (Entry & { at: number })[] = [];
  entries.forEach((e, at) => {
    if (e.text.trim()) kept.push({ ...e, text: e.text.trim(), at });
  });
  if (kept.length === 0) return [makeSlide(theme.bg, "Slide 1")];

  const seed = seedOf(kept.map((k) => k.text)) + (options.seedShift ?? 0);

  return kept.map((k, i) => {
    if (k.fill) {
      const slide = blockSlide(k.text, k.fill, theme, i, images);
      if (slide) return slide;
    }
    const pinned = options.compositions?.[k.at];
    const comp = (pinned ? RING.find((c) => c.id === pinned) : undefined) ?? compositionFor(i, kept.length, k.role, seed);
    const { image, textRegion } = bandsFor(comp.image, images);
    const rtl = isRtl(k.text);
    const built = comp
      .build({ text: k.text, index: i, total: kept.length, theme, decor }, textRegion)
      .map((l) => withMarkColour(applyFonts(l, theme), theme, comp.id))
      // Right-to-left copy (22.5) gets the composition mirrored: the rule, the
      // bar and the number go to the right, where the line starts. The words
      // themselves align to their own start through `dir="auto"` in LayerView.
      .map((l) => (rtl ? mirrored(l) : l));

    // Picture first so it sits behind the text, which is what you want if either
    // ends up dragged over the other later.
    return {
      ...makeSlide(theme.bg, comp.id === "title" ? "Hook" : `Slide ${i + 1}`),
      composition: comp.id,
      ...(theme.bgGradient ? { gradient: theme.bgGradient } : {}),
      layers: images ? [imagePlaceholder(image, theme), ...built] : built,
    };
  });
}

/**
 * A slide a framework slot asked to show as a block (19.7): the block in the
 * upper part of the text region, and the slot's own sentence under it, so the
 * slide still says in words what the number means and the copy is still there
 * for regeneration to read.
 *
 * The block is recorded on the slide with `slot: true`: generation owns it, so
 * Re-lay rebuilds it from the record rather than keeping a stale copy beside a
 * fresh one.
 */
function blockSlide(
  text: string,
  fill: SlotFillSpec,
  theme: Theme,
  index: number,
  images: boolean,
): Slide | null {
  const block = blockById(fill.id);
  if (!block) return null;
  const { textRegion: r } = bandsFor("below", images);
  const instance = uid("blk");
  const box = { x: r.x, y: r.y, w: r.w, h: Math.round(r.h * 0.6) };
  const fields = withDefaults(block, fill.fields);
  const built = block.build(fields, box, { theme, board: { w: W, h: H }, instance });
  const layers = built.layers.map((l) => applyFonts({ ...l, block: { ...l.block!, slot: true } }, theme));

  const bodyY = box.y + box.h + 40;
  const f = fit(text, { w: r.w, h: r.y + r.h - bodyY }, range(theme, "body", [40, 24]), 1.4, body(theme, 400));
  layers.push(
    applyFonts(
      {
        ...makeLayer("text", { x: r.x, y: bodyY, w: r.w, h: f.height }, theme.muted),
        text,
        fontSize: f.fontSize,
        fontWeight: 400,
        lineHeight: 1.4,
        name: "Body",
        markColour: markColourFor(theme, theme.bg, theme.muted),
      },
      theme,
    ),
  );

  const parts: Record<string, { x: number; y: number; w: number; h: number; look: string }> = {};
  return {
    ...makeSlide(theme.bg, `Slide ${index + 1}`),
    composition: "block",
    ...(theme.bgGradient ? { gradient: theme.bgGradient } : {}),
    blocks: [{ instance, block: fill.id, fields, box, parts, slot: true }],
    layers: images ? [imagePlaceholder(bandsFor("below", true).image, theme), ...layers] : layers,
  };
}

export const MAX_SLIDES = 35;
