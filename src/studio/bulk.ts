/**
 * Bulk creation.
 *
 * One paste, many carousels. Blocks are separated by a line of three or more dashes,
 * and inside a block a blank line is a slide break, the same rule the single-post
 * path already uses, so nothing new has to be learned.
 */
import { buildSlides, type BuildOptions } from "./compositions.js";
import { makeDoc, type Doc } from "./model.js";
import type { Theme } from "./presets.js";
import type { Structure } from "./structures.js";
import { looksDelimited, parseSheet, type ParseResult } from "./csv.js";
import { nameFromHook } from "./search.js";

/**
 * A block of slide texts on its way to becoming a carousel.
 *
 * What survives of the old bulk create. The panel that parsed `---` separated
 * carousels out of a textarea is gone (Batch 16): it asked somebody to paste a
 * carousel they had already written, which is a text importer wearing the name
 * of a feature. This type and `buildDocs` stayed because `longform.ts` produces
 * the first and `Repurpose` builds through the second.
 */
export type BulkBlock = {
  texts: string[];
  /** Carried through so a series can be named after what it came from. */
  title?: string | undefined;
};

export function buildDocs(
  blocks: BulkBlock[],
  structure: Structure,
  theme: Theme,
  options: BuildOptions = {},
  group?: string,
  styleId?: string,
): Doc[] {
  const palette = [
    theme.bg, theme.fg, theme.accent, theme.muted,
    "#ffffff", "#000000", "#e5545a", "#3dbe7a", "#4c86d6", "#db2777",
  ];

  return blocks.map((block) => {
    const roles = structure.slots.slice(0, block.texts.length).map((s) => s.id);
    return {
      ...makeDoc(block.title),
      palette,
      ...(group ? { group } : {}),
      // Stamped here as well as on the single-carousel path. Without it a bulk
      // deck is invisible to the framework and style attribution that is the
      // whole reason the pipeline records structure, and bulk is precisely
      // where enough posts to attribute anything come from.
      framework: structure.id,
      ...(styleId ? { styleId } : {}),
      slides: buildSlides(block.texts, theme, roles, options),
    };
  });
}
