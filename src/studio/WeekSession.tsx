/**
 * Make next week (27.3). The next seven days of lanes as slots; the person
 * drops an idea from the bank into each one they want; one button makes them.
 *
 * Each carousel takes its framework, its look and its platform from its lane
 * rather than from a cycling style list, and is dated on its lane's day. The
 * queue can be reordered while it runs and stopped at any point, keeping what
 * is done. A slot nobody paired stays empty: the session never picks an idea.
 *
 * Drafting is Batch 16's draft call. With no key on the server it degrades the
 * way the rest of the app does, to "write it yourself": the framework's own
 * example words with the idea on the cover, and the finishing pass is where the
 * words get written.
 */
import { ArrowDown, ArrowUp, CalendarRange, Check, CircleDashed, Loader2, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { alignToSlots, draftSlides, fillsFor } from "./ai.js";
import { contextVoice, listBrands } from "./brand.js";
import { Empty } from "./Dash.js";
import { ideasOf } from "./ideas.js";
import { frameworkName, lookName } from "./LaneList.js";
import { laneLabel, type Lane } from "./lanes.js";
import { saveDoc } from "./storage.js";
import type { Post } from "./pipeline.js";
import { listTemplates } from "./templates.js";
import {
  deckForLane,
  emptyAfter,
  landIdea,
  laneStructure,
  moveStep,
  ownWords,
  runSession,
  sessionQueue,
  slotsAhead,
  type Pairing,
  type SessionStep,
} from "./week.js";

/** The same ceiling as the run sheet's draft call: past this, something is wrong. */
const DRAFT_MS = 90_000;

const dayLabel = (d: Date): string =>
  d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) +
  " · " +
  d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function useDrafting(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : {}))
      .then((b: { draft?: boolean }) => live && setOk(Boolean(b.draft)))
      .catch(() => live && setOk(false));
    return () => {
      live = false;
    };
  }, []);
  return ok;
}

export function WeekSession({
  posts,
  lanes,
  clientId,
  onUpdate,
  onLanes,
  onFinish,
}: {
  /** Already filtered by the rail's client. */
  posts: Post[];
  lanes: Lane[];
  clientId: string | undefined;
  onUpdate: (fn: (all: Post[]) => Post[]) => void;
  onLanes: () => void;
  onFinish: () => void;
}) {
  const slots = useMemo(() => slotsAhead(lanes, posts), [lanes, posts]);
  const ideas = useMemo(() => ideasOf(posts), [posts]);
  const [pairing, setPairing] = useState<Pairing>({});
  const server = useDrafting();
  const [ai, setAi] = useState(true);
  const [steps, setSteps] = useState<SessionStep[] | null>(null);
  const [running, setRunning] = useState(false);
  const queue = useRef<SessionStep[]>([]);
  const stop = useRef(false);

  const write = (next: SessionStep[]) => {
    queue.current = next;
    setSteps(next);
  };

  const useAi = ai && server === true;
  const open = slots.filter((s) => !s.filled);
  const paired = sessionQueue(slots, pairing, ideas);
  const taken = new Set(Object.values(pairing));

  async function make(step: SessionStep) {
    const lane = step.slot.lane;
    const template = lane.look.kind === "template" ? listTemplates().find((t) => t.id === lane.look.id) : undefined;
    const brief = step.idea.notes.trim() ? `${step.idea.title}\n\n${step.idea.notes.trim()}` : step.idea.title;
    const structure = laneStructure(lane, brief, template);
    if (!structure) throw new Error(`This lane's framework (${lane.framework}) no longer exists`);
    let words: Parameters<typeof deckForLane>[1];
    if (useAi) {
      const drafted = await draftSlides(brief, structure, AbortSignal.timeout(DRAFT_MS), contextVoice(listBrands(), lane.clientId ?? clientId));
      words = { texts: alignToSlots(drafted.slides, structure), roles: structure.slots.map((s) => s.id), fills: fillsFor(drafted.slides, structure) };
    } else {
      words = ownWords(structure, step.idea);
    }
    const owner = lane.clientId ?? step.idea.clientId;
    return deckForLane(lane, words, { structure, template, ...(owner ? { clientId: owner } : {}) });
  }

  async function go(from: SessionStep[]) {
    stop.current = false;
    write(from);
    setRunning(true);
    await runSession({
      read: () => queue.current,
      write,
      stopped: () => stop.current,
      make,
      land: (step, doc) => {
        // Saved the moment it lands: stopping after the third keeps three.
        saveDoc(doc);
        onUpdate((all) => all.map((p) => (p.id === step.idea.id ? landIdea(p, doc, step.slot) : p)));
      },
    });
    setRunning(false);
  }

  if (lanes.length === 0) {
    return (
      <Empty
        icon={CalendarRange}
        title="No lanes to fill"
        body="A session fills next week's lanes with ideas from the bank. Set up a lane for each day you post first."
        action={
          <button
            type="button"
            onClick={onLanes}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className="flex h-8 items-center rounded-xl px-3.5 text-caption font-semibold"
          >
            Set up lanes
          </button>
        }
      />
    );
  }

  /* ── the run, and what it left ── */
  if (steps) {
    const done = steps.filter((s) => s.state === "done").length;
    const empty = emptyAfter(slots, steps).length;
    return (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-body-strong text-primary" data-testid="session-status">
            {running ? `Making ${steps.length} carousels` : `${done} made${empty ? `, ${empty} slot${empty === 1 ? "" : "s"} left empty` : ""}`}
          </span>
          <span className="flex-1" />
          {running ? (
            <button
              type="button"
              onClick={() => (stop.current = true)}
              className="flex h-8 items-center gap-1.5 rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent"
            >
              <Square size={12} strokeWidth={2.2} />
              Stop after this one
            </button>
          ) : (
            <>
              {steps.some((s) => s.state !== "done") ? (
                <button
                  type="button"
                  onClick={() => void go(steps.map((s) => (s.state === "done" ? s : { ...s, state: "waiting", error: undefined })))}
                  className="flex h-8 items-center rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent"
                >
                  Carry on with the rest
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSteps(null)}
                className="flex h-8 items-center rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent"
              >
                Back to the slots
              </button>
              {done > 0 ? (
                <button
                  type="button"
                  onClick={onFinish}
                  style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                  className="flex h-8 items-center rounded-xl px-3.5 text-caption font-semibold"
                >
                  Finish them
                </button>
              ) : null}
            </>
          )}
        </div>
        <ol className="flex flex-col gap-1.5">
          {steps.map((s) => (
            <li key={s.key} data-testid="session-step" className="flex items-center gap-2 rounded-2xl border border-hairline bg-surface-1 px-3 py-2">
              {s.state === "done" ? (
                <Check size={14} strokeWidth={2.2} className="text-accent" />
              ) : s.state === "running" ? (
                <Loader2 size={14} strokeWidth={2.2} className="animate-spin text-tertiary" />
              ) : s.state === "failed" ? (
                <X size={14} strokeWidth={2.2} className="text-tertiary" />
              ) : (
                <CircleDashed size={14} strokeWidth={2} className="text-muted" />
              )}
              <span className="w-[150px] shrink-0 text-caption text-tertiary">{dayLabel(s.slot.when)}</span>
              <span className="min-w-0 flex-1 truncate text-body text-primary">{s.idea.title}</span>
              <span className="max-w-[260px] truncate text-caption text-muted">
                {s.state === "failed" ? s.error : laneLabel(s.slot.lane, { framework: frameworkName, look: lookName })}
              </span>
              {s.state === "waiting" ? (
                <>
                  <button
                    type="button"
                    aria-label={`Move ${s.idea.title} earlier`}
                    onClick={() => write(moveStep(queue.current, s.key, -1))}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-primary"
                  >
                    <ArrowUp size={14} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${s.idea.title} later`}
                    onClick={() => write(moveStep(queue.current, s.key, 1))}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-primary"
                  >
                    <ArrowDown size={14} strokeWidth={2} />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  /* ── pairing ── */
  return (
    <div>
      <p className="mb-3 max-w-[760px] text-caption leading-5 text-tertiary">
        The next seven days of your lanes. Drop an idea into the slots you want made; a slot you leave empty stays empty.
        Each carousel takes its lane&rsquo;s framework, look and platform, and is dated on its lane&rsquo;s day.
      </p>
      {open.length === 0 ? (
        <p className="text-caption text-muted">Every slot in the next seven days already has a carousel.</p>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {slots.map((slot) => {
          // The lane's own pillar first: the bank already knows which ideas fit.
          const fits = [...ideas].sort((a, b) => Number(b.pillar === slot.lane.pillar && !!slot.lane.pillar) - Number(a.pillar === slot.lane.pillar && !!slot.lane.pillar));
          return (
            <li key={slot.key} data-testid="slot" className="flex items-center gap-2 rounded-2xl border border-hairline bg-surface-1 px-3 py-2">
              <span className="w-[150px] shrink-0 text-caption text-tertiary">{dayLabel(slot.when)}</span>
              <span className="min-w-0 flex-1 truncate text-caption text-secondary">
                {laneLabel(slot.lane, { framework: frameworkName, look: lookName })}
              </span>
              {slot.filled ? (
                <span className="max-w-[280px] truncate text-body text-primary">{slot.filled.title}</span>
              ) : (
                <select
                  aria-label={`Idea for ${dayLabel(slot.when)}`}
                  value={pairing[slot.key] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPairing((p) => {
                      const next = { ...p };
                      if (v) next[slot.key] = v;
                      else delete next[slot.key];
                      return next;
                    });
                  }}
                  className="h-7 w-[300px] rounded-md border border-edge bg-surface-2 px-1.5 text-body text-primary outline-none focus:border-accent-dim"
                >
                  <option value="">Leave empty</option>
                  {fits.map((i) => (
                    <option key={i.id} value={i.id} disabled={taken.has(i.id) && pairing[slot.key] !== i.id}>
                      {i.title}
                      {i.pillar ? ` (${i.pillar})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center gap-3">
        <label className="flex items-center gap-2 text-caption text-secondary">
          <input type="checkbox" checked={useAi} disabled={server !== true} onChange={(e) => setAi(e.target.checked)} />
          Draft the words
        </label>
        <span className="flex-1 text-caption text-muted">
          {server === false
            ? "No drafting on this server: each carousel starts from its framework's own words with your idea on the cover."
            : useAi
              ? "Drafted from each idea and its notes, in the lane's framework."
              : "Each carousel starts from its framework's own words with your idea on the cover."}
        </span>
        <button
          type="button"
          disabled={paired.length === 0}
          onClick={() => void go(paired)}
          style={paired.length ? { background: "var(--brand-gold)", color: "var(--on-brand-gold)" } : undefined}
          className="flex h-8 items-center rounded-xl px-3.5 text-caption font-semibold disabled:border disabled:border-hairline disabled:text-muted"
        >
          {paired.length ? `Make ${paired.length} carousel${paired.length === 1 ? "" : "s"}` : "Pair an idea with a slot"}
        </button>
      </div>
    </div>
  );
}
