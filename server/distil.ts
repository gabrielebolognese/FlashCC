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
import { verbatimOnly } from "./verbatim.js";

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
