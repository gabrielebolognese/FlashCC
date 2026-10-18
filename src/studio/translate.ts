/**
 * One deck, several languages (Batch 29), the client half.
 *
 * The route returns words. Everything else is here, and is the machinery
 * every other source of words already goes through: `restateMany` lays the
 * translated copy out (or writes it onto a slide whose copy somebody edited),
 * `rebuildBlock` puts translated fields back into a block, and a slide that
 * runs long in the new language is SPLIT, never shrunk (29.2, Batch 4.5's
 * rule). The report says what changed: "8 slides became 9 in German, slide 4
 * was split".
 *
 * **A translation is its own document** with `variantOf` pointing home and
 * `language` naming it (29.5, the 17.5 pattern). Editing the original reaches
 * no translation. Re-translate is the explicit way, one shot, and it keeps
 * every slide somebody edited since: each translated slide carries a stamp of
 * what the translation left on it, and a slide that no longer matches is
 * theirs.
 *
 * **A quote is no longer verbatim once translated.** It is translated,
 * labelled as a translation under the attribution, loses the flag, and keeps
 * its original fields one click from coming back (`restoreOriginal`).
 */
import { authHeader } from "./bearer.js";
import { blockById, COLUMN_PRESETS, type Fields } from "./blocks.js";
import { rebuildBlock } from "./blockplace.js";
import { brandIdOf, hasVoice, type Brand, type Voice } from "./brand.js";
import { readRefusal } from "./gate.js";
import { languageByCode, translationLabel, type GlossaryTerm } from "./languages.js";
import type { Doc, Identity, Slide } from "./model.js";
import type { Theme } from "./presets.js";
import { copyLayers, restateMany, slideCopy, type Restatement } from "./regenerate.js";
import { splitInTwo, splitSlide } from "./split.js";
import { layerLines } from "./text.js";

/* ── which block fields are words ─────────────────────────────────────────── */

/**
 * The fields of each block that a reader reads as words, and how they are
 * laid out. A name ("by", "name"), a figure, a link, code and a chart's data
 * are not here: they are never translated. "cells" is one row per line with
 * cells split on "|", each cell its own unit; `from` skips leading cells that
 * are not words (an icon's name).
 */
type WordField = { key: string; as: "text" | "lines" | "cells"; from?: number | undefined };

export const WORD_FIELDS: Record<string, WordField[]> = {
  checklist: [{ key: "items", as: "lines" }],
  steps: [{ key: "items", as: "lines" }],
  stat: [{ key: "label", as: "text" }],
  quote: [{ key: "text", as: "text" }],
  compare: [
    { key: "left", as: "text" },
    { key: "right", as: "text" },
    { key: "rows", as: "cells" },
  ],
  "before-after": [
    { key: "left", as: "text" },
    { key: "right", as: "text" },
    { key: "leftText", as: "text" },
    { key: "rightText", as: "text" },
  ],
  timeline: [{ key: "points", as: "cells" }],
  table: [{ key: "rows", as: "cells" }],
  "post-card": [{ key: "text", as: "text" }],
  testimonial: [
    { key: "words", as: "text" },
    { key: "role", as: "text" },
  ],
  annotation: [{ key: "note", as: "text" }],
  "icon-grid": [{ key: "items", as: "cells", from: 1 }],
  question: [
    { key: "prompt", as: "text" },
    { key: "options", as: "lines" },
  ],
  section: [{ key: "title", as: "text" }],
};

/** Somebody's words: translated, labelled, and the original kept. */
const QUOTED: Record<string, { label: string; fallback: string }> = {
  quote: { label: "by", fallback: "by" },
  testimonial: { label: "role", fallback: "name" },
};

/** A checklist line's cross ("x ") is a mark, not a word. */
const CROSS = /^x\s+/i;

/** One unit of a block's words, and where it goes back. */
export type FieldUnit = { slide: number; instance: string; key: string; line?: number | undefined; cell?: number | undefined; text: string };

const hasWords = (t: string): boolean => /\p{L}/u.test(t);

/** A block's fields with the column preset's headings made explicit, so they can be translated. */
function wordsOf(block: string, fields: Fields): Fields {
  if (block !== "compare") return fields;
  const preset = COLUMN_PRESETS[fields.preset ?? ""];
  return preset ? { ...fields, left: preset[0], right: preset[1] } : fields;
}

function fieldUnits(slide: Slide, at: number): FieldUnit[] {
  const out: FieldUnit[] = [];
  for (const rec of slide.blocks ?? []) {
    const spec = WORD_FIELDS[rec.block];
    if (!spec) continue;
    const fields = wordsOf(rec.block, rec.fields);
    for (const f of spec) {
      const value = fields[f.key] ?? "";
      if (f.as === "text") {
        if (hasWords(value)) out.push({ slide: at, instance: rec.instance, key: f.key, text: value.trim() });
        continue;
      }
      value.split("\n").forEach((line, li) => {
        if (f.as === "lines") {
          const words = line.replace(CROSS, "");
          if (hasWords(words)) out.push({ slide: at, instance: rec.instance, key: f.key, line: li, text: words.trim() });
          return;
        }
        line.split("|").forEach((cell, ci) => {
          if (ci < (f.from ?? 0) || !hasWords(cell)) return;
          out.push({ slide: at, instance: rec.instance, key: f.key, line: li, cell: ci, text: cell.trim() });
        });
      });
    }
  }
  return out;
}

/** What goes to the route: each slide's copy, positionally, and the words inside its blocks. */
export function unitsOf(doc: Doc): { deck: string[]; fields: FieldUnit[] } {
  return {
    deck: doc.slides.map(slideCopy),
    fields: doc.slides.flatMap((s, i) => fieldUnits(s, i)),
  };
}

/** A block's fields with its translated units written back in. */
function fieldsWith(block: string, fields: Fields, units: readonly (FieldUnit & { out: string })[], target: string): Fields {
  const next: Fields = { ...wordsOf(block, fields) };
  if (block === "compare" && COLUMN_PRESETS[fields.preset ?? ""]) next.preset = "Custom";
  for (const key of new Set(units.map((u) => u.key))) {
    const mine = units.filter((u) => u.key === key);
    const whole = mine.find((u) => u.line === undefined);
    if (whole) {
      next[key] = whole.out;
      continue;
    }
    const lines = (next[key] ?? "").split("\n");
    for (const u of mine) {
      const line = lines[u.line!] ?? "";
      if (u.cell === undefined) {
        const cross = line.match(CROSS)?.[0] ?? "";
        lines[u.line!] = `${cross}${u.out}`;
      } else {
        const cells = line.split("|").map((c) => c.trim());
        cells[u.cell] = u.out;
        lines[u.line!] = cells.join(" | ");
      }
    }
    next[key] = lines.join("\n");
  }
  const quoted = QUOTED[block];
  if (quoted) {
    const label = translationLabel(target);
    const into = (next[quoted.label] ?? "").trim() ? quoted.label : quoted.fallback;
    next[into] = `${(next[into] ?? "").trim()} ${label}`.trim();
  }
  return next;
}

/* ── the call ─────────────────────────────────────────────────────────────── */

export type TranslateFinding = { at: number; tier: "flag" | "retry" | "repair"; code: string; message: string; detail?: string | undefined };

export type Translated = { slides: string[]; fields: string[]; findings: TranslateFinding[] };

export type TranslateAsk = {
  doc: Doc;
  target: string;
  voice?: Voice | undefined;
  glossary?: readonly GlossaryTerm[] | undefined;
  /** Names kept as written: the author, the brand. */
  keep?: readonly string[] | undefined;
};

export async function requestTranslation(ask: TranslateAsk, signal?: AbortSignal): Promise<Translated> {
  const { deck, fields } = unitsOf(ask.doc);
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: await authHeader(),
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      deck,
      fields: fields.map((f) => f.text),
      target: ask.target,
      ...(hasVoice(ask.voice) ? { voice: ask.voice } : {}),
      ...(ask.glossary?.length ? { glossary: ask.glossary } : {}),
      ...(ask.keep?.length ? { keep: ask.keep } : {}),
    }),
  });
  if (!res.ok) throw await readRefusal(res);
  const body = (await res.json().catch(() => null)) as Partial<Translated> | null;
  if (!Array.isArray(body?.slides) || body.slides.length !== deck.length || !Array.isArray(body.fields) || body.fields.length !== fields.length) {
    throw new Error("The translation came back the wrong shape");
  }
  return { slides: body.slides, fields: body.fields, findings: Array.isArray(body.findings) ? body.findings : [] };
}

/**
 * The brand a deck's glossary and voice come from: the one it was styled
 * with, else the one its client owns. None otherwise; a guessed glossary
 * would hold another brand's terms.
 */
export function brandFor(doc: Doc, brands: readonly Brand[]): Brand | undefined {
  const id = doc.styleId ? brandIdOf(doc.styleId) : null;
  return (id ? brands.find((b) => b.id === id) : undefined) ?? (doc.clientId ? brands.find((b) => b.clientId === doc.clientId) : undefined);
}

/**
 * The names that must never be translated, from what the deck already knows:
 * its author's name and the brand's name. Handles and links are masked by
 * their shape and need no list.
 */
export function keepFor(doc: Doc, brandName?: string | undefined): string[] {
  const identity: Identity | undefined = doc.furniture?.identity;
  return [identity?.name, brandName].map((n) => (n ?? "").trim()).filter((n, i, all) => n && all.indexOf(n) === i);
}

/**
 * The brand's voice for a target: tone and banned words always, and its
 * samples only when they are written in the target's script, since a sample
 * in another language teaches rhythm the translation cannot use. A Latin
 * target cannot be told apart from English by its letters, so its samples
 * stay home (D57).
 */
export function voiceFor(voice: Voice | undefined, target: string): Voice | undefined {
  if (!voice) return undefined;
  const lang = languageByCode(target);
  const script = lang && lang.script !== "latin" ? SCRIPT_TEST[lang.script] : undefined;
  const samples = script ? (voice.samples ?? []).filter((s) => script.test(s)) : [];
  return {
    ...(voice.tone ? { tone: voice.tone } : {}),
    ...(voice.avoid?.length ? { avoid: voice.avoid } : {}),
    ...(samples.length ? { samples } : {}),
  };
}

const SCRIPT_TEST: Record<string, RegExp> = {
  cyrillic: /[Ѐ-ӿ]/,
  greek: /[Ͱ-Ͽ]/,
  arabic: /[؀-ۿ]/,
  hebrew: /[֐-׿]/,
  japanese: /[぀-ヿ]/,
  chinese: /[一-鿿]/,
  korean: /[가-힯]/,
};

/* ── laying it out ────────────────────────────────────────────────────────── */

/** The compositions' vertical margin (MY in compositions.ts): copy past it is crowding the slide. */
const MARGIN_Y = 140;

/**
 * How much smaller than the original's type a translated slide may be set
 * before it is given another slide instead: `MAX_SHRINK_STEPS` on the
 * compositions' ladders, which split.ts puts at roughly 10 to 12 percent.
 */
export const SHRINK_ALLOWANCE = 0.12;

/** What a translated slide is measured against: the original's main copy, and the layout it was in. */
export type Reference = { size: number; composition?: string | undefined };

export const referenceOf = (slide: Slide): Reference | undefined => {
  const main = copyLayers(slide)[0];
  return main?.fontSize ? { size: main.fontSize, composition: slide.composition } : undefined;
};

/**
 * A slide whose copy no longer fits: a copy layer that needs more lines than
 * its box holds, a generated one grown past the board's margin, or (against
 * the original, in the same layout) type set smaller than the allowance lets
 * it shrink. A layer somebody placed is judged by its own box only; where
 * they put it and what size they chose are theirs.
 */
export function crowded(slide: Slide, height: number, ref?: Reference | undefined): boolean {
  const copy = copyLayers(slide);
  const overflows = copy.some((l) => {
    const size = l.fontSize ?? 0;
    if (size > 0 && layerLines(l, size, l.w) * size * (l.lineHeight ?? 1.2) > l.h + 1) return true;
    return !l.handEdited && (l.y < MARGIN_Y - 0.5 || l.y + l.h > height - MARGIN_Y + 0.5);
  });
  if (overflows) return true;
  const main = copy[0];
  return Boolean(
    ref && main && !main.handEdited && slide.composition === ref.composition && (main.fontSize ?? 0) < ref.size * (1 - SHRINK_ALLOWANCE),
  );
}

const handEdits = (slide: Slide): number => slide.layers.filter((l) => l.handEdited).length;

const stamp = (slide: Slide, source: string): Slide => {
  const { alt: _alt, ...rest } = slide;
  return { ...rest, translation: { source, copy: slideCopy(slide), edited: handEdits(slide) } };
};

export type TranslationReport = {
  /** Slides in the source, and in the translation. */
  from: number;
  to: number;
  /** 1-based numbers of the source slides that became more than one. */
  split: number[];
  /** Source slides too long to split anywhere sensible, left long. */
  long: number[];
  /** Block parts whose translated words do not fit, by slide. */
  blocks: number[];
  /** The route's flags, by 1-based slide. */
  flags: { slide: number; message: string }[];
};

export type ApplyOptions = {
  target: string;
  theme: Theme;
  id: string;
  now?: string | undefined;
};

/**
 * The translated deck, laid out: block words first (so a slot block lays out
 * with them), then every slide's copy through `restateMany`, then any slide
 * crowded in the new language split in two until none is.
 */
export function applyTranslation(source: Doc, t: Translated, opts: ApplyOptions): { doc: Doc; report: TranslationReport } {
  const now = opts.now ?? new Date().toISOString();
  const lang = languageByCode(opts.target);
  const { fields: units } = unitsOf(source);
  const { series: _series, ...rest } = source;

  // 1. Block words, each block rebuilt with them, the original kept on a quote.
  const outs = units.map((u, i) => ({ ...u, out: t.fields[i] ?? u.text }));
  const blocks: number[] = [];
  const ctx = {
    theme: opts.theme,
    board: { w: source.width, h: source.height },
    ...(source.furniture?.identity ? { identity: source.furniture.identity } : {}),
    ...(source.quotes?.length ? { quotes: source.quotes } : {}),
  };
  let slides = source.slides.map((slide, i) => {
    let next = slide;
    for (const rec of slide.blocks ?? []) {
      const mine = outs.filter((u) => u.slide === i && u.instance === rec.instance);
      if (!mine.length || !blockById(rec.block)) continue;
      const fields = fieldsWith(rec.block, rec.fields, mine, opts.target);
      const r = rebuildBlock(next, rec.instance, fields, ctx);
      if (!r) continue;
      if (r.built.overflow.length) blocks.push(i + 1);
      const keep = QUOTED[rec.block] ? { original: rec.original ?? rec.fields } : {};
      next = { ...r.slide, blocks: (r.slide.blocks ?? []).map((b) => (b.instance === rec.instance ? { ...b, ...keep } : b)) };
    }
    return next;
  });

  let doc: Doc = {
    ...rest,
    id: opts.id,
    name: `${source.name} (${lang?.native ?? opts.target})`,
    language: opts.target,
    variantOf: source.id,
    slides,
    createdAt: now,
    updatedAt: now,
  };

  // 2. Every slide's copy.
  const plan: Restatement[] = doc.slides.map((s, i) => {
    const text = t.slides[i] ?? slideCopy(s);
    return { from: i, text, changed: text !== slideCopy(s) };
  });
  // Each slide keeps the layout it had: the cycle is seeded from the words,
  // and new words would otherwise deal the deck a different hand.
  doc = restateMany(doc, plan, opts.theme, { compositions: doc.slides.map((s) => s.composition) }).doc;
  doc = { ...doc, slides: doc.slides.map((s, i) => stamp(s, source.slides[i]!.id)) };

  // 3. Longer languages get more room, not smaller type.
  const long = new Set<string>();
  const refs = new Map(source.slides.map((s) => [s.id, referenceOf(s)]));
  // The cover is split only when it truly overflows: a hook in two halves is
  // no hook, and a slightly smaller cover headline still reads.
  const coverId = source.slides[0]?.id;
  const refFor = (s: Slide): Reference | undefined =>
    s.translation && s.translation.source !== coverId ? refs.get(s.translation.source) : undefined;
  for (let guard = 0; guard < 40; guard += 1) {
    const j = doc.slides.findIndex((s) => crowded(s, doc.height, refFor(s)) && !long.has(s.id));
    if (j < 0) break;
    const slide = doc.slides[j]!;
    const from = slide.translation!.source;
    const written = copyLayers(slide).some((l) => l.handEdited);
    if (written) {
      // Somebody's own box: the same slide twice, half the words on each.
      const next = splitSlide(doc, j);
      if (next.slides.length === doc.slides.length) {
        long.add(slide.id);
        continue;
      }
      doc = { ...next, slides: next.slides.map((s, k) => (k === j || k === j + 1 ? stamp(s, from) : s)) };
      continue;
    }
    const halves = splitInTwo(slideCopy(slide));
    if (!halves) {
      long.add(slide.id);
      continue;
    }
    const rows: Restatement[] = doc.slides.flatMap((s, k): Restatement[] =>
      k === j
        ? [
            { from: k, text: halves[0], changed: true },
            { from: null, text: halves[1], changed: true },
          ]
        : [{ from: k, text: slideCopy(s), changed: false }],
    );
    // The second half continues the first in the same layout, unless that
    // layout is the cover's.
    const comps = doc.slides.flatMap((s, k) => (k === j ? [s.composition, s.composition === "title" ? undefined : s.composition] : [s.composition]));
    const laid = restateMany(doc, rows, opts.theme, { compositions: comps }).doc;
    const tail = laid.slides[j + 1]!;
    // The new half looks like the slide it came from: its ground, not the theme's.
    // Built fresh, so its ids are already its own.
    const dressed: Slide = {
      ...tail,
      name: `${slide.name} (2)`,
      background: slide.background,
      ...(slide.gradient ? { gradient: slide.gradient } : { gradient: undefined }),
      ...(slide.image ? { image: slide.image } : {}),
      ...(slide.texture ? { texture: slide.texture } : {}),
    };
    doc = {
      ...laid,
      slides: laid.slides.map((s, k) => (k === j ? stamp(s, from) : k === j + 1 ? stamp(dressed, from) : s)),
    };
  }

  const sourceIndex = new Map(source.slides.map((s, i) => [s.id, i + 1]));
  const pieces = new Map<string, number>();
  for (const s of doc.slides) if (s.translation) pieces.set(s.translation.source, (pieces.get(s.translation.source) ?? 0) + 1);
  const split = [...pieces.entries()].filter(([, n]) => n > 1).map(([id]) => sourceIndex.get(id)!).sort((a, b) => a - b);
  const longNumbers = doc.slides.filter((s) => long.has(s.id)).map((s) => sourceIndex.get(s.translation?.source ?? "") ?? 0).filter(Boolean);

  return {
    doc,
    report: {
      from: source.slides.length,
      to: doc.slides.length,
      split,
      long: [...new Set(longNumbers)],
      blocks: [...new Set(blocks)],
      flags: flagsBySlide(t.findings, units, source.slides.length),
    },
  };
}

/**
 * The route's findings, on the slide a person would look at. A finding's `at`
 * is the unit's index: the slides first, then the block fields in the order
 * `unitsOf` lists them.
 */
function flagsBySlide(findings: readonly TranslateFinding[], units: readonly FieldUnit[], slides: number): { slide: number; message: string }[] {
  return findings
    .filter((f) => f.tier === "flag")
    .map((f) => ({ slide: f.at < slides ? f.at + 1 : (units[f.at - slides]?.slide ?? 0) + 1, message: f.message }));
}

/** "8 slides became 9 in German, slide 4 was split." Or that nothing moved. */
export function reportLine(r: TranslationReport, target: string): string {
  const name = languageByCode(target)?.name ?? target;
  const list = (ns: number[]) => (ns.length === 1 ? `slide ${ns[0]} was` : `slides ${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]} were`);
  if (r.to === r.from) return `${r.from} slides in ${name}, the same as the original.`;
  return `${r.from} slides became ${r.to} in ${name}, ${list(r.split)} split.`;
}

/* ── the set ──────────────────────────────────────────────────────────────── */

/** The original a deck belongs to: itself, or the deck it was translated from. */
export const originalOf = (doc: Doc, docs: readonly Doc[]): Doc =>
  doc.language && doc.variantOf ? (docs.find((d) => d.id === doc.variantOf) ?? doc) : doc;

/** The original and every translation of it, original first, then by language name. */
export function languageSet(doc: Doc, docs: readonly Doc[]): Doc[] {
  const original = originalOf(doc, docs);
  const translations = docs
    .filter((d) => d.variantOf === original.id && d.language && !d.archived)
    .sort((a, b) => (languageByCode(a.language)?.name ?? "").localeCompare(languageByCode(b.language)?.name ?? ""));
  return [original, ...translations];
}

/** The folder a deck's files go in when the set exports together. */
export const languageFolder = (doc: Doc): string => doc.language ?? "original";

/* ── re-translate, keeping hand edits ─────────────────────────────────────── */

/** True when somebody changed a translated slide since: its words, or a layer they edited. */
export const editedSince = (slide: Slide): boolean =>
  !slide.translation || slideCopy(slide) !== slide.translation.copy || handEdits(slide) > slide.translation.edited;

/**
 * A fresh translation of the original merged into the existing one: a source
 * slide whose translated pieces nobody touched takes the fresh pieces; one
 * somebody edited keeps theirs exactly; a slide they added by hand stays where
 * it was. Same id, same name, same language: it is the same document.
 */
export function retranslate(variant: Doc, fresh: Doc): { doc: Doc; kept: number; replaced: number } {
  const groups = new Map<string, Slide[]>();
  for (const s of variant.slides) {
    if (!s.translation) continue;
    groups.set(s.translation.source, [...(groups.get(s.translation.source) ?? []), s]);
  }
  const freshGroups = new Map<string, Slide[]>();
  for (const s of fresh.slides) freshGroups.set(s.translation!.source, [...(freshGroups.get(s.translation!.source) ?? []), s]);

  let kept = 0;
  let replaced = 0;
  const out: Slide[] = [];
  const emitted = new Set<string>();
  // The fresh deck's order is the original's order.
  for (const [source, pieces] of freshGroups) {
    const mine = groups.get(source);
    if (mine && mine.some(editedSince)) {
      out.push(...mine);
      kept += 1;
    } else {
      out.push(...pieces);
      replaced += 1;
    }
    emitted.add(source);
  }
  // Slides added by hand, and edited slides whose source is gone, after the
  // slide they followed.
  variant.slides.forEach((s, i) => {
    const orphan = !s.translation || (!emitted.has(s.translation.source) && editedSince(s));
    if (!orphan) return;
    const before = variant.slides.slice(0, i).reverse().find((p) => out.includes(p) || (p.translation && freshGroups.has(p.translation.source)));
    const at = before
      ? (() => {
          const src = before.translation?.source;
          let last = -1;
          out.forEach((o, k) => {
            if (o === before || (src && o.translation?.source === src)) last = k;
          });
          return last + 1;
        })()
      : 0;
    out.splice(at, 0, s);
    if (s.translation) kept += 1;
  });

  return {
    doc: { ...fresh, id: variant.id, name: variant.name, createdAt: variant.createdAt, slides: out },
    kept,
    replaced,
  };
}

/* ── the original, one click away ─────────────────────────────────────────── */

/** A translated quote or testimonial back to its original words, verbatim again if they were. */
export function restoreOriginal(doc: Doc, slideIndex: number, instance: string, theme: Theme): Doc {
  const slide = doc.slides[slideIndex];
  const rec = slide?.blocks?.find((b) => b.instance === instance);
  if (!slide || !rec?.original) return doc;
  const r = rebuildBlock(slide, instance, rec.original, {
    theme,
    board: { w: doc.width, h: doc.height },
    ...(doc.furniture?.identity ? { identity: doc.furniture.identity } : {}),
    ...(doc.quotes?.length ? { quotes: doc.quotes } : {}),
  });
  if (!r) return doc;
  const next = { ...r.slide, blocks: (r.slide.blocks ?? []).map((b) => (b.instance === instance ? { ...b, original: undefined } : b)) };
  return { ...doc, slides: doc.slides.map((s, i) => (i === slideIndex ? next : s)) };
}
