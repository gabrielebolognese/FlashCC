/**
 * Working out how somebody writes, from what they have already written.
 *
 * ── Why it returns evidence, and why the evidence is verified ────────────────
 *
 * A model that says "your tone is direct and punchy" has told somebody nothing
 * they can check, and they will either believe it or not on vibe. Each trait
 * therefore arrives with a line from their own decks that demonstrates it, so
 * the whole description is auditable in ten seconds.
 *
 * That only works if the evidence is real. A paraphrased line produces a panel
 * that LOOKS auditable and is not, which is worse than a panel with no evidence
 * at all, because it invites the trust it has not earned. So every line is
 * checked against the decks and a trait whose evidence does not survive is
 * dropped with it.
 *
 * ── What it does not return ──────────────────────────────────────────────────
 *
 * **`samples`.** They are the highest-weight part of the drafting prompt, and
 * choosing which three of your posts represent you is a judgement about your own
 * work. A machine picking them is the machine deciding what you sound like.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { anthropic, callModel, draftConfigured, MODELS } from "./anthropic.js";
import { bearer, HttpError, json, rateLimit, readJson } from "./http.js";
import { assembleVoice, MAX_AVOID, MAX_LEARN_DECKS, plainText, type Voice } from "./prompts.js";
import { requirePro } from "./supabase.js";
import { verbatimOnly } from "./verbatim.js";

/** Nobody needs to do this twice in an afternoon. */
const VOICE_LEARNS_PER_HOUR = 10;
const HOUR_MS = 3_600_000;

/** Below this it is a description of one carousel rather than of a person. */
const MIN_DECKS = 3;

const VoiceSchema = z.object({
  tone: z.string().describe("Two sentences at most, in the second person"),
  avoid: z.array(z.string()).describe("Words and constructions the decks show them avoiding"),
  observed: z
    .array(
      z.object({
        trait: z.string().describe("A specific, checkable writing habit"),
        evidence: z.string().describe("One line from the decks, copied exactly, that shows it"),
      }),
    )
    .describe("Three to six traits, each with a line from their own decks"),
});

type VoiceRequest = { decks?: string[][]; existing?: Voice };

/**
 * Traits whose evidence is genuinely in the decks.
 *
 * Dropped as a PAIR, not repaired and not kept with the evidence stripped. A
 * trait shown without its line is exactly the unfalsifiable claim this route
 * exists to avoid, so losing the evidence has to lose the trait.
 */
export function groundedTraits(
  observed: readonly { trait: string; evidence: string }[],
  corpus: string,
): { trait: string; evidence: string }[] {
  const out: { trait: string; evidence: string }[] = [];
  const seen = new Set<string>();

  for (const o of observed) {
    const trait = plainText(o.trait ?? "");
    if (!trait) continue;

    // `plainText` is NOT applied to the evidence: it turns em dashes into
    // commas, and a cleaned line then fails its own check against a deck that
    // does contain the dash.
    const [kept] = verbatimOnly([o.evidence ?? ""], corpus);
    if (!kept) continue;

    const key = trait.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);

    out.push({ trait, evidence: kept });
  }

  return out;
}

export async function learnVoice(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!draftConfigured()) {
    throw new HttpError(
      503,
      "No ANTHROPIC_API_KEY. Copy .env.example to .env, add your key, and restart the server.",
    );
  }

  const caller = await requirePro(bearer(req), "Learning your voice");
  rateLimit(`voice:${caller.id}`, VOICE_LEARNS_PER_HOUR, HOUR_MS);

  const body = await readJson<VoiceRequest>(req, 400_000);

  const decks = (Array.isArray(body?.decks) ? body.decks : [])
    .filter((d): d is string[] => Array.isArray(d))
    .map((d) => d.filter((t) => typeof t === "string" && t.trim()))
    .filter((d) => d.length > 0)
    .slice(0, MAX_LEARN_DECKS);

  if (decks.length < MIN_DECKS) {
    throw new HttpError(
      400,
      `Needs at least ${MIN_DECKS} carousels. Fewer than that describes one carousel rather than how you write.`,
    );
  }

  const { system, user } = assembleVoice({
    decks,
    ...(body.existing ? { existing: body.existing } : {}),
  });

  const response = await callModel("voice", MODELS.voice, () =>
    anthropic().messages.parse({
      model: MODELS.voice,
      max_tokens: 3000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "medium", format: zodOutputFormat(VoiceSchema) },
      messages: [{ role: "user", content: user }],
    }),
  );

  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "the request was declined";
    throw new HttpError(422, `Claude declined these carousels: ${why}`);
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, "The voice came back unreadable");

  // Everything the decks contain, as one haystack. The evidence may come from
  // any of them, and which one it came from does not matter.
  const corpus = decks.map((d) => d.join("\n")).join("\n");
  const observed = groundedTraits(parsed.observed, corpus);

  if (observed.length === 0) {
    throw new HttpError(
      502,
      "Nothing it said about your writing could be backed up by your own decks, so none of it is worth showing you.",
    );
  }

  json(res, 200, {
    tone: plainText(parsed.tone),
    avoid: parsed.avoid
      .map((w) => plainText(w).trim())
      .filter(Boolean)
      .slice(0, MAX_AVOID),
    observed,
  });
}
