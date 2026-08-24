import { migrateBrandKit, migrateDocument } from "../doc/migrate.js";
import { blockText } from "../doc/parse.js";
import type { Template, TemplateSummary } from "../doc/template.js";
import { STARTERS } from "../doc/templates/starters.js";
import type { BrandKit, FlashCCDocument, ProjectSummary } from "../doc/types.js";

const INDEX_KEY = "flashcc:index";
const DOC_KEY = (id: string) => `flashcc:doc:${id}`;
const BRAND_KEY = "flashcc:brandkit:last";
const TPL_KEY = (id: string) => `flashcc:template:${id}`;
const TPL_INDEX_KEY = "flashcc:templates";
const TPL_LAST_KEY = "flashcc:template:last";

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Returns false on quota failure so the caller can surface a real signal. */
function safeWrite(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* ── projects ─────────────────────────────────────────────────────────── */

export function listProjects(): ProjectSummary[] {
  const index = safeRead<ProjectSummary[]>(INDEX_KEY) ?? [];
  return [...index].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadDocument(id: string): FlashCCDocument | null {
  return migrateDocument(safeRead<unknown>(DOC_KEY(id)));
}

export function saveDocument(doc: FlashCCDocument): boolean {
  const stamped: FlashCCDocument = { ...doc, updatedAt: new Date().toISOString() };
  const ok = safeWrite(DOC_KEY(doc.id), stamped);

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
    templateName: stamped.template.name,
  };

  const index = safeRead<ProjectSummary[]>(INDEX_KEY) ?? [];
  safeWrite(INDEX_KEY, [summary, ...index.filter((p) => p.id !== stamped.id)]);
  safeWrite(BRAND_KEY, stamped.brandKit);
  safeWrite(TPL_LAST_KEY, stamped.template.id);
  return ok;
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

export function lastBrandKit(): BrandKit | null {
  return migrateBrandKit(safeRead<unknown>(BRAND_KEY));
}

/* ── template library ─────────────────────────────────────────────────── */

/** Starters are code, not storage. The library is starters + whatever the user saved. */
export function listTemplates(): Template[] {
  const index = safeRead<TemplateSummary[]>(TPL_INDEX_KEY) ?? [];
  const user: Template[] = [];
  for (const entry of index) {
    const t = safeRead<Template>(TPL_KEY(entry.id));
    if (t && t.schema === 1) user.push(t);
  }
  return [...user, ...STARTERS];
}

export function loadTemplate(id: string): Template | null {
  const stored = safeRead<Template>(TPL_KEY(id));
  if (stored && stored.schema === 1) return stored;
  return STARTERS.find((t) => t.id === id) ?? null;
}

export function saveTemplate(template: Template): boolean {
  const ok = safeWrite(TPL_KEY(template.id), template);
  const index = safeRead<TemplateSummary[]>(TPL_INDEX_KEY) ?? [];
  const summary: TemplateSummary = {
    id: template.id,
    name: template.name,
    teaches: template.teaches,
    origin: template.origin,
    updatedAt: new Date().toISOString(),
  };
  safeWrite(TPL_INDEX_KEY, [summary, ...index.filter((t) => t.id !== template.id)]);
  return ok;
}

export function deleteTemplate(id: string): void {
  try {
    localStorage.removeItem(TPL_KEY(id));
  } catch {
    /* ignore */
  }
  const index = safeRead<TemplateSummary[]>(TPL_INDEX_KEY) ?? [];
  safeWrite(
    TPL_INDEX_KEY,
    index.filter((t) => t.id !== id),
  );
}

export function lastTemplateId(): string | null {
  return safeRead<string>(TPL_LAST_KEY);
}
