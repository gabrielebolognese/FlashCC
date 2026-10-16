/**
 * Deck furniture (Batch 20): who made it, which slide this is, keep swiping.
 *
 * Almost every carousel in the research carries the same pieces on every
 * slide, and until now they were placed by hand on each slide and placed again
 * after every reorder. Entirely mechanical, so it is done by the pattern the
 * second half leans on, STAMP AND RESEAL:
 *
 * 1. **Stamp** writes each piece as ordinary, LOCKED layers (18.6), tagged
 *    `furniture: "counter"`, from the identity snapshotted onto the document.
 * 2. **Reseal** runs at the studio's structural funnels (slide insert, delete,
 *    reorder, format change, a re-lay) and at export, and rewrites only the
 *    stamped layers from the deck as it now stands: counter numbers, progress
 *    widths, which slides carry a swipe cue, which handle the author chip shows.
 * 3. **A moved piece keeps its stamp**: reseal updates its words and leaves it
 *    where the user put it.
 * 4. **A piece somebody typed into stops being furniture.** The studio swaps
 *    the stamp for `furnitureOptOut`, and reseal neither touches it nor puts a
 *    fresh one beside it.
 *
 * Neither half is derivation. Nothing is computed at render time and nothing
 * is read from anywhere but the document, and both are idempotent: running
 * either twice gives the same document, and a test asserts it.
 *
 * Pure and DOM-free.
 */

import { contrast, mix } from "./colour.js";
import { makeLayer, uid, type Doc, type Identity, type Layer, type Slide } from "./model.js";
import { platformForSize, safeBox, type Platform } from "./platforms.js";
import { textWidth } from "./text.js";

/** A one-line box measured the way the pre-flight measures, plus a little air. */
const fits = (t: string, size: number, weight = 600): number => Math.ceil(textWidth(t, size, { family: "sans" }) * (weight >= 600 ? 1.06 : 1) + 12);

export type PieceKind = "author" | "counter" | "progress" | "swipe" | "logo" | "footer";

export type FurnitureSet = {
  id: string;
  label: string;
  hint: string;
  pieces: PieceKind[];
  /** Bold's progress bar is the loud one. */
  bold?: boolean | undefined;
};

/**
 * Six, because each is a coherent decision about how loud the furniture is. A
 * seventh would differ from one of these by a corner, and that is what moving
 * a piece is for.
 */
export const FURNITURE_SETS: FurnitureSet[] = [
  { id: "minimal", label: "Minimal", hint: "A slide counter", pieces: ["counter"] },
  { id: "creator", label: "Creator", hint: "Your name and a swipe cue", pieces: ["author", "swipe"] },
  { id: "editorial", label: "Editorial", hint: "A footer line and a counter", pieces: ["footer", "counter"] },
  { id: "corporate", label: "Corporate", hint: "Logo, footer and counter", pieces: ["logo", "footer", "counter"] },
  { id: "bold", label: "Bold", hint: "A heavy progress bar and your name", pieces: ["progress", "author"], bold: true },
  { id: "none", label: "None", hint: "Nothing on the slides", pieces: [] },
];

export const furnitureSet = (id: string | undefined): FurnitureSet | undefined =>
  FURNITURE_SETS.find((s) => s.id === id);

/* ── which slides want which piece (20.2) ─────────────────────────────────── */

const isLast = (i: number, n: number) => i === n - 1 && n > 1;

/**
 * The default rules. The cover is skipped by the counter and the progress bar;
 * the swipe cue is on every slide but the last, the only slide where it would
 * be a lie; the footer is body slides only; the author chip is everywhere
 * except a closing slide that already shows who you are.
 */
export function wants(kind: PieceKind, i: number, n: number, slide: Slide): boolean {
  switch (kind) {
    case "counter":
    case "progress":
      return i > 0;
    case "swipe":
      return !isLast(i, n);
    case "footer":
      return i > 0 && !isLast(i, n);
    case "logo":
      return i === 0 || isLast(i, n);
    case "author":
      return !(isLast(i, n) && slide.layers.some((l) => l.block?.block === "post-card"));
  }
}

/** "3 / 9": the cover is not counted, so a ten-slide deck reads 1 to 9 after it. */
export const counterText = (i: number, n: number): string => `${i} / ${Math.max(1, n - 1)}`;

/** What the author chip says on this platform: the handle there, else the name. */
export function handleFor(identity: Identity, platform: Platform | undefined): string {
  const h = platform ? identity.handles?.[platform.id]?.trim() : undefined;
  return h || identity.name.trim() || "Your name";
}

/* ── placement (20.3) ─────────────────────────────────────────────────────── */

type Box = { x: number; y: number; w: number; h: number };
type Corner = "tl" | "tr" | "bl" | "br" | "top" | "bottom";

const PREFS: Record<PieceKind, Corner[]> = {
  author: ["tl", "bl"],
  counter: ["tr", "br"],
  progress: ["bottom", "top"],
  swipe: ["br", "tr"],
  logo: ["br", "bl", "tr"],
  footer: ["bl", "br"],
};
/** The cover's chip sits at the bottom, under the hook, where a byline goes. */
const COVER_AUTHOR: Corner[] = ["bl", "tl"];

/** How far in from the safe box a piece sits. */
const INSET = 28;

/** The box pieces live inside: the platform's safe area, inset a little. */
export function furnitureArea(doc: Pick<Doc, "width" | "height">, platform: Platform | undefined): Box {
  const safe = platform ? safeBox(platform, doc.width, doc.height) : { x: 0, y: 0, w: doc.width, h: doc.height };
  return { x: safe.x + INSET, y: safe.y + INSET, w: safe.w - INSET * 2, h: safe.h - INSET * 2 };
}

function at(corner: Corner, size: { w: number; h: number }, area: Box): Box {
  switch (corner) {
    case "tl":
      return { x: area.x, y: area.y, ...size };
    case "tr":
      return { x: area.x + area.w - size.w, y: area.y, ...size };
    case "bl":
      return { x: area.x, y: area.y + area.h - size.h, ...size };
    case "br":
      return { x: area.x + area.w - size.w, y: area.y + area.h - size.h, ...size };
    case "top":
      return { x: area.x, y: area.y, w: area.w, h: size.h };
    case "bottom":
      return { x: area.x, y: area.y + area.h - size.h, w: area.w, h: size.h };
  }
}

const hits = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** What a piece must not cover: the slide's content, not its backdrop or other furniture. */
const contentOf = (slide: Slide, doc: Pick<Doc, "width" | "height">): Box[] =>
  slide.layers
    .filter((l) => l.visible && !l.furniture && !(l.w >= doc.width * 0.9 && l.h >= doc.height * 0.9))
    // A full-width band (every framework's closing block) is content where it
    // is, not across the whole slide: judged by its own box like anything else.
    .map((l) => ({ x: l.x, y: l.y, w: l.w, h: l.h }));

/* ── building one piece ───────────────────────────────────────────────────── */

export type Look = { fg: string; muted: string; accent: string; bg: string };

/** The deck's own colours, read from the slide it lands on. */
export function lookOf(slide: Slide, palette: readonly string[]): Look {
  const bg = slide.background;
  const fg = contrast("#ffffff", bg) >= contrast("#111111", bg) ? "#ffffff" : "#111111";
  const accent = palette.find((c) => contrast(c, bg) >= 3 && c.toLowerCase() !== fg) ?? fg;
  return { fg, muted: mix(bg, fg, 0.62), accent, bg };
}

type PieceCtx = {
  slide: Slide;
  index: number;
  total: number;
  identity: Identity;
  platform: Platform | undefined;
  look: Look;
  bold: boolean;
  logo?: { src: string; assetId?: string | undefined; w?: number | undefined; h?: number | undefined } | undefined;
};

const BASE: Partial<Layer> = { locked: true };

/** The layers of one piece, at the origin; `place` moves them into a corner. */
function piece(kind: PieceKind, c: PieceCtx): { layers: Layer[]; size: { w: number; h: number } } | null {
  const tag = { furniture: kind, ...BASE };
  const text = (t: string, w: number, h: number, size: number, fill: string, extra: Partial<Layer> = {}): Layer => ({
    ...makeLayer("text", { x: 0, y: 0, w, h }, fill),
    name: kindLabel(kind),
    text: t,
    fontSize: size,
    fontWeight: 600,
    lineHeight: 1.2,
    ...tag,
    ...extra,
  });

  switch (kind) {
    case "counter": {
      // Measured for the widest number this deck can show, so the box does not
      // change size, and wrap, when reseal renumbers it.
      const t = counterText(c.index, c.total);
      const w = fits(counterText(Math.max(1, c.total - 1), c.total), 24);
      return { layers: [text(t, w, 32, 24, c.look.muted, { align: "right" })], size: { w, h: 32 } };
    }
    case "progress": {
      const h = c.bold ? 14 : 6;
      const frac = c.total > 1 ? c.index / (c.total - 1) : 1;
      // Width is reseal's job; this is the full track, scaled by `frac` in place.
      const track: Layer = { ...makeLayer("rect", { x: 0, y: 0, w: 100, h }, mix(c.look.bg, c.look.fg, 0.16)), name: "Progress track", radius: h / 2, ...tag };
      const fill: Layer = { ...makeLayer("rect", { x: 0, y: 0, w: Math.max(h, 100 * frac), h }, c.look.accent), name: "Progress", radius: h / 2, ...tag };
      return { layers: [track, fill], size: { w: 100, h } };
    }
    case "swipe": {
      const icon: Layer = { ...makeLayer("icon", { x: 0, y: 0, w: 40, h: 40 }, "none"), name: "Swipe cue", glyph: "arrow-right", stroke: c.look.accent, strokeWidth: 2.6, ...tag };
      return { layers: [icon], size: { w: 40, h: 40 } };
    }
    case "footer": {
      const t = c.identity.site?.trim() || c.identity.name.trim();
      if (!t) return null;
      const w = fits(t, 22, 500);
      return { layers: [text(t, w, 30, 22, c.look.muted, { fontWeight: 500 })], size: { w, h: 30 } };
    }
    case "logo": {
      if (!c.logo) return null;
      const aspect = c.logo.w && c.logo.h ? c.logo.w / c.logo.h : 1;
      const h = 56;
      const w = Math.round(h * Math.max(0.5, Math.min(4, aspect)));
      const img: Layer = { ...makeLayer("image", { x: 0, y: 0, w, h }, "#00000000"), name: "Logo", src: c.logo.src, ...(c.logo.assetId ? { assetId: c.logo.assetId } : {}), fit: "contain", radius: 0, ...tag };
      return { layers: [img], size: { w, h } };
    }
    case "author": {
      const large = c.index === 0;
      const av = large ? 72 : 44;
      const name = handleFor(c.identity, c.platform);
      const nameSize = large ? 28 : 22;
      // Wide enough for the longest thing the chip may say on ANY platform, so a
      // per-destination reseal can swap the handle without the line wrapping.
      const longest = [state(c.identity).name, ...Object.values(c.identity.handles ?? {})].reduce((a, b) => (b.length > a.length ? b : a), name);
      const nameW = fits(longest, nameSize);
      const layers: Layer[] = [];
      if (c.identity.avatarSrc) {
        layers.push({ ...makeLayer("image", { x: 0, y: 0, w: av, h: av }, c.look.muted), name: "Author avatar", src: c.identity.avatarSrc, ...(c.identity.avatar ? { assetId: c.identity.avatar } : {}), radius: av / 2, fit: "cover", ...tag });
      } else {
        layers.push({ ...makeLayer("ellipse", { x: 0, y: 0, w: av, h: av }, c.look.accent), name: "Author avatar", ...tag });
      }
      const role = large ? c.identity.role?.trim() : "";
      const lineH = nameSize * 1.25;
      layers.push(text(name, nameW, lineH, nameSize, c.look.fg, { x: av + 16, y: role ? av / 2 - lineH : (av - lineH) / 2, name: "Author" }));
      if (role) layers.push(text(role, fits(role, 20, 500), 26, 20, c.look.muted, { x: av + 16, y: av / 2 + 2, fontWeight: 500, name: "Author role" }));
      return { layers, size: { w: av + 16 + nameW, h: av } };
    }
  }
}

const state = (i: Identity) => ({ name: i.name.trim() || "Your name" });

const kindLabel = (k: PieceKind): string =>
  ({ author: "Author", counter: "Counter", progress: "Progress", swipe: "Swipe cue", logo: "Logo", footer: "Footer" })[k];

/** Moves a piece's layers (built at the origin) to `box`, stretching only the progress bar. */
function placeAt(kind: PieceKind, layers: Layer[], size: { w: number; h: number }, box: Box, c: PieceCtx): Layer[] {
  const group = uid("g");
  if (kind === "progress") {
    const frac = c.total > 1 ? c.index / (c.total - 1) : 1;
    return layers.map((l) => ({
      ...l,
      x: box.x,
      y: box.y,
      w: l.name === "Progress" ? Math.max(l.h, box.w * frac) : box.w,
      groupId: group,
    }));
  }
  return layers.map((l) => ({ ...l, x: Math.round(box.x + l.x), y: Math.round(box.y + l.y), groupId: layers.length > 1 ? group : l.groupId }));
}

/** The first corner in order that keeps clear of the slide's content, or null. */
function cornerFor(kind: PieceKind, size: { w: number; h: number }, c: PieceCtx, doc: Pick<Doc, "width" | "height">, taken: Box[]): Box | null {
  const area = furnitureArea(doc, c.platform);
  const prefs = kind === "author" && c.index === 0 ? COVER_AUTHOR : PREFS[kind];
  const content = [...contentOf(c.slide, doc), ...taken];
  for (const corner of prefs) {
    const box = at(corner, size, area);
    if (!content.some((b) => hits(b, box))) return box;
  }
  return null;
}

/* ── stamp and reseal (20.4) ──────────────────────────────────────────────── */

export type SealOptions = {
  /** The destination. Decides the safe area and which handle the chip shows. */
  platform?: Platform | undefined;
  /** The brand's logo, resolved, for a set that carries one. */
  logo?: PieceCtx["logo"];
  /**
   * Put every piece back in its corner, for a copy reflowed to another
   * platform (20.5), where a position chosen for the old one means nothing.
   */
  replace?: boolean | undefined;
};

/** A slide's piece of `kind`, as the layers carrying the stamp. */
const pieceOn = (slide: Slide, kind: PieceKind): Layer[] => slide.layers.filter((l) => l.furniture === kind);
const optedOut = (slide: Slide, kind: PieceKind): boolean => slide.layers.some((l) => l.furnitureOptOut === kind);

/**
 * Stamps a set onto a deck: snapshots the identity onto the document, clears
 * whatever furniture was there, and lays the set out fresh. A logo layer the
 * brand already stamped (Batch 5) is adopted as the logo piece, not doubled.
 */
export function stampFurniture(doc: Doc, setId: string, identity: Identity, opts: SealOptions = {}): Doc {
  const set = furnitureSet(setId);
  const slides = doc.slides.map((s) => ({
    ...s,
    layers: s.layers
      .filter((l) => !l.furniture)
      .map((l) =>
        set?.pieces.includes("logo") && l.kind === "image" && l.name === "Logo" && l.assetId
          ? { ...l, furniture: "logo", locked: true }
          : l,
      ),
  }));
  const base: Doc = { ...doc, furniture: { set: setId, identity }, slides };
  return reseal(base, { ...opts, replace: true });
}

/** Takes a deck's furniture off: every stamped piece, and the record of the set. */
export function clearFurniture(doc: Doc): Doc {
  const { furniture: _gone, ...rest } = doc;
  return { ...rest, slides: doc.slides.map((s) => ({ ...s, layers: s.layers.filter((l) => !l.furniture) })) };
}

export type SealResult = { doc: Doc; missing: { slide: number; kind: PieceKind }[] };

/**
 * Brings every stamped piece in line with the deck as it now stands.
 *
 * Returns the SAME document when nothing needed changing, so it can run at
 * every structural funnel without every save looking like an edit.
 */
export function reseal(doc: Doc, opts: SealOptions = {}): Doc {
  return resealWith(doc, opts).doc;
}

export function resealWith(doc: Doc, opts: SealOptions = {}): SealResult {
  const state = doc.furniture;
  const set = furnitureSet(state?.set);
  if (!state || !set) return { doc, missing: [] };
  const platform = opts.platform ?? platformForSize(doc.width, doc.height);
  const n = doc.slides.length;
  const missing: SealResult["missing"] = [];
  let changed = false;

  // The logo, from an existing logo piece when the caller has none to hand:
  // that is how a new slide gets the same mark as the others.
  const logoTemplate = doc.slides.flatMap((s) => s.layers).find((l) => l.furniture === "logo" && l.src);
  const logo = opts.logo ?? (logoTemplate?.src ? { src: logoTemplate.src, assetId: logoTemplate.assetId, w: logoTemplate.w, h: logoTemplate.h } : undefined);

  const slides = doc.slides.map((slide, i) => {
    let layers = slide.layers;
    const c: PieceCtx = { slide, index: i, total: n, identity: state.identity, platform, look: lookOf(slide, doc.palette), bold: Boolean(set.bold), logo };
    const taken: Box[] = [];

    for (const kind of set.pieces) {
      if (optedOut(slide, kind)) continue;
      const existing = pieceOn({ ...slide, layers }, kind);
      const want = wants(kind, i, n, slide);

      if (!want) {
        if (existing.length > 0) {
          layers = layers.filter((l) => l.furniture !== kind);
          changed = true;
        }
        continue;
      }

      const built = piece(kind, c);
      if (!built) continue;

      const area = furnitureArea(doc, platform);
      const outside = existing.some((l) => l.x < area.x - INSET || l.y < area.y - INSET || l.x + l.w > area.x + area.w + INSET || l.y + l.h > area.y + area.h + INSET);

      if (existing.length > 0 && !(opts.replace || outside)) {
        // Where the user put it stays where it is; only what it SAYS changes.
        const next = refresh(kind, existing, c);
        if (next !== existing) {
          layers = layers.map((l) => next.find((x) => x.id === l.id) ?? l);
          changed = true;
        }
        taken.push(...existing.map((l) => ({ x: l.x, y: l.y, w: l.w, h: l.h })));
        continue;
      }

      const box = cornerFor(kind, built.size, { ...c, slide: { ...slide, layers: layers.filter((l) => l.furniture !== kind) } }, doc, taken);
      if (!box) {
        // Furniture never pushes content: no free corner, no piece, and the
        // pre-flight says which slide went without.
        if (existing.length > 0) {
          layers = layers.filter((l) => l.furniture !== kind);
          changed = true;
        }
        missing.push({ slide: i + 1, kind });
        continue;
      }
      const placed = placeAt(kind, built.layers, built.size, box, c);
      // Keep ids of a piece being re-placed, so a selection or a reference to
      // it survives an export's reseal.
      const reuse = placed.map((l, k) => (existing[k] ? { ...l, id: existing[k]!.id } : l));
      layers = [...layers.filter((l) => l.furniture !== kind), ...reuse];
      taken.push(box);
      changed = true;
    }

    return layers === slide.layers ? slide : { ...slide, layers };
  });

  return { doc: changed ? { ...doc, slides } : doc, missing };
}

/**
 * The words and widths of a piece that stays where it is.
 *
 * Returns the same array when nothing changed, which is what keeps reseal
 * idempotent.
 */
function refresh(kind: PieceKind, existing: Layer[], c: PieceCtx): Layer[] {
  let changed = false;
  const next = existing.map((l) => {
    if (kind === "counter" && l.kind === "text") {
      const t = counterText(c.index, c.total);
      if (l.text !== t) {
        changed = true;
        return { ...l, text: t };
      }
    }
    if (kind === "author" && l.name === "Author") {
      const t = handleFor(c.identity, c.platform);
      if (l.text !== t) {
        changed = true;
        return { ...l, text: t };
      }
    }
    if (kind === "progress" && l.name === "Progress") {
      const track = existing.find((x) => x.name === "Progress track");
      const frac = c.total > 1 ? c.index / (c.total - 1) : 1;
      const w = Math.max(l.h, (track?.w ?? l.w) * frac);
      if (Math.abs(l.w - w) > 0.5) {
        changed = true;
        return { ...l, w };
      }
    }
    return l;
  });
  return changed ? next : existing;
}

/** The slides that should carry a piece and do not, for the pre-flight. */
export function missingFurniture(doc: Doc): { slide: number; kind: PieceKind }[] {
  const set = furnitureSet(doc.furniture?.set);
  if (!set) return [];
  const out: { slide: number; kind: PieceKind }[] = [];
  doc.slides.forEach((slide, i) => {
    for (const kind of set.pieces) {
      if (kind === "logo" && !doc.slides.some((s) => pieceOn(s, "logo").length > 0)) continue;
      if (kind === "footer" && !(doc.furniture?.identity.site || doc.furniture?.identity.name)) continue;
      if (wants(kind, i, doc.slides.length, slide) && pieceOn(slide, kind).length === 0 && !optedOut(slide, kind)) {
        out.push({ slide: i + 1, kind });
      }
    }
  });
  return out;
}

export const pieceLabel = kindLabel;

type BrandLike = {
  name: string;
  identity?: Identity | undefined;
  furniture?: string | undefined;
  logos: Record<string, string | undefined>;
};

/**
 * A deck furnished the way its brand says (20.6): the brand's set, stamped from
 * its identity, with its mark when the set carries a logo. A brand with no set,
 * or "none", leaves the deck exactly as it was.
 */
export function furnishWith(
  doc: Doc,
  brand: BrandLike,
  resolve: (assetId: string) => { src: string; w?: number | undefined; h?: number | undefined } | undefined,
): Doc {
  if (!brand.furniture || brand.furniture === "none") return doc;
  const identity = brand.identity ?? { name: brand.name, handles: {} };
  const assetId = brand.logos.mark ?? brand.logos.light ?? brand.logos.dark;
  const file = assetId ? resolve(assetId) : undefined;
  return stampFurniture(doc, brand.furniture, identity, file && assetId ? { logo: { ...file, assetId } } : {});
}
