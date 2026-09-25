/**
 * Changing a draft you already have, by saying what to change.
 *
 * "In slide 4 make it about pricing." "Change the first three to be shorter."
 * The thing between accepting a draft and starting over, which were the only
 * two options.
 *
 * ── It returns only what changed, and that is the safety property ────────────
 *
 * The obvious design is to return the whole deck revised. It is also the one
 * where asking for a change to slide 4 quietly rewrites slide 7, and nothing
 * about the result looks wrong: every slide is plausible, because every slide
 * was written by the same model that wrote the first draft.
 *
 * Returning `{ slide, text }` for changed slides only makes that structurally
 * impossible. A slide the instruction did not ask about is not in the response,
 * so it cannot be altered by this route. The untouched ones are the same bytes
 * they were before, not a regenerated copy that happens to be similar.
 *
 * One call, no second pass.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { anthropic, callModel, draftConfigured, MODELS } from "./anthropic.js";
import { repair } from "./checks.js";
import { bearer, HttpError, json, rateLimit, readJson } from "./http.js";
import { assembleRevise, MAX_INSTRUCTION, type SlotSpec, type Voice } from "./prompts.js";
import { requirePro } from "./supabase.js";
import { countFindings } from "./tally.js";

/** As generous as rewriting. This is meant to be pressed until it is right. */
const REVISIONS_PER_HOUR = 120;
const HOUR_MS = 3_600_000;

const ReviseSchema = z.object({
  changes: z
    .array(
      z.object({
        slide: z.number().describe("The slide's number as shown, counting from 1"),
        text: z.string().describe("The new copy for that slide, finished and ready to publish"),
      }),
    )
    .describe("Only the slides the instruction asked to change. Never the others."),
  /** So the interface can say what it did rather than leaving somebody to diff it. */
  summary: z.string().describe("One short line naming what was changed"),
});

type ReviseRequest = {
  deck?: string[];
  instruction?: string;
  slots?: SlotSpec[];
  voice?: Voice;
};

export type Change = { at: number; text: string };

/**
 * The changes that can actually be applied to this deck.
 *
 * A slide number outside the deck is the one way this route can corrupt
 * something: applied blindly it would append a slide nobody asked for, or write
 * past the end and silently lengthen the carousel. Out of range is dropped
 * rather than clamped, because a clamped index is a change applied to the wrong
 * slide, which is worse than a change that did not happen.
 *
 * Indexes arrive 1-based, matching what the person is looking at, and leave
 * 0-based, matching the array.
 */
export function usableChanges(
  changes: readonly { slide: number; text: string }[],
  deckLength: number,
): Change[] {
  const seen = new Set<number>();
  const out: Change[] = [];

  for (const c of changes) {
    const at = Math.round(c.slide) - 1;
    if (!Number.isFinite(at) || at < 0 || at >= deckLength) continue;
    if (seen.has(at)) continue;

    const text = repair(c.text ?? "");
    if (!text) continue;

    seen.add(at);
    out.push({ at, text });
  }

  return out.sort((a, b) => a.at - b.at);
}

/** The deck with those changes applied, and nothing else touched. */
export const applyChanges = (deck: readonly string[], changes: readonly Change[]): string[] => {
  const out = [...deck];
  for (const c of changes) out[c.at] = c.text;
  return out;
};

export async function revise(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!draftConfigured()) {
    throw new HttpError(
      503,
      "No ANTHROPIC_API_KEY. Copy .env.example to .env, add your key, and restart the server.",
    );
  }

  const caller = await requirePro(bearer(req), "Changing a draft");
  rateLimit(`revise:${caller.id}`, REVISIONS_PER_HOUR, HOUR_MS);

  const body = await readJson<ReviseRequest>(req, 200_000);

  const deck = Array.isArray(body?.deck) ? body.deck.map((t) => String(t ?? "")) : [];
  if (deck.length === 0) throw new HttpError(400, "There is no draft to change");

  const instruction = (body?.instruction ?? "").trim();
  if (!instruction) throw new HttpError(400, "Say what you want changed");
  if (instruction.length > MAX_INSTRUCTION * 4) {
    throw new HttpError(400, "That instruction is too long to be one change");
  }

  const { system, user } = assembleRevise({
    deck,
    instruction,
    ...(Array.isArray(body.slots) ? { slots: body.slots } : {}),
    ...(body.voice ? { voice: body.voice } : {}),
  });

  const response = await callModel("revise", MODELS.revise, () =>
    anthropic().messages.parse({
      model: MODELS.revise,
      max_tokens: 8000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "medium", format: zodOutputFormat(ReviseSchema) },
      messages: [{ role: "user", content: user }],
    }),
  );

  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "the request was declined";
    throw new HttpError(422, `Claude declined that change: ${why}`);
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, "The change came back unreadable");

  const changes = usableChanges(parsed.changes, deck.length);

  countFindings(
    "revise",
    changes.length === 0
      ? [
          {
            at: -1,
            tier: "flag",
            code: "revise-no-change",
            message: "Nothing changed. Try naming the slide, for example: in slide 4, ...",
          },
        ]
      : [],
  );

  json(res, 200, {
    // The whole deck back, so the caller replaces rather than merges, and
    // `changed` so the interface can say which ones moved without diffing.
    deck: applyChanges(deck, changes),
    changed: changes.map((c) => c.at),
    summary: repair(parsed.summary ?? ""),
  });
}
