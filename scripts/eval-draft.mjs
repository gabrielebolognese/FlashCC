/**
 * Does the drafting prompt still produce usable carousels?
 *
 *   npm run eval:draft              every framework, the default model
 *   npm run eval:draft -- --compare claude-sonnet-5 vs claude-opus-5, side by side
 *   npm run eval:draft -- --rewrite every rewrite intent, on one line
 *   npm run eval:draft -- --caption every platform's caption, and alt text
 *   npm run eval:draft -- --distil  a transcript, its angles and its quotes
 *   npm run eval:draft -- --voice   four decks in one voice, and what it sees
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
  assembleDistil,
  assembleVoice,
  PLATFORM_CAPTION,
  REWRITE_INTENTS,
} from "../server/prompts.ts";
import { groundedTags } from "../server/caption.ts";
import { verbatimOnly } from "../server/verbatim.ts";
import { groundedTraits } from "../server/voice.ts";
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
const distilOnly = process.argv.includes("--distil");
const voiceOnly = process.argv.includes("--voice");
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

/* ── reading a source ────────────────────────────────────────────────────── */

/**
 * The two acceptance criteria in 13.3 and 13.5, neither of which a unit test
 * can reach: are the angles genuinely about different things, and are the
 * quotes actually in the source.
 *
 * The second is checkable exactly, and it is checked here against the SAME
 * function the route uses, so a run that passes means the route drops what it
 * should. The first is printed for a person, because "genuinely different" is
 * not a property code can assert.
 */
const DistilSchema = z.object({
  brief: z.string(),
  angles: z.array(z.object({ title: z.string(), brief: z.string(), why: z.string() })),
  quotes: z.array(z.string()),
});

/** Several distinct threads on purpose, so there is something to separate. */
const TRANSCRIPT = [
  "ALEX: Right, so the question I get asked most is why edits feel mechanical even when they're technically clean.",
  "And the answer nobody likes is that it's usually the music. People cut on the beat because it's the obvious grid.",
  "ALEX: Attention resets when the frame changes, not when the snare hits. Those are two different clocks and you can only serve one.",
  "SAM: I spent about three years cutting to music before anyone pointed that out to me.",
  "ALEX: Everyone does. The fix is to cut on movement. A hand leaving frame, a head turning, a door closing.",
  "The motion carries the eye across the cut, so it barely registers as a cut at all.",
  "SAM: Can we talk about the client side of this? Because that's where I lose the most time.",
  "ALEX: The revision loop, yes. My rule now is that I never send a first cut without a written note saying what I was going for.",
  "Without the note, the client reviews the edit against a version they imagined. With it, they review it against what I said I'd do.",
  "SAM: That halved my revision rounds. Not exaggerating, halved.",
  "ALEX: The other one is pricing. I stopped quoting per video about two years ago and started quoting per month.",
  "A per-video price makes every conversation about scope. A retainer makes it about outcomes, and it makes my income predictable.",
  "SAM: Did you lose clients doing that?",
  "ALEX: Three. And every one of them was a client I was losing money on anyway, I just hadn't worked it out yet.",
  "ALEX: The last thing is gear, which is the thing everybody wants to talk about and the thing that matters least.",
  "I shot on the same camera for six years. Nobody ever asked what it was. They asked why the cuts felt good.",
].join("\n");

async function evalDistil() {
  console.log(`\n${"=".repeat(64)}\nreading a source\n${"=".repeat(64)}`);
  console.log(`\n  source: ${TRANSCRIPT.length} characters\n`);

  const { system, user, clipped } = assembleDistil({ source: TRANSCRIPT, kind: "transcript" });
  const started = Date.now();
  let parsed;

  try {
    const response = await client.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "medium", format: zodOutputFormat(DistilSchema) },
      messages: [{ role: "user", content: user }],
    });
    parsed = response.parsed_output;
    calls += 1;
    inTokens += response.usage?.input_tokens ?? 0;
    outTokens += response.usage?.output_tokens ?? 0;
  } catch (error) {
    console.log(`  FAIL distil  CALL FAILED: ${error.message}`);
    return 1;
  }

  const angles = parsed?.angles ?? [];
  const raw = parsed?.quotes ?? [];
  const kept = verbatimOnly(raw, clipped.text);
  const problems = [];

  if (angles.length < 3) problems.push(`only ${angles.length} angle(s), wanted at least three`);
  if (angles.some((a) => !a.title?.trim() || !a.brief?.trim() || !a.why?.trim())) {
    problems.push("an angle is missing its title, brief or supporting line");
  }

  // Genuinely different is not checkable, but identical is.
  const titles = new Set(angles.map((a) => a.title.toLowerCase().replace(/[^a-z0-9]/g, "")));
  if (titles.size !== angles.length) problems.push("two angles have the same title");

  if (raw.length === 0) problems.push("no quotes at all");

  console.log(`  ${problems.length === 0 ? "ok  " : "FAIL"} distil  ${Date.now() - started}ms`);
  for (const p of problems) console.log(`       ! ${p}`);

  for (const a of angles) {
    console.log(`\n       ${a.title}`);
    console.log(`       why   ${a.why}`);
    console.log(`       brief ${a.brief}`);
  }

  console.log(`\n       quotes returned ${raw.length}, verified ${kept.length}`);
  for (const q of kept) console.log(`       kept    ${q}`);
  for (const q of raw) {
    if (!kept.includes(q)) console.log(`       DROPPED ${q}`);
  }

  /*
   * The 13.5 criterion, run for real rather than only in a unit test: a quote
   * the model never returned, planted here with one word changed, has to be
   * dropped by the same function the route uses.
   */
  const planted = "Attention resets when the frame changes, not when the drum hits.";
  const survived = verbatimOnly([planted], clipped.text);
  if (survived.length > 0) {
    console.log("       ! a planted near-miss quote survived verification");
    problems.push("planted quote survived");
  } else {
    console.log("       planted near-miss was dropped, as it must be");
  }

  console.log("");
  return problems.length > 0 ? 1 : 0;
}

/* ── working out a voice ─────────────────────────────────────────────────── */

/**
 * Whether the traits are worth reading is a judgement, so they are printed.
 * Whether the EVIDENCE is real is exact, and is checked against the same
 * function the route uses.
 *
 * The decks below are written in one deliberate voice: very short sentences,
 * second person, the claim first, no hedging. If the traits come back as
 * "direct and punchy" the prompt has failed, because that describes everything.
 */
const VoiceSchema = z.object({
  tone: z.string(),
  avoid: z.array(z.string()),
  observed: z.array(z.object({ trait: z.string(), evidence: z.string() })),
});

const VOICE_DECKS = [
  [
    "Your edits feel mechanical. Here is why.",
    "You cut on the beat. The beat is not where attention lives.",
    "Attention resets when the frame changes.",
    "Cut on movement. A hand leaving frame. A door closing.",
    "Try it on one clip. You will hear the difference.",
  ],
  [
    "You are quoting per video. Stop.",
    "Per video makes every call about scope.",
    "A retainer makes it about outcomes.",
    "You will lose two clients. They were the unprofitable ones.",
    "Send the new terms this week.",
  ],
  [
    "Nobody asks what camera you used.",
    "They ask why the cuts feel good.",
    "I shot on the same body for six years.",
    "The gear was never the thing.",
    "Fix the cuts first.",
  ],
  [
    "Your first cut goes out with no note. That is the problem.",
    "Without a note the client reviews against a version they imagined.",
    "With one they review against what you said you would do.",
    "Write two lines. Send them with the link.",
    "Your revision rounds will halve.",
  ],
];

async function evalVoice() {
  console.log(`\n${"=".repeat(64)}\nworking out a voice\n${"=".repeat(64)}`);

  const { system, user } = assembleVoice({ decks: VOICE_DECKS });
  const corpus = VOICE_DECKS.map((d) => d.join("\n")).join("\n");
  const started = Date.now();
  let parsed;

  try {
    const response = await client.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 3000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "medium", format: zodOutputFormat(VoiceSchema) },
      messages: [{ role: "user", content: user }],
    });
    parsed = response.parsed_output;
    calls += 1;
    inTokens += response.usage?.input_tokens ?? 0;
    outTokens += response.usage?.output_tokens ?? 0;
  } catch (error) {
    console.log(`  FAIL voice  CALL FAILED: ${error.message}`);
    return 1;
  }

  const observed = parsed?.observed ?? [];
  const kept = groundedTraits(observed, corpus);
  const problems = [];

  if (observed.length < 3) problems.push(`only ${observed.length} trait(s), wanted at least three`);
  if (kept.length < 3) {
    problems.push(`only ${kept.length} of ${observed.length} traits had real evidence`);
  }

  // The adjectives that describe every piece of writing anybody has praised.
  const EMPTY = /^(direct|punchy|engaging|conversational|concise|clear|authentic)\b/i;
  const vague = kept.filter((o) => EMPTY.test(o.trait.trim()));
  if (vague.length > 0) problems.push(`trait describes nothing: "${vague[0].trait}"`);

  if (!parsed?.tone?.trim()) problems.push("no tone description");

  console.log(`\n  ${problems.length === 0 ? "ok  " : "FAIL"} voice  ${Date.now() - started}ms`);
  for (const p of problems) console.log(`       ! ${p}`);

  console.log(`\n       tone  ${parsed?.tone ?? ""}`);
  console.log(`\n       traits ${observed.length} returned, ${kept.length} with real evidence`);
  for (const o of kept) {
    console.log(`       kept    ${o.trait}`);
    console.log(`                 "${o.evidence}"`);
  }
  for (const o of observed) {
    if (!kept.some((k) => k.trait === o.trait)) {
      console.log(`       DROPPED ${o.trait}`);
      console.log(`                 "${o.evidence}"  <- not in the decks`);
    }
  }
  console.log(`\n       avoid ${(parsed?.avoid ?? []).join(", ") || "(none)"}`);

  /*
   * The same planted-near-miss check the distil route gets: evidence with one
   * word changed has to take its trait down with it.
   */
  const planted = groundedTraits(
    [{ trait: "Planted", evidence: "Attention resets when the shot changes." }],
    corpus,
  );
  if (planted.length > 0) {
    console.log("       ! a planted near-miss trait survived verification");
    problems.push("planted trait survived");
  } else {
    console.log("       planted near-miss was dropped, as it must be");
  }

  console.log("");
  return problems.length > 0 ? 1 : 0;
}

/* ── run ──────────────────────────────────────────────────────────────────── */

const client = new Anthropic({ maxRetries: 1, timeout: 120_000 });

let failures = 0;
let calls = 0;
let inTokens = 0;
let outTokens = 0;

for (const model of rewriteOnly || captionOnly || distilOnly || voiceOnly ? [] : MODELS) {
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

if (rewriteOnly || (!compare && !captionOnly && !distilOnly && !voiceOnly)) {
  failures += await evalRewrites();
}
if (captionOnly) failures += await evalCaptions();
if (distilOnly) failures += await evalDistil();
if (voiceOnly) failures += await evalVoice();

console.log(
  `\n${"=".repeat(64)}\n${calls} calls, ${inTokens} in, ${outTokens} out, ${failures} failing\n`,
);

if (compare) {
  console.log("Read both. The checks only prove nothing is broken, not that either is better.\n");
}

process.exit(failures > 0 ? 1 : 0);
