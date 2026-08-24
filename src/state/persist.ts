import { blockText } from "../doc/parse.js";
import type { FlashCCDocument, ProjectSummary } from "../doc/types.js";

const INDEX_KEY = "flashcc:index";
const DOC_KEY = (id: string) => `flashcc:doc:${id}`;
const BRAND_KEY = "flashcc:brandkit:last";

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode — autosave is best-effort and silent (R15) */
  }
}

export function listProjects(): ProjectSummary[] {
  const index = safeRead<ProjectSummary[]>(INDEX_KEY) ?? [];
  return [...index].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadDocument(id: string): FlashCCDocument | null {
  const doc = safeRead<FlashCCDocument>(DOC_KEY(id));
  if (!doc || doc.version !== 1 || !Array.isArray(doc.slides)) return null;
  return doc;
}

export function saveDocument(doc: FlashCCDocument): void {
  const stamped: FlashCCDocument = { ...doc, updatedAt: new Date().toISOString() };
  safeWrite(DOC_KEY(doc.id), stamped);

  const first = stamped.slides[0];
  const preview = first ? first.blocks.map(blockText).join(" ").slice(0, 120) : "";
  const summary: ProjectSummary = {
    id: stamped.id,
    name: stamped.name,
    updatedAt: stamped.updatedAt,
    slideCount: stamped.slides.length,
    preview,
    accent: stamped.brandKit.palette.accent,
    background: stamped.brandKit.palette.background,
  };

  const index = safeRead<ProjectSummary[]>(INDEX_KEY) ?? [];
  const next = [summary, ...index.filter((p) => p.id !== stamped.id)];
  safeWrite(INDEX_KEY, next);
  safeWrite(BRAND_KEY, stamped.brandKit);
}

export function deleteProject(id: string): void {
  try {
    localStorage.removeItem(DOC_KEY(id));
  } catch {
    /* ignore */
  }
  const index = safeRead<ProjectSummary[]>(INDEX_KEY) ?? [];
  safeWrite(
    INDEX_KEY,
    index.filter((p) => p.id !== id),
  );
}

export function lastBrandKit(): FlashCCDocument["brandKit"] | null {
  return safeRead<FlashCCDocument["brandKit"]>(BRAND_KEY);
}
