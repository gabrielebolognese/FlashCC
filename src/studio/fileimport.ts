/**
 * Bringing drafts in from where they already live (Batch 31.4, 31.5). Pure.
 *
 * - **The extension's hand-off.** The browser extension opens the app with
 *   the words the person selected in the URL fragment, which no server ever
 *   receives: `#send=idea&text=...` or `#send=distil&text=...`. Read once and
 *   cleared, so a reload does not capture the same idea twice.
 * - **Ideas from a CSV** exported by the person from Notion, Airtable or a
 *   sheet. The column mapping is shown before anything is written (the 28.4
 *   rule). Pillars and clients are matched to ones that already exist and
 *   never created from a cell: nothing is typed as a tag (27.1), and an
 *   unknown value is named, not invented.
 * - **A Markdown or text file** into distil as it is, or into outline mode as
 *   an outline: headings become slides, paragraphs and list items their body.
 */
import { parseDelimited } from "./csv.js";

/* ── the extension's hand-off ─────────────────────────────────────────────── */

export type Handoff = { kind: "idea" | "distil"; text: string };

/** Ideas are a line; a source for distil is long, and capped where the server caps it (40,000). */
const HANDOFF_LIMIT = { idea: 2000, distil: 40_000 } as const;

export function readHandoff(hash: string): Handoff | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const kind = params.get("send");
  const text = (params.get("text") ?? "").trim();
  if ((kind !== "idea" && kind !== "distil") || !text) return null;
  return { kind, text: text.slice(0, HANDOFF_LIMIT[kind]) };
}

/** An idea from a selection: its first line is the idea, anything after it the notes. */
export function ideaFromSelection(text: string): { line: string; notes: string } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
  const first = lines.find(Boolean) ?? "";
  const line = first.length > 140 ? `${first.slice(0, first.lastIndexOf(" ", 140) > 60 ? first.lastIndexOf(" ", 140) : 140).trim()}…` : first;
  const notes = lines.join("\n").trim();
  return { line, notes: notes === line ? "" : notes };
}

/* ── ideas from a CSV ─────────────────────────────────────────────────────── */

export type IdeaField = "title" | "notes" | "pillar" | "client";

const ALIASES: Record<IdeaField, string[]> = {
  title: ["idea", "title", "name", "topic", "headline", "hook", "subject"],
  notes: ["notes", "note", "description", "details", "brief", "body", "angle"],
  pillar: ["pillar", "category", "theme", "tag", "tags", "bucket"],
  client: ["client", "account", "brand", "customer"],
};

export type IdeaMapping = Partial<Record<IdeaField, number>>;

/** Each field's column, by header, first match wins; the person can change any of them. */
export function mapIdeaColumns(headers: readonly string[]): IdeaMapping {
  const out: IdeaMapping = {};
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const field of Object.keys(ALIASES) as IdeaField[]) {
    const at = norm.findIndex((h, i) => ALIASES[field].includes(h) && !Object.values(out).includes(i));
    if (at >= 0) out[field] = at;
  }
  if (out.title === undefined && headers.length) out.title = 0;
  return out;
}

export type ImportedIdea = { title: string; notes: string; pillar: string; clientId?: string | undefined };

export type IdeaImport = {
  headers: string[];
  mapping: IdeaMapping;
  ideas: ImportedIdea[];
  /** Cells naming a pillar or a client that does not exist: left off, named here. */
  unknownPillars: string[];
  unknownClients: string[];
  /** Rows with no idea in them. */
  skipped: number;
};

export const MAX_IMPORT_IDEAS = 500;

export function importIdeas(
  source: string,
  existing: { pillars: readonly string[]; clients: readonly { id: string; name: string }[] },
  override?: IdeaMapping | undefined,
): IdeaImport {
  const rows = parseDelimited(source).filter((r) => r.some((c) => c.trim()));
  const headers = (rows[0] ?? []).map((h) => h.trim());
  const mapping = override ?? mapIdeaColumns(headers);
  const cell = (r: string[], f: IdeaField) => (mapping[f] === undefined ? "" : (r[mapping[f]!] ?? "").trim());
  const pillars = new Map(existing.pillars.map((p) => [p.toLowerCase(), p]));
  const clients = new Map(existing.clients.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const unknownPillars = new Set<string>();
  const unknownClients = new Set<string>();
  let skipped = 0;
  const ideas: ImportedIdea[] = [];
  for (const r of rows.slice(1)) {
    const title = cell(r, "title").replace(/\s+/g, " ");
    if (!title) {
      skipped += 1;
      continue;
    }
    const p = cell(r, "pillar");
    const pillar = p ? (pillars.get(p.toLowerCase()) ?? "") : "";
    if (p && !pillar) unknownPillars.add(p);
    const c = cell(r, "client");
    const clientId = c ? clients.get(c.toLowerCase()) : undefined;
    if (c && !clientId) unknownClients.add(c);
    ideas.push({ title, notes: cell(r, "notes"), pillar, ...(clientId ? { clientId } : {}) });
    if (ideas.length >= MAX_IMPORT_IDEAS) break;
  }
  return { headers, mapping, ideas, unknownPillars: [...unknownPillars], unknownClients: [...unknownClients], skipped };
}

/* ── a text or Markdown file ──────────────────────────────────────────────── */

export const TEXT_FILES = ".md,.markdown,.txt,text/plain,text/markdown";
export const MAX_FILE_BYTES = 2_000_000;

/** Front matter and HTML comments are not words anyone wants on a slide. */
const clean = (text: string): string =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/<!--[\s\S]*?-->/g, "");

/**
 * A file as an outline (24.1): a heading of any level starts a slide; list
 * items and paragraphs are its body, one line each. A file with no headings
 * gives each paragraph a slide, its first sentence the headline.
 */
export function outlineFromText(source: string): string {
  const text = clean(source);
  const lines = text.split("\n");
  const headed = lines.some((l) => /^#{1,6}\s+\S/.test(l));
  const out: string[] = [];
  if (headed) {
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) continue;
      const h = l.match(/^#{1,6}\s+(.*)$/);
      if (h) out.push(`# ${h[1]!.trim()}`);
      else out.push(l.replace(/^([-*+]|\d+[.)])\s+/, "").replace(/^>\s?/, ""));
    }
    return out.join("\n");
  }
  for (const para of text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean)) {
    const m = para.match(/^(.+?[.!?。！？])\s+(.+)$/);
    out.push(m ? `# ${m[1]}\n${m[2]}` : `# ${para}`);
  }
  return out.join("\n");
}

/** A file's words, for distil: as they are, front matter and comments gone. */
export const sourceFromText = (source: string): string => clean(source).trim();
