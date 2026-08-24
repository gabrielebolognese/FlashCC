/**
 * Shared defaults every starter builds on. docs/template-system.md §6.
 * Starters differ in skeleton, anchor, decoration and type ladder — never in
 * which slots exist, because that is what makes them one system.
 */
import type {
  FillResponse,
  Gap,
  ImageSlot,
  Invariants,
  RegionSpec,
  RepeatSlot,
  SlotStyles,
  TextSlot,
  TypeStyle,
} from "../template.js";

export const FILL: FillResponse = { crowdedAbove: 0.92, sparseBelow: 0.55, centreBias: 0.44 };
export const GAP = (step: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13): Gap => ({ mode: "space", step });
export const EMGAP = (k: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7): Gap => ({ mode: "em", k });

export const INVARIANTS: Invariants = {
  neverCrossMargin: true,
  neverTruncate: true,
  centreVetoOverLines: 3,
  accentFill: ["cta"],
  maxDecorPerSlide: 2,
};

export function region(patch: Partial<RegionSpec> = {}): RegionSpec {
  return {
    members: [],
    anchor: "center",
    sparseAnchor: "center",
    distribute: "packed",
    gap: GAP(5),
    align: "left",
    inset: 0,
    fill: FILL,
    ...patch,
  };
}

function type(patch: Partial<TypeStyle> = {}): TypeStyle {
  return {
    face: "body",
    size: { mode: "fixed", step: 9 },
    leading: { mode: "optical" },
    tracking: "inherit",
    case: "inherit",
    weight: "inherit",
    measure: null,
    maxLines: null,
    align: "inherit",
    ...patch,
  };
}

function text(patch: Partial<TextSlot> = {}): TextSlot {
  return {
    kind: "text",
    content: { from: "blocks", accepts: ["paragraph"], take: "first", part: "text" },
    ifEmpty: "collapse",
    width: { mode: "column" },
    colour: "text",
    type: type(),
    paraGap: EMGAP(2),
    gapBefore: null,
    prefix: "",
    suffix: "",
    ...patch,
  };
}

/**
 * The ten slots, styled once on the page. Roles patch these; they never redefine them.
 * `size` values are indices into the template's own ladder.
 */
export function slotStyles(overrides: Partial<SlotStyles> = {}): SlotStyles {
  const base: SlotStyles = {
    label: text({
      content: { from: "blocks", accepts: ["label"], take: "first", part: "text" },
      colour: "accent",
      type: type({ size: { mode: "fixed", step: 13 }, case: "upper", tracking: 0.08, weight: 600 }),
    }),
    title: text({
      content: { from: "blocks", accepts: ["heading", "paragraph"], take: "first", part: "text" },
      type: type({ face: "display", size: { mode: "shrink", from: 0, to: 4 }, leading: { mode: "fixed", ratio: 1.08 } }),
    }),
    body: text({
      content: { from: "blocks", accepts: ["paragraph", "heading"], take: "rest", part: "text" },
      type: type({ size: { mode: "shrink", from: 7, to: 11 }, leading: { mode: "fixed", ratio: 1.4 } }),
    }),
    quote: text({
      content: { from: "blocks", accepts: ["quote"], take: "first", part: "text" },
      type: type({ face: "display", size: { mode: "shrink", from: 3, to: 6 }, leading: { mode: "fixed", ratio: 1.2 } }),
    }),
    attribution: text({
      content: { from: "blocks", accepts: ["quote"], take: "first", part: "attribution" },
      colour: "muted",
      prefix: "— ",
      type: type({ size: { mode: "fixed", step: 11 } }),
    }),
    handle: text({
      content: { from: "brand", field: "handle" },
      colour: "muted",
      type: type({ size: { mode: "fixed", step: 12 }, weight: 500 }),
    }),
    number: text({
      content: { from: "deck", field: "index" },
      colour: "muted",
      type: type({ size: { mode: "fixed", step: 13 } }),
    }),
    list: {
      kind: "repeat",
      content: { from: "blocks", accepts: ["list"], take: "first", part: "items" },
      ifEmpty: "collapse",
      width: { mode: "column" },
      colour: "text",
      type: type({ size: { mode: "shrink", from: 8, to: 13 }, leading: { mode: "fixed", ratio: 1.35 } }),
      paraGap: EMGAP(2),
      gapBefore: null,
      gap: GAP(5),
      marker: { kind: "dot", size: 1, colour: "accent" },
      markerGap: 2,
      hangingIndent: true,
    } satisfies RepeatSlot,
    image: {
      kind: "image",
      content: { from: "asset" },
      ifEmpty: "placeholder",
      width: { mode: "column" },
      aspect: "4:5",
      radius: 0,
      gapBefore: null,
    } satisfies ImageSlot,
  };
  return { ...base, ...overrides };
}
