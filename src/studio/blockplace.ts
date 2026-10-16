/**
 * Putting a block on a slide, and putting it back after an edit (19.6, 19.8).
 *
 * ── Where it lands ───────────────────────────────────────────────────────────
 *
 * In the largest free rectangle on the slide that meets the block's `minBox`,
 * inside both the composition margins and the platform's safe box, found by
 * trying every rectangle whose edges sit on an existing edge. Deterministic: the
 * same slide always gives the same answer. No room is an answer too, and the
 * caller offers a new slide rather than overlapping anything.
 *
 * ── Editing after it is placed ───────────────────────────────────────────────
 *
 * The record of what was built (`Slide.blocks`) keeps each part's original box
 * and a signature of its look. Rebuilding with new fields then replaces only the
 * parts the user has not touched, the Batch 4.6 rule, with one refinement the
 * group makes necessary: moving the whole block moves every part by the same
 * amount, and that is a move of the BLOCK, not an edit of each part. So the
 * common offset is found first and applied to the new layout, and only a part
 * that moved differently, or was restyled or retyped, counts as hand-edited.
 *
 * Pure and DOM-free.
 */

import { blockById, withDefaults, type Box, type BuildCtx, type Built, type Fields } from "./blocks.js";
import { marginLines } from "./compositions.js";
import { makeSlide, type BlockRecord, type Doc, type Layer, type Slide } from "./model.js";
import { safeBox, type Platform } from "./platforms.js";
import { rampRange } from "./ramps.js";
import { fitToBox, ladder } from "./text.js";

const GAP = 40;

const intersects = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const inter = (a: Box, b: Box): Box => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
};

/**
 * Where blocks may go on this board: inside the composition margins AND the
 * platform's safe box, so a placed block never starts life in a chrome zone.
 */
export function placementArea(board: { w: number; h: number }, platform?: Platform | undefined): Box {
  const m = marginLines(board.w, board.h);
  const margins = { x: m.x[0]!, y: m.y[0]!, w: m.x[1]! - m.x[0]!, h: m.y[1]! - m.y[0]! };
  return platform ? inter(margins, safeBox(platform, board.w, board.h)) : margins;
}

/** What a new block must not cover: every visible layer except a backdrop. */
function occupied(slide: Slide, board: { w: number; h: number }): Box[] {
  return slide.layers
    .filter((l) => l.visible && !(l.w >= board.w * 0.9 && l.h >= board.h * 0.9))
    .map((l) => ({ x: l.x - GAP, y: l.y - GAP, w: l.w + GAP * 2, h: l.h + GAP * 2 }));
}

/**
 * The slide's headline: its biggest visible text that is the slide's own copy
 * (not a block, not furniture). Where a reader's eye starts.
 */
function headline(slide: Slide): Box | null {
  const own = slide.layers.filter((l) => l.kind === "text" && l.visible && !l.block && !l.furniture && (l.text ?? "").trim());
  if (own.length === 0) return null;
  return own.reduce((a, b) => ((b.fontSize ?? 0) > (a.fontSize ?? 0) ? b : a));
}

/**
 * The largest free rectangle inside `area` that is at least `min`, or null.
 *
 * **Under the headline wins** when there is room there, because that is where
 * a reader looks for the next thing; only when nothing fits below it does the
 * largest space anywhere get used. Ties go to the higher one, then the left.
 */
export function freeRect(slide: Slide, board: { w: number; h: number }, area: Box, min: { w: number; h: number }): Box | null {
  const head = headline(slide);
  if (head) {
    const below = head.y + head.h;
    const under = largestFree(slide, board, { ...area, y: Math.max(area.y, below), h: area.y + area.h - Math.max(area.y, below) }, min);
    if (under) return under;
  }
  return largestFree(slide, board, area, min);
}

function largestFree(slide: Slide, board: { w: number; h: number }, area: Box, min: { w: number; h: number }): Box | null {
  if (area.w < min.w || area.h < min.h) return null;
  const blocks = occupied(slide, board).map((b) => inter(b, area)).filter((b) => b.w > 0 && b.h > 0);
  const xs = [...new Set([area.x, area.x + area.w, ...blocks.flatMap((b) => [b.x, b.x + b.w])])].sort((a, b) => a - b);
  const ys = [...new Set([area.y, area.y + area.h, ...blocks.flatMap((b) => [b.y, b.y + b.h])])].sort((a, b) => a - b);

  let best: Box | null = null;
  for (let i = 0; i < xs.length; i += 1) {
    for (let j = i + 1; j < xs.length; j += 1) {
      const w = xs[j]! - xs[i]!;
      if (w < min.w) continue;
      for (let k = 0; k < ys.length; k += 1) {
        for (let m = k + 1; m < ys.length; m += 1) {
          const h = ys[m]! - ys[k]!;
          if (h < min.h) continue;
          const r = { x: xs[i]!, y: ys[k]!, w, h };
          if (best && w * h < best.w * best.h) continue;
          if (blocks.some((b) => intersects(r, b))) continue;
          if (best && w * h === best.w * best.h && (r.y > best.y || (r.y === best.y && r.x >= best.x))) continue;
          best = r;
        }
      }
    }
  }
  return best;
}

/**
 * The box a block actually takes inside a free rectangle: the full width, and
 * a height in proportion rather than every last pixel, pinned to the top. A
 * three-item checklist stretched down 800px reads as three lonely lines.
 */
export function blockBox(free: Box, min: { w: number; h: number }): Box {
  const h = Math.min(free.h, Math.max(min.h, Math.round(free.w * 0.78)));
  return { x: free.x, y: free.y, w: free.w, h };
}

/* ── a signature of a part's look ─────────────────────────────────────────── */

const LOOK: (keyof Layer)[] = [
  "fill", "stroke", "strokeWidth", "gradient", "opacity", "text", "fontWeight", "fontFamily",
  "italic", "underline", "uppercase", "align", "radius", "src", "glyph", "visible", "rotation",
];

export const lookOf = (l: Layer): string => JSON.stringify(LOOK.map((k) => l[k] ?? null));

export type PartRecord = { x: number; y: number; w: number; h: number; look: string };

/** The record kept on the slide: fields, box, and every part as built. */
export type InstanceRecord = BlockRecord;

function recordOf(block: string, instance: string, fields: Fields, box: Box, built: Built): InstanceRecord {
  const parts: Record<string, PartRecord> = {};
  for (const l of built.layers) {
    const part = l.block?.part ?? l.name;
    parts[part] = { x: l.x, y: l.y, w: l.w, h: l.h, look: lookOf(l) };
  }
  return { instance, block, fields, box, parts };
}

export type Placed = { slide: Slide; built: Built; record: InstanceRecord };

/** Builds a block into `box` and adds it to the slide, on top, with its record. */
export function placeBlock(slide: Slide, blockId: string, fields: Fields, box: Box, ctx: BuildCtx): Placed | null {
  const block = blockById(blockId);
  if (!block) return null;
  const full = withDefaults(block, fields);
  const built = block.build(full, box, ctx);
  const record = recordOf(blockId, ctx.instance, full, box, built);
  return {
    slide: { ...slide, layers: [...slide.layers, ...built.layers], blocks: [...(slide.blocks ?? []), record] },
    built,
    record,
  };
}

/**
 * New fields for a block already on the slide (19.8).
 *
 * Untouched parts are rebuilt; a part the user moved on its own keeps where
 * they put it; a part they restyled or retyped keeps its look. One call, so
 * the caller commits it as one undo step.
 */
export function rebuildBlock(
  slide: Slide,
  instance: string,
  fields: Fields,
  ctx: Omit<BuildCtx, "instance">,
  /** A new box for the whole block (25.2's arrangements); otherwise it stays where it was moved to. */
  to?: Box | undefined,
): Placed | null {
  const record = (slide.blocks ?? []).find((b) => b.instance === instance) as InstanceRecord | undefined;
  const block = record ? blockById(record.block) : undefined;
  if (!record || !block) return null;

  const old = slide.layers.filter((l) => l.block?.instance === instance);
  const parts = record.parts ?? {};

  // The block as a whole may have been moved: the offset most parts share.
  const offsets = old
    .map((l) => parts[l.block!.part])
    .map((p, i) => (p ? `${old[i]!.x - p.x},${old[i]!.y - p.y}` : null))
    .filter((o): o is string => o !== null);
  const counts = new Map<string, number>();
  for (const o of offsets) counts.set(o, (counts.get(o) ?? 0) + 1);
  const [common = "0,0"] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const [dx, dy] = common.split(",").map(Number) as [number, number];

  const box = to ?? { ...record.box, x: record.box.x + dx, y: record.box.y + dy };
  const full = withDefaults(block, fields);
  const built = block.build(full, box, { ...ctx, instance });

  const byPart = new Map(old.map((l) => [l.block!.part, l]));
  const layers = built.layers.map((fresh) => {
    const part = fresh.block!.part;
    const was = byPart.get(part);
    const orig = parts[part];
    if (!was || !orig || !was.handEdited) return fresh;
    const movedAlone = was.x - orig.x !== dx || was.y - orig.y !== dy || was.w !== orig.w || was.h !== orig.h;
    const restyled = lookOf(was) !== orig.look;
    if (!movedAlone && !restyled) return fresh;
    let next: Layer = { ...fresh, id: was.id, handEdited: true };
    if (movedAlone) next = { ...next, x: was.x, y: was.y, w: was.w, h: was.h, ...(was.fontSize ? { fontSize: was.fontSize } : {}) };
    if (restyled) for (const k of LOOK) (next as Record<string, unknown>)[k] = was[k];
    return next;
  });

  // A hand-edited part the new fields no longer produce (a bar for a value
  // that was removed) stays: somebody worked on it.
  const freshParts = new Set(built.layers.map((l) => l.block!.part));
  const orphans = old.filter((l) => l.handEdited && !freshParts.has(l.block!.part));

  // Same z-position as the block had: where its first layer was.
  const first = slide.layers.findIndex((l) => l.block?.instance === instance);
  const rest = slide.layers.filter((l) => l.block?.instance !== instance);
  const at = Math.min(first < 0 ? rest.length : first, rest.length);
  const nextRecord = { ...recordOf(record.block, instance, full, box, built) };

  return {
    slide: {
      ...slide,
      layers: [...rest.slice(0, at), ...layers, ...orphans, ...rest.slice(at)],
      blocks: (slide.blocks ?? []).map((b) => (b.instance === instance ? nextRecord : b)),
    },
    built,
    record: nextRecord,
  };
}

/** The record for a stamped layer, if its block is still on the slide. */
export const recordFor = (slide: Slide, layer: Layer): InstanceRecord | undefined =>
  layer.block ? ((slide.blocks ?? []).find((b) => b.instance === layer.block!.instance) as InstanceRecord | undefined) : undefined;

/* ── into a document ──────────────────────────────────────────────────────── */

export type Insert =
  | { ok: true; doc: Doc; index: number; layerIds: string[]; built: Built }
  | { ok: false; reason: "no-room" | "unknown" };

/** A fresh slide that looks like its neighbour, for a block with no room. */
const slideLike = (s: Slide | undefined, name: string): Slide => ({
  ...makeSlide(s?.background ?? "#12161c", name),
  ...(s?.gradient ? { gradient: s.gradient } : {}),
});

/**
 * Insert a block on slide `index`, or on a new slide right after it.
 *
 * "here" with no free rectangle big enough answers `no-room` and changes
 * nothing: the caller offers "new" rather than overlapping what is there.
 */
export function insertBlock(
  doc: Doc,
  index: number,
  blockId: string,
  fields: Fields,
  ctx: Omit<BuildCtx, "instance" | "board">,
  where: "here" | "new",
  instance: () => string,
  platform?: Platform | undefined,
): Insert {
  const block = blockById(blockId);
  if (!block) return { ok: false, reason: "unknown" };
  const board = { w: doc.width, h: doc.height };
  const area = placementArea(board, platform);

  const target = where === "new" ? slideLike(doc.slides[index], `${block.label}`) : doc.slides[index];
  if (!target) return { ok: false, reason: "unknown" };
  const free = freeRect(target, board, area, block.minBox);
  if (!free) return { ok: false, reason: "no-room" };

  const placed = placeBlock(target, blockId, fields, blockBox(free, block.minBox), { ...ctx, board, instance: instance() });
  if (!placed) return { ok: false, reason: "unknown" };

  const at = where === "new" ? index + 1 : index;
  const slides =
    where === "new"
      ? [...doc.slides.slice(0, at), placed.slide, ...doc.slides.slice(at)]
      : doc.slides.map((s, i) => (i === at ? placed.slide : s));
  return { ok: true, doc: { ...doc, slides }, index: at, layerIds: placed.built.layers.map((l) => l.id), built: placed.built };
}

/**
 * A block too big for one slide, as several: the first part here (or on a new
 * slide when there is no room here), each further part on a new slide after
 * it. Only for blocks that know how to split, and only on whole items.
 */
export function insertSplit(
  doc: Doc,
  index: number,
  blockId: string,
  fields: Fields,
  parts: number,
  ctx: Omit<BuildCtx, "instance" | "board">,
  instance: () => string,
  platform?: Platform | undefined,
): Insert {
  const block = blockById(blockId);
  if (!block?.split) return { ok: false, reason: "unknown" };
  const pieces = block.split(withDefaults(block, fields), parts);
  let current = doc;
  let at = index;
  let first: Insert | null = null;
  pieces.forEach((piece, i) => {
    let r = insertBlock(current, at, blockId, piece, ctx, i === 0 ? "here" : "new", instance, platform);
    if (!r.ok && i === 0) r = insertBlock(current, at, blockId, piece, ctx, "new", instance, platform);
    if (r.ok) {
      current = r.doc;
      at = r.index;
      first ??= r;
    }
  });
  return first ? { ...(first as Extract<Insert, { ok: true }>), doc: current } : { ok: false, reason: "no-room" };
}

/* ── arrangements of a block and its words (25.2) ─────────────────────────── */

/**
 * Where a slide's one block and its words go, for `L` on a slide that holds a
 * block. Fixed order, like the composition rings. Each is a fraction of the
 * margin box, so it works on any artboard; one the block's minimum size does
 * not fit is skipped rather than squeezed.
 */
export const BLOCK_ARRANGEMENTS = ["block-top", "block-bottom", "heading-block", "block-centre", "block-large", "words-large"] as const;
export type BlockArrangement = (typeof BLOCK_ARRANGEMENTS)[number];

type Plan = { block: Box; words: Box | null; size: [number, number]; weight: number };

function planFor(arrangement: BlockArrangement, area: Box): Plan {
  const { x, y, w, h } = area;
  const GAP = 40;
  const part = (from: number, to: number): Box => ({ x, y: Math.round(y + h * from), w, h: Math.round(h * (to - from)) });
  switch (arrangement) {
    case "block-top":
      return { block: part(0, 0.6), words: { ...part(0.6, 1), y: Math.round(y + h * 0.6) + GAP, h: Math.round(h * 0.4) - GAP }, size: [40, 24], weight: 400 };
    case "block-bottom":
      return { block: part(0.4, 1), words: { ...part(0, 0.4), h: Math.round(h * 0.4) - GAP }, size: [40, 24], weight: 400 };
    case "heading-block":
      return { block: part(0.36, 1), words: { ...part(0, 0.36), h: Math.round(h * 0.36) - GAP }, size: [60, 30], weight: 700 };
    case "block-centre":
      return { block: part(0.22, 0.82), words: { ...part(0, 0.22), h: Math.round(h * 0.22) - GAP / 2 }, size: [32, 22], weight: 500 };
    case "block-large":
      return { block: part(0, 0.8), words: { ...part(0.8, 1), y: Math.round(y + h * 0.8) + GAP / 2, h: Math.round(h * 0.2) - GAP / 2 }, size: [30, 22], weight: 400 };
    case "words-large":
      return { block: part(0.5, 1), words: { ...part(0, 0.5), h: Math.round(h * 0.5) - GAP }, size: [64, 30], weight: 700 };
  }
}

/** The arrangements this block fits in, on this board. */
export function arrangementsFor(blockId: string, board: { w: number; h: number }): BlockArrangement[] {
  const block = blockById(blockId);
  if (!block) return [];
  const area = marginArea(board);
  return BLOCK_ARRANGEMENTS.filter((a) => {
    const p = planFor(a, area);
    return p.block.w >= block.minBox.w && p.block.h >= block.minBox.h;
  });
}

const marginArea = (board: { w: number; h: number }): Box => {
  const m = marginLines(board.w, board.h);
  return { x: m.x[0]!, y: m.y[0]!, w: m.x[1]! - m.x[0]!, h: m.y[1]! - m.y[0]! };
};

/**
 * A slide with one block and at most one layer of words, rearranged. The block
 * is rebuilt into its new box (19.8's rule: a part the user moved or restyled
 * keeps what they did); the words are fitted into theirs, at the arrangement's
 * size, never below its floor. Null when this slide is not that kind of slide.
 */
export function arrangeBlockSlide(
  slide: Slide,
  arrangement: BlockArrangement,
  ctx: Omit<BuildCtx, "instance">,
  words: Layer | undefined,
): Slide | null {
  const rec = slide.blocks?.length === 1 ? slide.blocks[0]! : undefined;
  if (!rec) return null;
  const plan = planFor(arrangement, marginArea(ctx.board));
  const placed = rebuildBlock(slide, rec.instance, rec.fields, ctx, plan.block);
  if (!placed) return null;
  let out: Slide = { ...placed.slide, composition: arrangement };
  if (words && plan.words && (words.text ?? "").trim()) {
    const [max, min] = rampRange(ctx.theme.ramp, plan.weight >= 700 ? "subhead" : "body", plan.size);
    const fitted = fitToBox(words.text ?? "", {
      maxWidth: plan.words.w,
      maxHeight: plan.words.h,
      sizes: ladder(max, Math.max(min, Math.round(max * 0.6))),
      lineHeight: words.lineHeight ?? 1.4,
      family: words.fontFamily ?? ctx.theme.bodyFont ?? ctx.theme.displayFont ?? "sans",
      weight: plan.weight,
    });
    const next: Layer = {
      ...words,
      x: plan.words.x,
      y: plan.words.y,
      w: plan.words.w,
      h: Math.min(plan.words.h, fitted.height),
      fontSize: fitted.fontSize,
      fontWeight: plan.weight,
    };
    out = { ...out, layers: out.layers.map((l) => (l.id === words.id ? next : l)) };
  }
  return out;
}
