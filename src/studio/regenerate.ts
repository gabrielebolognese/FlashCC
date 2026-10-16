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

import { arrangeBlockSlide, arrangementsFor, type BlockArrangement } from "./blockplace.js";
import { buildSlides, cycleCompositionAt, shapeOfText, stepComposition, type BuildOptions } from "./compositions.js";
import { hasMarks } from "./marks.js";
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
  // A shuffled rhythm (25.2) is kept by every later re-lay, until shuffled again.
  const shifted = doc.rhythmShift && options.seedShift === undefined ? { ...options, seedShift: doc.rhythmShift } : options;
  return fillsAt ? { ...shifted, fillsAt } : shifted;
};

/**
 * The layers that carry a slide's own copy, biggest first. A block's words and
 * a counter's "3 / 10" are not what the slide says, and feeding them back into
 * generation would lay them out a second time as body text.
 */
export function copyLayers(slide: Slide): Layer[] {
  const texts = slide.layers.filter(
    (l) =>
      l.kind === "text" &&
      (l.text ?? "").trim() !== "" &&
      !l.block &&
      !l.furniture &&
      !l.furnitureOptOut &&
      // The numbered composition's "03" is decoration it draws, not words.
      !(l.name === "Number" && /^\d+$/.test((l.text ?? "").trim())),
  );
  // Biggest first, then the rest, which reassembles "heading. body" the way
  // the splitter produced it. Stable, so equal sizes keep their order. A
  // kicker (25.2) is the heading set small, so it leads whatever its size.
  const rank = (l: Layer) => (l.name === "Kicker" ? 1 : 0);
  return [...texts].sort((a, b) => rank(b) - rank(a) || (b.fontSize ?? 0) - (a.fontSize ?? 0));
}

/** One slide's copy, as generation reads it back. */
export const slideCopy = (slide: Slide): string =>
  copyLayers(slide)
    .map((l) => (l.text ?? "").trim())
    .join("\n");

export function textsOf(doc: Doc): string[] {
  return doc.slides.map(slideCopy);
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

/**
 * What changing a layer's WORDS undoes, applied wherever words change: the two
 * edit funnels, outline mode and find and replace.
 *
 * A verified quote (Batch 13, 19.2) whose words change is no longer verbatim.
 * A furniture piece somebody typed into (Batch 20.4) stops being furniture:
 * its stamp goes, and the opt-out stays so reseal neither rewrites it nor puts
 * a fresh one beside it. Somebody who typed "Swipe for the secret" into the
 * swipe cue has said what they want.
 */
export function retouched(before: Layer, after: Layer, marks?: () => string): Layer {
  if (after.text === undefined || after.text === before.text) return after;
  let next = after;
  if (next.verbatim) next = { ...next, verbatim: undefined };
  if (next.furniture) next = { ...next, furnitureOptOut: next.furniture, furniture: undefined };
  // The first mark typed into a layer that never had one (22.3): it takes the
  // deck's accent, chosen once and stored, like every colour on a layer.
  if (marks && !next.markColour && next.kind === "text" && hasMarks(next.text ?? "")) {
    next = { ...next, markColour: marks() };
  }
  return next;
}

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

/* ── several slides at once (24.1, 24.5) ─────────────────────────────────── */

/**
 * One slide of the deck to be: where it comes from, and what it says.
 *
 * `from` is the index of the slide it continues (null for a new one), `text`
 * its copy, and `changed` whether that copy differs from what `from` says.
 * A slide that continues one and is unchanged is kept exactly as it is.
 */
export type Restatement = { from: number | null; text: string; changed: boolean; composition?: string | undefined };

export type RestateResult = {
  doc: Doc;
  /** Indexes (in the new deck) of slides laid out again or written to. */
  rebuilt: number[];
  /** Of those, the ones written straight onto their layers because a copy layer was the user's. */
  written: number[];
};

/**
 * Lays out the slides whose words changed, keeps every other slide exactly as
 * it is, and adds or drops slides as the plan says.
 *
 * The deck is rebuilt from all the new copy and the changed slides taken from
 * it, for the reason `restateSlide` gives (a composition depends on the index,
 * the total and the deck's seed). Never split: the plan's slide count is
 * somebody's decision (a `#` line in the outline), so copy too long for its
 * slide is reported by the caller rather than moved onto a slide nobody asked
 * for.
 *
 * Who owns the box decides how a changed slide changes, the same rule the
 * rewrite picker follows. A slide whose copy layers are all generated is laid
 * out again, and its hand-edited layers ride on top where they were. A slide
 * where the user has edited a copy layer (moved it, restyled it, typed into
 * it) has its words written straight onto its layers, line for line, and
 * nothing moves: rebuilding would print the new words as a generated layer
 * beside the kept one, the same line twice.
 */
export function restateMany(doc: Doc, plan: readonly Restatement[], theme: Theme, options: BuildOptions = {}): RestateResult {
  const bands = deckHasBands(doc);
  const fillsAt = plan.map((p) => {
    const rec = p.from === null ? undefined : doc.slides[p.from]?.blocks?.find((b) => b.slot);
    return rec ? { id: rec.block, fields: rec.fields } : undefined;
  });
  const compositions = plan.map((p) => p.composition);
  const fresh = buildSlides(
    plan.map((p) => p.text),
    theme,
    undefined,
    {
      images: bands,
      ...(doc.rhythmShift ? { seedShift: doc.rhythmShift } : {}),
      ...options,
      split: false,
      ...(fillsAt.some(Boolean) ? { fillsAt } : {}),
      ...(compositions.some(Boolean) ? { compositions } : {}),
    },
  );
  // buildSlides drops empty entries, so map plan rows to fresh slides by the
  // non-empty ones; an empty new slide is a plain blank slide.
  let k = 0;
  const freshFor = plan.map((p) => (p.text.trim() ? fresh[k++] : undefined));

  const rebuilt: number[] = [];
  const written: number[] = [];
  const slides = plan.map((p, i): Slide => {
    const old = p.from === null ? undefined : doc.slides[p.from];
    if (old && !p.changed && !p.composition) return old;
    const built = freshFor[i];
    if (!old) {
      rebuilt.push(i);
      return built ?? { ...blank(doc), name: `Slide ${i + 1}` };
    }
    const copy = copyLayers(old);
    if (!p.composition && copy.some((l) => l.handEdited)) {
      written.push(i);
      rebuilt.push(i);
      return writeCopy(old, p.text);
    }
    rebuilt.push(i);
    if (!built) {
      // Emptied: the generated copy goes, the user's layers stay.
      return { ...old, layers: old.layers.filter((l) => !copy.includes(l) || survivesRegeneration(l)) };
    }
    // A new layout asked for by name (`L`) lays the words out afresh, the
    // user's own copy layers included: keeping a moved headline beside the
    // re-laid one would print it twice. Everything else of theirs stays.
    const mine = old.layers.filter((l) => survivesRegeneration(l) && !(p.composition && copy.includes(l)));
    // A picture the user placed replaces the fresh empty band rather than sitting beside it.
    const ownPicture = mine.some((l) => l.kind === "image" && !l.block);
    const layers = ownPicture ? built.layers.filter((l) => !(l.kind === "image" && !l.src)) : built.layers;
    const blocks = [...(built.blocks ?? []), ...(old.blocks ?? []).filter((b) => !b.slot)];
    return {
      ...built,
      id: old.id,
      name: old.name,
      ...(old.alt ? { alt: old.alt } : {}),
      ...(old.image ? { image: old.image } : {}),
      ...(old.texture ? { texture: old.texture } : {}),
      background: old.background,
      ...(old.gradient ? { gradient: old.gradient } : { gradient: undefined }),
      ...(blocks.length > 0 ? { blocks } : { blocks: undefined }),
      layers: [...layers, ...mine],
    };
  });

  return { doc: { ...doc, slides }, rebuilt, written };
}

/** A deck laid out with picture bands keeps them on the slides it lays out again. */
function deckHasBands(doc: Doc): boolean {
  return doc.slides.some((s) => s.layers.some((l) => l.kind === "image" && !l.block && !l.furniture && !l.spanId));
}

const blank = (doc: Doc): Slide => ({
  id: `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
  name: "Slide",
  background: doc.slides[0]?.background ?? "#12161c",
  layers: [],
});

/**
 * New copy written onto a slide's own copy layers, line for line: each layer
 * takes as many lines as it held before, and the last takes whatever is left.
 * Layers with no words left are emptied rather than deleted, so a box somebody
 * placed is still there to type into.
 */
export function writeCopy(slide: Slide, text: string): Slide {
  const copy = copyLayers(slide);
  const lines = text.split("\n");
  const next = new Map<string, string>();
  let at = 0;
  copy.forEach((l, k) => {
    const want = k === copy.length - 1 ? Math.max(0, lines.length - at) : (l.text ?? "").trim().split("\n").length;
    next.set(l.id, lines.slice(at, at + want).join("\n"));
    at += want;
  });
  return {
    ...slide,
    layers: slide.layers.map((l) => {
      const t = next.get(l.id);
      if (t === undefined || t === (l.text ?? "").trim()) return l;
      return markEdited(retouched(l, { ...l, text: t }));
    }),
  };
}

/**
 * The next (or previous) layout for one slide (24.3's `L`): the same words in
 * the composition after this one in the fixed ring, so `L` pressed as many
 * times as there are compositions comes back to the start. Hand-edited layers
 * that are not the slide's words stay where they are.
 */
export function stepLayout(doc: Doc, index: number, dir: 1 | -1, theme: Theme): RestateResult {
  const slide = doc.slides[index];
  if (!slide) return { doc, rebuilt: [], written: [] };

  // A slide holding one block (25.2): the block and its words are rearranged,
  // never re-laid as text, which would lose the block.
  const rec = slide.blocks?.length === 1 ? slide.blocks[0] : undefined;
  const copy = copyLayers(slide);
  if (rec && copy.length <= 1) {
    const board = { w: doc.width, h: doc.height };
    const ring = arrangementsFor(rec.block, board);
    if (ring.length === 0) return { doc, rebuilt: [], written: [] };
    const at = ring.indexOf(slide.composition as BlockArrangement);
    const next = ring[at < 0 ? (dir === 1 ? 0 : ring.length - 1) : (at + dir + ring.length) % ring.length]!;
    const out = arrangeBlockSlide(slide, next, { theme, board }, copy[0]);
    if (!out) return { doc, rebuilt: [], written: [] };
    return { doc: { ...doc, slides: doc.slides.map((s, i) => (i === index ? out : s)) }, rebuilt: [index], written: [] };
  }

  if (!slideCopy(slide)) return { doc, rebuilt: [], written: [] };
  // A slide no generator laid out (a template's, a typed one before Batch 24)
  // has no composition recorded: it steps from the one the deck's cycle gives
  // its position, not from the top of the ring.
  const current = slide.composition ?? (index === 0 ? "title" : cycleCompositionAt(index, textsOf(doc)));
  const composition = stepComposition(current, dir, shapeOfText(slideCopy(slide)));
  return restateMany(
    doc,
    doc.slides.map((s, i) => ({ from: i, text: slideCopy(s), changed: i === index, composition: i === index ? composition : undefined })),
    theme,
  );
}

/**
 * A slide typed into existence (24.5): `line` as its headline, inserted at
 * `at`, laid out with the composition the deck's cycle gives that position.
 * Every other slide is kept exactly as it is.
 */
export function typeSlide(doc: Doc, at: number, line: string, theme: Theme): RestateResult {
  const texts = textsOf(doc);
  const where = Math.max(0, Math.min(at, doc.slides.length));
  const plan: Restatement[] = doc.slides.map((s, i) => ({ from: i, text: texts[i] ?? "", changed: false }));
  const next = [...texts.slice(0, where), line, ...texts.slice(where)];
  plan.splice(where, 0, { from: null, text: line.trim(), changed: true, composition: cycleCompositionAt(where, next, doc.rhythmShift ?? 0) });
  return restateMany(doc, plan, theme);
}

/**
 * Shuffle rhythm (25.2): the deck's composition cycle run again from a
 * different offset, for when the whole deck looks too regular. The words stay,
 * hand-edited layers stay; every slide's layout is re-picked, the cycle
 * starting one step further on each press. Remembered on the deck, so a later
 * Re-lay keeps the rhythm rather than snapping back.
 */
export function shuffleRhythm(doc: Doc, theme: Theme): MergeResult {
  const shift = (doc.rhythmShift ?? 0) + 1;
  const result = regenerate(doc, theme, { seedShift: shift });
  return { ...result, doc: { ...result.doc, rhythmShift: shift } };
}
