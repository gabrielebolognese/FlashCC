import type { Align, IconId, SlotName } from "../../doc/template.js";
import type { FontRole } from "../../doc/types.js";

export type ZBand = "background" | "media" | "decor" | "content" | "furniture";
export type NodeKind = "rect" | "line" | "icon" | "image" | "text" | "shape";

/**
 * The emission format. `computeLayout` returns these and nothing else; React only
 * paints them. Phase 2 converts this array into a FlashFX flat layer array, which is
 * why `parentId`, `z` and resolved type live here rather than in JSX.
 */
export type LayoutNode = {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  band: ZBand;
  color: string;
  parentId?: string | undefined;
  slot?: SlotName | undefined;
  decorId?: string | undefined;
  /** Set on hand-placed elements so the canvas can select and drag them. */
  overlayId?: string | undefined;
  shape?: "rect" | "ellipse" | "line" | "triangle" | undefined;
  filled?: boolean | undefined;
  opacity?: number | undefined;
  fill?: string | undefined;
  radius?: number | undefined;
  text?: string | undefined;
  fontSize?: number | undefined;
  lineHeight?: number | undefined;
  weight?: number | undefined;
  tracking?: number | undefined;
  align?: Align | undefined;
  family?: FontRole | undefined;
  uppercase?: boolean | undefined;
  strokeWidth?: number | undefined;
  glyph?: IconId | undefined;
  src?: string | undefined;
  placeholder?: boolean | undefined;
  gradient?: { from: string; to: string; angle: number } | undefined;
  pattern?: { kind: "grid" | "dots"; cell: number; weight: number; color: string } | undefined;
  blockId?: string | undefined;
  itemIndex?: number | undefined;
  overflow?: boolean | undefined;
};

export type Format = { w: number; h: number };

export const FORMATS: Record<string, Format> = {
  "portrait-4x5": { w: 1080, h: 1350 },
  "square-1x1": { w: 1080, h: 1080 },
  "story-9x16": { w: 1080, h: 1920 },
};
