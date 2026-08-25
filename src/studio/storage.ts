import type { Doc } from "./model.js";

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

export function saveDoc(doc: Doc): boolean {
  const stamped = { ...doc, updatedAt: new Date().toISOString() };
  const ok = write(KEY(doc.id), stamped);
  const summary: DocSummary = {
    id: stamped.id,
    name: stamped.name,
    updatedAt: stamped.updatedAt,
    slideCount: stamped.slides.length,
    background: stamped.slides[0]?.background ?? "#12161c",
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

export function deleteDoc(id: string): void {
  try {
    localStorage.removeItem(KEY(id));
  } catch {
    /* ignore */
  }
  write(INDEX, (read<DocSummary[]>(INDEX) ?? []).filter((d) => d.id !== id));
}
