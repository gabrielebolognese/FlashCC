/** Semantic document model. No pixels, no CSS, no DOM. See docs/document-schema.md. */

export type SlideRole = "cover" | "body" | "list" | "quote" | "cta";
export type Granularity = "few" | "balanced" | "many";
export type FormatId = "portrait-4x5" | "square-1x1" | "story-9x16";
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type Block =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "list"; ordered: boolean; items: string[] }
  | { id: string; type: "quote"; text: string; attribution?: string | undefined }
  | { id: string; type: "label"; text: string };

export type Slide = {
  id: string;
  /** What inference decided. */
  role: SlideRole;
  /** What the user chose from the on-slide control. Wins when set. */
  roleOverride?: SlideRole | undefined;
  blocks: Block[];
};

export type FontRole = "sans" | "serif" | "mono";

export type TypeRoleSpec = {
  family: FontRole;
  weight: 400 | 500 | 600 | 700;
  tracking: number;
  case: "none" | "upper";
};

export type BackgroundTreatment =
  | { kind: "solid" }
  | { kind: "gradient"; to: string; angle: number }
  | { kind: "grid"; opacity: number };

export type BrandKit = {
  palette: { background: string; text: string; accent: string; muted: string };
  type: { display: TypeRoleSpec; body: TypeRoleSpec };
  handle: string;
  handlePlacement: Corner | "none";
  background: BackgroundTreatment;
  safeMargin: number;
};

export type FlashCCDocument = {
  version: 1;
  id: string;
  name: string;
  format: FormatId;
  granularity: Granularity;
  source: string;
  brandKit: BrandKit;
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
};

export const effectiveRole = (slide: Slide): SlideRole => slide.roleOverride ?? slide.role;

export const ROLES: readonly SlideRole[] = ["cover", "body", "list", "quote", "cta"];
