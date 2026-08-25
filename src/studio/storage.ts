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
};

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
  return d && d.version === 3 && Array.isArray(d.slides) ? d : null;
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
  };
  const idx = read<DocSummary[]>(INDEX) ?? [];
  write(INDEX, [summary, ...idx.filter((d) => d.id !== stamped.id)]);
  return ok;
}

export function deleteDoc(id: string): void {
  try {
    localStorage.removeItem(KEY(id));
  } catch {
    /* ignore */
  }
  write(INDEX, (read<DocSummary[]>(INDEX) ?? []).filter((d) => d.id !== id));
}
