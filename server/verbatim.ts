/**
 * Is this text actually present in that text?
 *
 * Two routes need the same answer for the same reason. `/api/distil` returns
 * quotes from a source, and `/api/voice/learn` returns a line of somebody's own
 * writing as evidence for each trait it claims. Both are worthless if the model
 * tidied them, and both are worse than worthless: a quote attributed to a
 * transcript that does not contain it, or a panel that LOOKS auditable and is
 * not, are failures that only surface once somebody has published.
 *
 * Pure, so it is tested without a key and without a bill.
 */

/**
 * The characters that differ between what somebody pasted and what a model
 * typed back, without either of them meaning anything different.
 *
 * Curly and straight quotes, the various dashes and spaces, and runs of
 * whitespace. **This is not fuzzy matching and it is not "close enough".** Every
 * pair here is the same character wearing a different code point, and without
 * this step nearly every real quote fails on an apostrophe.
 */
export const canonical = (text: string): string =>
  text
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Below this, a string matches by accident and is not a quote anybody wanted. */
export const MIN_QUOTE_CHARS = 12;

/**
 * Only the lines the haystack actually contains.
 *
 * **No repair, no fuzzy match, no nearest neighbour. Dropped.** Anything else is
 * this function deciding what somebody said.
 *
 * Note what does NOT run on these: `plainText`, which turns em dashes into
 * commas everywhere else in this codebase. Cleaning one would alter the single
 * text in the product whose whole value is being unaltered, and would then fail
 * its own check.
 */
export function verbatimOnly(lines: readonly string[], haystackText: string): string[] {
  const haystack = canonical(haystackText);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < MIN_QUOTE_CHARS) continue;

    const key = canonical(line);
    if (!key || !haystack.includes(key)) continue;

    /*
     * Matched strictly, deduplicated loosely, and the two keys are different on
     * purpose.
     *
     * The match has to stay exact: that is the entire promise. But the same
     * sentence returned twice, once with a trailing full stop, passes the match
     * both times and would show somebody two cards saying the same thing. The
     * dedup key drops punctuation so those collapse, without ever loosening
     * what counts as present.
     */
    const dedup = key.replace(/[^a-z0-9 ]+/g, "").trim();
    if (seen.has(dedup)) continue;
    seen.add(dedup);

    out.push(line);
  }

  return out;
}
