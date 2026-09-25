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

/**
 * How far along, as a percentage.
 *
 * Counted from steps that have FINISHED, not from the one in flight. A bar that
 * jumps to 40% when step four starts is telling somebody four are done when
 * three are, and the difference shows up as a bar that sits still for fifteen
 * seconds and then leaps.
 *
 * A failed step counts as finished. It is not coming back on its own, and a
 * percentage that stalls forever at 71% because one step failed is worse than
 * one that reaches 100 with a step marked failed.
 */
export const runPercent = (steps: readonly RunStep[]): number => {
  if (steps.length === 0) return 0;
  const settled = steps.filter((s) => s.state === "done" || s.state === "failed").length;
  return Math.round((settled / steps.length) * 100);
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
