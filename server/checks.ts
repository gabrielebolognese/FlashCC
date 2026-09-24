/**
 * Everything that can go wrong with model output, checked where it matters.
 *
 * These rules lived in `scripts/eval-draft.mjs`, which costs real money per run
 * and is therefore outside `npm test` and run by hand. It found two real defects
 * before they shipped, which is the argument for running the same rules on every
 * response instead of on the days somebody remembers.
 *
 * ── Three tiers, and the difference between them is the whole design ─────────
 *
 * **Repair** is fixed silently and always. Punctuation the house style does not
 * use. Nobody needs telling.
 *
 * **Retry** is one more call with the failure named. A refused draft leaves
 * somebody with nothing after fifteen seconds and the fault is usually one
 * slide; one retry costs one call and fixes most of them.
 *
 * **Flag** is passed through and surfaced. Used only where the check CANNOT be
 * certain: a number absent from the brief is usually invented and occasionally
 * correct, and a product that deletes a customer's correct number is worse than
 * one that points at it.
 *
 * Nothing here judges whether the writing is good. Every rule is a defect
 * anybody would recognise as a defect.
 */
import { BODY_CHARS, HOOK_CHARS, MAX_ALT_CHARS, plainText, type SlotSpec } from "./prompts.js";

export type Tier = "repair" | "retry" | "flag";

export type Finding = {
  /** Which slide, or -1 when it is about the answer as a whole. */
  at: number;
  tier: Tier;
  /** Stable, for counting. Never shown to anybody. */
  code: string;
  /** Shown to somebody, so it says what to do rather than what happened. */
  message: string;
  /** The exact text that triggered it, for highlighting. */
  detail?: string;
};

/* ── the repair tier ──────────────────────────────────────────────────────── */

/**
 * Punctuation this product does not use, removed without comment.
 *
 * `plainText` already handled the dashes and is used in five routes, so this
 * extends rather than replaces it. The additions are the ones that arrive from
 * a model trained on the web: curly quotes where the house uses straight, and
 * the double spaces and trailing whitespace that survive a rewrite.
 */
export const repair = (text: string): string =>
  plainText(text)
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[   ]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .trim();

/* ── the rules ────────────────────────────────────────────────────────────── */

const PLACEHOLDERS = ["your hook", "your cta", "type something", "lorem", "insert ", "xxx", "tbd"];

/**
 * A measurement: currency, a percentage, a multiplier, or a number welded to a
 * unit of time. Those are claims.
 *
 * **Bare integers are deliberately ignored.** The first version of this flagged
 * every educational draft for hooks like "3 cutting rules", which is a deck
 * counting its own slides rather than a fabrication. Nothing separates the two
 * by pattern, and a check that is usually wrong is one nobody reads.
 */
const MEASURE =
  /[$£€]\s?\d[\d,.]*k?|\d[\d,.]*\s?%|\d+\s?x\b|\d+[-\s](?:second|minute|hour|day|week|month|year)s?\b/gi;

const letters = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Measurements in the answer that the source never gave. */
export function inventedMeasures(texts: readonly string[], source: string): Finding[] {
  const known = new Set((source.match(MEASURE) ?? []).map((m) => m.toLowerCase()));
  const out: Finding[] = [];

  texts.forEach((text, at) => {
    for (const m of text.match(MEASURE) ?? []) {
      if (known.has(m.toLowerCase())) continue;
      out.push({
        at,
        tier: "flag",
        code: "measure-not-in-brief",
        message: `"${m}" is not in your brief. Check it before this goes out.`,
        detail: m,
      });
      // One per slide. Three findings on one line is noise, not information.
      break;
    }
  });

  return out;
}

export type DraftSlide = { role: string; text: string };

export function checkDraft(
  slides: readonly DraftSlide[],
  slots: readonly SlotSpec[],
  brief: string,
): Finding[] {
  const out: Finding[] = [];
  const texts = slides.map((s) => (s.text ?? "").trim());

  if (slides.length !== slots.length) {
    out.push({
      at: -1,
      tier: "retry",
      code: "slot-count",
      message: `${slides.length} slides for ${slots.length} slots.`,
    });
  }

  texts.forEach((t, at) => {
    if (!t) {
      out.push({ at, tier: "retry", code: "empty-slide", message: "This slide came back empty." });
      return;
    }

    const low = t.toLowerCase();
    const found = PLACEHOLDERS.find((p) => low.includes(p));
    if (found) {
      out.push({
        at,
        tier: "retry",
        code: "placeholder",
        message: "This is a placeholder, not finished copy.",
        detail: found,
      });
    }

    const ceiling = at === 0 ? HOOK_CHARS : BODY_CHARS;
    if (t.length > ceiling) {
      out.push({
        at,
        tier: "retry",
        code: "over-ceiling",
        message: `${t.length} characters, over the ${ceiling} this slot allows.`,
      });
    }
  });

  const ids = new Set(slots.map((s) => s.id));
  slides.forEach((s, at) => {
    if (!ids.has(s.role)) {
      out.push({
        at,
        tier: "retry",
        code: "unknown-slot",
        message: `"${s.role}" is not a slot in this framework.`,
      });
    }
  });

  // Adjacent only. A deck that returns to an idea later is writing; two slides
  // in a row saying the same thing is the oldest generation bug in this
  // codebase and the one a reader notices first.
  for (let i = 1; i < texts.length; i += 1) {
    const a = letters(texts[i - 1] ?? "");
    const b = letters(texts[i] ?? "");
    if (a && a === b) {
      out.push({
        at: i,
        tier: "retry",
        code: "duplicate-slide",
        message: "This slide says the same thing as the one before it.",
      });
    }
  }

  return [...out, ...inventedMeasures(texts, brief)];
}

export type HookVariant = { angle: string; text: string };

export function checkHooks(hooks: readonly HookVariant[], deck: readonly string[]): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();

  hooks.forEach((h, at) => {
    const text = (h.text ?? "").trim();
    if (!text) {
      out.push({ at, tier: "retry", code: "empty-hook", message: "An opening came back empty." });
      return;
    }
    if (text.length > HOOK_CHARS) {
      out.push({
        at,
        tier: "retry",
        code: "over-ceiling",
        message: `${text.length} characters, over ${HOOK_CHARS}.`,
      });
    }
    const key = letters(text);
    if (seen.has(key)) {
      out.push({ at, tier: "retry", code: "duplicate-hook", message: "Two openings are the same." });
    }
    seen.add(key);
  });

  return [...out, ...inventedMeasures(hooks.map((h) => h.text ?? ""), deck.join(" "))];
}

export type CaptionOption = { note: string; text: string };

export function checkCaption(
  captions: readonly CaptionOption[],
  spec: { limit: number },
  deck: readonly string[],
): Finding[] {
  const out: Finding[] = [];

  captions.forEach((c, at) => {
    const text = (c.text ?? "").trim();
    if (!text) {
      out.push({ at, tier: "retry", code: "empty-caption", message: "A caption came back empty." });
      return;
    }
    if (text.length > spec.limit) {
      out.push({
        at,
        tier: "retry",
        code: "over-ceiling",
        message: `${text.length} characters, over the ${spec.limit} this platform allows.`,
      });
    }
    // The prompt says hashtags come back separately. One inside the text is a
    // caption somebody has to unpick before posting.
    if (/#\w/.test(text)) {
      out.push({
        at,
        tier: "retry",
        code: "hashtag-inline",
        message: "A hashtag ended up inside the caption.",
      });
    }
    if (/^\s*(swipe|read on|here is a thread|here's a thread)/i.test(text)) {
      out.push({
        at,
        tier: "retry",
        code: "swipe-opener",
        message: "It opens by telling somebody to swipe, which wastes the only line they read.",
      });
    }
  });

  return [...out, ...inventedMeasures(captions.map((c) => c.text ?? ""), deck.join(" "))];
}

export function checkAlt(alt: readonly string[], slideCount: number): Finding[] {
  const out: Finding[] = [];

  if (alt.length !== slideCount) {
    out.push({
      at: -1,
      tier: "retry",
      code: "alt-count",
      message: `${alt.length} descriptions for ${slideCount} slides.`,
    });
  }

  alt.forEach((a, at) => {
    const text = (a ?? "").trim();
    if (text.length > MAX_ALT_CHARS) {
      out.push({
        at,
        tier: "retry",
        code: "over-ceiling",
        message: `${text.length} characters, over the ${MAX_ALT_CHARS} a screen reader reads.`,
      });
    }
    // A preamble repeated on every slide is most of a 125 character budget
    // spent saying nothing, repeatedly.
    if (/^\s*(image of|slide showing|text (saying|reading)|a graphic|this slide)/i.test(text)) {
      out.push({
        at,
        tier: "retry",
        code: "alt-preamble",
        message: "It opens with a preamble the reader does not need.",
      });
    }
  });

  return out;
}

export type RewriteOption = { note: string; text: string };

export function checkRewrite(
  options: readonly RewriteOption[],
  original: string,
  limit: number,
): Finding[] {
  const out: Finding[] = [];
  const now = letters(original);
  const seen = new Set<string>();
  const notes = new Set<string>();

  options.forEach((o, at) => {
    const text = (o.text ?? "").trim();
    if (!text) {
      out.push({ at, tier: "retry", code: "empty-option", message: "An option came back empty." });
      return;
    }
    if (text.length > limit) {
      out.push({
        at,
        tier: "retry",
        code: "over-ceiling",
        message: `${text.length} characters, over ${limit}.`,
      });
    }
    const key = letters(text);
    if (key === now) {
      out.push({ at, tier: "retry", code: "unchanged", message: "This is the line you already had." });
    }
    if (seen.has(key)) {
      out.push({ at, tier: "retry", code: "duplicate-option", message: "Two options are the same." });
    }
    seen.add(key);

    const note = letters(o.note ?? "");
    if (!note) {
      out.push({ at, tier: "retry", code: "no-note", message: "An option does not say what it did." });
    } else if (notes.has(note)) {
      out.push({ at, tier: "retry", code: "duplicate-note", message: "Two options claim the same thing." });
    }
    notes.add(note);
  });

  return out;
}

export type Angle = { title: string; brief: string; why: string };

export function checkDistil(angles: readonly Angle[], quotes: readonly string[]): Finding[] {
  const out: Finding[] = [];

  if (angles.length < 3) {
    out.push({
      at: -1,
      tier: "flag",
      code: "few-angles",
      message: `Only ${angles.length} angle${angles.length === 1 ? "" : "s"} came back. Your source may be thinner than it looks.`,
    });
  }

  const titles = new Set<string>();
  angles.forEach((a, at) => {
    if (!a.title?.trim() || !a.brief?.trim() || !a.why?.trim()) {
      out.push({ at, tier: "retry", code: "angle-incomplete", message: "An angle is missing a part." });
    }
    const key = letters(a.title ?? "");
    if (key && titles.has(key)) {
      out.push({ at, tier: "retry", code: "duplicate-angle", message: "Two angles have the same title." });
    }
    titles.add(key);
  });

  /*
   * Flag, not retry. Quotes are dropped by `verbatimOnly` when they do not
   * match, so "none left" can mean the source had nothing quotable OR that
   * everything was tidied. Retrying the second would help; retrying the first
   * spends a call to be told the same thing.
   */
  if (quotes.length === 0) {
    out.push({
      at: -1,
      tier: "flag",
      code: "no-quotes",
      message: "No line survived checking word for word, so nothing is offered as a quote.",
    });
  }

  return out;
}

/**
 * Adjectives that describe every piece of writing anybody has ever praised.
 *
 * A voice made of these is a voice that fits everybody, which is the same as
 * describing nobody. The prompt rules them out; this catches it when the prompt
 * does not hold.
 */
const EMPTY_TRAIT = /^(very |quite |fairly )?(direct|punchy|engaging|conversational|concise|clear|authentic|relatable|compelling)/i;

export function checkVoice(
  observed: readonly { trait: string; evidence: string }[],
  tone: string,
): Finding[] {
  const out: Finding[] = [];

  if (!tone.trim()) {
    out.push({ at: -1, tier: "retry", code: "no-tone", message: "No description came back." });
  }

  if (observed.length < 3) {
    out.push({
      at: -1,
      tier: "flag",
      code: "few-traits",
      message: `Only ${observed.length} trait${observed.length === 1 ? "" : "s"} could be backed up by your own decks.`,
    });
  }

  observed.forEach((o, at) => {
    if (EMPTY_TRAIT.test(o.trait.trim())) {
      out.push({
        at,
        tier: "retry",
        code: "vague-trait",
        message: `"${o.trait}" describes almost any writing. It needs to say what you actually do.`,
        detail: o.trait,
      });
    }
  });

  return out;
}

/* ── acting on them ───────────────────────────────────────────────────────── */

export const flagged = (findings: readonly Finding[]): Finding[] =>
  findings.filter((f) => f.tier === "flag");

export const retryable = (findings: readonly Finding[]): Finding[] =>
  findings.filter((f) => f.tier === "retry");

/**
 * What to tell the model went wrong, on the one retry it gets.
 *
 * Named specifically rather than "try again": a model told its answer was
 * unsatisfactory produces a different unsatisfactory answer, and a model told
 * slide four is empty and the hook is 112 characters fixes those two things.
 */
export function retryNote(findings: readonly Finding[]): string {
  const lines = retryable(findings).map((f) =>
    f.at >= 0 ? `- Item ${f.at + 1}: ${f.message}` : `- ${f.message}`,
  );

  return [
    "Your previous answer had these problems. Fix exactly these and change nothing else:",
    ...lines,
  ].join("\n");
}

/**
 * One extra call, ever, whatever happens.
 *
 * **The cap is the point of this function.** `callModel` already retries
 * transport failures, so a content retry wrapped naively around it gives two
 * times two calls, which is precisely what the comment in `anthropic.ts` warns
 * about: two layers of retry on a paid call is how one failure becomes four
 * charges. `run` is called at most twice from here, and the second time only
 * when the first produced something worth fixing.
 *
 * Pure of the network, so the cap itself is testable without a key.
 */
export async function withContentRetry<T>(
  // The previous answer goes with the note, because the note says "Item 1" and
  // that means nothing to a model which cannot see what item 1 was.
  run: (retry: { note: string; previous: T } | undefined) => Promise<T>,
  check: (out: T) => Finding[],
): Promise<{ out: T; findings: Finding[]; retried: boolean }> {
  const first = await run(undefined);
  const findings = check(first);

  if (retryable(findings).length === 0) return { out: first, findings, retried: false };

  const second = await run({ note: retryNote(findings), previous: first });
  const after = check(second);

  /*
   * Whichever answer is better, not whichever came second. A retry usually
   * improves things and occasionally makes them worse, and there is no reason
   * to prefer the later one when it has more wrong with it than the first.
   */
  return retryable(after).length < retryable(findings).length
    ? { out: second, findings: after, retried: true }
    : { out: first, findings, retried: true };
}
