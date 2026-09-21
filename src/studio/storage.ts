import { averageColour } from "./gradient.js";
import type { Doc } from "./model.js";
import { markDeleted } from "./tombstones.js";

const INDEX = "flashcc:v3:index";
const KEY = (id: string) => `flashcc:v3:doc:${id}`;

export type DocSummary = {
  id: string;
  name: string;
  updatedAt: string;
  slideCount: number;
  background: string;
  width: number;
  height: number;
  group?: string | undefined;
};

export const UNGROUPED = "Ungrouped";

function read<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(k: string, v: unknown): boolean {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export function listDocs(): DocSummary[] {
  return (read<DocSummary[]>(INDEX) ?? []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadDoc(id: string): Doc | null {
  const d = read<Doc>(KEY(id));
  if (!d || d.version !== 3 || !Array.isArray(d.slides)) return null;
  // Projects saved before the media pool existed have no array.
  return { ...d, media: Array.isArray(d.media) ? d.media : [] };
}

/** One flat colour for the project card, even when the first slide is a ramp. */
function summaryColour(doc: Doc): string {
  const first = doc.slides[0];
  if (!first) return "#12161c";
  return first.gradient ? averageColour(first.gradient) : first.background;
}

/** An edit: stamps updatedAt, because the user just changed something. */
export function saveDoc(doc: Doc): boolean {
  return putDoc({ ...doc, updatedAt: new Date().toISOString() });
}

/**
 * A verbatim write. Sync applies remote records through here rather than through
 * saveDoc: restamping a record the moment it arrives would make the local copy
 * look newer than the server's, and the next merge would push it straight back
 * and win. The two sides would then take turns overwriting each other forever.
 */
export function putDoc(doc: Doc): boolean {
  const stamped = doc;
  const ok = write(KEY(doc.id), stamped);
  const summary: DocSummary = {
    id: stamped.id,
    name: stamped.name,
    updatedAt: stamped.updatedAt,
    slideCount: stamped.slides.length,
    background: summaryColour(stamped),
    width: stamped.width,
    height: stamped.height,
    ...(stamped.group ? { group: stamped.group } : {}),
  };
  const idx = read<DocSummary[]>(INDEX) ?? [];
  write(INDEX, [summary, ...idx.filter((d) => d.id !== stamped.id)]);
  return ok;
}

/** Every group in use, most recent first, with ungrouped last. */
export function listGroups(): string[] {
  const seen: string[] = [];
  for (const d of listDocs()) {
    const g = d.group ?? UNGROUPED;
    if (!seen.includes(g)) seen.push(g);
  }
  return seen.sort((a, b) => (a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : 0));
}

/** A full copy, including media and every slide. */
export function duplicateDoc(id: string): Doc | null {
  const src = loadDoc(id);
  if (!src) return null;
  const now = new Date().toISOString();
  const copy: Doc = {
    ...src,
    id: `d_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: `${src.name} copy`,
    createdAt: now,
    updatedAt: now,
  };
  saveDoc(copy);
  return copy;
}

export function setDocGroup(id: string, group: string | undefined): void {
  const doc = loadDoc(id);
  if (!doc) return;
  saveDoc(group ? { ...doc, group } : { ...doc, group: undefined });
}

/** The user threw it away: remembered, so the deletion reaches other devices. */
export function deleteDoc(id: string): void {
  dropDoc(id);
  // Recorded even with no account: signing in later has to carry the deletion up.
  markDeleted("doc", id);
}

/**
 * Removed without a tombstone. For the two cases that are not a deletion at all:
 * applying one the server already knows about, and clearing the machine on sign
 * out. Tombstoning either would push a delete back up for work that is still very
 * much alive on the account.
 */
export function dropDoc(id: string): void {
  try {
    localStorage.removeItem(KEY(id));
  } catch {
    /* ignore */
  }
  write(INDEX, (read<DocSummary[]>(INDEX) ?? []).filter((d) => d.id !== id));
}
