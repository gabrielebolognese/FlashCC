/**
 * Does the drafting prompt still produce usable carousels?
 *
 *   npm run eval:draft              every framework, the default model
 *   npm run eval:draft -- --compare claude-sonnet-5 vs claude-opus-5, side by side
 *
 * ── What this can and cannot tell you ────────────────────────────────────────
 *
 * It cannot tell you the copy is GOOD. Nothing automated can, and a script that
 * claimed to would be the "virality score" this product deliberately refuses to
 * ship. What it can tell you is that the copy is BROKEN, which is the failure
 * that actually reaches a customer: a slot left empty, a hook three lines long,
 * a placeholder shipped as finished text.
 *
 * ── Why it is not in `npm test` ──────────────────────────────────────────────
 *
 * Every run costs real money, in proportion to how many frameworks and briefs
 * are in it. A test suite people run fifty times a day cannot be one that bills
 * them, so this is a separate script somebody chooses to run.
 *
 * It talks to Anthropic directly rather than through the server, because the
 * server requires a signed-in Pro caller and this is a prompt check, not an
 * end-to-end check.
 */
import { readFileSync } from "node:fs";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { assembleDraft } from "../server/prompts.ts";
import { STRUCTURES } from "../src/studio/structures.ts";

/* ── config ───────────────────────────────────────────────────────────────── */

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const at = t.indexOf("=");
  process.env[t.slice(0, at).trim()] ??= t.slice(at + 1).trim();
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("No ANTHROPIC_API_KEY in .env");
  process.exit(1);
}

const compare = process.argv.includes("--compare");
const MODELS = compare ? ["claude-sonnet-5", "claude-opus-5"] : ["claude-sonnet-5"];

/**
 * One brief per shape of input, not one per framework.
 *
 * The short one is the interesting case: a model given three words has to either
 * invent material or admit it has little, and inventing is the failure that
 * embarrasses somebody in public.
 */
const BRIEFS = [
  {
    id: "ordinary",
    text: "Cutting on the beat makes edits feel mechanical. Attention resets when the frame changes, not when the snare hits. Cut on movement instead: a hand leaving frame, a head turning, a door closing.",
  },
  { id: "thin", text: "Cut on movement, not on the beat." },
];

const Schema = z.object({
  slides: z.array(z.object({ role: z.string(), text: z.string() })),
});

/* ── the properties ───────────────────────────────────────────────────────── */

const PLACEHOLDERS = ["your hook", "type something", "lorem", "insert ", "[", "xxx"];

/** Structural only. Every one of these is a defect anybody would recognise. */
function check(slides, structure, briefText) {
  const problems = [];
  const texts = slides.map((s) => (s.text ?? "").trim());

  if (slides.length !== structure.slots.length) {
    problems.push(`${slides.length} slides for ${structure.slots.length} slots`);
  }
  if (texts.some((t) => !t)) problems.push("a slide came back empty");

  const hook = texts[0] ?? "";
  if (hook.length > 90) problems.push(`hook is ${hook.length} chars, over 90`);

  const long = texts.slice(1).filter((t) => t.length > 220);
  if (long.length > 0) problems.push(`${long.length} body slide(s) over 220 chars`);

  for (const t of texts) {
    const low = t.toLowerCase();
    if (PLACEHOLDERS.some((p) => low.includes(p))) problems.push(`placeholder text: "${t.slice(0, 40)}"`);
  }

  /*
   * Invented specifics.
   *
   * An earlier run produced, from the brief "Cut on movement, not on the beat",
   * a coffee brand, a 30-second reel and a product launch. The showcase
   * framework asks for context and results a thin brief cannot supply, and the
   * model filled the gap rather than leaving it.
   *
   * This looks only for a MEASUREMENT: a currency amount, a percentage, a
   * multiplier, or a number welded to a unit of time. Those are claims, and a
   * claim absent from the brief was invented.
   *
   * It deliberately ignores bare integers. The first version of this check
   * flagged every educational draft for hooks like "3 cutting rules", which is
   * a deck counting its own slides, not a fabrication. Nothing separates the
   * two by pattern, and a check that is usually wrong is one nobody reads.
   */
  const MEASURE = /[$£€]\s?\d[\d,.]*k?|\d[\d,.]*\s?%|\d+\s?x|\d+[-\s](?:second|minute|hour|day|week|month|year)s?/gi;
  const inBrief = new Set((briefText.match(MEASURE) ?? []).map((m) => m.toLowerCase()));
  for (const t of texts) {
    const made = (t.match(MEASURE) ?? []).filter((m) => !inBrief.has(m.toLowerCase()));
    if (made.length > 0) {
      problems.push(`a measurement the brief never gave: "${made[0]}"`);
      break;
    }
  }

  // House style, and now guaranteed by `plainText` on the server. This runs
  // against the raw model output, so it measures how well the PROMPT holds.
  const dashes = texts.filter((t) => /[\u2014\u2013]/.test(t));
  if (dashes.length > 0) problems.push(`${dashes.length} slide(s) used a dash`);

  const ids = new Set(structure.slots.map((s) => s.id));
  if (slides.some((s) => !ids.has(s.role))) problems.push("a slide came back with an unknown slot id");

  // Two identical slides is the oldest generation bug in this codebase and the
  // one a reader notices first.
  const seen = new Set();
  for (const t of texts) {
    const key = t.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key && seen.has(key)) problems.push("two slides say the same thing");
    seen.add(key);
  }

  return problems;
}

/* ── run ──────────────────────────────────────────────────────────────────── */

const client = new Anthropic({ maxRetries: 1, timeout: 120_000 });

let failures = 0;
let calls = 0;
let inTokens = 0;
let outTokens = 0;

for (const model of MODELS) {
  console.log(`\n${"=".repeat(64)}\n${model}\n${"=".repeat(64)}`);

  for (const structure of STRUCTURES) {
    for (const brief of BRIEFS) {
      const { system, user } = assembleDraft({ brief: brief.text, structure });
      const started = Date.now();

      let parsed;
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 16000,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          output_config: { effort: "medium", format: zodOutputFormat(Schema) },
          messages: [{ role: "user", content: user }],
        });
        parsed = response.parsed_output;
        calls += 1;
        inTokens += response.usage?.input_tokens ?? 0;
        outTokens += response.usage?.output_tokens ?? 0;
      } catch (error) {
        failures += 1;
        console.log(`\n  ${structure.id}/${brief.id}  CALL FAILED: ${error.message}`);
        continue;
      }

      const ms = Date.now() - started;
      const problems = parsed ? check(parsed.slides, structure, brief.text) : ["nothing parsed"];
      if (problems.length > 0) failures += 1;

      const mark = problems.length === 0 ? "ok  " : "FAIL";
      console.log(`\n  ${mark} ${structure.id}/${brief.id}  ${ms}ms`);
      for (const p of problems) console.log(`       ! ${p}`);

      // The copy itself, because the whole point of running this by hand is that
      // a person reads it. The checks catch broken; only you catch bad.
      for (const s of parsed?.slides ?? []) {
        console.log(`       ${s.role.padEnd(10)} ${s.text}`);
      }
    }
  }
}

console.log(
  `\n${"=".repeat(64)}\n${calls} calls, ${inTokens} in, ${outTokens} out, ${failures} failing\n`,
);

if (compare) {
  console.log("Read both. The checks only prove nothing is broken, not that either is better.\n");
}

process.exit(failures > 0 ? 1 : 0);
