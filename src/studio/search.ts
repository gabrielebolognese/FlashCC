/**
 * Finding a carousel you made two months ago.
 *
 * The whole design decision here is WHERE the text lives. Searching slide copy
 * means having slide copy, and the project grid only holds summaries, so the
 * options were to parse every stored document on every keystroke, or to write a
 * flattened blob into the summary once when the document is saved.
 *
 * It writes the blob. A document carries its slides, its layers and its media as
 * base64, so parsing fifty of them to answer "does this contain the word pacing"
 * would make the search box feel broken at exactly the volume where search starts
 * to matter.
 *
 * The facets are DERIVED, never entered. Tagging fails in practice and not from
 * laziness, vocabulary drift is real (one asset catalogued as "blazer" by one
 * person and "sportscoat" by the next) and maintaining a taxonomy is a job small
 * teams do not have. Framework, style and format are already known for every
 * document, so the filters populate themselves and cannot rot.
 */

import { FORMATS, type Doc } from "./model.js";
import type { DocSummary } from "./storage.js";
import { STRUCTURES } from "./structures.js";
import { styleById } from "./styles.js";

/**
 * Long enough to hold a 35-slide deck's copy, short enough that fifty of them do
 * not threaten the localStorage quota the media pool is already competing for.
 */
export const MAX_BLOB = 4000;

/** Names the app gave it, rather than names a person chose. */
const AUTO_NAMES = new Set(["", "untitled", "untitled design", "blank", "deleted"]);

export function searchBlob(doc: Doc): string {
  const parts: string[] = [doc.name];

  for (const slide of doc.slides) {
    for (const layer of slide.layers) {
      const text = layer.text?.trim();
      if (text) parts.push(text);
    }
  }

  if (doc.framework) {
    parts.push(STRUCTURES.find((s) => s.id === doc.framework)?.name ?? doc.framework);
  }
  if (doc.styleId) parts.push(styleById(doc.styleId).name);
  if (doc.group) parts.push(doc.group);

  return parts.join(" ").replace(/\s+/g, " ").toLowerCase().slice(0, MAX_BLOB);
}

/**
 * Every word has to appear somewhere, in any order.
 *
 * AND rather than OR because a two-word query that returns everything matching
 * either word is indistinguishable from a broken search box, which is how most
 * people experience it.
 */
export function matchesQuery(blob: string, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every((t) => blob.includes(t));
}

export const isUnnamed = (name: string): boolean => AUTO_NAMES.has(name.trim().toLowerCase());

/** Never filed, or never really named. Both are how work goes missing. */
export const isUnfiled = (d: DocSummary): boolean => !d.group || isUnnamed(d.name);

/* ── filters ──────────────────────────────────────────────────────────────── */

export type Scope = "all" | "unfiled" | "archived";
export type Published = "any" | "yes" | "no";

export type Filters = {
  query: string;
  framework: string | null;
  style: string | null;
  /** `${w}x${h}` */
  format: string | null;
  scope: Scope;
  published: Published;
};

export const NO_FILTERS: Filters = {
  query: "",
  framework: null,
  style: null,
  format: null,
  scope: "all",
  published: "any",
};

export const isFiltering = (f: Filters): boolean =>
  f.query.trim() !== "" ||
  f.framework !== null ||
  f.style !== null ||
  f.format !== null ||
  f.scope !== "all" ||
  f.published !== "any";

export type Context = {
  /** Doc ids that have a post sitting in the posted stage. */
  publishedIds: ReadonlySet<string>;
};

export function applyFilters(
  docs: DocSummary[],
  filters: Filters,
  ctx: Context = { publishedIds: new Set() },
): DocSummary[] {
  return docs.filter((d) => {
    // Archived work is out of the way by default: it is still yours, it is just
    // not what you are looking at. Only the archived scope shows it.
    if (filters.scope === "archived") {
      if (!d.archived) return false;
    } else if (d.archived) {
      return false;
    }

    if (filters.scope === "unfiled" && !isUnfiled(d)) return false;

    if (filters.framework !== null && d.framework !== filters.framework) return false;
    if (filters.style !== null && d.styleId !== filters.style) return false;
    if (filters.format !== null && `${d.width}x${d.height}` !== filters.format) return false;

    if (filters.published !== "any") {
      const live = ctx.publishedIds.has(d.id);
      if (filters.published === "yes" && !live) return false;
      if (filters.published === "no" && live) return false;
    }

    // The blob is missing on summaries written before it existed; fall back to
    // the name so search degrades rather than silently returning nothing.
    return matchesQuery(d.search ?? d.name.toLowerCase(), filters.query);
  });
}

/* ── facets ───────────────────────────────────────────────────────────────── */

export type Facet = { id: string; label: string; count: number };

const tally = (
  docs: DocSummary[],
  key: (d: DocSummary) => string | undefined,
  label: (id: string) => string,
): Facet[] => {
  const counts = new Map<string, number>();
  for (const d of docs) {
    const id = key(d);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: label(id), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

export type Facets = {
  frameworks: Facet[];
  styles: Facet[];
  formats: Facet[];
  unfiled: number;
  archived: number;
  published: number;
};

/**
 * Counted over the ACTIVE set, not the filtered one, so the numbers do not shift
 * underneath the cursor as you narrow. A facet that reads "3" and then shows one
 * result is a bug report.
 */
export function facetsOf(docs: DocSummary[], ctx: Context = { publishedIds: new Set() }): Facets {
  const active = docs.filter((d) => !d.archived);

  const formatLabel = (id: string): string => {
    const known = FORMATS.find((f) => `${f.w}x${f.h}` === id);
    return known ? known.label : id.replace("x", " × ");
  };

  return {
    frameworks: tally(
      active,
      (d) => d.framework,
      (id) => STRUCTURES.find((s) => s.id === id)?.name ?? id,
    ),
    styles: tally(
      active,
      (d) => d.styleId,
      (id) => styleById(id).name,
    ),
    formats: tally(active, (d) => `${d.width}x${d.height}`, formatLabel),
    unfiled: active.filter(isUnfiled).length,
    archived: docs.filter((d) => d.archived).length,
    published: active.filter((d) => ctx.publishedIds.has(d.id)).length,
  };
}

/* ── naming ───────────────────────────────────────────────────────────────── */

/**
 * A name taken from the hook, cut at a word boundary.
 *
 * Slicing at a fixed character count is what the app did before and it leaves
 * names cut mid-word, which reads as broken rather than as abbreviated. Trailing
 * punctuation goes too: "Why do your edits feel slow?" is a better project name
 * than "Why do your edits feel slow?…".
 */
export function nameFromHook(hook: string, max = 48): string {
  const clean = hook.replace(/\s+/g, " ").trim();
  if (clean === "") return "Untitled";
  if (clean.length <= max) return clean.replace(/[.,;:!?\s]+$/, "") || "Untitled";

  const cut = clean.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  const words = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : clean.slice(0, max);
  return words.replace(/[.,;:!?\s]+$/, "") || "Untitled";
}

/** The first real words on the first slide. */
export function nameFromDoc(doc: Doc): string {
  const first = doc.slides[0];
  const layer = first?.layers.find((l) => l.kind === "text" && (l.text ?? "").trim() !== "");
  return nameFromHook(layer?.text ?? "");
}
