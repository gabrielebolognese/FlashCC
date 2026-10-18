/**
 * One deck, several languages (Batch 29): `/api/translate`.
 *
 * Words in, words out, positionally: one string per slide, and one per block
 * field the client asked about (a quote, a step, a label). Nothing about
 * layout crosses this route, invariant 5; the client lays the words out with
 * the same machinery every other source of words goes through, and splits a
 * slide that runs long rather than shrinking it (29.2).
 *
 * ── Masked before, restored after ────────────────────────────────────────────
 *
 * Names, handles, links, code, numbers and the brand's glossary terms are
 * swapped for tokens HERE, on the server, before the model sees a word
 * (`languages.ts`). The client cannot opt out of it and the model cannot
 * translate what it never sees as text. A fixed rendering is restored as the
 * rendering, so "Swipe file" is "Ideensammlung" on every German slide.
 *
 * ── The checks, on the Batch 15 tiers ────────────────────────────────────────
 *
 * Repair: masks restored, house punctuation, marks no more than the source had.
 * Retry: a unit missing or left in the source language, a placeholder, a
 * masked term dropped, a unit far longer than its source. Flag: a number that
 * differs from the source, after the numeral system is normalised. A wrong
 * number is never corrected here; the person sees which slide and decides.
 *
 * ── Pro, with an abuse ceiling and no credits (29.6) ─────────────────────────
 *
 * There is no free deterministic half to translation that would be worth
 * having, so this route is Pro, the Batch 9 way. The ceiling stops a script,
 * not a person: it does not count down anywhere a person can see.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import {
  languageByCode,
  mask,
  MAX_KEEP,
  MAX_TERM_CHARS,
  MAX_TRANSLATE_CHARS,
  numberDrift,
  overCeiling,
  placeholderIn,
  tidyGlossary,
  untranslated,
  unmask,
  type GlossaryTerm,
  type Masked,
} from "../src/studio/languages.js";
import { limitMarks, markCount } from "../src/studio/marks.js";
import { anthropic, callModel, draftConfigured, MODELS } from "./anthropic.js";
import { flagged, repair, withContentRetry, type Finding } from "./checks.js";
import { bearer, HttpError, json, rateLimit, readJson } from "./http.js";
import { assembleTranslate, type TranslateUnit, type Voice } from "./prompts.js";
import { requirePro } from "./supabase.js";
import { countFindings } from "./tally.js";

/**
 * A translation is a whole deck at once and is pressed once per language, not
 * twenty times while a line takes shape. Thirty an hour is a dozen languages
 * twice over with room to spare.
 */
const TRANSLATIONS_PER_HOUR = 30;
const HOUR_MS = 3_600_000;
const MAX_UNITS = 120;

/**
 * Server-side refusal fallbacks: if the model declines a unit of somebody's
 * own copy for policy reasons, the API retries on its default substitute
 * rather than leaving the person with nothing. The header must match the
 * scalar `"default"` form.
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const TranslateSchema = z.object({
  units: z
    .array(
      z.object({
        n: z.number().describe("The unit's number, as given"),
        text: z.string().describe("The unit translated, every token copied exactly once"),
      }),
    )
    .describe("Every unit, translated, in order"),
});

type ModelUnits = z.infer<typeof TranslateSchema>["units"];

type TranslateRequest = {
  deck?: unknown;
  fields?: unknown;
  target?: unknown;
  voice?: Voice;
  glossary?: unknown;
  keep?: unknown;
};

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((t) => (typeof t === "string" ? t : "")) : []);

/** The units as the model will see them: masked, one per slide, then one per field. */
export type Prepared = { units: TranslateUnit[]; masks: Masked[]; sources: string[]; slides: number };

export function prepare(
  deck: readonly string[],
  fields: readonly string[],
  options: { glossary?: readonly GlossaryTerm[] | undefined; keep?: readonly string[] | undefined } = {},
): Prepared {
  const sources = [...deck, ...fields];
  const masks = sources.map((s) => mask(s, options));
  return {
    units: masks.map((m, i) => ({ kind: i < deck.length ? "slide" : "field", text: m.text })),
    masks,
    sources,
    slides: deck.length,
  };
}

export type Finished = { texts: string[]; findings: Finding[] };

/**
 * The model's units made publishable and checked. Pure, so every tier is
 * tested without a key. `at` is the unit's index: the slides first, then the
 * fields, the order the client sent them in.
 */
export function finish(units: ModelUnits, prepared: Prepared, target: string): Finished {
  const byN = new Map<number, string>();
  for (const u of units) {
    const n = Math.round(u.n) - 1;
    if (n >= 0 && n < prepared.sources.length && !byN.has(n)) byN.set(n, u.text ?? "");
  }

  const findings: Finding[] = [];
  const texts = prepared.sources.map((source, i) => {
    const m = prepared.masks[i]!;
    if (!source.trim()) return source;
    const raw = byN.get(i);
    if (raw === undefined || !raw.trim()) {
      findings.push({ at: i, tier: "retry", code: "translate-missing", message: "This unit is missing. Return it translated." });
      return source;
    }

    // Repair the model's text while the masks still stand, so a link or a
    // code span is put back byte for byte, never through the punctuation rules.
    const repaired = limitMarks(repair(raw), markCount(m.text));
    const back = unmask(repaired, m.tokens);

    if (untranslated(m.text, repaired, target)) {
      findings.push({ at: i, tier: "retry", code: "translate-untranslated", message: "This unit is still in the original language. Translate it.", detail: back.text });
    }
    const placeholder = placeholderIn(source, back.text);
    if (placeholder) {
      findings.push({ at: i, tier: "retry", code: "translate-placeholder", message: `Remove "${placeholder}" and translate what the unit says.`, detail: placeholder });
    }
    for (const t of back.missing) {
      const tok = m.tokens[t]!;
      findings.push({
        at: i,
        tier: "retry",
        code: tok.kind === "term" || tok.kind === "name" ? "translate-term-missing" : "translate-token-missing",
        message: `Token ⟦${t}⟧ is missing. Copy it exactly once.`,
        detail: tok.value,
      });
    }
    if (overCeiling(source, back.text)) {
      findings.push({ at: i, tier: "retry", code: "translate-too-long", message: "This is far longer than the original. Keep it close to the original's length." });
    }
    const drift = numberDrift(source, back.text);
    if (drift.missing.length || drift.added.length) {
      findings.push({
        at: i,
        tier: "flag",
        code: "translate-number",
        message: `A number differs from the original${drift.missing.length ? `: ${drift.missing.join(", ")} is missing` : ""}${drift.added.length ? `${drift.missing.length ? ";" : ":"} ${drift.added.join(", ")} was added` : ""}. Check it against the original slide.`,
        detail: [...drift.missing, ...drift.added].join(", "),
      });
    }
    return back.text;
  });

  return { texts, findings };
}

export async function translate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!draftConfigured()) {
    throw new HttpError(503, "No ANTHROPIC_API_KEY. Copy .env.example to .env, add your key, and restart the server.");
  }

  const caller = await requirePro(bearer(req), "Translation");
  rateLimit(`translate:${caller.id}`, TRANSLATIONS_PER_HOUR, HOUR_MS);

  const body = await readJson<TranslateRequest>(req, 400_000);
  const deck = strings(body?.deck);
  const fields = strings(body?.fields);
  if (deck.length === 0 || !deck.some((t) => t.trim())) throw new HttpError(400, "There is no deck to translate");
  if (deck.length + fields.length > MAX_UNITS) throw new HttpError(400, "That is more slides and fields than one translation takes");
  const chars = [...deck, ...fields].reduce((n, t) => n + t.length, 0);
  if (chars > MAX_TRANSLATE_CHARS) {
    throw new HttpError(400, `That deck is ${chars.toLocaleString("en")} characters; one translation takes up to ${MAX_TRANSLATE_CHARS.toLocaleString("en")}`);
  }

  const lang = typeof body.target === "string" ? languageByCode(body.target) : undefined;
  if (!lang) throw new HttpError(400, `Unknown language: ${String(body.target)}`);

  const glossary: GlossaryTerm[] = Array.isArray(body.glossary)
    ? tidyGlossary(
        body.glossary
          .filter((g): g is { term: string; rendering?: unknown } => Boolean(g) && typeof (g as { term?: unknown }).term === "string")
          .map((g) => ({
            term: g.term,
            ...(typeof g.rendering === "string" && g.rendering.trim() ? { renderings: { [lang.code]: g.rendering } } : {}),
          })),
      ).map((e) => ({ term: e.term, ...(e.renderings?.[lang.code] ? { rendering: e.renderings[lang.code] } : {}) }))
    : [];
  const keep = strings(body.keep)
    .map((k) => k.trim().slice(0, MAX_TERM_CHARS))
    .filter(Boolean)
    .slice(0, MAX_KEEP);

  const prepared = prepare(deck, fields, { glossary, keep });
  const { system, user } = assembleTranslate({
    units: prepared.units,
    language: lang.name === lang.native ? lang.name : `${lang.name} (${lang.native})`,
    ...(body.voice ? { voice: body.voice } : {}),
  });

  const { out, findings, retried } = await withContentRetry<Finished & { raw: ModelUnits }>(
    async (retry) => {
      const response = await callModel("translate", MODELS.translate, () =>
        anthropic().beta.messages.parse({
          model: MODELS.translate,
          max_tokens: 16000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          output_config: { effort: "medium", format: betaZodOutputFormat(TranslateSchema) },
          messages: retry
            ? [
                { role: "user", content: user },
                { role: "assistant", content: JSON.stringify({ units: retry.previous.raw }) },
                { role: "user", content: retry.note },
              ]
            : [{ role: "user", content: user }],
        }),
      );

      // The whole fallback chain declined: a 200 with nothing usable in it.
      if (response.stop_reason === "refusal") {
        const why = response.stop_details?.explanation ?? "the request was declined";
        throw new HttpError(422, `Claude declined to translate this: ${why}`);
      }
      if (response.stop_reason === "max_tokens") {
        throw new HttpError(502, "The translation ran out of room. Translate fewer slides at once.");
      }
      const parsed = response.parsed_output;
      if (!parsed) throw new HttpError(502, "The translation came back unreadable");
      return { ...finish(parsed.units, prepared, lang.code), raw: parsed.units };
    },
    (r) => r.findings,
  );

  countFindings("translate", findings);

  json(res, 200, {
    slides: out.texts.slice(0, prepared.slides),
    fields: out.texts.slice(prepared.slides),
    // Retry-tier findings that survived the one retry are reported as flags:
    // the person sees the slide and decides, as with every other flag.
    findings: [...flagged(findings), ...findings.filter((f) => f.tier === "retry").map((f) => ({ ...f, tier: "flag" as const }))],
    retried,
  });
}
