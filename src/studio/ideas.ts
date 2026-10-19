/**
 * The idea bank (27.1).
 *
 * **An idea is a post in the `idea` stage**, not a new kind of record. The
 * pipeline has had that stage since Batch 3 and a post already carries the
 * title, notes, pillar and client an idea needs; it already syncs and already
 * sits in the board's first column. Pairing an idea with a lane (27.3) is the
 * same record moving along, so "where did this carousel come from" is never a
 * join across two tables that drifted.
 *
 * **The bank is never filled by a model.** Running out of ideas was struck as a
 * pain point in the research; an idea generator would spend money on the one
 * step nobody struggles with. Everything here is typed by a person.
 *
 * **No tags are typed.** A capture takes the client already selected in the
 * rail and, optionally, one pillar chosen from the pillars that already exist.
 * Filtering is by those two, never by a vocabulary somebody has to remember.
 */
import { belongsTo, ALL_CLIENTS } from "./clients.js";
import type { Lane } from "./lanes.js";
import { listPosts, makePost, savePosts, type Post } from "./pipeline.js";

export type IdeaSource = "capture" | "board" | "phone" | "extension" | "import";

export const SOURCE_LABELS: Record<IdeaSource, string> = {
  capture: "Captured",
  board: "Board",
  phone: "Phone",
  extension: "Browser",
  import: "Imported",
};

export const sourceLabel = (s: string | undefined): string => SOURCE_LABELS[s as IdeaSource] ?? (s?.trim() || "Board");

/** An idea still waiting: in the idea stage, with no carousel yet. */
export const isIdea = (p: Post): boolean => p.stage === "idea" && !p.docId;

/** One line in, one idea out. Null for a line with nothing in it. */
export function makeIdea(
  line: string,
  opts: { notes?: string; pillar?: string; clientId?: string | undefined; source?: IdeaSource } = {},
): Post | null {
  const title = line.replace(/\s+/g, " ").trim();
  if (!title) return null;
  return makePost({
    title,
    stage: "idea",
    notes: opts.notes?.trim() ?? "",
    pillar: opts.pillar?.trim() ?? "",
    source: opts.source ?? "capture",
    ...(opts.clientId ? { clientId: opts.clientId } : {}),
  });
}

/** The bank, newest first. */
export const ideasOf = (posts: readonly Post[]): Post[] =>
  posts.filter(isIdea).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export type IdeaFilter = {
  /** "" is every pillar; `NO_PILLAR` is the ideas with none. */
  pillar: string;
  /** A client id, or `ALL_CLIENTS`/`UNASSIGNED` as the rail uses them. */
  client: string;
};

export const NO_PILLAR = "__none__";

export function filterIdeas(ideas: readonly Post[], f: IdeaFilter): Post[] {
  return ideas.filter(
    (p) =>
      belongsTo(p, f.client || ALL_CLIENTS) &&
      (f.pillar === "" || (f.pillar === NO_PILLAR ? p.pillar.trim() === "" : p.pillar.trim() === f.pillar)),
  );
}

/**
 * The pillars somebody already uses, from their posts and their lanes, most
 * used first. Trimmed and otherwise taken as written, like `mixOf`: "Behind
 * the scenes" and "behind-the-scenes" are two pillars, because guessing they
 * are one is how a filter starts hiding things.
 */
export function pillarsOf(posts: readonly Post[], lanes: readonly Pick<Lane, "pillar">[] = []): string[] {
  const counts = new Map<string, number>();
  for (const v of [...posts.map((p) => p.pillar), ...lanes.map((l) => l.pillar)]) {
    const k = v.trim();
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

/** Saves one idea at the front of the store. The capture dialog's whole write. */
export function captureIdea(line: string, opts: Parameters<typeof makeIdea>[1] = {}): Post | null {
  const idea = makeIdea(line, opts);
  if (!idea) return null;
  savePosts([idea, ...listPosts()]);
  announce();
  return idea;
}

/* ── the capture channel ──────────────────────────────────────────────────── */

/*
 * The shortcut works on every screen, and the screens are swapped rather than
 * nested (see gate.ts for the same problem), so opening the capture is a
 * module-level signal that `App` listens to. The studio's key handler and the
 * projects screen both reach it through `openCapture`.
 */
/** Words to open the capture with: a selection sent from the browser extension (31.4). */
export type CapturePrefill = { line: string; notes: string; source: IdeaSource };

const openers = new Set<(prefill?: CapturePrefill) => void>();
const changed = new Set<() => void>();

export function onCapture(listener: (prefill?: CapturePrefill) => void): () => void {
  openers.add(listener);
  return () => openers.delete(listener);
}

export function openCapture(prefill?: CapturePrefill): void {
  for (const l of openers) l(prefill);
}

/** Screens holding a copy of the posts re-read when an idea lands. */
export function onIdeasChanged(listener: () => void): () => void {
  changed.add(listener);
  return () => changed.delete(listener);
}

function announce(): void {
  for (const l of changed) l();
}
