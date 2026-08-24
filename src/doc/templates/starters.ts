/**
 * The six starter templates. docs/template-system.md §6.
 *
 * Each demonstrates exactly ONE structural axis (`teaches`). Six recolours of one
 * layout would teach that a template is a palette picker; these differ in skeleton,
 * anchor, decoration and type ladder.
 */
import type { Reflow, RoleSpec, Template } from "../template.js";
import { EMGAP, GAP, INVARIANTS, region, slotStyles } from "./base.js";

const REFLOW: Reflow = [{ move: "tighten" }, { move: "shrink", slot: "body" }, { move: "shrink", slot: "title" }, { move: "overflow" }];

function role(patch: Partial<RoleSpec> = {}): RoleSpec {
  return {
    regions: { topRail: region(), body: region(), bottomRail: region() },
    background: null,
    slots: {},
    decor: [],
    sink: "body",
    reflow: REFLOW,
    ...patch,
  };
}

/* ── 1 · Anchored — teaches "anchor" ────────────────────────────────────
   Confident and quiet. Content rises from the bottom; empty space accumulates
   above it on purpose. This is the migration target for v1 documents. */
export const ANCHORED: Template = {
  schema: 1,
  id: "tpl_anchored",
  name: "Anchored",
  teaches: "anchor",
  origin: { kind: "starter" },
  page: {
    grid: { margin: "default", railHeight: { top: 9, bottom: 9 }, railGap: 7 },
    background: { fill: "bg", treatment: { kind: "flat" } },
    type: { steps: [96, 84, 72, 64, 56, 48, 44, 40, 36, 32, 30, 28, 26, 24], floor: 13 },
    slotStyles: slotStyles(),
    invariants: INVARIANTS,
  },
  roles: {
    cover: role({
      regions: {
        topRail: region(),
        body: region({ members: ["label", "title"], anchor: "end", sparseAnchor: "end", distribute: "spaceBetween", align: "left" }),
        bottomRail: region({ members: ["handle"], anchor: "start", align: "left" }),
      },
      decor: [
        {
          id: "accent",
          mark: { kind: "divider", orientation: "h", length: { mode: "fixed", step: 12 }, weight: 3, radius: 1 },
          attach: { to: { slot: "title" }, edge: "top", side: "outside", gap: GAP(5), from: "cap", align: "start" },
          colour: "accent",
          requires: "title",
          optional: true,
        },
        {
          id: "swipe",
          mark: { kind: "icon", glyph: "arrow-right", size: 9, stroke: 1 },
          attach: { to: { region: "bottomRail" }, edge: "top", side: "inside", gap: GAP(0), from: "box", align: "end" },
          colour: "accent",
          requires: null,
          optional: true,
        },
      ],
      sink: "title",
      reflow: [{ move: "drop", decor: "accent" }, { move: "shrink", slot: "title" }, { move: "tighten" }, { move: "overflow" }],
    }),
    body: role({
      regions: {
        topRail: region({ members: ["number"], align: "right" }),
        body: region({ members: ["title", "body"], anchor: "center", fill: { crowdedAbove: 0.92, sparseBelow: 0.55, centreBias: 0.5 } }),
        bottomRail: region({ members: ["handle"], align: "left" }),
      },
      slots: { title: { type: { size: { mode: "shrink", from: 5, to: 7 } } } },
    }),
    list: role({
      regions: {
        topRail: region({ members: ["number"], align: "right" }),
        body: region({ members: ["title", "list"], anchor: "center", sparseAnchor: "start" }),
        bottomRail: region({ members: ["handle"], align: "left" }),
      },
      slots: { title: { type: { size: { mode: "shrink", from: 5, to: 7 } } } },
      sink: "list",
      reflow: [{ move: "tighten" }, { move: "shrink", slot: "list" }, { move: "overflow" }],
    }),
    quote: role({
      regions: {
        topRail: region(),
        body: region({ members: ["quote", "attribution"], align: "center", inset: 11, gap: GAP(7) }),
        bottomRail: region({ members: ["handle"], align: "left" }),
      },
      slots: { quote: { type: { align: "center" } }, attribution: { type: { align: "center" } } },
      decor: [
        {
          id: "qrule",
          mark: { kind: "divider", orientation: "h", length: { mode: "fixed", step: 10 }, weight: 3, radius: 1 },
          attach: { to: { slot: "quote" }, edge: "top", side: "outside", gap: GAP(7), from: "cap", align: "center" },
          colour: "accent",
          requires: "quote",
          optional: true,
        },
      ],
      sink: "quote",
    }),
    cta: role({
      regions: {
        topRail: region(),
        body: region({ members: ["title", "handle", "body"], align: "center", gap: GAP(8) }),
        bottomRail: region(),
      },
      slots: {
        title: { type: { size: { mode: "shrink", from: 2, to: 4 }, align: "center" } },
        handle: { width: { mode: "hug", padX: 7 }, colour: "onAccent", type: { size: { mode: "fixed", step: 8 }, weight: 600, align: "center" } },
        body: { colour: "muted", type: { align: "center" } },
      },
      decor: [
        {
          id: "plate",
          mark: { kind: "plate", padX: 7, padY: 4, radius: "pill" },
          attach: { to: { slot: "handle" }, edge: "top", side: "behind", gap: GAP(0), from: "box", align: "match" },
          colour: "accent",
          requires: "handle",
          optional: false,
        },
      ],
      sink: "title",
    }),
  },
};

/* ── 2 · Stage — teaches "centre" ───────────────────────────────────────
   One idea, dead centre, very large. No rails, no dividers, maximum air. */
export const STAGE: Template = {
  schema: 1,
  id: "tpl_stage",
  name: "Stage",
  teaches: "centre",
  origin: { kind: "starter" },
  page: {
    grid: { margin: "wide", railHeight: { top: 0, bottom: 9 }, railGap: 9 },
    background: { fill: "bg", treatment: { kind: "flat" } },
    type: { steps: [128, 108, 90, 76, 64, 54, 45, 38, 32, 27, 23, 20], floor: 11 },
    slotStyles: slotStyles(),
    invariants: INVARIANTS,
  },
  roles: {
    cover: stageRole(["title"], { titleFrom: 0, titleTo: 3 }),
    body: stageRole(["title", "body"], { titleFrom: 2, titleTo: 5 }),
    list: stageRole(["title", "list"], { titleFrom: 2, titleTo: 5 }, "list"),
    quote: stageRole(["quote", "attribution"], { titleFrom: 0, titleTo: 3 }, "quote"),
    cta: {
      ...stageRole(["title", "handle"], { titleFrom: 1, titleTo: 3 }),
      background: { fill: "accent", treatment: { kind: "flat" } },
      decor: [
        {
          id: "plate",
          mark: { kind: "plate", padX: 9, padY: 5, radius: "pill" },
          attach: { to: { slot: "handle" }, edge: "top", side: "behind", gap: GAP(0), from: "box", align: "match" },
          colour: "bg",
          requires: "handle",
          optional: false,
        },
      ],
    },
  },
};

function stageRole(
  members: ("title" | "body" | "list" | "quote" | "attribution" | "handle")[],
  t: { titleFrom: number; titleTo: number },
  sink: RoleSpec["sink"] = "body",
): RoleSpec {
  return role({
    regions: {
      topRail: region(),
      body: region({ members, anchor: "center", sparseAnchor: "center", align: "center", gap: EMGAP(5) }),
      bottomRail: region({ members: ["handle"], align: "center" }),
    },
    slots: {
      title: { type: { size: { mode: "shrink", from: t.titleFrom, to: t.titleTo }, align: "center", measure: 24 } },
      body: { type: { align: "center", measure: 46 } },
      quote: { type: { align: "center", measure: 28 } },
      attribution: { type: { align: "center" } },
      list: { marker: { kind: "none" }, hangingIndent: false, type: { align: "center" } },
      handle: { type: { align: "center" } },
    },
    sink,
    reflow: [{ move: "tighten" }, { move: "shrink", slot: "title" }, { move: "shrink", slot: "body" }, { move: "overflow" }],
  });
}

/* ── 3 · Ruled — teaches "divider" ──────────────────────────────────────
   Editorial. Hairlines everywhere, top-anchored, tight margins, small type. */
export const RULED: Template = {
  schema: 1,
  id: "tpl_ruled",
  name: "Ruled",
  teaches: "divider",
  origin: { kind: "starter" },
  page: {
    grid: { margin: "tight", railHeight: { top: 7, bottom: 7 }, railGap: 5 },
    background: { fill: "bg", treatment: { kind: "flat" } },
    type: { steps: [72, 64, 56, 48, 42, 38, 34, 30, 27, 24, 22, 20], floor: 11 },
    slotStyles: slotStyles({
      list: { ...slotStyles().list, marker: { kind: "dash", length: 2, weight: 0, colour: "muted" } },
    }),
    invariants: INVARIANTS,
  },
  roles: {
    cover: ruledRole(["label", "title"], "title"),
    body: ruledRole(["title", "body"], "body"),
    list: ruledRole(["title", "list"], "list"),
    quote: ruledRole(["quote", "attribution"], "quote"),
    cta: ruledRole(["title", "handle"], "title"),
  },
};

function ruledRole(members: ("label" | "title" | "body" | "list" | "quote" | "attribution" | "handle")[], sink: RoleSpec["sink"]): RoleSpec {
  return role({
    regions: {
      topRail: region({ members: ["number", "handle"], distribute: "spaceBetween", align: "left" }),
      body: region({ members, anchor: "start", sparseAnchor: "start", align: "left", gap: EMGAP(4) }),
      bottomRail: region(),
    },
    slots: {
      title: { type: { size: { mode: "shrink", from: 2, to: 4 }, leading: { mode: "fixed", ratio: 1.25 } } },
      body: { type: { size: { mode: "shrink", from: 6, to: 9 }, leading: { mode: "fixed", ratio: 1.45 } } },
      quote: { type: { size: { mode: "shrink", from: 1, to: 4 } } },
      list: { type: { size: { mode: "shrink", from: 6, to: 9 } } },
    },
    decor: [
      {
        id: "masthead",
        mark: { kind: "divider", orientation: "h", length: { mode: "column" }, weight: 0, radius: 0 },
        attach: { to: { region: "topRail" }, edge: "bottom", side: "inside", gap: GAP(4), from: "box", align: "start" },
        colour: "hairline",
        requires: null,
        optional: false,
      },
      {
        id: "underline",
        mark: { kind: "divider", orientation: "h", length: { mode: "match" }, weight: 1, radius: 0 },
        attach: { to: { slot: "title" }, edge: "bottom", side: "outside", gap: EMGAP(2), from: "box", align: "start" },
        colour: "accent",
        requires: "title",
        optional: true,
      },
    ],
    sink,
    reflow: [{ move: "tighten" }, { move: "shrink", slot: "body" }, { move: "drop", decor: "underline" }, { move: "shrink", slot: "title" }, { move: "overflow" }],
  });
}

/* ── 4 · Framed — teaches "image" ───────────────────────────────────────
   Photography-led. An image area reserved beside the text on content slides. */
export const FRAMED: Template = {
  schema: 1,
  id: "tpl_framed",
  name: "Framed",
  teaches: "image",
  origin: { kind: "starter" },
  page: {
    grid: { margin: "default", railHeight: { top: 0, bottom: 8 }, railGap: 6 },
    background: { fill: "bg", treatment: { kind: "flat" } },
    type: { steps: [104, 88, 74, 62, 52, 44, 38, 32, 28, 24, 21], floor: 10 },
    slotStyles: slotStyles({
      list: { ...slotStyles().list, marker: { kind: "dot", size: 0, colour: "accent" } },
    }),
    invariants: { ...INVARIANTS, maxDecorPerSlide: 1 },
  },
  roles: {
    cover: role({
      regions: {
        topRail: region(),
        body: region({ members: ["image", "label", "title"], anchor: "end", align: "left", gap: GAP(6) }),
        bottomRail: region({ members: ["handle"], align: "left" }),
      },
      slots: { image: { aspect: "16:9", radius: 2 }, title: { type: { size: { mode: "shrink", from: 1, to: 4 } } } },
      sink: "title",
    }),
    body: role({
      regions: {
        topRail: region(),
        body: region({ members: ["image", "title", "body"], anchor: "center", align: "left", gap: GAP(6) }),
        bottomRail: region({ members: ["handle"], align: "left" }),
      },
      slots: { image: { aspect: "3:2", radius: 2, width: { mode: "fraction", of: 0.66 } } },
    }),
    list: role({
      regions: {
        topRail: region({ members: ["number"], align: "right" }),
        body: region({ members: ["title", "list"], anchor: "center", align: "left" }),
        bottomRail: region({ members: ["handle"], align: "left" }),
      },
      sink: "list",
    }),
    quote: role({
      regions: {
        topRail: region(),
        body: region({ members: ["quote", "attribution"], align: "center", inset: 9 }),
        bottomRail: region({ members: ["handle"], align: "left" }),
      },
      slots: { quote: { type: { align: "center" } }, attribution: { type: { align: "center" } } },
      sink: "quote",
    }),
    cta: role({
      regions: {
        topRail: region(),
        body: region({ members: ["image", "title", "handle"], align: "center", gap: GAP(7) }),
        bottomRail: region(),
      },
      slots: {
        image: { aspect: "1:1", radius: 4, width: { mode: "fraction", of: 0.5 } },
        title: { type: { align: "center", size: { mode: "shrink", from: 2, to: 4 } } },
        handle: { colour: "accent", type: { align: "center", weight: 600 } },
      },
      sink: "title",
    }),
  },
};

/* ── 5 · Index — teaches "numbering" ────────────────────────────────────
   Numbered and systematic. A big numeral on every slide, a faint grid. */
export const INDEX: Template = {
  schema: 1,
  id: "tpl_index",
  name: "Index",
  teaches: "numbering",
  origin: { kind: "starter" },
  page: {
    grid: { margin: "default", railHeight: { top: 11, bottom: 7 }, railGap: 5 },
    background: { fill: "bg", treatment: { kind: "grid", cell: 9, weight: 0, intensity: 2 } },
    type: { steps: [88, 76, 64, 56, 48, 42, 36, 32, 28, 25, 22, 20], floor: 11 },
    slotStyles: slotStyles({
      list: { ...slotStyles().list, marker: { kind: "number", colour: "accent", weight: 700 }, markerGap: 3 },
      number: {
        ...slotStyles().number,
        colour: "accent",
        ifEmpty: "reserve",
        type: { ...slotStyles().number.type, face: "display", size: { mode: "fixed", step: 2 }, weight: 700 },
      },
    }),
    invariants: INVARIANTS,
  },
  roles: {
    cover: indexRole(["label", "title"], "title"),
    body: indexRole(["title", "body"], "body"),
    list: indexRole(["title", "list"], "list"),
    quote: indexRole(["quote", "attribution"], "quote"),
    cta: indexRole(["title", "handle"], "title"),
  },
};

function indexRole(members: ("label" | "title" | "body" | "list" | "quote" | "attribution" | "handle")[], sink: RoleSpec["sink"]): RoleSpec {
  return role({
    regions: {
      topRail: region({ members: ["number", "handle"], distribute: "spaceBetween", align: "left" }),
      body: region({ members, anchor: "start", sparseAnchor: "start", align: "left", gap: EMGAP(3) }),
      bottomRail: region(),
    },
    slots: {
      label: { type: { case: "upper", tracking: 0.08 } },
      title: { type: { leading: { mode: "fixed", ratio: 1.15 } } },
      body: { type: { leading: { mode: "fixed", ratio: 1.3 } } },
      quote: { type: { align: "left" } },
      handle: { type: { align: "right" } },
    },
    decor: [
      {
        id: "tick",
        mark: { kind: "divider", orientation: "h", length: { mode: "fixed", step: 6 }, weight: 1, radius: 0 },
        attach: { to: { region: "topRail" }, edge: "bottom", side: "inside", gap: GAP(3), from: "box", align: "start" },
        colour: "accent",
        requires: null,
        optional: true,
      },
    ],
    sink,
    reflow: [{ move: "tighten" }, { move: "shrink", slot: "list" }, { move: "shrink", slot: "title" }, { move: "overflow" }],
  });
}

/* ── 6 · Plate — teaches "fill" ─────────────────────────────────────────
   Colour blocks. Headings sit inside filled panels; the cover inverts. */
export const PLATE: Template = {
  schema: 1,
  id: "tpl_plate",
  name: "Plate",
  teaches: "fill",
  origin: { kind: "starter" },
  page: {
    grid: { margin: "wide", railHeight: { top: 7, bottom: 7 }, railGap: 5 },
    background: { fill: "bg", treatment: { kind: "flat" } },
    type: { steps: [112, 94, 80, 68, 58, 48, 41, 35, 30, 26, 22], floor: 10 },
    slotStyles: slotStyles({
      list: { ...slotStyles().list, marker: { kind: "icon", glyph: "square", size: 0, colour: "accent" } },
    }),
    invariants: { ...INVARIANTS, accentFill: ["body", "list", "cta"] },
  },
  roles: {
    cover: role({
      regions: {
        topRail: region(),
        body: region({ members: ["title"], anchor: "end", align: "left" }),
        bottomRail: region({ members: ["handle"], align: "left" }),
      },
      background: { fill: "text", treatment: { kind: "flat" } },
      slots: {
        title: { colour: "bg", type: { case: "upper", tracking: 0.01, weight: 700, leading: { mode: "fixed", ratio: 1.02 }, size: { mode: "shrink", from: 0, to: 3 } } },
        handle: { colour: "bg" },
      },
      sink: "title",
    }),
    body: plateRole(["title", "body"], "body"),
    list: plateRole(["title", "list"], "list"),
    quote: role({
      regions: {
        topRail: region(),
        body: region({ members: ["quote", "attribution"], align: "center", inset: 5 }),
        bottomRail: region({ members: ["handle"], align: "left" }),
      },
      slots: { quote: { colour: "text", type: { align: "center" } }, attribution: { type: { align: "center" } } },
      sink: "quote",
    }),
    cta: role({
      regions: {
        topRail: region(),
        body: region({ members: ["title", "handle"], align: "center", gap: GAP(8) }),
        bottomRail: region(),
      },
      background: { fill: "accent", treatment: { kind: "flat" } },
      slots: {
        title: { colour: "onAccent", type: { case: "upper", weight: 700, align: "center", size: { mode: "shrink", from: 2, to: 4 } } },
        handle: { colour: "accent", width: { mode: "hug", padX: 8 }, type: { align: "center", weight: 600, size: { mode: "fixed", step: 7 } } },
      },
      decor: [
        {
          id: "ctaBlock",
          mark: { kind: "plate", padX: 8, padY: 6, radius: 0 },
          attach: { to: { slot: "handle" }, edge: "top", side: "behind", gap: GAP(0), from: "box", align: "match" },
          colour: "bg",
          requires: "handle",
          optional: false,
        },
      ],
      sink: "title",
    }),
  },
};

function plateRole(members: ("title" | "body" | "list")[], sink: RoleSpec["sink"]): RoleSpec {
  return role({
    regions: {
      topRail: region(),
      body: region({ members, anchor: "center", align: "left", gap: GAP(7) }),
      bottomRail: region({ members: ["handle"], align: "left" }),
    },
    slots: {
      title: {
        colour: "onAccent",
        width: { mode: "hug", padX: 5 },
        type: { case: "upper", tracking: 0.01, weight: 700, leading: { mode: "fixed", ratio: 1.02 }, size: { mode: "shrink", from: 4, to: 6 } },
      },
    },
    decor: [
      {
        id: "titlePlate",
        mark: { kind: "plate", padX: 5, padY: 3, radius: 0 },
        attach: { to: { slot: "title" }, edge: "top", side: "behind", gap: GAP(0), from: "box", align: "match" },
        colour: "accent",
        requires: "title",
        optional: false,
      },
    ],
    sink,
    reflow: [{ move: "tighten" }, { move: "shrink", slot: "title" }, { move: "shrink", slot: "body" }, { move: "overflow" }],
  });
}

export const STARTERS: Template[] = [ANCHORED, STAGE, RULED, FRAMED, INDEX, PLATE];
export const DEFAULT_TEMPLATE = ANCHORED;
