/**
 * Outline mode (24.1): the whole deck as one plain text document.
 *
 *     # Your edits feel mechanical. Here is why.
 *     # You cut on the beat
 *     The beat is the most predictable moment in the track.
 *     Predictable cuts read as *mechanical*.
 *     [Big number] number: 73% | what it means: of buyers decide on the cover
 *
 * A line starting with `#` is a slide's headline and starts a new slide; the
 * lines under it are its body. Emphasis marks (22.3) are just characters, so
 * they work here as they do on a slide. A block (Batch 19) is one labelled
 * line, `[Label] field: value | field: value`, editable in place; a list
 * field's items are separated by ` / `.
 *
 * This is NOT the paste importer coming back (Batch 16 deleted that on
 * purpose). It never creates a document: it is a second view of the one open,
 * and what it changes goes through the same restate path as a rewrite
 * (`restateMany`), so hand-edited layers are kept and the composition lays out
 * the rest.
 *
 * Pure and DOM-free, so the round trip and the diff are tested.
 */
import { blockById, BLOCKS, type Block, type Fields } from "./blocks.js";
import { insertBlock, rebuildBlock } from "./blockplace.js";
import type { BuildCtx } from "./blocks.js";
import type { BlockRecord, Doc, Slide } from "./model.js";
import type { Platform } from "./platforms.js";
import type { Theme } from "./presets.js";
import { restateMany, slideCopy, type Restatement } from "./regenerate.js";
import { overflowsBox } from "./text.js";

export type OutlineBlock = { label: string; raw: string };
export type OutlineSlide = { head: string; body: string[]; blocks: OutlineBlock[] };

/* ── to text ──────────────────────────────────────────────────────────────── */

const LIST_SEP = " / ";
const FIELD_SEP = " | ";

/** A block as its one line. Fields in the order the block declares them; empty ones left out. */
export function blockLine(rec: Pick<BlockRecord, "block" | "fields">): string {
  const block = blockById(rec.block);
  if (!block) return `[${rec.block}]`;
  const parts = block.fields
    .filter((f) => (rec.fields[f.key] ?? "").trim() !== "")
    .map((f) => `${f.label.toLowerCase()}: ${(rec.fields[f.key] ?? "").trim().split("\n").join(LIST_SEP)}`);
  return `[${block.label}]${parts.length ? ` ${parts.join(FIELD_SEP)}` : ""}`;
}

/** One slide as outline lines. */
export function slideLines(slide: Slide): string[] {
  const copy = slideCopy(slide);
  const [head = "", ...body] = copy ? copy.split("\n") : [""];
  return [`# ${head}`.trimEnd(), ...body, ...(slide.blocks ?? []).map(blockLine)];
}

export function toOutline(doc: Pick<Doc, "slides">): string {
  return doc.slides.map((s) => slideLines(s).join("\n")).join("\n");
}

/* ── from text ────────────────────────────────────────────────────────────── */

const BLOCK_LINE = /^\[([^\]]+)\]\s?(.*)$/;
const HEAD_LINE = /^#(?:\s+|$)(.*)$/;

/**
 * The outline as slides. Lines before the first `#` belong to a first slide
 * with no headline. Blank lines are ignored: a slide ends where the next `#`
 * begins, never at a gap, so a paragraph break cannot split a slide by accident.
 */
export function parseOutline(text: string, known: (label: string) => boolean = isBlockLabel): OutlineSlide[] {
  const out: OutlineSlide[] = [];
  let cur: OutlineSlide | null = null;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const head = line.match(HEAD_LINE);
    if (head) {
      cur = { head: (head[1] ?? "").trim(), body: [], blocks: [] };
      out.push(cur);
      continue;
    }
    if (!line.trim()) continue;
    if (!cur) {
      cur = { head: "", body: [], blocks: [] };
      out.push(cur);
    }
    const block = line.match(BLOCK_LINE);
    if (block && known(block[1]!.trim())) cur.blocks.push({ label: block[1]!.trim(), raw: line.trim() });
    else cur.body.push(line.trim());
  }
  return out;
}

const isBlockLabel = (label: string): boolean => blockByLabel(label) !== undefined;

/** A block by its label or its id, either way round: every one of both is unique. */
const blockByLabel = (label: string): Block | undefined => {
  const want = label.trim().toLowerCase();
  return BLOCKS.find((b) => b.id === want || b.label.toLowerCase() === want);
};

/** A slide's copy, as generation reads it: the headline, then the body lines. */
export const copyOf = (s: OutlineSlide): string => [s.head, ...s.body].filter((l, i) => i === 0 || l).join("\n").trim();

/**
 * A block line's fields, read back. Unknown names are ignored; a field the
 * line does not mention keeps its value, so deleting a field from the line
 * never blanks it by accident. Null when the label is not a block.
 */
export function parseBlockLine(raw: string, previous: Fields = {}): { block: string; fields: Fields } | null {
  const m = raw.match(BLOCK_LINE);
  const block = m ? blockByLabel(m[1]!) : undefined;
  if (!m || !block) return null;
  const fields: Fields = { ...previous };
  const rest = (m[2] ?? "").trim();
  if (rest) {
    for (const part of rest.split(FIELD_SEP)) {
      const at = part.indexOf(":");
      if (at < 0) continue;
      const name = part.slice(0, at).trim().toLowerCase();
      const spec = block.fields.find((f) => f.label.toLowerCase() === name || f.key.toLowerCase() === name);
      if (!spec) continue;
      const value = part.slice(at + 1).trim();
      fields[spec.key] = spec.kind === "lines" || (previous[spec.key] ?? "").includes("\n") ? value.split(LIST_SEP).join("\n") : value;
    }
  }
  return { block: block.id, fields };
}

/* ── what changed ─────────────────────────────────────────────────────────── */

/** A slide's identity for matching: its copy and its block lines. */
const keyOf = (s: OutlineSlide): string => [copyOf(s), ...s.blocks.map((b) => b.raw)].join("\u0000");

export type OutlinePlan = {
  /** One row per slide of the deck to be, in order. */
  rows: (Restatement & { blocks: OutlineBlock[]; blocksChanged: boolean })[];
  /** Slides of the current deck the outline no longer has. */
  removed: number[];
  /** The slide count changed. */
  structural: boolean;
};

/**
 * Matches the typed outline against the deck's own.
 *
 * Same count: slide for slide, by position, exactly as Batch 11 applies a
 * rewrite. A different count (a `#` added or deleted): the slides that are
 * unchanged are found by a longest-common-subsequence match, and the changed
 * stretches between them are paired by position, the surplus being new or
 * removed slides. Position is then all there is to go on, which is why the
 * deck is free-form for slot purposes from that edit on (`slotAt` already
 * refuses a count that does not match the structure).
 */
export function planOutline(doc: Pick<Doc, "slides">, typed: readonly OutlineSlide[]): OutlinePlan {
  const base = doc.slides.map((s) => parseOutline(slideLines(s).join("\n"))[0] ?? { head: "", body: [], blocks: [] });
  const row = (from: number | null, t: OutlineSlide) => {
    const was = from === null ? undefined : base[from];
    return {
      from,
      text: copyOf(t),
      changed: !was || copyOf(was) !== copyOf(t),
      blocks: t.blocks,
      blocksChanged: (was?.blocks.map((b) => b.raw).join("\n") ?? "") !== t.blocks.map((b) => b.raw).join("\n"),
    };
  };

  if (base.length === typed.length) {
    return { rows: typed.map((t, i) => row(i, t)), removed: [], structural: false };
  }

  // Longest common subsequence on whole slides.
  const a = base.map(keyOf);
  const b = typed.map(keyOf);
  const L: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1)
    for (let j = b.length - 1; j >= 0; j -= 1)
      L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);

  const rows: OutlinePlan["rows"] = [];
  const removed: number[] = [];
  let i = 0;
  let j = 0;
  /** Changed stretch: base[i0..i1) against typed[j0..j1), paired by position. */
  const stretch = (i0: number, i1: number, j0: number, j1: number) => {
    for (let k = 0; k < j1 - j0; k += 1) rows.push(row(i0 + k < i1 ? i0 + k : null, typed[j0 + k]!));
    for (let k = j1 - j0; k < i1 - i0; k += 1) removed.push(i0 + k);
  };
  let i0 = 0;
  let j0 = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      stretch(i0, i, j0, j);
      rows.push(row(i, typed[j]!));
      i += 1;
      j += 1;
      i0 = i;
      j0 = j;
    } else if (L[i + 1]![j]! >= L[i]![j + 1]!) i += 1;
    else j += 1;
  }
  stretch(i0, a.length, j0, b.length);
  return { rows, removed, structural: true };
}

/* ── applying it ──────────────────────────────────────────────────────────── */

export type OutlineResult = {
  doc: Doc;
  /** Slides (1-based, in the new deck) whose words changed. */
  changed: number[];
  /** Slides whose new words do not fit where they landed: split them with a new `#` line. */
  overflow: number[];
  /** Block lines that could not be placed, said rather than dropped silently. */
  notes: string[];
  structural: boolean;
};

export type BlockContext = Omit<BuildCtx, "instance" | "board">;

/**
 * The deck the outline describes, from the deck that is open.
 *
 * Slides whose words are unchanged are kept exactly as they are, including
 * every layer on them; changed ones go through `restateMany`. An outline with
 * no slides at all changes nothing: clearing the text box is not how a deck
 * is deleted.
 */
export function applyOutline(
  doc: Doc,
  text: string,
  theme: Theme,
  ctx: BlockContext,
  instance: () => string,
  platform?: Platform | undefined,
): OutlineResult {
  const typed = parseOutline(text);
  if (typed.length === 0) return { doc, changed: [], overflow: [], notes: ["An outline needs at least one # line."], structural: false };
  const plan = planOutline(doc, typed);
  if (!plan.structural && plan.rows.every((r) => !r.changed && !r.blocksChanged)) {
    return { doc, changed: [], overflow: [], notes: [], structural: false };
  }

  const restated = restateMany(doc, plan.rows, theme);
  let next = restated.doc;
  const notes: string[] = [];
  const touched = new Set(restated.rebuilt);

  plan.rows.forEach((row, i) => {
    if (!row.blocksChanged) return;
    touched.add(i);
    const r = applyBlockLines(next, i, row.blocks, ctx, instance, platform);
    next = r.doc;
    notes.push(...r.notes);
  });

  const overflow = [...touched]
    .filter((i) => {
      const s = next.slides[i];
      return s?.layers.some(
        (l) => l.kind === "text" && l.visible && (overflowsBox(l) || l.y + l.h > next.height + 0.5 || l.y < -0.5),
      );
    })
    .map((i) => i + 1)
    .sort((a, b) => a - b);

  return {
    doc: next,
    changed: [...touched].map((i) => i + 1).sort((a, b) => a - b),
    overflow,
    notes,
    structural: plan.structural,
  };
}

/**
 * A slide's block lines, applied: the k-th line goes to the k-th block on
 * the slide. Same block, new fields: rebuilt in place (19.8's rule, so a part
 * the user moved or restyled keeps what they did). A line with no block
 * behind it inserts one where there is room. A block whose line was deleted
 * goes, with its layers.
 */
function applyBlockLines(
  doc: Doc,
  index: number,
  lines: readonly OutlineBlock[],
  ctx: BlockContext,
  instance: () => string,
  platform: Platform | undefined,
): { doc: Doc; notes: string[] } {
  const notes: string[] = [];
  const board = { w: doc.width, h: doc.height };
  const records = doc.slides[index]?.blocks ?? [];
  let slide = doc.slides[index]!;
  const set = (s: Slide) => {
    slide = s;
  };

  const remove = (rec: BlockRecord) =>
    set({
      ...slide,
      layers: slide.layers.filter((l) => l.block?.instance !== rec.instance),
      blocks: (slide.blocks ?? []).filter((b) => b.instance !== rec.instance),
    });

  const inserts: { block: string; fields: Fields }[] = [];
  const count = Math.max(lines.length, records.length);
  for (let k = 0; k < count; k += 1) {
    const line = lines[k];
    const rec = records[k];
    const parsed = line ? parseBlockLine(line.raw, rec && blockByLabel(line.label)?.id === rec.block ? rec.fields : {}) : null;
    if (rec && parsed && parsed.block === rec.block) {
      if (blockLine({ block: rec.block, fields: parsed.fields }) === blockLine(rec)) continue;
      const r = rebuildBlock(slide, rec.instance, parsed.fields, { ...ctx, board });
      if (r) set(r.slide);
      continue;
    }
    if (rec) remove(rec);
    if (parsed) inserts.push(parsed);
  }

  let out: Doc = { ...doc, slides: doc.slides.map((s, i) => (i === index ? slide : s)) };
  for (const ins of inserts) {
    const r = insertBlock(out, index, ins.block, ins.fields, ctx, "here", instance, platform);
    if (r.ok) out = r.doc;
    else notes.push(`No room for the ${blockById(ins.block)?.label ?? ins.block} on slide ${index + 1}. Give it a slide of its own.`);
  }
  return { doc: out, notes };
}
