/**
 * The deck as words: a transcript, a caption, and a first comment.
 *
 * ── Why a transcript exists at all ───────────────────────────────────────────
 *
 * Per-slide alt text on a carousel is **impossible**, not merely unimplemented.
 * LinkedIn's Documents API carries a `title` and nothing else, and Meta's API
 * excludes `alt_text` from carousel children, so the thing every accessibility
 * checklist asks for cannot be supplied through the published interface. An audit
 * of LinkedIn found it "will acknowledge the presence of a graphic but fail to
 * provide the corresponding alt text."
 *
 * A plain-text version of the deck, pasted into the caption or the first comment,
 * is the only fix available on either platform. Nobody ships it.
 *
 * ── Why this reads the LAYERS and not the source text ────────────────────────
 *
 * There is no source text. What is stored is what renders (invariant 1), so the
 * words on the slides are the only words there are, which is the right answer
 * anyway: a transcript that reflected the brief rather than the deck would
 * describe a carousel nobody published.
 *
 * Hidden layers are excluded. A hidden layer is not on the slide, so it is not in
 * the transcript, and a screen reader being told about something sighted readers
 * cannot see is worse than no transcript.
 *
 * ── Why the caption is deterministic ─────────────────────────────────────────
 *
 * This is the workflow experienced creators already hand-roll: "write the
 * carousel first, then pull the text post out of slides 1 and 2. You're forced to
 * fix the hook." Mechanising a rearrangement of words the user already approved
 * is honest. Asking a model to rewrite them would reintroduce the exact thing
 * people reject, and the deck is the source of truth, not a prompt.
 */

import type { Doc, Layer, Slide } from "./model.js";

/* ── reading the words off a slide ────────────────────────────────────────── */

const readable = (l: Layer): boolean =>
  l.kind === "text" && l.visible && (l.text ?? "").trim() !== "";

/**
 * One slide's copy, largest type first.
 *
 * Size order rather than z-order or position: the splitter emits a heading and
 * its body as two layers, and the heading is always the larger. Reading order on
 * a slide IS type hierarchy, that is what a type ladder is for.
 */
export function slideText(slide: Slide): string {
  const texts = slide.layers.filter(readable);
  if (texts.length === 0) return "";

  return [...texts]
    .sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0))
    .map((l) => normalise(l.text ?? "", Boolean(l.uppercase)))
    .join("\n");
}

/**
 * Soft line breaks become spaces; paragraph breaks survive.
 *
 * A break inside a headline is a LAYOUT decision, it is where the line wrapped
 * on a 1080px artboard, and carrying it into a caption produces a ragged post
 * that looks broken on a phone. Uppercase is undone for the same reason: it is
 * styling, and a screen reader spells out shouted text letter by letter.
 */
function normalise(text: string, wasUppercased: boolean): string {
  const flat = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((para) => para.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  // Only when the LAYER forced the case. Text somebody actually typed in capitals
  // is theirs to keep.
  return wasUppercased ? sentenceCase(flat) : flat;
}

/** Enough to undo a display-case override without mangling an acronym. */
function sentenceCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  const lower = text.toLowerCase();
  return lower.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, c: string) => lead + c.toUpperCase());
}

/** Every slide's copy, in order. Empty slides keep their place as empty strings. */
export const deckTexts = (doc: Doc): string[] => doc.slides.map(slideText);

/* ── the transcript ───────────────────────────────────────────────────────── */

export type TranscriptOptions = {
  /** Prefix each slide with its number. On by default: it is a carousel. */
  numbered?: boolean | undefined;
  /** A line above the whole thing, saying what this is. */
  heading?: string | undefined;
};

/**
 * The whole deck as plain text.
 *
 * Numbered because the artefact IS a sequence, a reader who cannot see the
 * slides still needs to know there were nine of them and which one they are in.
 * `1/` rather than `1.` because a full stop starts an ordered list in every
 * editor on both platforms and silently renumbers from 1.
 */
export function transcriptOf(doc: Doc, options: TranscriptOptions = {}): string {
  const numbered = options.numbered ?? true;

  const body = deckTexts(doc)
    .map((text, i) => (text ? { n: i + 1, text } : null))
    .filter((x): x is { n: number; text: string } => x !== null)
    .map(({ n, text }) => (numbered ? `${n}/ ${text}` : text))
    .join("\n\n");

  return options.heading ? `${options.heading}\n\n${body}` : body;
}

/* ── the caption ──────────────────────────────────────────────────────────── */

/**
 * Captions are truncated by the platform, not rejected, which is worse: the post
 * goes out with the CTA cut off and nothing says so.
 */
export const CAPTION_LIMIT: Record<string, number> = {
  linkedin: 3000,
  instagram: 2200,
  tiktok: 2200,
  x: 280,
};

export const captionLimit = (platform: string): number => CAPTION_LIMIT[platform] ?? 2200;

export type CaptionOptions = {
  /** Trimmed to this platform's ceiling. Absent means no trimming. */
  platform?: string | undefined;
  /** Append the closing slide as the call to action. On by default. */
  withCta?: boolean | undefined;
};

/**
 * The text post, pulled out of the deck.
 *
 * Slides 1 and 2 and the closer, in that order, because those are the three the
 * deck already uses to do this job: the hook earns the swipe, slide 2 states the
 * promise, and the last slide asks for the thing. A caption assembled from the
 * middle of a deck is a summary nobody asked for.
 *
 * The closer is dropped when it is one of the two already included, so a
 * three-slide carousel does not repeat itself.
 */
export function captionOf(doc: Doc, options: CaptionOptions = {}): string {
  const texts = deckTexts(doc);
  const used = new Set<number>();

  const take = (i: number): string | null => {
    const text = texts[i];
    if (!text || used.has(i)) return null;
    used.add(i);
    return text;
  };

  const parts = [take(0), take(1)];
  if (options.withCta ?? true) parts.push(take(texts.length - 1));

  const caption = parts.filter((p): p is string => Boolean(p)).join("\n\n");
  return options.platform ? clamp(caption, captionLimit(options.platform)) : caption;
}

/**
 * Trims on a word boundary and says it was trimmed.
 *
 * An ellipsis rather than a hard cut: a caption that stops mid-word reads as a
 * bug, and one that stops mid-sentence with a marker reads as a choice.
 */
export function clamp(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/* ── the first comment ────────────────────────────────────────────────────── */

/**
 * What goes underneath.
 *
 * The transcript, with a line saying what it is. The label matters: without it a
 * numbered wall of text under your own post looks like a bot, and with it it
 * looks like the accessibility note it is.
 */
export function firstCommentOf(doc: Doc, options: CaptionOptions = {}): string {
  const text = transcriptOf(doc, { heading: "Full text of the carousel, for anyone who needs it:" });
  return options.platform ? clamp(text, captionLimit(options.platform)) : text;
}

/** Roughly how much of the platform's allowance a draft is using. */
export const captionFit = (text: string, platform: string): { used: number; limit: number; over: boolean } => {
  const limit = captionLimit(platform);
  return { used: text.length, limit, over: text.length > limit };
};
