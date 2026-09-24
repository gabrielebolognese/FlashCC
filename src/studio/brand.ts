/**
 * A brand is a named, saved Theme.
 *
 * That is genuinely all it is, and it is why this was cheap: `Theme` already
 * carries colours with roles and two typefaces, eight modules already consume it,
 * and `styles.ts` already mints one-off Styles at runtime. Giving one a name and a
 * row in a table does not change the rendering path at all.
 *
 * It also does not break "presets run once, nothing is derived". A brand is applied
 * ONCE and leaves plain layers behind, exactly as a style does. There is no live
 * binding: a document does not remember which brand it came from and does not
 * re-derive anything when the brand changes later.
 *
 * The interesting part is §applyBrand, deciding what an existing layer's colour
 * meant so it can be given the equivalent colour from somewhere else.
 */

import type { Asset, LogoRole } from "./assets.js";
import type { Plan } from "./cloud.js";
import { luminance } from "./colour.js";
import { markDeleted } from "./tombstones.js";
import { makeLayer, uid, type Doc, type Layer, type Slide } from "./model.js";
import type { Theme } from "./presets.js";
import { DEFAULT_STYLE, styleById, type Style } from "./styles.js";

/**
 * Asset ids by variant, pointers into the library, never copies of a file.
 *
 * Three, because a logo that only works on white is half a logo, and the one
 * thing an automatic placement has to get right is not putting a black mark on
 * a black slide.
 */
export type BrandLogos = Partial<Record<LogoRole, string>>;

/**
 * How somebody sounds, as opposed to how their slides look.
 *
 * Every AI carousel tool produces competent, generic copy, and that is the
 * complaint underneath most of the research this product was built from. A brand
 * already carries colour and typeface; this is the half that was missing.
 *
 * **Samples carry the weight.** Three posts somebody actually wrote do more than
 * any number of adjectives about being punchy, because a model can match a
 * pattern it can see and can only guess at a description. It is also the one
 * thing a competitor cannot copy, being the customer's own writing.
 *
 * All three fields are optional and a brand with none behaves exactly as brands
 * did before this existed, which is what keeps it from becoming a form somebody
 * has to fill in before the product works.
 */
export type Voice = {
  /** One line, in their words. "Blunt, no throat-clearing." */
  tone?: string | undefined;
  /** Up to three of their own posts. */
  samples?: string[] | undefined;
  /** Words and phrases they never use. */
  avoid?: string[] | undefined;
};

/** Mirrors the server's ceilings in prompts.ts. Both halves have to agree. */
export const MAX_VOICE_SAMPLES = 3;
export const MAX_SAMPLE_CHARS = 1200;
export const MAX_TONE_CHARS = 400;

/**
 * True when there is something worth sending.
 *
 * An empty voice must produce no voice block at all rather than an empty
 * heading: telling a model that voice matters and then giving it nothing to work
 * with is worse than not raising the subject.
 */
export const hasVoice = (voice: Voice | undefined): boolean =>
  Boolean(
    voice &&
      (voice.tone?.trim() ||
        (voice.samples ?? []).some((s) => s.trim()) ||
        (voice.avoid ?? []).some((w) => w.trim())),
  );

/** Trimmed and capped before it is stored, so the ceilings hold at rest too. */
export function tidyVoice(voice: Voice): Voice {
  const tone = voice.tone?.trim().slice(0, MAX_TONE_CHARS);
  const samples = (voice.samples ?? [])
    .map((s) => s.trim().slice(0, MAX_SAMPLE_CHARS))
    .filter(Boolean)
    .slice(0, MAX_VOICE_SAMPLES);
  const avoid = (voice.avoid ?? []).map((w) => w.trim()).filter(Boolean).slice(0, 20);

  return {
    ...(tone ? { tone } : {}),
    ...(samples.length > 0 ? { samples } : {}),
    ...(avoid.length > 0 ? { avoid } : {}),
  };
}

export type Brand = {
  id: string;
  name: string;
  /** Colours and typefaces. The same shape the generator already consumes. */
  theme: Theme;
  logos: BrandLogos;
  /** How this brand sounds. Absent until somebody fills it in. */
  voice?: Voice | undefined;
  /** Whose brand this is. See clients.ts. */
  clientId?: string | undefined;
  /** The artboard new carousels start at. */
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
};

/* ── tiers ────────────────────────────────────────────────────────────────── */

/**
 * The proven ladder in this market. Enforced in Postgres as well as here, a
 * client-side limit is a suggestion, and the RLS policy in 03-brands.sql is what
 * actually holds. This copy exists so the UI can explain itself before the
 * database refuses.
 */
export const BRAND_LIMIT: Record<Plan, number> = { free: 1, pro: 3, agency: Infinity };

export const brandLimit = (plan: Plan | undefined): number => BRAND_LIMIT[plan ?? "free"];

export const canAddBrand = (count: number, plan: Plan | undefined): boolean =>
  count < brandLimit(plan);

/* ── conversion ───────────────────────────────────────────────────────────── */

export function makeBrand(name: string, theme: Theme, width = 1080, height = 1350): Brand {
  const now = new Date().toISOString();
  return {
    id: uid("b"),
    name: name.trim() || "Untitled brand",
    theme: { ...theme },
    logos: {},
    width,
    height,
    createdAt: now,
    updatedAt: now,
  };
}

export const brandFromStyle = (style: Style, name?: string): Brand =>
  makeBrand(name ?? style.name, style.theme);

/** Brands join the style gallery as ordinary entries; nothing downstream cares. */
export const brandToStyle = (brand: Brand): Style => ({
  id: `brand:${brand.id}`,
  name: brand.name,
  note: "Your brand",
  theme: brand.theme,
});

export const isBrandStyle = (styleId: string): boolean => styleId.startsWith("brand:");
export const brandIdOf = (styleId: string): string | null =>
  isBrandStyle(styleId) ? styleId.slice("brand:".length) : null;

/* ── applying one to a document that already exists ───────────────────────── */

/**
 * Layer names the generator emits, and which theme colour each one wore.
 *
 * This is the fallback, not the primary rule, see the comment on `applyBrand`.
 */
const ROLE_BY_NAME: Record<string, keyof Pick<Theme, "fg" | "muted" | "accent" | "bg">> = {
  Title: "fg",
  Heading: "fg",
  Statement: "fg",
  Quote: "fg",
  Text: "fg",
  Body: "muted",
  Rule: "accent",
  Tick: "accent",
  Underline: "accent",
  Bar: "accent",
  Number: "accent",
  Block: "accent",
  Image: "muted",
};

const norm = (c: string | null): string => (c ?? "").trim().toLowerCase();

/** Already one of this theme's four colours, so already branded. */
const wearsTheme = (colour: string, theme: Theme): boolean =>
  ([theme.bg, theme.fg, theme.accent, theme.muted] as const).some((c) => norm(c) === norm(colour));

/** Old colour → new colour, for the four the generator actually uses. */
export function themeMap(from: Theme, to: Theme): Map<string, string> {
  const map = new Map<string, string>();
  // Later keys win, so order matters where a theme reuses one colour twice.
  for (const key of ["bg", "muted", "accent", "fg"] as const) {
    const was = norm(from[key]);
    if (was) map.set(was, to[key]);
  }
  return map;
}

export type ApplyResult = { doc: Doc; changed: number; skipped: number };

function applyToLayer(
  layer: Layer,
  map: Map<string, string>,
  to: Theme,
): { layer: Layer; changed: boolean } {
  let next = layer;
  let changed = false;

  const fill = map.get(norm(layer.fill));
  if (fill && fill !== layer.fill) {
    next = { ...next, fill };
    changed = true;
  }

  if (layer.stroke !== null) {
    const stroke = map.get(norm(layer.stroke));
    if (stroke && stroke !== layer.stroke) {
      next = { ...next, stroke };
      changed = true;
    }
  }

  // Fallback: a layer the generator made, wearing a colour the old theme no longer
  // explains, because the style was changed, or the theme could not be
  // reconstructed. Guessing from the name is better than leaving it behind on a
  // deck that is otherwise rebranded, and undo covers the case where it guesses
  // wrong. A layer with an unrecognised name is never touched: silently
  // recolouring something hand-picked is worse than missing it.
  //
  // It is skipped entirely when the layer already wears one of the target
  // theme's own colours, and that guard is load-bearing rather than an
  // optimisation. Several compositions emit a layer called "Text" meaning
  // different things, the CTA block's copy is deliberately `theme.bg`, because
  // it sits ON the accent block. Without this check a second application would
  // "correct" it to `fg` and make it invisible against its own background.
  if (!changed && !wearsTheme(layer.fill, to)) {
    const role = ROLE_BY_NAME[layer.name];
    if (role && to[role] !== layer.fill) {
      next = { ...next, fill: to[role] };
      changed = true;
    }
  }

  // Typefaces follow the same rule the generator uses: only a layer literally
  // named "Body" takes the body face.
  if (layer.kind === "text") {
    const font = layer.name === "Body" ? to.bodyFont : to.displayFont;
    if (font && font !== layer.fontFamily) {
      next = { ...next, fontFamily: font };
      changed = true;
    }
  }

  return { layer: next, changed };
}

function applyToSlide(
  slide: Slide,
  map: Map<string, string>,
  to: Theme,
): { slide: Slide; changed: number; skipped: number } {
  let changed = 0;
  let skipped = 0;

  const layers = slide.layers.map((l) => {
    const out = applyToLayer(l, map, to);
    if (out.changed) changed += 1;
    else skipped += 1;
    return out.layer;
  });

  return {
    slide: {
      ...slide,
      background: to.bg,
      // Assigning undefined would violate exactOptionalPropertyTypes, so the key
      // is only present when there is a ramp to carry.
      ...(to.bgGradient ? { gradient: to.bgGradient } : { gradient: undefined }),
      layers,
    },
    changed,
    skipped,
  };
}

/**
 * Re-colours an existing carousel to a brand.
 *
 * The primary rule is an EXACT COLOUR MATCH against the theme the document was
 * generated with, which is knowable because `doc.styleId` is stamped at
 * generation. That is precise: it catches hand-drawn shapes that reached for a
 * palette colour, and it never touches a colour the old theme cannot explain.
 *
 * The name fallback exists because the precise rule silently does nothing on a
 * document whose style is unknown, and a rebrand that changes nothing reads as
 * broken. It only fires on names the generator itself emits.
 *
 * Returns counts so the UI can say what happened rather than claiming success.
 */
export function applyBrand(doc: Doc, brand: Brand, fromTheme?: Theme): ApplyResult {
  // A document already wearing this brand needs no reconstruction: the theme it
  // was painted with is the one being applied. Without this, re-applying the
  // same brand goes through the guesswork below and can move a colour that was
  // already correct.
  const wearsIt = doc.styleId === `brand:${brand.id}`;
  const from = fromTheme ?? (wearsIt ? brand.theme : themeOf(doc));
  const map = themeMap(from, brand.theme);

  let changed = 0;
  let skipped = 0;

  const slides = doc.slides.map((s) => {
    const out = applyToSlide(s, map, brand.theme);
    changed += out.changed;
    skipped += out.skipped;
    return out.slide;
  });

  return {
    doc: {
      ...doc,
      styleId: `brand:${brand.id}`,
      palette: paletteFor(brand.theme, doc.palette),
      slides,
    },
    changed,
    skipped,
  };
}

/**
 * The theme a document was made with, as far as it can be reconstructed.
 *
 * Brands have to be passed in: they live in the user's account, not in the style
 * table, so there is no global way to resolve `brand:<id>`. A caller that does
 * not pass them gets the background-only fallback, which is correct but blunt.
 */
export function themeOf(doc: Doc, brands: readonly Brand[] = []): Theme {
  if (doc.styleId) {
    const brandId = brandIdOf(doc.styleId);
    if (brandId !== null) {
      const known = brands.find((b) => b.id === brandId);
      if (known) return known.theme;
    } else {
      return styleById(doc.styleId).theme;
    }
  }

  // No usable stamp: fall back to what the first slide is actually wearing. That
  // gets the background right and leaves the name rule to do the rest.
  const first = doc.slides[0];
  return first ? { ...DEFAULT_STYLE.theme, bg: first.background } : DEFAULT_STYLE.theme;
}

/** Swap the theme's four colours into the front of the saved swatches. */
function paletteFor(theme: Theme, existing: string[]): string[] {
  const head = [theme.bg, theme.fg, theme.accent, theme.muted];
  const tail = existing.filter((c) => !head.some((h) => norm(h) === norm(c)));
  return [...head, ...tail].slice(0, 10);
}

/* ── whose voice applies ──────────────────────────────────────────────────── */

/**
 * The voice for a carousel that already exists.
 *
 * Unambiguous: a document stamped `brand:<id>` was made with that brand, so that
 * is the voice. Nothing to infer.
 */
export function voiceOf(doc: Doc, brands: readonly Brand[]): Voice | undefined {
  const id = doc.styleId ? brandIdOf(doc.styleId) : null;
  if (!id) return undefined;
  return brands.find((b) => b.id === id)?.voice;
}

/**
 * The voice for a carousel that does not exist yet.
 *
 * Drafting happens before a style is picked, so there is no brand stamped on
 * anything and something has to be inferred. Two rules, in order, and a
 * deliberate refusal after them:
 *
 * 1. The client currently selected in the rail, through its brand. If somebody
 *    is working inside a client, that client's voice is the one they mean.
 * 2. Otherwise, the only brand that HAS a voice, if there is exactly one. A solo
 *    operator gets their own voice without configuring anything.
 *
 * And if several brands have voices with no client selected, none of them. A
 * wrong voice is worse than no voice: no voice reads as generic, which is what
 * people expect from a machine, while the wrong one reads as the product not
 * understanding who they are.
 */
export function contextVoice(
  brands: readonly Brand[],
  selectedClientId?: string | undefined,
): Voice | undefined {
  if (selectedClientId) {
    const owned = brands.find((b) => b.clientId === selectedClientId && hasVoice(b.voice));
    if (owned) return owned.voice;
  }

  const withVoice = brands.filter((b) => hasVoice(b.voice));
  return withVoice.length === 1 ? withVoice[0]?.voice : undefined;
}

/* ── logos ────────────────────────────────────────────────────────────────── */

/**
 * The variant to wear on a given ground.
 *
 * A mark, the square, standalone one, wins when there is one, because it is
 * the version drawn to work anywhere. Otherwise the choice is made from the
 * background's luminance, which is the entire reason for keeping two.
 * `undefined` when the brand has no logo at all, which is the common case and
 * must not be an error.
 */
export function logoRoleFor(brand: Brand, background: string): LogoRole | undefined {
  const logos = brand.logos ?? {};
  if (logos.mark) return "mark";
  const wantsDark = luminance(background) < 0.5;
  const preferred: LogoRole = wantsDark ? "dark" : "light";
  if (logos[preferred]) return preferred;
  const other: LogoRole = wantsDark ? "light" : "dark";
  return logos[other] ? other : undefined;
}

export const logoAssetId = (brand: Brand, background: string): string | undefined => {
  const role = logoRoleFor(brand, background);
  return role ? brand.logos?.[role] : undefined;
};

/** Long edge of the mark, as a share of the artboard width. Small enough to sign, not shout. */
const LOGO_SHARE = 0.11;
/** Inset from the artboard edge. Clear of every platform's bottom furniture. */
const LOGO_MARGIN = 0.055;

export type LogoPlacement = { doc: Doc; placed: number };

/**
 * Put the brand's mark on the slides that carry it.
 *
 * This is the one thing in the corpus that no competitor has review evidence of
 *, "I scheduled a post and it used my brand assets automatically", and it is
 * cheap here precisely because a placed logo is an ORDINARY IMAGE LAYER. It runs
 * once and leaves plain layers behind, exactly as a preset does. Nothing is
 * derived, nothing re-runs when the brand changes, and the layer has the same
 * handles as one you drew.
 *
 * First and last slide by default: the opener is where a brand is recognised and
 * the closer is where it is acted on, and a mark on all ten reads as a watermark
 * rather than as a signature.
 *
 * Idempotent per slide, a slide already carrying this asset is left exactly as
 * it is, including wherever the user dragged it to.
 */
export function stampLogo(
  doc: Doc,
  brand: Brand,
  resolve: (assetId: string) => { src: string; w?: number | undefined; h?: number | undefined } | undefined,
  slideIndexes?: readonly number[],
): LogoPlacement {
  let placed = 0;

  const targets = new Set(
    slideIndexes ?? [0, doc.slides.length - 1].filter((i) => i >= 0),
  );

  const slides = doc.slides.map((slide, i) => {
    if (!targets.has(i)) return slide;

    const assetId = logoAssetId(brand, slide.background);
    if (!assetId) return slide;
    if (slide.layers.some((l) => l.assetId === assetId)) return slide;

    const file = resolve(assetId);
    if (!file) return slide;

    // Aspect comes from the file, so a wide wordmark is not squashed into a
    // square. An unknown aspect is treated as square, which is what a mark
    // usually is and what a placeholder box should look like anyway.
    const aspect = file.w && file.h ? file.w / file.h : 1;
    const w = Math.round(doc.width * LOGO_SHARE * Math.max(1, aspect));
    const h = Math.round(w / Math.max(0.01, aspect));
    const margin = Math.round(doc.width * LOGO_MARGIN);

    const layer: Layer = {
      ...makeLayer(
        "image",
        { x: doc.width - w - margin, y: doc.height - h - margin, w, h },
        "#00000000",
      ),
      name: "Logo",
      src: file.src,
      assetId,
      fit: "contain",
      radius: 0,
      // Placed by the brand, not by the generator: a re-lay must not take it
      // away again, and the user did ask for it by adding a logo to the brand.
      handEdited: true,
    };

    placed += 1;
    return { ...slide, layers: [...slide.layers, layer] };
  });

  return { doc: { ...doc, slides }, placed };
}

/** Every asset a brand points at, for the library's "in use" mark. */
export function logosOf(brand: Brand, assets: readonly Asset[]): Partial<Record<LogoRole, Asset>> {
  const out: Partial<Record<LogoRole, Asset>> = {};
  for (const [role, id] of Object.entries(brand.logos ?? {})) {
    const found = assets.find((a) => a.id === id);
    if (found) out[role as LogoRole] = found;
  }
  return out;
}

/* ── storage ──────────────────────────────────────────────────────────────── */

/**
 * One key for the lot. Brands are a handful of small records always read as a
 * set, the gallery needs all of them, the limit check needs a count, so
 * per-record keys would add a fan-out read and buy nothing.
 */
const KEY = "flashcc:v1:brands";

export function listBrands(): Brand[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    // Brands saved before logos existed have no object. Normalised on the way
    // out so nothing downstream has to test for it.
    return (parsed as Brand[]).map((b) => ({ ...b, logos: b.logos ?? {} }));
  } catch {
    return [];
  }
}

export function saveBrands(brands: Brand[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(brands));
    return true;
  } catch {
    return false;
  }
}

export function upsertBrand(brand: Brand): Brand[] {
  const all = listBrands();
  const i = all.findIndex((b) => b.id === brand.id);
  const next = i === -1 ? [...all, brand] : all.map((b) => (b.id === brand.id ? brand : b));
  saveBrands(next);
  return next;
}

export function removeBrand(id: string): Brand[] {
  const next = listBrands().filter((b) => b.id !== id);
  saveBrands(next);
  markDeleted("brand", id);
  return next;
}
