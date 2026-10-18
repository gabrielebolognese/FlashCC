/**
 * The canvas model. Flat layers on an artboard, the Photoshop/Figma model, not a
 * document model.
 *
 * There are no roles, no blocks, no templates at runtime and nothing derived. A slide
 * is a background plus an ordered list of layers, every one of which is freely
 * positioned, resizable and restylable. Array order IS z-order (0 = back).
 *
 * Coordinates are ARTBOARD PIXELS, not fractions: 1080×1350 is a canvas, and a layer
 * at x=540 is at x=540. Changing the artboard size re-lays the layers that are there
 * (see reflow.ts) rather than leaving them at their old pixel positions, which used to
 * strand every one of them in the top corner of a taller board.
 */

import type { Gradient } from "./gradient.js";
import { MEASURED } from "./typemetrics.js";

export type LayerKind = "text" | "rect" | "ellipse" | "triangle" | "line" | "icon" | "image" | "path";

/**
 * Where a layer came from, when a block made it (Batch 19).
 *
 * A stamp, read only by the block tools: "Edit as block" uses it to find the
 * instance again, and the regenerator uses it to leave the block alone. Nothing
 * reads it at render. The same shape `stampLogo`'s layers have always had in
 * spirit, a tag on an ordinary layer.
 */
export type BlockStamp = {
  block: string;
  instance: string;
  part: string;
  /** Placed by a framework slot (19.7): generation owns it and rebuilds it. */
  slot?: true | undefined;
};

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

  /**
   * Set the moment the user changes this layer, and never cleared.
   *
   * Regeneration keeps these and replaces everything else. Nothing infers it
   * from the content: a layer deliberately restored to its original colour
   * would silently lose its protection if it did.
   */
  handEdited?: boolean | undefined;

  fill: string;
  /**
   * Layers sharing one of these select and move together (18.6).
   *
   * A tag, not a container: no transform of its own, no nested coordinates,
   * nothing reflow, render or export has to know about. One level only.
   */
  groupId?: string | undefined;
  /**
   * One piece of a layer that runs across a slide edge (23.2). Every slide the
   * design touches holds its own plain copy, offset by the slide width, and the
   * pieces share this id. Each slide clips and renders its piece alone; strip
   * view selects and moves the pieces together, like `groupId` across slides.
   * See spans.ts.
   */
  spanId?: string | undefined;
  /** Which bridge preset made this (23.4), so a peek can stand in for the swipe cue. Never read at render. */
  bridge?: string | undefined;

  /** Painted instead of `fill` when set. Works on text as well as shapes. */
  gradient?: Gradient | undefined;
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
  /**
   * The colour `*accent*` runs and highlighter strokes take (22.3). Stored when
   * the layer is made, from the style, so the style decides how emphasis looks
   * and the painter never has to guess. Absent falls back to the fill.
   */
  markColour?: string | undefined;
  /** The one effect this text carries (22.4). Gradient text is `gradient`, and setting either clears the other. */
  textEffect?: TextEffect | undefined;
  /** The effect's colour: the label's box, the outline's stroke, the shadow. Absent uses the effect's default. */
  effectColour?: string | undefined;

  /** icon */
  glyph?: string | undefined;

  /**
   * path: an SVG path in its own coordinate box, stretched to the layer's.
   *
   * The one shape the other kinds cannot draw: a donut segment, an arrow head,
   * a QR code's modules as one shape rather than six hundred rectangles. Still
   * one layer, still painted by LayerView, still exported by the same render.
   */
  path?: string | undefined;
  pathW?: number | undefined;
  pathH?: number | undefined;
  /**
   * Stroke scales with the shape, in the path's own units. An icon drawn at 2
   * units on a 24-unit grid stays the weight it was designed at however large
   * it is placed. Off (the default), a stroke is artboard pixels, which is
   * what a chart line or an arrow wants.
   */
  scaleStroke?: boolean | undefined;
  /** Which bundled icon this is (21.1), so the picker knows the deck's style. */
  icon?: { set: string; name: string } | undefined;

  /** A soft drop shadow. Screenshot polish (19.2) is the reason it exists. */
  shadow?: { y: number; blur: number; colour: string } | undefined;

  /** See `BlockStamp`. */
  block?: BlockStamp | undefined;
  /**
   * The words came from a verified source quote (Batch 13) and have not been
   * changed since. Editing the words clears it, because an edited quote is no
   * longer a quote.
   */
  verbatim?: boolean | undefined;

  /**
   * Deck furniture (Batch 20): which piece this is, so reseal can find it.
   * Typing into a piece removes the stamp and records `furnitureOptOut`, so
   * reseal neither touches it again nor puts a fresh one beside it.
   */
  furniture?: string | undefined;
  furnitureOptOut?: string | undefined;

  /** image */
  src?: string | undefined;
  fit?: "cover" | "contain" | undefined;
  /**
   * The point of the picture that must stay in frame (21.4), 0 to 1 of its
   * width and height. Painted as `object-position`, so every crop and every
   * reflow keeps the subject in. Absent is the centre.
   */
  focal?: { x: number; y: number } | undefined;
  /** A shape the picture is cut to (21.4). See imagetools.ts. */
  mask?: ImageMask | undefined;
  /** A look stored on the picture (21.4), rendered by CSS, never re-run. */
  filter?: ImageFilter | undefined;
  /**
   * The library asset this picture came from, when it came from one.
   *
   * `src` is the URL currently being painted and goes stale, a signed URL
   * expires, and a document reopened next week would show a broken image. This
   * is the durable half: `assets.resolveDoc` puts a live URL back into `src`
   * from it. Absent means the bytes are inline in `src`, which is still how a
   * project with no account works.
   */
  assetId?: string | undefined;
  /** Who to credit, for a stock photo (21.2). See `Credit`. */
  credit?: Credit | undefined;
};

export type TextEffect = "highlight" | "scribble" | "label" | "outline" | "shadow";

export type ImageMask = "circle" | "rounded" | "arch" | "blob" | "slant";

export type ImageFilter =
  | { kind: "mono" | "contrast" | "blur" }
  /** The brand colours it was applied in, stored: a later brand change does not repaint it. */
  | { kind: "duotone"; dark: string; light: string };

/**
 * The attribution a stock photo carries (21.2), stored beside the picture
 * wherever the picture goes: the pool, a layer, a slide background. A copy,
 * never a lookup, so it survives the photo leaving the provider's search.
 * `transcript.creditsOf` gathers the ones a deck actually uses.
 */
export type Credit = {
  provider: string;
  /** The photographer. */
  name: string;
  /** Their page on the provider, referral-tagged where the provider asks. */
  url: string;
  /** The photo's own page. */
  page: string;
};

/**
 * One item in the media pool.
 *
 * `src` is whatever an `<img>` should point at right now: a data URL for a
 * project with no account, a signed URL once the file lives in a bucket.
 * `assetId` is the durable reference, see the note on `Layer.assetId`.
 */
export type MediaItem = {
  id: string;
  name: string;
  src: string;
  w: number;
  h: number;
  /** Decoded file size, not the length of a base64 string. */
  bytes: number;
  assetId?: string | undefined;
  credit?: Credit | undefined;
};

/**
 * A picture behind everything on the slide.
 *
 * Not a layer, deliberately. A full-bleed image layer at z-index 0 would look
 * the same and would be the Photoshop-model answer, but it is selectable,
 * draggable and deletable by accident, and it shifts every other layer's index
 * by one. A background is the thing you put content ON, so it belongs to the
 * slide the way `background` and `gradient` already do.
 *
 * `src` and `assetId` follow the same rule as a layer's: `src` is what an
 * `<img>` should point at right now and goes stale, `assetId` is the durable
 * half, and `assets.resolveDoc` puts a live URL back into `src`.
 */
export type SlideImage = {
  src: string;
  assetId?: string | undefined;
  credit?: Credit | undefined;
  /** See `Layer.focal`. Painted as `background-position`. */
  focal?: { x: number; y: number } | undefined;
  fit?: "cover" | "contain" | undefined;
  /**
   * How much black sits between the picture and the text, 0 to 1.
   *
   * Not optional in spirit: text on an unscrimmed photograph is the single
   * fastest way to make a carousel unreadable, and the contrast this product
   * checks everywhere else does not apply to a picture it cannot see into.
   */
  scrim?: number | undefined;
};

/** The generated backgrounds (21.3). See backdrops.ts. */
export type TextureKind = "mesh" | "grain" | "dots" | "lines" | "blobs" | "paper" | "tiles";

/**
 * A generated texture over the slide's background. `src` is the SVG as it was
 * generated and is what paints; the rest records what it was generated from,
 * so the control can show it and regenerate on purpose. Never re-read at paint.
 */
export type SlideTexture = {
  kind: TextureKind;
  seed: number;
  strength: number;
  src: string;
};

export type Slide = {
  id: string;
  name: string;
  background: string;
  /** Painted instead of `background` when set. */
  gradient?: Gradient | undefined;
  /** Painted over both of the above, under every layer, when set. */
  image?: SlideImage | undefined;
  /** Painted over all of the above, under every layer, when set (21.3). */
  texture?: SlideTexture | undefined;
  /**
   * What this slide says, for somebody using a screen reader.
   *
   * On the slide rather than beside the export, because it belongs to the slide:
   * it survives reordering, duplication, sync and version history for free, and
   * `docs.data` is a single jsonb blob so it needs no migration. A parallel
   * array kept next to the deck would go out of step the first time anybody
   * dragged a thumbnail.
   */
  alt?: string | undefined;
  /**
   * The composition that laid this slide out, stamped once at generation.
   *
   * A stamp, not a binding: nothing re-reads the composition at render. It is
   * here so Tidy (18.2) can use the spacing steps this slide was built from
   * rather than an arbitrary pixel average. Absent on hand-made slides, which
   * get the default scale.
   */
  composition?: string | undefined;
  /**
   * The fields each block on this slide was built from (19.8), so "Edit as
   * block" can reopen the form. A record of input, never read at render.
   */
  blocks?: BlockRecord[] | undefined;
  /** Seconds this slide holds in a video export (26.1), when somebody changed it from the formula. */
  hold?: number | undefined;
  layers: Layer[];
};

export type BlockRecord = {
  instance: string;
  block: string;
  fields: Record<string, string>;
  box: { x: number; y: number; w: number; h: number };
  /** Each part as built: its box and a signature of its look. See blockplace.ts. */
  parts?: Record<string, { x: number; y: number; w: number; h: number; look: string }> | undefined;
  /** See `BlockStamp.slot`. */
  slot?: true | undefined;
};

export type Doc = {
  version: 3;
  id: string;
  name: string;
  width: number;
  height: number;
  /** Saved swatches. Not a brand lock, just colours you reach for. */
  palette: string[];
  /** Uploaded images, shared across every slide in the project. */
  media: MediaItem[];
  /**
   * Which client this belongs to. Absent is a real answer, most of anybody's
   * library is unassigned, and the roll-up shows it either way. See clients.ts.
   */
  clientId?: string | undefined;
  /**
   * Optional folder name. Projects with none sit under "Ungrouped".
   *
   * NOT replaced by `clientId`. A client is the owner; a group is a drawer
   * inside it, and somebody with one client still wants "March" and
   * "Launch". Batch 6 also forms a series out of a group's contents.
   */
  group?: string | undefined;
  /**
   * How this carousel was made. Stamped once at generation and never re-derived,
   * because it is what analytics attributes performance to, a post cannot tell you
   * that Problem → Solution outperforms unless something remembered which one it was.
   */
  framework?: string | undefined;
  styleId?: string | undefined;
  /**
   * Shuffle rhythm (25.2): how far the deck's composition cycle has been moved
   * from where its words put it. Read by generation only, never at render.
   */
  rhythmShift?: number | undefined;
  /** How this deck is exported as video (Batch 26): shape, fit, transition, animation. */
  motion?: { target?: string; fit?: "reflow" | "letterbox"; transition?: "cut" | "push" | "fade" | "zoom"; animation?: "none" | "entrances" | "fade" } | undefined;
  /**
   * The icon style a style pack chose (25.6), for a deck with no icon yet.
   * Once it has one, the icons on it decide (21.1's one style per deck).
   */
  iconStyle?: "outline" | "filled" | undefined;
  /** The saved template this deck was made from (25.5). A record, never a link: editing the template does not reach it. */
  template?: string | undefined;
  /**
   * Which series this is part of, and where in it.
   *
   * On the document rather than in a table of its own: a series is two fields,
   * every screen that shows a carousel wants them, and a join to find out
   * whether something is part 3 of 6 would be a round trip for a badge. See
   * series.ts, the shape is declared there because that is where the reasoning
   * lives, and `Doc` only has to carry it.
   */
  series?: { id: string; part: number } | undefined;
  /** Archived work stays yours and stays synced; it just leaves the grid. */
  archived?: boolean | undefined;
  /**
   * The carousel this one was reflowed from for another destination (17.5).
   *
   * For FINDING the pair, never for syncing it. Editing either one leaves the
   * other alone, which is correct, nothing is derived, and this field is the
   * only thing that remembers they were ever the same deck.
   */
  variantOf?: string | undefined;
  /**
   * The hook formula kind (25.3) last used to write the cover, so attribution
   * can group by it (28.5). A tag read by nothing that renders.
   */
  hookKind?: string | undefined;
  /** The deck this one was remixed from (28.1): its shape, none of its words. A tag, never read at render. */
  remixOf?: string | undefined;
  /**
   * Which furniture set this deck carries, and the identity it was stamped
   * with (Batch 20). A SNAPSHOT: changing the brand's avatar does not reach a
   * deck already made, and re-applying the brand is how to update one on
   * purpose. Reseal reads this, never the brand.
   */
  furniture?: FurnitureState | undefined;
  /**
   * Quotes verified word for word against a source (Batch 13), carried from
   * Compose so the Quote block (19.2) can offer them and mark them verbatim.
   */
  quotes?: string[] | undefined;
  slides: Slide[];
  createdAt: string;
  updatedAt: string;
};

export type Tool = "select" | "text" | "rect" | "ellipse" | "triangle" | "line" | "icon";

export const FORMATS = [
  { id: "portrait", label: "4:5", w: 1080, h: 1350 },
  // Instagram's tall size since May 2025, and the only one its 3:4 profile grid
  // shows uncropped. Offered beside 4:5, never instead of it.
  { id: "tall", label: "3:4", w: 1080, h: 1440 },
  { id: "square", label: "1:1", w: 1080, h: 1080 },
  { id: "story", label: "9:16", w: 1080, h: 1920 },
] as const;

export type FontChoice = {
  id: string;
  label: string;
  stack: string;
  custom?: boolean;
  /**
   * The brand this face belongs to, when it belongs to one. Faces with no brand
   * are available everywhere; a branded face only appears for its own brand, so
   * a client's licensed type does not turn up in another client's picker.
   */
  brandId?: string | undefined;
  /** Shipped with the app and measured from its own file (22.2). */
  bundled?: boolean | undefined;
};

/**
 * What every stack falls back to before its generic family (22.5, 22.6): colour
 * emoji (Twemoji, see typefaces.ts), then the scripts the chosen face may not
 * cover. All bundled, so the editor and the export draw an emoji or a Japanese
 * sentence with the same file on any machine. Emoji first, so a face with a monochrome heart in it does not
 * win; the text faces before it still own digits and ASCII.
 */
export const FALLBACK_FAMILIES = [
  "FCC Twemoji",
  "FCC Noto Sans",
  "FCC Noto Sans Arabic",
  "FCC Noto Sans Hebrew",
  "FCC Noto Sans JP",
  "FCC Noto Sans SC",
  "FCC Noto Sans KR",
];
const FALLBACKS = FALLBACK_FAMILIES.map((f) => `"${f}"`).join(", ");

/** A system stack with the fallbacks spliced in before its trailing generic family. */
const withFallbacks = (stack: string): string => {
  const parts = stack.split(",").map((p) => p.trim());
  const generic = parts.pop() ?? "sans-serif";
  return [...parts, FALLBACKS, generic].join(", ");
};

/** Faces that exist on essentially every machine, so nothing has to be downloaded. */
const SYSTEM: FontChoice[] = [
  { id: "sans", label: "Sans", stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { id: "serif", label: "Serif", stack: 'Georgia, "Times New Roman", Times, serif' },
  { id: "mono", label: "Mono", stack: '"SF Mono", ui-monospace, "Cascadia Code", Consolas, monospace' },
  { id: "display", label: "Display", stack: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' },
  { id: "grotesk", label: "Grotesk", stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: "slab", label: "Slab", stack: 'Rockwell, "Roboto Slab", "Courier New", Georgia, serif' },
  { id: "elegant", label: "Elegant", stack: 'Didot, "Bodoni MT", "Playfair Display", Garamond, Georgia, serif' },
  { id: "impact", label: "Impact", stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif' },
].map((f) => ({ ...f, stack: withFallbacks(f.stack) }));

/** The generic family each bundled face falls back to last. */
const GENERIC: Record<string, string> = {
  plexmono: "monospace",
  jetbrains: "monospace",
  spacemono: "monospace",
  playfair: "serif",
  sourceserif: "serif",
  fraunces: "serif",
  dmserif: "serif",
  baskerville: "serif",
  cormorant: "serif",
  bodoni: "serif",
  cinzel: "serif",
  marcellus: "serif",
  caveat: "cursive",
  kalam: "cursive",
  patrickhand: "cursive",
  gochihand: "cursive",
};

/**
 * The pairing library's faces (22.2), from `npm run build:fonts`. Shipped with
 * the app, measured from their own files, and drawn with synthesis of bold
 * turned off so the weight measured is the weight drawn.
 */
const BUNDLED: FontChoice[] = Object.entries(MEASURED).map(([id, m]) => ({
  id,
  label: m.family.replace(/^FCC /, ""),
  stack: `"${m.family}", ${FALLBACKS}, ${GENERIC[id] ?? "sans-serif"}`,
  bundled: true,
}));

export const FONTS: FontChoice[] = [...SYSTEM, ...BUNDLED];

/**
 * Faces the user uploaded. Registered at runtime, so `fontStack` has to consult this
 * before the built-ins, a layer only ever stores the id.
 */
const runtime = new Map<string, FontChoice>();

export function registerFont(font: FontChoice): void {
  runtime.set(font.id, { ...font, custom: true });
}

export function unregisterFont(id: string): void {
  runtime.delete(id);
}

/**
 * The built-ins, plus every uploaded face that belongs here.
 *
 * Passing no brand gives you the unscoped faces only, which is the right
 * default: an unknown context should not leak one brand's type into another's.
 */
export const allFonts = (brandId?: string | undefined): FontChoice[] => [
  ...FONTS,
  ...[...runtime.values()].filter((f) => !f.brandId || f.brandId === brandId),
];

export const fontStack = (id: string | undefined): string =>
  (id ? runtime.get(id)?.stack : undefined) ??
  FONTS.find((f) => f.id === id)?.stack ??
  FONTS[0]!.stack;

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

/** Who a deck is by, per platform where it differs. See `Doc.furniture`. */
export type Identity = {
  name: string;
  role?: string | undefined;
  /** A library asset id (Batch 5), and the URL it resolved to when stamped. */
  avatar?: string | undefined;
  avatarSrc?: string | undefined;
  site?: string | undefined;
  /** `@shortname` on Instagram, the full name on LinkedIn. Keyed by PlatformId. */
  handles: Record<string, string>;
};

export type FurnitureState = { set: string; identity: Identity };
