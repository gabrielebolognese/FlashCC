/**
 * A few ideas in, a fortnight of carousels out.
 *
 * Replaces the old bulk create, which asked somebody to paste carousels they
 * had already written, separated by `---`. That was a text importer wearing the
 * name of a feature.
 *
 * ── One at a time, and that is a decision ────────────────────────────────────
 *
 * Fourteen calls at once would finish sooner. It would also make the percentage
 * meaningless, deliver the whole token count in one lump at the end, and turn a
 * single failure into a half-finished set with no way to say which half. Running
 * them in order means the run can be watched, stopped, and picked up from where
 * it stopped.
 *
 * **Each carousel is saved the moment it lands.** Closing the tab at step seven
 * leaves seven real carousels rather than nothing.
 *
 * **A failed step does not end the run.** It is marked and the run carries on.
 * Thirteen carousels lost to one rate limit is the failure this shape exists to
 * avoid.
 */
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  HelpCircle,
  Minus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { researchAngles, type Source } from "./angles.js";
import { alignToSlots, draftSlides } from "./ai.js";
import { contextVoice, listBrands } from "./brand.js";
import { buildSlides, type BuildOptions } from "./compositions.js";
import { Chip } from "./Dash.js";
import { makeDoc, type Doc } from "./model.js";
import { nameFromHook } from "./search.js";
import { cadenceDates, SLOT_HOUR } from "./calendar.js";
import {
  listPosts,
  platformLabel,
  postFromDoc,
  savePosts,
  schedule,
  type Platform,
} from "./pipeline.js";
import {
  addSpend,
  briefFor,
  clampPerIdea,
  hasSeenRunTutorial,
  LENGTHS,
  markRunTutorialSeen,
  MAX_RUN,
  MAX_RUN_STYLES,
  NO_SPEND,
  perIdeaCeiling,
  perIdeaFloor,
  planRun,
  recapHeadline,
  RUN_STEPS,
  runPercent,
  SETTLE_MS,
  settleNote,
  slidesFor,
  tidyIdeas,
  totalFor,
  totalTokens,
  type RunLength,
  type RunStep,
  type Spend,
  type StepState,
} from "./run.js";
import { makeSeries, type SeriesMember } from "./series.js";
import { loadDoc, saveDoc } from "./storage.js";
import { STRUCTURES, slotsFor, type Structure } from "./structures.js";
import { withStyleImage, type Style } from "./styles.js";

/** Read once, quickly, standing up. One idea per line. */
const TUTORIAL = [
  {
    title: "Write your ideas",
    line: "One sentence each. Two or three is plenty. They take turns through the batch, so nine carousels from three ideas are three on each rather than nine on one.",
  },
  {
    title: "Say how many per idea",
    line: "Three each from three ideas is nine carousels. Fourteen is the most in one run, because past that nobody watches it finish.",
  },
  {
    title: "Choose how long each one is",
    line: "Short, medium or long, or leave it to the framework. Whichever you pick, the drafting is told exactly how many slides to write, so a long carousel is long all the way down rather than padded at the end.",
  },
  {
    title: "Pick a look",
    line: "A framework for the shape of the argument, and one style, or two and it alternates them carousel by carousel.",
  },
  {
    title: "Choose how deeply it looks",
    line: "With research on, it reads the web about each idea first and builds the angles from what it actually finds, with the sources listed. Without it, the angles come from your own words.",
  },
  {
    title: "Watch them arrive",
    line: "The research runs first, all your ideas at once, which takes about a minute. Then the carousels arrive one at a time with a percentage, a clock and what it has spent. Each one is saved the moment it lands, so you can stop whenever and keep what is done.",
  },
];

type Phase = "tutorial" | "setup" | "running" | "done";

/**
 * Caps on the two calls, so a hang cannot masquerade as work.
 *
 * Generous rather than tight: a searched angles call measured 58 seconds and a
 * draft around 7, and a run that gives up on a slow-but-fine request is worse
 * than one that waits. These are the ceilings past which something is wrong, not
 * targets.
 */
const RESEARCH_MS = 180_000;
const DRAFT_MS = 120_000;

/**
 * Why one step failed, in words.
 *
 * An aborted fetch reports "The operation was aborted", which describes what the
 * browser did rather than what happened. The cap above is the only thing that
 * aborts anything here, so it can say so.
 */
const reasonFor = (e: unknown): string => {
  if (e instanceof DOMException && e.name === "AbortError") return "Took too long, skipped";
  return e instanceof Error ? e.message : "Could not draft this one";
};

export function BulkRun({
  styles,
  build,
  onCancel,
  onOpen,
  onCalendar,
}: {
  styles: Style[];
  build: BuildOptions;
  onCancel: () => void;
  onOpen: (doc: Doc) => void;
  /** Where a dated batch hands over to. See the done phase at the bottom. */
  onCalendar: () => void;
}) {
  // The tutorial first, unless it has been read. See hasSeenRunTutorial for why
  // unreadable storage counts as read.
  const [phase, setPhase] = useState<Phase>(() => (hasSeenRunTutorial() ? "setup" : "tutorial"));
  const [at, setAt] = useState(0);
  const [ideas, setIdeas] = useState<string[]>([""]);
  /** Per idea, not a total. See perIdeaCeiling for why. */
  const [perIdea, setPerIdea] = useState(3);
  const [length, setLength] = useState<RunLength>("medium");
  const [structure, setStructure] = useState<Structure>(() => STRUCTURES[0]!);
  const [picked, setPicked] = useState<string[]>(() => [styles[0]?.id ?? "ink"]);
  const [deep, setDeep] = useState(true);

  const [scheduling, setScheduling] = useState(false);
  const [startOn, setStartOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [everyDays, setEveryDays] = useState(1);
  const [platform, setPlatform] = useState<Platform>("linkedin");

  const [steps, setSteps] = useState<RunStep[]>([]);
  /**
   * One state per idea, for the research pass.
   *
   * Held apart from `steps` because it is a different shape of work: three calls
   * about ideas, not fourteen about carousels. It counts toward the percentage
   * all the same, see `runPercent`.
   */
  const [research, setResearch] = useState<StepState[]>([]);
  const [spend, setSpend] = useState<Spend>(NO_SPEND);
  const [sources, setSources] = useState<Source[]>([]);
  const [note, setNote] = useState("");
  const stop = useRef(false);

  /** The half-second beat between questions. See SETTLE_MS. */
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * A clock, for one reason: a run that is working and a run that has hung look
   * identical when the only thing on screen is a percentage that has not moved.
   * A second counter ticking is the cheapest possible proof of life.
   */
  const [startedAt, setStartedAt] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // A pending settle must not fire into an unmounted tree.
  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const real = tidyIdeas(ideas);
  const ready = real.length > 0 && picked.length > 0;

  /**
   * The slide count a carousel will ACTUALLY be, not the one that was asked for.
   *
   * `slotsFor` refuses to stretch a framework with no repeatable slot, and keeps
   * the shape instead. Showing the requested number would then be a promise the
   * run does not keep, so the screen reports what it is going to do.
   */
  const askedSlots = slotsFor(structure, slidesFor(length, structure.slots.length)).length;

  /** The dates the cadence would use, shown before the run rather than after. */
  const landing = cadenceDates(startOn, everyDays, totalFor(real.length, perIdea));
  const weekendCount = landing.filter((d) => d.getDay() === 0 || d.getDay() === 6).length;

  const styleById = (id: string): Style => styles.find((s) => s.id === id) ?? styles[0]!;

  /* ── the run ───────────────────────────────────────────────────────────── */

  async function go() {
    const plan = planRun(real, totalFor(real.length, perIdea), picked);
    if (plan.length === 0) return;

    stop.current = false;
    setSteps(plan.map((s) => ({ ...s, state: "waiting" })));
    setResearch(deep ? real.map(() => "waiting" as StepState) : []);
    setSpend(NO_SPEND);
    setSources([]);
    setStartedAt(Date.now());
    setTick(Date.now());
    setPhase("running");

    const voice = contextVoice(listBrands(), undefined);
    let running = NO_SPEND;
    const made: Doc[] = [];

    /*
     * Research is per IDEA, not per carousel. Three ideas is three searched
     * calls whatever the run length: asking fourteen times would cost fourteen
     * searches and still overlap, because each call would have no idea what the
     * others had chosen.
     */
    const angles = new Map<number, string[]>();
    /*
     * The hooks already used, per idea, tracked HERE rather than read back from
     * state.
     *
     * `steps` inside this loop is the closure from when the run started: every
     * entry still "waiting", every hook still absent. Reading it would make
     * `usedHooks` return nothing on every step, and the whole
     * do-not-repeat-yourself mechanism would be a no-op that looked like it was
     * working. A local map is the value that actually changes as the run goes.
     */
    const used = new Map<number, string[]>();
    if (deep) {
      setNote("Reading the web about your ideas");
      setResearch(real.map(() => "running" as StepState));

      /*
       * Every idea at once, and this is a fix rather than a flourish.
       *
       * These ran one after another, and a measured three-idea run spent 58s,
       * 42s and 42s on them: two and a half minutes before the first carousel
       * was even asked for, with the bar reading 0% and every row below reading
       * "Waiting". The run was working the whole time and looked completely
       * dead, which is the same thing as broken to the person watching it.
       *
       * They are independent calls about different ideas, so there was never a
       * reason to queue them. Running them together costs exactly the same
       * tokens and exactly the same searches.
       */
      await Promise.all(
        real.map(async (idea, i) => {
          const wanted = plan.filter((s) => s.ideaIndex === i).length;
          try {
            const out = await researchAngles(
              idea,
              wanted,
              voice,
              // A cap, because a request that never returns is the one failure
              // mode that looks exactly like one that is still working.
              AbortSignal.timeout(RESEARCH_MS),
            );
            angles.set(i, out.angles.map((a) => a.brief));
            setSources((prev) => [...prev, ...out.sources]);
            // Read and written synchronously after the await, so two ideas
            // finishing together cannot lose one of the two tallies.
            running = addSpend(running, { ...out.usage, searches: out.searches });
            setSpend(running);
            setResearch((prev) => prev.map((s, j) => (j === i ? "done" : s)));
          } catch {
            // Research is an improvement, not a requirement. A failed search on
            // one idea leaves that idea drafted from its own words rather than
            // ending the run before a single carousel exists.
            angles.set(i, []);
            setResearch((prev) => prev.map((s, j) => (j === i ? "failed" : s)));
          }
        }),
      );
    }

    setNote("");

    for (let i = 0; i < plan.length; i += 1) {
      if (stop.current) break;
      const step = plan[i]!;
      setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, state: "running" } : s)));

      try {
        // A researched angle if there is one for this position, otherwise the
        // idea with the earlier hooks named so it takes a different line.
        const researched = angles.get(step.ideaIndex) ?? [];
        const which = plan.slice(0, i).filter((p) => p.ideaIndex === step.ideaIndex).length;
        const brief = researched[which] ?? briefFor(step, used.get(step.ideaIndex) ?? []);

        // The length question, applied. `auto` sends the framework's own count,
        // which is what every run did before the question existed.
        // `askedSlots` above is this same call's length, which is what the recap
        // showed. One expression, so the promise and the request cannot diverge.
        const asked = {
          ...structure,
          slots: slotsFor(structure, slidesFor(length, structure.slots.length)),
        };
        const drafted = await draftSlides(brief, asked, AbortSignal.timeout(DRAFT_MS), voice);
        const texts = alignToSlots(drafted.slides, asked);

        const style = styleById(step.styleId);
        const doc: Doc = {
          ...makeDoc(nameFromHook(texts[0] ?? "")),
          framework: structure.id,
          styleId: style.id,
          palette: [
            style.theme.bg, style.theme.fg, style.theme.accent, style.theme.muted,
            "#ffffff", "#000000", "#e5545a", "#3dbe7a", "#4c86d6", "#db2777",
          ],
          slides: withStyleImage(buildSlides(texts, style.theme, drafted.slides.map((d) => d.role), build), style),
        };

        // Saved here, not at the end. A run abandoned at step seven has to leave
        // seven carousels behind.
        saveDoc(doc);
        made.push(doc);
        used.set(step.ideaIndex, [...(used.get(step.ideaIndex) ?? []), texts[0] ?? ""]);

        setSteps((prev) =>
          prev.map((s, j) =>
            j === i
              ? { ...s, state: "done", docId: doc.id, title: doc.name, hook: texts[0] ?? "" }
              : s,
          ),
        );
      } catch (e) {
        setSteps((prev) =>
          prev.map((s, j) => (j === i ? { ...s, state: "failed", error: reasonFor(e) } : s)),
        );
      }
    }

    if (scheduling && made.length > 0) scheduleAll(made);
    setPhase("done");
  }

  /**
   * The finished carousels, dated and numbered.
   *
   * Numbered as a series in run order, which is the order the ideas cycled in,
   * so part 2 is the second thing posted rather than the second thing about
   * idea one.
   */
  function scheduleAll(docs: Doc[]) {
    const numbered = makeSeries<SeriesMember>(docs.map((d) => ({ id: d.id, name: d.name })));
    // SLOT_HOUR, not a literal 9, so the preview above and the dates written
    // here cannot drift apart.
    const start = new Date(`${startOn}T${String(SLOT_HOUR).padStart(2, "0")}:00:00`);
    const gap = Math.max(1, Math.round(everyDays));

    const fresh = docs.map((doc, i) => {
      const when = new Date(start);
      when.setDate(when.getDate() + i * gap);
      const member = numbered[i];
      return schedule(
        { ...postFromDoc(doc, platform), ...(member?.series ? { series: member.series } : {}) },
        when.toISOString(),
      );
    });

    // Written once rather than per post: the store is a whole-list read and
    // write, so appending one at a time would rewrite the file N times and lose
    // anything another tab wrote in between.
    savePosts([...listPosts(), ...fresh]);
  }

  /* ── setup, one question at a time ─────────────────────────────────────── */

  if (phase === "tutorial") {
    return (
      <Shell onCancel={onCancel} title="Bulk create" note="Read this once">
        <Tutorial
          onContinue={() => {
            markRunTutorialSeen();
            setPhase("setup");
          }}
        />
      </Shell>
    );
  }

  if (phase === "setup") {
    const total = totalFor(real.length, perIdea);
    const ceiling = perIdeaCeiling(real.length);
    const floor = perIdeaFloor(real.length);

    const last = at === RUN_STEPS.length - 1;

    // Back is immediate. The beat below is there to make an answer feel taken,
    // and going back is not an answer.
    const back = () => (at === 0 ? setPhase("tutorial") : setAt(at - 1));

    /**
     * Half a second of "saving", then the next question.
     *
     * Nothing is computed in it. Six questions that each swap instantly read as
     * the page glitching rather than as answers being taken, and the last one
     * lands on a progress bar that starts at zero, which needs a beat most of all.
     */
    const next = () => {
      if (settling) return;
      setSettling(true);
      settleTimer.current = setTimeout(() => {
        setSettling(false);
        if (last) void go();
        else setAt(at + 1);
      }, SETTLE_MS);
    };

    const canNext =
      at === 0 ? real.length > 0 : at === 3 ? picked.length > 0 : true;

    const label = last ? `Make ${total} carousel${total === 1 ? "" : "s"}` : "Continue";

    return (
      <Shell
        onCancel={onCancel}
        title="Bulk create"
        note={`Step ${at + 1} of ${RUN_STEPS.length}`}
        onHelp={() => setPhase("tutorial")}
      >
        <Steps
          at={at}
          onBack={back}
          onNext={next}
          canNext={canNext}
          nextLabel={label}
          settling={settling}
          settleNote={settleNote(at)}
        >
          {at === 0 ? (
            <Ask
              title="What are your ideas?"
              line="One per box. They take turns through the batch, so it is never all about one of them."
            >
              <div className="flex flex-col gap-2.5">
                {ideas.map((idea, i) => (
                  <div key={i} className="flex gap-2">
                    <textarea
                      value={idea}
                      autoFocus={i === 0}
                      rows={2}
                      onChange={(e) => setIdeas((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                      placeholder={
                        i === 0
                          ? "Editors undercharging for short-form work"
                          : "Another idea, in a sentence"
                      }
                      className="min-h-[68px] flex-1 resize-y rounded-2xl border border-hairline bg-surface-1 px-4 py-3 text-[16px] leading-[24px] text-primary outline-none placeholder:text-muted focus:border-accent-dim"
                    />
                    {ideas.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setIdeas((v) => v.filter((_, j) => j !== i))}
                        aria-label="Remove this idea"
                        className="grid w-11 shrink-0 place-items-center rounded-2xl border border-hairline text-tertiary hover:border-danger-dim hover:text-danger"
                      >
                        <Trash2 size={16} strokeWidth={2} />
                      </button>
                    ) : null}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setIdeas((v) => [...v, ""])}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline text-[15px] text-tertiary hover:border-accent-dim hover:text-accent"
                >
                  <Plus size={16} strokeWidth={2.4} />
                  Another idea
                </button>
              </div>
            </Ask>
          ) : null}

          {at === 1 ? (
            <Ask
              title="How many per idea?"
              line={
                real.length === 1
                  ? "One idea, so this is the size of the batch."
                  : `${real.length} ideas, so this multiplies out.`
              }
            >
              <div className="rounded-2xl border border-hairline bg-surface-1 p-6 text-center">
                <div className="flex items-center justify-center gap-5">
                  <button
                    type="button"
                    aria-label="One fewer each"
                    disabled={perIdea <= floor}
                    onClick={() => setPerIdea((n) => Math.max(floor, n - 1))}
                    className="grid h-12 w-12 place-items-center rounded-2xl border border-hairline text-tertiary hover:border-accent-dim hover:text-accent disabled:opacity-30"
                  >
                    <Minus size={18} strokeWidth={2.4} />
                  </button>

                  <span className="w-20 font-mono text-[52px] font-semibold leading-none text-primary">
                    {clampPerIdea(real.length, perIdea)}
                  </span>

                  <button
                    type="button"
                    aria-label="One more each"
                    disabled={perIdea >= ceiling}
                    onClick={() => setPerIdea((n) => Math.min(ceiling, n + 1))}
                    className="grid h-12 w-12 place-items-center rounded-2xl border border-hairline text-tertiary hover:border-accent-dim hover:text-accent disabled:opacity-30"
                  >
                    <Plus size={18} strokeWidth={2.4} />
                  </button>
                </div>

                <div className="mt-5 text-[17px] text-secondary">
                  {real.length} {real.length === 1 ? "idea" : "ideas"} ×{" "}
                  {clampPerIdea(real.length, perIdea)} ={" "}
                  <span className="font-semibold" style={{ color: "var(--brand-gold)" }}>
                    {total} carousels
                  </span>
                </div>

                {perIdea >= ceiling && real.length > 1 ? (
                  <p className="mt-2 text-caption leading-4 text-muted">
                    {MAX_RUN} is the most in one run. Fewer ideas would allow more each.
                  </p>
                ) : null}
              </div>
            </Ask>
          ) : null}

          {at === 2 ? (
            <Ask
              title="How long should each one be?"
              line="A band, not a number. Whatever this says, the drafting is told exactly how many slides to write, so a long carousel is long the whole way down rather than padded at the end."
            >
              <div className="flex flex-col gap-2.5">
                {LENGTHS.map((l) => {
                  const on = length === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLength(l.id)}
                      className={[
                        "flex items-center gap-3.5 rounded-2xl border p-5 text-left",
                        on ? "border-accent bg-accent-wash" : "border-hairline bg-surface-1",
                      ].join(" ")}
                    >
                      {/*
                        A radio, drawn rather than a real input, because only one
                        can be chosen and a row of checkboxes says the opposite.
                      */}
                      <span
                        className={[
                          "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                          on ? "border-accent" : "border-surface-5",
                        ].join(" ")}
                      >
                        {on ? (
                          <span
                            className="block h-2.5 w-2.5 rounded-full"
                            style={{ background: "var(--accent)" }}
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px] font-semibold text-primary">
                          {l.label}
                        </span>
                        <span className="mt-1 block text-[14px] leading-[21px] text-muted">
                          {l.hint}
                        </span>
                      </span>
                      {l.slides === null ? null : (
                        <span className="shrink-0 font-mono text-[15px] text-tertiary">
                          {l.slides}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-caption leading-4 text-muted">
                {length === "auto"
                  ? `${structure.name} is shaped for ${structure.slots.length} slides, so that is what each one will be.`
                  : askedSlots === slidesFor(length, structure.slots.length)
                    ? `Each carousel will be ${askedSlots} slides.`
                    : `${structure.name} has a fixed shape, so each one will be ${askedSlots} slides whatever is chosen here.`}
              </p>
            </Ask>
          ) : null}

          {at === 3 ? (
            <Ask
              title="How should they look?"
              line="One style for all of them, or two and it alternates: first carousel one, second the other, and on."
            >
              <label className="block">
                <span className="text-[15px] text-tertiary">Framework</span>
                <select
                  value={structure.id}
                  onChange={(e) =>
                    setStructure(STRUCTURES.find((s) => s.id === e.target.value) ?? STRUCTURES[0]!)
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-hairline bg-surface-1 px-4 text-[16px] text-primary outline-none focus:border-accent-dim"
                >
                  {STRUCTURES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-6">
                <span className="text-[15px] text-tertiary">
                  Style{picked.length === 2 ? "s, alternating" : ""}
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {styles.map((s) => {
                    const on = picked.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setPicked((v) =>
                            on
                              ? v.length > 1
                                ? v.filter((x) => x !== s.id)
                                : v
                              : v.length >= MAX_RUN_STYLES
                                ? [v[1] ?? v[0]!, s.id]
                                : [...v, s.id],
                          )
                        }
                        className={[
                          "flex h-11 items-center gap-2 rounded-2xl border px-3.5 text-[15px]",
                          on
                            ? "border-accent bg-accent-wash text-accent"
                            : "border-hairline text-tertiary hover:text-primary",
                        ].join(" ")}
                      >
                        <span
                          className="block h-4 w-4 rounded-full"
                          style={{ background: s.theme.bg }}
                        />
                        {s.name}
                        {on ? <Check size={13} strokeWidth={3} /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Ask>
          ) : null}

          {at === 4 ? (
            <Ask
              title="How deeply should it look?"
              line="With research on it searches the web about each idea and builds the angles from what it finds, with the sources listed."
            >
              <button
                type="button"
                onClick={() => setDeep(!deep)}
                className={[
                  "flex w-full items-start gap-3.5 rounded-2xl border p-5 text-left",
                  deep ? "border-accent bg-accent-wash" : "border-hairline bg-surface-1",
                ].join(" ")}
              >
                <Search
                  size={20}
                  strokeWidth={2}
                  className={deep ? "mt-0.5 shrink-0 text-accent" : "mt-0.5 shrink-0 text-tertiary"}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold text-primary">
                    Read the web first
                  </span>
                  <span className="mt-1 block text-[14px] leading-[21px] text-muted">
                    Slower, and searches are billed on top of tokens. Without it the angles come
                    from your own words, which is often enough.
                  </span>
                </span>
                {deep ? <Check size={18} strokeWidth={2.6} className="shrink-0 text-accent" /> : null}
              </button>

              <button
                type="button"
                onClick={() => setScheduling(!scheduling)}
                className={[
                  "mt-3 flex w-full items-start gap-3.5 rounded-2xl border p-5 text-left",
                  scheduling ? "border-accent bg-accent-wash" : "border-hairline bg-surface-1",
                ].join(" ")}
              >
                <CalendarDays
                  size={20}
                  strokeWidth={2}
                  className={
                    scheduling ? "mt-0.5 shrink-0 text-accent" : "mt-0.5 shrink-0 text-tertiary"
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold text-primary">
                    Put them in the pipeline with dates
                  </span>
                  <span className="mt-1 block text-[14px] leading-[21px] text-muted">
                    Off by default. A batch of carousels is useful on its own.
                  </span>
                </span>
                {scheduling ? (
                  <Check size={18} strokeWidth={2.6} className="shrink-0 text-accent" />
                ) : null}
              </button>

              {scheduling ? (
                <div className="mt-3 grid grid-cols-3 gap-2.5">
                  <label className="block">
                    <span className="text-caption text-tertiary">Starting</span>
                    <input
                      type="date"
                      value={startOn}
                      onChange={(e) => setStartOn(e.target.value)}
                      className="mt-1.5 h-11 w-full rounded-xl border border-hairline bg-surface-1 px-3 text-body text-primary outline-none focus:border-accent-dim"
                    />
                  </label>
                  <label className="block">
                    <span className="text-caption text-tertiary">Every</span>
                    <select
                      value={everyDays}
                      onChange={(e) => setEveryDays(Number(e.target.value))}
                      className="mt-1.5 h-11 w-full rounded-xl border border-hairline bg-surface-1 px-3 text-body text-primary outline-none focus:border-accent-dim"
                    >
                      <option value={1}>day</option>
                      <option value={2}>2 days</option>
                      <option value={3}>3 days</option>
                      <option value={7}>week</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-caption text-tertiary">On</span>
                    <select
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value as Platform)}
                      className="mt-1.5 h-11 w-full rounded-xl border border-hairline bg-surface-1 px-3 text-body text-primary outline-none focus:border-accent-dim"
                    >
                      <option value="linkedin">LinkedIn</option>
                      <option value="instagram">Instagram</option>
                      <option value="tiktok">TikTok</option>
                      <option value="x">X</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {/*
                The dates themselves, before anything is spent.
                `cadenceDates` is the same arithmetic the run uses, so this is
                the plan rather than an illustration of it. Weekends are named
                because "every 2 days from Friday" quietly means half the batch
                lands on a Sunday, and nobody works that out in their head.
              */}
              {scheduling ? (
                <div className="mt-3 rounded-2xl border border-hairline bg-surface-1 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-caption text-tertiary">They would land on</span>
                    <div className="flex-1" />
                    {weekendCount > 0 ? (
                      <span className="text-caption text-muted">
                        {weekendCount} at the weekend
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {landing.map((d) => (
                      <span
                        key={d.toISOString()}
                        className="flex h-8 items-center rounded-xl border border-hairline px-2.5 text-[13px] text-secondary"
                      >
                        {d.toLocaleDateString(undefined, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </Ask>
          ) : null}

          {at === 5 ? (
            <Ask
              title="Recap"
              line="The last screen before it starts spending. Each carousel is saved the moment it lands, so you can stop whenever and keep what is done."
            >
              {/*
                The whole run in one sentence, at headline size, above the
                itemised version. Six labelled rows are six things to check; one
                sentence is one thing to recognise, and recognition is what
                somebody actually does here before pressing the button.
              */}
              <div className="rounded-2xl border border-accent-dim bg-accent-wash p-5">
                <p className="text-[21px] font-semibold leading-[29px] tracking-[-0.3px] text-primary">
                  {recapHeadline(total, structure.name, real.length, length)}
                </p>
                <ol className="mt-3 flex flex-col gap-1.5">
                  {real.map((idea, i) => (
                    <li key={i} className="flex gap-2.5 text-[14px] leading-[21px] text-secondary">
                      <span className="shrink-0 font-mono text-tertiary">{i + 1}</span>
                      <span className="min-w-0 flex-1">{idea}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-3 flex flex-col gap-2.5">
                <Line
                  label="Each idea gets"
                  value={`${clampPerIdea(real.length, perIdea)} carousel${clampPerIdea(real.length, perIdea) === 1 ? "" : "s"}, ${askedSlots} slides each`}
                />
                <Line
                  label={picked.length === 2 ? "Styles, alternating" : "Style"}
                  value={picked.map((id) => styleById(id).name).join(", then ")}
                />
                <Line
                  label="Research"
                  value={
                    deep
                      ? `Reads the web first, ${real.length} search${real.length === 1 ? "" : "es"} running together`
                      : "From your own words, no searching"
                  }
                />
                <Line
                  label="Scheduled"
                  value={
                    scheduling && landing.length > 0
                      ? `${platformLabel(platform)}, every ${
                          everyDays === 1 ? "day" : `${everyDays} days`
                        }, ${landing[0]!.toLocaleDateString(undefined, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })} to ${landing.at(-1)!.toLocaleDateString(undefined, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}`
                      : "Not scheduled, they just go in Projects"
                  }
                />
              </div>

              {deep ? (
                <p className="mt-3 text-caption leading-4 text-muted">
                  Reading the web takes about a minute before the first carousel starts. The bar
                  moves as each idea comes back.
                </p>
              ) : null}
            </Ask>
          ) : null}
        </Steps>
      </Shell>
    );
  }

  /* ── running, and done ─────────────────────────────────────────────────── */

  // Research included, deliberately. See runPercent: leaving it out is what made
  // a working run sit on 0% for two and a half minutes.
  const percent = runPercent(steps, research);
  const finished = steps.filter((s) => s.state === "done");
  const failed = steps.filter((s) => s.state === "failed");
  const researching = research.some((r) => r === "running");

  const seconds = startedAt ? Math.max(0, Math.floor((tick - startedAt) / 1000)) : 0;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <Shell
      onCancel={onCancel}
      title={phase === "done" ? `${finished.length} carousels` : "Making them"}
      note={phase === "done" ? "Open any of them" : note || "One at a time, so you can watch"}
    >
      <div className="mx-auto w-full max-w-[760px] pb-24">
        <div className="sticky top-0 z-10 bg-base pb-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[26px] font-semibold leading-8 text-primary">{percent}%</span>
            {/*
              A ticking clock, because a bar that has not moved and a run that
              has hung are the same picture otherwise.
            */}
            <span className="font-mono text-caption text-muted">{clock}</span>
            <div className="flex-1" />
            {/*
              Tokens and searches apart, and no money. A run crosses several
              models at several prices and searches bill per search, so a figure
              in dollars here would be one this product cannot stand behind.
            */}
            <span className="text-caption text-muted">
              {totalTokens(spend).toLocaleString()} tokens
              {spend.searches > 0 ? ` · ${spend.searches} searches` : ""}
            </span>
          </div>

          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full"
              style={{
                width: `${percent}%`,
                background: "var(--brand-gold)",
                // The only transition on this screen, and it is on width rather
                // than on colour, which the house rule forbids.
                transition: "width 400ms cubic-bezier(0.22,1,0.36,1)",
              }}
            />
          </div>

          {/*
            What is happening, right now, under the bar.
            A percentage alone cannot distinguish "reading the web" from "hung",
            and the small note in the header was not where anybody was looking.
          */}
          {phase === "running" ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="fcc-spin block h-3 w-3 shrink-0 rounded-full border-2 border-hairline border-t-accent" />
              <span className="text-caption text-secondary">
                {researching
                  ? `Reading the web about ${research.length} idea${research.length === 1 ? "" : "s"}, all at once`
                  : `Carousel ${Math.min(finished.length + failed.length + 1, steps.length)} of ${steps.length}`}
              </span>
            </div>
          ) : null}
        </div>

        {/*
          The research pass, shown as work rather than hidden behind a note.
          Three searched calls are around a minute of the run and used to be
          invisible: the rows below all said "Waiting" and the bar said 0%.
        */}
        {research.length > 0 ? (
          <div className="mt-3 rounded-2xl border border-hairline bg-surface-1 p-3">
            <div className="flex items-center gap-2 pb-2">
              <Search size={13} strokeWidth={2} className="shrink-0 text-accent" />
              <span className="text-caption text-tertiary">
                {researching ? "Reading the web about each idea" : "Read the web"}
              </span>
              <div className="flex-1" />
              {researching ? (
                <span className="text-caption text-muted">about a minute</span>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              {research.map((state, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  {state === "running" ? (
                    <span className="fcc-spin block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-hairline border-t-accent" />
                  ) : state === "done" ? (
                    <Check size={13} strokeWidth={2.6} className="shrink-0 text-success" />
                  ) : state === "failed" ? (
                    <AlertCircle size={13} strokeWidth={2} className="shrink-0 text-danger" />
                  ) : (
                    <span className="block h-3.5 w-3.5 shrink-0 rounded-full border border-hairline" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-caption text-secondary">
                    {real[i]}
                  </span>
                  <span className="shrink-0 text-caption text-muted">
                    {state === "failed" ? "its own words instead" : state === "done" ? "angles ready" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-2">
          {steps.map((s, i) => (
            <div
              key={i}
              className={[
                "flex items-center gap-3 rounded-2xl border bg-surface-1 p-3",
                s.state === "running" ? "border-accent-dim" : "border-hairline",
              ].join(" ")}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-4 text-caption font-semibold text-secondary">
                {s.n}
              </span>

              <div className="min-w-0 flex-1">
                <div className="truncate text-body text-primary">
                  {s.title ?? s.idea}
                </div>
                <div className="truncate text-caption text-muted">
                  {s.state === "failed"
                    ? s.error
                    : s.state === "running"
                      ? "Drafting…"
                      : s.state === "waiting"
                        ? researching
                          ? "Waiting for the research"
                          : "Waiting"
                        : styleById(s.styleId).name}
                </div>
              </div>

              {s.state === "running" ? (
                <span className="fcc-spin block h-4 w-4 shrink-0 rounded-full border-2 border-hairline border-t-accent" />
              ) : s.state === "failed" ? (
                <AlertCircle size={15} strokeWidth={2} className="shrink-0 text-danger" />
              ) : s.state === "done" ? (
                <button
                  type="button"
                  onClick={() => {
                    // Read back rather than held: the run SAVED it, and the
                    // store is the one source of truth for what a carousel is.
                    const doc = s.docId ? loadDoc(s.docId) : null;
                    if (doc) onOpen(doc);
                  }}
                  className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-hairline px-2.5 text-caption text-tertiary hover:border-accent-dim hover:text-accent"
                >
                  Open
                  <ArrowRight size={12} strokeWidth={2.4} />
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {sources.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-hairline bg-surface-1 p-3.5">
            <div className="flex items-center gap-2">
              <Search size={13} strokeWidth={2} className="shrink-0 text-accent" />
              <span className="text-caption text-tertiary">What it read</span>
              <Chip>{sources.length}</Chip>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {sources.slice(0, 12).map((src) => (
                <a
                  key={src.url}
                  href={src.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="truncate text-caption text-muted hover:text-accent"
                >
                  {src.title}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {phase === "running" ? (
          <button
            type="button"
            onClick={() => {
              stop.current = true;
            }}
            className="mt-5 h-9 w-full rounded-xl border border-hairline text-body text-tertiary hover:border-danger-dim hover:text-danger"
          >
            Stop after this one
          </button>
        ) : null}

        {phase === "done" ? (
          <div className="mt-5 flex items-center gap-2">
            {failed.length > 0 ? (
              <span className="text-caption text-muted">
                {failed.length} did not make it. The rest are saved.
              </span>
            ) : (
              <span className="text-caption text-muted">
                All saved{scheduling ? " and scheduled" : ""}.
              </span>
            )}
            <div className="flex-1" />
            {/*
              A dated batch is a filled fortnight, and the screen that makes
              that legible is the calendar. Shown only when there is something
              to see there, because sending somebody to an empty grid to admire
              their work is worse than not offering.
            */}
            {scheduling && finished.length > 0 ? (
              <button
                type="button"
                onClick={onCalendar}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-hairline px-3.5 text-body text-secondary hover:border-accent-dim hover:text-accent"
              >
                <CalendarDays size={14} strokeWidth={2} />
                See the calendar
              </button>
            ) : null}
            <button
              type="button"
              onClick={onCancel}
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              className="flex h-9 items-center rounded-xl px-4 text-body-strong"
            >
              Done
            </button>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

/**
 * What this screen does, before it asks for anything.
 *
 * Shown once. A batch is the one flow here that spends real money on somebody's
 * behalf and runs for minutes, so the thirty seconds spent explaining it buys
 * back the run they would otherwise have started wrong and cancelled.
 *
 * Big type and one idea per line, because it is read once, quickly, standing up.
 */
function Tutorial({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[680px] pb-24 pt-4">
      <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-1px] text-primary md:text-[42px]">
        How to use bulk create
      </h1>
      <p className="mt-3 text-[17px] leading-[26px] text-tertiary">
        Six questions, then it makes the carousels one at a time while you watch.
      </p>

      <ol className="mt-9 flex flex-col gap-7">
        {TUTORIAL.map((t, i) => (
          <li key={t.title} className="flex gap-4">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-semibold"
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="text-[21px] font-semibold leading-7 tracking-[-0.3px] text-primary">
                {t.title}
              </div>
              <p className="mt-1.5 text-[15px] leading-[23px] text-tertiary">{t.line}</p>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onContinue}
        style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
        className="mt-10 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[17px] font-semibold shadow-overlay hover:brightness-110"
      >
        Continue
        <ArrowRight size={18} strokeWidth={2.5} />
      </button>

      <p className="mt-3 text-center text-caption text-muted">
        You can read this again from the header.
      </p>
    </div>
  );
}

/**
 * One question at a time, at a size somebody can read across a desk.
 *
 * The whole setup used to be a single scrolling column of small controls, which
 * meant the question that decides what a batch costs sat between a dropdown and
 * a checkbox at the same weight as both. A step per question gives each one the
 * room to state what it does.
 */
function Steps({
  at,
  onBack,
  onNext,
  canNext,
  nextLabel,
  settling,
  settleNote,
  children,
}: {
  at: number;
  onBack: () => void;
  onNext: () => void;
  canNext: boolean;
  nextLabel: string;
  settling: boolean;
  settleNote: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[680px] pb-28 pt-2">
      <div className="flex items-center gap-1.5">
        {RUN_STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col gap-1.5">
            <span
              className="block h-1 rounded-full"
              style={{
                background: i <= at ? "var(--brand-gold)" : "var(--surface-4)",
                transition: "background 300ms ease",
              }}
            />
            <span
              className={
                i === at ? "text-caption text-accent" : "hidden text-caption text-muted sm:block"
              }
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-9">{children}</div>

      <div className="mt-10 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-12 items-center gap-1.5 rounded-2xl border border-hairline px-4 text-[15px] text-tertiary hover:border-accent-dim hover:text-accent"
        >
          <ChevronLeft size={16} strokeWidth={2.2} />
          Back
        </button>
        <button
          type="button"
          disabled={!canNext || settling}
          onClick={onNext}
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold shadow-overlay hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
        >
          {settling ? (
            <>
              {/*
                The spinner borrows the button's own text colour rather than the
                accent, because on gold the accent is invisible.
              */}
              <span
                className="fcc-spin block h-4 w-4 rounded-full border-2 border-transparent"
                style={{ borderTopColor: "var(--on-brand-gold)", borderRightColor: "var(--on-brand-gold)" }}
              />
              {settleNote}
            </>
          ) : (
            <>
              {nextLabel}
              <ArrowRight size={17} strokeWidth={2.5} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/** A step's question, at the size a question deserves. */
function Ask({
  title,
  line,
  children,
}: {
  title: string;
  line: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-[27px] font-semibold leading-[1.15] tracking-[-0.6px] text-primary md:text-[31px]">
        {title}
      </h2>
      <p className="mt-2.5 text-[16px] leading-[24px] text-tertiary">{line}</p>
      <div className="mt-7">{children}</div>
    </div>
  );
}
/** One line of the summary. */
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-hairline bg-surface-1 px-4 py-3">
      <span className="w-[130px] shrink-0 text-[14px] text-tertiary">{label}</span>
      <span className="min-w-0 flex-1 text-[15px] leading-[22px] text-primary">{value}</span>
    </div>
  );
}

function Shell({
  title,
  note,
  onCancel,
  onHelp,
  children,
}: {
  title: string;
  note: string;
  onCancel: () => void;
  /** Present on the setup steps, so the tutorial is reachable rather than gone. */
  onHelp?: (() => void) | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-base">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-6">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          className="grid h-8 w-8 place-items-center rounded-xl text-tertiary hover:bg-white/[0.06] hover:text-primary"
        >
          <X size={16} strokeWidth={2} />
        </button>
        <div className="min-w-0">
          <div className="truncate text-title text-primary">{title}</div>
          <div className="truncate text-caption text-tertiary">{note}</div>
        </div>
        <div className="flex-1" />
        {onHelp ? (
          <button
            type="button"
            onClick={onHelp}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-hairline px-2.5 text-caption text-tertiary hover:border-accent-dim hover:text-accent"
          >
            <HelpCircle size={13} strokeWidth={2} />
            How it works
          </button>
        ) : null}
      </header>

      <main className="scroll-quiet flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

function Block({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <span className="text-overline uppercase text-tertiary">{label}</span>
      {hint ? <p className="mb-2 mt-0.5 text-caption leading-4 text-muted">{hint}</p> : <div className="mb-2" />}
      {children}
    </div>
  );
}
