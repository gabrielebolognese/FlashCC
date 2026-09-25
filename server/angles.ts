/**
 * Researching what a carousel could be about, using the live web.
 *
 * ── Why this is allowed when URL fetching was rejected ───────────────────────
 *
 * Batch 13 turned down fetching pages server-side, and the reason stands:
 * somebody else's page is somebody else's content, and fetching it ourselves
 * makes us the party requesting it.
 *
 * This does not fetch anything. `web_search` is an Anthropic SERVER tool: the
 * search and the reading happen on their infrastructure, on the key this
 * product already holds, and the results arrive with citations attached. No
 * second vendor, no second key, and no crawler of ours pointed at anybody's
 * site. That difference is the whole reason this route exists.
 *
 * ── What it costs ───────────────────────────────────────────────────────────
 *
 * Searches are billed per search, separately from tokens, so the count comes
 * back with the answer and the interface reports the two apart. `max_uses`
 * bounds a single request: without it one idea can run a dozen searches and
 * nothing says so until the invoice.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { anthropic, callModel, draftConfigured, MODELS } from "./anthropic.js";
import { repair } from "./checks.js";
import { bearer, HttpError, json, rateLimit, readJson } from "./http.js";
import { assembleAngles, type Voice } from "./prompts.js";
import { requirePro } from "./supabase.js";

/**
 * Searching is the expensive half of this product, so the ceiling is low.
 *
 * Still not a credit: it does not count down, does not appear in the interface,
 * and a fourteen-carousel run uses one call per idea rather than one per
 * carousel. Meeting this means something automated is running.
 */
const ANGLE_RUNS_PER_HOUR = 30;
const HOUR_MS = 3_600_000;

/** Per request. Enough to look around an idea, few enough to be predictable. */
const MAX_SEARCHES = 5;

const AnglesSchema = z.object({
  angles: z
    .array(
      z.object({
        title: z.string().describe("A short title for this angle"),
        angle: z.string().describe("One line saying what makes this angle different"),
        brief: z.string().describe("The brief that would produce this carousel"),
      }),
    )
    .describe("Distinct carousels this idea could become, each grounded in something found"),
});

type AnglesRequest = { idea?: string; count?: number; voice?: Voice };

export type Source = { title: string; url: string };

/**
 * The pages the search actually returned.
 *
 * **A web search error arrives as HTTP 200.** The block's `content` is an ARRAY
 * of results on success and an OBJECT carrying an error code on failure, so
 * indexing before checking is how a failed search becomes a crash in the middle
 * of a fourteen step run rather than a step that simply found nothing.
 */
export function sourcesFrom(content: readonly unknown[]): { sources: Source[]; searches: number } {
  const sources: Source[] = [];
  const seen = new Set<string>();
  let searches = 0;

  for (const block of content) {
    const b = block as { type?: string; content?: unknown };
    if (b?.type !== "web_search_tool_result") continue;

    searches += 1;

    // The branch that matters. An error is an object, a success is a list.
    if (!Array.isArray(b.content)) continue;

    for (const raw of b.content) {
      const r = raw as { type?: string; title?: unknown; url?: unknown };
      if (r?.type !== "web_search_result") continue;
      if (typeof r.url !== "string" || !r.url) continue;
      if (seen.has(r.url)) continue;

      seen.add(r.url);
      sources.push({
        title: typeof r.title === "string" && r.title.trim() ? r.title : r.url,
        url: r.url,
      });
    }
  }

  return { sources, searches };
}

export async function angles(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!draftConfigured()) {
    throw new HttpError(
      503,
      "No ANTHROPIC_API_KEY. Copy .env.example to .env, add your key, and restart the server.",
    );
  }

  const caller = await requirePro(bearer(req), "Researching angles");
  rateLimit(`angles:${caller.id}`, ANGLE_RUNS_PER_HOUR, HOUR_MS);

  const body = await readJson<AnglesRequest>(req, 100_000);

  const idea = (body?.idea ?? "").trim();
  if (idea.length < 8) throw new HttpError(400, "That idea is too short to research");

  const count = Math.min(14, Math.max(1, Math.round(body.count ?? 3)));

  const { system, user } = assembleAngles({
    idea,
    count,
    ...(body.voice ? { voice: body.voice } : {}),
  });

  const response = await callModel("angles", MODELS.angles, () =>
    anthropic().messages.parse({
      model: MODELS.angles,
      max_tokens: 8000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "medium", format: zodOutputFormat(AnglesSchema) },
      tools: [
        {
          // Runs on Anthropic's side. No beta header on this model family.
          type: "web_search_20260209",
          name: "web_search",
          max_uses: MAX_SEARCHES,
        },
      ],
      messages: [{ role: "user", content: user }],
    }),
  );

  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "the request was declined";
    throw new HttpError(422, `Claude declined this idea: ${why}`);
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, "The research came back unreadable");

  const { sources, searches } = sourcesFrom(response.content ?? []);

  const out = parsed.angles
    .map((a) => ({ title: repair(a.title), angle: repair(a.angle), brief: repair(a.brief) }))
    .filter((a) => a.title && a.brief)
    .slice(0, count);

  if (out.length === 0) throw new HttpError(502, "Nothing usable came back about that idea");

  json(res, 200, {
    angles: out,
    sources,
    // Reported apart from tokens, because that is how they are billed.
    searches,
    usage: {
      input: response.usage?.input_tokens ?? 0,
      output: response.usage?.output_tokens ?? 0,
      cached: response.usage?.cache_read_input_tokens ?? 0,
    },
  });
}
