/**
 * Re-running generation without losing what you changed by hand.
 *
 * The batch job stays OUTSIDE the document. A re-run is a fresh one-shot
 * generation that happens to skip layers you have touched — not a live binding,
 * not a template the document keeps referring back to. That distinction is the
 * whole "nothing is derived" invariant: what is stored is what renders, and a
 * regenerated layer is as ordinary as one you drew.
 *
 * A layer counts as yours the moment you edit it. Nothing infers intent from the
 * content — inferring would mean a layer you deliberately restored to its
 * original colour silently loses its protection.
 */

import { buildSlides, type BuildOptions } from "./compositions.js";
import type { Doc, Layer, Slide } from "./model.js";
import type { Theme } from "./presets.js";

/** The copy a document currently carries, one entry per slide. */
export function textsOf(doc: Doc): string[] {
  return doc.slides.map((slide) => {
    const texts = slide.layers.filter((l) => l.kind === "text" && (l.text ?? "").trim() !== "");
    if (texts.length === 0) return "";
    // Biggest first, then the rest — which reassembles "heading. body" the way
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
    const mine = (doc.slides[i]?.layers ?? []).filter((l) => l.handEdited);
    kept += mine.length;
    replaced += slide.layers.length;
    return { ...slide, layers: [...slide.layers, ...mine] };
  });

  // A shorter regeneration would strand hand-edited layers on slides that no
  // longer exist, so anything past the new end is appended to the last slide
  // rather than dropped.
  const orphans = doc.slides.slice(fresh.length).flatMap((s) => s.layers.filter((l) => l.handEdited));
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
  const fresh = buildSlides(textsOf(doc), theme, roles, options);
  return mergeRegenerated(doc, fresh);
}

export const handEditedCount = (doc: Doc): number =>
  doc.slides.reduce((n, s) => n + s.layers.filter((l) => l.handEdited).length, 0);

/** Marks a layer as the user's. Called from every editor mutation. */
export const markEdited = (l: Layer): Layer => (l.handEdited ? l : { ...l, handEdited: true });
