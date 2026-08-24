/**
 * The template interpreter. Replaces the five hand-written role branches with one
 * pass over template data. docs/template-system.md §3.
 *
 * Pure: no DOM, no measuring, no React. Same output in Node and in the browser,
 * which is what lets phase 2 convert LayoutNode[] without a browser.
 *
 * Pass order:
 *   1 route    content blocks into slots by role membership + accepts + take
 *   2 ground   resolve the background fill, then the palette against it
 *   3 fit      choose a type step per slot from its window
 *   4 reflow   if the group overflows, walk the template's ordered move list
 *   5 stack    anchor / distribute members inside each region
 *   6 emit     content nodes
 *   7 attach   decoration, resolved against final slot boxes
 */
import {
  em,
  gapPx,
  MARGIN,
  radius as radiusPx,
  REFERENCE_WIDTH,
  space,
  stroke,
  type ColourRole,
  type DecorSpec,
  type Gap,
  type ImageSlot,
  type RegionName,
  type RegionSpec,
  type RepeatSlot,
  type SlotName,
  type SlotSpec,
  type Template,
  type TextSlot,
  type TypeStyle,
} from "../../doc/template.js";
import { blockText } from "../../doc/parse.js";
import { effectiveRole, type Block, type BrandKit, type Slide } from "../../doc/types.js";
import { derivePatternColour, guardContrast, resolvePalette, roleColour, type Palette } from "../colour.js";
import { fitText, measureWidth } from "./fit.js";
import type { Format, LayoutNode } from "./node.js";

const ORDER: RegionName[] = ["topRail", "body", "bottomRail"];

type Routed = { slot: SlotName; spec: SlotSpec; blocks: Block[]; text: string; items: string[] };

type Placed = {
  slot: SlotName;
  spec: SlotSpec;
  routed: Routed;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  lineHeight: number;
  lines: number;
  capOffset: number;
  overflow: boolean;
};

export function interpret(
  template: Template,
  slide: Slide,
  brand: BrandKit,
  format: Format,
  slideNumber: number,
): LayoutNode[] {
  const role = effectiveRole(slide);
  const roleSpec = template.roles[role];
  const page = template.page;
  const k = format.w / REFERENCE_WIDTH;

  // ── pass 2: ground and palette ──────────────────────────────────────────
  const bgSpec = roleSpec.background ?? page.background;
  const provisional = resolvePalette(brand, brand.palette.background);
  const ground = roleColour(bgSpec.fill, provisional);
  const palette = resolvePalette(brand, ground);

  const nodes: LayoutNode[] = [];
  let z = 0;

  // Background is emitted as a real node so phase 2 receives a complete scene.
  const bgNode: LayoutNode = {
    id: `${slide.id}-bg`,
    kind: "rect",
    x: 0,
    y: 0,
    w: format.w,
    h: format.h,
    z: z++,
    band: "background",
    color: ground,
    fill: ground,
  };
  if (bgSpec.treatment.kind === "gradient") {
    bgNode.gradient = {
      from: ground,
      to: roleColour(bgSpec.treatment.to, palette),
      angle: bgSpec.treatment.angle,
    };
  } else if (bgSpec.treatment.kind === "grid" || bgSpec.treatment.kind === "dots") {
    const t = bgSpec.treatment;
    bgNode.pattern = {
      kind: t.kind,
      cell: space(t.cell, k),
      weight: stroke(t.kind === "grid" ? t.weight : t.size, k),
      color: derivePatternColour(palette.text, ground, t.intensity),
    };
  }
  nodes.push(bgNode);

  // ── grid geometry ───────────────────────────────────────────────────────
  const m = Math.round(format.w * MARGIN[page.grid.margin]);
  const topH = space(page.grid.railHeight.top, k);
  const botH = space(page.grid.railHeight.bottom, k);
  const railGap = space(page.grid.railGap, k);

  const geom: Record<RegionName, { x: number; y: number; w: number; h: number }> = {
    topRail: { x: m, y: m, w: format.w - m * 2, h: topH },
    body: {
      x: m,
      y: m + topH + (topH > 0 ? railGap : 0),
      w: format.w - m * 2,
      h:
        format.h -
        m * 2 -
        topH -
        botH -
        (topH > 0 ? railGap : 0) -
        (botH > 0 ? railGap : 0),
    },
    bottomRail: { x: m, y: format.h - m - botH, w: format.w - m * 2, h: botH },
  };

  // ── pass 1: route ───────────────────────────────────────────────────────
  const consumed = new Set<string>();
  const routedBy = new Map<SlotName, Routed>();

  const resolveSlot = (name: SlotName): SlotSpec => {
    const base = page.slotStyles[name];
    const patch = roleSpec.slots[name];
    if (!patch) return base;
    const merged = { ...base, ...(patch as Record<string, unknown>) } as SlotSpec;
    const typePatch = (patch as { type?: Partial<TypeStyle> }).type;
    if (typePatch && "type" in base) {
      (merged as { type: TypeStyle }).type = { ...(base as TextSlot).type, ...typePatch };
    }
    return merged;
  };

  const liveMembers: Record<RegionName, SlotName[]> = { topRail: [], body: [], bottomRail: [] };

  for (const region of ORDER) {
    for (const name of roleSpec.regions[region].members) {
      const spec = resolveSlot(name);
      const routed = route(name, spec, slide, brand, slideNumber, consumed);
      routedBy.set(name, routed);
      liveMembers[region].push(name);
    }
  }

  // Nothing is ever dropped: leftovers land in the role's sink slot.
  const sinkRouted = routedBy.get(roleSpec.sink);
  if (sinkRouted) {
    const leftovers = slide.blocks.filter((b) => !consumed.has(b.id));
    if (leftovers.length > 0) {
      sinkRouted.blocks = [...sinkRouted.blocks, ...leftovers];
      sinkRouted.text = sinkRouted.blocks.map(blockText).join("\n\n");
      for (const b of leftovers) consumed.add(b.id);
    }
  }

  // ── passes 3–6, per region ──────────────────────────────────────────────
  for (const region of ORDER) {
    const spec = roleSpec.regions[region];
    const box = geom[region];
    if (box.h <= 0) continue;

    const inset = space(spec.inset, k);
    const contentX = box.x + inset;
    const contentW = box.w - inset * 2;

    const present = liveMembers[region].filter((name) => {
      const r = routedBy.get(name);
      if (!r) return false;
      const empty = isEmpty(r);
      return !empty || r.spec.ifEmpty === "reserve";
    });
    if (present.length === 0) continue;

    let placed = layoutStack(present, routedBy, template, palette, brand, spec, contentX, contentW, k, ground);
    let groupH = stackHeight(placed, spec, k);

    // ── pass 4: reflow ────────────────────────────────────────────────────
    const droppedDecor = new Set<string>();
    let shrunk = new Map<SlotName, number>();
    let tightened = 1;
    let guard = 0;
    const cap = roleSpec.reflow.length * 2;

    while (groupH > box.h && guard < cap) {
      guard += 1;
      const move = roleSpec.reflow[Math.min(guard - 1, roleSpec.reflow.length - 1)];
      if (!move || move.move === "overflow") break;

      if (move.move === "tighten") tightened = Math.max(0.6, tightened - 0.2);
      else if (move.move === "shrink") shrunk = new Map(shrunk).set(move.slot, (shrunk.get(move.slot) ?? 0) + 2);
      else if (move.move === "drop") droppedDecor.add(move.decor);
      else if (move.move === "columns") shrunk = new Map(shrunk).set("list", (shrunk.get("list") ?? 0) + 1);

      placed = layoutStack(
        present, routedBy, template, palette, brand, spec, contentX, contentW, k, ground, shrunk,
      );
      groupH = stackHeight(placed, spec, k) * tightened;
    }

    const overflowing = groupH > box.h;

    // ── pass 5: anchor the stack ──────────────────────────────────────────
    const ratio = box.h > 0 ? groupH / box.h : 0;
    let anchor = spec.anchor;
    if (ratio > spec.fill.crowdedAbove) anchor = "start";
    else if (ratio < spec.fill.sparseBelow) anchor = spec.sparseAnchor;

    const slack = Math.max(0, box.h - groupH);
    let cursor =
      anchor === "start" ? box.y : anchor === "end" ? box.y + slack : box.y + slack * spec.fill.centreBias;

    const spaceBetween = spec.distribute === "spaceBetween" && placed.length > 1;

    for (let i = 0; i < placed.length; i += 1) {
      const p = placed[i];
      if (!p) continue;
      if (i > 0) {
        const prev = placed[i - 1];
        const g = p.spec.gapBefore ?? spec.gap;
        cursor += gapPx(g, k, prev?.fontSize ?? 0) * tightened;
        if (spaceBetween && i === 1) cursor = box.y + box.h - remainingHeight(placed, i, spec, k, tightened);
      }
      p.y = cursor;
      p.x = alignX(contentX, contentW, p.w, spec.align);
      cursor += p.h;
    }

    // ── pass 6: emit ──────────────────────────────────────────────────────
    for (const p of placed) {
      z = emitSlot(nodes, p, slide, palette, brand, page, k, z, overflowing, spec, ground);
    }

    // remember boxes for decoration attach
    for (const p of placed) placedBoxes.set(`${region}:${p.slot}`, p);
    regionBoxes.set(region, box);
    if (droppedDecor.size > 0) for (const d of droppedDecor) globalDropped.add(d);
  }

  // ── pass 7: decoration ──────────────────────────────────────────────────
  let decorCount = 0;
  for (const decor of roleSpec.decor) {
    if (globalDropped.has(decor.id)) continue;
    if (decorCount >= page.invariants.maxDecorPerSlide) break;
    if (decor.requires) {
      const r = routedBy.get(decor.requires);
      if (!r || isEmpty(r)) continue;
    }
    const node = emitDecor(decor, slide, palette, k, z, format, m);
    if (node) {
      // invariants.neverCrossMargin: a `behind` plate is padded outward from its
      // target, so it is the one node that can escape the safe box. Clamp, never clip.
      nodes.push(clampToSafeBox(node, m, format));
      z += 1;
      decorCount += 1;
    }
  }

  placedBoxes.clear();
  regionBoxes.clear();
  globalDropped.clear();
  return nodes;
}

// Scratch state for decoration attach, cleared at the end of every interpret().
const placedBoxes = new Map<string, Placed>();
const regionBoxes = new Map<RegionName, { x: number; y: number; w: number; h: number }>();
const globalDropped = new Set<string>();

/* ── routing ──────────────────────────────────────────────────────────── */

function route(
  slot: SlotName,
  spec: SlotSpec,
  slide: Slide,
  brand: BrandKit,
  slideNumber: number,
  consumed: Set<string>,
): Routed {
  const empty: Routed = { slot, spec, blocks: [], text: "", items: [] };
  const binding = spec.content;

  if (binding.from === "brand") return { ...empty, text: brand.handle };
  if (binding.from === "deck") return { ...empty, text: String(slideNumber) };
  if (binding.from === "asset") return empty;

  const eligible = slide.blocks.filter(
    (b) => binding.accepts.includes(b.type) && !consumed.has(b.id),
  );
  if (eligible.length === 0) return empty;

  if (binding.part === "attribution") {
    // Reads the quote block; consumes nothing.
    const q = slide.blocks.find((b) => b.type === "quote");
    const attribution = q && q.type === "quote" ? q.attribution : undefined;
    return attribution ? { ...empty, text: attribution } : empty;
  }

  const taken =
    binding.take === "first" ? eligible.slice(0, 1) : eligible;
  for (const b of taken) consumed.add(b.id);

  if (binding.part === "items") {
    const items = taken.flatMap((b) => (b.type === "list" ? b.items : [blockText(b)]));
    return { slot, spec, blocks: taken, text: items.join(" "), items };
  }
  return { slot, spec, blocks: taken, text: taken.map(blockText).join("\n\n"), items: [] };
}

const isEmpty = (r: Routed): boolean => r.text.trim().length === 0 && r.items.length === 0;

/* ── stacking and fitting ─────────────────────────────────────────────── */

function layoutStack(
  names: SlotName[],
  routedBy: Map<SlotName, Routed>,
  template: Template,
  palette: Palette,
  brand: BrandKit,
  region: RegionSpec,
  x: number,
  w: number,
  k: number,
  ground: string,
  shrunk?: Map<SlotName, number>,
): Placed[] {
  const out: Placed[] = [];
  for (const name of names) {
    const routed = routedBy.get(name);
    if (!routed) continue;
    const spec = routed.spec;

    if (spec.kind === "image") {
      const width = resolveWidth(spec.width, w, k, 0);
      const ratio = aspectRatio(spec.aspect);
      out.push(blank(name, spec, routed, x, width, width / ratio));
      continue;
    }

    const ts = spec.type;
    const face = brand.type[ts.face];
    const steps = template.page.type.steps;
    const shift = shrunk?.get(name) ?? 0;
    const window = sizeWindow(ts, steps, template.page.type.floor, shift);
    const tracking = ts.tracking === "inherit" ? face.tracking : ts.tracking;

    let boxW = resolveWidth(spec.width, w, k, 0);
    if (ts.measure !== null) {
      boxW = Math.min(boxW, measureWidth(ts.measure, window[0] ?? 16, face.family, tracking));
    }

    if (spec.kind === "repeat") {
      const rs = spec as RepeatSlot;
      const indent = rs.hangingIndent ? em(rs.markerGap) * (window[0] ?? 16) + markerWidth(rs, window[0] ?? 16) : 0;
      let total = 0;
      let worst = false;
      let size = window[0] ?? 16;
      let lh = 0;
      const perItem = routed.items.length > 0 ? routed.items : [""];
      const fitted = perItem.map((item) => {
        const f = fitText(item, window, boxW - indent, Number.POSITIVE_INFINITY, face.family, tracking, leadingOf(ts, window[0] ?? 16));
        return f;
      });
      size = Math.min(...fitted.map((f) => f.fontSize));
      lh = size * leadingOf(ts, size);
      for (const item of perItem) {
        const f = fitText(item, [size], boxW - indent, Number.POSITIVE_INFINITY, face.family, tracking, leadingOf(ts, size));
        total += f.lines * lh;
        worst = worst || f.overflow;
      }
      total += gapPx(rs.gap, k, size) * Math.max(0, perItem.length - 1);
      out.push({
        slot: name, spec, routed, x, y: 0, w: boxW, h: total,
        fontSize: size, lineHeight: lh, lines: perItem.length, capOffset: size * 0.28, overflow: worst,
      });
      continue;
    }

    const text = applyAffix(routed.text, spec as TextSlot);
    const f = fitText(text, window, boxW, Number.POSITIVE_INFINITY, face.family, tracking, leadingOf(ts, window[0] ?? 16));
    const lh = f.fontSize * leadingOf(ts, f.fontSize);
    const paraCount = Math.max(1, routed.blocks.length);
    const paraGaps = gapPx((spec as TextSlot).paraGap, k, f.fontSize) * (paraCount - 1);
    const width = spec.width.mode === "hug"
      ? Math.min(w, measureWidth(text.length, f.fontSize, face.family, tracking) + space(spec.width.padX, k) * 2)
      : boxW;

    out.push({
      slot: name, spec, routed, x, y: 0, w: width, h: f.lines * lh + paraGaps,
      fontSize: f.fontSize, lineHeight: lh, lines: f.lines, capOffset: f.fontSize * 0.28,
      overflow: f.overflow || (ts.maxLines !== null && f.lines > ts.maxLines),
    });
  }
  return out;
}

function blank(slot: SlotName, spec: SlotSpec, routed: Routed, x: number, w: number, h: number): Placed {
  return { slot, spec, routed, x, y: 0, w, h, fontSize: 0, lineHeight: 0, lines: 0, capOffset: 0, overflow: false };
}

function stackHeight(placed: Placed[], region: RegionSpec, k: number): number {
  let total = 0;
  placed.forEach((p, i) => {
    if (i > 0) {
      const prev = placed[i - 1];
      total += gapPx(p.spec.gapBefore ?? region.gap, k, prev?.fontSize ?? 0);
    }
    total += p.h;
  });
  return total;
}

function remainingHeight(placed: Placed[], from: number, region: RegionSpec, k: number, tighten: number): number {
  let total = 0;
  for (let i = from; i < placed.length; i += 1) {
    const p = placed[i];
    if (!p) continue;
    if (i > from) total += gapPx(p.spec.gapBefore ?? region.gap, k, placed[i - 1]?.fontSize ?? 0) * tighten;
    total += p.h;
  }
  return total;
}

function sizeWindow(ts: TypeStyle, steps: number[], floor: number, shift: number): number[] {
  const clampIdx = (i: number) => Math.max(0, Math.min(steps.length - 1, Math.min(i, floor)));
  if (ts.size.mode === "fixed") {
    const i = clampIdx(ts.size.step + shift);
    return [steps[i] ?? 16];
  }
  const from = clampIdx(ts.size.from + shift);
  const to = clampIdx(ts.size.to + shift);
  const out: number[] = [];
  for (let i = Math.min(from, to); i <= Math.max(from, to); i += 1) {
    const v = steps[i];
    if (v !== undefined) out.push(v);
  }
  return out.length > 0 ? out.sort((a, b) => b - a) : [16];
}

/** Optical leading: tighter as size grows. */
function leadingOf(ts: TypeStyle, size: number): number {
  if (ts.leading.mode === "fixed") return ts.leading.ratio;
  return Math.max(1.02, Math.min(1.5, 1.5 - 0.004 * size));
}

function resolveWidth(spec: SlotSpec["width"], columnW: number, k: number, _pad: number): number {
  if (spec.mode === "column") return columnW;
  if (spec.mode === "fraction") return columnW * spec.of;
  return columnW;
}

const aspectRatio = (a: ImageSlot["aspect"]): number =>
  a === "1:1" ? 1 : a === "4:5" ? 0.8 : a === "3:2" ? 1.5 : 16 / 9;

function markerWidth(rs: RepeatSlot, size: number): number {
  const m = rs.marker;
  if (m.kind === "none") return 0;
  if (m.kind === "dot") return em(m.size) * size;
  if (m.kind === "dash") return em(m.length) * size;
  if (m.kind === "icon") return em(m.size) * size;
  return size * 1.1;
}

const applyAffix = (text: string, spec: TextSlot): string =>
  text.length === 0 ? "" : `${spec.prefix}${text}${spec.suffix}`;

function alignX(x: number, w: number, boxW: number, align: RegionSpec["align"]): number {
  if (align === "center") return x + (w - boxW) / 2;
  if (align === "right") return x + w - boxW;
  return x;
}

/* ── emission ─────────────────────────────────────────────────────────── */

function emitSlot(
  nodes: LayoutNode[],
  p: Placed,
  slide: Slide,
  palette: Palette,
  brand: BrandKit,
  page: Template["page"],
  k: number,
  z: number,
  overflowing: boolean,
  region: RegionSpec,
  ground: string,
): number {
  const spec = p.spec;

  if (spec.kind === "image") {
    nodes.push({
      id: `${slide.id}-${p.slot}`,
      kind: "image",
      x: p.x, y: p.y, w: p.w, h: p.h, z: z++, band: "media",
      color: palette.hairline,
      fill: palette.hairline,
      radius: radiusPx(spec.radius, p.h, k),
      placeholder: true,
      slot: p.slot,
    });
    return z;
  }

  const ts = spec.type;
  const face = brand.type[ts.face];
  let colour = roleColour(spec.colour, palette);
  colour = guardContrast(colour, ground, palette);
  const weight = ts.weight === "inherit" ? face.weight : ts.weight;
  const tracking = ts.tracking === "inherit" ? face.tracking : ts.tracking;
  const upper = ts.case === "inherit" ? face.case === "upper" : ts.case === "upper";

  // Centre veto: long centred text flips its TEXT alignment, box stays centred.
  let align: "left" | "center" | "right" =
    ts.align === "inherit" ? region.align : ts.align;
  const veto = page.invariants.centreVetoOverLines;
  if (align === "center" && veto !== null && p.lines > veto) align = region.align === "center" ? "left" : region.align;

  if (spec.kind === "repeat") {
    const rs = spec as RepeatSlot;
    const indent = rs.hangingIndent ? em(rs.markerGap) * p.fontSize + markerWidth(rs, p.fontSize) : 0;
    let y = p.y;
    p.routed.items.forEach((item, i) => {
      const marker = rs.marker;
      if (marker.kind === "dot") {
        const size = em(marker.size) * p.fontSize;
        nodes.push({
          id: `${slide.id}-mk-${i}`, kind: "rect",
          x: p.x, y: y + p.fontSize * 0.42 - size / 2, w: size, h: size,
          z: z++, band: "content", color: roleColour(marker.colour, palette),
          fill: roleColour(marker.colour, palette), radius: size / 2,
        });
      } else if (marker.kind === "dash") {
        const len = em(marker.length) * p.fontSize;
        nodes.push({
          id: `${slide.id}-mk-${i}`, kind: "line",
          x: p.x, y: y + p.fontSize * 0.45, w: len, h: stroke(marker.weight, k),
          z: z++, band: "content", color: roleColour(marker.colour, palette),
          fill: roleColour(marker.colour, palette), strokeWidth: stroke(marker.weight, k),
        });
      } else if (marker.kind === "number") {
        nodes.push({
          id: `${slide.id}-mk-${i}`, kind: "text",
          x: p.x, y, w: indent, h: p.lineHeight, z: z++, band: "content",
          color: roleColour(marker.colour, palette), text: `${i + 1}`,
          fontSize: p.fontSize, lineHeight: p.lineHeight,
          weight: marker.weight === "inherit" ? weight : marker.weight,
          tracking, align: "left", family: face.family,
        });
      } else if (marker.kind === "icon") {
        const size = em(marker.size) * p.fontSize;
        nodes.push({
          id: `${slide.id}-mk-${i}`, kind: "icon",
          x: p.x, y: y + p.fontSize * 0.32 - size / 2, w: size, h: size,
          z: z++, band: "content", color: roleColour(marker.colour, palette),
          glyph: marker.glyph, strokeWidth: 2,
        });
      }

      const itemLines = Math.max(1, Math.ceil(item.length / Math.max(1, Math.floor((p.w - indent) / (p.fontSize * 0.52)))));
      nodes.push({
        id: `${slide.id}-item-${i}`, kind: "text",
        x: p.x + indent, y, w: p.w - indent, h: itemLines * p.lineHeight,
        z: z++, band: "content", color: colour, text: item,
        fontSize: p.fontSize, lineHeight: p.lineHeight, weight, tracking,
        align, family: face.family, uppercase: upper,
        slot: p.slot,
        blockId: p.routed.blocks[0]?.id,
        itemIndex: i,
        overflow: overflowing && i === 0,
      });
      y += itemLines * p.lineHeight + gapPx(rs.gap, k, p.fontSize);
    });
    return z;
  }

  const text = applyAffix(p.routed.text, spec as TextSlot);
  if (text.length === 0) return z;

  nodes.push({
    id: `${slide.id}-${p.slot}`, kind: "text",
    x: p.x, y: p.y, w: p.w, h: p.h, z: z++, band: p.slot === "handle" || p.slot === "number" ? "furniture" : "content",
    color: colour, text,
    fontSize: p.fontSize, lineHeight: p.lineHeight, weight, tracking,
    align, family: face.family, uppercase: upper,
    slot: p.slot,
    blockId: p.routed.blocks[0]?.id,
    overflow: overflowing || p.overflow,
  });
  return z;
}

function emitDecor(
  decor: DecorSpec,
  slide: Slide,
  palette: Palette,
  k: number,
  z: number,
  format: Format,
  margin: number,
): LayoutNode | null {
  const placedTarget = "slot" in decor.attach.to ? findPlaced(decor.attach.to.slot) : undefined;
  const regionTarget = "region" in decor.attach.to ? regionBoxes.get(decor.attach.to.region) : undefined;
  const box = placedTarget ?? regionTarget;
  if (!box) return null;

  const colour = roleColour(decor.colour, palette);
  const mark = decor.mark;
  const gap = gapPx(decor.attach.gap, k, placedTarget?.fontSize ?? 0);
  // Cap-relative distance is what makes a line sit correctly beside display type.
  const capAdjust =
    decor.attach.from === "cap" && placedTarget && placedTarget.fontSize > 0
      ? (placedTarget.lineHeight - placedTarget.fontSize * 0.72) / 2
      : 0;

  if (mark.kind === "divider") {
    const len =
      mark.length.mode === "fixed" ? space(mark.length.step, k)
        : mark.length.mode === "match" ? box.w
          : format.w - margin * 2;
    const weight = stroke(mark.weight, k);
    const horizontal = mark.orientation === "h";
    const w = horizontal ? len : weight;
    const h = horizontal ? weight : len;

    let x = box.x;
    if (decor.attach.align === "center") x = box.x + (box.w - w) / 2;
    else if (decor.attach.align === "end") x = box.x + box.w - w;

    let y = box.y;
    if (decor.attach.edge === "top") y = box.y - gap - h + capAdjust;
    else if (decor.attach.edge === "bottom") y = box.y + box.h + gap - capAdjust;
    if (decor.attach.edge === "left") x = box.x - gap - w;
    if (decor.attach.edge === "right") x = box.x + box.w + gap;
    if (decor.attach.side === "inside" && decor.attach.edge === "bottom") y = box.y + box.h - h - gap;
    if (mark.orientation === "v") { y = box.y; }

    return {
      id: `${slide.id}-${decor.id}`, kind: "line",
      x, y, w, h, z, band: "decor", color: colour, fill: colour,
      radius: radiusPx(mark.radius, h, k), strokeWidth: weight, decorId: decor.id,
    };
  }

  if (mark.kind === "plate") {
    const padX = space(mark.padX, k);
    const padY = space(mark.padY, k);
    const w = box.w + padX * 2;
    const h = box.h + padY * 2;
    return {
      id: `${slide.id}-${decor.id}`, kind: "rect",
      x: box.x - padX, y: box.y - padY, w, h,
      z, band: "decor", color: colour, fill: colour,
      radius: radiusPx(mark.radius, h, k), decorId: decor.id,
    };
  }

  if (mark.kind === "icon") {
    const size = space(mark.size, k);
    let x = box.x;
    if (decor.attach.align === "center") x = box.x + (box.w - size) / 2;
    else if (decor.attach.align === "end") x = box.x + box.w - size;
    const y = decor.attach.edge === "top" ? box.y - gap - size : box.y + box.h + gap;
    return {
      id: `${slide.id}-${decor.id}`, kind: "icon",
      x, y, w: size, h: size, z, band: "decor", color: colour,
      glyph: mark.glyph, strokeWidth: stroke(mark.stroke, k), decorId: decor.id,
    };
  }

  const size = space(mark.size, k);
  return {
    id: `${slide.id}-${decor.id}`, kind: "rect",
    x: box.x, y: box.y - gap - size, w: size, h: size,
    z, band: "decor", color: colour, fill: colour, radius: size / 2, decorId: decor.id,
  };
}

function clampToSafeBox(node: LayoutNode, m: number, format: Format): LayoutNode {
  const left = Math.max(m, node.x);
  const right = Math.min(format.w - m, node.x + node.w);
  const top = Math.max(m, node.y);
  const bottom = Math.min(format.h - m, node.y + node.h);
  return {
    ...node,
    x: left,
    y: top,
    w: Math.max(0, right - left),
    h: Math.max(0, bottom - top),
  };
}

function findPlaced(slot: SlotName): Placed | undefined {
  for (const region of ORDER) {
    const hit = placedBoxes.get(`${region}:${slot}`);
    if (hit) return hit;
  }
  return undefined;
}
