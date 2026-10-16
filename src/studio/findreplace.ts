/**
 * Find and replace (24.4), in one deck or across every project in view.
 *
 * Pure: a preview is the list of matches, and the replace takes the ticked
 * ones and returns new documents, so the dialog can show exactly what will
 * change before anything does, and the caller decides how it is saved.
 *
 * Three rules:
 *
 * - A match inside a VERBATIM quote (Batch 13, 19.2) is listed but unticked by
 *   default: changing a quote makes it no longer a quote, and ticking it says
 *   so (the stamp goes, as it does when somebody types into one).
 * - A match in deck FURNITURE (Batch 20) is unticked too: a handle or a name
 *   there comes from the brand, which is the place to change it; ticking it
 *   hands that piece over to the user, as typing into it does.
 * - Replaced text goes through the pre-flight's overflow check, and a layer
 *   that fitted before and does not now is reported.
 */
import { BLOCKS } from "./blocks.js";
import type { Doc, Layer } from "./model.js";
import { markEdited, retouched } from "./regenerate.js";
import { overflowsBox } from "./text.js";

export type FindOptions = { caseSensitive?: boolean | undefined; wholeWord?: boolean | undefined };

export type Match = {
  /** Stable for one preview: `doc/layer/offset`. */
  key: string;
  docId: string;
  docName: string;
  /** 0-based. */
  slide: number;
  layerId: string;
  layerName: string;
  at: number;
  length: number;
  /** A little of the text either side, for the preview list. */
  before: string;
  found: string;
  after: string;
  verbatim: boolean;
  furniture: boolean;
  /** Ticked when the preview opens. */
  ticked: boolean;
};

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The search as a global expression. Null for an empty query. */
export function pattern(query: string, opts: FindOptions = {}): RegExp | null {
  if (!query) return null;
  const body = escape(query);
  // A word boundary that also works next to letters outside ASCII.
  const src = opts.wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
  return new RegExp(src, `gu${opts.caseSensitive ? "" : "i"}`);
}

const CONTEXT = 28;

const searchable = (l: Layer): boolean => l.kind === "text" && typeof l.text === "string" && l.text.length > 0;

/** Every match in one deck, slide by slide, top layer last as the layer list reads. */
export function findInDoc(doc: Doc, query: string, opts: FindOptions = {}): Match[] {
  const re = pattern(query, opts);
  if (!re) return [];
  const out: Match[] = [];
  doc.slides.forEach((slide, i) => {
    for (const l of slide.layers) {
      if (!searchable(l)) continue;
      const text = l.text!;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex += 1;
          continue;
        }
        const verbatim = Boolean(l.verbatim);
        const furniture = Boolean(l.furniture);
        out.push({
          key: `${doc.id}/${l.id}/${m.index}`,
          docId: doc.id,
          docName: doc.name,
          slide: i,
          layerId: l.id,
          layerName: l.name,
          at: m.index,
          length: m[0].length,
          before: text.slice(Math.max(0, m.index - CONTEXT), m.index),
          found: m[0],
          after: text.slice(m.index + m[0].length, m.index + m[0].length + CONTEXT),
          verbatim,
          furniture,
          ticked: !verbatim && !furniture,
        });
      }
    }
  });
  return out;
}

export const findAcross = (docs: readonly Doc[], query: string, opts: FindOptions = {}): Match[] =>
  docs.flatMap((d) => findInDoc(d, query, opts));

export type Overflowing = { docId: string; docName: string; slide: number; layerName: string };

export type ReplaceResult = {
  doc: Doc;
  /** Occurrences replaced. */
  replaced: number;
  /** Layers that fitted their box before and do not now. */
  overflow: Overflowing[];
};

/**
 * The deck with every ticked match replaced. A match's offset is where it
 * was found, so each layer is rewritten from its last ticked match to its
 * first and the offsets before it stay true.
 *
 * A block's layers are generated from its fields, so a replace in one also
 * goes into that block's fields; otherwise the next edit of the block would
 * rebuild the old words.
 */
export function replaceInDoc(doc: Doc, matches: readonly Match[], replacement: string, ticked: ReadonlySet<string>): ReplaceResult {
  const mine = matches.filter((m) => m.docId === doc.id && ticked.has(m.key));
  if (mine.length === 0) return { doc, replaced: 0, overflow: [] };
  const byLayer = new Map<string, Match[]>();
  for (const m of mine) byLayer.set(m.layerId, [...(byLayer.get(m.layerId) ?? []), m]);

  const overflow: Overflowing[] = [];
  let replaced = 0;
  const slides = doc.slides.map((slide, i) => {
    const touchedBlocks = new Map<string, { from: string[]; to: string }>();
    const layers = slide.layers.map((l) => {
      const ms = byLayer.get(l.id);
      if (!ms || !l.text) return l;
      let text = l.text;
      for (const m of [...ms].sort((a, b) => b.at - a.at)) {
        if (text.slice(m.at, m.at + m.length) !== m.found) continue;
        text = text.slice(0, m.at) + replacement + text.slice(m.at + m.length);
        replaced += 1;
      }
      if (text === l.text) return l;
      if (l.block) {
        const seen = touchedBlocks.get(l.block.instance) ?? { from: [], to: replacement };
        seen.from.push(...ms.map((m) => m.found));
        touchedBlocks.set(l.block.instance, seen);
      }
      const next = markEdited(retouched(l, { ...l, text }));
      if (overflowsBox(next) && !overflowsBox(l)) overflow.push({ docId: doc.id, docName: doc.name, slide: i, layerName: l.name });
      return next;
    });
    if (layers.every((l, k) => l === slide.layers[k])) return slide;
    const blocks = slide.blocks?.map((rec) => {
      const t = touchedBlocks.get(rec.instance);
      if (!t) return rec;
      const fields = { ...rec.fields };
      const spec = BLOCKS.find((b) => b.id === rec.block);
      for (const key of Object.keys(fields)) {
        // Choice fields are settings ("left", "bar"), never words to replace.
        if (spec?.fields.find((f) => f.key === key)?.kind === "choice") continue;
        for (const from of new Set(t.from)) fields[key] = fields[key]!.split(from).join(t.to);
      }
      return { ...rec, fields };
    });
    return { ...slide, layers, ...(blocks ? { blocks } : {}) };
  });

  return { doc: { ...doc, slides }, replaced, overflow };
}
