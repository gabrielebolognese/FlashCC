/**
 * Bulk creation.
 *
 * One paste, many carousels. Blocks are separated by a line of three or more dashes,
 * and inside a block a blank line is a slide break — the same rule the single-post
 * path already uses, so nothing new has to be learned.
 */
import { buildSlides, type BuildOptions } from "./compositions.js";
import { makeDoc, type Doc } from "./model.js";
import type { Theme } from "./presets.js";
import type { Structure } from "./structures.js";

export const SEPARATOR = "---";

export type BulkBlock = {
  /** One entry per slide. */
  texts: string[];
  /** First line, trimmed for the project name. */
  title: string;
};

/** Split a paste into carousels, then each carousel into slides. */
export function parseBulk(source: string): BulkBlock[] {
  return source
    .replace(/\r\n?/g, "\n")
    .split(/^[ \t]*-{3,}[ \t]*$/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const texts = block
        .split(/\n\s*\n/)
        .map((t) => t.trim())
        .filter(Boolean);
      const first = texts[0] ?? "";
      return {
        texts,
        title: first.split("\n")[0]?.slice(0, 48).trim() || "Untitled",
      };
    })
    .filter((b) => b.texts.length > 0);
}

export const countSlides = (blocks: BulkBlock[]): number =>
  blocks.reduce((n, b) => n + b.texts.length, 0);

/**
 * One document per block. Roles come from the framework's slots in order, so a block
 * with fewer paragraphs than the framework has slots simply stops early rather than
 * padding with blanks.
 */
export function buildDocs(
  blocks: BulkBlock[],
  structure: Structure,
  theme: Theme,
  options: BuildOptions = {},
  group?: string,
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
      slides: buildSlides(block.texts, theme, roles, options),
    };
  });
}

export const SAMPLE_BULK = `Your videos feel boring. Here's why.

Every cut lands on the beat and it still feels flat.

You're cutting to the rhythm of the audio, not the attention.

Cut on movement, not on beat.

Save this for your next edit.

---

3 editing tricks for talking-head videos.

By the end you'll never cut a talking head the same way again.

Attention resets every time the frame changes.

Punch in 15% on the second sentence of every answer.

Save this for your next edit.`;
