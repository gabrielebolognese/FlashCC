/**
 * Image tools that stay on the layer (21.4).
 *
 * Every tool here writes a value onto the image layer once, and the painter
 * turns that value into CSS. A filter is a stored value rendered by CSS, not a
 * pipeline that re-runs; a mask is a stored name, not a second picture. That
 * keeps invariant 1 (what is stored is what renders) and invariant 3 (the
 * painter is the only painter): the editor, the thumbnails and the Chromium
 * export all read the same few fields through `LayerView`.
 *
 * Pure and DOM-free, like geometry.ts, so the CSS each tool produces is tested.
 */
import { luminance } from "./colour.js";
import { makeLayer, type ImageFilter, type ImageMask, type Layer } from "./model.js";

export const MASKS: { id: ImageMask; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "rounded", label: "Rounded" },
  { id: "arch", label: "Arch" },
  { id: "blob", label: "Blob" },
  { id: "slant", label: "Slant" },
];

export const FILTERS: { id: ImageFilter["kind"]; label: string }[] = [
  { id: "duotone", label: "Duotone" },
  { id: "mono", label: "Mono" },
  { id: "contrast", label: "High contrast" },
  { id: "blur", label: "Soft blur" },
];

/* ── focal point ──────────────────────────────────────────────────────────── */

const pct = (n: number): string => `${Math.round(Math.min(1, Math.max(0, n)) * 1000) / 10}%`;

/**
 * Where a cover-fitted picture sits in its box. `object-position: x% y%`
 * lines the picture's x% point up with the box's x% point, so the focal point
 * is inside the frame for every box shape: a reflow to 1:1, a crop for the
 * Instagram grid, a layer dragged narrow. The subject stays in.
 */
export const focalPosition = (focal: { x: number; y: number } | undefined): string =>
  focal ? `${pct(focal.x)} ${pct(focal.y)}` : "50% 50%";

/** A click on a preview of the whole picture, as a focal point. */
export function focalFromClick(
  click: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const clamp = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
  return {
    x: rect.width > 0 ? clamp((click.x - rect.left) / rect.width) : 0.5,
    y: rect.height > 0 ? clamp((click.y - rect.top) / rect.height) : 0.5,
  };
}

/* ── masks ────────────────────────────────────────────────────────────────── */

/** A small stable number from a string, so a blob is the same blob every render. */
export function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * A soft blob filling a w by h box, as an SVG path in pixels. The shape comes
 * from the layer's id, so it holds still while the layer moves and changes
 * only if the layer is resized.
 */
export function blobPath(w: number, h: number, seed: number): string {
  const n = 8;
  let a = seed >>> 0;
  const rand = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  const pts = Array.from({ length: n }, (_, k) => {
    const t = (k / n) * Math.PI * 2;
    const rr = 0.86 + rand() * 0.14;
    return [w / 2 + Math.cos(t) * (w / 2) * rr, h / 2 + Math.sin(t) * (h / 2) * rr] as const;
  });
  const mid = (p: readonly [number, number], q: readonly [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const;
  const start = mid(pts[n - 1]!, pts[0]!);
  let d = `M${r1(start[0])} ${r1(start[1])}`;
  for (let k = 0; k < n; k += 1) {
    const p = pts[k]!;
    const q = mid(p, pts[(k + 1) % n]!);
    d += ` Q${r1(p[0])} ${r1(p[1])} ${r1(q[0])} ${r1(q[1])}`;
  }
  return `${d} Z`;
}

/** The clip-path for a mask on a box of this size. */
export function maskClip(mask: ImageMask, w: number, h: number, id: string): string {
  switch (mask) {
    case "circle":
      return "circle(closest-side at 50% 50%)";
    case "rounded":
      return `inset(0 round ${Math.round(Math.min(w, h) * 0.12)}px)`;
    case "arch":
      // Both top corners as quarter circles of half the width: a doorway.
      return `inset(0 round ${r1(w / 2)}px ${r1(w / 2)}px 0 0)`;
    case "slant":
      return "polygon(0 0, 100% 0, 100% 86%, 0 100%)";
    case "blob":
      return `path('${blobPath(w, h, hashOf(id))}')`;
  }
}

/* ── filters ──────────────────────────────────────────────────────────────── */

/** The CSS filter on the picture itself. Duotone's colours are painted around it, see `LayerView`. */
export function filterCss(filter: ImageFilter | undefined): string | undefined {
  if (!filter) return undefined;
  switch (filter.kind) {
    case "mono":
      return "grayscale(1) contrast(1.08)";
    case "contrast":
      return "contrast(1.35) saturate(1.15)";
    case "blur":
      return "blur(10px)";
    case "duotone":
      return "grayscale(1) contrast(1.1)";
  }
}

/**
 * Duotone in brand colours: the darker of background and foreground for the
 * shadows, the accent for the highlights. Chosen once, when the filter is
 * applied, and stored, so changing the brand later does not repaint it.
 */
export function duotoneOf(theme: { bg: string; fg: string; accent: string }): ImageFilter {
  const dark = luminance(theme.bg) <= luminance(theme.fg) ? theme.bg : theme.fg;
  return { kind: "duotone", dark, light: theme.accent };
}

/* ── text scrim ───────────────────────────────────────────────────────────── */

/**
 * A gradient behind a text layer, darkest under the words and clear away from
 * them: the honest fix for text on a photograph. Dark for light text, light
 * for dark text. Full width, because a scrim with visible side edges reads as
 * a box and is worse than none.
 */
export function scrimFor(text: Layer, board: { w: number; h: number }): Layer {
  const light = luminance(text.fill.startsWith("#") ? text.fill : "#ffffff") > 0.4;
  const ink = light ? "#000000" : "#ffffff";
  const pad = Math.round(Math.max(80, text.h * 0.6));
  const y = Math.max(0, text.y - pad);
  const bottom = Math.min(board.h, text.y + text.h + Math.round(pad / 2));
  // The words sit in the lower half: darken towards the bottom edge, and the
  // other way round when they sit in the upper half.
  const lower = text.y + text.h / 2 > board.h / 2;
  return {
    ...makeLayer("rect", { x: 0, y, w: board.w, h: bottom - y }, ink),
    name: "Text scrim",
    gradient: {
      kind: "linear",
      angle: lower ? 180 : 0,
      cx: 0.5,
      cy: 0.5,
      stops: [
        { colour: `${ink}00`, at: 0 },
        { colour: `${ink}b3`, at: 0.55 },
        { colour: `${ink}cc`, at: 1 },
      ],
    },
  };
}

/** The slide's layers with a scrim placed directly under the given text layer. */
export function withScrim(layers: readonly Layer[], textId: string, board: { w: number; h: number }): Layer[] | null {
  const i = layers.findIndex((l) => l.id === textId);
  const text = layers[i];
  if (!text || text.kind !== "text") return null;
  return [...layers.slice(0, i), scrimFor(text, board), ...layers.slice(i)];
}
