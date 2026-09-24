/**
 * Every word this product sends to a model, assembled in one pure place.
 *
 * ── Why this is not inside the handlers ──────────────────────────────────────
 *
 * Prompt assembly is deterministic: the same framework and the same brief
 * produce the same bytes, every time. That makes it testable, and a prompt that
 * is tested is a prompt whose edits show up in a diff rather than in somebody's
 * carousel three weeks later. It was inline in `draft.ts` and nothing could see
 * it change.
 *
 * Nothing here touches the network, reads an environment variable, or knows what
 * a model is. It builds strings.
 *
 * ── The cache boundary is a design decision, not a detail ────────────────────
 *
 * Anthropic caches a PREFIX. Everything before the cache breakpoint has to be
 * byte-identical between calls or the cache misses entirely and costs slightly
 * more than not caching at all.
 *
 * So the split is: what never varies goes in the SYSTEM block and is cached;
 * what varies per request goes in the USER message and is not. The framework's
 * slot lines look static, and are not, there are four frameworks, so they would
 * fragment the cache four ways for no benefit. Brand voice is the interesting
 * case and is discussed where it is built.
 */

/* ── shapes ───────────────────────────────────────────────────────────────── */

export type SlotSpec = { id: string; label: string; note: string; placeholder: string };

export type Structure = { name: string; shape: string; slots: SlotSpec[] };

/**
 * How somebody sounds, as the model is told about it.
 *
 * Mirrors `Brand.voice` in the browser. Every field optional, because a brand
 * with no voice is the common case and has to produce exactly the prompt it
 * produced before this existed.
 */
export type Voice = {
  tone?: string | undefined;
  /** Their own posts. The model matches these rather than being described to. */
  samples?: string[] | undefined;
  avoid?: string[] | undefined;
};

/** Ceilings, so a paste of a whole book is not billed as a whole book. */
export const MAX_BRIEF_CHARS = 8000;
export const MAX_DECK_CHARS = 12000;
export const MAX_SAMPLES = 3;
export const MAX_SAMPLE_CHARS = 1200;
export const MAX_TONE_CHARS = 400;
export const MAX_AVOID = 20;

export const clip = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit).trimEnd()}…`;

/* ── the static halves ────────────────────────────────────────────────────── */

export const DRAFT_SYSTEM = `You write social carousels. You are given a framework, the job each slide does, and a brief.

Rules:
- Write finished copy, not instructions or placeholders. Never write "your hook here".
- One idea per slide. If a slide needs an "and also", it belongs in two slides.
- Keep each slide short enough to read at a glance: the hook under 90 characters, body slides under 220.
- Match the job of each slot exactly. The hook decides whether slide 2 is seen, so make it specific, a number, a cost, a consequence, never a category.
- Write in the brief's own voice and vocabulary. Do not add claims, numbers, or results the brief does not contain.
- If the brief does not give you what a slot asks for, write something true and general instead. Never invent a client, a company, a number, a timeframe or a result. A vague slide is recoverable; a fabricated one gets published and is not.
- No em dashes, ever. A comma or a full stop, never a dash.
- No hashtags, no emoji, no "in today's fast-paced world".
- Return one entry per slot, in order, using the given slot ids.`;

/**
 * The ceilings a slide's copy has to fit.
 *
 * Exported because the prompt states them and the checks enforce them, and two
 * copies of "90" is how those two quietly stop agreeing.
 */
export const HOOK_CHARS = 90;
export const BODY_CHARS = 220;

export const REWRITE_SYSTEM = `You rewrite single lines of copy for social carousels.

You are given one line, the job it does in its deck, and what to change about it. You return several complete replacements for that line.

Rules:
- Each alternative is a finished line, ready to publish, not a note about how to write one.
- Each one takes a genuinely different approach. Rewording the same idea three times is useless.
- Keep the job the line does. A call to action stays a call to action; a hook stays a hook.
- Add no claim, number, name or result that the line and the deck do not already contain.
- Stay inside the character limit you are given.
- Use the deck's own vocabulary and register. You are editing somebody's writing, not replacing their voice with yours.
- No em dashes, ever. A comma or a full stop, never a dash.
- No hashtags, no emoji.
- Name what each alternative actually did in AT MOST FOUR WORDS: "tighter", "names the cost", "plainer words". Not a sentence, not an explanation. Never "option 1", never "better".`;

export const HOOK_SYSTEM = `You write opening slides for social carousels. The opening slide decides whether slide 2 is ever seen.

You are given a carousel that already exists and its current opening line. Write alternative openings for THAT carousel.

Rules:
- Each one must be a promise the rest of the deck actually keeps. Never promise material the deck does not contain.
- Each one takes a genuinely different angle. Rewording the same idea five times is useless.
- Under 90 characters. Shorter is better.
- Specific beats clever: a number, a cost, a consequence, a named mistake. Never a category.
- Use the deck's own voice and vocabulary. Do not add claims, numbers or results it does not contain.
- No em dashes, ever. A comma or a full stop, never a dash.
- No hashtags, no emoji, no clickbait the deck cannot pay off.
- Name the angle in two or three words.`;


/* ── what comes back ───────────────────────────────────────── */

/**
 * Strip the punctuation this product does not use, from copy a model wrote.
 *
 * Output cleaning in a module called "prompts" needs a reason. It is here
 * because it is pure, and pure means `prompts.test.ts` can prove it; the
 * alternative is the same three regexes sitting untested inside a request
 * handler that only runs when somebody is being billed.
 *
 * Why it exists at all: the house style has no em dashes, and every source file
 * is held to that by `copy.test.ts`. Model output is not a source file, so
 * nothing was holding it to anything. A comparison run had Opus put em dashes in
 * four slides out of eight, which would have gone into somebody's carousel and
 * out to their audience.
 *
 * The prompt asks for no em dashes as well. This is not redundancy: a prompt is
 * a strong preference and this is a guarantee, and the difference matters when
 * the output is published under somebody else's name.
 */
export const plainText = (text: string): string =>
  text
    .replace(/\s*\u2014+\s*/g, ", ")
    // A range keeps its meaning with a hyphen. Everything else was punctuation.
    .replace(/(\d)\s*\u2013\s*(\d)/g, "$1-$2")
    .replace(/\s*\u2013+\s*/g, ", ")
    .replace(/\s+,/g, ",")
    // ", ." and ", ," are what the replacements above leave behind when the dash
    // was already sitting next to punctuation.
    .replace(/,\s*([,.;:!?])/g, "$1")
    .replace(/^[\s,]+/, "")
    .replace(/[\s,]+$/, "")
    .trim();

/* ── voice ────────────────────────────────────────────────────────────────── */

/**
 * The voice block, or nothing at all.
 *
 * Returns an empty string when there is nothing to say, and that matters more
 * than it looks: an empty heading followed by whitespace is a prompt telling the
 * model that voice is a thing it should be thinking about, while giving it
 * nothing to think with. Absent is clearer than blank.
 *
 * **Samples come last and carry the weight.** Three of somebody's own posts do
 * more than any number of adjectives about being punchy, because the model can
 * match a pattern it can see and can only guess at a description. The tone line
 * frames them; the list of banned words trims the result.
 */
export function voiceBlock(voice: Voice | undefined): string {
  if (!voice) return "";

  const tone = voice.tone?.trim();
  const avoid = (voice.avoid ?? []).map((w) => w.trim()).filter(Boolean).slice(0, MAX_AVOID);
  const samples = (voice.samples ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SAMPLES)
    .map((s) => clip(s, MAX_SAMPLE_CHARS));

  if (!tone && avoid.length === 0 && samples.length === 0) return "";

  const parts: string[] = ["This account has a voice. Match it."];

  if (tone) parts.push(`How they describe it: ${clip(tone, MAX_TONE_CHARS)}`);
  if (avoid.length > 0) parts.push(`Words and phrases they never use: ${avoid.join(", ")}`);

  if (samples.length > 0) {
    parts.push(
      "Things they have actually written. Match the rhythm, the sentence length and the vocabulary, not the subject:",
    );
    samples.forEach((s, i) => parts.push(`${i + 1}. ${s}`));
  }

  return parts.join("\n");
}

/* ── drafting ─────────────────────────────────────────────────────────────── */

export type DraftInput = {
  brief: string;
  structure: Structure;
  voice?: Voice | undefined;
};

export const slotLines = (slots: readonly SlotSpec[]): string =>
  slots
    .map((s, i) => `${i + 1}. id="${s.id}", ${s.label}: ${s.note}. e.g. "${s.placeholder}"`)
    .join("\n");

export type Assembled = { system: string; user: string };

/**
 * The draft request, split along the cache boundary.
 *
 * `system` is identical for every draft anybody ever makes, so it caches across
 * users. The voice block is NOT in it: it is per brand, so putting it there
 * would give every brand its own cache entry and the shared prefix would be
 * worth nothing.
 */
export function assembleDraft(input: DraftInput): Assembled {
  const voice = voiceBlock(input.voice);

  const user = [
    `Framework: ${input.structure.name} (${input.structure.shape})`,
    "",
    `Slots, in order:\n${slotLines(input.structure.slots)}`,
    ...(voice ? ["", voice] : []),
    "",
    `Brief:\n${clip(input.brief.trim(), MAX_BRIEF_CHARS)}`,
  ].join("\n");

  return { system: DRAFT_SYSTEM, user };
}

/* ── hooks ────────────────────────────────────────────────────────────────── */

export type HookInput = {
  hook: string;
  deck: string[];
  framework?: string | undefined;
  count: number;
  voice?: Voice | undefined;
};

export function assembleHooks(input: HookInput): Assembled {
  const voice = voiceBlock(input.voice);

  // Clipped as a whole rather than per slide: a deck of forty short slides and a
  // deck of three enormous ones cost the same either way, and truncating the
  // last slide is better than silently dropping the last ten.
  const deck = clip(
    input.deck.map((t, i) => `${i + 1}. ${t}`).join("\n"),
    MAX_DECK_CHARS,
  );

  const user = [
    ...(input.framework ? [`Framework: ${input.framework}`, ""] : []),
    `Current opening: ${input.hook.trim() || "(none yet)"}`,
    ...(voice ? ["", voice] : []),
    "",
    `The carousel, slide by slide:\n${deck}`,
    "",
    `Write ${input.count} alternative openings.`,
  ].join("\n");

  return { system: HOOK_SYSTEM, user };
}

/* ── rewriting one line ───────────────────────────────────────────────────── */

export type RewriteIntent = "shorter" | "punchier" | "simpler" | "angle" | "expand" | "free";

export const REWRITE_INTENTS: readonly RewriteIntent[] = [
  "shorter",
  "punchier",
  "simpler",
  "angle",
  "expand",
  "free",
];

/**
 * What each intent actually asks for.
 *
 * Written out because "punchier" means nothing to a model on its own, and the
 * entire value of this feature is whether three alternatives are meaningfully
 * different from each other rather than three shuffles of the same sentence.
 *
 * Each one also says what NOT to do, because the obvious failure of every intent
 * here is the same: making the line better by making a bigger claim.
 */
export const INTENT_RULES: Record<RewriteIntent, string> = {
  shorter:
    "Say the same thing in fewer words. Cut qualifiers, hedges and throat-clearing. Never cut the specific detail: a number, a name or a concrete noun is the last thing to go, not the first.",
  punchier:
    "Same claim, stronger verb, and put the consequence at the front. Do not reach for a bigger claim to make it land harder.",
  simpler:
    "Plainer vocabulary and shorter clauses. Remove jargon and abstraction. The claim itself does not change.",
  angle:
    "Same job in the deck, approached from a different direction. A different way into the same point, not a different point.",
  expand:
    "Add one more concrete beat: the example, cost or consequence the line implies but does not say. Do not pad with adjectives.",
  // Replaced by the user's own words in `assembleRewrite`. Present so the record
  // is exhaustive and a new intent cannot be added without answering this.
  free: "",
};

/**
 * A note is a label, so it has to fit on one line beside a character count.
 *
 * The prompt asks for at most four words and a real run came back with "Names
 * the sensory disconnect without using technical terms", which is a sentence. A
 * prompt is a preference and this is the guarantee, the same split as
 * `plainText`. Cut at a word boundary, because a label ending mid-word reads as
 * a rendering bug rather than as a label.
 */
export const MAX_NOTE_CHARS = 32;

export function shortNote(note: string): string {
  const clean = note.trim().replace(/[.,;:]+$/, "");
  if (clean.length <= MAX_NOTE_CHARS) return clean;

  const cut = clean.slice(0, MAX_NOTE_CHARS);
  const at = cut.lastIndexOf(" ");
  return (at > 8 ? cut.slice(0, at) : cut).replace(/[.,;:]+$/, "");
}

export const MAX_REWRITE_CHARS = 2000;
export const MAX_INSTRUCTION_CHARS = 300;
export const MIN_REWRITE_COUNT = 2;
export const MAX_REWRITE_COUNT = 5;

export type RewriteInput = {
  text: string;
  intent: RewriteIntent;
  /** Only read when `intent` is `free`. */
  instruction?: string | undefined;
  slot?: SlotSpec | undefined;
  deck?: string[] | undefined;
  count: number;
  /** The character ceiling for this slide. Falls back to the slot's own. */
  limit?: number | undefined;
  voice?: Voice | undefined;
};

/** A hook is held to 90; everything else to 220. See `HOOK_CHARS`. */
export const limitFor = (slot: SlotSpec | undefined, override?: number | undefined): number =>
  override ?? (slot?.id === "hook" ? HOOK_CHARS : BODY_CHARS);

/**
 * The rewrite request.
 *
 * The line comes LAST, after the job, the instruction and the surrounding deck.
 * Everything above it is context for a judgement about it, and a model given the
 * line first starts rewriting before it knows what the line is for.
 *
 * The deck is included but numbered without marking which entry is the one being
 * rewritten, because it may not be in there at all: this route also serves a
 * layer somebody drew by hand that no slide text contains.
 */
export function assembleRewrite(input: RewriteInput): Assembled {
  const voice = voiceBlock(input.voice);
  const limit = limitFor(input.slot, input.limit);

  const instruction =
    input.intent === "free"
      ? clip((input.instruction ?? "").trim(), MAX_INSTRUCTION_CHARS) ||
        // An empty free-text box is a request for something different, not a
        // request for nothing. Refusing would be correct and unhelpful.
        INTENT_RULES.angle
      : INTENT_RULES[input.intent];

  const deck = (input.deck ?? []).map((t) => t.trim()).filter(Boolean);

  const user = [
    `What to change: ${instruction}`,
    "",
    `Hard limit: ${limit} characters. Anything longer is unusable.`,
    ...(input.slot
      ? ["", `The job this line does: ${input.slot.label}. ${input.slot.note}`]
      : []),
    ...(voice ? ["", voice] : []),
    ...(deck.length > 0
      ? [
          "",
          `The carousel it lives in, for context:\n${clip(
            deck.map((t, i) => `${i + 1}. ${t}`).join("\n"),
            MAX_DECK_CHARS,
          )}`,
        ]
      : []),
    "",
    `The line to rewrite:\n${clip(input.text.trim(), MAX_REWRITE_CHARS)}`,
    "",
    `Write ${input.count} alternatives.`,
  ].join("\n");

  return { system: REWRITE_SYSTEM, user };
}
