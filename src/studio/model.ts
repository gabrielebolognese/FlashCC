/**
 * The canvas model. Flat layers on an artboard — the Photoshop/Figma model, not a
 * document model.
 *
 * There are no roles, no blocks, no templates at runtime and nothing derived. A slide
 * is a background plus an ordered list of layers, every one of which is freely
 * positioned, resizable and restylable. Array order IS z-order (0 = back).
 *
 * Coordinates are ARTBOARD PIXELS, not fractions: 1080×1350 is a canvas, and a layer
 * at x=540 is at x=540. Changing the artboard size is a canvas resize, exactly as it
 * is in an image editor — content keeps its position.
 */

export type LayerKind = "text" | "rect" | "ellipse" | "triangle" | "line" | "icon" | "image";

export type Layer = {
  id: string;
  name: string;
  kind: LayerKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;

  fill: string;
  stroke: string | null;
  strokeWidth: number;
  radius: number;

  /** text */
  text?: string | undefined;
  fontFamily?: string | undefined;
  fontSize?: number | undefined;
  fontWeight?: number | undefined;
  lineHeight?: number | undefined;
  letterSpacing?: number | undefined;
  align?: "left" | "center" | "right" | undefined;
  valign?: "top" | "middle" | "bottom" | undefined;
  italic?: boolean | undefined;
  underline?: boolean | undefined;
  uppercase?: boolean | undefined;

  /** icon */
  glyph?: string | undefined;

  /** image */
  src?: string | undefined;
  fit?: "cover" | "contain" | undefined;
};

/** One item in the media pool. Data URL so a project stays self-contained. */
export type MediaItem = {
  id: string;
  name: string;
  src: string;
  w: number;
  h: number;
  bytes: number;
};

export type Slide = {
  id: string;
  name: string;
  background: string;
  layers: Layer[];
};

export type Doc = {
  version: 3;
  id: string;
  name: string;
  width: number;
  height: number;
  /** Saved swatches. Not a brand lock — just colours you reach for. */
  palette: string[];
  /** Uploaded images, shared across every slide in the project. */
  media: MediaItem[];
  /** Optional folder name. Projects with none sit under "Ungrouped". */
  group?: string | undefined;
  slides: Slide[];
  createdAt: string;
  updatedAt: string;
};

export type Tool = "select" | "text" | "rect" | "ellipse" | "triangle" | "line" | "icon";

export const FORMATS = [
  { id: "portrait", label: "4:5", w: 1080, h: 1350 },
  { id: "square", label: "1:1", w: 1080, h: 1080 },
  { id: "story", label: "9:16", w: 1080, h: 1920 },
] as const;

export const FONTS = [
  { id: "sans", label: "Sans", stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { id: "serif", label: "Serif", stack: 'Georgia, "Times New Roman", Times, serif' },
  { id: "mono", label: "Mono", stack: '"SF Mono", ui-monospace, "Cascadia Code", Consolas, monospace' },
  { id: "display", label: "Display", stack: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' },
] as const;

export const fontStack = (id: string | undefined): string =>
  FONTS.find((f) => f.id === id)?.stack ?? FONTS[0].stack;

export const DEFAULT_PALETTE = [
  "#0f172a", "#ffffff", "#d9a521", "#e5545a", "#3dbe7a",
  "#4c86d6", "#db2777", "#f7f4ed", "#64748b", "#12285a",
];

let seq = 0;
export const uid = (p: string): string => {
  seq += 1;
  return `${p}_${Date.now().toString(36)}${seq.toString(36)}`;
};

/* ── factories ────────────────────────────────────────────────────────── */

const BASE = {
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  stroke: null,
  strokeWidth: 0,
  radius: 0,
};

export function makeLayer(kind: LayerKind, at: { x: number; y: number; w: number; h: number }, fill: string): Layer {
  const common = { id: uid("l"), kind, ...at, ...BASE, fill };

  switch (kind) {
    case "text":
      return {
        ...common,
        name: "Text",
        text: "Type something",
        fontFamily: "sans",
        fontSize: 64,
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: 0,
        align: "left",
        valign: "top",
        italic: false,
        underline: false,
        uppercase: false,
      };
    case "icon":
      return { ...common, name: "Icon", glyph: "star", stroke: fill, strokeWidth: 2, fill: "none" };
    case "line":
      return { ...common, name: "Line", h: 8, radius: 4 };
    case "image":
      return { ...common, name: "Image", fit: "cover" };
    case "ellipse":
      return { ...common, name: "Ellipse" };
    case "triangle":
      return { ...common, name: "Triangle" };
    default:
      return { ...common, name: "Rectangle" };
  }
}

export function makeSlide(background = "#12161c", name = "Slide"): Slide {
  return { id: uid("s"), name, background, layers: [] };
}

export function makeDoc(name = "Untitled", w = 1080, h = 1350): Doc {
  const now = new Date().toISOString();
  return {
    version: 3,
    id: uid("d"),
    name,
    width: w,
    height: h,
    palette: [...DEFAULT_PALETTE],
    media: [],
    slides: [makeSlide()],
    createdAt: now,
    updatedAt: now,
  };
}

export const cloneLayer = (l: Layer, dx = 24, dy = 24): Layer => ({
  ...l,
  id: uid("l"),
  x: l.x + dx,
  y: l.y + dy,
});
