/**
 * The honesty rule (Batch 10, 25.1), as one string both sides agree on.
 *
 * A slot that reports a result, a figure or somebody's words (Case study's
 * result, Data breakdown's number, a quote) is the slot a model is most tempted
 * to fill with something plausible. When the brief does not contain it, the
 * model is told to return exactly this instead, and nothing else. The checks
 * accept it there and nowhere else; the pre-flight catches it on a slide, so it
 * cannot ship.
 *
 * Shared with the server, like `marks.ts`: it imports nothing.
 */
export const HONEST_BLANK = "[Add the real one: the brief did not give it]";

export const isHonestBlank = (text: string): boolean => text.trim() === HONEST_BLANK;
