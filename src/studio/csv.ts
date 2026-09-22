/**
 * Turning a spreadsheet into carousels.
 *
 * Two input shapes, and accepting both is the whole point.
 *
 * LONG is one row per slide, grouped by a post id. It gives variable slide count
 * for free — a six-slide idea and a twelve-slide idea sit in the same file — and
 * it is written in the order people actually draft, top to bottom.
 *
 * WIDE is one row per carousel with a column per slide. It is worse in every
 * structural way: it forces a fixed slide count, produces a sheet thirty columns
 * across that nobody can read, and leaves blanks to delete by hand in every
 * output. But it is what every tutorial in this category teaches, verbatim —
 * "each row becomes an entire carousel, each column is one placeholder" — so
 * assuming long format is self-evidently right would be assuming people have
 * been shown something they have not.
 *
 * So: accept wide, normalise to long, keep the good model inside.
 *
 * The parser is RFC-4180-ish by hand rather than a dependency. Quoted fields with
 * embedded commas and newlines are the only hard part, and a spreadsheet paste is
 * tab-separated, which most CSV libraries need configuring for anyway.
 */

import { nameFromHook } from "./search.js";

export type Row = Record<string, string>;
export type Shape = "long" | "wide" | "text";

export type ParsedCarousel = {
  /** Where it came from, for error reporting. Group value, or the row number. */
  key: string;
  name: string;
  /** The copy, one entry per slide, in order. */
  slides: string[];
};

/** Enough that a stray comma in prose cannot outvote a real tab. */
const DELIMITERS = ["\t", ",", ";", "|"] as const;

/**
 * Guesses the delimiter from the first line, outside quotes. A header row rarely
 * quotes anything, so line one is both the cheapest and the most reliable place
 * to look.
 *
 * A TAB WINS OUTRIGHT rather than on frequency. Prose is full of commas and
 * never contains tabs, so one tab is stronger evidence than three commas — and
 * a spreadsheet paste, which is the common real case, is always tab-separated.
 * Counting votes gets `post_id<TAB>text, with commas, here` wrong, which is
 * exactly the header a long-format sheet has.
 */
export function detectDelimiter(source: string): string {
  const firstLine = source.replace(/\r\n?/g, "\n").split("\n")[0] ?? "";

  const countOutsideQuotes = (d: string): number => {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < firstLine.length; i += 1) {
      const ch = firstLine[i];
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === d) count += 1;
    }
    return count;
  };

  if (countOutsideQuotes("\t") > 0) return "\t";

  let best = ",";
  let bestCount = 0;

  for (const d of DELIMITERS) {
    if (d === "\t") continue;
    const count = countOutsideQuotes(d);
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }

  return best;
}

/** Splits into cells, honouring quotes and the `""` escape inside them. */
export function parseDelimited(source: string, delimiter?: string): string[][] {
  const text = source.replace(/\r\n?/g, "\n");
  const d = delimiter ?? detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === d) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  row.push(cell);
  rows.push(row);

  // A trailing newline produces one empty row; so does a blank line anywhere.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const key = (header: string): string => header.trim().toLowerCase().replace(/[\s_-]+/g, "");

/* ── shape ────────────────────────────────────────────────────────────────── */

const GROUP_KEYS = ["postid", "post", "carousel", "carouselid", "group", "groupid", "id"];
const TEXT_KEYS = ["text", "slide", "copy", "content", "body", "headline"];
const ORDER_KEYS = ["slideindex", "index", "order", "slideno", "slidenumber", "n"];
const NAME_KEYS = ["name", "title", "filename"];

/** `slide 1`, `slide_2`, `Slide3` — the shape every bulk tutorial teaches. */
const wideSlideColumn = (header: string): number | null => {
  const m = /^slide[\s_-]?(\d+)$/i.exec(header.trim());
  return m?.[1] ? Number(m[1]) : null;
};

export function detectShape(headers: string[]): Shape {
  const keys = headers.map(key);

  const hasGroup = keys.some((k) => GROUP_KEYS.includes(k));
  const hasText = keys.some((k) => TEXT_KEYS.includes(k));
  if (hasGroup && hasText) return "long";

  if (headers.some((h) => wideSlideColumn(h) !== null)) return "wide";

  // A grouping column with no obvious text column is still long — the copy is
  // whatever else is on the row.
  if (hasGroup) return "long";

  return "wide";
}

const findKey = (headers: string[], candidates: string[]): string | null =>
  headers.find((h) => candidates.includes(key(h))) ?? null;

/* ── normalising ──────────────────────────────────────────────────────────── */

/**
 * Joins the text columns of one long-format row into one slide's copy.
 *
 * A headline and a body on the same row become two lines rather than one run-on
 * sentence, because that is what the composition splitter looks for.
 */
function slideText(row: Row, textCols: string[]): string {
  return textCols
    .map((c) => (row[c] ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

function fromLong(headers: string[], rows: Row[]): ParsedCarousel[] {
  const groupCol = findKey(headers, GROUP_KEYS) ?? headers[0] ?? "";
  const orderCol = findKey(headers, ORDER_KEYS);
  const nameCol = findKey(
    headers.filter((h) => h !== groupCol),
    NAME_KEYS,
  );

  // Everything that is not structural is copy. That way an unrecognised column
  // is included rather than silently dropped — losing a user's words is worse
  // than including one they did not mean.
  const structural = new Set([groupCol, orderCol, nameCol].filter(Boolean) as string[]);
  const textCols = headers.filter((h) => !structural.has(h));

  const groups = new Map<string, { name: string; items: { order: number; text: string }[] }>();

  rows.forEach((row, i) => {
    const group = (row[groupCol] ?? "").trim() || `Row ${i + 1}`;
    const text = slideText(row, textCols);
    if (!text) return;

    const order = orderCol ? Number((row[orderCol] ?? "").trim()) : Number.NaN;
    const entry = groups.get(group) ?? { name: "", items: [] };

    if (!entry.name && nameCol) entry.name = (row[nameCol] ?? "").trim();
    // NaN sorts last through the comparator below, which keeps file order for
    // rows that never declared one.
    entry.items.push({ order: Number.isFinite(order) ? order : i + 1000, text });
    groups.set(group, entry);
  });

  return [...groups.entries()].map(([group, entry]) => {
    const slides = entry.items.sort((a, b) => a.order - b.order).map((it) => it.text);
    return {
      key: group,
      name: entry.name || nameFromHook(slides[0] ?? ""),
      slides,
    };
  });
}

function fromWide(headers: string[], rows: Row[]): ParsedCarousel[] {
  const numbered = headers
    .map((h) => ({ header: h, n: wideSlideColumn(h) }))
    .filter((x): x is { header: string; n: number } => x.n !== null)
    .sort((a, b) => a.n - b.n)
    .map((x) => x.header);

  const nameCol = findKey(headers, NAME_KEYS);

  // Without `slide N` columns, every non-name column is a slide in file order —
  // which is what a table pasted straight out of a chat window looks like.
  const slideCols = numbered.length > 0 ? numbered : headers.filter((h) => h !== nameCol);

  return rows.map((row, i) => {
    // Trailing blanks are the whole reason a fixed-width sheet hurts: a
    // six-slide idea in a ten-column sheet leaves four empties. Dropping them
    // here is what gives variable slide count back.
    const slides = slideCols.map((c) => (row[c] ?? "").trim()).filter(Boolean);
    return {
      key: `Row ${i + 1}`,
      name: (nameCol ? (row[nameCol] ?? "").trim() : "") || nameFromHook(slides[0] ?? ""),
      slides,
    };
  });
}

/* ── the entry point ──────────────────────────────────────────────────────── */

export type ParseResult = {
  shape: Shape;
  headers: string[];
  carousels: ParsedCarousel[];
  /** Non-fatal notes worth showing before anyone generates 40 documents. */
  warnings: string[];
};

export function parseSheet(source: string): ParseResult {
  const grid = parseDelimited(source);
  const headerRow = grid[0];

  if (!headerRow || grid.length < 2) {
    return { shape: "text", headers: [], carousels: [], warnings: ["Nothing to read."] };
  }

  const headers = headerRow.map((h) => h.trim());
  const rows: Row[] = grid.slice(1).map((cells) => {
    const row: Row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });

  const shape = detectShape(headers);
  const carousels = (shape === "long" ? fromLong(headers, rows) : fromWide(headers, rows)).filter(
    (c) => c.slides.length > 0,
  );

  const warnings: string[] = [];
  if (carousels.length === 0) warnings.push("No rows had any text in them.");

  // The mis-mapping failure this exists to catch: a column landing on the wrong
  // field is invisible until review, so say what was read before anything runs.
  const empty = headers.filter((h) => rows.every((r) => (r[h] ?? "").trim() === ""));
  if (empty.length > 0) warnings.push(`Empty column${empty.length === 1 ? "" : "s"}: ${empty.join(", ")}`);

  const single = carousels.filter((c) => c.slides.length === 1);
  if (single.length > 0 && single.length === carousels.length && carousels.length > 1) {
    warnings.push(
      "Every carousel came out one slide long. If each row was meant to be a whole carousel, the columns may not be named `Slide 1`, `Slide 2` and so on.",
    );
  }

  return { shape, headers, carousels, warnings };
}

/** Does this look like a sheet at all, or is it the plain-text paste format? */
export const looksDelimited = (source: string): boolean => {
  const first = source.replace(/\r\n?/g, "\n").split("\n")[0] ?? "";
  return /\t/.test(first) || (first.includes(",") && first.split(",").length > 2);
};
