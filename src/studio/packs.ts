/**
 * Style packs (25.6): every visual preset as one choice. Palette roles, a font
 * pair (22.2), a type ramp (22.1), a background generator (21.3), a furniture
 * set (20.6) and an icon style (21.1), grouped by the kind of creator they
 * suit.
 *
 * A pack runs once, like a brand (Batch 3.2): applying it recolours and
 * retypes the deck's layers by role, stamps the texture and the furniture, and
 * then it is gone. Nothing reads the pack at render. `styleId` remembers which
 * one it was, so a later generation (Re-lay, a typed slide) uses its theme.
 *
 * Pure apart from nothing: every input is passed in.
 */
import { applyTexture } from "./backdrops.js";
import { applyBrand, makeBrand } from "./brand.js";
import { stampFurniture } from "./furniture.js";
import type { IconStyle } from "./iconsets.js";
import type { Doc, Identity, TextureKind } from "./model.js";
import { pairById } from "./pairs.js";
import type { Platform } from "./platforms.js";
import type { Theme } from "./presets.js";
import type { RampId } from "./ramps.js";

export type CreatorKind = "education" | "saas" | "agency" | "finance" | "fitness" | "food" | "coaching" | "personal";

export const CREATOR_KINDS: { id: CreatorKind; label: string }[] = [
  { id: "education", label: "Education" },
  { id: "saas", label: "SaaS and product" },
  { id: "agency", label: "Agency" },
  { id: "finance", label: "Finance" },
  { id: "fitness", label: "Fitness" },
  { id: "food", label: "Food" },
  { id: "coaching", label: "Coaching" },
  { id: "personal", label: "Personal brand" },
];

export type StylePack = {
  id: string;
  name: string;
  creator: CreatorKind;
  note: string;
  /** bg, fg, accent, muted: the four roles every layer is coloured by. */
  colours: Pick<Theme, "bg" | "fg" | "accent" | "muted">;
  pair: string;
  ramp: RampId;
  texture: { kind: TextureKind; strength: number } | null;
  furniture: string;
  icons: IconStyle;
};

const pack = (
  id: string,
  name: string,
  creator: CreatorKind,
  note: string,
  [bg, fg, accent, muted]: [string, string, string, string],
  pair: string,
  ramp: RampId,
  texture: StylePack["texture"],
  furniture: string,
  icons: IconStyle,
): StylePack => ({ id, name, creator, note, colours: { bg, fg, accent, muted }, pair, ramp, texture, furniture, icons });

export const PACKS: StylePack[] = [
  pack("classroom", "Classroom", "education", "Bright, friendly, easy to read", ["#fbf7ef", "#1f2933", "#2457c5", "#5b6472"], "hello", "editorial", { kind: "dots", strength: 0.3 }, "creator", "outline"),
  pack("chalk", "Chalk", "education", "A green board and hand lettering", ["#1d3b2f", "#f3efe0", "#f2c14e", "#b3c2b4"], "notebook", "tight", { kind: "paper", strength: 0.35 }, "minimal", "outline"),
  pack("launch", "Launch", "saas", "Dark, violet, a product launch", ["#0b1020", "#f5f7ff", "#9b85ff", "#9aa3c7"], "spec", "loud", { kind: "mesh", strength: 0.5 }, "corporate", "outline"),
  pack("docs", "Docs", "saas", "Clean, technical, a changelog", ["#ffffff", "#0f172a", "#0369a1", "#55657a"], "changelog", "tight", { kind: "lines", strength: 0.25 }, "editorial", "outline"),
  pack("studio", "Studio", "agency", "Loud type, one hot colour", ["#111111", "#fafafa", "#ff5a3c", "#9a9a9a"], "poster", "loud", null, "bold", "filled"),
  pack("gallery", "Gallery", "agency", "Quiet, serif, lots of air", ["#f4f1ea", "#1c1c1c", "#8a3b12", "#6b665c"], "maison", "editorial", { kind: "paper", strength: 0.3 }, "editorial", "outline"),
  pack("ledger", "Ledger", "finance", "Navy and a green that means up", ["#0d1b2a", "#e8eef5", "#3ddc97", "#8fa3b8"], "column", "editorial", { kind: "lines", strength: 0.2 }, "corporate", "outline"),
  pack("prospectus", "Prospectus", "finance", "Print-like, sober, trustworthy", ["#ffffff", "#102a43", "#0b6e4f", "#52667a"], "broadsheet", "tight", null, "editorial", "outline"),
  pack("pulse", "Pulse", "fitness", "Black, neon, heavy condensed type", ["#0a0a0a", "#ffffff", "#c6ff00", "#a3a3a3"], "headline", "loud", { kind: "grain", strength: 0.35 }, "bold", "filled"),
  pack("kitchen", "Kitchen", "food", "Warm cream and a tomato red", ["#fff8f0", "#2d1b12", "#c2410c", "#7a5f4f"], "soft", "editorial", { kind: "blobs", strength: 0.45 }, "creator", "filled"),
  pack("calm", "Calm", "coaching", "Soft neutrals, gentle serif", ["#f3efe9", "#2f2a24", "#9b4f61", "#6e655b"], "essay", "editorial", { kind: "blobs", strength: 0.35 }, "creator", "outline"),
  pack("signature", "Signature", "personal", "Dark, gold, editorial luxury", ["#16161d", "#f6f4f0", "#e9b44c", "#a09eaa"], "atelier", "editorial", { kind: "mesh", strength: 0.4 }, "creator", "outline"),
  pack("notes", "Notes", "personal", "A notebook page with a red pen", ["#fffdf6", "#222222", "#c81d25", "#666666"], "margin", "tight", { kind: "paper", strength: 0.3 }, "minimal", "outline"),
];

export const packById = (id: string | undefined): StylePack | undefined => PACKS.find((p) => p.id === id);

export const PACK_PREFIX = "pack:";
export const packIdOf = (styleId: string | undefined): string | null =>
  styleId?.startsWith(PACK_PREFIX) ? styleId.slice(PACK_PREFIX.length) : null;

/** The theme the generator consumes: the colours, the pair's two faces, the ramp. */
export function packTheme(p: StylePack): Theme {
  const pair = pairById(p.pair);
  return {
    ...p.colours,
    ...(pair ? { displayFont: pair.display, bodyFont: pair.body } : {}),
    ramp: p.ramp,
  };
}

/**
 * The deck in this pack, once. Colours and faces by role through the brand
 * machinery (so a layer the user recoloured by hand is left alone, as a brand
 * leaves it), then the texture and the furniture, then the icon style the
 * deck's next icon will use.
 */
export function applyPack(doc: Doc, p: StylePack, identity: Identity | undefined, platform: Platform | null | undefined, fromTheme?: Theme): Doc {
  const theme = packTheme(p);
  const recoloured = applyBrand(doc, { ...makeBrand(p.name, theme, doc.width, doc.height), id: `pack-${p.id}` }, fromTheme).doc;
  const textured = applyTexture(recoloured, p.texture?.kind ?? null, p.texture?.strength ?? 0, theme, platform);
  const furnished =
    p.furniture === "none" ? textured : stampFurniture(textured, p.furniture, identity ?? { name: "", handles: {} }, { platform: platform ?? undefined });
  return { ...furnished, styleId: `${PACK_PREFIX}${p.id}`, iconStyle: p.icons };
}
