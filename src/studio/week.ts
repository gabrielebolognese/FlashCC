/**
 * Make next week (27.3): the lanes ahead as empty slots, the ideas a person
 * drops into them, and the run that turns each pairing into a carousel in its
 * lane's format, dated on its lane's day.
 *
 * Designed for the wall, not for the marketing number:
 *
 * - **Seven days, not thirty.** Content goes stale in about a week, and the
 *   evidence on month-ahead batching is that it fails.
 * - **The person pairs, the session never does.** A slot with no idea stays
 *   empty. Nothing here picks an idea, and nothing is dated that somebody did
 *   not put there (no silent calendar filling).
 * - **Reorderable while it runs, stoppable at any point.** The runner reads the
 *   queue afresh before every step, so a move made mid-run is the order it
 *   follows; a stop lets the step in hand finish and keeps everything done.
 *
 * The planning and the runner are pure (the runner takes its side effects as
 * arguments), so the done-when is a test: five lanes, five ideas, five
 * carousels; stop after the third, three carousels and two empty slots.
 */
import type { SlotFill } from "./ai.js";
import { dayKey } from "./calendar.js";
import { buildSlides, type BuildOptions } from "./compositions.js";
import { laneAt, lanesOn, type Lane } from "./lanes.js";
import { makeDoc, type Doc, type Identity } from "./model.js";
import type { Theme } from "./presets.js";
import { applyPack, PACK_PREFIX, packById, packIdOf, packTheme } from "./packs.js";
import { hookOf, shapeOf, type Post } from "./pipeline.js";
import { CANDIDATES, type Platform as Destination } from "./platforms.js";
import { nameFromHook } from "./search.js";
import { shapeFor, slotsFor, structureById, type Structure } from "./structures.js";
import { styleById, withStyleImage } from "./styles.js";
import { deckFromTemplate, type Template } from "./templates.js";

export const SESSION_DAYS = 7;

/* ── the slots ────────────────────────────────────────────────────────────── */

export type Slot = {
  /** `<lane id>@<day key>`: one lane on one day. */
  key: string;
  lane: Lane;
  when: Date;
  /** The local day, as `calendar.ts` keys it. */
  day: string;
  /** The post already in this slot, made by an earlier session or moved here by hand. */
  filled: Post | null;
};

const midnight = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Every lane's slot from now until this time `days` days on, in time order:
 * a slot that has already passed today cannot be made for, and next Sunday's
 * morning lane, seen on a Sunday afternoon, is inside the week. A slot holds
 * the post scheduled in that lane on that day, when there is one.
 */
export function slotsAhead(lanes: readonly Lane[], posts: readonly Post[], from: Date = new Date(), days = SESSION_DAYS): Slot[] {
  const start = midnight(from);
  // The same wall-clock time `days` days on, built from local parts so a clock
  // change inside the week does not move the edge by an hour.
  const end = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days, from.getHours(), from.getMinutes(), from.getSeconds());
  const out: Slot[] = [];
  for (let d = 0; d <= days; d += 1) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
    for (const lane of lanesOn(lanes, day)) {
      const when = laneAt(lane, day);
      if (when.getTime() <= from.getTime() || when.getTime() > end.getTime()) continue;
      const key = dayKey(day);
      const filled =
        posts.find((p) => p.lane === lane.id && p.scheduledFor && dayKey(new Date(p.scheduledFor)) === key) ?? null;
      out.push({ key: `${lane.id}@${key}`, lane, when, day: key, filled });
    }
  }
  return out.sort((a, b) => a.when.getTime() - b.when.getTime());
}

/* ── the queue ────────────────────────────────────────────────────────────── */

export type StepState = "waiting" | "running" | "done" | "failed";

export type SessionStep = {
  key: string;
  slot: Slot;
  idea: Post;
  state: StepState;
  docId?: string | undefined;
  error?: string | undefined;
};

/** Slot key to idea id: the choices the person made. Nothing else goes in. */
export type Pairing = Record<string, string>;

/**
 * The steps, in slot order: only open slots somebody paired, each idea once.
 * An idea paired twice goes to its earlier slot; the later one stays empty
 * rather than being given something else.
 */
export function sessionQueue(slots: readonly Slot[], pairing: Pairing, ideas: readonly Post[]): SessionStep[] {
  const used = new Set<string>();
  const out: SessionStep[] = [];
  for (const slot of slots) {
    if (slot.filled) continue;
    const idea = ideas.find((i) => i.id === pairing[slot.key]);
    if (!idea || used.has(idea.id)) continue;
    used.add(idea.id);
    out.push({ key: slot.key, slot, idea, state: "waiting" });
  }
  return out;
}

/**
 * One waiting step moved up or down among the waiting ones. Steps that have
 * started or finished stay where they are: the queue's past is not reorderable.
 */
export function moveStep(steps: readonly SessionStep[], key: string, delta: -1 | 1): SessionStep[] {
  const waiting = steps.filter((s) => s.state === "waiting");
  const at = waiting.findIndex((s) => s.key === key);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= waiting.length) return [...steps];
  const order = [...waiting];
  [order[at], order[to]] = [order[to]!, order[at]!];
  let k = 0;
  return steps.map((s) => (s.state === "waiting" ? order[k++]! : s));
}

/** A slot whose step was stopped, failed or never paired stays empty: only done steps fill one. */
export const emptyAfter = (slots: readonly Slot[], steps: readonly SessionStep[]): Slot[] =>
  slots.filter((s) => !s.filled && !steps.some((t) => t.key === s.key && t.state === "done"));

/* ── the run ──────────────────────────────────────────────────────────────── */

export type RunDeps = {
  /** Makes the carousel: drafts its words and lays them out in the lane's look. May throw. */
  make: (step: SessionStep) => Promise<Doc>;
  /** Saves it and moves the idea along. Called once per finished step. */
  land: (step: SessionStep, doc: Doc) => void;
  /** Read before every step: true stops the run, keeping what is done. */
  stopped: () => boolean;
  /** The queue as it stands now, so a reorder mid-run is the order followed. */
  read: () => SessionStep[];
  write: (steps: SessionStep[]) => void;
};

/**
 * One step at a time, the next waiting one each time. A failed step is marked
 * and the run goes on, the same bargain as Batch 16's run sheet: one rate limit
 * must not cost the other four carousels.
 */
export async function runSession(deps: RunDeps): Promise<SessionStep[]> {
  const patch = (key: string, fields: Partial<SessionStep>) =>
    deps.write(deps.read().map((s) => (s.key === key ? { ...s, ...fields } : s)));
  for (;;) {
    if (deps.stopped()) break;
    const next = deps.read().find((s) => s.state === "waiting");
    if (!next) break;
    patch(next.key, { state: "running" });
    try {
      const doc = await deps.make(next);
      deps.land(next, doc);
      patch(next.key, { state: "done", docId: doc.id });
    } catch (e) {
      patch(next.key, { state: "failed", error: e instanceof Error ? e.message : "This one failed" });
    }
  }
  return deps.read();
}

/**
 * The idea, moved along: its carousel attached, its lane's platform and date,
 * the structural snapshot every post takes. Its notes, source and pillar are
 * kept (the lane's pillar fills one it did not have). Drafting, not scheduled:
 * the finishing pass (27.4) ends on the schedule step, so a post only reads as
 * scheduled once somebody has finished it.
 */
export function landIdea(idea: Post, doc: Doc, slot: Slot): Post {
  const clientId = slot.lane.clientId ?? idea.clientId;
  return {
    ...idea,
    docId: doc.id,
    title: doc.name,
    stage: "drafting",
    platform: slot.lane.platform,
    framework: doc.framework ?? null,
    slideCount: doc.slides.length,
    hook: hookOf(doc),
    styleId: doc.styleId ?? null,
    pillar: idea.pillar.trim() || slot.lane.pillar,
    lane: slot.lane.id,
    shape: shapeOf(doc),
    scheduledFor: slot.when.toISOString(),
    ...(clientId ? { clientId } : {}),
    updatedAt: new Date().toISOString(),
  };
}

/* ── a carousel in a lane's format ────────────────────────────────────────── */

/** The structure a lane drafts to: its framework, the template's length when it has a template. */
export function laneStructure(lane: Lane, brief: string, template?: Template | undefined): Structure | undefined {
  const structure = structureById(template?.framework ?? lane.framework) ?? structureById(lane.framework);
  if (!structure) return undefined;
  const shape = shapeFor(structure, brief);
  const count = template ? template.slides.length : shape.count;
  return { ...structure, slots: slotsFor(structure, count, shape.rhythm) };
}

/**
 * The words when nobody is drafting: the framework's own example copy with the
 * idea on the cover. "Write it yourself", the way the app degrades when the
 * server has no key, and the finishing pass is where the words get written.
 */
export function ownWords(structure: Structure, idea: Pick<Post, "title">): { texts: string[]; roles: string[] } {
  const texts = structure.slots.map((s) => s.placeholder);
  if (texts.length > 0) texts[0] = idea.title;
  return { texts, roles: structure.slots.map((s) => s.id) };
}

/** A lane's look as a theme. */
export function lookTheme(lane: Lane, template?: Template | undefined): Theme {
  if (lane.look.kind === "pack") {
    const pack = packById(lane.look.id);
    if (pack) return packTheme(pack);
  }
  if (lane.look.kind === "template" && template?.styleId) {
    const pack = packById(packIdOf(template.styleId) ?? undefined);
    return pack ? packTheme(pack) : styleById(template.styleId).theme;
  }
  return styleById(lane.look.id).theme;
}

export const destinationOf = (lane: Lane): Destination | null => CANDIDATES.find((p) => p.id === lane.platform) ?? null;

/**
 * Drafted (or own) words laid out in the lane's format. Runs once, like every
 * preset: what comes back is an ordinary deck that remembers its framework,
 * its style or pack, and (for a template) `Doc.template`, nothing else.
 */
export function deckForLane(
  lane: Lane,
  words: { texts: string[]; roles: string[]; fills?: Record<string, SlotFill> | undefined },
  opts: { structure: Structure; template?: Template | undefined; identity?: Identity | undefined; build?: BuildOptions | undefined; clientId?: string | undefined },
): Doc {
  const theme = lookTheme(lane, opts.template);
  const platform = destinationOf(lane);
  const name = nameFromHook(words.texts[0] ?? "") || opts.structure.name;
  const owner = opts.clientId ? { clientId: opts.clientId } : {};

  if (lane.look.kind === "template" && opts.template) {
    const doc = deckFromTemplate(opts.template, { theme, identity: opts.identity, platform, texts: words.texts, name });
    return { ...doc, framework: opts.structure.id, ...owner };
  }

  const palette = [theme.bg, theme.fg, theme.accent, theme.muted, "#ffffff", "#000000", "#e5545a", "#3dbe7a", "#4c86d6", "#db2777"];
  const slides = buildSlides(words.texts, theme, words.roles, { ...opts.build, ...(words.fills ? { fills: words.fills } : {}) });

  if (lane.look.kind === "pack") {
    const pack = packById(lane.look.id);
    if (pack) {
      const base: Doc = { ...makeDoc(name), framework: opts.structure.id, palette, slides, ...owner };
      return { ...applyPack(base, pack, opts.identity, platform, theme), styleId: `${PACK_PREFIX}${pack.id}` };
    }
  }

  const style = styleById(lane.look.id);
  return {
    ...makeDoc(name),
    framework: opts.structure.id,
    styleId: style.id,
    palette,
    slides: withStyleImage(slides, style),
    ...owner,
  };
}

/* ── the week view (27.5) ─────────────────────────────────────────────────── */

/** The lanes on a day that nothing fills yet: drawn as labelled empty slots. */
export function openLanesOn(lanes: readonly Lane[], posts: readonly Post[], day: Date): Lane[] {
  const key = dayKey(day);
  return lanesOn(lanes, day).filter(
    (l) => !posts.some((p) => p.lane === l.id && p.scheduledFor && dayKey(new Date(p.scheduledFor)) === key),
  );
}

export const STALE_DAYS = 7;

/**
 * A draft untouched for a week is marked as possibly stale: a mark, not a
 * block, the same tier as Batch 15's flags, because a week-old draft is often
 * fine. Measured from the carousel's last edit when there is one, since that
 * is when somebody last worked on it, otherwise from when the post was made.
 */
export function isStale(post: Pick<Post, "stage" | "createdAt">, lastEdit: string | null | undefined, now: Date = new Date()): boolean {
  if (post.stage !== "drafting") return false;
  const since = new Date(lastEdit ?? post.createdAt).getTime();
  return Number.isFinite(since) && now.getTime() - since > STALE_DAYS * 24 * 3600_000;
}
