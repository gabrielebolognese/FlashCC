/**
 * Lanes (27.2): a recurring slot in the week with its format already decided.
 *
 * "Plan formats and lanes ahead, not finished posts." A lane is that sentence
 * as an object: Monday, LinkedIn, Myth versus fact, the editorial pack, pillar
 * "Editing". Once the format is locked, a week is "swapping the content into a
 * template, not inventing a new thing weekly".
 *
 * A lane is a plan, not a record. Nothing about a post changes when its lane is
 * edited or deleted: the post copied what it needed when it was made, like
 * every other structural field on `Post`.
 */
import { uid } from "./model.js";
import { PLATFORMS, type Platform } from "./pipeline.js";
import { markDeleted } from "./tombstones.js";

/** How a lane's carousels look: a style, a style pack (25.6) or a saved template (25.5). */
export type Look = { kind: "style" | "pack" | "template"; id: string };

export type Lane = {
  id: string;
  /** Optional; the label is built from the fields when it is empty. */
  name: string;
  /** ISO weekday: 1 is Monday, 7 is Sunday. */
  weekday: number;
  /** Local wall-clock time, "HH:MM": "Mondays at nine" wherever the person is. */
  time: string;
  platform: Platform;
  /** A structure id (structures.ts). */
  framework: string;
  look: Look;
  pillar: string;
  clientId?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** JS `getDay` (0 is Sunday) to ISO (1 is Monday). */
export const isoWeekday = (d: Date): number => ((d.getDay() + 6) % 7) + 1;

export const weekdayName = (weekday: number): string => WEEKDAYS[(weekday - 1 + 7) % 7]!;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const validTime = (t: string): boolean => TIME.test(t);

export function makeLane(patch: Partial<Lane> & Pick<Lane, "framework" | "look">): Lane {
  const now = new Date().toISOString();
  return {
    id: uid("lane"),
    name: "",
    weekday: 1,
    time: "09:00",
    platform: "linkedin",
    pillar: "",
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

/** The date and time a lane lands on, on a given day: that day's local date at the lane's clock. */
export function laneAt(lane: Pick<Lane, "time">, day: Date): Date {
  const [h, m] = validTime(lane.time) ? lane.time.split(":").map(Number) : [9, 0];
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h ?? 9, m ?? 0, 0, 0);
}

/** The lanes that fall on a day, in clock order. */
export const lanesOn = (lanes: readonly Lane[], day: Date): Lane[] =>
  lanes.filter((l) => l.weekday === isoWeekday(day)).sort((a, b) => a.time.localeCompare(b.time));

/**
 * What a lane is called on screen: its own name, or its fields. `names` turns
 * ids into words; anything it does not know is shown as the id, never hidden.
 */
export function laneLabel(
  lane: Lane,
  names: { framework?: (id: string) => string | undefined; look?: (look: Look) => string | undefined } = {},
): string {
  if (lane.name.trim()) return lane.name.trim();
  const platform = PLATFORMS.find((p) => p.id === lane.platform)?.label ?? lane.platform;
  return [
    weekdayName(lane.weekday),
    platform,
    names.framework?.(lane.framework) ?? lane.framework,
    names.look?.(lane.look) ?? lane.look.id,
    lane.pillar.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ── storage ──────────────────────────────────────────────────────────────── */

const KEY = "flashcc.lanes";

export function listLanes(): Lane[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as Lane[]) : [];
  } catch {
    return [];
  }
}

export function saveLanes(lanes: Lane[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(lanes));
    return true;
  } catch {
    return false;
  }
}

export function upsertLane(lane: Lane): Lane[] {
  const next = { ...lane, updatedAt: new Date().toISOString() };
  const all = listLanes();
  const out = all.some((l) => l.id === lane.id) ? all.map((l) => (l.id === lane.id ? next : l)) : [...all, next];
  saveLanes(out);
  return out;
}

/** Through a tombstone, so the deletion reaches the account's other devices. */
export function removeLane(id: string): Lane[] {
  const out = listLanes().filter((l) => l.id !== id);
  saveLanes(out);
  markDeleted("lane", id);
  return out;
}

/* ── the row ──────────────────────────────────────────────────────────────── */

export type LaneRow = {
  user_id: string;
  id: string;
  name: string;
  weekday: number;
  at_time: string;
  platform: string;
  framework: string;
  look: Look;
  pillar: string;
  client_id: string | null;
  created_at: string;
  updated_at: string;
  server_updated_at?: string;
  deleted_at: string | null;
};

export const laneToRow = (lane: Lane, userId: string, deletedAt: string | null = null): LaneRow => ({
  user_id: userId,
  id: lane.id,
  name: lane.name,
  weekday: lane.weekday,
  at_time: lane.time,
  platform: lane.platform,
  framework: lane.framework,
  look: lane.look,
  pillar: lane.pillar,
  client_id: lane.clientId ?? null,
  created_at: lane.createdAt,
  updated_at: lane.updatedAt,
  deleted_at: deletedAt,
});

export const rowToLane = (row: LaneRow): Lane => ({
  id: row.id,
  name: row.name ?? "",
  weekday: row.weekday,
  time: row.at_time,
  platform: row.platform as Platform,
  framework: row.framework,
  look: row.look,
  pillar: row.pillar ?? "",
  ...(row.client_id ? { clientId: row.client_id } : {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
