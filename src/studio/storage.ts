import { averageColour } from "./gradient.js";
import type { Doc } from "./model.js";
import { searchBlob } from "./search.js";
import { markDeleted } from "./tombstones.js";

const INDEX = "flashcc:v3:index";
const KEY = (id: string) => `flashcc:v3:doc:${id}`;
/** Bumped when a summary field is added, to trigger one rebuild from the docs. */
const INDEX_VERSION = "flashcc:v3:index-version";
const CURRENT_INDEX_VERSION = "2";

export type DocSummary = {
  id: string;
  name: string;
  updatedAt: string;
  slideCount: number;
  background: string;
  width: number;
  height: number;
  group?: string | undefined;
  /** Stamped once at generation. The facets read these; nobody types them. */
  framework?: string | undefined;
  styleId?: string | undefined;
  /** Out of the way rather than gone. Absent means active. */
  archived?: boolean | undefined;
  /**
   * Every searchable word in the document, flattened and lowercased.
   *
   * Denormalised on purpose. The alternative is parsing every stored document on
   * every keystroke, and a document carries its slides, its layers and its media
   * as base64 — so that would make search feel broken at exactly the volume where
   * search starts to matter.
   */
  search?: string | undefined;
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
  rebuildIndexOnce();
  return (read<DocSummary[]>(INDEX) ?? []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Backfills summaries written before search and facets existed.
 *
 * Without this, everything you made until today is invisible to the search box
 * and absent from every filter — which is the exact moment a new feature reads
 * as broken, because the work you most want to find is the oldest.
 *
 * Runs once. Reading every document is expensive and pointless to repeat, so a
 * version marker retires it.
 */
function rebuildIndexOnce(): void {
  try {
    if (localStorage.getItem(INDEX_VERSION) === CURRENT_INDEX_VERSION) return;
  } catch {
    return;
  }

  const stale = read<DocSummary[]>(INDEX) ?? [];
  const rebuilt = stale.map((entry) => {
    const doc = loadDoc(entry.id);
    return doc ? { ...entry, ...summaryOf(doc) } : entry;
  });

  write(INDEX, rebuilt);
  try {
    localStorage.setItem(INDEX_VERSION, CURRENT_INDEX_VERSION);
  } catch {
    /* A full quota just means it tries again next load. */
  }
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
/** Everything the project grid, the search box and the filters need. */
export function summaryOf(doc: Doc): DocSummary {
  return {
    id: doc.id,
    name: doc.name,
    updatedAt: doc.updatedAt,
    slideCount: doc.slides.length,
    background: summaryColour(doc),
    width: doc.width,
    height: doc.height,
    search: searchBlob(doc),
    ...(doc.group ? { group: doc.group } : {}),
    ...(doc.framework ? { framework: doc.framework } : {}),
    ...(doc.styleId ? { styleId: doc.styleId } : {}),
    ...(doc.archived ? { archived: true } : {}),
  };
}

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
  const summary = summaryOf(stamped);
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

/** Out of the way, not deleted. Composes with tombstones: this is an edit. */
export function setDocArchived(id: string, archived: boolean): void {
  const doc = loadDoc(id);
  if (!doc) return;
  saveDoc({ ...doc, archived: archived ? true : undefined });
}

export function renameDoc(id: string, name: string): void {
  const doc = loadDoc(id);
  if (!doc) return;
  const trimmed = name.trim();
  if (trimmed === "") return;
  saveDoc({ ...doc, name: trimmed });
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
