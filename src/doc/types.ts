/** Semantic document model. No pixels, no CSS, no DOM. See docs/document-schema.md. */
import type { Template } from "./template.js";

export type SlideRole = "cover" | "body" | "list" | "quote" | "cta";
export type Granularity = "few" | "balanced" | "many";
export type FormatId = "portrait-4x5" | "square-1x1" | "story-9x16";
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Per-block overrides. The template still decides where a block goes and what size
 * it would be; these win over that decision for this one block. Optional throughout,
 * so a document with no overrides renders exactly as the template intends.
 */
export type BlockStyle = {
  fontSize?: number | undefined;
  weight?: 400 | 500 | 600 | 700 | undefined;
  family?: FontRole | undefined;
  colour?: string | undefined;
  align?: "left" | "center" | "right" | undefined;
  tracking?: number | undefined;
  case?: "none" | "upper" | undefined;
};

export type BlockBody =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string; attribution?: string | undefined }
  | { type: "label"; text: string };

export type Block = { id: string; style?: BlockStyle | undefined } & BlockBody;

export type ShapeKind = "rect" | "ellipse" | "triangle" | "line";
export type ElementKind = "text" | "icon" | "shape" | "image";

/**
 * Every visual thing on a slide. There is no locked, template-only layer any more:
 * the template's job is to compute good STARTING positions, after which every
 * element is a free object the user can drag, resize and restyle.
 *
 * Position and size are FRACTIONS of the slide, never pixels, so an element survives
 * a format change.
 */
export type Element = {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  colour: string;
  /** Links back to the text block in the slide list, so the two stay in sync. */
  blockId?: string | undefined;
  itemIndex?: number | undefined;
  /** Set when the template produced this element and the user has not moved it. */
  fromTemplate?: boolean | undefined;
  locked?: boolean | undefined;
  opacity?: number | undefined;
  /** text */
  text?: string | undefined;
  fontSize?: number | undefined;
  lineHeight?: number | undefined;
  family?: FontRole | undefined;
  weight?: number | undefined;
  align?: "left" | "center" | "right" | undefined;
  tracking?: number | undefined;
  uppercase?: boolean | undefined;
  /** icon */
  glyph?: string | undefined;
  strokeWidth?: number | undefined;
  /** shape */
  shape?: ShapeKind | undefined;
  radius?: number | undefined;
  filled?: boolean | undefined;
};

/** Kept as an alias so older call sites keep compiling. */
export type Overlay = Element;

export type Slide = {
  id: string;
  /** What inference decided. */
  role: SlideRole;
  /** What the user chose from the on-slide control. Wins when set. */
  roleOverride?: SlideRole | undefined;
  /** The words. Edited in the slide list; mirrored onto elements by blockId. */
  blocks: Block[];
  /** Everything drawn, template-seeded or hand-placed. All of it is free. */
  elements?: Element[] | undefined;
  /** Slide background colour. Falls back to the template's when unset. */
  background?: string | undefined;
};

export type FontRole = "sans" | "serif" | "mono";

export type TypeRoleSpec = {
  family: FontRole;
  weight: 400 | 500 | 600 | 700;
  tracking: number;
  case: "none" | "upper";
};

/**
 * v2: the brand kit owns COLOUR and TYPEFACE only. Margin, background treatment and
 * handle placement moved to the Template, which owns structure and decoration.
 * One template renders correctly in any brand; that split is the brand lock.
 */
export type BrandKit = {
  palette: { background: string; text: string; accent: string; muted: string };
  type: { display: TypeRoleSpec; body: TypeRoleSpec };
  handle: string;
};

export type FlashCCDocument = {
  version: 2;
  id: string;
  name: string;
  format: FormatId;
  granularity: Granularity;
  source: string;
  brandKit: BrandKit;
  /** Embedded as a snapshot: a deleted library template cannot brick a saved carousel. */
  template: Template;
  slides: Slide[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
  slideCount: number;
  /** Cover text, for the card. */
  preview: string;
  accent: string;
  background: string;
  templateName: string;
};

export const effectiveRole = (slide: Slide): SlideRole => slide.roleOverride ?? slide.role;

export const ROLES: readonly SlideRole[] = ["cover", "body", "list", "quote", "cta"];
