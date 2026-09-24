/**
 * Rewriting one line, which is the thing that sat between the two routes.
 *
 * `/api/draft` takes a brief and returns a deck. `/api/hooks` takes a deck and
 * returns openings for slide one. Between them there was nothing, so a slide
 * four that was nearly right had to be fixed by hand or by redrafting the whole
 * carousel and throwing away the seven slides that were fine.
 *
 * Like every other route here it returns **words**. Invariant 5: the layout is
 * recomputed from the new text by `compositions.ts`, on the client, through
 * `restateSlide`. Nothing in this file knows a slide has a size.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { anthropic, callModel, draftConfigured, MODELS } from "./anthropic.js";
import { bearer, HttpError, json, rateLimit, readJson } from "./http.js";
import {
  assembleRewrite,
  limitFor,
  MAX_REWRITE_COUNT,
  MIN_REWRITE_COUNT,
  plainText,
  REWRITE_INTENTS,
  shortNote,
  type RewriteIntent,
  type SlotSpec,
  type Voice,
} from "./prompts.js";
import { checkRewrite, repair } from "./checks.js";
import { requirePro } from "./supabase.js";
import { countFindings } from "./tally.js";

/**
 * Higher than drafting by a wide margin, and that is the point.
 *
 * This is meant to be pressed twenty times in a session while somebody works a
 * line into shape. A ceiling anybody meets during ordinary use is a credit
 * system wearing a different name, and invariant 7 says there are none. It
 * exists so one script cannot spend a month of margin in an afternoon.
 */
const REWRITES_PER_HOUR = 300;
const HOUR_MS = 3_600_000;

const RewriteSchema = z.object({
  options: z
    .array(
      z.object({
        note: z
          .string()
          .describe("Two or three words naming what this alternative did, e.g. 'tighter', 'names the cost'"),
        text: z.string().describe("The finished replacement line, ready to publish"),
      }),
    )
    .describe("Distinct rewrites of the same line, each taking a genuinely different approach"),
});

type RewriteRequest = {
  text?: string;
  intent?: string;
  instruction?: string;
  slot?: SlotSpec;
  deck?: string[];
  count?: number;
  limit?: number;
  voice?: Voice;
};

const isIntent = (v: unknown): v is RewriteIntent =>
  typeof v === "string" && (REWRITE_INTENTS as readonly string[]).includes(v);

export async function rewrite(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!draftConfigured()) {
    throw new HttpError(
      503,
      "No ANTHROPIC_API_KEY. Copy .env.example to .env, add your key, and restart the server.",
    );
  }

  const caller = await requirePro(bearer(req), "Rewriting");
  rateLimit(`rewrite:${caller.id}`, REWRITES_PER_HOUR, HOUR_MS);

  const body = await readJson<RewriteRequest>(req, 200_000);

  const text = (body?.text ?? "").trim();
  if (!text) throw new HttpError(400, "There is no line to rewrite");

  // An unknown intent is a client that has drifted from the server, and guessing
  // at one would silently rewrite somebody's line in a way they did not ask for.
  if (!isIntent(body.intent)) {
    throw new HttpError(400, `Unknown rewrite intent: ${String(body.intent)}`);
  }

  const count = Math.min(
    MAX_REWRITE_COUNT,
    Math.max(MIN_REWRITE_COUNT, Math.round(body.count ?? 3)),
  );

  const { system, user } = assembleRewrite({
    text,
    intent: body.intent,
    count,
    ...(body.instruction ? { instruction: body.instruction } : {}),
    ...(body.slot ? { slot: body.slot } : {}),
    ...(Array.isArray(body.deck) ? { deck: body.deck } : {}),
    ...(typeof body.limit === "number" ? { limit: body.limit } : {}),
    ...(body.voice ? { voice: body.voice } : {}),
  });

  const response = await callModel("rewrite", MODELS.rewrite, () =>
    anthropic().messages.parse({
      model: MODELS.rewrite,
      max_tokens: 2000,
      // Identical for every rewrite anybody makes, so it caches across users and
      // not merely across one person's session.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      // Haiku 4.5 rejects `effort` with a 400. See the same note in draft.ts.
      output_config: { format: zodOutputFormat(RewriteSchema) },
      messages: [{ role: "user", content: user }],
    }),
  );

  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "the request was declined";
    throw new HttpError(422, `Claude declined this line: ${why}`);
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, "The rewrite came back unreadable");

  /*
   * Dropped rather than repaired: an alternative identical to another
   * alternative is not a choice, and three cards saying the same thing is
   * exactly what makes this kind of feature feel like a slot machine.
   *
   * The original line is NOT filtered out here. The client shows it pinned as
   * "Now", and an option that matches it is dropped there, where the comparison
   * can be made against what the user is actually looking at.
   */
  const seen = new Set<string>();
  const options = parsed.options
    .map((o) => ({ note: shortNote(repair(o.note)), text: repair(o.text) }))
    .filter((o) => {
      const key = o.text.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, count);

  if (options.length === 0) throw new HttpError(502, "The rewrite came back empty");

  countFindings("rewrite", checkRewrite(options, text, limitFor(body.slot, body.limit)));

  /*
   * The ceiling goes back with the answer.
   *
   * The browser needs it to mark an option that overshot, and the alternative
   * was a second copy of 90 and 220 on the client. Two copies of a number that
   * has to agree is how they stop agreeing, so the one that wrote the prompt is
   * the one that reports it.
   */
  json(res, 200, { options, limit: limitFor(body.slot, body.limit) });
}
