/**
 * Drafting. Lifted out of index.ts unchanged when billing arrived and the server
 * grew a router.
 *
 * The API key lives on this side and never reaches the browser, that is the
 * whole reason this process exists.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { bearer, HttpError, json, readJson } from "./http.js";
import { requirePro } from "./supabase.js";

const MODEL = "claude-opus-5";

const DraftSchema = z.object({
  slides: z
    .array(
      z.object({
        role: z.string().describe("The slot id this text is for"),
        text: z.string().describe("The finished slide copy, ready to publish"),
      }),
    )
    .describe("One entry per slot, in the same order as the framework"),
});

type SlotSpec = { id: string; label: string; note: string; placeholder: string };
type DraftRequest = {
  brief: string;
  structure: { name: string; shape: string; slots: SlotSpec[] };
};

const SYSTEM = `You write social carousels. You are given a framework, the job each slide does, and a brief.

Rules:
- Write finished copy, not instructions or placeholders. Never write "your hook here".
- One idea per slide. If a slide needs an "and also", it belongs in two slides.
- Keep each slide short enough to read at a glance: the hook under 90 characters, body slides under 220.
- Match the job of each slot exactly. The hook decides whether slide 2 is seen, so make it specific, a number, a cost, a consequence, never a category.
- Write in the brief's own voice and vocabulary. Do not add claims, numbers, or results the brief does not contain.
- No hashtags, no emoji, no "in today's fast-paced world".
- Return one entry per slot, in order, using the given slot ids.`;

export const draftConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

async function run(body: DraftRequest) {
  const client = new Anthropic();
  const slotLines = body.structure.slots
    .map((s, i) => `${i + 1}. id="${s.id}", ${s.label}: ${s.note}. e.g. "${s.placeholder}"`)
    .join("\n");

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: {
      effort: "medium",
      format: zodOutputFormat(DraftSchema),
    },
    messages: [
      {
        role: "user",
        content:
          `Framework: ${body.structure.name} (${body.structure.shape})\n\n` +
          `Slots, in order:\n${slotLines}\n\n` +
          `Brief:\n${body.brief}`,
      },
    ],
  });

  // A policy decline returns 200 with no usable content, check before reading.
  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "the request was declined";
    throw new HttpError(422, `Claude declined this brief: ${why}`);
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, "Draft came back unreadable");
  return parsed;
}

/**
 * Drafting, gated.
 *
 * This route spends money, an unauthenticated caller with the URL can run up an
 * Anthropic bill with no ceiling, and until this batch one could. The plan check
 * is second, after the key check, so somebody on a server with no key set gets
 * told that rather than being sold an upgrade that would not help.
 */
export async function draft(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!draftConfigured()) {
    throw new HttpError(
      503,
      "No ANTHROPIC_API_KEY. Copy .env.example to .env, add your key, and restart the server.",
    );
  }

  await requirePro(bearer(req), "AI drafting");

  const body = await readJson<DraftRequest>(req);
  if (!body?.brief?.trim()) throw new HttpError(400, "Brief is empty");
  if (!body.structure?.slots?.length) throw new HttpError(400, "No framework given");

  json(res, 200, await run(body));
}

/* ── hook variants ────────────────────────────────────────────────────────── */

/**
 * Several ways to open, so one can be picked.
 *
 * A separate route rather than a flag on `draft`, because it is a different job
 * with a different shape: one line in, several lines out, each one labelled with
 * the angle it takes. Folding it into the drafting schema would mean a schema
 * that describes two things and a prompt that describes neither well.
 *
 * `angle` is not decoration. The complaint this answers is that people iterate
 * on hooks by hand; five near-identical rewordings do not help them, five
 * genuinely different approaches do, and naming the approach is what lets
 * someone pick on judgement rather than on vibe.
 */
const HookSchema = z.object({
  hooks: z
    .array(
      z.object({
        angle: z
          .string()
          .describe("Two or three words naming the approach, e.g. 'the cost', 'contrarian', 'a number'"),
        text: z.string().describe("The finished opening line, ready to publish"),
      }),
    )
    .describe("Distinct openings for the same carousel, each taking a different angle"),
});

type HookRequest = {
  /** The hook as it currently stands. May be empty. */
  hook: string;
  /** Every slide's copy, so a variant can promise what the deck actually delivers. */
  deck: string[];
  framework?: string;
  count?: number;
};

const HOOK_SYSTEM = `You write opening slides for social carousels. The opening slide decides whether slide 2 is ever seen.

You are given a carousel that already exists and its current opening line. Write alternative openings for THAT carousel.

Rules:
- Each one must be a promise the rest of the deck actually keeps. Never promise material the deck does not contain.
- Each one takes a genuinely different angle. Rewording the same idea five times is useless.
- Under 90 characters. Shorter is better.
- Specific beats clever: a number, a cost, a consequence, a named mistake. Never a category.
- Use the deck's own voice and vocabulary. Do not add claims, numbers or results it does not contain.
- No hashtags, no emoji, no clickbait the deck cannot pay off.
- Name the angle in two or three words.`;

const MAX_HOOKS = 8;

export async function hooks(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!draftConfigured()) {
    throw new HttpError(
      503,
      "No ANTHROPIC_API_KEY. Copy .env.example to .env, add your key, and restart the server.",
    );
  }

  await requirePro(bearer(req), "Hook variants");

  const body = await readJson<HookRequest>(req);
  const deck = Array.isArray(body?.deck) ? body.deck.filter((t) => t.trim()) : [];
  if (deck.length === 0) throw new HttpError(400, "The deck has no copy to work from");

  const count = Math.min(MAX_HOOKS, Math.max(2, Math.round(body.count ?? 5)));
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: HOOK_SYSTEM,
    output_config: { effort: "medium", format: zodOutputFormat(HookSchema) },
    messages: [
      {
        role: "user",
        content:
          (body.framework ? `Framework: ${body.framework}\n\n` : "") +
          `Current opening: ${body.hook?.trim() || "(none yet)"}\n\n` +
          `The carousel, slide by slide:\n` +
          deck.map((t, i) => `${i + 1}. ${t}`).join("\n") +
          `\n\nWrite ${count} alternative openings.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "the request was declined";
    throw new HttpError(422, `Claude declined this deck: ${why}`);
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, "The hooks came back unreadable");

  json(res, 200, { hooks: parsed.hooks.slice(0, count) });
}

/** Anthropic's own error types carry the status worth reporting. */
export function draftStatus(error: unknown): { status: number; message: string } | null {
  if (error instanceof Anthropic.AuthenticationError) {
    return { status: 401, message: "That API key was rejected." };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "Rate limited. Try again in a moment." };
  }
  return null;
}
