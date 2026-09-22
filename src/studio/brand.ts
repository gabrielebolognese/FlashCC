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
 * The interesting part is §applyBrand — deciding what an existing layer's colour
 * meant so it can be given the equivalent colour from somewhere else.
 */

import type { Plan } from "./cloud.js";
import { markDeleted } from "./tombstones.js";
import { uid, type Doc, type Layer, type Slide } from "./model.js";
import type { Theme } from "./presets.js";
import { DEFAULT_STYLE, styleById, type Style } from "./styles.js";

export type Brand = {
  id: string;
  name: string;
  /** Colours and typefaces. The same shape the generator already consumes. */
  theme: Theme;
  /** The artboard new carousels start at. */
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
};

/* ── tiers ────────────────────────────────────────────────────────────────── */

/**
 * The proven ladder in this market. Enforced in Postgres as well as here — a
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
 * This is the fallback, not the primary rule — see the comment on `applyBrand`.
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
  // explains — because the style was changed, or the theme could not be
  // reconstructed. Guessing from the name is better than leaving it behind on a
  // deck that is otherwise rebranded, and undo covers the case where it guesses
  // wrong. A layer with an unrecognised name is never touched: silently
  // recolouring something hand-picked is worse than missing it.
  //
  // It is skipped entirely when the layer already wears one of the target
  // theme's own colours, and that guard is load-bearing rather than an
  // optimisation. Several compositions emit a layer called "Text" meaning
  // different things — the CTA block's copy is deliberately `theme.bg`, because
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

/* ── storage ──────────────────────────────────────────────────────────────── */

/**
 * One key for the lot. Brands are a handful of small records always read as a
 * set — the gallery needs all of them, the limit check needs a count — so
 * per-record keys would add a fan-out read and buy nothing.
 */
const KEY = "flashcc:v1:brands";

export function listBrands(): Brand[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as Brand[]) : [];
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
