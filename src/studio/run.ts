/**
 * The plan for a bulk run, decided before a single call is made.
 *
 * How many carousels, from which idea, in which style, and what each one must
 * not repeat. All of it is arithmetic, so it lives here where it can be proved
 * rather than in a component where it can only be watched.
 *
 * The execution is not here. That is asynchronous, spends money and touches the
 * network; what it does is follow this list.
 */

export const MIN_RUN = 3;

/**
 * Fourteen, which is a fortnight of daily posting.
 *
 * Not a ration. Below three this is the ordinary single-carousel flow with extra
 * clicks, and above fourteen the run takes long enough that nobody watches it
 * finish, which is the only thing the ceiling is about. Invariant 7 stands:
 * nothing counts down and nothing is refused for being over a quota.
 */
export const MAX_RUN = 14;

/** Two, because a third would not be an alternation anybody could follow. */
export const MAX_RUN_STYLES = 2;

export type Step = {
  /** 1-based, because it is shown. */
  n: number;
  idea: string;
  ideaIndex: number;
  styleId: string;
};

export const tidyIdeas = (ideas: readonly string[]): string[] =>
  ideas.map((i) => i.trim()).filter(Boolean);

export const clampRun = (count: number): number =>
  Math.max(MIN_RUN, Math.min(MAX_RUN, Math.round(count) || MIN_RUN));

/**
 * The run, step by step.
 *
 * **Ideas cycle rather than group.** Nine carousels from three ideas is
 * 1, 2, 3, 1, 2, 3, 1, 2, 3, not three of the first then three of the second.
 * Two reasons, and the second is the real one: it is what somebody means by
 * "alternate them all", and a run that stalls at step four has then produced one
 * carousel about each idea rather than four about the first and nothing about
 * the others.
 *
 * **Styles cycle on their own count.** With two styles and three ideas the
 * pairing shifts as the run goes, because the cycles have different lengths.
 * That is the point: a run should not produce the same idea in the same style
 * twice unless it runs long enough to come all the way round.
 */
export function planRun(
  ideas: readonly string[],
  count: number,
  styleIds: readonly string[],
): Step[] {
  const real = tidyIdeas(ideas);
  if (real.length === 0) return [];

  const styles = styleIds.filter(Boolean).slice(0, MAX_RUN_STYLES);
  if (styles.length === 0) return [];

  const n = clampRun(count);

  return Array.from({ length: n }, (_, i) => {
    const ideaIndex = i % real.length;
    return {
      n: i + 1,
      idea: real[ideaIndex]!,
      ideaIndex,
      styleId: styles[i % styles.length]!,
    };
  });
}

/**
 * The brief for one step, told what its siblings already said.
 *
 * **This is what makes "always a different angle" true rather than hoped for.**
 * Three carousels from one idea, each drafted from the same sentence with no
 * knowledge of the others, come back as three versions of one carousel. The
 * model is not being careless: it was asked the same question three times.
 *
 * So each step carries the openings of the carousels already made from its own
 * idea, and is told not to repeat them. Openings rather than whole decks because
 * the hook is what an angle IS, and sending three full carousels to write a
 * fourth is paying for context that says the same thing more slowly.
 */
export function briefFor(step: Step, alreadyUsed: readonly string[]): string {
  const used = alreadyUsed.map((h) => h.trim()).filter(Boolean);
  if (used.length === 0) return step.idea;

  return [
    step.idea,
    "",
    `This is carousel ${used.length + 1} on this idea. The earlier ones opened with:`,
    ...used.map((h) => `- ${h}`),
    "",
    "Take a genuinely different angle on the same idea. Not a reworded version of those.",
  ].join("\n");
}

/* ── watching it happen ───────────────────────────────────────────────────── */

export type StepState = "waiting" | "running" | "done" | "failed";

export type RunStep = Step & {
  state: StepState;
  /** The document this step produced, once it has. */
  docId?: string | undefined;
  title?: string | undefined;
  hook?: string | undefined;
  error?: string | undefined;
};

const isSettled = (state: StepState): boolean => state === "done" || state === "failed";

/**
 * How far along, as a percentage.
 *
 * Counted from work that has FINISHED, not from what is in flight. A bar that
 * jumps to 40% when step four starts is telling somebody four are done when
 * three are, and the difference shows up as a bar that sits still for fifteen
 * seconds and then leaps.
 *
 * A failed step counts as finished. It is not coming back on its own, and a
 * percentage that stalls forever at 71% because one step failed is worse than
 * one that reaches 100 with a step marked failed.
 *
 * ── Research counts, and that is a bug fix ─────────────────────────────────
 *
 * `research` is one state per idea, and it belongs in this number. It used to be
 * left out, on the reasoning that the bar measured carousels and research is not
 * a carousel. What that produced in practice was a run sitting at **0% for two
 * and a half minutes** while three searched calls went out one after another,
 * with every row below reading "Waiting". A measured run took 58s, 42s and 42s
 * before the first carousel was even asked for. Nobody waits in front of a 0%
 * that long; they conclude it is broken, and they are not being unreasonable.
 *
 * Weighted as one unit per idea against one unit per carousel, which is rough,
 * and rough is fine. What is not fine is a progress bar that reports no progress
 * while the thing is working.
 */
export const runPercent = (
  steps: readonly RunStep[],
  research: readonly StepState[] = [],
): number => {
  const total = steps.length + research.length;
  if (total === 0) return 0;

  const settled =
    steps.filter((s) => isSettled(s.state)).length + research.filter(isSettled).length;
  return Math.round((settled / total) * 100);
};

export const runDone = (steps: readonly RunStep[]): boolean =>
  steps.length > 0 && steps.every((s) => s.state === "done" || s.state === "failed");

/** The openings already used for one idea, so the next step can avoid them. */
export const usedHooks = (steps: readonly RunStep[], ideaIndex: number): string[] =>
  steps
    .filter((s) => s.ideaIndex === ideaIndex && s.state === "done" && s.hook)
    .map((s) => s.hook!);

/* ── what it cost ─────────────────────────────────────────────────────────── */

/**
 * Tokens, and searches, kept apart.
 *
 * **Not converted to money.** A run crosses several models at several prices,
 * and web search is billed per search on top of its tokens, so a figure in
 * dollars computed here would be a number this product cannot stand behind.
 * Tokens and searches are both facts.
 */
export type Spend = { input: number; output: number; cached: number; searches: number };

export const NO_SPEND: Spend = { input: 0, output: 0, cached: 0, searches: 0 };

export const addSpend = (a: Spend, b: Partial<Spend>): Spend => ({
  input: a.input + (b.input ?? 0),
  output: a.output + (b.output ?? 0),
  cached: a.cached + (b.cached ?? 0),
  searches: a.searches + (b.searches ?? 0),
});

export const totalTokens = (s: Spend): number => s.input + s.output + s.cached;

/* ── how many, counted the way people say it ──────────────────────────────── */

/**
 * Carousels PER IDEA, not a total.
 *
 * "Nine carousels, three ideas, three each" is how somebody describes this, and
 * asking for the total instead made them do the division. It also hid the thing
 * that matters: an uneven total means one idea gets fewer, and nothing on screen
 * said which.
 *
 * Per idea is uniform by construction, so the batch is always balanced and the
 * total is something the screen can simply show.
 */
export const perIdeaCeiling = (ideaCount: number): number =>
  ideaCount <= 0 ? 1 : Math.max(1, Math.floor(MAX_RUN / ideaCount));

/**
 * The floor, which is 1 per idea once there are enough ideas to clear MIN_RUN.
 *
 * With one idea it has to be MIN_RUN, because a batch of one carousel is the
 * ordinary single-carousel flow with a progress bar bolted on.
 */
export const perIdeaFloor = (ideaCount: number): number =>
  ideaCount <= 0 ? MIN_RUN : Math.max(1, Math.ceil(MIN_RUN / ideaCount));

export const clampPerIdea = (ideaCount: number, perIdea: number): number =>
  Math.max(
    perIdeaFloor(ideaCount),
    Math.min(perIdeaCeiling(ideaCount), Math.round(perIdea) || perIdeaFloor(ideaCount)),
  );

/** What the screen shows, and what `planRun` is given. */
export const totalFor = (ideaCount: number, perIdea: number): number =>
  ideaCount <= 0 ? 0 : ideaCount * clampPerIdea(ideaCount, perIdea);

/* ── the tutorial, shown once ─────────────────────────────────────────────── */

const SEEN_RUN_TUTORIAL = "fcc.bulk.seen";

/**
 * Shown on the first visit and never again unasked.
 *
 * Fails to `true` rather than `false` when storage is unreadable. In a private
 * window every visit is the first one, and a tutorial that reappears every time
 * somebody opens a screen is worse than one they never saw: the first is an
 * annoyance they cannot stop, the second is a page they can reach from the
 * header whenever they want it.
 */
export function hasSeenRunTutorial(): boolean {
  try {
    return localStorage.getItem(SEEN_RUN_TUTORIAL) === "1";
  } catch {
    return true;
  }
}

export function markRunTutorialSeen(): void {
  try {
    localStorage.setItem(SEEN_RUN_TUTORIAL, "1");
  } catch {
    /* nothing to do, and nothing worth telling anybody about */
  }
}

/** The steps, in the order they are asked, so the header can count them. */
export const RUN_STEPS = ["Ideas", "How many", "Length", "Look", "Depth", "Recap"] as const;

export type RunSetupStep = (typeof RUN_STEPS)[number];

/* ── how long each carousel should be ─────────────────────────────── */

export type RunLength = "small" | "medium" | "long" | "auto";

/**
 * Four options, one of them an opt-out.
 *
 * A band rather than a number, because nobody knows whether they want 11 slides
 * or 12 and offering the choice implies the difference matters. The number inside
 * each band is the one the drafting prompt is given, and it is the middle of the
 * band rather than its edge: asked for "8 to 12" a model would pick an end, and
 * the end it picks is the short one.
 *
 * `auto` sends the framework's own slot count, which is what every run did before
 * this question existed. It is named "Let me decide" rather than "Default"
 * because from the outside that is what it does: the framework decides.
 */
export const LENGTHS: { id: RunLength; label: string; hint: string; slides: number | null }[] = [
  { id: "small", label: "Short", hint: "Up to 6 slides. One point, made and left.", slides: 6 },
  { id: "medium", label: "Medium", hint: "8 to 12 slides. Room to build an argument.", slides: 10 },
  { id: "long", label: "Long", hint: "12 to 16 slides. A walkthrough.", slides: 14 },
  { id: "auto", label: "Let me decide", hint: "Whatever the framework is shaped for.", slides: null },
];

export const lengthLabel = (id: RunLength): string =>
  LENGTHS.find((l) => l.id === id)?.label ?? id;

/** The slide count to ask for. `natural` is the framework's own, used by `auto`. */
export const slidesFor = (id: RunLength, natural: number): number =>
  LENGTHS.find((l) => l.id === id)?.slides ?? natural;

/* ── the recap ──────────────────────────────────────────── */

/**
 * The whole run in one sentence.
 *
 * "12 Problem → Solution carousels, cycling between 3 ideas". Said in one line
 * because the last step before spending money should be readable at a glance,
 * and a list of six labelled rows is not: it is six things to check rather than
 * one thing to recognise.
 *
 * The cycling clause is dropped for a single idea, where it would be a lie
 * dressed as detail.
 */
export function recapHeadline(
  total: number,
  framework: string,
  ideaCount: number,
  length: RunLength,
): string {
  const size = length === "auto" ? "" : `${lengthLabel(length).toLowerCase()} `;
  const one = `${total} ${size}${framework} carousel${total === 1 ? "" : "s"}`;
  return ideaCount <= 1 ? one : `${one}, cycling between ${ideaCount} ideas`;
}

/* ── the pause between steps ────────────────────────────────── */

/**
 * Half a second between one question and the next.
 *
 * Deliberately fake. Nothing is computed here, and that is the point: a step
 * that changes instantly reads as the page having glitched rather than as an
 * answer having been taken, and this flow now has six of them in a row. R6 in
 * the interaction principles puts the floor for a state change somebody should
 * notice at around 300ms; 500 is comfortably above it and still under the
 * threshold where a wait becomes something to resent.
 */
export const SETTLE_MS = 500;

/**
 * What the pause says, per step.
 *
 * Different words each time, because the same word six times reads as a spinner
 * with a caption and stops being information. Each one names what was just
 * taken, so the pause is a receipt rather than a delay.
 */
const SETTLING = [
  "Saving your ideas",
  "Working out the batch",
  "Setting the length",
  "Loading the styles",
  "Calibrating",
  "Starting the run",
] as const;

export const settleNote = (at: number): string => SETTLING[at] ?? "Working";
