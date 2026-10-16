/**
 * Several slides at once, in the filmstrip (18.5).
 *
 * Batch 11 refused multi-slide selection for rewriting, correctly: each rewrite
 * can invalidate the next. These are the structural actions, which are well
 * defined on a set, and the rules that keep them that way:
 *
 * - A selection is a set of slide IDS, never indexes, so a reorder does not
 *   change what is selected.
 * - A set moves as a block and keeps its own internal order.
 * - Anything that changes the slide count clears the selection afterwards (the
 *   caller does that), so nobody has to guess what is still selected.
 *
 * Pure and DOM-free.
 */

import type { Slide } from "./model.js";

/** The ids in deck order, whatever order they were clicked in. */
export const inDeckOrder = (slides: readonly Slide[], ids: readonly string[]): string[] =>
  slides.filter((s) => ids.includes(s.id)).map((s) => s.id);

/** Shift-click: every slide between the anchor and this one, both included. */
export function rangeSelect(slides: readonly Slide[], anchor: string, to: string): string[] {
  const a = slides.findIndex((s) => s.id === anchor);
  const b = slides.findIndex((s) => s.id === to);
  if (a < 0 || b < 0) return b < 0 ? [] : [to];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return slides.slice(lo, hi + 1).map((s) => s.id);
}

/** Cmd or Ctrl click: in or out of the set. */
export const toggleSelect = (ids: readonly string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

/**
 * Copies of the set, in order, directly after its last slide.
 *
 * Selecting 3 to 6 and duplicating gives 3, 4, 5, 6, 3', 4', 5', 6', which is
 * what "duplicate these" means. Interleaving each copy after its original would
 * be a different action that nobody asked for.
 */
export function duplicateSet(
  slides: readonly Slide[],
  ids: readonly string[],
  copy: (s: Slide) => Slide,
): Slide[] {
  const picked = slides.filter((s) => ids.includes(s.id));
  if (picked.length === 0) return [...slides];
  const last = slides.findIndex((s) => s.id === picked.at(-1)!.id);
  return [...slides.slice(0, last + 1), ...picked.map(copy), ...slides.slice(last + 1)];
}

/** The deck without the set. A deck is never emptied: deleting every slide does nothing. */
export function deleteSet(slides: readonly Slide[], ids: readonly string[]): Slide[] {
  const kept = slides.filter((s) => !ids.includes(s.id));
  return kept.length === 0 ? [...slides] : kept;
}

/**
 * The set, as a block, landing where `target` is.
 *
 * `target` is the slide it was dropped on. Dropping onto a slide that is part
 * of the set changes nothing, and otherwise the block lands before the target
 * when moving left and after it when moving right, which is where the landing
 * line in the filmstrip draws it.
 */
export function moveSet(slides: readonly Slide[], ids: readonly string[], target: string): Slide[] {
  if (ids.includes(target)) return [...slides];
  const block = slides.filter((s) => ids.includes(s.id));
  if (block.length === 0) return [...slides];
  const rest = slides.filter((s) => !ids.includes(s.id));
  const firstPicked = slides.findIndex((s) => ids.includes(s.id));
  const targetAt = slides.findIndex((s) => s.id === target);
  const at = rest.findIndex((s) => s.id === target);
  if (at < 0) return [...slides];
  const insert = targetAt > firstPicked ? at + 1 : at;
  return [...rest.slice(0, insert), ...block, ...rest.slice(insert)];
}
