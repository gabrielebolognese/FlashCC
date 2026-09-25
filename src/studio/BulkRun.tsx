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
import { AlertCircle, ArrowRight, Check, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";

import { researchAngles, type Source } from "./angles.js";
import { alignToSlots, draftSlides } from "./ai.js";
import { contextVoice, listBrands } from "./brand.js";
import { buildSlides, type BuildOptions } from "./compositions.js";
import { Chip } from "./Dash.js";
import { makeDoc, type Doc } from "./model.js";
import { nameFromHook } from "./search.js";
import { listPosts, postFromDoc, savePosts, schedule, type Platform } from "./pipeline.js";
import {
  addSpend,
  briefFor,
  clampRun,
  MAX_RUN,
  MAX_RUN_STYLES,
  MIN_RUN,
  NO_SPEND,
  planRun,
  runDone,
  runPercent,
  tidyIdeas,
  totalTokens,
  type RunStep,
  type Spend,
} from "./run.js";
import { makeSeries, type SeriesMember } from "./series.js";
import { loadDoc, saveDoc } from "./storage.js";
import { STRUCTURES, slotsFor, type Structure } from "./structures.js";
import { withStyleImage, type Style } from "./styles.js";

const field =
  "h-9 w-full rounded-xl border border-hairline bg-surface-1 px-3 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim";

type Phase = "setup" | "running" | "done";

export function BulkRun({
  styles,
  build,
  onCancel,
  onOpen,
}: {
  styles: Style[];
  build: BuildOptions;
  onCancel: () => void;
  onOpen: (doc: Doc) => void;
}) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [ideas, setIdeas] = useState<string[]>([""]);
  const [count, setCount] = useState(6);
  const [structure, setStructure] = useState<Structure>(() => STRUCTURES[0]!);
  const [picked, setPicked] = useState<string[]>(() => [styles[0]?.id ?? "ink"]);
  const [deep, setDeep] = useState(true);

  const [scheduling, setScheduling] = useState(false);
  const [startOn, setStartOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [everyDays, setEveryDays] = useState(1);
  const [platform, setPlatform] = useState<Platform>("linkedin");

  const [steps, setSteps] = useState<RunStep[]>([]);
  const [spend, setSpend] = useState<Spend>(NO_SPEND);
  const [sources, setSources] = useState<Source[]>([]);
  const [note, setNote] = useState("");
  const stop = useRef(false);

  const real = tidyIdeas(ideas);
  const ready = real.length > 0 && picked.length > 0;

  const styleById = (id: string): Style => styles.find((s) => s.id === id) ?? styles[0]!;

  /* ── the run ───────────────────────────────────────────────────────────── */

  async function go() {
    const plan = planRun(real, count, picked);
    if (plan.length === 0) return;

    stop.current = false;
    setSteps(plan.map((s) => ({ ...s, state: "waiting" })));
    setSpend(NO_SPEND);
    setSources([]);
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
      setNote("Reading around your ideas");
      for (let i = 0; i < real.length && !stop.current; i += 1) {
        const wanted = plan.filter((s) => s.ideaIndex === i).length;
        try {
          const out = await researchAngles(real[i]!, wanted, voice);
          angles.set(i, out.angles.map((a) => a.brief));
          setSources((prev) => [...prev, ...out.sources]);
          running = addSpend(running, { ...out.usage, searches: out.searches });
          setSpend(running);
        } catch {
          // Research is an improvement, not a requirement. A failed search on one
          // idea leaves that idea drafted from its own words rather than ending
          // the run before a single carousel exists.
          angles.set(i, []);
        }
      }
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

        const asked = { ...structure, slots: slotsFor(structure, structure.slots.length) };
        const drafted = await draftSlides(brief, asked, undefined, voice);
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
          prev.map((s, j) =>
            j === i
              ? { ...s, state: "failed", error: e instanceof Error ? e.message : "Could not draft this one" }
              : s,
          ),
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
    const start = new Date(`${startOn}T09:00:00`);
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

  /* ── setup ─────────────────────────────────────────────────────────────── */

  if (phase === "setup") {
    return (
      <Shell onCancel={onCancel} title="Make a batch" note="A few ideas, a fortnight of carousels">
        <div className="mx-auto w-full max-w-[760px] pb-24">
          <Block label="Your ideas" hint="One per line. They take turns, so the batch is never all about one.">
            <div className="flex flex-col gap-2">
              {ideas.map((idea, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={idea}
                    autoFocus={i === 0}
                    onChange={(e) => setIdeas((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder={i === 0 ? "Editors undercharging for short-form work" : "Another idea"}
                    className={field}
                  />
                  {ideas.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setIdeas((v) => v.filter((_, j) => j !== i))}
                      aria-label="Remove"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-hairline text-tertiary hover:border-danger-dim hover:text-danger"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setIdeas((v) => [...v, ""])}
                className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline text-caption text-tertiary hover:border-accent-dim hover:text-accent"
              >
                <Plus size={13} strokeWidth={2.4} />
                Another idea
              </button>
            </div>
          </Block>

          <Block label="How many carousels" hint={`${MIN_RUN} to ${MAX_RUN}. Each one takes a few seconds.`}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={MIN_RUN}
                max={MAX_RUN}
                value={count}
                onChange={(e) => setCount(clampRun(Number(e.target.value)))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-surface-4 accent-accent"
              />
              <span className="w-8 text-right font-mono text-body text-primary">{count}</span>
            </div>
            {real.length > 1 ? (
              <p className="mt-2 text-caption text-muted">
                {real.length} ideas, so about {Math.ceil(count / real.length)} carousels each, taking turns.
              </p>
            ) : null}
          </Block>

          <Block label="Framework">
            <select
              value={structure.id}
              onChange={(e) => setStructure(STRUCTURES.find((s) => s.id === e.target.value) ?? STRUCTURES[0]!)}
              className={field}
            >
              {STRUCTURES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Block>

          <Block label="Style" hint={`Pick one, or two to alternate. ${MAX_RUN_STYLES} at most.`}>
            <div className="flex flex-wrap gap-1.5">
              {styles.map((s) => {
                const on = picked.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setPicked((v) =>
                        on
                          ? v.length > 1 ? v.filter((x) => x !== s.id) : v
                          : v.length >= MAX_RUN_STYLES ? [v[1] ?? v[0]!, s.id] : [...v, s.id],
                      )
                    }
                    className={[
                      "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-caption",
                      on ? "border-accent bg-accent-wash text-accent" : "border-hairline text-tertiary hover:text-primary",
                    ].join(" ")}
                  >
                    <span className="block h-3 w-3 rounded-full" style={{ background: s.theme.bg }} />
                    {s.name}
                    {on ? <Check size={11} strokeWidth={3} /> : null}
                  </button>
                );
              })}
            </div>
          </Block>

          <Block label="Search depth">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-hairline bg-surface-1 p-3">
              <input
                type="checkbox"
                checked={deep}
                onChange={(e) => setDeep(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-body text-primary">Read the web first</span>
                <span className="mt-0.5 block text-caption leading-4 text-muted">
                  Searches each idea and builds the angles from what it finds, with sources. Slower,
                  and searches are billed on top of tokens. Without it the angles come from your own
                  words.
                </span>
              </span>
            </label>
          </Block>

          <Block label="Schedule them" hint="Off by default. A batch of carousels is useful on its own.">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={scheduling}
                onChange={(e) => setScheduling(e.target.checked)}
                className="h-3.5 w-3.5 accent-accent"
              />
              <span className="text-body text-primary">Put them in the pipeline with dates</span>
            </label>

            {scheduling ? (
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="text-caption text-tertiary">Starting</span>
                  <input
                    type="date"
                    value={startOn}
                    onChange={(e) => setStartOn(e.target.value)}
                    className={`${field} mt-1`}
                  />
                </label>
                <label className="block">
                  <span className="text-caption text-tertiary">Every</span>
                  <select
                    value={everyDays}
                    onChange={(e) => setEveryDays(Number(e.target.value))}
                    className={`${field} mt-1`}
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
                    className={`${field} mt-1`}
                  >
                    <option value="linkedin">LinkedIn</option>
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="x">X</option>
                  </select>
                </label>
              </div>
            ) : null}
          </Block>

          <button
            type="button"
            disabled={!ready}
            onClick={() => void go()}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-body-strong shadow-overlay hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
          >
            <Sparkles size={16} strokeWidth={2.5} />
            Make {clampRun(count)} carousels
          </button>
        </div>
      </Shell>
    );
  }

  /* ── running, and done ─────────────────────────────────────────────────── */

  const percent = runPercent(steps);
  const finished = steps.filter((s) => s.state === "done");
  const failed = steps.filter((s) => s.state === "failed");

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
              style={{ width: `${percent}%`, background: "var(--brand-gold)" }}
            />
          </div>
        </div>

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
                        ? "Waiting"
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

function Shell({
  title,
  note,
  onCancel,
  children,
}: {
  title: string;
  note: string;
  onCancel: () => void;
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
