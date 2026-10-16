/**
 * Designs that run across the whole strip (23.3) and designs whose point is
 * the seam (23.4). Every function returns plain layers placed with spans.ts,
 * so a panorama is still ordinary layers, one piece per slide.
 */
import { deckSeed, strengthCap, textureSvg, svgDataUrl } from "./backdrops.js";
import { makeDoc, makeLayer, makeSlide, uid, type Credit, type Doc, type Layer, type TextureKind } from "./model.js";
import type { Platform } from "./platforms.js";
import type { Theme } from "./presets.js";
import { addAcross } from "./spans.js";
import { textWidth } from "./text.js";

const ids = { span: () => uid("span"), layer: () => uid("l") };

export type StripPicture = {
  src: string;
  name?: string | undefined;
  assetId?: string | undefined;
  credit?: Credit | undefined;
  focal?: { x: number; y: number } | undefined;
};

/**
 * One picture under the whole strip: `N x W` wide, behind everything, one
 * piece per slide. The focal point belongs to the strip, so it is set on the
 * whole layer and every piece carries the same one: the subject stays in the
 * strip, wherever it falls.
 */
export function stripBackground(doc: Doc, pic: StripPicture): Doc {
  const n = doc.slides.length;
  const layer: Layer = {
    ...makeLayer("image", { x: 0, y: 0, w: n * doc.width, h: doc.height }, "#000000"),
    name: pic.name ?? "Strip background",
    src: pic.src,
    fit: "cover",
    ...(pic.assetId ? { assetId: pic.assetId } : {}),
    ...(pic.credit ? { credit: pic.credit } : {}),
    ...(pic.focal ? { focal: pic.focal } : {}),
  };
  return addAcross(doc, layer, ids, "bottom");
}

/**
 * A generated texture (21.3) drawn once at strip size, so the pattern and the
 * mesh run on across every edge instead of restarting on each slide.
 */
export function stripTexture(
  doc: Doc,
  kind: TextureKind,
  strength: number,
  colours: Pick<Theme, "bg" | "fg" | "accent" | "muted">,
  platform: Platform | null | undefined,
): Doc {
  const n = doc.slides.length;
  const s = Math.min(strength, strengthCap(kind, platform));
  const svg = textureSvg(kind, deckSeed(doc), s, colours, n * doc.width, doc.height);
  return stripBackground(doc, { src: svgDataUrl(svg), name: "Strip texture" });
}

/**
 * Panorama from one image: a new deck of `count` slides with the picture
 * split across all of them. The single most common reason photographers want
 * a carousel tool.
 */
export function panoramaDeck(pic: StripPicture, count: number, theme: Pick<Theme, "bg">, size = { w: 1080, h: 1350 }): Doc {
  const n = Math.max(2, Math.min(10, Math.round(count)));
  const base = makeDoc(pic.name ? `${pic.name} panorama` : "Panorama", size.w, size.h);
  const doc: Doc = {
    ...base,
    slides: Array.from({ length: n }, (_, i) => ({ ...makeSlide(theme.bg, `Slide ${i + 1}`), layers: [] })),
  };
  return stripBackground(doc, { ...pic, name: pic.name ?? "Panorama" });
}

/* ── bridges (23.4) ───────────────────────────────────────────────────────── */

export type BridgeKind = "line" | "number" | "arrow" | "peek";

export const BRIDGES: { id: BridgeKind; label: string; hint: string }[] = [
  { id: "peek", label: "Peek", hint: "A shape peeking in from the next slide: the swipe cue that shows rather than tells" },
  { id: "line", label: "Lead line", hint: "A line that leads from this slide into the next" },
  { id: "arrow", label: "Arrow", hint: "An arrow that starts here and lands on the next slide" },
  { id: "number", label: "Split number", hint: "A big number cut by the edge, half on each slide" },
];

/**
 * A bridge across the edge after slide `from`, in strip coordinates. Plain
 * layers in the theme's colours; the user moves and restyles them like any
 * other. Never placed by a model: a bridge is a layout choice (invariant 5).
 */
export function bridgeLayer(kind: BridgeKind, from: number, board: { w: number; h: number }, theme: Theme): Layer {
  const W = board.w;
  const H = board.h;
  const edge = (from + 1) * W;
  switch (kind) {
    case "peek": {
      // Mostly on the next slide, a quarter of it showing on this one.
      const size = Math.round(Math.min(W, H) * 0.42);
      return {
        ...makeLayer("ellipse", { x: edge - Math.round(size * 0.28), y: Math.round(H / 2 - size / 2), w: size, h: size }, theme.accent),
        name: "Peek",
        bridge: "peek",
      };
    }
    case "line":
      return {
        ...makeLayer("rect", { x: edge - Math.round(W * 0.4), y: Math.round(H * 0.8), w: Math.round(W * 0.8), h: 8 }, theme.accent),
        name: "Lead line",
        radius: 4,
        bridge: "line",
      };
    case "arrow":
      return {
        ...makeLayer("path", { x: edge - 380, y: Math.round(H * 0.62), w: 640, h: 192 }, "none"),
        name: "Arrow",
        path: "M12 150 C 150 30, 420 20, 610 96 M 568 52 L 616 98 L 556 128",
        pathW: 640,
        pathH: 192,
        stroke: theme.accent,
        strokeWidth: 10,
        scaleStroke: true,
        bridge: "arrow",
      };
    case "number": {
      const text = String(from + 2).padStart(2, "0");
      const size = Math.round(H * 0.5);
      const w = Math.ceil(textWidth(text, size, { family: theme.displayFont ?? "sans", weight: 900 }));
      return {
        ...makeLayer("text", { x: edge - Math.round(w / 2), y: Math.round(H / 2 - size * 0.55), w, h: Math.round(size * 1.1) }, theme.accent),
        name: "Split number",
        text,
        fontSize: size,
        fontWeight: 900,
        lineHeight: 1.1,
        letterSpacing: -0.04,
        opacity: 0.9,
        bridge: "number",
        ...(theme.displayFont ? { fontFamily: theme.displayFont } : {}),
      };
    }
  }
}

/** Adds a bridge after slide `from`. The split number goes behind the words; the rest on top. */
export function addBridge(doc: Doc, kind: BridgeKind, from: number, theme: Theme): Doc {
  if (from < 0 || from + 1 >= doc.slides.length) return doc;
  const layer = bridgeLayer(kind, from, { w: doc.width, h: doc.height }, theme);
  return addAcross(doc, layer, ids, kind === "number" ? "bottom" : "top");
}

/** A deck whose cover carries a peek (23.4): its swipe-cue furniture stands down. */
export const hasPeek = (doc: Pick<Doc, "slides">): boolean =>
  doc.slides[0]?.layers.some((l) => l.bridge === "peek" && l.visible) ?? false;
