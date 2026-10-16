/**
 * The carousel frameworks: the four the product started with, and since Batch
 * 25 twelve more (`MORE`, at the end of this file).
 *
 * A carousel is not an arbitrary pile of slides, it is one of four shapes, and each
 * one opens differently. The hook of a problem-solve names a cost; the hook of a
 * story names a moment. Getting that wrong is the most expensive mistake in the
 * format, so the shape is chosen first and every box says what belongs in it.
 *
 *   Problem-Solve   Problem → Fix
 *   Showcase        Work → Process → Result
 *   Educational     Concept → Explanation → Application
 *   Story           Situation → Conflict → Transformation
 */

export type Slot = {
  /** Stable id. Slots sharing an id are the repeatable ones. */
  id: string;
  label: string;
  /** One line, shown beside the box. A punchline, never a paragraph. */
  note: string;
  /** The long version, on hover. Costs no space. */
  detail: string;
  placeholder: string;
  examples: string[];
  /** The slot "add slide" clones. */
  repeatable?: boolean;
  /**
   * A block this slot is shown as (Batch 19.7). The STRUCTURE chose it, not the
   * model: the model is asked for these fields, in words, and never sees a list
   * of blocks or decides which one to use.
   */
  block?: SlotBlock | undefined;
  /**
   * The honesty rule (25.1): this slot reports a result, a figure or somebody's
   * words, so when the brief does not contain one the model returns
   * `HONEST_BLANK` instead of writing a plausible one.
   */
  honest?: boolean | undefined;
};

export type SlotBlock = {
  id: string;
  label: string;
  /** What each field must say, in the order the model returns them. */
  fields: { key: string; note: string }[];
  /**
   * Fields the STRUCTURE sets, never the model: which column headings a Myth
   * versus fact slot uses, which kind of chart. A block with no words to ask
   * for (a screen frame) is placed from these alone.
   */
  fixed?: Record<string, string> | undefined;
};

/**
 * A section rhythm (25.1): the same framework in a different order or
 * grouping, so twenty decks in one framework do not all come out one shape.
 * The deck is `open`, then `unit` repeated, then `close`. A unit can be two
 * slots (a myth and its fact), which is why the count steps by its length.
 */
export type Rhythm = {
  id: string;
  label: string;
  note: string;
  open: Slot[];
  unit: Slot[];
  close: Slot[];
};

/** How the picker groups them: by what the carousel is for. */
export type FrameworkFamily = "Teach" | "Persuade" | "Prove" | "Engage";

/** "Let the numbers persuade": a result slot is a big number and what it means. */
const RESULT_AS_STAT: SlotBlock = {
  id: "stat",
  label: "big number",
  fields: [
    { key: "value", note: "the single most important figure, exactly as written, such as 3x or 61K" },
    { key: "label", note: "what that figure measures, in under eight words" },
  ],
};

export type Structure = {
  id: string;
  name: string;
  shape: string;
  description: string;
  /** The natural running order: the first rhythm at its natural length. */
  slots: Slot[];
  family?: FrameworkFamily | undefined;
  /** The slide counts this framework is drafted at by default (25.1). Asking for another still gets it. */
  range?: [number, number] | undefined;
  /** Two or three; the first is `slots`. */
  rhythms?: Rhythm[] | undefined;
};

const CORE: Structure[] = [
  {
    id: "problem",
    name: "Problem → Solution",
    shape: "Problem → Fix",
    description: "Name a pain, then fix it. The workhorse, and it works on a cold audience.",
    slots: [
      {
        id: "hook",
        label: "Hook",
        note: "Decides whether slide 2 is ever seen",
        detail:
          "The most important text in the whole carousel. Name the pain the reader already has, and promise the reason. Specific beats clever.",
        placeholder: "Your videos feel boring. Here's why.",
        examples: [
          "Your videos feel boring. Here's why.",
          "You're losing 3 hours a week to a problem you haven't named.",
          "Nobody tells you this until it's already cost you a client.",
        ],
      },
      {
        id: "problem",
        label: "The problem",
        note: "Make it sting before you fix it",
        detail: "Describe the situation in their words, not yours. One idea only.",
        placeholder: "The problem, in their words.",
        examples: [
          "Every cut lands on the beat and it still feels flat.",
          "You post it, it does fine, nobody remembers it by Friday.",
        ],
      },
      {
        id: "why",
        label: "Why it happens",
        note: "Name the cause, not the symptom",
        detail:
          "The mistake underneath. This is where you show you understand the cause. It is what separates you from everyone giving surface tips.",
        placeholder: "The mistake causing it.",
        examples: [
          "You're cutting to the rhythm of the audio, not the attention.",
          "The problem was never the footage. It was the pacing.",
        ],
      },
      {
        id: "solution",
        label: "Solution outline",
        note: "The turn. One line, no detail yet",
        detail: "What to change, in a single sentence. This is the slide people screenshot.",
        placeholder: "What to change.",
        examples: ["Cut on motion, not on beat.", "Stop designing. Start with what you wrote."],
      },
      {
        id: "point",
        label: "Fix",
        note: "One fix per slide. Verb first",
        detail: "Lead with the instruction, then the reason. If it needs an “and also”, it's two slides.",
        placeholder: "Fix #1",
        examples: [
          "Cut on movement, a hand raise, a head turn, a step.",
          "Kill every shot that's only there because you filmed it.",
        ],
        repeatable: true,
      },
      {
        id: "point",
        label: "Fix",
        note: "Same shape as the one before",
        detail: "A deck reads as considered when its middle slides rhyme.",
        placeholder: "Fix #2",
        examples: ["Hold the first frame 200ms longer than feels right."],
        repeatable: true,
      },
      {
        id: "point",
        label: "Fix",
        note: "Three is the sweet spot",
        detail: "A fourth is usually the first one restated. Check before you add it.",
        placeholder: "Fix #3",
        examples: ["Match your cut rate to the speaker's energy, not the music's."],
        repeatable: true,
      },
      {
        id: "cta",
        label: "Call to action",
        note: "One ask. Two gets you neither",
        detail: "Pick follow, or comment, or the link, then drop the rest.",
        placeholder: "Save this for your next edit.",
        examples: [
          "Save this for your next edit.",
          "Follow for one of these every week.",
          "Comment “cuts” and I'll send the breakdown.",
        ],
      },
    ],
  },
  {
    id: "showcase",
    name: "Showcase / Portfolio",
    shape: "Work → Process → Result",
    description: "Show the work and the thinking behind it. This is the one that books clients.",
    slots: [
      {
        id: "hook",
        label: "Hook",
        note: "Lead with the result, not the client",
        detail:
          "Nobody is looking for your project. They are looking for what you could do to theirs, so open on the transformation.",
        placeholder: "Here's how I turned this raw footage into a premium ad.",
        examples: [
          "Here's how I turned this raw footage into a premium ad.",
          "Same footage. Two edits. One of them sells.",
          "This took 40 minutes and it's the best thing I've shipped.",
        ],
      },
      {
        id: "context",
        label: "Context",
        note: "One sentence a stranger would get",
        detail: "What the project was. No category words, no “deliverable”.",
        placeholder: "What the project was.",
        examples: [
          "A 30-second spot for a coffee brand, shot in one afternoon.",
          "Six hours of raw interview, one 60-second cut.",
        ],
      },
      {
        id: "goal",
        label: "The goal",
        note: "Their brief, in their words",
        detail: "Stating the brief proves you were solving a problem, not just editing.",
        placeholder: "What the client wanted.",
        examples: [
          "They wanted it to feel expensive without looking like an ad.",
          "“Make it feel like the product is already in your kitchen.”",
        ],
      },
      {
        id: "process",
        label: "The process",
        note: "Show where it started",
        detail: "The raw footage, the first assembly, the state it was in when you got it.",
        placeholder: "The raw footage.",
        examples: [
          "Flat, handheld, badly lit in the back half.",
          "First assembly ran 2:10. The brief was 30 seconds.",
        ],
      },
      {
        id: "point",
        label: "Key decision",
        note: "Explain the why. That's the expertise",
        detail:
          "Don't just show the final product. The decision is what demonstrates expertise; the result alone only demonstrates taste.",
        placeholder: "A decision you made, and why.",
        examples: [
          "Dropped the intro, the product shot was the stronger open.",
          "Warmed the grade 200K so the kitchen reads as morning.",
        ],
        repeatable: true,
      },
      {
        id: "point",
        label: "Key decision",
        note: "Pick the surprising choice",
        detail: "Colour, sound, motion, pacing. Pick the one a client would not have thought of.",
        placeholder: "Another decision, and why.",
        examples: [
          "Cut the music under the VO so the last line lands dry.",
          "Held the final frame 800ms. The only still moment in the spot.",
        ],
        repeatable: true,
      },
      {
        id: "result",
        block: RESULT_AS_STAT,
        label: "Final result",
        note: "A number beats three adjectives",
        detail: "A figure, a before/after, or the client's own words.",
        placeholder: "How it landed.",
        examples: [
          "Ran six weeks and beat their best by 3x on watch time.",
          "Client's words: “the first one that felt like us.”",
        ],
      },
      {
        id: "cta",
        label: "Call to action",
        note: "A keyword beats a link",
        detail: "One ask, and make it easy to say.",
        placeholder: "DM me 'EDIT' if you want this style.",
        examples: [
          "DM me “EDIT” if you want this style.",
          "Booking two projects for next month, DM to check dates.",
        ],
      },
    ],
  },
  {
    id: "educational",
    name: "Educational / Value",
    shape: "Concept → Explanation → Application",
    description: "Teach one thing properly. Builds the authority the others cash in.",
    slots: [
      {
        id: "hook",
        label: "Hook",
        note: "Numbers beat vague. “3 tricks” wins",
        detail: "Promise something specific, and name who it's for.",
        placeholder: "3 editing tricks that instantly make talking-head videos better.",
        examples: [
          "3 editing tricks that instantly make talking-head videos better.",
          "The 4 rules that doubled the reach of everything I post.",
          "How to cut a 6-hour interview down to 60 seconds.",
        ],
      },
      {
        id: "promise",
        label: "The promise",
        note: "What they'll know by the end",
        detail: "Earn the next six slides in one line.",
        placeholder: "What they'll learn.",
        examples: [
          "By the end you'll never cut a talking head the same way.",
          "Three techniques, all free, all 10 seconds each.",
        ],
      },
      {
        id: "concept",
        label: "The concept",
        note: "The principle underneath",
        detail: "Answer one specific question. Don't turn this into a Wikipedia page.",
        placeholder: "The underlying principle.",
        examples: [
          "Attention resets every time the frame changes.",
          "The eye follows motion before it reads a face.",
        ],
      },
      {
        id: "breakdown",
        label: "Breakdown",
        note: "Start with the verb",
        detail: "If they can act on it after reading only this slide, it's a good breakdown.",
        placeholder: "Technique #1",
        examples: [
          "Punch in 15% on the second sentence of every answer.",
          "Cut the breath, not the pause, the pause is the performance.",
        ],
      },
      {
        id: "point",
        label: "Example",
        note: "Show it working on something real",
        detail: "An example is what turns a rule into a skill.",
        placeholder: "Technique #2",
        examples: [
          "Watch any A24 trailer: every cut lands on a movement.",
          "Same interview, two cuts, one keeps the breath, one doesn't.",
        ],
        repeatable: true,
      },
      {
        id: "point",
        label: "Example",
        note: "Three total. A fourth repeats",
        detail: "Past three, you're restating the first one.",
        placeholder: "Technique #3",
        examples: ["Mute the music on your last export and see if it still works."],
        repeatable: true,
      },
      {
        id: "takeaway",
        label: "Key takeaway",
        note: "The line that gets quoted",
        detail: "Compress it into something they could repeat to someone else.",
        placeholder: "The rule to remember.",
        examples: ["Cut on motion, not on beat.", "Every cut spends attention. Spend it on purpose."],
      },
      {
        id: "cta",
        label: "Call to action",
        note: "“Save” beats “follow” here",
        detail: "Educational posts get saved. Ask for the save.",
        placeholder: "Save this for your next edit.",
        examples: ["Save this for your next edit.", "Follow for one of these every week."],
      },
    ],
  },
  {
    id: "story",
    name: "Story / Case Study",
    shape: "Situation → Conflict → Transformation",
    description: "Take them through what happened. The most shared of the four.",
    slots: [
      {
        id: "hook",
        label: "Hook",
        note: "Open mid-scene. No setup",
        detail:
          "Start at the strangest or worst moment, and hint at the change. No “so I was thinking”.",
        placeholder: "This client was getting 2K views per video. Then we changed one thing.",
        examples: [
          "This client was getting 2K views per video. Then we changed one thing.",
          "Three weeks in, I deleted all of it and started again.",
          "The feature everyone asked for was the one nobody used.",
        ],
      },
      {
        id: "situation",
        label: "The situation",
        note: "Just enough for the turn to land",
        detail: "Where things stood at the start. Resist the full backstory.",
        placeholder: "The starting situation.",
        examples: [
          "Posting four times a week, decent footage, flat numbers.",
          "They'd hired two editors before me. Both did what was asked.",
        ],
      },
      {
        id: "problem",
        label: "The problem",
        note: "Be specific about the symptom",
        detail: "Vague problems make the fix look lucky.",
        placeholder: "What wasn't working.",
        examples: [
          "Watch time collapsed at 4 seconds. Every single video.",
          "The edits were clean and completely forgettable.",
        ],
      },
      {
        id: "point",
        label: "What they'd tried",
        note: "Failed attempts make the fix credible",
        detail: "Skip this and the solution reads as a lucky guess.",
        placeholder: "What they had already tried.",
        examples: [
          "Faster cuts. Louder music. Trending audio. Nothing moved it.",
          "We tried three hooks. The problem was never the hook.",
        ],
        repeatable: true,
      },
      {
        id: "turn",
        label: "The turning point",
        note: "The sharpest sentence you have",
        detail: "The realisation. This is the slide the whole post exists for.",
        placeholder: "The realisation.",
        examples: [
          "The first frame was a wide shot. Nobody knew what they were looking at.",
          "The problem was never the surface. It was the model underneath.",
        ],
      },
      {
        id: "solution",
        label: "What you changed",
        note: "One change, precisely stated",
        detail: "So precise that someone could copy it.",
        placeholder: "What you changed.",
        examples: [
          "Opened on a close-up, mid-motion, no establishing shot.",
          "Moved the payoff from 0:22 to 0:03.",
        ],
      },
      {
        id: "result",
        block: RESULT_AS_STAT,
        label: "The result",
        note: "Let the numbers persuade",
        detail: "Specific beats triumphant.",
        placeholder: "What happened after.",
        examples: ["2K to 61K on the next video.", "Watch time went from 4 seconds to 19."],
      },
      {
        id: "lesson",
        label: "The lesson",
        note: "This is what makes it a case study",
        detail: "The transferable principle. Without it, this is only a brag.",
        placeholder: "Why it worked.",
        examples: [
          "The first frame is the hook. Everything else is the second chance.",
          "You can't pace your way out of a bad opening.",
        ],
      },
      {
        id: "cta",
        label: "Call to action",
        note: "“More breakdowns” beats a pitch",
        detail: "After a case study, the soft ask converts better.",
        placeholder: "Follow for more breakdowns.",
        examples: ["Follow for more breakdowns.", "DM me “AUDIT” and I'll look at your first frame."],
      },
    ],
  },
];

/* ── the four, with ranges and rhythms (25.1) ─────────────────────────────── */

const at = (st: Structure, ...i: number[]): Slot[] => i.map((k) => st.slots[k]!);

/**
 * The first rhythm of each is exactly its running order since the start, so
 * nothing drafted before Batch 25 changes. Each gets a second order.
 */
function withRhythms(st: Structure): Structure {
  // Every result slot reports a result: the honesty rule applies to all of them.
  const slots = st.slots.map((s) => (s.block === RESULT_AS_STAT ? { ...s, honest: true } : s));
  const x: Structure = { ...st, slots };
  switch (st.id) {
    case "problem":
      return {
        ...x,
        family: "Teach",
        range: [6, 12],
        rhythms: [
          { id: "named", label: "Name it, then fix it", note: "The cause before the fixes", open: at(x, 0, 1, 2, 3), unit: at(x, 4), close: at(x, 7) },
          { id: "fast", label: "Straight to the fixes", note: "Fixes first, the one-line turn as the recap", open: at(x, 0, 1), unit: at(x, 4), close: at(x, 3, 7) },
        ],
      };
    case "showcase":
      return {
        ...x,
        family: "Prove",
        range: [6, 9],
        rhythms: [
          { id: "in-order", label: "In the order it happened", note: "Context, process, result", open: at(x, 0, 1, 2, 3), unit: at(x, 4), close: at(x, 6, 7) },
          { id: "result-first", label: "Result first", note: "The outcome on slide 2, then how", open: at(x, 0, 6, 1, 3), unit: at(x, 4), close: at(x, 7) },
        ],
      };
    case "educational":
      return {
        ...x,
        family: "Teach",
        range: [5, 10],
        rhythms: [
          { id: "build-up", label: "Build up to it", note: "The promise and the concept first", open: at(x, 0, 1, 2, 3), unit: at(x, 4), close: at(x, 6, 7) },
          { id: "straight-in", label: "Straight in", note: "One line of concept, then the points", open: at(x, 0, 2), unit: at(x, 4), close: at(x, 6, 7) },
        ],
      };
    case "story":
      return {
        ...x,
        family: "Prove",
        range: [5, 10],
        rhythms: [
          { id: "in-order", label: "In order", note: "Situation, conflict, turn, result", open: at(x, 0, 1, 2), unit: at(x, 3), close: at(x, 4, 5, 6, 7, 8) },
          { id: "from-the-end", label: "From the end", note: "Open on where it landed, then go back", open: at(x, 0, 6, 1, 2), unit: at(x, 3), close: at(x, 4, 5, 7, 8) },
        ],
      };
    default:
      return x;
  }
}

export const STRUCTURES: Structure[] = [...CORE.map(withRhythms), ...MORE_STRUCTURES()];

/** The four the product started with: the ones the worked examples cover. */
export const CORE_IDS = ["problem", "showcase", "educational", "story"] as const;

export const structureById = (id: string | undefined): Structure | undefined => STRUCTURES.find((s) => s.id === id);

export const DEFAULT_STRUCTURE = STRUCTURES[0]!;

/** Numbered label when a structure repeats a slot, "Fix 1", "Fix 2". */
export function labelFor(slots: Slot[], index: number): string {
  const slot = slots[index];
  if (!slot) return "Slide";
  if (!slot.repeatable) return slot.label;
  const ordinal = slots.slice(0, index + 1).filter((s) => s.id === slot.id).length;
  return `${slot.label} ${ordinal}`;
}

/** A new repeatable slot goes after the last one, before the closing slots. */
export function insertionIndex(slots: Slot[]): number {
  const last = slots.map((s) => s.repeatable === true).lastIndexOf(true);
  return last === -1 ? Math.max(0, slots.length - 1) : last + 1;
}

export const repeatableOf = (structure: Structure): Slot | undefined =>
  structure.slots.find((s) => s.repeatable);

/**
 * What "add slide" adds: the repeating unit of these slots. One slot for most
 * frameworks; a whole pair for one built in pairs (a myth and its fact), so a
 * deck never gains half of one.
 */
export function unitOf(slots: readonly Slot[]): Slot[] {
  const out: Slot[] = [];
  for (const s of slots) if (s.repeatable && !out.some((o) => o.id === s.id)) out.push(s);
  return out;
}

/* ── asking for a different number of slides ──────────────────────────────── */

/**
 * The most slides a draft may ask for.
 *
 * Mirrors `MAX_SLIDES` in `compositions.ts` rather than importing it, because
 * that module imports the renderer and this one imports nothing, which is what
 * keeps `structures.ts` usable from the server. If the two ever disagree the
 * generator wins and the extra slides are simply not built, so the failure is
 * visible rather than silent.
 */
export const MAX_DRAFT_SLIDES = 35;

/**
 * The fewest slides a carousel can be.
 *
 * An opening, something in the middle, and a close.
 *
 * **This was every fixed slot plus one, which was wrong.** Problem-to-solution
 * has five fixed slots, so asking for four gave six, and the number somebody
 * typed was quietly overruled by a rule about the framework. A framework is a
 * suggested running order, not a minimum word count: somebody who wants four
 * slides wants four slides, and the right answer is to drop the least essential
 * jobs rather than to refuse.
 */
export const MIN_DRAFT_SLIDES = 3;

export const floorFor = (structure: Structure): number => {
  // A framework built in pairs (a myth and its fact) cannot be shorter than an
  // opening, one whole pair and a close.
  const r = structure.rhythms?.[0];
  if (r && r.unit.length > 1) return r.open.length + r.unit.length + r.close.length;
  return Math.min(MIN_DRAFT_SLIDES, structure.slots.length);
};

/** How far the count steps: one slide, or one whole pair. */
export const stepFor = (structure: Structure, rhythmId?: string): number =>
  (rhythmId ? structure.rhythms?.find((r) => r.id === rhythmId) : structure.rhythms?.[0])?.unit.length ?? 1;

/**
 * The framework's slots, stretched or trimmed to exactly `count`.
 *
 * **Why this exists:** the slot list WAS the slide count, so a brief saying
 * "give me 16" got a prompt listing eight slots and returned eight slides. The
 * count has to be decided before the call, in the list the model is given,
 * because a model asked for eight and told sixteen will do one of them and the
 * other will look like it was ignored.
 *
 * Only the repeatable slot grows and shrinks. `insertionIndex` already decides
 * where a new one belongs, so a longer deck gains middle slides and keeps its
 * opening and its close, which is the whole point of having chosen a framework.
 *
 * **One pass, deliberately.** The alternative is generating the framework's
 * natural length and then asking for more, which costs a second call and
 * produces slides written without knowing about each other.
 */
export function slotsFor(structure: Structure, count: number, rhythmId?: string): Slot[] {
  const chosen = rhythmId ? structure.rhythms?.find((r) => r.id === rhythmId) : undefined;
  // Already exactly this long (a structure resized before a draft, coming back
  // to Compose): it is the answer, whatever rhythm made it.
  if (!chosen && Math.round(count) === structure.slots.length) return [...structure.slots];
  const rhythm = chosen ?? structure.rhythms?.[0];
  if (rhythm && rhythm.unit.length > 1) return unitsFor(rhythm, count);
  const base = chosen ? build(chosen, 1) : structure.slots;
  return stretch(base, count);
}

/** A rhythm with `k` units. */
export function build(r: Rhythm, k: number): Slot[] {
  return [...r.open, ...Array.from({ length: k }, () => r.unit).flat(), ...r.close];
}

/** The repeatable slots of a unit, marked so "add slide" and labels know them. */
const repeating = (slots: Slot[]): Slot[] => slots.map((s) => (s.repeatable ? s : { ...s, repeatable: true }));

/**
 * A rhythm whose unit is two slots (a myth and its fact): the count steps by
 * the unit, so a deck never ends on half a pair. The nearest count it can
 * make; below one unit, the middle fixed slots go as `stretch` drops them.
 */
function unitsFor(r: Rhythm, count: number): Slot[] {
  const want = Math.max(MIN_DRAFT_SLIDES, Math.min(MAX_DRAFT_SLIDES, Math.round(count)));
  const fixed = r.open.length + r.close.length;
  const most = Math.max(1, Math.floor((MAX_DRAFT_SLIDES - fixed) / r.unit.length));
  const k = Math.max(1, Math.min(most, Math.round((want - fixed) / r.unit.length)));
  const out = [...r.open, ...Array.from({ length: k }, () => repeating(r.unit)).flat(), ...r.close];
  if (out.length <= want) return out;
  return dropFixed(out, out.length - want);
}

/** Drops fixed middle slots from the end, never the first or the last. */
function dropFixed(slots: Slot[], n: number): Slot[] {
  const out = [...slots];
  let drop = n;
  for (let i = out.length - 2; i >= 1 && drop > 0; i -= 1) {
    if (!out[i]?.repeatable) {
      out.splice(i, 1);
      drop -= 1;
    }
  }
  return out;
}

function stretch(base: Slot[], count: number): Slot[] {
  const rep = base.find((s) => s.repeatable);

  // Nothing repeats, so there is nothing to stretch. A framework like this has
  // a fixed shape and the honest answer is to keep it.
  if (!rep) return [...base];

  const want = Math.max(Math.min(MIN_DRAFT_SLIDES, base.length), Math.min(MAX_DRAFT_SLIDES, Math.round(count)));
  if (want === base.length) return [...base];

  if (want > base.length) {
    const at = insertionIndex(base);
    const extra = Array.from({ length: want - base.length }, () => rep);
    return [...base.slice(0, at), ...extra, ...base.slice(at)];
  }

  /*
   * Trimmed in order of what can best be spared.
   *
   * Repeatable slots first, from the end of their run, so what survives is the
   * start of the argument rather than an arbitrary middle of it. Only once
   * those are gone does it take fixed middle slots, again from the end, which
   * is where the elaboration tends to live.
   *
   * The FIRST and LAST slots are never touched at any length. They are the hook
   * and the ask, the two slides every carousel needs, and a deck missing either
   * is not a short carousel but a broken one.
   */
  const out = [...base];
  let drop = base.length - want;

  const trim = (pick: (slot: Slot) => boolean) => {
    for (let i = out.length - 2; i >= 1 && drop > 0; i -= 1) {
      const slot = out[i];
      if (slot && pick(slot)) {
        out.splice(i, 1);
        drop -= 1;
      }
    }
  };

  trim((slot) => slot.repeatable === true);
  trim(() => true);

  return out;
}

/* ── a shape per brief (25.1, the sameness constraint) ────────────────────── */

/**
 * The rhythm and the slide count a brief gets when nobody chose them: picked
 * from the brief's own words, inside the framework's range. The same brief
 * twice gets the same shape; twenty different briefs get several.
 */
export function shapeFor(structure: Structure, brief: string): { rhythm: string | undefined; count: number } {
  let h = 0;
  for (let i = 0; i < brief.length; i += 1) h = (h * 31 + brief.charCodeAt(i)) | 0;
  h = Math.abs(h);
  const rhythms = structure.rhythms ?? [];
  const rhythm = rhythms[h % Math.max(1, rhythms.length)];
  const [lo, hi] = structure.range ?? [structure.slots.length, structure.slots.length];
  const span = hi - lo + 1;
  const count = lo + (Math.floor(h / 7) % Math.max(1, span));
  return { rhythm: rhythm?.id, count: rhythm ? unitsOrStretch(structure, count, rhythm.id).length : count };
}

const unitsOrStretch = (structure: Structure, count: number, rhythm: string): Slot[] => slotsFor(structure, count, rhythm);

/* ── the twelve added in Batch 25 ─────────────────────────────────────────── */

/**
 * Myth versus fact, before and after, comparison, named model, checklist, FAQ,
 * tool stack, hot take, lessons learned, data breakdown, quote set, question.
 * With the four above they make the roadmap's sixteen: problem to fix is its
 * "mistakes and fixes", the showcase its "case study", the educational its
 * "step by step", and the story its "story".
 *
 * A function rather than a constant so the module's order does not matter: it
 * runs when `STRUCTURES` is built, and everything it uses is declared inside it.
 */
function MORE_STRUCTURES(): Structure[] {
  const slot = (
    id: string,
    label: string,
    note: string,
    placeholder: string,
    examples: string[],
    extra: Partial<Slot> = {},
  ): Slot => ({ id, label, note, detail: extra.detail ?? note, placeholder, examples, ...extra });
  const rep = (s: Slot): Slot => ({ ...s, repeatable: true });

  const cta = (placeholder: string, examples: string[], note = "One ask, the one this post earned"): Slot =>
    slot("cta", "Call to action", note, placeholder, examples, {
      detail: "Ask for the thing this post earned: a save for a reference, a comment for an opinion, a follow for a series.",
    });

  const framework = (
    base: Omit<Structure, "slots" | "rhythms"> & { rhythms: Rhythm[] },
    natural: number,
  ): Structure => {
    const first = base.rhythms[0]!;
    const k = Math.max(1, Math.round((natural - first.open.length - first.close.length) / first.unit.length));
    return { ...base, slots: build(first, k).map((s) => (first.unit.includes(s) ? { ...s, repeatable: true } : s)) };
  };

  /* Myth versus fact */
  const myth = rep(slot("myth", "Myth", "What everybody believes, stated fairly", "More posts means more reach.", [
    "More posts means more reach.",
    "You need a ring light to look professional.",
  ], { detail: "Say the belief the way somebody who holds it would. A strawman makes the fact cheap." }));
  const fact = rep(slot("fact", "Fact", "What is actually true, and how you know", "Reach follows the posts people finish, not the number you publish.", [
    "Reach follows the posts people finish, not the number you publish.",
    "Window light at eye level beats any ring light you can buy.",
  ], { detail: "Lead with the correction, then the reason. No figure the brief does not give." }));
  const mythFact = rep(slot("myth-fact", "Myth and fact", "The myth and the fact, side by side", "More posts, more reach | Finished posts, more reach", [
    "More posts, more reach | Finished posts, more reach",
  ], {
    block: {
      id: "compare",
      label: "two columns",
      fields: [{ key: "rows", note: "one or two rows, each a myth and its fact separated by a | character, under ten words each side" }],
      fixed: { preset: "Myth / Fact" },
    },
  }));
  const mythHook = slot("hook", "Hook", "Name how many myths, and about what", "5 myths about growing on LinkedIn that cost you reach.", [
    "5 myths about growing on LinkedIn that cost you reach.",
    "Everything you were told about lighting is wrong. Mostly.",
  ]);
  const realRule = slot("rule", "The real rule", "What to do instead, in one line", "Post less. Finish more.", ["Post less. Finish more."]);
  const MYTH = framework({
    id: "myth",
    name: "Myth versus fact",
    shape: "Myth → Fact",
    description: "Correct what your audience believes, one myth at a time. Strong on a cold audience.",
    family: "Teach",
    range: [5, 10],
    rhythms: [
      { id: "pairs", label: "Myth, then fact", note: "Each on its own slide", open: [mythHook], unit: [myth, fact], close: [cta("Follow for the next myth.", ["Follow for the next myth.", "Which one did you believe? Comment below."])] },
      { id: "side-by-side", label: "Side by side", note: "Myth and fact on one slide", open: [mythHook], unit: [mythFact], close: [realRule, cta("Save this before the next argument.", ["Save this before the next argument."])] },
      { id: "with-rule", label: "Pairs, then the real rule", note: "Ends on what to do instead", open: [mythHook], unit: [myth, fact], close: [realRule, cta("Follow for more.", ["Follow for more."])] },
    ],
  }, 8);

  /* Before and after */
  const before = slot("before", "Before", "Where it started, in concrete detail", "Every edit took me four hours and still looked flat.", [
    "Every edit took me four hours and still looked flat.",
    "Our onboarding lost half of new users on day one.",
  ]);
  const turn = slot("turn", "Turning point", "The one thing that changed", "Then I stopped cutting on the beat.", [
    "Then I stopped cutting on the beat.",
    "We cut onboarding to one screen.",
  ]);
  const after = slot("after", "After", "Where it is now. Only what the brief says", "Now an edit takes an hour, and people watch to the end.", [
    "Now an edit takes an hour, and people watch to the end.",
  ], { honest: true, detail: "The result. If the brief gives no result, do not invent one." });
  const how = rep(slot("how", "How", "One step of how, verb first", "Cut on the movement, not the music.", [
    "Cut on the movement, not the music.",
    "Remove every field that is not needed today.",
  ]));
  const split = slot("split", "Before and after", "Both states, side by side", "Four hours | One hour", ["Four hours | One hour"], {
    block: {
      id: "before-after",
      label: "before and after",
      fields: [
        { key: "leftText", note: "the before state, under eight words" },
        { key: "rightText", note: "the after state, under eight words, only as the brief gives it" },
      ],
      fixed: { mode: "words", left: "Before", right: "After" },
    },
    honest: true,
  });
  const BEFORE_AFTER = framework({
    id: "before-after",
    name: "Before and after",
    shape: "Before → Turn → After",
    description: "A transformation, then how. The proof is the contrast.",
    family: "Prove",
    range: [5, 7],
    rhythms: [
      { id: "in-order", label: "In order", note: "Before, the turn, after, then how", open: [{ ...before, id: "hook", label: "Hook: the before" }, turn, after], unit: [how], close: [cta("Follow for the rest of the process.", ["Follow for the rest of the process."])] },
      { id: "after-first", label: "After first", note: "Open on the result, then go back", open: [{ ...after, id: "hook", label: "Hook: the after" }, before, turn], unit: [how], close: [cta("Save this for your next edit.", ["Save this for your next edit."])] },
      { id: "side-by-side", label: "Side by side", note: "Both states on slide 1", open: [{ ...split, id: "hook", label: "Hook: before and after" }, turn], unit: [how], close: [cta("Want the full breakdown? Follow.", ["Want the full breakdown? Follow."])] },
    ],
  }, 6);

  /* Comparison */
  const cmpHook = slot("hook", "Hook", "Name the two things and the stakes", "Notion or Obsidian? It depends on one thing.", [
    "Notion or Obsidian? It depends on one thing.",
    "Reels or carousels for B2B? I compared them on what matters.",
  ]);
  const criterion = rep(slot("criterion", "Criterion", "One thing to judge them on, and who wins it", "Speed: Obsidian opens instantly. Notion makes you wait.", [
    "Speed: Obsidian opens instantly. Notion makes you wait.",
    "Sharing: Notion wins, nobody else needs an account.",
  ]));
  const verdict = slot("verdict", "Verdict", "Who should pick which, not which is best", "Writing alone? Obsidian. Working with a team? Notion.", [
    "Writing alone? Obsidian. Working with a team? Notion.",
  ]);
  const summary = slot("summary", "Summary table", "Every criterion at a glance", "Criterion | A | B", ["Criterion | A | B"], {
    block: {
      id: "table",
      label: "table",
      fields: [{ key: "rows", note: "a header line naming the two options, then one line per criterion, cells separated by |, a word or two per cell" }],
    },
  });
  const contenders = slot("contenders", "The two", "What each one is, in a line", "Notion | Obsidian", ["Notion | Obsidian"], {
    block: {
      id: "compare",
      label: "two columns",
      fields: [
        { key: "left", note: "the first option's name" },
        { key: "right", note: "the second option's name" },
        { key: "rows", note: "two or three rows, each what the left one is | what the right one is, under eight words each side" },
      ],
      fixed: { preset: "Custom" },
    },
  });
  const cmpCta = cta("Which one do you use? Tell me why.", ["Which one do you use? Tell me why."]);
  const COMPARISON = framework({
    id: "comparison",
    name: "Comparison",
    shape: "Criteria → Verdict",
    description: "Two options judged on what matters, ending on who should pick which.",
    family: "Persuade",
    range: [5, 9],
    rhythms: [
      { id: "criteria", label: "Criterion by criterion", note: "One per slide, then the verdict", open: [cmpHook], unit: [criterion], close: [verdict, cmpCta] },
      { id: "table-recap", label: "With a summary table", note: "The criteria, then all of them at a glance", open: [cmpHook], unit: [criterion], close: [summary, verdict, cmpCta] },
      { id: "head-to-head", label: "Head to head", note: "Introduce both side by side first", open: [cmpHook, contenders], unit: [criterion], close: [verdict, cmpCta] },
    ],
  }, 6);

  /* Named model */
  const modelName = slot("hook", "The model's name", "Name it, and what it is for", "The 3C rule for hooks that stop the scroll.", [
    "The 3C rule for hooks that stop the scroll.",
    "The PACE method for editing faster.",
  ]);
  const overview = slot("overview", "The parts at a glance", "Every part, one or two words each", "zap | Clear\ncheck | Concrete\nstar | Curious", ["zap | Clear\ncheck | Concrete\nstar | Curious"], {
    block: {
      id: "icon-grid",
      label: "icon grid",
      fields: [{ key: "items", note: "one line per part, each an icon name from: zap, check, star, diamond, circle, square, triangle, info, then a | and the part's name in one or two words" }],
    },
  });
  const part = rep(slot("part", "Part", "One part: its name, then what it means", "Clear: one idea a reader gets in a second.", [
    "Clear: one idea a reader gets in a second.",
    "Concrete: a number, a name, a thing you can picture.",
  ]));
  const apply = slot("apply", "How to apply it", "Put it to work on one real example", "Run your last hook through all three. Which one does it miss?", [
    "Run your last hook through all three. Which one does it miss?",
  ]);
  const NAMED_MODEL = framework({
    id: "named-model",
    name: "Named model",
    shape: "Name → Parts → Apply",
    description: "Package what you know as a model people can remember and repeat.",
    family: "Teach",
    range: [5, 9],
    rhythms: [
      { id: "overview-first", label: "Overview first", note: "All the parts, then each", open: [modelName, overview], unit: [part], close: [apply, cta("Save it for your next post.", ["Save it for your next post."])] },
      { id: "parts-first", label: "Parts first", note: "Each part, then all of them as a recap", open: [modelName], unit: [part], close: [{ ...overview, label: "Recap" }, apply, cta("Follow for the next model.", ["Follow for the next model."])] },
    ],
  }, 7);

  /* Checklist */
  const listHook = slot("hook", "Hook", "Say what the list checks, and when to use it", "Before you post: the 8-point carousel check.", [
    "Before you post: the 8-point carousel check.",
    "Run this before every client call.",
  ]);
  const list = rep(slot("list", "Checklist", "The items, short and checkable", "Hook under 10 words\nOne idea per slide\nType you can read on a phone", [
    "Hook under 10 words\nOne idea per slide\nType you can read on a phone",
  ], {
    block: {
      id: "checklist",
      label: "checklist",
      fields: [{ key: "items", note: "three to six items, one per line, each something a reader can tick off, under eight words" }],
      fixed: { numbered: "no" },
    },
  }));
  const why = slot("why", "Why this list", "What skipping it costs", "Most carousels fail on something on this list.", [
    "Most carousels fail on something on this list.",
  ]);
  const CHECKLIST = framework({
    id: "checklist",
    name: "Checklist",
    shape: "Hook → List → Save",
    description: "A list people keep. Short, and built to be saved.",
    family: "Teach",
    range: [3, 5],
    rhythms: [
      { id: "list", label: "Straight to the list", note: "The hook, the list, save it", open: [listHook], unit: [list], close: [cta("Save this for your next post.", ["Save this for your next post."], "Ask for the save")] },
      { id: "why-first", label: "Why first", note: "What skipping it costs, then the list", open: [listHook, why], unit: [list], close: [cta("Save it. Use it before every post.", ["Save it. Use it before every post."], "Ask for the save")] },
    ],
  }, 4);

  /* FAQ */
  const faqHook = slot("hook", "Hook", "Whose questions, about what", "The 6 questions every new client asks me.", [
    "The 6 questions every new client asks me.",
    "You asked about pricing. Here are the answers.",
  ]);
  const qa = rep(slot("qa", "Question and answer", "Their question, then a straight answer", "How long does it take? Two weeks, start to finish.", [
    "How long does it take? Two weeks, start to finish.",
  ]));
  const question = rep(slot("question", "Question", "The question, in their words", "Do I need to be on camera?", ["Do I need to be on camera?"]));
  const answer = rep(slot("answer", "Answer", "The straight answer, then the reason", "No. Half my best posts never show a face.", [
    "No. Half my best posts never show a face.",
  ]));
  const FAQ = framework({
    id: "faq",
    name: "FAQ",
    shape: "Questions → Answers",
    description: "Answer what people already ask you, in public, once.",
    family: "Engage",
    range: [5, 10],
    rhythms: [
      { id: "one-per-slide", label: "One per slide", note: "Question and answer together", open: [faqHook], unit: [qa], close: [cta("Ask me anything else in the comments.", ["Ask me anything else in the comments."])] },
      { id: "ask-then-answer", label: "Ask, then answer", note: "The question on one slide, the answer on the next", open: [faqHook], unit: [question, answer], close: [cta("What did I miss? Comment below.", ["What did I miss? Comment below."])] },
    ],
  }, 6);

  /* Tool stack */
  const toolHook = slot("hook", "Hook", "Whose stack, for what job", "Every tool I use to make a carousel a day.", [
    "Every tool I use to make a carousel a day.",
    "My whole editing stack costs less than a lunch.",
  ]);
  const tool = rep(slot("tool", "Tool", "Its name, and the one job it does for you", "Descript: I edit the video by editing the transcript.", [
    "Descript: I edit the video by editing the transcript.",
  ]));
  const screen = rep(slot("screen", "Screenshot", "Where the tool's screenshot goes", "A screenshot of it in use.", ["A screenshot of it in use."], {
    block: { id: "screen-frame", label: "screen frame", fields: [], fixed: { style: "browser" } },
  }));
  const stack = slot("stack", "The stack", "Every tool, in the order you use them", "Script, record, edit, caption, post.", ["Script, record, edit, caption, post."]);
  const TOOL_STACK = framework({
    id: "tool-stack",
    name: "Tool stack",
    shape: "Tools → What each is for",
    description: "The tools behind your work, and the one job each one does.",
    family: "Teach",
    range: [5, 10],
    rhythms: [
      { id: "one-per-slide", label: "One per slide", note: "A tool and its job", open: [toolHook], unit: [tool], close: [cta("Which tool should I cover next?", ["Which tool should I cover next?"])] },
      { id: "with-screens", label: "With screenshots", note: "Each tool, then it in use", open: [toolHook], unit: [tool, screen], close: [cta("Save this stack.", ["Save this stack."])] },
      { id: "stack-recap", label: "With a recap", note: "Each tool, then the whole stack in order", open: [toolHook], unit: [tool], close: [stack, cta("Follow for the workflow behind it.", ["Follow for the workflow behind it."])] },
    ],
  }, 6);

  /* Hot take */
  const claim = slot("hook", "The claim", "Say it plainly. No hedging on slide 1", "Posting every day is killing your reach.", [
    "Posting every day is killing your reach.",
    "Your brand colours do not matter yet.",
  ]);
  const belief = slot("belief", "The common belief", "What most people think, fairly", "Everybody says consistency is everything.", ["Everybody says consistency is everything."]);
  const evidence = rep(slot("evidence", "Evidence", "One reason, from what you have seen", "My best month had eight posts, not thirty.", [
    "My best month had eight posts, not thirty.",
  ], { detail: "Only what the brief contains. A take with invented evidence is worse than no take." }));
  const number = slot("number", "The number", "The one figure that makes the case", "8 | posts in my best month", ["8 | posts in my best month"], {
    block: RESULT_AS_STAT,
    honest: true,
  });
  const nuance = slot("nuance", "The nuance", "Where the take does not hold", "If you are just starting, post often. Then stop.", [
    "If you are just starting, post often. Then stop.",
  ]);
  const takeCta = cta("Agree or disagree? Tell me below.", ["Agree or disagree? Tell me below."], "Ask for the comment");
  const HOT_TAKE = framework({
    id: "hot-take",
    name: "Hot take",
    shape: "Claim → Belief → Evidence → Nuance",
    description: "A position worth arguing about, argued fairly. Built for comments.",
    family: "Persuade",
    range: [5, 7],
    rhythms: [
      { id: "argued", label: "Argued", note: "The belief, the evidence, the nuance", open: [claim, belief], unit: [evidence], close: [nuance, takeCta] },
      { id: "number-led", label: "Number first", note: "The figure right after the claim", open: [claim, number, belief], unit: [evidence], close: [nuance, takeCta] },
    ],
  }, 6);

  /* Lessons learned */
  const lessonHook = slot("hook", "Hook", "How many lessons, from what", "7 lessons from my first year freelancing.", [
    "7 lessons from my first year freelancing.",
    "What 200 client calls taught me.",
  ]);
  const context = slot("context", "Context", "Where the lessons come from, in a line", "One year, 31 clients, a lot of mistakes.", ["One year, 31 clients, a lot of mistakes."], { honest: true });
  // Not "lesson": that role is a story's closing lesson, which always lays out
  // as a statement, and seven statements in a row is the sameness complaint.
  const lesson = rep(slot("learned", "Lesson", "One lesson, stated as advice", "Charge for the first call. Free calls attract free work.", [
    "Charge for the first call. Free calls attract free work.",
  ]));
  const example = rep(slot("example", "Example", "The moment you learned it", "The month I did six free calls, I signed nobody.", [
    "The month I did six free calls, I signed nobody.",
  ]));
  const biggest = slot("biggest", "The biggest one", "The lesson that mattered most, last", "Most of all: say no sooner.", ["Most of all: say no sooner."]);
  const LESSONS = framework({
    id: "lessons",
    name: "Lessons learned",
    shape: "Context → Lessons",
    description: "What experience taught you, one lesson a slide. Personal, and easy to save.",
    family: "Teach",
    range: [6, 12],
    rhythms: [
      { id: "lessons", label: "One lesson a slide", note: "The context, then each lesson", open: [lessonHook, context], unit: [lesson], close: [cta("Which one hit hardest?", ["Which one hit hardest?"])] },
      { id: "with-examples", label: "Lesson and example", note: "Each lesson, then when you learned it", open: [lessonHook], unit: [lesson, example], close: [cta("Follow for the next year's.", ["Follow for the next year's."])] },
      { id: "biggest-last", label: "Biggest last", note: "Builds to the one that mattered most", open: [lessonHook, context], unit: [lesson], close: [biggest, cta("Save this for later.", ["Save this for later."])] },
    ],
  }, 8);

  /* Data breakdown */
  const headline = slot("hook", "The headline number", "The figure, and why it matters", "61% of carousels are never swiped past slide 2.", [
    "61% of carousels are never swiped past slide 2.",
  ], { block: RESULT_AS_STAT, honest: true });
  const dataContext = slot("context", "Context", "Where the number comes from", "From 400 carousels we published last quarter.", ["From 400 carousels we published last quarter."], { honest: true });
  const chart = slot("chart", "The chart", "The data the number comes from", "Slide 1, 100\nSlide 2, 39\nSlide 3, 31", ["Slide 1, 100\nSlide 2, 39\nSlide 3, 31"], {
    block: {
      id: "chart",
      label: "chart",
      fields: [
        { key: "data", note: "two to eight lines, each a label, a comma, then a number, exactly as the brief gives them" },
        { key: "point", note: "the one label the reader should look at" },
        { key: "unit", note: "the unit, such as %, or empty" },
      ],
      fixed: { kind: "bar" },
    },
    honest: true,
  });
  const implication = rep(slot("implication", "What it means", "What to do about it, one point a slide", "So the hook is the whole game. Spend your time there.", [
    "So the hook is the whole game. Spend your time there.",
  ]));
  const DATA = framework({
    id: "data",
    name: "Data breakdown",
    shape: "Number → Context → Chart → Implication",
    description: "One finding, shown and explained. Only with numbers you actually have.",
    family: "Prove",
    range: [5, 7],
    rhythms: [
      { id: "number-first", label: "Number first", note: "The figure, its source, the chart", open: [headline, dataContext, chart], unit: [implication], close: [cta("Follow for the next breakdown.", ["Follow for the next breakdown."])] },
      { id: "chart-first", label: "Chart first", note: "Show the data, then name the number", open: [{ ...chart, id: "hook", label: "Hook: the chart" }, { ...headline, id: "number", label: "The number" }, dataContext], unit: [implication], close: [cta("Save this for your next planning meeting.", ["Save this for your next planning meeting."])] },
    ],
  }, 6);

  /* Quote set */
  const quoteHook = slot("hook", "Hook", "Whose words, about what", "5 things editors said that changed how I cut.", [
    "5 things editors said that changed how I cut.",
  ]);
  const quote = rep(slot("quote", "Quote", "Their words, exactly, and who said them", "Cut when the eye is ready, not the ear.", ["Cut when the eye is ready, not the ear."], {
    block: {
      id: "quote",
      label: "quote",
      fields: [
        { key: "text", note: "the words exactly as the brief quotes them, never paraphrased or invented" },
        { key: "by", note: "who said it, as the brief names them" },
      ],
    },
    honest: true,
  }));
  const quoteWhy = rep(slot("why", "Why it matters", "What the quote changes for the reader", "Which means your cut belongs on the glance, not the beat.", [
    "Which means your cut belongs on the glance, not the beat.",
  ]));
  const source = slot("source", "Source", "Where the quotes come from", "From interviews on The Cut podcast, 2024.", ["From interviews on The Cut podcast, 2024."], { honest: true });
  const QUOTES = framework({
    id: "quotes",
    name: "Quote set",
    shape: "Quotes → Source",
    description: "Other people's best lines, word for word, with credit.",
    family: "Engage",
    range: [5, 10],
    rhythms: [
      { id: "quotes", label: "Quote after quote", note: "Then where they come from", open: [quoteHook], unit: [quote], close: [source, cta("Which one is going on your wall?", ["Which one is going on your wall?"])] },
      { id: "with-why", label: "Quote and why", note: "Each quote, then what it changes", open: [quoteHook], unit: [quote, quoteWhy], close: [cta("Follow for more from the source.", ["Follow for more from the source."])] },
    ],
  }, 7);

  /* Question */
  const askHook = slot("hook", "Hook", "Ask the question, plainly", "Which kind of editor are you?", ["Which kind of editor are you?"]);
  const options = slot("options", "The options", "Every answer, a few words each", "Which one are you?\nThe beat cutter\nThe story cutter\nThe one who never cuts", [
    "Which one are you?\nThe beat cutter\nThe story cutter\nThe one who never cuts",
  ], {
    block: {
      id: "question",
      label: "question",
      fields: [
        { key: "prompt", note: "the question, under eight words" },
        { key: "options", note: "two to four answers, one per line, under five words each" },
      ],
    },
  });
  const option = rep(slot("option", "One option", "What it says about somebody who picks it", "The beat cutter: fast, tidy, a little predictable.", [
    "The beat cutter: fast, tidy, a little predictable.",
  ]));
  const reveal = slot("reveal", "The reveal", "Your own answer, and the reason", "I was a beat cutter for years. Here is what changed.", [
    "I was a beat cutter for years. Here is what changed.",
  ]);
  const askCta = cta("Tell me yours in the comments.", ["Tell me yours in the comments."], "Ask for their answer");
  const QUESTION = framework({
    id: "question",
    name: "Question",
    shape: "Ask → Options → Reveal",
    description: "A question with a few answers and yours at the end. The comments write themselves.",
    family: "Engage",
    range: [4, 6],
    rhythms: [
      { id: "poll", label: "Options explained", note: "The question, each answer, your reveal", open: [askHook, options], unit: [option], close: [reveal, askCta] },
      { id: "quick", label: "Quick", note: "The question as the cover", open: [{ ...options, id: "hook", label: "Hook: the question" }], unit: [option], close: [reveal, askCta] },
    ],
  }, 5);

  return [MYTH, BEFORE_AFTER, COMPARISON, NAMED_MODEL, CHECKLIST, FAQ, TOOL_STACK, HOT_TAKE, LESSONS, DATA, QUOTES, QUESTION];
}
