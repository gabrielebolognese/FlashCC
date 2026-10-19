/**
 * Editable exports (Batch 31.6): a deck for somebody who finishes it in
 * PowerPoint, or in a design tool, rather than posting it.
 *
 * **The one deliberate second representation.** Invariant 3 keeps `LayerView`
 * the only painter, and a PowerPoint text box is not a picture of one: the
 * receiving tool sets its own type. So this translates only what those tools
 * can hold exactly (plain text with bold, italic and accent runs, solid
 * shapes, pictures) and hands everything else to the real painter: an effect,
 * a gradient, a shadow, a highlight, an icon, a design across slides, a
 * picture with a filter or a mask, a background that is not a flat colour.
 * Those are rendered by the export's own renderer and placed as pictures at
 * their exact position, which is why nothing looks broken on open.
 *
 * **The list comes first.** `editablePlan` says, slide by slide, what will be
 * flattened and why, and which faces to install, before a file is written.
 *
 * Line breaks are fixed where FlashCC measured them (one paragraph a line),
 * so a slide opens laid out as it was; glyph shapes follow the receiving
 * tool's copy of the face (D69).
 */
import { parseMarks, stripMarks } from "./marks.js";
import { allFonts, type Doc, type Layer, type Slide } from "./model.js";
import { isRtl, layerMeasure, textInset, wrapLines } from "./text.js";

export type Target = "pptx" | "svg";

export type Rect = { x: number; y: number; w: number; h: number };

export type Run = { text: string; bold: boolean; italic: boolean; colour: string };

export type TextItem = {
  kind: "text";
  layer: Layer;
  font: string;
  size: number;
  weight: number;
  colour: string;
  opacity: number;
  align: "left" | "center" | "right";
  valign: "top" | "middle" | "bottom";
  lineHeight: number;
  letterSpacing: number;
  uppercase: boolean;
  underline: boolean;
  rtl: boolean;
  /** One entry per line as FlashCC wrapped it, each a list of runs. */
  lines: Run[][];
};

export type ShapeItem = {
  kind: "shape";
  layer: Layer;
  geometry: "rect" | "ellipse" | "triangle";
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  radius: number;
  opacity: number;
};

export type PathItem = { kind: "path"; layer: Layer; d: string; viewW: number; viewH: number; fill: string | null; stroke: string | null; strokeWidth: number; opacity: number };

export type PictureItem = { kind: "picture"; layer: Layer; src: string; fit: "cover" | "contain"; focal: { x: number; y: number }; opacity: number };

/** Drawn by the real renderer and placed as a picture: `clip` is the part of the board it covers. */
export type FlatItem = { kind: "flat"; layer: Layer; reason: string; clip: Rect };

export type Item = TextItem | ShapeItem | PathItem | PictureItem | FlatItem;

export type SlidePlan = {
  index: number;
  background: { kind: "solid"; colour: string } | { kind: "flat"; reason: string };
  items: Item[];
};

export type EditablePlan = {
  target: Target;
  slides: SlidePlan[];
  /** What becomes a picture, by slide, in words: shown before anything is written. */
  flattened: { slide: number; name: string; reason: string }[];
  /** The faces the deck is set in, by the names a computer would have them under. */
  fonts: string[];
};

/* ── names a computer has its fonts under ─────────────────────────────────── */

/** The app's system stacks, as one installed face each; bundled faces go by their own name. */
const SYSTEM_FACE: Record<string, string> = {
  sans: "Arial",
  serif: "Georgia",
  mono: "Consolas",
  display: "Segoe UI",
  grotesk: "Helvetica Neue",
  slab: "Rockwell",
  elegant: "Didot",
};

export const fontName = (id: string | undefined): string => SYSTEM_FACE[id ?? "sans"] ?? allFonts().find((f) => f.id === id)?.label ?? "Arial";

/* ── colours ──────────────────────────────────────────────────────────────── */

const HEX = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;
const SHORT = /^#([0-9a-f]{3})$/i;

/** A flat colour as #rrggbb plus its alpha, or null for anything that is not one. */
export function solid(c: string | null | undefined): { hex: string; alpha: number } | null {
  if (!c || c === "none" || c === "transparent") return null;
  const short = c.match(SHORT);
  if (short) return { hex: `#${short[1]!.split("").map((x) => x + x).join("")}`.toLowerCase(), alpha: 1 };
  const m = c.match(HEX);
  if (!m) return null;
  return { hex: `#${m[1]}`.toLowerCase(), alpha: m[2] ? Number.parseInt(m[2], 16) / 255 : 1 };
}

/* ── what a layer becomes ─────────────────────────────────────────────────── */

const EFFECT_NAMES: Record<string, string> = {
  highlight: "highlighter",
  scribble: "scribble underline",
  label: "label box",
  outline: "outline",
  shadow: "soft shadow",
};

/** Why a layer cannot be held exactly by the target, or null when it can. */
export function flattenReason(l: Layer, target: Target): string | null {
  if (l.spanId) return "it runs across slides";
  if (l.shadow) return "it has a shadow";
  if (l.gradient) return l.kind === "text" ? "gradient text" : "a gradient fill";
  if (l.kind === "text") {
    if (l.textEffect) return `the ${EFFECT_NAMES[l.textEffect] ?? l.textEffect} effect`;
    if (/==[^=]+==/.test(l.text ?? "")) return "highlighted words";
    if (!solid(l.fill)) return "its colour is not a flat one";
    return null;
  }
  if (l.kind === "icon") return "an icon";
  if (l.kind === "path") return target === "pptx" ? "a drawn shape PowerPoint cannot hold exactly" : solid(l.fill) || solid(l.stroke) || l.fill === "none" ? null : "its colour is not a flat one";
  if (l.kind === "image") {
    if (!l.src) return null;
    if (l.mask) return "a picture with a mask";
    if (l.filter) return "a picture with a filter";
    if (l.radius > 0) return "a picture with rounded corners";
    return null;
  }
  if (l.fill !== "none" && !solid(l.fill)) return "its colour is not a flat one";
  if (l.stroke && l.strokeWidth > 0 && !solid(l.stroke)) return "its outline colour is not a flat one";
  return null;
}

/** The board area a flattened layer can paint: its box, rotated, plus its shadow, clipped to the board. */
export function paintedArea(l: Layer, board: { w: number; h: number }): Rect {
  let { x, y, w, h } = l;
  if (l.rotation) {
    const r = (l.rotation * Math.PI) / 180;
    const rw = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r));
    const rh = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r));
    x += (w - rw) / 2;
    y += (h - rh) / 2;
    w = rw;
    h = rh;
  }
  const pad = l.shadow ? l.shadow.blur * 2 + Math.abs(l.shadow.y) : l.kind === "text" ? Math.round((l.fontSize ?? 64) * 0.3) : 2;
  const x0 = Math.max(0, Math.floor(x - pad));
  const y0 = Math.max(0, Math.floor(y - pad));
  const x1 = Math.min(board.w, Math.ceil(x + w + pad));
  const y1 = Math.min(board.h, Math.ceil(y + h + pad));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/**
 * A text layer's runs, line by line, wrapped where FlashCC wraps it. `*accent*`
 * is the mark colour, `**bold**` bold; the marks themselves are gone.
 */
export function textLines(l: Layer): Run[][] {
  const raw = l.text ?? "";
  const size = l.fontSize ?? 64;
  const base = { bold: (l.fontWeight ?? 600) >= 600, italic: Boolean(l.italic), colour: solid(l.fill)?.hex ?? "#000000" };
  const accent = solid(l.markColour)?.hex ?? base.colour;
  // Runs over the plain text, by character offset.
  const runs: { from: number; to: number; run: Omit<Run, "text"> }[] = [];
  let at = 0;
  for (const r of parseMarks(raw)) {
    const style = r.mark === "accent" ? { ...base, colour: accent } : r.mark === "bold" ? { ...base, bold: true } : base;
    runs.push({ from: at, to: at + r.text.length, run: style });
    at += r.text.length;
  }
  const plain = stripMarks(raw);
  const lines = wrapLines(plain, size, l.w - textInset(l, size), layerMeasure(l));
  let cursor = 0;
  return lines.map((line) => {
    const start = plain.indexOf(line, cursor);
    const from = start < 0 ? cursor : start;
    const to = from + line.length;
    cursor = to;
    const out: Run[] = [];
    for (const r of runs) {
      const a = Math.max(from, r.from);
      const b = Math.min(to, r.to);
      if (b > a) out.push({ text: plain.slice(a, b), ...r.run });
    }
    return out.length ? out : [{ text: line, ...base }];
  });
}

function itemFor(l: Layer, target: Target, board: { w: number; h: number }): Item | null {
  if (!l.visible || l.opacity <= 0) return null;
  const why = flattenReason(l, target);
  if (why) return { kind: "flat", layer: l, reason: why, clip: paintedArea(l, board) };
  switch (l.kind) {
    case "text": {
      if (!(l.text ?? "").trim()) return null;
      return {
        kind: "text",
        layer: l,
        font: fontName(l.fontFamily),
        size: l.fontSize ?? 64,
        weight: l.fontWeight ?? 600,
        colour: solid(l.fill)!.hex,
        opacity: l.opacity * solid(l.fill)!.alpha,
        align: l.align ?? "left",
        valign: l.valign ?? "top",
        lineHeight: l.lineHeight ?? 1.2,
        letterSpacing: l.letterSpacing ?? 0,
        uppercase: Boolean(l.uppercase),
        underline: Boolean(l.underline),
        rtl: isRtl(l.text ?? ""),
        lines: textLines(l),
      };
    }
    case "image":
      if (!l.src) return null;
      return { kind: "picture", layer: l, src: l.src, fit: l.fit ?? "cover", focal: l.focal ?? { x: 0.5, y: 0.5 }, opacity: l.opacity };
    case "path":
      return {
        kind: "path",
        layer: l,
        d: l.path ?? "",
        viewW: l.pathW ?? l.w,
        viewH: l.pathH ?? l.h,
        fill: solid(l.fill)?.hex ?? null,
        stroke: l.stroke && l.strokeWidth > 0 ? (solid(l.stroke)?.hex ?? null) : null,
        strokeWidth: l.strokeWidth,
        opacity: l.opacity,
      };
    default: {
      const fill = solid(l.fill);
      return {
        kind: "shape",
        layer: l,
        geometry: l.kind === "ellipse" ? "ellipse" : l.kind === "triangle" ? "triangle" : "rect",
        fill: fill?.hex ?? null,
        stroke: l.stroke && l.strokeWidth > 0 ? (solid(l.stroke)?.hex ?? null) : null,
        strokeWidth: l.strokeWidth,
        radius: l.radius,
        opacity: l.opacity * (fill?.alpha ?? 1),
      };
    }
  }
}

function backgroundOf(s: Slide): SlidePlan["background"] {
  if (s.image?.src) return { kind: "flat", reason: "a picture background" };
  if (s.texture) return { kind: "flat", reason: "a texture background" };
  if (s.gradient) return { kind: "flat", reason: "a gradient background" };
  const c = solid(s.background);
  return c ? { kind: "solid", colour: c.hex } : { kind: "flat", reason: "a background that is not a flat colour" };
}

export function editablePlan(doc: Doc, target: Target): EditablePlan {
  const board = { w: doc.width, h: doc.height };
  const slides = doc.slides.map((s, index): SlidePlan => ({
    index,
    background: backgroundOf(s),
    items: s.layers.map((l) => itemFor(l, target, board)).filter((x): x is Item => x !== null),
  }));
  const flattened = slides.flatMap((p) => [
    ...(p.background.kind === "flat" ? [{ slide: p.index + 1, name: "Background", reason: p.background.reason }] : []),
    ...p.items.flatMap((i) => (i.kind === "flat" ? [{ slide: p.index + 1, name: i.layer.name, reason: i.reason }] : [])),
  ]);
  const fonts = [...new Set(slides.flatMap((p) => p.items.flatMap((i) => (i.kind === "text" ? [i.font] : []))))].sort();
  return { target, slides, flattened, fonts };
}

/* ── what the renderer is asked to flatten ────────────────────────────────── */

/** A slide holding only this layer, on nothing, or only the background: what `/api/flatten` renders. */
export const layerAlone = (slide: Slide, layer: Layer): Slide => ({
  id: `${slide.id}-${layer.id}`,
  name: layer.name,
  background: "transparent",
  layers: [layer],
});

export const backgroundAlone = (slide: Slide): Slide => ({ ...slide, layers: [] });
