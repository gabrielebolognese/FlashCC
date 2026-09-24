/**
 * The two routes that spend money.
 *
 * The API key lives on this side and never reaches the browser, which is the
 * whole reason this process exists. Since Batch 9 both routes also require a
 * paying caller, because an open route holding an API key is an invoice waiting
 * to happen.
 *
 * What is NOT here any more: the prompts, which are pure and live in
 * `prompts.ts` where they can be tested; and the model, retry and usage policy,
 * which lives in `anthropic.ts` because it is the same policy for every route.
 * What is left is the shape of each request and the schema of each answer.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { anthropic, callModel, draftConfigured, MODELS } from "./anthropic.js";
import { bearer, HttpError, json, rateLimit, readJson } from "./http.js";
import {
  assembleDraft,
  assembleHooks,
  MAX_BRIEF_CHARS,
  plainText,
  type Structure,
  type Voice,
} from "./prompts.js";
import { requirePro } from "./supabase.js";

export { draftConfigured };

/**
 * An abuse ceiling, and deliberately not a credit.
 *
 * Invariant 7 promises nothing is metered, and that stands: this does not count
 * down, does not appear in the interface, and nobody using the product normally
 * will ever meet it. It exists so one script cannot spend a month of margin in
 * an afternoon, which is the risk an unmetered promise creates. A limiter stops
 * a script; a credit system taxes ordinary use. They look similar and they are
 * opposites.
 */
const DRAFTS_PER_HOUR = 60;
const HOOKS_PER_HOUR = 120;
const HOUR_MS = 3_600_000;

const noKey = (): HttpError =>
  new HttpError(
    503,
    "No ANTHROPIC_API_KEY. Copy .env.example to .env, add your key, and restart the server.",
  );

/* ── drafting ─────────────────────────────────────────────────────────────── */

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

type DraftRequest = {
  brief: string;
  structure: Structure;
  voice?: Voice;
};

/**
 * Drafting, gated.
 *
 * The key check runs before the plan check on purpose: somebody on a server with
 * no key set should be told that, rather than sold an upgrade that would not
 * help them.
 */
export async function draft(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!draftConfigured()) throw noKey();

  const caller = await requirePro(bearer(req), "AI drafting");
  // Keyed on the account rather than the address: these routes require a
  // session, so the account is the thing spending the money.
  rateLimit(`draft:${caller.id}`, DRAFTS_PER_HOUR, HOUR_MS);

  const body = await readJson<DraftRequest>(req, MAX_BRIEF_CHARS * 4);
  if (!body?.brief?.trim()) throw new HttpError(400, "Brief is empty");
  if (!body.structure?.slots?.length) throw new HttpError(400, "No framework given");

  const { system, user } = assembleDraft({
    brief: body.brief,
    structure: body.structure,
    ...(body.voice ? { voice: body.voice } : {}),
  });

  const response = await callModel("draft", MODELS.draft, () =>
    anthropic().messages.parse({
      model: MODELS.draft,
      max_tokens: 16000,
      // An array with a cache breakpoint rather than a bare string. The block is
      // byte-identical for every draft anybody makes, so it caches across users
      // rather than only across one person's session.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      output_config: {
        effort: "medium",
        format: zodOutputFormat(DraftSchema),
      },
      messages: [{ role: "user", content: user }],
    }),
  );

  // A policy decline returns 200 with no usable content, so check before reading.
  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "the request was declined";
    throw new HttpError(422, `Claude declined this brief: ${why}`);
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, "Draft came back unreadable");

  // Cleaned here rather than in the browser: this is the only door the copy
  // comes through, and the browser is not the place to be fixing house style.
  json(res, 200, { slides: parsed.slides.map((s) => ({ ...s, text: plainText(s.text) })) });
}

/* ── hook variants ────────────────────────────────────────────────────────── */

/**
 * `angle` is not decoration. People iterate on hooks by hand; five near-identical
 * rewordings do not help them and five genuinely different approaches do, and
 * naming the approach is what lets somebody pick on judgement rather than on
 * vibe.
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
  hook: string;
  deck: string[];
  framework?: string;
  count?: number;
  voice?: Voice;
};

const MAX_HOOKS = 8;

export async function hooks(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!draftConfigured()) throw noKey();

  const caller = await requirePro(bearer(req), "Hook variants");
  rateLimit(`hooks:${caller.id}`, HOOKS_PER_HOUR, HOUR_MS);

  const body = await readJson<HookRequest>(req, 200_000);
  const deck = Array.isArray(body?.deck) ? body.deck.filter((t) => t.trim()) : [];
  if (deck.length === 0) throw new HttpError(400, "The deck has no copy to work from");

  const count = Math.min(MAX_HOOKS, Math.max(2, Math.round(body.count ?? 5)));

  const { system, user } = assembleHooks({
    hook: body.hook ?? "",
    deck,
    count,
    ...(body.framework ? { framework: body.framework } : {}),
    ...(body.voice ? { voice: body.voice } : {}),
  });

  const response = await callModel("hooks", MODELS.hooks, () =>
    anthropic().messages.parse({
      model: MODELS.hooks,
      max_tokens: 4000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      // No `effort`. Haiku 4.5 rejects the parameter outright with a 400,
      // which made this route fail on every call from the moment it moved off
      // Opus in Batch 10. Nothing caught it because the eval harness only ever
      // exercised drafting. Effort is a reasoning-model control and there is no
      // reasoning here: five one-line rewrites.
      output_config: { format: zodOutputFormat(HookSchema) },
      messages: [{ role: "user", content: user }],
    }),
  );

  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "the request was declined";
    throw new HttpError(422, `Claude declined this deck: ${why}`);
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, "The hooks came back unreadable");

  json(res, 200, {
    hooks: parsed.hooks.slice(0, count).map((h) => ({ ...h, text: plainText(h.text) })),
  });
}

/**
 * Kept because `index.ts` runs every thrown error through it.
 *
 * `anthropic.explain` does the real work now and covers every documented failure
 * rather than two of them, so anything arriving here has already been translated
 * into an `HttpError` and there is nothing left to add.
 */
export function draftStatus(_error: unknown): { status: number; message: string } | null {
  return null;
}
