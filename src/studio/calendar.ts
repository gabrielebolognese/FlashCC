/**
 * Dates as a grid, and what the grid says about a posting habit.
 *
 * Pure, and separate from the view, because calendar arithmetic is where this
 * kind of screen actually goes wrong: a month that starts on a Sunday, a week
 * that straddles two months, a February, a clock change. None of that needs a
 * DOM to get wrong, so none of it needs one to prove right.
 *
 * ── Local dates, deliberately ────────────────────────────────────────────────
 *
 * `scheduledFor` is a UTC instant, and a day on a calendar is a local thing.
 * Somebody in Rome posting at 09:00 on the 3rd wants it on the 3rd, not on the
 * 2nd because UTC had not caught up. Every key here is built from local parts
 * for that reason, which is also why the keys are strings rather than Dates: a
 * Date is a moment, and a square on a calendar is not.
 */
import { objectiveLabel, type Objective, type Post } from "./pipeline.js";

/** `2026-09-25`, from local parts. Not `toISOString`, which would shift the day. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Monday. Not Sunday.
 *
 * Every platform's "this week" and every content calendar in the research runs
 * Monday to Sunday, and a week that ends mid-weekend splits the two days people
 * actually schedule around.
 */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay is 0 for Sunday, so Sunday is six days after the Monday before it.
  const back = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - back);
  return out;
}

/**
 * Rebuilt from local parts rather than by adding milliseconds.
 *
 * Adding 24 hours of milliseconds is wrong twice a year: the day a clock goes
 * forward is 23 hours long, so "tomorrow at 9" arrives at 10. Setting the date
 * field leaves the local clock alone, which is what a calendar means by a day.
 * The clock is carried because a cadence preview has to agree with the slot the
 * run will actually save.
 */
export const addDays = (d: Date, n: number): Date => {
  const out = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  );
  out.setDate(out.getDate() + n);
  return out;
};

/**
 * Months are stepped by setting the day to 1 first.
 *
 * `setMonth` on the 31st of March lands in May, because April has no 31st and
 * the overflow rolls forward. Every calendar that jumps two months at a time has
 * this bug once.
 */
export const addMonths = (d: Date, n: number): Date => {
  const out = new Date(d.getFullYear(), d.getMonth(), 1);
  out.setMonth(out.getMonth() + n);
  return out;
};

export type Day = {
  date: Date;
  key: string;
  /** False for the leading and trailing days a month grid borrows. */
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
};

const build = (date: Date, month: number, today: Date): Day => ({
  date,
  key: dayKey(date),
  inMonth: date.getMonth() === month,
  isToday: dayKey(date) === dayKey(today),
  isPast: dayKey(date) < dayKey(today),
});

/** Seven days, Monday first. */
export function weekOf(anchor: Date, today: Date = new Date()): Day[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => build(addDays(start, i), anchor.getMonth(), today));
}

/**
 * Six weeks, always.
 *
 * A month needs five rows usually and six occasionally, and a grid that changes
 * height as you page through the year makes every button below it jump. Six is
 * the worst case, so six is always drawn.
 */
export function monthOf(anchor: Date, today: Date = new Date()): Day[][] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => build(addDays(start, w * 7 + d), anchor.getMonth(), today)),
  );
}

/**
 * The day a post belongs on, which is when it WENT if it went.
 *
 * `postedAt` first, because a post that slipped and went out on Thursday belongs
 * on Thursday even though its slot said Tuesday. The calendar is a record behind
 * today and a plan ahead of it, and that only works if the record is the truth.
 */
export const whenOf = (p: Post): string | null => p.postedAt ?? p.scheduledFor;

/** Posts, keyed by the local day they land on. Undated posts are not on the grid. */
export function byDay(posts: readonly Post[]): Map<string, Post[]> {
  const out = new Map<string, Post[]>();

  for (const p of posts) {
    const iso = whenOf(p);
    if (!iso) continue;
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) continue;

    const key = dayKey(when);
    out.set(key, [...(out.get(key) ?? []), p]);
  }

  // Within a day, earliest first, so a morning post reads above an evening one.
  for (const [key, list] of out) {
    out.set(
      key,
      [...list].sort((a, b) => (whenOf(a) ?? "").localeCompare(whenOf(b) ?? "")),
    );
  }

  return out;
}

/** Everything with no date at all: the shelf you drag from. */
export const undated = (posts: readonly Post[]): Post[] =>
  posts.filter((p) => whenOf(p) === null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

/* ── what the grid is telling you ─────────────────────────────────────────── */

export type Rhythm = {
  /** Scheduled in the range. */
  count: number;
  /** Days in the range with nothing on them, from today onward. */
  gaps: number;
  /** The longest run of empty days ahead, which is the thing worth fixing. */
  longestGap: number;
  /** How many distinct platforms, so a single-channel month is visible. */
  platforms: number;
};

/**
 * The numbers a posting habit is actually judged by.
 *
 * **Gaps are counted from today forward only.** A gap last Tuesday is not a
 * problem anybody can act on, and counting it makes the number grow every day
 * for reasons the person cannot change. What they can act on is the empty
 * stretch in front of them.
 */
export function rhythmOf(days: readonly Day[], posts: Map<string, Post[]>): Rhythm {
  let count = 0;
  let gaps = 0;
  let longestGap = 0;
  let run = 0;
  const platforms = new Set<string>();

  for (const day of days) {
    const on = posts.get(day.key) ?? [];
    count += on.length;
    for (const p of on) platforms.add(p.platform);

    if (day.isPast) continue;

    if (on.length === 0) {
      gaps += 1;
      run += 1;
      longestGap = Math.max(longestGap, run);
    } else {
      run = 0;
    }
  }

  return { count, gaps, longestGap, platforms: platforms.size };
}

/**
 * The dates a cadence would land on, without creating anything.
 *
 * So bulk create can show where a batch is going before it runs. The same
 * arithmetic the run itself uses, in one place, because two implementations of
 * "every 3 days from the 4th" will eventually disagree by a day and the only
 * symptom will be a calendar that does not match what got scheduled.
 */
export function cadenceDates(startISODate: string, everyDays: number, count: number): Date[] {
  const gap = Math.max(1, Math.round(everyDays));
  const [y, m, d] = startISODate.split("-").map(Number);
  if (!y || !m || !d) return [];

  const start = new Date(y, m - 1, d, 9, 0, 0);
  return Array.from({ length: Math.max(0, Math.round(count)) }, (_, i) => addDays(start, i * gap));
}

/**
 * The hour a slot defaults to.
 *
 * Nine, which is when people post, and a constant rather than midnight because a
 * post dated 00:00 reads as "the day before" to anybody in a timezone west of
 * the one it was created in.
 */
export const SLOT_HOUR = 9;

/** An ISO instant on `key`, at `SLOT_HOUR` local. */
export function slotOn(key: string, hour: number = SLOT_HOUR): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return new Date().toISOString();
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

/**
 * The same time of day, on a different day.
 *
 * What dragging a post across the grid means. Moving a 7pm post to Thursday and
 * having it come back as 9am would be the calendar quietly editing a decision
 * somebody made, so the clock is carried and only the date changes.
 */
export function atSameTimeOn(iso: string | null, key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return iso ?? new Date().toISOString();

  const from = iso ? new Date(iso) : null;
  const ok = from !== null && !Number.isNaN(from.getTime());
  return new Date(
    y,
    m - 1,
    d,
    ok ? from.getHours() : SLOT_HOUR,
    ok ? from.getMinutes() : 0,
    0,
  ).toISOString();
}

/**
 * How the week actually gets used, Monday first.
 *
 * Counted across scheduled AND posted, because the question it answers is "when
 * do I post", and a month of history says more about that than three future
 * slots do. Seven numbers, so a habit of only ever posting on Tuesday is
 * something the screen can point at rather than something somebody has to
 * notice.
 */
export function weekdayLoad(posts: readonly Post[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];

  for (const p of posts) {
    const iso = p.scheduledFor ?? p.postedAt;
    if (!iso) continue;
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) continue;

    const i = (when.getDay() + 6) % 7;
    out[i] = (out[i] ?? 0) + 1;
  }

  return out;
}

/* ── what the range is made of ────────────────────────────────── */

export type Mix = {
  /** Descending by count, then alphabetical so the order is stable. */
  pillars: { name: string; count: number }[];
  objectives: { id: Objective; label: string; count: number }[];
  /** Dated posts carrying neither a pillar nor an objective. */
  untagged: number;
};

/**
 * What a week or a month is actually made of, by pillar and by objective.
 *
 * This is the half of "what should I post" that a grid of dates cannot answer. A
 * full month with every square filled is still a problem if all thirty are the
 * same pillar, and the only way to see that is to count them.
 *
 * Pillars are free text, so they are counted by their trimmed value and nothing
 * is inferred: two spellings are two pillars, because guessing that "Behind the
 * scenes" and "behind-the-scenes" are one thing is how a count starts lying.
 */
export function mixOf(days: readonly Day[], posts: Map<string, Post[]>): Mix {
  const pillars = new Map<string, number>();
  const objectives = new Map<Objective, number>();
  let untagged = 0;

  for (const day of days) {
    for (const p of posts.get(day.key) ?? []) {
      const pillar = p.pillar.trim();
      if (pillar) pillars.set(pillar, (pillars.get(pillar) ?? 0) + 1);
      if (p.objective) objectives.set(p.objective, (objectives.get(p.objective) ?? 0) + 1);
      if (!pillar && !p.objective) untagged += 1;
    }
  }

  const rank = <T,>(m: Map<T, number>, name: (k: T) => string) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || name(a[0]).localeCompare(name(b[0])))
      .map(([k, count]) => ({ k, count }));

  return {
    pillars: rank(pillars, (k) => k).map(({ k, count }) => ({ name: k, count })),
    objectives: rank(objectives, (k) => objectiveLabel(k) ?? k).map(({ k, count }) => ({
      id: k,
      label: objectiveLabel(k) ?? k,
      count,
    })),
    untagged,
  };
}

/**
 * One sentence, or nothing.
 *
 * Deliberately at most one. A row of four warnings under a calendar is read as
 * decoration; a single line naming the biggest thing is read. The order below is
 * the order of how much it costs to be wrong about: an empty plan, then a gap,
 * then a range that is all one thing.
 *
 * Returns null rather than praise. A calendar that says "looking good" when it
 * has nothing to say trains people to stop reading the line.
 */
export function nudgeFor(r: Rhythm, mix: Mix): string | null {
  if (r.count === 0) return "Nothing on these days yet.";
  if (r.longestGap >= 4) return `${r.longestGap} empty days in a row ahead.`;

  const top = mix.pillars[0];
  if (top && mix.pillars.length === 1 && top.count >= 3) {
    return `Every one of these is ${top.name}.`;
  }

  if (r.count >= 4 && r.platforms === 1) return "All of them going to one place.";
  return null;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const monthLabel = (d: Date): string => `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;

export function weekLabel(anchor: Date): string {
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const left = `${start.getDate()} ${MONTH_NAMES[start.getMonth()]?.slice(0, 3)}`;
  const right = sameMonth
    ? `${end.getDate()}`
    : `${end.getDate()} ${MONTH_NAMES[end.getMonth()]?.slice(0, 3)}`;
  return `${left} to ${right}`;
}
