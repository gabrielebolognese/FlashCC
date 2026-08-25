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
  /** One line, shown beside the box. A punchline, never a paragraph. */
  note: string;
  /** The long version, on hover. Costs no space. */
  detail: string;
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

export const STRUCTURES: Structure[] = [
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
          "Cut on movement — a hand raise, a head turn, a step.",
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
          "Dropped the intro — the product shot was the stronger open.",
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
          "Booking two projects for next month — DM to check dates.",
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
          "Cut the breath, not the pause — the pause is the performance.",
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
          "Same interview, two cuts — one keeps the breath, one doesn't.",
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
