/**
 * Drafting. Lifted out of index.ts unchanged when billing arrived and the server
 * grew a router.
 *
 * The API key lives on this side and never reaches the browser — that is the
 * whole reason this process exists.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { HttpError, json, readJson } from "./http.js";

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
- Match the job of each slot exactly. The hook decides whether slide 2 is seen, so make it specific — a number, a cost, a consequence — never a category.
- Write in the brief's own voice and vocabulary. Do not add claims, numbers, or results the brief does not contain.
- No hashtags, no emoji, no "in today's fast-paced world".
- Return one entry per slot, in order, using the given slot ids.`;

export const draftConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

async function run(body: DraftRequest) {
  const client = new Anthropic();
  const slotLines = body.structure.slots
    .map((s, i) => `${i + 1}. id="${s.id}" — ${s.label}: ${s.note}. e.g. "${s.placeholder}"`)
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

  // A policy decline returns 200 with no usable content — check before reading.
  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "the request was declined";
    throw new HttpError(422, `Claude declined this brief: ${why}`);
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, "Draft came back unreadable");
  return parsed;
}

export async function draft(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!draftConfigured()) {
    throw new HttpError(
      503,
      "No ANTHROPIC_API_KEY. Copy .env.example to .env, add your key, and restart the server.",
    );
  }

  const body = await readJson<DraftRequest>(req);
  if (!body?.brief?.trim()) throw new HttpError(400, "Brief is empty");
  if (!body.structure?.slots?.length) throw new HttpError(400, "No framework given");

  json(res, 200, await run(body));
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
