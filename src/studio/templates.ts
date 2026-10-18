/**
 * Saved templates (25.5): a deck's STRUCTURE, kept to make the next one from.
 *
 * Captured: the slide count, the composition per position, each slide's
 * background, gradient and texture, block placements, the brand or pack, the
 * furniture set, and the designs that run across slides (spans and bridges).
 * Not captured: the words, unless "keep as example text" is ticked, and never
 * the pictures, which belong to the person and the deck they were put in.
 *
 * **Applying a template runs once.** A deck made from one carries its id as a
 * record of where it came from, and nothing else: editing the template later
 * does not reach it. "Re-apply template" is the explicit, one-shot way to do
 * that, by position, keeping the words and every hand edit, exactly as
 * re-applying a brand does (Batch 3.2).
 *
 * Templates belong to a client (Batch 7), like brands.
 */
import { applyTexture } from "./backdrops.js";
import { placeBlock } from "./blockplace.js";
import { blockById, withDefaults, type Fields } from "./blocks.js";
import { buildSlides } from "./compositions.js";
import { stampFurniture } from "./furniture.js";
import { cloneLayer, makeDoc, uid, type BlockRecord, type Doc, type Identity, type Layer, type Slide, type SlideTexture } from "./model.js";
import type { Platform } from "./platforms.js";
import type { Theme } from "./presets.js";
import { copyLayers, restateMany, slideCopy, textsOf } from "./regenerate.js";

export type TemplateSlide = {
  composition?: string | undefined;
  background: string;
  gradient?: Slide["gradient"];
  texture?: { kind: SlideTexture["kind"]; strength: number } | undefined;
  /** Blocks by placement. Their fields only when example text is kept. */
  blocks: { block: string; box: BlockRecord["box"]; fields?: Fields | undefined }[];
  /** Layers that are design, not words: spans, bridges, shapes the user drew. */
  decor: Layer[];
};

export type Template = {
  id: string;
  name: string;
  clientId?: string | undefined;
  width: number;
  height: number;
  framework?: string | undefined;
  styleId?: string | undefined;
  furniture?: string | undefined;
  /** Whose name the furniture carries: a template belongs to a client, and so does this. */
  identity?: Identity | undefined;
  slides: TemplateSlide[];
  /** One entry per slide, when "keep as example text" was ticked. */
  example?: string[] | undefined;
  createdAt: string;
  updatedAt: string;
};

/** A layer that is part of the design rather than the deck's words or pictures. */
const isDecor = (l: Layer): boolean =>
  !l.block && !l.furniture && !l.furnitureOptOut && l.kind !== "text" && !(l.kind === "image" && !l.spanId) && (Boolean(l.spanId) || Boolean(l.bridge) || Boolean(l.handEdited));

/** A picture's file belongs to the deck it was put in: a template keeps the frame, never the file. */
const withoutPicture = (l: Layer): Layer =>
  l.kind === "image" ? { ...l, src: undefined, assetId: undefined, credit: undefined } : l;

/** The structure of a deck, as a template. */
export function templateFrom(doc: Doc, name: string, opts: { keepExample?: boolean; clientId?: string | undefined } = {}): Template {
  const now = new Date().toISOString();
  return {
    id: uid("tpl"),
    name: name.trim() || doc.name || "Template",
    ...(opts.clientId ? { clientId: opts.clientId } : {}),
    width: doc.width,
    height: doc.height,
    ...(doc.framework ? { framework: doc.framework } : {}),
    ...(doc.styleId ? { styleId: doc.styleId } : {}),
    ...(doc.furniture?.set ? { furniture: doc.furniture.set, identity: doc.furniture.identity } : {}),
    slides: doc.slides.map((s) => ({
      ...(s.composition ? { composition: s.composition } : {}),
      background: s.background,
      ...(s.gradient ? { gradient: s.gradient } : {}),
      ...(s.texture ? { texture: { kind: s.texture.kind, strength: s.texture.strength } } : {}),
      blocks: (s.blocks ?? []).map((b) => ({ block: b.block, box: { ...b.box }, ...(opts.keepExample ? { fields: { ...b.fields } } : {}) })),
      decor: s.layers.filter(isDecor).map(withoutPicture),
    })),
    ...(opts.keepExample ? { example: textsOf(doc) } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

/** What each slide says when a template is used with no words of its own. */
export function placeholderTexts(t: Template): string[] {
  if (t.example && t.example.length === t.slides.length) return [...t.example];
  const n = t.slides.length;
  return t.slides.map((_, i) => (i === 0 ? "Your hook goes here" : i === n - 1 ? "Your call to action" : `Point ${i}\nWhat this slide says.`));
}

export type UseOptions = {
  theme: Theme;
  identity?: Identity | undefined;
  platform?: Platform | null | undefined;
  /** The words, one per slide. Fewer or more than the template has are fitted to its count. */
  texts?: string[] | undefined;
  name?: string | undefined;
};

/**
 * A new deck from a template: the template's slide count and its composition
 * per position, laid out with these words (or its placeholders), its
 * backgrounds, textures, blocks, decorations and furniture. Runs once.
 */
export function deckFromTemplate(t: Template, opts: UseOptions): Doc {
  const n = t.slides.length;
  const given = opts.texts ?? placeholderTexts(t);
  const texts = Array.from({ length: n }, (_, i) => (given[i] ?? "").trim() || placeholderTexts(t)[i]!);
  const built = buildSlides(texts, opts.theme, undefined, {
    split: false,
    images: false,
    compositions: t.slides.map((s) => s.composition),
  });
  let doc: Doc = {
    ...makeDoc(opts.name ?? t.name, t.width, t.height),
    ...(t.framework ? { framework: t.framework } : {}),
    ...(t.styleId ? { styleId: t.styleId } : {}),
    template: t.id,
    slides: built.map((s, i) => dress(s, t.slides[i]!, opts.theme, t)),
  };
  doc = withTextures(doc, t, opts);
  if (t.furniture && t.furniture !== "none") {
    doc = stampFurniture(doc, t.furniture, opts.identity ?? t.identity ?? { name: "", handles: {} }, { platform: opts.platform ?? undefined });
  }
  return doc;
}

/** One generated slide in its template slide's clothes: background, blocks, decoration. */
function dress(slide: Slide, ts: TemplateSlide, theme: Theme, t: Template): Slide {
  // A template slide with blocks and no layout of its own held no words: the
  // placeholder generated for it would sit under the block (found by 28.1).
  const wordless = !ts.composition && ts.blocks.length > 0;
  const generated = wordless ? new Set(copyLayers(slide).map((l) => l.id)) : null;
  let out: Slide = {
    ...slide,
    ...(generated ? { composition: undefined } : {}),
    background: ts.background,
    ...(ts.gradient ? { gradient: ts.gradient } : { gradient: undefined }),
    // Fresh ids, so two decks from one template never share a layer.
    layers: [...ts.decor.map((l) => cloneLayer(l, 0, 0)), ...(generated ? slide.layers.filter((l) => !generated.has(l.id)) : slide.layers)],
  };
  for (const b of ts.blocks) {
    const block = blockById(b.block);
    if (!block) continue;
    const placed = placeBlock(out, b.block, withDefaults(block, b.fields ?? {}), b.box, {
      theme,
      board: { w: t.width, h: t.height },
      instance: uid("blk"),
    });
    if (placed) out = placed.slide;
  }
  return out;
}

function withTextures(doc: Doc, t: Template, opts: UseOptions): Doc {
  let out = doc;
  t.slides.forEach((ts, i) => {
    if (ts.texture) out = applyTexture(out, ts.texture.kind, ts.texture.strength, opts.theme, opts.platform, i);
  });
  return out;
}

/**
 * Re-apply template (25.5): the one-shot, explicit way for a template's later
 * changes to reach a deck. By position: each slide takes the template's
 * composition, background and texture for its place; the words stay, every
 * hand-edited layer stays, and slides past the template's length are left
 * alone. Furniture is restamped from the template's set.
 */
export function reapplyTemplate(doc: Doc, t: Template, opts: Omit<UseOptions, "texts" | "name">): Doc {
  const plan = doc.slides.map((s, i) => {
    const ts = t.slides[i];
    return { from: i, text: slideCopy(s), changed: Boolean(ts?.composition && ts.composition !== s.composition), composition: ts?.composition };
  });
  let out = restateMany(doc, plan.map((p) => (p.changed ? p : { ...p, composition: undefined })), opts.theme).doc;
  out = {
    ...out,
    template: t.id,
    slides: out.slides.map((s, i) => {
      const ts = t.slides[i];
      return ts ? { ...s, background: ts.background, ...(ts.gradient ? { gradient: ts.gradient } : { gradient: undefined }) } : s;
    }),
  };
  t.slides.forEach((ts, i) => {
    if (i < out.slides.length) out = applyTexture(out, ts.texture?.kind ?? null, ts.texture?.strength ?? 0, opts.theme, opts.platform, i);
  });
  if (t.furniture && t.furniture !== "none") {
    out = stampFurniture(out, t.furniture, opts.identity ?? t.identity ?? { name: "", handles: {} }, { platform: opts.platform ?? undefined });
  }
  return out;
}

/* ── storage ──────────────────────────────────────────────────────────────── */

const KEY = "flashcc.templates";

export function listTemplates(clientId?: string | null): Template[] {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Template[]) : [];
    if (!Array.isArray(all)) return [];
    // A template with no client is everybody's; one with a client shows under it.
    return clientId ? all.filter((t) => !t.clientId || t.clientId === clientId) : all;
  } catch {
    return [];
  }
}

function writeTemplates(all: Template[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function saveTemplate(t: Template): boolean {
  const all = listTemplates();
  const next = all.some((x) => x.id === t.id) ? all.map((x) => (x.id === t.id ? { ...t, updatedAt: new Date().toISOString() } : x)) : [t, ...all];
  return writeTemplates(next);
}

export function removeTemplate(id: string): boolean {
  return writeTemplates(listTemplates().filter((t) => t.id !== id));
}
