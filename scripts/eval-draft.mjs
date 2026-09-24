/**
 * Does the drafting prompt still produce usable carousels?
 *
 *   npm run eval:draft              every framework, the default model
 *   npm run eval:draft -- --compare claude-sonnet-5 vs claude-opus-5, side by side
 *   npm run eval:draft -- --rewrite every rewrite intent, on one line
 *   npm run eval:draft -- --caption every platform's caption, and alt text
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

import {
  assembleAlt,
  assembleCaption,
  assembleDraft,
  assembleRewrite,
  CAPTION_PLATFORMS,
  MAX_ALT_CHARS,
  PLATFORM_CAPTION,
  REWRITE_INTENTS,
} from "../server/prompts.ts";
import { groundedTags } from "../server/caption.ts";
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
const rewriteOnly = process.argv.includes("--rewrite");
const captionOnly = process.argv.includes("--caption");
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


/* ── rewriting ──────────────────────────────────────────────────── */

/**
 * The whole value of this route is whether six intents produce six meaningfully
 * different things. Nothing automated can judge that, so this prints them under
 * their intent and a person reads down the column.
 *
 * What it CAN check: that the options differ from each other and from the
 * original, that each names what it did, and that none overshot the ceiling.
 */
const RewriteSchema = z.object({
  options: z.array(z.object({ note: z.string(), text: z.string() })),
});

const LINE =
  "Cutting on the beat makes your edits feel mechanical, because attention resets when the frame changes rather than when the snare hits.";
const SLOT = { id: "why", label: "Why it happens", note: "The mechanism behind the problem", placeholder: "" };
const LIMIT = 220;

async function evalRewrites() {
  console.log(`\n${"=".repeat(64)}\nrewrite, claude-haiku-4-5\n${"=".repeat(64)}`);
  console.log(`\n  the line  ${LINE}\n            ${LINE.length} characters\n`);

  let bad = 0;
  const key = (t) => String(t).toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const intent of REWRITE_INTENTS) {
    const { system, user } = assembleRewrite({
      text: LINE,
      intent,
      count: 3,
      slot: SLOT,
      limit: LIMIT,
      ...(intent === "free" ? { instruction: "Make it sound like a person, not a manual" } : {}),
    });

    const started = Date.now();
    let parsed;
    try {
      const response = await client.messages.parse({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        output_config: { format: zodOutputFormat(RewriteSchema) },
        messages: [{ role: "user", content: user }],
      });
      parsed = response.parsed_output;
      calls += 1;
      inTokens += response.usage?.input_tokens ?? 0;
      outTokens += response.usage?.output_tokens ?? 0;
    } catch (error) {
      bad += 1;
      console.log(`  FAIL ${intent}  CALL FAILED: ${error.message}`);
      continue;
    }

    const options = parsed?.options ?? [];
    const problems = [];

    if (options.length < 2) problems.push(`only ${options.length} option(s)`);
    if (new Set(options.map((o) => key(o.text))).size !== options.length) {
      problems.push("two options say the same thing");
    }
    if (options.some((o) => key(o.text) === key(LINE))) problems.push("returned the original");
    if (options.some((o) => !String(o.note ?? "").trim())) problems.push("an option has no note");
    if (new Set(options.map((o) => key(o.note))).size !== options.length) {
      problems.push("two notes are identical");
    }
    const over = options.filter((o) => o.text.length > LIMIT);
    if (over.length > 0) problems.push(`${over.length} option(s) over ${LIMIT} chars`);

    if (problems.length > 0) bad += 1;
    console.log(`  ${problems.length === 0 ? "ok  " : "FAIL"} ${intent}  ${Date.now() - started}ms`);
    for (const p of problems) console.log(`       ! ${p}`);
    for (const o of options) {
      console.log(`       ${String(o.note).padEnd(16)} ${o.text}  [${o.text.length}]`);
    }
    console.log("");
  }

  return bad;
}

/* ── captions and alt text ───────────────────────────────────────────────── */

/**
 * Both routes, against every platform, printed for a person to read.
 *
 * The automated half is narrow on purpose: whether a caption is GOOD is not
 * checkable, but whether it overshot its ceiling, buried the point past
 * LinkedIn's fold, or came back with generic hashtags all are. The last one
 * matters most: a caption writer left alone returns #marketing every time.
 */
const CaptionSchema = z.object({
  captions: z.array(z.object({ note: z.string(), text: z.string() })),
  hashtags: z.array(z.string()),
});

const AltSchema = z.object({ alt: z.array(z.string()) });

const CAP_DECK = [
  "Cutting on the beat makes your edits feel mechanical.",
  "Attention resets when the frame changes, not when the snare hits.",
  "Cut on movement instead: a hand leaving frame, a head turning, a door closing.",
  "Same footage, same music. The cuts disappear.",
  "Save this for your next edit.",
];

async function evalCaptions() {
  console.log(`\n${"=".repeat(64)}\ncaptions and alt text\n${"=".repeat(64)}`);
  let bad = 0;

  for (const platform of CAPTION_PLATFORMS) {
    const spec = PLATFORM_CAPTION[platform];
    const { system, user } = assembleCaption({
      deck: CAP_DECK,
      platform,
      cta: CAP_DECK[CAP_DECK.length - 1],
      count: 2,
    });

    const started = Date.now();
    let parsed;
    try {
      const response = await client.messages.parse({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        output_config: { effort: "medium", format: zodOutputFormat(CaptionSchema) },
        messages: [{ role: "user", content: user }],
      });
      parsed = response.parsed_output;
      calls += 1;
      inTokens += response.usage?.input_tokens ?? 0;
      outTokens += response.usage?.output_tokens ?? 0;
    } catch (error) {
      bad += 1;
      console.log(`  FAIL ${platform}  CALL FAILED: ${error.message}`);
      continue;
    }

    const captions = parsed?.captions ?? [];
    const tags = parsed?.hashtags ?? [];
    const kept = groundedTags(tags, CAP_DECK, spec.hashtags);
    const problems = [];

    if (captions.length === 0) problems.push("no captions");
    for (const c of captions) {
      if (c.text.length > spec.limit) problems.push(`over ${spec.limit} chars`);
      if (/#\w/.test(c.text)) problems.push("a hashtag ended up inside the caption");
      if (/^(swipe|read on|here is a thread)/i.test(c.text.trim())) {
        problems.push("opened with an instruction to swipe");
      }
    }
    if (tags.length > 0 && kept.length === 0) {
      problems.push(`every hashtag was generic: ${tags.slice(0, 4).join(", ")}`);
    }

    if (problems.length > 0) bad += 1;
    console.log(`\n  ${problems.length === 0 ? "ok  " : "FAIL"} ${platform}  ${Date.now() - started}ms`);
    for (const p of problems) console.log(`       ! ${p}`);

    for (const c of captions) {
      console.log(`\n       ${c.note}  [${c.text.length}/${spec.limit}]`);
      if (spec.fold && c.text.length > spec.fold) {
        console.log(`       ${c.text.slice(0, spec.fold)}`);
        console.log(`       ---- see more ----`);
        console.log(`       ${c.text.slice(spec.fold)}`);
      } else {
        console.log(`       ${c.text.replace(/\n/g, "\n       ")}`);
      }
    }
    console.log(`\n       tags kept    ${kept.map((t) => `#${t}`).join(" ") || "(none)"}`);
    const dropped = tags.filter((t) => !kept.some((k) => k.toLowerCase() === String(t).replace(/^#/, "").toLowerCase()));
    console.log(`       tags dropped ${dropped.map((t) => `#${String(t).replace(/^#/, "")}`).join(" ") || "(none)"}`);
  }

  // Alt text, once. It does not vary by platform.
  const { system, user } = assembleAlt(CAP_DECK);
  const started = Date.now();
  try {
    const response = await client.messages.parse({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      output_config: { format: zodOutputFormat(AltSchema) },
      messages: [{ role: "user", content: user }],
    });
    calls += 1;
    inTokens += response.usage?.input_tokens ?? 0;
    outTokens += response.usage?.output_tokens ?? 0;

    const alt = response.parsed_output?.alt ?? [];
    const problems = [];
    if (alt.length !== CAP_DECK.length) problems.push(`${alt.length} entries for ${CAP_DECK.length} slides`);
    for (const a of alt) {
      if (a.length > MAX_ALT_CHARS) problems.push(`over ${MAX_ALT_CHARS} chars`);
      if (/^(image of|slide showing|text (saying|reading)|a graphic|this slide)/i.test(a.trim())) {
        problems.push(`wasted the budget on a preamble: "${a.slice(0, 24)}"`);
      }
    }

    if (problems.length > 0) bad += 1;
    console.log(`\n  ${problems.length === 0 ? "ok  " : "FAIL"} alt text  ${Date.now() - started}ms`);
    for (const p of problems) console.log(`       ! ${p}`);
    alt.forEach((a, i) => console.log(`       ${i + 1}. ${a}  [${a.length}]`));
  } catch (error) {
    bad += 1;
    console.log(`  FAIL alt text  CALL FAILED: ${error.message}`);
  }

  console.log("");
  return bad;
}

/* ── run ──────────────────────────────────────────────────────────────────── */

const client = new Anthropic({ maxRetries: 1, timeout: 120_000 });

let failures = 0;
let calls = 0;
let inTokens = 0;
let outTokens = 0;

for (const model of rewriteOnly || captionOnly ? [] : MODELS) {
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

if (rewriteOnly || (!compare && !captionOnly)) failures += await evalRewrites();
if (captionOnly) failures += await evalCaptions();

console.log(
  `\n${"=".repeat(64)}\n${calls} calls, ${inTokens} in, ${outTokens} out, ${failures} failing\n`,
);

if (compare) {
  console.log("Read both. The checks only prove nothing is broken, not that either is better.\n");
}

process.exit(failures > 0 ? 1 : 0);
