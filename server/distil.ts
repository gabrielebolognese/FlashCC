/**
 * Reading something somebody already has, and finding the carousels in it.
 *
 * ── It returns angles, not a deck ────────────────────────────────────────────
 *
 * A six thousand word transcript contains five carousels. A route that returns
 * one has silently thrown four away and made the choice on somebody's behalf,
 * and they will never know what the other four were. So it returns three to
 * five angles, each with the brief that would produce it and a line saying what
 * in the source supports it.
 *
 * ── It does not replace `longform.ts` ────────────────────────────────────────
 *
 * That path is deterministic, free, needs no key, and rearranges words somebody
 * already approved. It is the right answer when the source is already written
 * the way they want it. This one is for raw material: a transcript full of
 * filler, an article somebody else wrote, a page of notes.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { anthropic, callModel, draftConfigured, MODELS } from "./anthropic.js";
import { bearer, HttpError, json, rateLimit, readJson } from "./http.js";
import {
  assembleDistil,
  plainText,
  SOURCE_KINDS,
  type SourceKind,
  type Structure,
  type Voice,
} from "./prompts.js";
import { requirePro } from "./supabase.js";

/**
 * Lower than every other route, and for a reason worth stating.
 *
 * Forty thousand characters go in on every call and none of it caches, because
 * the source IS the request. One call here costs what thirty rewrites cost. It
 * is still not a credit: it does not count down, does not appear anywhere, and
 * nobody working normally will meet it.
 */
const DISTILS_PER_HOUR = 20;
const HOUR_MS = 3_600_000;

const DistilSchema = z.object({
  brief: z.string().describe("The most obvious carousel this source could become, as a brief"),
  angles: z
    .array(
      z.object({
        title: z.string().describe("A short title for this angle"),
        brief: z.string().describe("The brief that would produce this carousel"),
        why: z.string().describe("What in the source supports it"),
      }),
    )
    .describe("Three to five genuinely different carousels this source could become"),
  quotes: z
    .array(z.string())
    .describe("The source's most quotable lines, copied exactly, character for character"),
});

type DistilRequest = {
  source?: string;
  kind?: string;
  structure?: Structure;
  voice?: Voice;
};

const isKind = (v: unknown): v is SourceKind =>
  typeof v === "string" && (SOURCE_KINDS as readonly string[]).includes(v);

/**
 * The characters that differ between what somebody pasted and what a model
 * typed back, without either of them meaning anything different.
 *
 * Curly and straight quotes, the various dashes and spaces, and runs of
 * whitespace. **This is not fuzzy matching and it is not "close enough".** Every
 * pair here is the same character wearing a different code point, and without
 * this step nearly every real quote fails on an apostrophe.
 */
const canonical = (text: string): string =>
  text
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Only the quotes the source actually contains.
 *
 * A model asked for verbatim will occasionally tidy one: fix a comma, drop a
 * filler word, join two sentences that were apart. A quote in somebody's
 * carousel, attributed to a transcript that does not contain it, is the failure
 * that actually hurts, and it is checkable for free.
 *
 * **No repair, no fuzzy match, no nearest neighbour. Dropped.** Anything else is
 * this function deciding what somebody said.
 *
 * Note what does NOT run on these: `plainText`, which turns em dashes into
 * commas everywhere else in this codebase. Cleaning a quote would alter the one
 * text in the product whose whole value is being unaltered, and would then fail
 * its own check.
 */
export function verbatimOnly(quotes: readonly string[], source: string): string[] {
  const haystack = canonical(source);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of quotes) {
    const quote = raw.trim();
    // Too short to be a quote, and short strings match by accident.
    if (quote.length < 12) continue;

    const key = canonical(quote);
    if (!key || !haystack.includes(key)) continue;

    /*
     * Matched strictly, deduplicated loosely, and the two keys are different on
     * purpose.
     *
     * The match has to stay exact: that is the entire promise. But the same
     * sentence returned twice, once with a trailing full stop, passes the match
     * both times and would show somebody two cards saying the same thing. The
     * dedup key drops punctuation so those collapse, without ever loosening
     * what counts as present in the source.
     */
    const dedup = key.replace(/[^a-z0-9 ]+/g, "").trim();
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    out.push(quote);
  }

  return out;
}

export async function distil(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!draftConfigured()) {
    throw new HttpError(
      503,
      "No ANTHROPIC_API_KEY. Copy .env.example to .env, add your key, and restart the server.",
    );
  }

  const caller = await requirePro(bearer(req), "Reading a source");
  rateLimit(`distil:${caller.id}`, DISTILS_PER_HOUR, HOUR_MS);

  // Room for the whole ceiling plus the rest of the envelope, and no more.
  const body = await readJson<DistilRequest>(req, 400_000);

  const source = (body?.source ?? "").trim();
  if (source.length < 200) {
    throw new HttpError(400, "That is too short to read. Paste the whole thing, or write a brief instead.");
  }

  const { system, user, clipped } = assembleDistil({
    source,
    ...(isKind(body.kind) ? { kind: body.kind } : {}),
    ...(body.structure ? { structure: body.structure } : {}),
    ...(body.voice ? { voice: body.voice } : {}),
  });

  const response = await callModel("distil", MODELS.distil, () =>
    anthropic().messages.parse({
      model: MODELS.distil,
      max_tokens: 8000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "medium", format: zodOutputFormat(DistilSchema) },
      messages: [{ role: "user", content: user }],
    }),
  );

  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "the request was declined";
    throw new HttpError(422, `Claude declined this source: ${why}`);
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, "The source came back unreadable");

  const angles = parsed.angles
    .map((a) => ({
      title: plainText(a.title),
      brief: plainText(a.brief),
      why: plainText(a.why),
    }))
    .filter((a) => a.title && a.brief)
    .slice(0, 5);

  if (angles.length === 0) throw new HttpError(502, "Nothing usable came back from that source");

  json(res, 200, {
    brief: plainText(parsed.brief),
    angles,
    // Checked against what was actually SENT, not against the whole source: a
    // quote from the clipped tail is one the model could not have read, so a
    // match there would mean something has gone wrong rather than right.
    quotes: verbatimOnly(parsed.quotes, clipped.text),
    used: clipped.used,
    total: clipped.total,
    clipped: clipped.clipped,
  });
}
