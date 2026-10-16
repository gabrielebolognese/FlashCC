/**
 * Emphasis inside a line (22.3): three marks, and nothing else.
 *
 *   *word*     the accent colour
 *   **word**   heavier weight
 *   ==word==   a highlighter stroke behind it
 *
 * The marks are part of the stored text, so what is stored is what renders
 * (invariant 1): `LayerView` paints the runs, `text.ts` measures them, and
 * everything that wants plain words (the transcript, the caption, search, alt
 * text) reads `stripMarks`. They are typed the same way everywhere a slide's
 * words are typed, which is why they are characters and not a toolbar.
 *
 * Shared with the server, which is why this file imports nothing: a model may
 * write marks (one span per slide, see `limitMarks`), and `server/prompts.ts`
 * keeps these three while stripping anything else that looks like markup.
 *
 * A mark needs a non-space character at both ends of its contents, so
 * arithmetic ("5 * 3 * 2") and a stray asterisk are left alone. Marks do not
 * nest and do not cross a line break.
 */

export type Mark = "accent" | "bold" | "highlight";
export type Run = { text: string; mark?: Mark | undefined };

/** Bold first so `**` is never read as two empty accents. */
const MARK_RE = /\*\*(\S(?:[^*\n]*?\S)?)\*\*|==(\S(?:[^=\n]*?\S)?)==|\*(\S(?:[^*\n]*?\S)?)\*/g;

/** The text as runs, in order. Plain text is one run with no mark. */
export function parseMarks(text: string): Run[] {
  const runs: Run[] = [];
  let at = 0;
  for (const m of text.matchAll(MARK_RE)) {
    const i = m.index ?? 0;
    if (i > at) runs.push({ text: text.slice(at, i) });
    if (m[1] !== undefined) runs.push({ text: m[1], mark: "bold" });
    else if (m[2] !== undefined) runs.push({ text: m[2], mark: "highlight" });
    else if (m[3] !== undefined) runs.push({ text: m[3], mark: "accent" });
    at = i + m[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at) });
  return runs.length > 0 ? runs : [{ text: "" }];
}

/**
 * Its own regex, without the `g` flag: `.test` on a global regex moves its
 * `lastIndex`, and `matchAll` starts from that `lastIndex`, so testing first
 * and parsing second used to skip the first mark of the line.
 */
const MARK_TEST = new RegExp(MARK_RE.source);

export const hasMarks = (text: string): boolean => MARK_TEST.test(text);

/** The words a reader sees, with the marks gone. */
export const stripMarks = (text: string): string =>
  text.replace(MARK_RE, (_all, b?: string, h?: string, a?: string) => b ?? h ?? a ?? "");

/** How many marked spans the text carries. */
export const markCount = (text: string): number => [...text.matchAll(MARK_RE)].length;

/** Where each marked span sits in the raw text, marks included: [from, to). */
export const markSpans = (text: string): [number, number][] =>
  [...text.matchAll(MARK_RE)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);

/**
 * Removes cut positions that fall strictly inside a marked span. Splitting a
 * slide between the two asterisks of `*word*` would leave each half with one
 * stray asterisk printed as a character.
 */
export function outsideMarks(text: string, cuts: readonly number[]): number[] {
  const spans = markSpans(text);
  return cuts.filter((c) => !spans.some(([a, b]) => c > a && c < b));
}

/**
 * Keeps the first `max` marked spans and unwraps the rest, words intact.
 *
 * The ceiling for model-written emphasis is one span per slide: emphasis is
 * part of what a sentence means, so the model may choose the word that matters,
 * but two marked words on a slide is no emphasis at all.
 */
export function limitMarks(text: string, max = 1): string {
  let seen = 0;
  return text.replace(MARK_RE, (all, b?: string, h?: string, a?: string) => {
    seen += 1;
    return seen <= max ? all : (b ?? h ?? a ?? "");
  });
}

/** Swaps every highlight for an accent, for a layer whose one effect is something else (22.4). */
export const highlightsToAccent = (text: string): string =>
  text.replace(MARK_RE, (all, _b?: string, h?: string) => (h !== undefined ? `*${h}*` : all));

/** The weight a `**` run takes inside a line of the given weight. */
export const boldWeight = (base: number): number => (base >= 700 ? 900 : 700);
