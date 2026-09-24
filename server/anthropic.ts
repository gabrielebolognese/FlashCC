/**
 * The one place this product talks to a model.
 *
 * ── A model per task ─────────────────────────────────────────────────────────
 *
 * Both routes used to name the same constant, and that constant was the most
 * expensive model available. Five one-line rewrites is not a reasoning task;
 * drafting seven slides from a brief is. Each route names its own now, because
 * the next one added will have its own answer too.
 *
 * ── Retry is where the money is lost ─────────────────────────────────────────
 *
 * A retry on a connection failure is free, nothing was generated. A retry on a
 * 5xx is usually free for the same reason. A retry on a response the model
 * already produced, a refusal, a 400, a schema mismatch, charges twice for one
 * draft and produces the same failure the second time. So: once, and only for
 * the two cases where nothing was billed.
 *
 * ── Usage, because nothing is metered ────────────────────────────────────────
 *
 * Promising customers no credits makes unit economics a design constraint
 * rather than an afterthought: there is no meter to stop heavy use, so heavy use
 * has to be cheap. That is only knowable if it is counted, and until this file
 * nothing in the product counted a single token.
 */
import Anthropic from "@anthropic-ai/sdk";

import { HttpError } from "./http.js";

/**
 * Drafting reasons about structure and voice at once and is worth a capable
 * model. Hooks rewrite one line five ways, which Haiku does as well and far
 * faster, and speed is most of what that screen feels like.
 */
export const MODELS = {
  draft: "claude-sonnet-5",
  hooks: "claude-haiku-4-5-20251001",
  // One line in, three short lines out, no reasoning to do. The argument that
  // put hooks on Haiku applies harder here: this is the route people press
  // twenty times while working a line into shape.
  rewrite: "claude-haiku-4-5-20251001",
  // Writing that has to hold up next to the deck, in a feed, beside real
  // posts. That is the same job drafting does, so it gets the same model.
  caption: "claude-sonnet-5",
  // Describing what is already there, inside 125 characters. Description,
  // not composition.
  alt: "claude-haiku-4-5-20251001",
} as const;

/** A hung request otherwise holds a browser tab open until somebody closes it. */
const TIMEOUT_MS = 90_000;

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(
      503,
      "No ANTHROPIC_API_KEY. Copy .env.example to .env, add your key, and restart the server.",
    );
  }
  // `maxRetries: 0` because the retry policy below is ours. The SDK's default
  // retries some of the same statuses, and two layers of retry on a paid call is
  // how one failure becomes four charges.
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  return client;
}

export const draftConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

/* ── what a failure means ─────────────────────────────────────────────────── */

/**
 * Anthropic's errors, as something somebody can act on.
 *
 * Every one of these used to surface as "Drafting failed (500)", which reads as
 * a bug in this product and sends people to support for something a sentence
 * would have answered.
 */
export function explain(error: unknown): HttpError {
  if (error instanceof HttpError) return error;

  if (error instanceof Anthropic.AuthenticationError) {
    return new HttpError(401, "That API key was rejected. Check ANTHROPIC_API_KEY on the server.");
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new HttpError(403, "This API key is not allowed to use that model.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new HttpError(
      429,
      "Anthropic is rate limiting this key. Wait a moment, or raise the limit in the Console.",
    );
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new HttpError(504, "The model took too long. Try again, or shorten the brief.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new HttpError(502, "Could not reach Anthropic. Check the server's network.");
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new HttpError(502, "Anthropic is having trouble. This usually clears in a minute.");
  }
  if (error instanceof Anthropic.APIError) {
    return new HttpError(502, error.message);
  }
  return new HttpError(500, error instanceof Error ? error.message : "The model call failed");
}

/**
 * Whether trying again could plausibly succeed AND cost nothing extra.
 *
 * Both halves matter. A 429 might succeed on a retry, and retrying it
 * immediately is how a rate limit becomes a worse rate limit, so it is the
 * caller's problem rather than something to paper over here.
 */
const worthRetrying = (error: unknown): boolean =>
  error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.InternalServerError;

/* ── usage ────────────────────────────────────────────────────────────────── */

type Usage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/**
 * One line per call, so the cost of a feature is a fact rather than a guess.
 *
 * `cached` is called out separately because it is the number that says whether
 * the prompt cache is working. A cache that silently stopped matching looks
 * exactly like normal operation, apart from the bill.
 */
export function logUsage(route: string, model: string, ms: number, usage: Usage | undefined): void {
  const i = usage?.input_tokens ?? 0;
  const o = usage?.output_tokens ?? 0;
  const written = usage?.cache_creation_input_tokens ?? 0;
  const read = usage?.cache_read_input_tokens ?? 0;

  console.log(
    `[ai] ${route} ${model} ${ms}ms in=${i} out=${o} cache(w=${written} r=${read})`,
  );
}

/**
 * Calls the model once, retries once if and only if nothing was billed.
 *
 * Takes a thunk rather than request arguments so the caller keeps its own typed
 * `messages.parse` call and its own schema. This owns the policy, not the shape
 * of the request.
 */
export async function callModel<T>(
  route: string,
  model: string,
  run: () => Promise<T & { usage?: Usage }>,
): Promise<T> {
  const started = Date.now();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await run();
      logUsage(route, model, Date.now() - started, response.usage);
      return response;
    } catch (error) {
      if (attempt === 0 && worthRetrying(error)) {
        console.warn(`[ai] ${route} retrying after ${(error as Error).name}`);
        continue;
      }
      console.warn(`[ai] ${route} failed after ${Date.now() - started}ms`);
      throw explain(error);
    }
  }

  // Unreachable: the loop either returns or throws.
  throw new HttpError(500, "The model call failed");
}
