/**
 * Scheduler-shaped CSV.
 *
 * Eight of the nine bulk schedulers require publicly-hosted image URLs in their
 * CSV import, and not one of them provides the hosting. That gap is the most
 * cited friction in the whole research corpus, and the workaround people
 * describe is: upload every slide to WordPress, use a plugin to export the file
 * names and links, then paste the links into a spreadsheet by hand. FlashCC
 * already renders the slides. Hosting them and filling the row in is the whole
 * feature.
 *
 * THERE IS NO LINGUA FRANCA. The three tools that accept carousels disagree
 * fundamentally, and two of them are exact opposites:
 *
 *   Metricool      one column per image, `Picture Url 1`..`10`, and its template
 *                  warns in so many words not to put all the URLs in one cell.
 *   Publer         all the URLs in one cell, comma separated.
 *   ContentStudio  all the URLs in one cell, NEWLINE separated.
 *
 * So these are dialects, not options on one generic writer. A "universal" CSV
 * here would be a file that imports into nothing.
 *
 * ── On the column names ──────────────────────────────────────────────────────
 * Every header below is a claim about somebody else's product, and their
 * templates move. They are gathered in `SCHEDULERS` and nowhere else on purpose:
 * when a tool renames a column, exactly one line changes and every row follows.
 * Anything that does not match is ignored by these importers rather than
 * rejected, so a stale name costs one empty field, not a failed import.
 */

import type { PlatformId } from "./platforms.js";

export type SchedulerId = "metricool" | "publer" | "contentstudio";

/** One carousel, rendered and hosted, ready to become a row. */
export type PublishedCarousel = {
  id: string;
  name: string;
  caption: string;
  /** Public URLs, in slide order. */
  urls: string[];
  /** Per-slide alt text, in slide order. May be shorter than `urls`. */
  alts: string[];
  platform: PlatformId;
  /** ISO timestamp, or null for "no date, pick one in the tool". */
  scheduledFor: string | null;
  /** A PDF at a public URL, when one was published. Publer ingests these. */
  documentUrl?: string | undefined;
};

export type Scheduler = {
  id: SchedulerId;
  label: string;
  note: string;
  /** Rows per file, as the importer documents it. */
  maxRows: number;
  /** Images per post. Ten everywhere, because that is the API ceiling. */
  maxImages: number;
  acceptsAlt: boolean;
  columns: string[];
  row: (item: PublishedCarousel) => string[];
};

/* ── shared field shapes ──────────────────────────────────────────────────── */

/** Split so a tool with separate date and time columns gets both. */
export function splitWhen(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return { date: "", time: "" };

  const pad = (n: number) => String(n).padStart(2, "0");
  // Local time, not UTC. A scheduler's grid is in the user's own day, and a post
  // silently shifted by an hour because somewhere in the chain assumed Zulu is
  // the kind of bug that only surfaces after it has gone out.
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
}

const altFor = (item: PublishedCarousel, i: number): string => item.alts[i] ?? "";

/* ── the dialects ─────────────────────────────────────────────────────────── */

const PICTURE_COLUMNS = 10;

const metricoolNetwork = (platform: PlatformId): Record<string, string> => ({
  Instagram: platform === "instagram" ? "TRUE" : "FALSE",
  Linkedin: platform === "linkedin" ? "TRUE" : "FALSE",
  Tiktok: platform === "tiktok" ? "TRUE" : "FALSE",
});

const METRICOOL: Scheduler = {
  id: "metricool",
  label: "Metricool",
  note: "One column per slide. Its LinkedIn carousel switch builds the PDF from the image URLs for you, the only tool found anywhere that does.",
  maxRows: 500,
  maxImages: PICTURE_COLUMNS,
  acceptsAlt: true,
  columns: [
    "Text",
    "Date",
    "Time",
    "Instagram",
    "Linkedin",
    "Tiktok",
    ...Array.from({ length: PICTURE_COLUMNS }, (_, i) => `Picture Url ${i + 1}`),
    ...Array.from({ length: PICTURE_COLUMNS }, (_, i) => `Alt Text ${i + 1}`),
    // The most directly competitive capability found in the research: hand it
    // image URLs and it assembles the LinkedIn document post itself.
    "LinkedIn Images as Carousel",
  ],
  row: (item) => {
    const { date, time } = splitWhen(item.scheduledFor);
    const networks = metricoolNetwork(item.platform);
    const urls = item.urls.slice(0, PICTURE_COLUMNS);
    return [
      item.caption,
      date,
      time,
      networks.Instagram ?? "FALSE",
      networks.Linkedin ?? "FALSE",
      networks.Tiktok ?? "FALSE",
      ...Array.from({ length: PICTURE_COLUMNS }, (_, i) => urls[i] ?? ""),
      ...Array.from({ length: PICTURE_COLUMNS }, (_, i) => (urls[i] ? altFor(item, i) : "")),
      item.platform === "linkedin" ? "TRUE" : "FALSE",
    ];
  },
};

const PUBLER: Scheduler = {
  id: "publer",
  label: "Publer",
  note: "All the URLs in one cell, comma separated. Alt text in the same order, separated by two pipes.",
  maxRows: 500,
  maxImages: PICTURE_COLUMNS,
  acceptsAlt: true,
  columns: ["Type", "Date", "Time", "Content", "Media URLs", "Alt Texts", "Link", "Labels"],
  row: (item) => {
    const { date, time } = splitWhen(item.scheduledFor);
    const urls = item.urls.slice(0, PICTURE_COLUMNS);
    return [
      // `Post subtype` accepts PDF, so a LinkedIn deck can go as the finished
      // document rather than as ten pictures, which is the shape LinkedIn
      // wanted in the first place.
      item.documentUrl && item.platform === "linkedin" ? "pdf" : "carousel",
      date,
      time,
      item.caption,
      (item.documentUrl && item.platform === "linkedin" ? [item.documentUrl] : urls).join(","),
      urls.map((_, i) => altFor(item, i)).join("||"),
      "",
      item.name,
    ];
  },
};

const CONTENTSTUDIO: Scheduler = {
  id: "contentstudio",
  label: "ContentStudio",
  note: "All the URLs in one cell, newline separated. Its post type is a literal enum, so the platform has to be spelled its way.",
  maxRows: 500,
  maxImages: PICTURE_COLUMNS,
  acceptsAlt: false,
  columns: ["Post Type", "Date", "Time", "Content", "Media URLs", "Link", "Title", "Labels"],
  row: (item) => {
    const { date, time } = splitWhen(item.scheduledFor);
    return [
      contentStudioType(item.platform),
      date,
      time,
      item.caption,
      // A newline INSIDE a field, which is exactly why the writer below quotes
      // every cell rather than only the ones it thinks need it.
      item.urls.slice(0, PICTURE_COLUMNS).join("\n"),
      "",
      item.name,
      "",
    ];
  },
};

/** Its `Post Type` is a literal enum; anything else is rejected on import. */
function contentStudioType(platform: PlatformId): string {
  if (platform === "linkedin") return "LinkedIn Carousel";
  if (platform === "instagram") return "Instagram Carousel";
  return "Video";
}

export const SCHEDULERS: Scheduler[] = [METRICOOL, PUBLER, CONTENTSTUDIO];

export const schedulerById = (id: string): Scheduler =>
  SCHEDULERS.find((s) => s.id === id) ?? METRICOOL;

/* ── writing the file ─────────────────────────────────────────────────────── */

/**
 * RFC 4180, with every field quoted.
 *
 * Quoting unconditionally rather than only when a field contains a comma is a
 * deliberate choice for this writer: ContentStudio's own format puts newlines
 * inside a cell, captions routinely contain both commas and quotes, and a writer
 * that has to decide per field is a writer with an edge case in it. Every
 * importer reads a fully quoted file.
 */
export function toCsv(columns: readonly string[], rows: readonly (readonly string[])[]): string {
  const cell = (v: string): string => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const line = (values: readonly string[]): string => values.map(cell).join(",");
  // CRLF: Excel and Google Sheets both accept it, and one scheduler's importer
  // has been seen to swallow the last row of an LF-only file.
  return [line(columns), ...rows.map(line)].join("\r\n") + "\r\n";
}

export type SheetResult = {
  csv: string;
  filename: string;
  /** Anything the format could not carry, said out loud rather than dropped. */
  warnings: string[];
};

export function buildSheet(
  scheduler: Scheduler,
  items: readonly PublishedCarousel[],
): SheetResult {
  const warnings: string[] = [];

  const kept = items.slice(0, scheduler.maxRows);
  if (items.length > kept.length) {
    warnings.push(
      `${scheduler.label} takes ${scheduler.maxRows} rows per file. ${items.length - kept.length} were left out.`,
    );
  }

  for (const item of kept) {
    if (item.urls.length > scheduler.maxImages) {
      warnings.push(
        `"${item.name}" has ${item.urls.length} slides. No publishing API takes more than ${scheduler.maxImages}, so the rest were dropped from the row.`,
      );
    }
    if (item.urls.length === 0) {
      warnings.push(`"${item.name}" has no hosted slides, so its row has nothing to import.`);
    }
  }

  if (!scheduler.acceptsAlt && kept.some((i) => i.alts.some((a) => a.trim() !== ""))) {
    warnings.push(`${scheduler.label} has no alt text column, so the alt text was not included.`);
  }

  return {
    csv: toCsv(scheduler.columns, kept.map((i) => scheduler.row(i))),
    filename: `flashcc-${scheduler.id}-${new Date().toISOString().slice(0, 10)}.csv`,
    warnings,
  };
}

/**
 * Alt text for a slide, from the words already on it.
 *
 * Generated rather than asked for, because an alt field nobody fills is an
 * accessibility feature that does not exist. The headline of a slide IS its
 * description, that is what a carousel slide is, so the largest piece of text
 * is the honest answer and a better one than "Slide 3".
 */
export function altFromTexts(texts: readonly string[], index: number, total: number): string {
  const words = texts.map((t) => t.trim()).filter(Boolean).join(" ");
  const trimmed = words.length > 240 ? `${words.slice(0, 237)}...` : words;
  return trimmed || `Slide ${index + 1} of ${total}`;
}
