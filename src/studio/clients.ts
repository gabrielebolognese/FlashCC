/**
 * Clients.
 *
 * A client owns brands, assets, projects and posts. The agency tier has existed
 * in `profiles.plan` since billing shipped and has had nothing in it; this is
 * what goes in it.
 *
 * ── Two things the evidence demands at once ──────────────────────────────────
 *
 *   "I can separate each one so that nothing gets mixed"      (Gain, praise)
 *   "it was a downside to have to toggle back and forth between clients
 *    instead of seeing everything under one view"             (CoSchedule, complaint)
 *
 * So both. `ALL_CLIENTS` is a real, first-class selection — not an escape hatch
 * you reach when the filter is in your way — and it is the default, because the
 * roll-up is what somebody wants before they have decided which client they are
 * working on.
 *
 * ── A client is not a folder ─────────────────────────────────────────────────
 *
 * The roadmap said a client *replaces* the flat group string. It sits above it
 * instead. `group` is a folder — "March", "Launch" — and somebody with one
 * client still wants folders; Batch 6 also forms a series out of a group's
 * contents, so removing it would take that with it. A client is the owner; a
 * group is a drawer inside.
 *
 * ── Volume ───────────────────────────────────────────────────────────────────
 *
 * Solo operators cluster at 3–5 clients, small agencies at 15–50 profiles. The
 * research found nobody solo with double digits, so nothing here is designed for
 * thirty: a flat list, a switcher, no nesting and no search.
 *
 * Pure and DOM-free apart from the store at the bottom, which mirrors brand.ts.
 */

import type { Plan } from "./cloud.js";
import { uid } from "./model.js";
import { markDeleted } from "./tombstones.js";

export type Client = {
  id: string;
  name: string;
  /** For the rail dot. Assigned at creation so a list is scannable at a glance. */
  colour: string;
  /** The brand a review page wears. See review.ts — this is 7.5 in one field. */
  brandId?: string | undefined;
  /** Out of the way rather than gone, exactly as archiving a project works. */
  archived?: boolean | undefined;
  createdAt: string;
  updatedAt: string;
};

/** Anything a client can own. The shape is the same for docs, posts, brands and assets. */
export type Owned = { clientId?: string | undefined };

/**
 * The roll-up, as a value rather than as `undefined`.
 *
 * A sentinel so "show me everything" survives a round trip through a select
 * element and a URL, and so the code never has to decide whether a missing
 * client means "all" or "unassigned" — those are different answers.
 */
export const ALL_CLIENTS = "__all__";

/** Work that belongs to nobody in particular. Not an error; usually most of it. */
export const UNASSIGNED = "__none__";

/* ── tiers ────────────────────────────────────────────────────────────────── */

/**
 * The same ladder brands use, for the same reason: it is the one this market has
 * already proven, and a second shape would be a second thing to explain.
 *
 * Free is one because the feature has to be visible to be wanted, not because
 * one client is useful. Pro at five covers the solo operator the research found;
 * unlimited is what an agency is paying for.
 */
export const CLIENT_LIMIT: Record<Plan, number> = { free: 1, pro: 5, agency: Infinity };

export const clientLimit = (plan: Plan | undefined): number => CLIENT_LIMIT[plan ?? "free"];

export const canAddClient = (count: number, plan: Plan | undefined): boolean =>
  count < clientLimit(plan);

/* ── making one ───────────────────────────────────────────────────────────── */

/**
 * Enough hues to tell fifteen apart at a glance, chosen for contrast against the
 * app's dark chrome rather than for prettiness — a dot nobody can distinguish is
 * decoration.
 */
export const CLIENT_COLOURS = [
  "#e5a33d",
  "#4c86d6",
  "#3dbe7a",
  "#db2777",
  "#9b6ff0",
  "#e5545a",
  "#27b6c7",
  "#c08a4a",
];

export const colourFor = (index: number): string =>
  CLIENT_COLOURS[index % CLIENT_COLOURS.length] ?? CLIENT_COLOURS[0]!;

export function makeClient(name: string, index = 0): Client {
  const now = new Date().toISOString();
  return {
    id: uid("cl"),
    name: name.trim() || "Untitled client",
    colour: colourFor(index),
    createdAt: now,
    updatedAt: now,
  };
}

/* ── filtering ────────────────────────────────────────────────────────────── */

/**
 * Does this record belong in the current view?
 *
 * `ALL_CLIENTS` matches everything including unassigned work, which is the point
 * of the roll-up. `UNASSIGNED` matches only work with no client — a real bucket,
 * because most of anybody's library starts there and hiding it would make the
 * first client somebody creates appear to delete their projects.
 */
export function belongsTo(record: Owned, selected: string): boolean {
  if (selected === ALL_CLIENTS) return true;
  if (selected === UNASSIGNED) return !record.clientId;
  return record.clientId === selected;
}

export const forClient = <T extends Owned>(records: readonly T[], selected: string): T[] =>
  records.filter((r) => belongsTo(r, selected));

/** How much each client has, plus the unassigned pile. For the switcher's badges. */
export function countsByClient(records: readonly Owned[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of records) {
    const key = r.clientId ?? UNASSIGNED;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

export const clientById = (clients: readonly Client[], id: string | undefined): Client | undefined =>
  id ? clients.find((c) => c.id === id) : undefined;

/**
 * What to call the current selection.
 *
 * Named rather than inlined at four call sites, because "All clients" and
 * "Unassigned" have to read identically everywhere or the switcher and the page
 * title quietly disagree about what is on screen.
 */
export function labelFor(clients: readonly Client[], selected: string): string {
  if (selected === ALL_CLIENTS) return "All clients";
  if (selected === UNASSIGNED) return "Unassigned";
  return clientById(clients, selected)?.name ?? "All clients";
}

export const activeClients = (clients: readonly Client[]): Client[] =>
  clients.filter((c) => !c.archived);

/**
 * Moves a record between clients.
 *
 * Takes `undefined` to unassign, rather than deleting the key at the call site,
 * because `exactOptionalPropertyTypes` makes the difference between "absent" and
 * "explicitly undefined" load-bearing and getting it wrong is a silent no-op.
 */
export const assignTo = <T extends Owned>(record: T, clientId: string | undefined): T => ({
  ...record,
  clientId,
});

/* ── the store ────────────────────────────────────────────────────────────── */

/**
 * One key for the lot, as with brands: a handful of small records always read as
 * a set, so per-record keys would add a fan-out read and buy nothing.
 */
const KEY = "flashcc:v1:clients";

export function listClients(): Client[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as Client[]) : [];
  } catch {
    return [];
  }
}

export function saveClients(clients: Client[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(clients));
    return true;
  } catch {
    return false;
  }
}

export function upsertClient(client: Client): Client[] {
  const all = listClients();
  const i = all.findIndex((c) => c.id === client.id);
  const next = i === -1 ? [...all, client] : all.map((c) => (c.id === client.id ? client : c));
  saveClients(next);
  return next;
}

/**
 * Removing a client does NOT remove its work.
 *
 * Everything it owned becomes unassigned, which is recoverable, rather than
 * disappearing with it, which is not. An agency losing a client should lose a
 * label, not a year of carousels — and the alternative is the single most
 * frightening thing a tool like this can do.
 */
export function removeClient(id: string): Client[] {
  const next = listClients().filter((c) => c.id !== id);
  saveClients(next);
  markDeleted("client", id);
  return next;
}

/** The one somebody was last looking at, so a reload does not reset the view. */
const SELECTED = "flashcc:v1:client-selected";

export function loadSelectedClient(): string {
  try {
    return localStorage.getItem(SELECTED) ?? ALL_CLIENTS;
  } catch {
    return ALL_CLIENTS;
  }
}

export function saveSelectedClient(id: string): void {
  try {
    localStorage.setItem(SELECTED, id);
  } catch {
    /* A full quota costs a reset view, nothing more. */
  }
}
