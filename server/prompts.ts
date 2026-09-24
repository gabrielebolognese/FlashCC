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

/* ── working out a voice ──────────────────────────────────────────────────── */

export const MAX_LEARN_DECKS = 12;
export const MAX_LEARN_CHARS = 20000;

export const VOICE_SYSTEM = `You read several carousels one person wrote and describe how they write.

You are characterising a voice, not reviewing it. Nothing here is a judgement about whether the writing is good.

Rules:
- Return three to six traits. Each one is a specific, checkable habit: sentence length, where they put the claim, what person they write in, punctuation they favour, what they refuse to do.
- **Every trait needs one line from the decks, COPIED EXACTLY, that demonstrates it.** Character for character, no tidying, no trimming, no joining two lines that were apart. The evidence is the whole point: a description somebody cannot check is a description they have to take on faith.
- Never claim a trait the decks do not show. If you can only support three, return three.
- "Direct", "punchy", "engaging" and "conversational" are not traits. They describe every piece of writing anybody has ever praised. Say what they actually DO instead.
- Also return a short tone description, two sentences at most, in the second person: "You write X. You never Y."
- Also return the words and constructions these decks conspicuously avoid, where there is evidence of avoidance rather than mere absence. If there is none, return an empty list. An invented list of banned words is worse than none, because it will be applied to everything they write afterwards.
- No em dashes in anything you write yourself. This does not apply to the evidence, which is copied.`;

export type VoiceInput = {
  decks: string[][];
  existing?: Voice | undefined;
};

/**
 * The decks, numbered, with the slides inside each one kept together.
 *
 * Flattening them into one list of lines would lose the thing being measured:
 * how somebody opens, how they close, and how long they let a middle slide run
 * are all facts about a carousel's shape, not about a sentence.
 */
export function assembleVoice(input: VoiceInput): Assembled {
  const decks = input.decks
    .map((d) => d.map((t) => t.trim()).filter(Boolean))
    .filter((d) => d.length > 0);

  const body = clip(
    decks
      .map((d, i) => `Carousel ${i + 1}:\n${d.map((t, j) => `  ${j + 1}. ${t}`).join("\n")}`)
      .join("\n\n"),
    MAX_LEARN_CHARS,
  );

  const user = [
    ...(input.existing?.tone
      ? [
          `They have already described their own voice as: ${clip(input.existing.tone.trim(), MAX_TONE_CHARS)}`,
          "Say what the decks actually show, whether or not it agrees with that.",
          "",
        ]
      : []),
    `${decks.length} carousel${decks.length === 1 ? "" : "s"} they wrote:`,
    "",
    body,
  ].join("\n");

  return { system: VOICE_SYSTEM, user };
}

/* ── reading a source ─────────────────────────────────────────────────────── */

/**
 * Higher than the brief ceiling on purpose.
 *
 * A brief is something somebody typed; a source is something they had. Forty
 * thousand characters is roughly a long conference talk or a substantial
 * newsletter, and it clips rather than refuses, because reading most of a
 * transcript beats refusing all of it. What must not happen is reading half and
 * saying nothing, which is why the caller is told how much was used.
 */
export const MAX_SOURCE_CHARS = 40000;

export type SourceKind = "transcript" | "article" | "notes" | "post";

export const SOURCE_KINDS: readonly SourceKind[] = ["transcript", "article", "notes", "post"];

export const DISTIL_SYSTEM = `You read a piece of source material and work out which carousels are in it.

You do NOT write the carousel. You find the angles worth building and hand back what each one would be about.

Rules:
- Return three to five angles. Each one is a DIFFERENT carousel, not the same idea described five ways. If the source genuinely only supports two, return two.
- Each angle needs a short title, a brief that would produce that carousel, and a line saying what in the source supports it.
- The brief is written the way somebody would write it for themselves: what the carousel argues, and the specifics from the source that back it up. Two or three sentences.
- Never invent material. Every angle has to be supported by something actually in the source, and the supporting line is where you say what.
- Also return the source's most quotable lines, COPIED EXACTLY, character for character, with no tidying, no trimming, no fixing of grammar and no joining of two sentences that were apart. A quote you have improved is a quote the person never said.
- Prefer quotes that would stand alone on a slide: a claim, a number, a reversal, a sentence somebody would repeat.
- If the source is thin, say so by returning fewer angles rather than padding it with angles it cannot support.
- No em dashes in anything you write yourself. A comma or a full stop. This does not apply to the quotes, which are copied.
- Also return one plain brief describing the most obvious carousel, for somebody who does not want to choose.`;

export type DistilInput = {
  source: string;
  kind?: SourceKind | undefined;
  structure?: Structure | undefined;
  voice?: Voice | undefined;
};

/** What was sent and what was left behind, so the interface can say so. */
export type Clipped = { text: string; used: number; total: number; clipped: boolean };

export function clipSource(source: string): Clipped {
  const trimmed = source.trim();
  const clipped = trimmed.length > MAX_SOURCE_CHARS;
  return {
    text: clipped ? trimmed.slice(0, MAX_SOURCE_CHARS) : trimmed,
    used: Math.min(trimmed.length, MAX_SOURCE_CHARS),
    total: trimmed.length,
    clipped,
  };
}

export function assembleDistil(input: DistilInput): Assembled & { clipped: Clipped } {
  const clipped = clipSource(input.source);
  const voice = voiceBlock(input.voice);

  const user = [
    ...(input.kind ? [`The source is a ${input.kind}.`, ""] : []),
    ...(input.structure
      ? [
          `The carousel will use the ${input.structure.name} framework (${input.structure.shape}), so favour angles that fit it.`,
          "",
        ]
      : []),
    ...(voice ? [voice, ""] : []),
    "The source:",
    clipped.text,
  ].join("\n");

  return { system: DISTIL_SYSTEM, user, clipped };
}

/* ── the caption, and the words around the deck ───────────────────────────── */

/**
 * Where LinkedIn folds a post behind "see more".
 *
 * The single load-bearing fact about a LinkedIn caption, and the one thing a
 * generic caption writer always gets wrong. Everything after this is invisible
 * until somebody chooses to expand, so the first 210 characters are not the
 * opening of the caption, they ARE the caption as far as the feed is concerned.
 */
export const LINKEDIN_FOLD = 210;

export type CaptionPlatform = "linkedin" | "instagram" | "tiktok";

export const CAPTION_PLATFORMS: readonly CaptionPlatform[] = ["linkedin", "instagram", "tiktok"];

/**
 * What each destination actually wants.
 *
 * This is the whole reason there is not one caption prompt. The three want
 * genuinely different things and a single generic caption is worse than none:
 * the reader's situation is different in each, and on LinkedIn most of the text
 * is not even shown.
 */
export const PLATFORM_CAPTION: Record<
  CaptionPlatform,
  { name: string; limit: number; fold?: number; hashtags: number; rules: string[] }
> = {
  linkedin: {
    name: "LinkedIn",
    limit: 3000,
    fold: LINKEDIN_FOLD,
    hashtags: 5,
    rules: [
      `Only the first ${LINKEDIN_FOLD} characters are shown before the post is folded behind "see more". Everything you want a scroller to read has to be inside them, and the ${LINKEDIN_FOLD}th character must land somewhere that makes a person want to expand it.`,
      "Never open with an instruction to swipe. The carousel is visible; telling somebody to look at it wastes the only line they will read.",
      "Write for a professional feed: plain, specific, no hype.",
      "Hashtags go at the very end, never inside a sentence.",
    ],
  },
  instagram: {
    name: "Instagram",
    limit: 2200,
    hashtags: 10,
    rules: [
      "The carousel is already on screen and already legible, so the caption is not a summary of it. It earns a stop and adds what the slides could not fit.",
      "Short paragraphs with blank lines between them. A wall of text is scrolled past.",
      "Hashtags belong in their own block at the end, never mid-sentence.",
    ],
  },
  tiktok: {
    name: "TikTok",
    limit: 2200,
    hashtags: 5,
    rules: [
      "Assume a video-first audience who may never swipe through the slides at all. The caption has to make sense on its own.",
      "Conversational, direct, second person. Closer to how somebody talks than how they write.",
      "Hashtags may sit inline here if they read naturally.",
    ],
  },
};

export const MAX_ALT_CHARS = 125;

export const CAPTION_SYSTEM = `You write the text post that goes underneath a social carousel.

The carousel does the work. The caption is what makes somebody open it, and what the post says to the people who never swipe at all.

Rules:
- Write finished copy, ready to post. Not a description of a caption.
- Open with the line that earns attention. Never "Swipe to learn more", never "Here is a thread", never "Read on".
- Use only what the carousel contains. Add no claim, number, name or result that is not in it.
- Match the deck's own vocabulary and register. You are writing as the person who wrote the slides.
- Stay inside the character limit you are given.
- No em dashes, ever. A comma or a full stop, never a dash.
- No emoji.
- Hashtags are returned separately and must never appear inside the caption text.
- Every hashtag has to come from what the carousel is actually about, using its own words. Generic tags like #marketing, #contentcreation or #growth are worthless to everybody and are not wanted.
- Name what each caption did in at most four words: "opens on the cost", "plainer, shorter". Not a sentence.`;

export const ALT_SYSTEM = `You write alt text for the slides of a social carousel, read aloud to people using a screen reader.

You are given each slide's copy, in order. You return one description per slide.

Rules:
- One entry per slide, in the order given. Never merge two slides or skip one.
- Under ${MAX_ALT_CHARS} characters each. Most screen readers cut off around there.
- Say what the slide SHOWS. Somebody who cannot see it should come away with the same information a sighted reader gets.
- **When a slide is only words, the alt text IS those words.** Give them as they appear and stop. Do not introduce them.
- Never begin with "Image of", "Slide showing", "Text saying", "A graphic that", "This slide". The reader already knows it is a slide, and on a 125 character budget a preamble repeated nine times is most of the budget.
- Add how the words are presented only when it carries meaning a reader would otherwise miss, such as one word set much larger than the rest, or a picture behind them.
- Do not editorialise, do not interpret, and do not add anything the slide does not contain.
- Plain sentences. No em dashes, no emoji, no hashtags, no markup.`;

export type CaptionInput = {
  deck: string[];
  platform: CaptionPlatform;
  framework?: string | undefined;
  cta?: string | undefined;
  count: number;
  voice?: Voice | undefined;
};

export function assembleCaption(input: CaptionInput): Assembled {
  const spec = PLATFORM_CAPTION[input.platform];
  const voice = voiceBlock(input.voice);

  const deck = clip(
    input.deck.map((t) => t.trim()).filter(Boolean).map((t, i) => `${i + 1}. ${t}`).join("\n"),
    MAX_DECK_CHARS,
  );

  // Platform rules go in the USER message, not the cached system block. There
  // are three of them, so putting them above the cache breakpoint would split
  // the shared prefix three ways and the cache would be worth a third as much.
  const user = [
    `Platform: ${spec.name}`,
    "",
    spec.rules.map((r) => `- ${r}`).join("\n"),
    "",
    `Hard limit: ${spec.limit} characters.`,
    `Return at most ${spec.hashtags} hashtags.`,
    ...(input.framework ? ["", `The carousel's framework: ${input.framework}`] : []),
    ...(input.cta ? ["", `What the last slide asks for: ${input.cta.trim()}`] : []),
    ...(voice ? ["", voice] : []),
    "",
    `The carousel, slide by slide:\n${deck}`,
    "",
    `Write ${input.count} caption${input.count === 1 ? "" : "s"}.`,
  ].join("\n");

  return { system: CAPTION_SYSTEM, user };
}

export function assembleAlt(deck: readonly string[]): Assembled {
  const slides = clip(
    deck.map((t, i) => `${i + 1}. ${t.trim() || "(no text on this slide)"}`).join("\n"),
    MAX_DECK_CHARS,
  );

  return {
    system: ALT_SYSTEM,
    // The count is stated as well as implied. A model given nine slides and no
    // number returns eight often enough to matter, and the entries are consumed
    // positionally, so a short answer silently shifts every later slide's alt.
    user: `The carousel has ${deck.length} slide${deck.length === 1 ? "" : "s"}.\n\n${slides}\n\nWrite exactly ${deck.length} description${deck.length === 1 ? "" : "s"}, one per slide, in order.`,
  };
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
