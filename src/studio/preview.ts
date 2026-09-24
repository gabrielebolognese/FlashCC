/**
 * The deck the style editor previews.
 *
 * Pure, and separate from `StylePicker.tsx`, because the thing worth guarding is
 * not how the grid looks but whether the six previews are actually *different*.
 * That is a property of the deck handed to `buildSlides`, it has no DOM in it,
 * and it broke silently once already: the editor built one slide from
 * `texts.slice(0, 1)` and showed the title layout on its own, so somebody picked
 * a palette having never seen what it does to a quote or a colour block.
 */

/**
 * How many slides it takes to judge a style.
 *
 * Six is the length of the composition cycle in `compositions.ts`, so six
 * previews cover every layout a deck can produce, image band above and below
 * included. Fewer leaves a layout unseen; more repeats one.
 */
export const PREVIEW_COUNT = 6;

/**
 * Only reached when somebody's deck is shorter than the grid.
 *
 * Every framework has eight slots or more, so a real deck fills this on its own
 * and these lines are never seen. When they are, padding beats showing two
 * previews and four holes, and the caller says where they came from rather than
 * letting somebody wonder why their carousel mentions editing.
 */
export const FILLER: readonly string[] = [
  "The mistake almost everyone makes here.",
  "Attention resets when the frame changes, not when the snare hits.",
  "Cut on movement, not on the beat.",
  "A hand leaving frame. A head turning. A door closing.",
  "Same footage, same music, completely different edit.",
  "Save this for your next one.",
];

export type PreviewDeck = {
  texts: string[];
  /** Positional, so `roles[i]` belongs to `texts[i]`. Undefined lets the cycle decide. */
  roles: (string | undefined)[];
  /** How many of the six are filler, so the caption can be honest about it. */
  borrowed: number;
};

/**
 * Their own deck first, padded only if it is too short.
 *
 * The roles of real slides are kept, because a hook should preview as a hook.
 * Filler gets no role at all: a pinned role on filler would spend a preview
 * repeating a layout the real slides already showed, and the entire point is
 * coverage.
 */
export function previewDeck(
  texts: readonly string[],
  roles: readonly string[] = [],
): PreviewDeck {
  // Index alignment matters here. Filtering blanks out of `texts` without
  // filtering the matching roles would slide every role up by one and preview
  // the wrong layouts, which is invisible until somebody counts.
  const real: { text: string; role: string | undefined }[] = [];
  texts.forEach((t, i) => {
    if (t.trim()) real.push({ text: t, role: roles[i] });
  });

  const out: PreviewDeck = {
    texts: real.map((r) => r.text),
    roles: real.map((r) => r.role),
    borrowed: Math.max(0, PREVIEW_COUNT - real.length),
  };

  while (out.texts.length < PREVIEW_COUNT) {
    out.texts.push(FILLER[out.texts.length % FILLER.length] ?? "");
    out.roles.push(undefined);
  }

  out.texts = out.texts.slice(0, PREVIEW_COUNT);
  out.roles = out.roles.slice(0, PREVIEW_COUNT);
  return out;
}
