/**
 * Re-running generation without losing what you changed by hand.
 *
 * The batch job stays OUTSIDE the document. A re-run is a fresh one-shot
 * generation that happens to skip layers you have touched, not a live binding,
 * not a template the document keeps referring back to. That distinction is the
 * whole "nothing is derived" invariant: what is stored is what renders, and a
 * regenerated layer is as ordinary as one you drew.
 *
 * A layer counts as yours the moment you edit it. Nothing infers intent from the
 * content, inferring would mean a layer you deliberately restored to its
 * original colour silently loses its protection.
 */

import { buildSlides, type BuildOptions } from "./compositions.js";
import type { Doc, Layer, Slide } from "./model.js";
import type { Theme } from "./presets.js";

/** The copy a document currently carries, one entry per slide. */
/**
 * Layers a regeneration must leave exactly as they are: anything the user
 * changed, every block (Batch 19, placed by the user, not by the generator),
 * and stamped furniture (Batch 20, which reseal looks after).
 */
export const survivesRegeneration = (l: Layer): boolean =>
  // A slot's block is the generator's own output and is rebuilt; a block the
  // user inserted is theirs and is kept.
  Boolean(l.handEdited || (l.block && !l.block.slot) || l.furniture || l.furnitureOptOut);

/**
 * The slot blocks a document carries, by position, to hand back to generation
 * so Re-lay lays a big number out as a big number again.
 */
function fillsOf(doc: Doc): BuildOptions["fillsAt"] {
  const out = doc.slides.map((s) => {
    const rec = s.blocks?.find((b) => b.slot);
    return rec ? { id: rec.block, fields: rec.fields } : undefined;
  });
  return out.some(Boolean) ? out : undefined;
}

const withFills = (doc: Doc, options: BuildOptions): BuildOptions => {
  const fillsAt = fillsOf(doc);
  return fillsAt ? { ...options, fillsAt } : options;
};

export function textsOf(doc: Doc): string[] {
  return doc.slides.map((slide) => {
    // The slide's own copy only. A block's words and a counter's "3 / 10" are
    // not what the slide says, and feeding them back into generation would lay
    // them out a second time as body text.
    const texts = slide.layers.filter(
      (l) => l.kind === "text" && (l.text ?? "").trim() !== "" && !l.block && !l.furniture && !l.furnitureOptOut,
    );
    if (texts.length === 0) return "";
    // Biggest first, then the rest, which reassembles "heading. body" the way
    // the splitter produced it.
    const sorted = [...texts].sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0));
    return sorted.map((l) => (l.text ?? "").trim()).join("\n");
  });
}

export type MergeResult = { doc: Doc; replaced: number; kept: number };

/**
 * Lays the same words out again, keeping every layer marked as hand-edited.
 *
 * Kept layers are carried across by id, in their current position, on top of the
 * new arrangement. They are deliberately appended rather than slotted into their
 * old z-position: the regenerated layers underneath are a different set, so
 * there is no old position to honour, and a hand-placed layer sinking behind new
 * artwork is the worse surprise.
 */
export function mergeRegenerated(doc: Doc, fresh: Slide[]): MergeResult {
  let replaced = 0;
  let kept = 0;

  const slides = fresh.map((slide, i) => {
    const old = doc.slides[i];
    const mine = (old?.layers ?? []).filter(survivesRegeneration);
    kept += mine.length;
    replaced += slide.layers.length;
    // The fresh slide's own slot block, plus whatever the user placed.
    const blocks = [...(slide.blocks ?? []), ...(old?.blocks ?? []).filter((b) => !b.slot)];
    return {
      ...slide,
      ...(blocks.length > 0 ? { blocks } : {}),
      layers: [...slide.layers, ...mine],
    };
  });

  // A shorter regeneration would strand hand-edited layers on slides that no
  // longer exist, so anything past the new end is appended to the last slide
  // rather than dropped.
  const orphans = doc.slides.slice(fresh.length).flatMap((s) => s.layers.filter(survivesRegeneration));
  const last = slides[slides.length - 1];
  if (orphans.length > 0 && last) {
    kept += orphans.length;
    slides[slides.length - 1] = { ...last, layers: [...last.layers, ...orphans] };
  }

  return { doc: { ...doc, slides }, replaced, kept };
}

/** Re-runs generation over the document's own copy. */
export function regenerate(
  doc: Doc,
  theme: Theme,
  options: BuildOptions = {},
  roles?: string[],
): MergeResult {
  const fresh = buildSlides(textsOf(doc), theme, roles, withFills(doc, options));
  return mergeRegenerated(doc, fresh);
}

/**
 * Rewrite one slide's copy and lay it out again.
 *
 * Used by hook variants, where only slide 1 changes. It goes back through
 * `buildSlides` rather than writing the new text onto the existing layer,
 * because a layer's box and font size were chosen for the OLD words, a longer
 * hook on a box measured for a shorter one is the "text too small to read"
 * complaint, arriving by a different door.
 *
 * The whole deck is rebuilt and one slide taken, not the slide alone: composition
 * selection depends on the index, the total and a seed derived from the deck's
 * own words, so rebuilding slide 0 in isolation would hand it a different layout
 * than the one it has.
 *
 * When the rewrite is long enough to need splitting, the slide count changes and
 * there is no longer a single slide to swap in. That is a genuinely different
 * deck, so the whole merged regeneration is returned instead, and `replaced`
 * tells the caller which happened.
 */
export function restateSlide(
  doc: Doc,
  index: number,
  text: string,
  theme: Theme,
  options: BuildOptions = {},
  roles?: string[],
): MergeResult {
  const texts = textsOf(doc);
  if (index < 0 || index >= texts.length) return { doc, replaced: 0, kept: 0 };

  const next = [...texts];
  next[index] = text;
  const fresh = buildSlides(next, theme, roles, withFills(doc, options));

  if (fresh.length !== doc.slides.length) return mergeRegenerated(doc, fresh);

  const rebuilt = fresh[index];
  const old = doc.slides[index];
  if (!rebuilt || !old) return { doc, replaced: 0, kept: 0 };

  const mine = old.layers.filter(survivesRegeneration);
  const slides = [...doc.slides];
  const blocks = [...(rebuilt.blocks ?? []), ...(old.blocks ?? []).filter((b) => !b.slot)];
  slides[index] = {
    ...rebuilt,
    ...(blocks.length > 0 ? { blocks } : {}),
    layers: [...rebuilt.layers, ...mine],
  };

  return { doc: { ...doc, slides }, replaced: rebuilt.layers.length, kept: mine.length };
}

export const handEditedCount = (doc: Doc): number =>
  doc.slides.reduce((n, s) => n + s.layers.filter((l) => l.handEdited).length, 0);

/** Marks a layer as the user's. Called from every editor mutation. */
export const markEdited = (l: Layer): Layer => (l.handEdited ? l : { ...l, handEdited: true });

/**
 * Re-lay only some slides (18.5's "apply layout" on a filmstrip selection).
 *
 * The whole deck is rebuilt and the chosen slides taken from it, for the reason
 * `restateSlide` gives: a composition depends on the index, the total and the
 * deck's seed. Each taken slide keeps its id, its alt text and its hand-edited
 * layers, so the selection still points at it afterwards.
 *
 * When the rebuild would change the slide count (copy long enough to split),
 * there is no slide-for-slide answer, so nothing changes and `replaced` is 0.
 */
export function relaySlides(doc: Doc, ids: readonly string[], theme: Theme): MergeResult {
  const fresh = buildSlides(textsOf(doc), theme, undefined, withFills(doc, {}));
  if (fresh.length !== doc.slides.length) return { doc, replaced: 0, kept: 0 };

  let replaced = 0;
  let kept = 0;
  const slides = doc.slides.map((old, i) => {
    const rebuilt = fresh[i];
    if (!rebuilt || !ids.includes(old.id)) return old;
    const mine = old.layers.filter(survivesRegeneration);
    replaced += rebuilt.layers.length;
    kept += mine.length;
    return {
      ...rebuilt,
      id: old.id,
      name: old.name,
      ...(old.alt ? { alt: old.alt } : {}),
      ...(() => {
        const blocks = [...(rebuilt.blocks ?? []), ...(old.blocks ?? []).filter((b) => !b.slot)];
        return blocks.length > 0 ? { blocks } : {};
      })(),
      layers: [...rebuilt.layers, ...mine],
    };
  });

  return { doc: replaced > 0 ? { ...doc, slides } : doc, replaced, kept };
}
