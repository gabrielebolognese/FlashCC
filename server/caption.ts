/**
 * The words that go around the deck: the caption, and the alt text.
 *
 * Both read the carousel and nothing else, which is what makes them cheap to
 * offer: there is no new input to collect and no new screen to fill in.
 *
 * ── Two routes, not one with a mode flag ─────────────────────────────────────
 *
 * They differ by model, by ceiling, by output shape and by where the answer is
 * consumed. A `mode` that switched all four would be two routes sharing a door,
 * and the door would be the only thing they had in common.
 *
 * ── What this does not do ────────────────────────────────────────────────────
 *
 * No posting, no hashtag volume, no reach estimate, no best-time-to-post. The
 * roadmap rejected all four on evidence and none of them becomes a better idea
 * for being next to a caption box.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { anthropic, callModel, draftConfigured, MODELS } from "./anthropic.js";
import { bearer, HttpError, json, rateLimit, readJson } from "./http.js";
import {
  assembleAlt,
  assembleCaption,
  CAPTION_PLATFORMS,
  MAX_ALT_CHARS,
  PLATFORM_CAPTION,
  plainText,
  shortNote,
  type CaptionPlatform,
  type Voice,
} from "./prompts.js";
import { checkAlt, checkCaption, repair } from "./checks.js";
import { requirePro } from "./supabase.js";
import { countFindings } from "./tally.js";

const CAPTIONS_PER_HOUR = 120;
const HOUR_MS = 3_600_000;

const noKey = (): HttpError =>
  new HttpError(
    503,
    "No ANTHROPIC_API_KEY. Copy .env.example to .env, add your key, and restart the server.",
  );

/* ── the caption ──────────────────────────────────────────────────────────── */

const CaptionSchema = z.object({
  captions: z
    .array(
      z.object({
        note: z.string().describe("At most four words naming what this caption did"),
        text: z.string().describe("The finished caption, ready to post, with no hashtags in it"),
      }),
    )
    .describe("Distinct captions for the same carousel"),
  hashtags: z
    .array(z.string())
    .describe("Hashtags drawn from what the carousel is actually about, without the # symbol"),
});

type CaptionRequest = {
  deck?: string[];
  platform?: string;
  framework?: string;
  cta?: string;
  count?: number;
  voice?: Voice;
};

const isPlatform = (v: unknown): v is CaptionPlatform =>
  typeof v === "string" && (CAPTION_PLATFORMS as readonly string[]).includes(v);

/**
 * One hashtag, or nothing.
 *
 * Normalised rather than rejected on shape, because a model asked for "no #
 * symbol" supplies one about a third of the time and that is not worth a retry.
 * What IS rejected is anything with whitespace or punctuation left in it: a
 * "hashtag" that cannot be pasted into a post is not a hashtag.
 */
export function tidyTag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, "").replace(/\s+/g, "");
  if (!tag || tag.length > 40) return null;
  return /^[A-Za-z0-9_]+$/.test(tag) ? tag : null;
}

/**
 * Keeps only the tags the carousel can actually support.
 *
 * A caption writer left alone returns #marketing, #contentcreation and #growth
 * every time. They describe nothing, they reach nobody, and they are the
 * fabrication problem in a different costume: words asserted about somebody's
 * post that their post does not contain.
 *
 * So a tag survives only if its letters appear in the deck. Checked with the
 * deck's own separators stripped, so "beat-matched" supports #beatmatched and a
 * two-word phrase supports its concatenation, which is how hashtags are written.
 */
export function groundedTags(tags: readonly string[], deck: readonly string[], max: number): string[] {
  // Separators stripped, so a two-word phrase in the deck supports the closed-up
  // tag people actually write: "cut on movement" supports #cutonmovement.
  const haystack = deck.join(" ").toLowerCase().replace(/[^a-z0-9]/g, "");
  // The deck's words in ORDER, because `phraseIn` needs adjacency, not a set.
  const words = deck.join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const stems = new Set(words.filter((w) => w.length >= 3).map(stem));

  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of tags) {
    const tag = tidyTag(raw);
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    // Three ways to be grounded, cheapest first. Substring alone rejected
    // #editing on a deck that says "edits", and substring plus single-word
    // stemming still rejected #cuttingonmovement on a deck that says "Cut on
    // movement", which left LinkedIn with no hashtags at all.
    if (!haystack.includes(key) && !stems.has(stem(key)) && !phraseIn(key, words)) continue;

    seen.add(key);
    out.push(tag);
    if (out.length >= max) break;
  }

  return out;
}

/**
 * Crude, and deliberately so.
 *
 * Enough to see that "edit", "edits" and "editing" are one word, and not enough
 * to claim to be a stemmer. It exists for one comparison in one filter, and a
 * real stemming library here would be a dependency bought to make a hashtag
 * slightly more generous.
 *
 * The doubled-consonant rule is what makes "cutting" reach "cut" rather than
 * stopping at "cutt".
 */
/**
 * Whether a closed-up tag is a phrase the deck actually says.
 *
 * A hashtag has no spaces, so "cutonthebeat" cannot be split by looking at it.
 * Rather than guessing at a split, this walks the deck's own word sequence and
 * asks whether any run of consecutive words closes up to the tag.
 *
 * **Adjacency is the guard, and it replaced a length rule that did not work.**
 * The first version accepted any tag assembled from deck words and needed a
 * "one word of five letters or more" test to stop a deck containing "the",
 * "and" and "not" from grounding #theandnot. That test also rejected
 * #cutonthebeat, whose longest word is four letters and which is a real phrase
 * from the deck. Requiring the words to be CONSECUTIVE separates the two
 * without measuring anything: "cut on the beat" is in the deck, "the and not"
 * is not.
 *
 * Stemmed on the deck side, so "cutting on the beat" supports #cutonthebeat. A
 * tag that merges two separate phrases is not grounded, and that is correct:
 * the deck never said it.
 */
export function phraseIn(tag: string, words: readonly string[]): boolean {
  for (let i = 0; i < words.length; i += 1) {
    let raw = "";
    let stemmed = "";

    for (let j = i; j < words.length; j += 1) {
      raw += words[j];
      stemmed += stem(words[j]!);
      // Both runs only grow, so once each is past the tag there is nothing
      // further along this start position worth trying.
      if (raw.length > tag.length && stemmed.length > tag.length) break;
      if (raw === tag || stemmed === tag) return true;
    }
  }

  return false;
}

export function stem(word: string): string {
  let w = word.toLowerCase();
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  if (w.length > 3 && /([bcdfgklmnprst])\1$/.test(w)) w = w.slice(0, -1);
  return w;
}

export async function caption(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!draftConfigured()) throw noKey();

  const caller = await requirePro(bearer(req), "Writing captions");
  rateLimit(`caption:${caller.id}`, CAPTIONS_PER_HOUR, HOUR_MS);

  const body = await readJson<CaptionRequest>(req, 200_000);

  const deck = Array.isArray(body?.deck) ? body.deck.filter((t) => t.trim()) : [];
  if (deck.length === 0) throw new HttpError(400, "The carousel has no copy to work from");

  if (!isPlatform(body.platform)) {
    throw new HttpError(400, `Unknown platform: ${String(body.platform)}`);
  }

  const spec = PLATFORM_CAPTION[body.platform];
  const count = Math.min(3, Math.max(1, Math.round(body.count ?? 2)));

  const { system, user } = assembleCaption({
    deck,
    platform: body.platform,
    count,
    ...(body.framework ? { framework: body.framework } : {}),
    ...(body.cta ? { cta: body.cta } : {}),
    ...(body.voice ? { voice: body.voice } : {}),
  });

  const response = await callModel("caption", MODELS.caption, () =>
    anthropic().messages.parse({
      model: MODELS.caption,
      max_tokens: 4000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "medium", format: zodOutputFormat(CaptionSchema) },
      messages: [{ role: "user", content: user }],
    }),
  );

  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "the request was declined";
    throw new HttpError(422, `Claude declined this carousel: ${why}`);
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, "The caption came back unreadable");

  const captions = parsed.captions
    .map((c) => {
      const text = repair(c.text);
      return { note: shortNote(repair(c.note)), text, chars: text.length };
    })
    .filter((c) => c.text.length > 0)
    .slice(0, count);

  if (captions.length === 0) throw new HttpError(502, "The caption came back empty");

  countFindings("caption", checkCaption(captions, spec, deck));

  json(res, 200, {
    captions,
    hashtags: groundedTags(parsed.hashtags, deck, spec.hashtags),
    // The ceiling and the fold come back with the answer rather than being a
    // second copy of the same numbers in the browser. Same reasoning as the
    // rewrite route's `limit`.
    limit: spec.limit,
    ...(spec.fold ? { fold: spec.fold } : {}),
  });
}

/* ── alt text ─────────────────────────────────────────────────────────────── */

const AltSchema = z.object({
  alt: z
    .array(z.string())
    .describe("One description per slide, in order, each under 125 characters"),
});

type AltRequest = { deck?: string[] };

export async function alt(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!draftConfigured()) throw noKey();

  const caller = await requirePro(bearer(req), "Writing alt text");
  rateLimit(`caption:${caller.id}`, CAPTIONS_PER_HOUR, HOUR_MS);

  const body = await readJson<AltRequest>(req, 200_000);
  const deck = Array.isArray(body?.deck) ? body.deck : [];
  if (deck.length === 0) throw new HttpError(400, "There are no slides to describe");

  const { system, user } = assembleAlt(deck);

  const response = await callModel("alt", MODELS.alt, () =>
    anthropic().messages.parse({
      model: MODELS.alt,
      max_tokens: 4000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      // No `effort`. Haiku 4.5 rejects the parameter with a 400, which is how
      // /api/hooks was broken for a whole batch without anybody noticing.
      output_config: { format: zodOutputFormat(AltSchema) },
      messages: [{ role: "user", content: user }],
    }),
  );

  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "the request was declined";
    throw new HttpError(422, `Claude declined this carousel: ${why}`);
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, "The alt text came back unreadable");

  /*
   * Padded and truncated to the slide count, because this is read POSITIONALLY.
   *
   * A model that returns eight descriptions for nine slides would otherwise put
   * slide 9's alt text on slide 8 and leave slide 9 with somebody else's, and
   * every slide after the short one would be wrong. An empty string is a slide
   * with no alt text, which is recoverable; a shifted one is not, because
   * nothing about it looks wrong.
   */
  const out = Array.from({ length: deck.length }, (_, i) => {
    const text = repair(parsed.alt[i] ?? "");
    return text.length > MAX_ALT_CHARS ? `${text.slice(0, MAX_ALT_CHARS - 1).trimEnd()}…` : text;
  });

  // Checked against what the model returned rather than the padded array, so a
  // short answer is counted as a short answer rather than hidden by the padding
  // that fixes it.
  countFindings("alt", checkAlt(parsed.alt, deck.length));

  json(res, 200, { alt: out, limit: MAX_ALT_CHARS });
}
