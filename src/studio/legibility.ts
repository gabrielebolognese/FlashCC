/**
 * Can the text actually be seen? (Batch 30)
 *
 * The pre-flight checked sizes, strokes, safe zones and slide counts; a slide
 * could pass all of them and be unreadable on a phone. Everything here is a
 * defect anybody would recognise as one, never a score, and nothing here
 * blocks an export: somebody can know something a check does not.
 *
 * ── Contrast (30.1) ──────────────────────────────────────────────────────────
 *
 * WCAG's thresholds: 4.5 to 1 for body text, 3 to 1 for large text, where
 * "large" is judged at the size the slide is SEEN (24 CSS px, or 18.66 bold,
 * on a phone), not at the artboard's 1080 pixels.
 *
 * Over a flat colour the check is arithmetic and runs in the pre-flight. Over
 * a picture, a gradient or a texture it needs the rendered pixels behind the
 * words: `/api/contrast` renders the slide with its text hidden through the
 * same renderer the export uses (there is one painter) and returns a grid of
 * 24px cells. The verdict is the WORST cell behind the glyphs of any line,
 * not the average of the box: a white headline over a dark photo with a
 * bright sky behind two letters passes on average and fails where it matters.
 *
 * ── Three fixes, in the order the roadmap gives them ─────────────────────────
 *
 * A scrim behind the layer strong enough for the worst cell; the nearest of
 * the deck's own colour roles that passes; the layer moved, at its size, to
 * the nearest place inside the safe area where every cell passes. Each is
 * worked out from the same grid and confirmed by checking again.
 */
import { hexToRgb, rgbToHex, type Rgb } from "./colour.js";
import type { Grid } from "./contrastgrid.js";
import { stripMarks } from "./marks.js";
import { makeLayer, type Doc, type Layer, type Slide } from "./model.js";
import type { Platform } from "./platforms.js";
import { isRtl, layerMeasure, textInset, textWidth, wrapLines } from "./text.js";
import { contrastingWith } from "./texteffects.js";

/* ── colour arithmetic ────────────────────────────────────────────────────── */

export type Rgba = Rgb & { a: number };

/** Hex (3, 4, 6 or 8 digits) or rgb()/rgba(). Anything else: null, and the caller decides. */
export function parseColour(c: string | undefined): Rgba | null {
  if (!c) return null;
  const s = c.trim().toLowerCase();
  const hex = s.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3 || h.length === 4) h = h.split("").map((ch) => ch + ch).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const { r, g, b } = hexToRgb(h.slice(0, 6));
    return { r, g, b, a: h.length === 8 ? Number.parseInt(h.slice(6), 16) / 255 : 1 };
  }
  const fn = s.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    const parts = fn[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) return null;
    return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts[3] ?? 1 };
  }
  return null;
}

const lin = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export const relLuminance = (c: Rgb): number => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);

export function ratio(a: Rgb, b: Rgb): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `top` at alpha `a` over `bottom`, the way CSS composites: in sRGB. */
export const over = (top: Rgb, a: number, bottom: Rgb): Rgb => ({
  r: top.r * a + bottom.r * (1 - a),
  g: top.g * a + bottom.g * (1 - a),
  b: top.b * a + bottom.b * (1 - a),
});

/* ── thresholds, at the size the slide is seen ────────────────────────────── */

export const BODY_RATIO = 4.5;
export const LARGE_RATIO = 3;

/**
 * The feed a slide is seen in, in CSS pixels. A phone shows a post 360 to
 * 430 wide; 360 is the narrow end, so a check that passes here passes on
 * every phone. LinkedIn's document viewer fits a page into a portrait frame,
 * so a tall page is letterboxed and shown smaller; TikTok is the whole screen.
 * Everywhere else the post fills the width. Estimates, stated as such (D61).
 */
export const FEED_WIDTH = 360;
const FEED_HEIGHT: Record<string, number> = { linkedin: 450, tiktok: 640 };

export function feedScale(doc: Pick<Doc, "width" | "height">, platform?: Pick<Platform, "id"> | undefined): number {
  const h = platform ? FEED_HEIGHT[platform.id] : undefined;
  return Math.min(FEED_WIDTH / doc.width, h ? h / doc.height : Infinity);
}

/** The smallest copy a phone shows legibly at a glance, in CSS pixels. 30px on a 1080 slide in a 360 feed. */
export const FEED_MIN_PX = 10;

/** A profile-grid tile on a 360 phone: a third of the width, 3:4. */
export const TILE = { w: 120, h: 160 };
/** The cover's headline in that tile. 68px on a 4:5 slide. */
export const TILE_MIN_PX = 8;
/** The platforms whose profile grid shows the cover as a tile. */
export const GRID_PLATFORMS = new Set(["instagram", "tiktok"]);

/** The grid crops to fill the tile, so the scale is the larger of the two. */
export const tileScale = (doc: Pick<Doc, "width" | "height">): number => Math.max(TILE.w / doc.width, TILE.h / doc.height);

/** WCAG's "large text", judged at the size it is displayed. */
export function needFor(l: Pick<Layer, "fontSize" | "fontWeight">, scale: number): number {
  const shown = (l.fontSize ?? 64) * scale;
  const bold = (l.fontWeight ?? 600) >= 700;
  return shown >= 24 || (bold && shown >= 18.66) ? LARGE_RATIO : BODY_RATIO;
}

/* ── where the ink is ─────────────────────────────────────────────────────── */

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * One rectangle per line, around the glyphs rather than the whole box: a
 * left-aligned headline in a wide box has nothing behind its right half, and
 * a bright patch there is not behind any letter. Rotated layers fall back to
 * their box.
 */
export function inkRects(l: Layer): Rect[] {
  const size = l.fontSize ?? 64;
  const box = { x: l.x, y: l.y, w: l.w, h: l.h };
  if (l.rotation) return [box];
  const m = layerMeasure(l);
  const inset = textInset(l, size);
  const plain = stripMarks(l.text ?? "");
  const lines = wrapLines(plain, size, l.w - inset, m);
  const lh = size * (l.lineHeight ?? 1.2);
  const total = lines.length * lh;
  const top = l.valign === "middle" ? (l.h - total) / 2 : l.valign === "bottom" ? l.h - total : 0;
  const rtl = isRtl(plain);
  return lines
    .map((line, i) => {
      const w = Math.min(l.w, textWidth(line, size, m) + inset);
      const end = l.align === "right" ? !rtl : l.align === "center" ? null : rtl;
      const x = end === null ? (l.w - w) / 2 : end ? l.w - w : 0;
      return { x: l.x + x, y: l.y + top + i * lh, w, h: lh };
    })
    .filter((r) => r.w > 0.5);
}

const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const covers = (outer: Rect, inner: Rect): boolean =>
  outer.x <= inner.x + 0.5 && outer.y <= inner.y + 0.5 && outer.x + outer.w >= inner.x + inner.w - 0.5 && outer.y + outer.h >= inner.y + inner.h - 0.5;

/* ── the pixels behind the words ──────────────────────────────────────────── */

export type { Grid } from "./contrastgrid.js";
export { GRID_CELL } from "./contrastgrid.js";

const cellColour = (g: Grid, c: number, r: number): Rgb => {
  const i = (r * g.cols + c) * 3;
  return { r: g.rgb[i] ?? 0, g: g.rgb[i + 1] ?? 0, b: g.rgb[i + 2] ?? 0 };
};

/**
 * The cells behind a rectangle: every cell at least half covered, or for a
 * rectangle smaller than that, every cell it touches.
 */
export function cellsUnder(g: Grid, r: Rect): { colour: Rgb; at: Rect }[] {
  const out: { colour: Rgb; at: Rect }[] = [];
  const touched: { colour: Rgb; at: Rect }[] = [];
  const c0 = Math.max(0, Math.floor(r.x / g.cell));
  const c1 = Math.min(g.cols - 1, Math.floor((r.x + r.w - 0.01) / g.cell));
  const r0 = Math.max(0, Math.floor(r.y / g.cell));
  const r1 = Math.min(g.rows - 1, Math.floor((r.y + r.h - 0.01) / g.cell));
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      const at = { x: col * g.cell, y: row * g.cell, w: g.cell, h: g.cell };
      const ox = Math.min(at.x + at.w, r.x + r.w) - Math.max(at.x, r.x);
      const oy = Math.min(at.y + at.h, r.y + r.h) - Math.max(at.y, r.y);
      const hit = { colour: cellColour(g, col, row), at };
      touched.push(hit);
      if (ox * oy >= (at.w * at.h) / 2) out.push(hit);
    }
  }
  return out.length ? out : touched;
}

/** The colours the words are drawn in: the fill, or every stop of gradient text. */
export function inkColours(l: Layer): Rgb[] {
  const stops = l.gradient?.stops.map((s) => parseColour(s.colour)).filter((c): c is Rgba => c !== null) ?? [];
  const fill = parseColour(l.fill);
  const all = stops.length ? stops : fill ? [fill] : [];
  return all.map(({ r, g, b }) => ({ r, g, b }));
}

/** The text's own alpha: the layer's opacity times the colour's. */
const inkAlpha = (l: Layer): number => (l.opacity ?? 1) * (l.gradient ? 1 : (parseColour(l.fill)?.a ?? 1));

export type Worst = { ratio: number; at: Rect };

/** The worst contrast between the ink and any ground it sits on. */
export function worstAgainst(l: Layer, grounds: readonly { colour: Rgb; at: Rect }[], ink = inkColours(l)): Worst | null {
  if (!ink.length || !grounds.length) return null;
  const alpha = inkAlpha(l);
  let worst: Worst | null = null;
  for (const g of grounds) {
    for (const c of ink) {
      const seen = over(c, alpha, g.colour);
      const r = ratio(seen, g.colour);
      if (!worst || r < worst.ratio) worst = { ratio: r, at: g.at };
    }
  }
  return worst;
}

/* ── what is behind a layer ───────────────────────────────────────────────── */

/**
 * The flat colour behind a text layer, or null when the pixels are needed (a
 * picture, a gradient, a texture, or a shape that covers only part of it).
 * A label box is its own ground; an outline draws its own edge, so it is not
 * judged against anything.
 */
export function flatGround(slide: Slide, l: Layer): string | "own" | null {
  if (l.textEffect === "outline") return "own";
  if (l.textEffect === "label") return l.effectColour ?? contrastingWith(l.fill, l.markColour);
  const box = { x: l.x, y: l.y, w: l.w, h: l.h };
  const below = slide.layers.slice(0, Math.max(0, slide.layers.indexOf(l))).filter((b) => b.visible && b.opacity > 0 && intersects(b, box));
  for (const b of below.reverse()) {
    const fill = parseColour(b.fill);
    const solid = (b.kind === "rect" || b.kind === "text") && !b.gradient && !b.rotation && fill && fill.a >= 0.999 && b.opacity >= 0.999;
    if (b.kind === "text") {
      // A label box underneath is a ground; plain words underneath are not.
      continue;
    }
    if (solid && covers(b, box)) return rgbToHex(fill);
    return null;
  }
  if (slide.image?.src || slide.texture || slide.gradient) return null;
  return parseColour(slide.background) ? slide.background : null;
}

/** The text layers that can be judged at all: visible, with words, not furniture chrome. */
export const judged = (slide: Slide): Layer[] =>
  slide.layers.filter((l) => l.kind === "text" && l.visible && (l.text ?? "").trim() !== "" && l.opacity > 0);

/** Slides with at least one text layer whose ground needs the rendered pixels. */
export const slidesNeedingPixels = (doc: Doc): number[] =>
  doc.slides.flatMap((s, i) => (judged(s).some((l) => flatGround(s, l) === null) ? [i] : []));

export type ContrastIssue = {
  /** 0-based. */
  slide: number;
  layerId: string;
  name: string;
  ratio: number;
  need: number;
  /** Where it is worst, in artboard pixels. */
  at: Rect;
  /** Judged over a flat colour, without rendering. */
  flat: boolean;
};

const flatCells = (colour: string, rects: Rect[]): { colour: Rgb; at: Rect }[] => rects.map((at) => ({ colour: hexToRgb(colour), at }));

/** Every text layer whose ground is a flat colour and whose contrast is short of its threshold. */
export function flatContrast(doc: Doc, scale: number): ContrastIssue[] {
  const out: ContrastIssue[] = [];
  doc.slides.forEach((s, i) => {
    for (const l of judged(s)) {
      const ground = flatGround(s, l);
      if (ground === null || ground === "own") continue;
      const w = worstAgainst(l, flatCells(ground, inkRects(l)));
      const need = needFor(l, scale);
      if (w && w.ratio < need - 0.005) out.push({ slide: i, layerId: l.id, name: l.name, ratio: w.ratio, need, at: w.at, flat: true });
    }
  });
  return out;
}

/** The same, for layers over pictures, from a rendered grid per slide (null where none was rendered). */
export function pixelContrast(doc: Doc, grids: readonly (Grid | null | undefined)[], scale: number): ContrastIssue[] {
  const out: ContrastIssue[] = [];
  doc.slides.forEach((s, i) => {
    const g = grids[i];
    if (!g) return;
    for (const l of judged(s)) {
      if (flatGround(s, l) !== null) continue;
      const w = worstAgainst(l, inkRects(l).flatMap((r) => cellsUnder(g, r)));
      const need = needFor(l, scale);
      if (w && w.ratio < need - 0.005) out.push({ slide: i, layerId: l.id, name: l.name, ratio: w.ratio, need, at: w.at, flat: false });
    }
  });
  return out;
}

/** The doc the renderer is asked for: every text layer hidden, everything behind it as it is. */
export const withoutText = (doc: Doc): Doc => ({
  ...doc,
  slides: doc.slides.map((s) => ({ ...s, layers: s.layers.map((l) => (l.kind === "text" ? { ...l, visible: false } : l)) })),
});

/* ── the three fixes ──────────────────────────────────────────────────────── */

const groundsFor = (slide: Slide, l: Layer, grid: Grid | null): { colour: Rgb; at: Rect }[] => {
  const flat = flatGround(slide, l);
  if (flat && flat !== "own") return flatCells(flat, inkRects(l));
  return grid ? inkRects(l).flatMap((r) => cellsUnder(grid, r)) : [];
};

const replaceSlide = (doc: Doc, i: number, slide: Slide): Doc => ({ ...doc, slides: doc.slides.map((s, k) => (k === i ? slide : s)) });

const alphaHex = (a: number): string => Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");

/**
 * 1. A scrim directly under the layer, at least as dark (or light) over the
 * words as the worst cell needs, fading to clear away from them. Dark under
 * light text, light under dark. Null when no scrim short of opaque would do.
 */
export function scrimFix(doc: Doc, i: number, layerId: string, grid: Grid, scale: number): Doc | null {
  const slide = doc.slides[i];
  const l = slide?.layers.find((x) => x.id === layerId);
  if (!slide || !l) return null;
  const ink = inkColours(l);
  if (!ink.length) return null;
  const light = ink.reduce((n, c) => n + relLuminance(c), 0) / ink.length > 0.4;
  const veil: Rgb = light ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  const need = needFor(l, scale) + 0.1;
  const grounds = inkRects(l).flatMap((r) => cellsUnder(grid, r));
  const passes = (a: number) => {
    const w = worstAgainst(l, grounds.map((g) => ({ ...g, colour: over(veil, a, g.colour) })), ink);
    return Boolean(w && w.ratio >= need);
  };
  if (!passes(0.95)) return null;
  let lo = 0;
  let hi = 0.95;
  for (let k = 0; k < 20; k += 1) {
    const mid = (lo + hi) / 2;
    if (passes(mid)) hi = mid;
    else lo = mid;
  }
  const a = Math.min(0.95, hi + 0.04);
  const pad = Math.round(Math.max(80, l.h * 0.6));
  const y = Math.max(0, l.y - pad);
  const bottom = Math.min(doc.height, l.y + l.h + Math.round(pad / 2));
  const lower = l.y + l.h / 2 > doc.height / 2;
  const span = Math.max(1, bottom - y);
  // The gradient reaches `a` where the words begin and only darkens past them.
  const at = lower ? (l.y - y) / span : (bottom - (l.y + l.h)) / span;
  const hex = rgbToHex(veil);
  const scrim: Layer = {
    ...makeLayer("rect", { x: 0, y, w: doc.width, h: span }, hex),
    name: "Text scrim",
    gradient: {
      kind: "linear",
      angle: lower ? 180 : 0,
      cx: 0.5,
      cy: 0.5,
      stops: [
        { colour: `${hex}00`, at: 0 },
        { colour: `${hex}${alphaHex(a)}`, at: Math.max(0.01, Math.min(0.99, at)) },
        { colour: `${hex}${alphaHex(Math.max(a, 0.8))}`, at: 1 },
      ],
    },
  };
  const k = slide.layers.indexOf(l);
  return replaceSlide(doc, i, { ...slide, layers: [...slide.layers.slice(0, k), scrim, ...slide.layers.slice(k)] });
}

const distance = (a: Rgb, b: Rgb): number => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

/**
 * 2. The nearest of the deck's colour roles that passes everywhere the words
 * sit, as a colour; null when none does.
 */
export function roleFix(slide: Slide, l: Layer, grid: Grid | null, roles: readonly string[], scale: number): string | null {
  const grounds = groundsFor(slide, l, grid);
  if (!grounds.length) return null;
  const need = needFor(l, scale);
  const current = parseColour(l.fill) ?? { r: 0, g: 0, b: 0, a: 1 };
  const passing = [...new Set(roles.map((r) => r.toLowerCase()))]
    .map((r) => ({ hex: r, rgb: parseColour(r) }))
    .filter((r): r is { hex: string; rgb: Rgba } => r.rgb !== null)
    .filter((r) => (worstAgainst({ ...l, gradient: undefined, fill: r.hex }, grounds, [r.rgb])?.ratio ?? 0) >= need);
  passing.sort((a, b) => distance(a.rgb, current) - distance(b.rgb, current));
  return passing[0]?.hex ?? null;
}

/** The layer recoloured to a role; gradient text gives way to the flat colour. */
export function applyRole(doc: Doc, i: number, layerId: string, colour: string): Doc {
  const slide = doc.slides[i];
  if (!slide) return doc;
  return replaceSlide(doc, i, {
    ...slide,
    layers: slide.layers.map((l) => (l.id === layerId ? { ...l, fill: colour, gradient: undefined, handEdited: true } : l)),
  });
}

/**
 * 3. The nearest place inside the safe area, at the layer's size, where every
 * cell behind its words passes and no other words are underneath. Searched
 * on the grid's cells; null when nowhere does.
 */
export function moveFix(doc: Doc, i: number, layerId: string, grid: Grid, safe: Rect, scale: number): Doc | null {
  const slide = doc.slides[i];
  const l = slide?.layers.find((x) => x.id === layerId);
  if (!slide || !l) return null;
  const need = needFor(l, scale);
  const others = judged(slide).filter((o) => o.id !== l.id);
  const ink = inkRects(l).map((r) => ({ dx: r.x - l.x, dy: r.y - l.y, w: r.w, h: r.h }));
  let best: { x: number; y: number; d: number } | null = null;
  const step = grid.cell;
  for (let y = Math.ceil(safe.y / step) * step; y + l.h <= safe.y + safe.h + 0.5; y += step) {
    for (let x = Math.ceil(safe.x / step) * step; x + l.w <= safe.x + safe.w + 0.5; x += step) {
      const box = { x, y, w: l.w, h: l.h };
      if (others.some((o) => intersects(o, box))) continue;
      const grounds = ink.flatMap((r) => cellsUnder(grid, { x: x + r.dx, y: y + r.dy, w: r.w, h: r.h }));
      const w = worstAgainst(l, grounds);
      if (!w || w.ratio < need) continue;
      const d = Math.hypot(x - l.x, y - l.y);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  if (!best) return null;
  const { x, y } = best;
  return replaceSlide(doc, i, {
    ...slide,
    layers: slide.layers.map((o) => (o.id === layerId ? { ...o, x, y, handEdited: true } : o)),
  });
}

/* ── seen at its size (30.2) ──────────────────────────────────────────────── */

/** Copy a reader reads: not the furniture chrome and not a composition's decorative "03". */
const copyText = (s: Slide): Layer[] =>
  judged(s).filter((l) => !l.furniture && !(l.name === "Number" && /^\d+$/.test((l.text ?? "").trim())));

export type SmallText = { slide: number; layerId: string; name: string; px: number };

/** The smallest copy on each slide, at feed size, where it is under the floor. */
export function smallOnPhone(doc: Doc, platform?: Pick<Platform, "id"> | undefined): SmallText[] {
  const scale = feedScale(doc, platform);
  return doc.slides.flatMap((s, i) => {
    const t = copyText(s);
    if (!t.length) return [];
    const l = t.reduce((a, b) => ((a.fontSize ?? 64) <= (b.fontSize ?? 64) ? a : b));
    const px = (l.fontSize ?? 64) * scale;
    return px < FEED_MIN_PX ? [{ slide: i, layerId: l.id, name: l.name, px }] : [];
  });
}

/** The cover's biggest copy at profile-tile size, or null when there is no copy. */
export function coverAtTile(doc: Doc): { layerId: string; px: number } | null {
  const cover = doc.slides[0];
  const t = cover ? copyText(cover) : [];
  if (!t.length) return null;
  const l = t.reduce((a, b) => ((a.fontSize ?? 0) >= (b.fontSize ?? 0) ? a : b));
  return { layerId: l.id, px: (l.fontSize ?? 64) * tileScale(doc) };
}

/* ── colour vision (30.3) ─────────────────────────────────────────────────── */

export type Vision = "protan" | "deutan" | "tritan";

export const VISIONS: { id: Vision; label: string; note: string }[] = [
  { id: "protan", label: "Protanopia", note: "No red cones. About 1 in 100 men" },
  { id: "deutan", label: "Deuteranopia", note: "No green cones. About 1 in 100 men, the commonest kind" },
  { id: "tritan", label: "Tritanopia", note: "No blue cones. Rare" },
];

/**
 * Machado, Oliveira and Fernandes (2009), severity 1, in linear RGB. The
 * same matrices drive the preview, as SVG `feColorMatrix` filters, whose
 * default colour space is linear RGB, so the check and the preview agree.
 */
export const CVD: Record<Vision, readonly number[]> = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

/** `values` for an feColorMatrix: the 3x3 in a 4x5. */
export const filterValues = (v: Vision): string => {
  const m = CVD[v];
  return [m[0], m[1], m[2], 0, 0, m[3], m[4], m[5], 0, 0, m[6], m[7], m[8], 0, 0, 0, 0, 0, 1, 0].join(" ");
};

const unlin = (v: number): number => {
  const c = Math.max(0, Math.min(1, v));
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
};

export function simulate(c: Rgb, v: Vision): Rgb {
  const m = CVD[v];
  const r = lin(c.r);
  const g = lin(c.g);
  const b = lin(c.b);
  return {
    r: unlin(m[0]! * r + m[1]! * g + m[2]! * b),
    g: unlin(m[3]! * r + m[4]! * g + m[5]! * b),
    b: unlin(m[6]! * r + m[7]! * g + m[8]! * b),
  };
}

/** CIELAB, D65, for a perceptual distance (CIE76: about 2.3 is "just noticeable"). */
function lab(c: Rgb): [number, number, number] {
  const r = lin(c.r);
  const g = lin(c.g);
  const b = lin(c.b);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export const deltaE = (a: Rgb, b: Rgb): number => {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

/**
 * Clearly different to most eyes (APART), and to some eye either nearly the
 * same (ALIKE) or left with under 40% of the difference (LOST): two browns
 * that still differ a little in lightness do not say which one was red.
 */
const APART = 20;
const ALIKE = 13;
const LOST = 0.4;
/** How close a label has to be to the shape it names. */
const LABEL_GAP = 24;

export type ColourOnly = { slide: number; a: string; b: string; vision: Vision };

/**
 * Two shapes on a slide that differ only by colour, to an eye that cannot
 * tell those colours apart, where at least one has no words on or beside it:
 * a red and a green bar nobody labelled. Blocks label their own marks (19.2,
 * 19.3), so their parts are trusted; furniture and full-bleed grounds are not
 * marks.
 */
export function colourOnly(doc: Doc): ColourOnly[] {
  const out: ColourOnly[] = [];
  const board = doc.width * doc.height;
  doc.slides.forEach((s, i) => {
    const words = judged(s);
    const marks = s.layers.filter((l) => {
      if (!l.visible || l.kind === "text" || l.kind === "image" || l.kind === "line" || l.block || l.furniture || l.gradient) return false;
      const fill = parseColour(l.fill);
      return Boolean(fill && fill.a > 0.5 && l.opacity >= 0.5 && l.w >= 40 && l.h >= 40 && l.w * l.h < board * 0.6);
    });
    const labelled = (m: Layer) =>
      words.some((t) => intersects(t, { x: m.x - LABEL_GAP, y: m.y - LABEL_GAP, w: m.w + LABEL_GAP * 2, h: m.h + LABEL_GAP * 2 }));
    let found: ColourOnly | null = null;
    for (let p = 0; p < marks.length && !found; p += 1) {
      for (let q = p + 1; q < marks.length && !found; q += 1) {
        const a = marks[p]!;
        const b = marks[q]!;
        const area = (a.w * a.h) / (b.w * b.h);
        if (area < 0.25 || area > 4 || (labelled(a) && labelled(b))) continue;
        const ca = parseColour(a.fill)!;
        const cb = parseColour(b.fill)!;
        if (deltaE(ca, cb) < APART) continue;
        for (const v of ["deutan", "protan", "tritan"] as const) {
          const seen = deltaE(simulate(ca, v), simulate(cb, v));
          if (seen < ALIKE || seen < deltaE(ca, cb) * LOST) {
            found = { slide: i, a: a.name, b: b.name, vision: v };
            break;
          }
        }
      }
    }
    if (found) out.push(found);
  });
  return out;
}

/* ── density (30.4) ───────────────────────────────────────────────────────── */

/** Words read at swipe speed, by shape: the 9:16 safe area is smaller. */
export const wordCeiling = (doc: Pick<Doc, "width" | "height">): number => (doc.height / doc.width >= 1.7 ? 30 : 40);

const CJK = /[぀-ヿ㐀-鿿가-힯]/g;

/**
 * The words on a slide, furniture left out. Scripts without spaces count a
 * word per two characters, which is roughly how Japanese and Chinese read.
 */
export function slideWords(s: Slide): number {
  let n = 0;
  for (const l of judged(s)) {
    if (l.furniture) continue;
    const plain = stripMarks(l.text ?? "");
    const cjk = (plain.match(CJK) ?? []).length;
    n += plain.replace(CJK, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length + Math.ceil(cjk / 2);
  }
  return n;
}

export const denseSlides = (doc: Doc): { slide: number; words: number; ceiling: number }[] => {
  const ceiling = wordCeiling(doc);
  return doc.slides.flatMap((s, i) => {
    const words = slideWords(s);
    return words > ceiling ? [{ slide: i, words, ceiling }] : [];
  });
};
