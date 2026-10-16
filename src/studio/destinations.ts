/**
 * One deck, several destinations.
 *
 * Everything here is decided before anything is rendered: which slides go in
 * which post, which five a Pinterest carousel keeps, what each destination's
 * copy of the deck looks like. That is arithmetic and reflow, so it lives in a
 * pure module where it can be proved, and the export dialog only draws it.
 *
 * ── Variants are exports first, documents on request ─────────────────────────
 *
 * A reflowed copy that becomes a document drifts from its source the moment
 * either is edited. That is correct, nothing is derived, but it is invisible.
 * So the default is render-only: `variantFor` builds the copy in memory, the
 * export uses it, and it is thrown away. `keepAsCarousel` is the explicit way to
 * save one, and the `variantOf` it stamps is for finding the pair, never for
 * syncing it.
 *
 * Pure and DOM-free.
 */

import type { Doc } from "./model.js";
import { published, type Post } from "./pipeline.js";
import { shapeOf, type Platform, type Shape } from "./platforms.js";
import { reseal } from "./furniture.js";
import { fitToSafeArea } from "./safearea.js";
import { reflowDoc } from "./reflow.js";
import { clamp, captionLimit, deckTexts } from "./transcript.js";

/* ── 17.3, decks that do not fit in one post ──────────────────────────────── */

/**
 * How many slides go in each post, for a destination that takes `perPost`.
 *
 * Full posts first, then whatever is left, with one rule: **the last post never
 * holds a single slide.** The last slide is the CTA, and a post that is nothing
 * but "Follow for more" reads as spam. So a remainder of one borrows a slide
 * from the post before it: nine slides on X are 4, 3, 2, never 4, 4, 1.
 */
export function postSizes(count: number, perPost: number): number[] {
  if (count <= 0) return [];
  if (perPost <= 1 || count <= perPost) return [count];

  const sizes: number[] = [];
  for (let left = count; left > 0; left -= perPost) sizes.push(Math.min(perPost, left));

  const last = sizes.length - 1;
  if (sizes[last] === 1) {
    sizes[last] = 2;
    sizes[last - 1] = sizes[last - 1]! - 1;
  }
  return sizes;
}

/** The slide indexes in each post, in order. */
export function postGroups(count: number, perPost: number): number[][] {
  const groups: number[][] = [];
  let at = 0;
  for (const size of postSizes(count, perPost)) {
    groups.push(Array.from({ length: size }, (_, i) => at + i));
    at += size;
  }
  return groups;
}

/**
 * Where one slide lands in the zip.
 *
 * A folder per post, and the post order in the file name as well as the folder,
 * because the folder is lost the moment somebody drags the images out of it.
 */
export const postFilePath = (post: number, posts: number, slide: number, ext: string): string =>
  `post-${post + 1}-of-${posts}/post-${post + 1}-slide-${slide + 1}.${ext}`;

/**
 * One short line per post, worked out from the slides, no key needed.
 *
 * The deterministic half of the per-post caption: each post's first slide is
 * its headline, so its words are what the post is about. `/api/caption` can be
 * asked for better ones; this is what is there before anybody asks.
 */
export function postLines(doc: Doc, groups: readonly number[][], platform: string): string[] {
  const texts = deckTexts(doc);
  const limit = captionLimit(platform);
  return groups.map((group, p) => {
    const first = group.map((i) => texts[i] ?? "").find((t) => t.trim()) ?? "";
    const line = first.split("\n")[0]?.trim() ?? "";
    // Numbered like a thread is numbered, because that is what it is.
    return clamp(`${p + 1}/${groups.length} ${line}`.trim(), limit);
  });
}

/* ── 17.4, Pinterest keeps five ───────────────────────────────────────────── */

/**
 * Which slides a destination that keeps fewer than the deck should take.
 *
 * By STRUCTURE only: the hook, the body slides in the deck's own order, and the
 * CTA. "The strongest three" is positional, never a model's judgement, because
 * nothing in this product ranks somebody's sentences. The user sees the pick
 * and can swap any of it.
 */
export function pickSlides(count: number, keep: number): number[] {
  if (count <= keep) return Array.from({ length: count }, (_, i) => i);
  if (keep <= 1) return [0];
  const body = Array.from({ length: keep - 2 }, (_, i) => i + 1);
  return [0, ...body, count - 1];
}

/**
 * The user changing the pick: a picked slide comes out, an unpicked one goes
 * in, and the pick never grows past `keep` or shrinks below `min`. Always in
 * deck order, because a carousel is read in the order it was written.
 */
export function togglePick(picked: readonly number[], at: number, keep: number, min: number): number[] {
  if (picked.includes(at)) {
    return picked.length > min ? picked.filter((i) => i !== at) : [...picked];
  }
  return picked.length < keep ? [...picked, at].sort((a, b) => a - b) : [...picked];
}

/** The deck with only these slides, in deck order. */
export const subsetDoc = (doc: Doc, indexes: readonly number[]): Doc => {
  const keep = new Set(indexes);
  return { ...doc, slides: doc.slides.filter((_, i) => keep.has(i)) };
};

/* ── 17.5, one deck, every destination ────────────────────────────────────── */

export type Destination = {
  platform: Platform;
  shape: Shape;
  /** For a destination with `keep`: which slides, by index into the source. */
  picked?: number[] | undefined;
  /** Save this destination's copy as its own carousel. Off unless asked. */
  keep?: boolean | undefined;
};

/** The shape to start from: the deck's own if the platform takes it. */
export const defaultShape = (platform: Platform, doc: Pick<Doc, "width" | "height">): Shape =>
  shapeOf(platform, doc.width, doc.height) ?? platform.shapes[0]!;

export function destinationFor(platform: Platform, doc: Doc): Destination {
  return {
    platform,
    shape: defaultShape(platform, doc),
    ...(platform.keep !== undefined ? { picked: pickSlides(doc.slides.length, platform.keep) } : {}),
  };
}

/** "Instagram 3:4", or just "LinkedIn" when the platform has one obvious shape. */
export const destinationLabel = (d: Destination): string =>
  d.shape.w === d.platform.w && d.shape.h === d.platform.h
    ? d.platform.label
    : `${d.platform.label} ${d.shape.label}`;

/** Folder name inside the combined zip. Lowercase, no colon. */
export const destinationFolder = (d: Destination): string =>
  destinationLabel(d)
    .toLowerCase()
    .replace(/:/g, "x")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * This destination's copy of the deck, in memory.
 *
 * The same path the format switcher takes, reflow then the safe area, so a
 * variant is exactly what the user would get by switching format by hand. Then
 * the pick, for a destination that keeps fewer slides than the deck.
 */
export function variantFor(doc: Doc, d: Destination): Doc {
  const picked = d.picked ? subsetDoc(doc, d.picked) : doc;
  // Already the right shape: exported as drawn. Pulling a deck the user laid
  // out by hand clear of the chrome is what the format SWITCH does, on a
  // change of size; doing it silently at export would move layers nobody
  // asked to move, in a file nobody looks at until it is posted.
  if (picked.width === d.shape.w && picked.height === d.shape.h) {
    // Furniture is the exception (20.5): the chip says this platform's
    // handle, and a piece in this platform's chrome goes back to a corner.
    return reseal(picked, { platform: d.platform });
  }
  const reflowed = reflowDoc(picked, d.shape.w, d.shape.h);
  // A reflowed copy's furniture goes back to its corners in THIS platform's
  // safe area: positions chosen for another board mean nothing here.
  return reseal(fitToSafeArea(reflowed, d.platform), { platform: d.platform, replace: true });
}

/**
 * A variant saved as a carousel of its own.
 *
 * New id, the destination in its name, and `variantOf` pointing home. NOT part
 * of the source's series: "part 3 of 6" is about the original, and two
 * documents claiming to be part 3 would break the series view.
 */
export function keepAsCarousel(variant: Doc, source: Doc, d: Destination, id: string, now: string): Doc {
  const { series: _series, ...rest } = variant;
  return {
    ...rest,
    id,
    name: `${source.name} (${destinationLabel(d)})`,
    variantOf: source.id,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Where each numbered image from the export lands in a thread's folders.
 *
 * The server names images `01.jpg` to `NN.jpg`; this says where each one goes,
 * so the repacking is a lookup rather than arithmetic done in a component.
 */
export function postFileMap(count: number, perPost: number, ext: string): Map<string, string> {
  const groups = postGroups(count, perPost);
  const out = new Map<string, string>();
  groups.forEach((group, p) => {
    group.forEach((slide, k) => {
      out.set(`${String(slide + 1).padStart(2, "0")}.${ext}`, postFilePath(p, groups.length, k, ext));
    });
  });
  return out;
}

/* ── 17.6, the grid ───────────────────────────────────────────────────────── */

/**
 * The carousels that would sit beside this cover on an Instagram profile.
 *
 * The user's own published Instagram posts, newest first, minus this deck, at
 * most eight: with the new cover that is the top three rows of the grid, which
 * is what anybody landing on a profile sees before they scroll.
 */
export function gridNeighbours(posts: readonly Post[], docId: string, max = 8): Post[] {
  return published([...posts])
    .filter((p) => p.platform === "instagram" && p.docId !== null && p.docId !== docId)
    .slice(0, max);
}
