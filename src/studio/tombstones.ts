/**
 * A record of what was deleted, and when.
 *
 * Without this, sync has no way to tell "you never had this" apart from "this was
 * thrown away", and the two need opposite handling. Delete a project on your
 * laptop, open your phone, and the phone — which still has the row and no idea it
 * was removed — pushes it straight back up. The deletion undoes itself, and it
 * keeps undoing itself every time the two devices meet.
 *
 * A tombstone turns a deletion into an ordinary edit with a timestamp, so the same
 * last-write-wins rule settles it as it settles everything else.
 */

const KEY = "flashcc:v1:tombstones";

export type Kind = "doc" | "post" | "brand" | "asset";

export type Tombstone = {
  kind: Kind;
  id: string;
  deletedAt: string;
};

function read(): Tombstone[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as Tombstone[]) : [];
  } catch {
    return [];
  }
}

function write(list: Tombstone[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* A full quota must not stop a delete from happening. */
  }
}

export const listTombstones = (kind?: Kind): Tombstone[] =>
  kind ? read().filter((t) => t.kind === kind) : read();

/** Idempotent: re-deleting keeps the first time, which is the honest timestamp. */
export function markDeleted(kind: Kind, id: string, at = new Date().toISOString()): void {
  const list = read();
  if (list.some((t) => t.kind === kind && t.id === id)) return;
  write([...list, { kind, id, deletedAt: at }]);
}

/** Called once a deletion is safely on the server; until then it has to stay. */
export function clearTombstones(kind: Kind, ids: string[]): void {
  const gone = new Set(ids);
  write(read().filter((t) => !(t.kind === kind && gone.has(t.id))));
}

/** Signing out drops the local copy of everything, tombstones included. */
export function clearAllTombstones(): void {
  write([]);
}
