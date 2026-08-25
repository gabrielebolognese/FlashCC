/**
 * The four carousel frameworks.
 *
 * A carousel is not an arbitrary pile of slides — it is one of four shapes, and each
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
  /** Shown beside the box — guidance, not chrome. */
  note: string;
  placeholder: string;
  examples: string[];
  /** The slot "add slide" clones. */
  repeatable?: boolean;
};

export type Structure = {
  id: string;
  name: string;
  shape: string;
  description: string;
  slots: Slot[];
};

const HOOK_NOTE =
  "The most important text in the whole carousel — it alone decides whether slide 2 is ever seen.";

export const STRUCTURES: Structure[] = [
  {
    id: "problem",
    name: "Problem → Solution",
    shape: "Problem → Fix",
    description: "Name a pain, then fix it",
    slots: [
      {
        id: "hook",
        label: "Hook",
        note: `${HOOK_NOTE} Name the pain the reader already has, and promise the reason. Specific beats clever.`,
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
        note: "Make it sting before you fix it. Describe the situation in their words, not yours. One idea only.",
        placeholder: "The problem, in their words.",
        examples: [
          "Every cut lands on the beat and it still feels flat.",
          "You post it, it does fine, and nobody remembers it by Friday.",
        ],
      },
      {
        id: "why",
        label: "Why it happens",
        note: "The mistake causing it. This is where you show you understand the cause, not just the symptom — it's what separates you from everyone giving surface tips.",
        placeholder: "The mistake underneath it.",
        examples: [
          "You're cutting to the rhythm of the audio, not the attention.",
          "The problem was never the footage. It was the pacing decision before it.",
        ],
      },
      {
        id: "solution",
        label: "Solution outline",
        note: "The turn. What to change, in one line — the detail comes next. This is the slide people screenshot.",
        placeholder: "What to change.",
        examples: [
          "Cut on motion, not on beat.",
          "Stop designing. Start with what you already wrote.",
        ],
      },
      {
        id: "point",
        label: "Fix",
        note: "One fix, one slide. Lead with the instruction, then the reason. If it needs an “and also”, it's two slides.",
        placeholder: "Fix #1",
        examples: [
          "Cut on movement — a hand raise, a head turn, a step.",
          "Kill every shot that's only there because you filmed it.",
        ],
        repeatable: true,
      },
      {
        id: "point",
        label: "Fix",
        note: "Keep the same shape as the fix before it. A deck reads as considered when its middle slides rhyme.",
        placeholder: "Fix #2",
        examples: ["Hold the first frame 200ms longer than feels right."],
        repeatable: true,
      },
      {
        id: "point",
        label: "Fix",
        note: "Three is the sweet spot. A fourth is usually the first one restated — check before you add it.",
        placeholder: "Fix #3",
        examples: ["Match your cut rate to the speaker's energy, not the music's."],
        repeatable: true,
      },
      {
        id: "cta",
        label: "Call to action",
        note: "Ask for exactly one thing. Two asks get you neither.",
        placeholder: "Save this for your next edit.",
        examples: [
          "Save this for your next edit.",
          "Follow for one of these every week.",
          "Comment “cuts” and I'll send the full breakdown.",
        ],
      },
    ],
  },
  {
    id: "showcase",
    name: "Showcase / Portfolio",
    shape: "Work → Process → Result",
    description: "Show the work and the thinking",
    slots: [
      {
        id: "hook",
        label: "Hook",
        note: `${HOOK_NOTE} Lead with the transformation, not the client name. Nobody is looking for your project — they're looking for what you can do to theirs.`,
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
        note: "What the project was, plainly. A stranger should understand it in one sentence — no category words, no “deliverable”.",
        placeholder: "What the project was.",
        examples: [
          "A 30-second spot for a DTC coffee brand, shot in one afternoon.",
          "Six hours of raw interview footage, one 60-second cut.",
        ],
      },
      {
        id: "goal",
        label: "The goal",
        note: "What the client actually wanted — in their language. Stating the brief proves you were solving a problem, not just editing.",
        placeholder: "What the client wanted.",
        examples: [
          "They wanted it to feel expensive without looking like an ad.",
          "“Make it feel like the product is already in your kitchen.”",
        ],
      },
      {
        id: "process",
        label: "The process",
        note: "The before, and how you got in. Raw footage, first assembly, the state it was in when you started.",
        placeholder: "Where it started — the raw footage.",
        examples: [
          "The raw footage was flat, handheld and badly lit in the back half.",
          "First assembly ran 2:10. The brief was 30 seconds.",
        ],
      },
      {
        id: "point",
        label: "Key decision",
        note: "This is the slide that wins you clients. Don't just show the final product — explain the decision and why you made it. That's what demonstrates expertise; the result alone only demonstrates taste.",
        placeholder: "A decision you made, and why.",
        examples: [
          "Dropped the intro entirely — the product shot was the stronger open.",
          "Warmed the grade 200K to make the kitchen read as morning, not night.",
        ],
        repeatable: true,
      },
      {
        id: "point",
        label: "Key decision",
        note: "Colour, sound, motion, pacing — pick the choice a client wouldn't have thought of. The surprising decision beats the one you spent longest on.",
        placeholder: "Another decision, and why.",
        examples: [
          "Cut the music under the VO so the last line lands dry.",
          "Held the final frame 800ms. It's the only still moment in the spot.",
        ],
        repeatable: true,
      },
      {
        id: "result",
        label: "Final result",
        note: "The payoff. A number, a before/after, or the client's own words — one concrete thing beats three adjectives.",
        placeholder: "How it landed.",
        examples: [
          "Ran for six weeks and beat their previous best by 3x on watch time.",
          "Client's words: “this is the first one that felt like us.”",
        ],
      },
      {
        id: "cta",
        label: "Call to action",
        note: "One ask, and make it easy to say. A keyword beats a link.",
        placeholder: "DM me 'EDIT' if you want this style.",
        examples: [
          "DM me “EDIT” if you want this style.",
          "Booking two projects for next month — DM to check dates.",
        ],
      },
    ],
  },
  {
    id: "educational",
    name: "Educational / Value",
    shape: "Concept → Explanation → Application",
    description: "Teach one thing properly",
    slots: [
      {
        id: "hook",
        label: "Hook",
        note: `${HOOK_NOTE} Numbered promises beat vague ones — “3 tricks” outperforms “some tips”. Name who it's for.`,
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
        note: "What they'll be able to do by the end. Earn the next six slides in one line.",
        placeholder: "What they'll learn.",
        examples: [
          "By the end you'll never cut a talking head the same way again.",
          "Three techniques, all of them free, all of them 10 seconds each.",
        ],
      },
      {
        id: "concept",
        label: "The concept",
        note: "The underlying principle — the why beneath all the techniques. Answer one specific question. Don't turn this into a Wikipedia page.",
        placeholder: "The principle underneath.",
        examples: [
          "Attention resets every time the frame changes. Every cut spends some.",
          "The eye follows motion before it reads a face.",
        ],
      },
      {
        id: "breakdown",
        label: "Breakdown",
        note: "Explain the principle in practice. Start with the verb — if they can act on it after reading only this slide, it's a good breakdown.",
        placeholder: "Technique #1",
        examples: [
          "Punch in 15% on the second sentence of every answer.",
          "Cut the breath, not the pause — the pause is the performance.",
        ],
      },
      {
        id: "point",
        label: "Example",
        note: "Application. Show it working on something real — an example is what turns a rule into a skill.",
        placeholder: "Technique #2",
        examples: [
          "Watch any A24 trailer: every cut lands on a movement, never a beat.",
          "Same interview, two cuts — one keeps the breath, one doesn't.",
        ],
        repeatable: true,
      },
      {
        id: "point",
        label: "Example",
        note: "One more. Three total is the sweet spot; a fourth is usually the first one restated.",
        placeholder: "Technique #3",
        examples: ["Mute the music on your last export and see if it still works."],
        repeatable: true,
      },
      {
        id: "takeaway",
        label: "Key takeaway",
        note: "The rule to remember, compressed into something they could repeat to someone else. This is the line that gets quoted.",
        placeholder: "The rule to remember.",
        examples: [
          "Cut on motion, not on beat.",
          "Every cut spends attention. Spend it on purpose.",
        ],
      },
      {
        id: "cta",
        label: "Call to action",
        note: "Ask for exactly one thing. For educational posts, “save” usually beats “follow”.",
        placeholder: "Save this for your next edit.",
        examples: ["Save this for your next edit.", "Follow for one of these every week."],
      },
    ],
  },
  {
    id: "story",
    name: "Story / Case Study",
    shape: "Situation → Conflict → Transformation",
    description: "Take them through what happened",
    slots: [
      {
        id: "hook",
        label: "Hook",
        note: `${HOOK_NOTE} Open mid-scene, at the strangest or worst moment. No setup, no “so I was thinking” — start where it got interesting, and hint at the change.`,
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
        note: "Where things stood at the start. Give just enough for the turn to land — resist the full backstory.",
        placeholder: "The starting situation.",
        examples: [
          "Posting four times a week, decent footage, flat numbers for months.",
          "They'd hired two editors before me. Both did exactly what was asked.",
        ],
      },
      {
        id: "problem",
        label: "The problem",
        note: "What wasn't working. Be specific about the symptom — vague problems make the fix look lucky.",
        placeholder: "What wasn't working.",
        examples: [
          "Watch time collapsed at 4 seconds. Every single video.",
          "The edits were clean and completely forgettable.",
        ],
      },
      {
        id: "point",
        label: "What they'd tried",
        note: "The attempt, and the conflict. Showing the failed attempts is what makes the solution credible — skip this and it reads as a lucky guess.",
        placeholder: "What they had already tried.",
        examples: [
          "Faster cuts. Louder music. Trending audio. None of it moved the 4-second drop.",
          "We tried three different hooks. The problem was never the hook.",
        ],
        repeatable: true,
      },
      {
        id: "turn",
        label: "The turning point",
        note: "The realisation. This is the slide the whole post exists for — make it the sharpest sentence you have.",
        placeholder: "The realisation.",
        examples: [
          "The first frame was a wide shot. Nobody knew what they were looking at.",
          "The problem was never the surface. It was the model underneath.",
        ],
      },
      {
        id: "solution",
        label: "What you changed",
        note: "The actual change, concretely. One thing, stated so precisely that someone could copy it.",
        placeholder: "What you changed.",
        examples: [
          "Opened on a close-up of the product, mid-motion, no establishing shot.",
          "Moved the payoff from 0:22 to 0:03.",
        ],
      },
      {
        id: "result",
        label: "The result",
        note: "The numbers. Specific beats triumphant — let the figures do the persuading.",
        placeholder: "What happened after.",
        examples: [
          "2K to 61K on the next video. Same client, same footage style.",
          "Watch time went from 4 seconds to 19.",
        ],
      },
      {
        id: "lesson",
        label: "The lesson",
        note: "Why it worked — the transferable principle. This is what makes it a case study instead of a brag.",
        placeholder: "Why it worked.",
        examples: [
          "The first frame is the hook. Everything else is the second chance.",
          "You can't pace your way out of a bad opening decision.",
        ],
      },
      {
        id: "cta",
        label: "Call to action",
        note: "One ask. After a case study, “follow for more breakdowns” converts better than a pitch.",
        placeholder: "Follow for more breakdowns.",
        examples: ["Follow for more breakdowns.", "DM me “AUDIT” and I'll look at your first frame."],
      },
    ],
  },
];

export const DEFAULT_STRUCTURE = STRUCTURES[0]!;

/** Numbered label when a structure repeats a slot — "Fix 1", "Fix 2". */
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
