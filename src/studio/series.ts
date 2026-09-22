/**
 * A series: several carousels that are one thing.
 *
 * This started life on the roadmap as a numbering-consistency feature. The
 * research says numbering is the least of it, and the three real problems are
 * these:
 *
 * **Discovery.** *"My Part 4 has 1M views but Part 1 has only 5K — because
 * viewers can't find it."* *"It's tiresome for the audience to look for other
 * parts in the profile section... So they just scroll to the next video."* There
 * is no cross-linking primitive on either platform, so the only fix available is
 * a block of text listing the parts — with real URLs for the ones already
 * posted — pasted into every part's caption. That is `seriesCaption`, and it is
 * the most valuable thing in this file.
 *
 * **Momentum.** *"the last thing you want is for a piece of content to finally go
 * viral, but then by the time you make the part two in the series, it's like a
 * month later and there's just no momentum anymore."* So `dueParts` reports which
 * series have a published part and an unpublished next one, and how stale that
 * has got.
 *
 * **Reconciliation.** *"scripts go into a single document, numbered 1-12"* while
 * the design lives somewhere else and nothing keeps them in step. So the part
 * number lives on the document, travels to the post, and `renumber` fixes the
 * drift in one pass rather than asking anyone to.
 *
 * Pure and DOM-free throughout. Everything here takes plain records, so it works
 * from a `DocSummary` in the project grid as readily as from a full `Doc`.
 */

import { uid } from "./model.js";
import type { Post } from "./pipeline.js";

/** Which series a carousel belongs to, and where in it. */
export type Series = {
  id: string;
  /** 1-based. Gaps and duplicates are survivable — see `renumber`. */
  part: number;
};

/** The minimum a carousel has to expose to take part. */
export type SeriesMember = {
  id: string;
  name: string;
  series?: Series | undefined;
};

export const newSeriesId = (): string => uid("s");

/* ── forming one ──────────────────────────────────────────────────────────── */

/**
 * Numbers a set of carousels 1..n in the order given.
 *
 * The order given is the caller's, not a sort: in the project grid that is the
 * order on screen, and after a long-form ingest it is the order the material ran
 * in. Guessing from names would get "Part 10" before "Part 2" and be wrong in the
 * one case it was reached for.
 */
export function makeSeries<T extends SeriesMember>(members: readonly T[], id = newSeriesId()): T[] {
  return members.map((m, i) => ({ ...m, series: { id, part: i + 1 } }));
}

/**
 * Closes gaps and breaks ties, in place order.
 *
 * Deleting part 3 of six leaves 1,2,4,5,6, and a caption reading "Part 4 of 5"
 * beside a list that stops at 5 is the kind of small wrongness that reads as
 * carelessness. Ties keep their relative order, so a duplicated part number
 * resolves predictably rather than by whichever record sorted first.
 */
export function renumber<T extends SeriesMember>(members: readonly T[]): T[] {
  const ordered = [...members]
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (a.m.series?.part ?? Infinity) - (b.m.series?.part ?? Infinity) || a.i - b.i);

  const id = ordered.find(({ m }) => m.series)?.m.series?.id ?? newSeriesId();
  const next = new Map<string, T>();
  ordered.forEach(({ m }, n) => next.set(m.id, { ...m, series: { id, part: n + 1 } }));

  // Returned in the caller's order, not the sorted one: this fixes numbers, it
  // does not rearrange anybody's grid.
  return members.map((m) => next.get(m.id) ?? m);
}

export const inSeries = <T extends SeriesMember>(members: readonly T[], id: string): T[] =>
  members.filter((m) => m.series?.id === id).sort((a, b) => (a.series?.part ?? 0) - (b.series?.part ?? 0));

export const nextPart = (members: readonly SeriesMember[], id: string): number =>
  members.reduce((n, m) => (m.series?.id === id ? Math.max(n, m.series.part) : n), 0) + 1;

/** Every distinct series id present, in first-appearance order. */
export function seriesIds(members: readonly SeriesMember[]): string[] {
  const seen: string[] = [];
  for (const m of members) {
    const id = m.series?.id;
    if (id && !seen.includes(id)) seen.push(id);
  }
  return seen;
}

/* ── looking at one ───────────────────────────────────────────────────────── */

export type SeriesPart = {
  docId: string;
  part: number;
  title: string;
  /** Where it went live, once it has. This is what makes a caption useful. */
  url: string | null;
  postedAt: string | null;
  scheduledFor: string | null;
};

export type SeriesView = {
  id: string;
  /** Taken from the lowest-numbered part, so a deleted part 1 does not blank it. */
  name: string;
  parts: SeriesPart[];
  posted: number;
};

/**
 * Joins carousels to whatever the pipeline knows about them.
 *
 * A post is matched by `docId`, and the most recently updated one wins when a
 * carousel has been queued twice — which happens, and silently picking the first
 * would show a stale URL.
 */
export function collectSeries(
  members: readonly SeriesMember[],
  posts: readonly Post[],
): SeriesView[] {
  const postFor = new Map<string, Post>();
  for (const p of posts) {
    if (!p.docId) continue;
    const held = postFor.get(p.docId);
    if (!held || p.updatedAt > held.updatedAt) postFor.set(p.docId, p);
  }

  return seriesIds(members).map((id) => {
    const parts: SeriesPart[] = inSeries(members, id).map((m) => {
      const post = postFor.get(m.id);
      return {
        docId: m.id,
        part: m.series?.part ?? 0,
        title: m.name,
        url: post?.url ?? null,
        postedAt: post?.postedAt ?? null,
        scheduledFor: post?.scheduledFor ?? null,
      };
    });

    return {
      id,
      name: parts[0]?.title ?? "Untitled series",
      parts,
      posted: parts.filter((p) => p.postedAt).length,
    };
  });
}

/* ── the discovery fix ────────────────────────────────────────────────────── */

export type CaptionOptions = {
  /** The part this caption belongs to, so it can mark itself. */
  current?: number | undefined;
  /** A line above the list. */
  heading?: string | undefined;
};

/**
 * The block that goes in every part's caption.
 *
 * Neither platform offers a way to link one post to another from inside a
 * carousel, so the caption is the only surface left. A part already live gets its
 * real URL; one that is not yet live is listed by name anyway — an audience that
 * can see part 5 is coming will wait for it, and a list that only shows the past
 * hides the reason to follow.
 *
 * The current part is marked rather than omitted, because a reader needs to know
 * where they are before they know where to go.
 */
export function seriesCaption(view: SeriesView, options: CaptionOptions = {}): string {
  if (view.parts.length === 0) return "";

  const total = view.parts.length;
  const lines = view.parts.map((p) => {
    const here = options.current === p.part ? " ← you are here" : "";
    const where = p.url ? `: ${p.url}` : p.postedAt ? "" : " (coming)";
    return `${p.part}/${total} ${p.title}${where}${here}`;
  });

  const heading = options.heading ?? `The whole series:`;
  return `${heading}\n${lines.join("\n")}`;
}

/** What the cross-reference slide says. Short, because it is one line on artwork. */
export function crossReferenceText(part: number, total: number): string {
  if (total <= 1) return "";
  if (part === 1) return `Part 1 of ${total} — the rest is in the caption`;
  if (part === total) return `Part ${part} of ${total} — parts 1–${total - 1} are in the caption`;
  return `Part ${part} of ${total} — the others are in the caption`;
}

/** "Name (2/5)", for a project card or a post title. */
export const seriesTitle = (name: string, part: number, total: number): string =>
  total > 1 ? `${name} (${part}/${total})` : name;

/* ── momentum ─────────────────────────────────────────────────────────────── */

/** Past this, the research says the audience has moved on. */
export const MOMENTUM_DAYS = 3;
export const STALE_DAYS = 10;

export type DuePart = {
  seriesId: string;
  seriesName: string;
  /** The part that should go out next. */
  part: SeriesPart;
  /** Days since the most recent part went live. */
  daysSince: number;
  stale: boolean;
};

const DAY_MS = 86_400_000;

/**
 * Which series are waiting on their next part, and for how long.
 *
 * Only series with something ALREADY LIVE qualify. A series nobody has published
 * yet is not losing momentum, it is unstarted, and nagging about it would make
 * this banner noise within a week — at which point it stops being read at all.
 *
 * A next part that is already scheduled is not due either. The decision has been
 * made; repeating it is not a reminder, it is a complaint.
 */
export function dueParts(views: readonly SeriesView[], at: Date = new Date()): DuePart[] {
  const out: DuePart[] = [];

  for (const view of views) {
    const live = view.parts.filter((p) => p.postedAt);
    if (live.length === 0) continue;

    const latest = live.reduce((a, b) => ((a.postedAt ?? "") > (b.postedAt ?? "") ? a : b));
    const next = view.parts.find((p) => p.part > latest.part && !p.postedAt && !p.scheduledFor);
    if (!next) continue;

    const since = new Date(latest.postedAt ?? 0).getTime();
    const daysSince = Math.max(0, Math.floor((at.getTime() - since) / DAY_MS));
    if (daysSince < MOMENTUM_DAYS) continue;

    out.push({
      seriesId: view.id,
      seriesName: view.name,
      part: next,
      daysSince,
      stale: daysSince >= STALE_DAYS,
    });
  }

  return out.sort((a, b) => b.daysSince - a.daysSince);
}

/* ── cadence ──────────────────────────────────────────────────────────────── */

/**
 * The question people ask out loud: *"Drop them all at once? One per day? Spread
 * them out more?"*
 *
 * There is no evidenced right answer, so this does not pretend to one — it offers
 * the three cadences people actually describe and lets the choice be made. What
 * it does guarantee is that whichever is chosen is applied consistently, which is
 * the part that goes wrong by hand.
 */
export const CADENCES = [
  { id: "daily", label: "One a day", days: 1, note: "Fastest. Best while a first part is still moving." },
  { id: "every-other", label: "Every other day", days: 2, note: "Room to breathe without losing the thread." },
  { id: "weekly", label: "One a week", days: 7, note: "A long series people come back for." },
] as const;

export type CadenceId = (typeof CADENCES)[number]["id"];

export const cadenceById = (id: string): (typeof CADENCES)[number] =>
  CADENCES.find((c) => c.id === id) ?? CADENCES[0];

/**
 * A date for each part, starting from `from`.
 *
 * The time of day is carried from `from` rather than reset, because whoever
 * picked 09:00 for part 1 meant it for the whole series. Parts already posted are
 * skipped — rescheduling the past is meaningless and would rewrite history in the
 * pipeline.
 */
export function spread(
  parts: readonly SeriesPart[],
  from: Date,
  cadence: CadenceId = "daily",
): { docId: string; scheduledFor: string }[] {
  const step = cadenceById(cadence).days;
  let slot = 0;

  return parts
    .filter((p) => !p.postedAt)
    .map((p) => {
      const when = new Date(from.getTime());
      when.setDate(when.getDate() + slot * step);
      slot += 1;
      return { docId: p.docId, scheduledFor: when.toISOString() };
    });
}
