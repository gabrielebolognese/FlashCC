/**
 * src/doc/template.ts — the FlashCC Template model.
 *
 * Pure data. No React, no DOM, no CSS strings, no hex, no x/y, no expressions.
 * See docs/template-system.md §1–2.
 *
 * The two invariants that make the whole thing work:
 *   - Position is a consequence of anchoring; size is a consequence of fitting.
 *     There is no x, no y, and no font size in px anywhere in this file.
 *   - Colour is bound by ROLE, never by hex. A user-authored template that stored
 *     "#db2777" would silently break brand-swapping, so it cannot compile.
 */
import type { SlideRole } from "./types.js";

/* ── 1. Closed scales ─────────────────────────────────────────────────── */

export const REFERENCE_WIDTH = 1080;

export const SPACE = [0, 6, 12, 18, 24, 32, 40, 48, 56, 72, 80, 96, 120, 160] as const;
export type SpaceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export const EM = [0.25, 0.4, 0.55, 0.7, 0.85, 1, 1.2, 1.5] as const;
export type EmStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const STROKE = [1, 2, 4, 6, 10] as const;
export type StrokeStep = 0 | 1 | 2 | 3 | 4;

export const RADIUS = [0, 4, 8, 16, 32] as const;
export type RadiusStep = 0 | 1 | 2 | 3 | 4 | "pill";

export const MARGIN = { tight: 0.05, default: 0.075, wide: 0.1 } as const;
export type MarginStep = keyof typeof MARGIN;

export type Intensity = 1 | 2 | 3 | 4 | 5;
export type Fraction = number;

export type Gap = { mode: "space"; step: SpaceStep } | { mode: "em"; k: EmStep };

/* ── 2. Colour ────────────────────────────────────────────────────────── */

export type ColourRole = "bg" | "text" | "muted" | "accent" | "onAccent" | "hairline" | "none";

export type BackgroundTreatmentSpec =
  | { kind: "flat" }
  | { kind: "gradient"; to: ColourRole; angle: 0 | 45 | 90 | 135 | 180 }
  | { kind: "grid"; cell: SpaceStep; weight: StrokeStep; intensity: Intensity }
  | { kind: "dots"; cell: SpaceStep; size: StrokeStep; intensity: Intensity };

export type BackgroundSpec = { fill: ColourRole; treatment: BackgroundTreatmentSpec };

/* ── 3. Page skeleton ─────────────────────────────────────────────────── */

export type RegionName = "topRail" | "body" | "bottomRail";
export type Align = "left" | "center" | "right";
export type StackAnchor = "start" | "center" | "end";
export type Distribute = "packed" | "spaceBetween";
export type AspectId = "1:1" | "4:5" | "3:2" | "16:9";

export type GridSpec = {
  margin: MarginStep;
  railHeight: { top: SpaceStep; bottom: SpaceStep };
  railGap: SpaceStep;
};

/** Where the stack sits, and where leftover space goes. */
export type FillResponse = {
  /** Above this fill ratio the stack is forced to `start` and reflow begins. */
  crowdedAbove: Fraction;
  /** Below this ratio `sparseAnchor` is used instead of `anchor`. */
  sparseBelow: Fraction;
  /** Where a `center` anchor lands in free space. 0.5 is arithmetic, 0.44 optical. */
  centreBias: Fraction;
};

export type RegionSpec = {
  /** Membership IS presence. A slot exists in a role iff listed here. */
  members: SlotName[];
  anchor: StackAnchor;
  sparseAnchor: StackAnchor;
  distribute: Distribute;
  gap: Gap;
  align: Align;
  inset: SpaceStep;
  fill: FillResponse;
};

/* ── 4. Type ──────────────────────────────────────────────────────────── */

export type TypeSheet = {
  /** ONE ladder for the whole template. Slots take contiguous windows of it. */
  steps: number[];
  floor: number;
};

export type SizeRule =
  | { mode: "fixed"; step: number }
  | { mode: "shrink"; from: number; to: number };

export type LeadingRule = { mode: "optical" } | { mode: "fixed"; ratio: number };

export type TypeStyle = {
  /** The template picks the ROLE; the brand kit picks the face. This is the brand lock. */
  face: "display" | "body";
  size: SizeRule;
  leading: LeadingRule;
  tracking: "inherit" | number;
  case: "inherit" | "none" | "upper";
  weight: "inherit" | 400 | 500 | 600 | 700;
  /** Characters per line. Only ever NARROWS the box, never widens it. */
  measure: number | null;
  /** A fit target, not a hard cap — height is the only hard constraint. */
  maxLines: number | null;
  align: "inherit" | Align;
};

export type WidthSpec =
  | { mode: "column" }
  | { mode: "fraction"; of: 0.5 | 0.66 | 0.75 }
  | { mode: "hug"; padX: SpaceStep };

/* ── 5. Content routing ───────────────────────────────────────────────── */

export type BlockType = "heading" | "paragraph" | "list" | "quote" | "label";
export type Take = "first" | "all" | "rest";

export type ContentBinding =
  | { from: "blocks"; accepts: BlockType[]; take: Take; part: "text" | "items" | "attribution" }
  | { from: "brand"; field: "handle" }
  | { from: "deck"; field: "index" }
  | { from: "asset" };

export type IfEmpty = "collapse" | "reserve";

/* ── 6. Slots ─────────────────────────────────────────────────────────── */

export type IconId =
  | "arrow-right" | "arrow-down" | "arrow-up-right" | "chevron-right"
  | "check" | "x" | "plus" | "minus" | "dot" | "star"
  | "circle" | "square" | "triangle" | "diamond"
  | "quote" | "info" | "alert" | "zap";

export type MarkerSpec =
  | { kind: "none" }
  | { kind: "dot"; size: EmStep; colour: ColourRole }
  | { kind: "dash"; length: EmStep; weight: StrokeStep; colour: ColourRole }
  | { kind: "number"; colour: ColourRole; weight: "inherit" | 400 | 500 | 600 | 700 }
  | { kind: "icon"; glyph: IconId; size: EmStep; colour: ColourRole };

export type TextSlot = {
  kind: "text";
  content: ContentBinding;
  ifEmpty: IfEmpty;
  width: WidthSpec;
  colour: ColourRole;
  type: TypeStyle;
  paraGap: Gap;
  gapBefore: Gap | null;
  prefix: string;
  suffix: string;
};

export type RepeatSlot = Omit<TextSlot, "kind" | "prefix" | "suffix"> & {
  kind: "repeat";
  gap: Gap;
  marker: MarkerSpec;
  markerGap: EmStep;
  hangingIndent: boolean;
};

export type ImageSlot = {
  kind: "image";
  content: ContentBinding;
  ifEmpty: IfEmpty | "placeholder";
  width: WidthSpec;
  aspect: AspectId;
  radius: RadiusStep;
  gapBefore: Gap | null;
};

export type SlotByName = {
  label: TextSlot;
  title: TextSlot;
  body: TextSlot;
  quote: TextSlot;
  attribution: TextSlot;
  handle: TextSlot;
  number: TextSlot;
  list: RepeatSlot;
  image: ImageSlot;
};
export type SlotName = keyof SlotByName;
export type SlotSpec = SlotByName[SlotName];
export type SlotStyles = { [K in SlotName]: SlotByName[K] };

export type TypePatch = { [K in keyof TypeStyle]?: TypeStyle[K] | undefined };
export type SlotPatch<T> = { [K in keyof T]?: (K extends "type" ? TypePatch : T[K]) | undefined };
export type RoleSlots = { [K in SlotName]?: SlotPatch<SlotByName[K]> | undefined };

/* ── 7. Decoration ────────────────────────────────────────────────────── */

export type DecorLength =
  | { mode: "fixed"; step: SpaceStep }
  /** Ties width to the measured box of the slot it attaches to. */
  | { mode: "match" }
  | { mode: "column" };

export type Mark =
  | { kind: "divider"; orientation: "h" | "v"; length: DecorLength; weight: StrokeStep; radius: RadiusStep }
  | { kind: "plate"; padX: SpaceStep; padY: SpaceStep; radius: RadiusStep }
  | { kind: "dot"; size: SpaceStep }
  | { kind: "icon"; glyph: IconId; size: SpaceStep; stroke: StrokeStep };

/** The ONLY way decoration gets a position. Resolved against final slot boxes. */
export type Attach = {
  to: { region: RegionName } | { slot: SlotName };
  edge: "top" | "bottom" | "left" | "right";
  side: "inside" | "outside" | "behind";
  gap: Gap;
  /** Cap-relative distance is what makes a line sit correctly beside display type. */
  from: "box" | "cap";
  align: "start" | "center" | "end" | "match";
};

export type DecorSpec = {
  id: string;
  mark: Mark;
  attach: Attach;
  colour: ColourRole;
  /** Emitted only when that slot resolved to content. */
  requires: SlotName | null;
  optional: boolean;
};

/* ── 8. Reflow ────────────────────────────────────────────────────────── */

export type ReflowMove =
  | { move: "tighten" }
  | { move: "shrink"; slot: SlotName }
  | { move: "drop"; decor: string }
  | { move: "columns"; slot: "list" };

/** The terminal move is `overflow`, structurally. A template cannot switch it off. */
export type OverflowMove = { move: "overflow" };
export type Reflow = [...ReflowMove[], OverflowMove];

/* ── 9. Invariants ────────────────────────────────────────────────────── */

export type Invariants = {
  neverCrossMargin: true;
  neverTruncate: true;
  /** Centred text past N lines flips its TEXT alignment; the box stays centred. */
  centreVetoOverLines: number | null;
  /** Where accent may be a FILL rather than a hairline or marker. */
  accentFill: SlideRole[];
  maxDecorPerSlide: number;
};

/* ── 10. Roles and template ───────────────────────────────────────────── */

export type RoleSpec = {
  regions: { [R in RegionName]: RegionSpec };
  /** Per-role background override — a dark cover into light body slides. */
  background: BackgroundSpec | null;
  slots: RoleSlots;
  decor: DecorSpec[];
  /** The fallback prose slot. Must be a live member with take:"rest". */
  sink: SlotName;
  reflow: Reflow;
};

export type PageSpec = {
  grid: GridSpec;
  background: BackgroundSpec;
  type: TypeSheet;
  slotStyles: SlotStyles;
  invariants: Invariants;
};

/** Each starter demonstrates exactly one structural axis. */
export type StructuralAxis = "anchor" | "centre" | "divider" | "image" | "numbering" | "fill";

export type Template = {
  schema: 1;
  id: string;
  name: string;
  teaches: StructuralAxis;
  origin: { kind: "starter" } | { kind: "user"; from: string | null };
  page: PageSpec;
  roles: { [R in SlideRole]: RoleSpec };
};

export type TemplateSummary = {
  id: string;
  name: string;
  teaches: StructuralAxis;
  origin: Template["origin"];
  updatedAt: string;
};

/* ── 11. Scale helpers ────────────────────────────────────────────────── */

export const space = (s: SpaceStep, k = 1): number => (SPACE[s] ?? 0) * k;
export const em = (s: EmStep): number => EM[s] ?? 1;
export const stroke = (s: StrokeStep, k = 1): number => (STROKE[s] ?? 1) * k;

export function radius(r: RadiusStep, h: number, k = 1): number {
  if (r === "pill") return h / 2;
  return (RADIUS[r] ?? 0) * k;
}

export function gapPx(g: Gap, k: number, relativeTo: number): number {
  return g.mode === "space" ? space(g.step, k) : em(g.k) * relativeTo;
}
