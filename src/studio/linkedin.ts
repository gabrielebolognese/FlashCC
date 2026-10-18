/**
 * Reading LinkedIn's own analytics export, and getting the numbers onto posts.
 *
 * Manual metric entry is genuinely differentiated, nobody else asks for it, and
 * it is what makes the insight screens honest. It is also the churn risk: a
 * minute a post is fine for ten posts and unbearable for a year of them.
 * AuthoredUp's LinkedIn-archive backfill is one of the most-praised features in
 * the whole audit, and it is the only comparable thing in the market.
 *
 * ── The matching is the feature ──────────────────────────────────────────────
 *
 * LinkedIn's export carries no FlashCC id, so every row has to be matched on
 * what it does carry. Three passes, in descending confidence: the post URL, then
 * an exact title, then a close title within a date window. Anything that does
 * not match is RETURNED, not dropped, so the import screen can show it and let
 * somebody place it by hand.
 *
 * That last part is the difference between "it backfilled my year" and
 * "it imported 40 of 60 and I do not know which".
 *
 * ── The column names are a claim about somebody else's product ───────────────
 *
 * LinkedIn's export has changed shape at least twice and will again. Every alias
 * lives in `COLUMNS` and nowhere else, matching is case- and
 * punctuation-insensitive, and an unrecognised column is REPORTED rather than
 * silently ignored, so the failure mode is "we did not understand this column"
 * rather than a silently empty number.
 *
 * Pure and DOM-free. It reads text and returns records.
 */

import { parseDelimited } from "./csv.js";
import type { Metrics, Platform, Post } from "./pipeline.js";

/* ── which export (28.4) ──────────────────────────────────────────────────── */

export type ImportSource = "linkedin" | "instagram" | "tiktok";

/**
 * The three exports this reads. None of the three has been checked against a
 * current real file: LinkedIn's is D25, and Instagram's (Meta Business Suite,
 * Insights, Content, Export) and TikTok's (TikTok Studio, Analytics, Export)
 * could not be checked when this was written, with the third-party
 * descriptions disagreeing on the header names. So `verified` is null for all
 * three, and the import screen shows its reading of every column for the
 * person to correct before anything is written. That is what "verify the
 * columns" means for a file only the person has.
 */
export const IMPORT_SOURCES: {
  id: ImportSource;
  label: string;
  platform: Platform;
  howTo: string;
  /** When the column names were last checked against a real export, or null. */
  verified: string | null;
}[] = [
  {
    id: "linkedin",
    label: "LinkedIn",
    platform: "linkedin",
    howTo: "In LinkedIn, open your profile's Analytics, then Post impressions, and use Export.",
    verified: null,
  },
  {
    id: "instagram",
    label: "Instagram",
    platform: "instagram",
    howTo: "In Meta Business Suite, open Insights, then Content, use Export data, choose Instagram and Posts, and download the CSV.",
    verified: null,
  },
  {
    id: "tiktok",
    label: "TikTok",
    platform: "tiktok",
    howTo: "In TikTok Studio on a computer, open Analytics and use Export data. Choose the per-post (content) export, as CSV.",
    verified: null,
  },
];

export const importSource = (id: ImportSource) => IMPORT_SOURCES.find((s) => s.id === id)!;

/* ── what the columns are called ──────────────────────────────────────────── */

export type Field = keyof Metrics | "url" | "title" | "postedAt";

export const FIELD_LABELS: Record<Field, string> = {
  url: "Link",
  title: "Post text",
  postedAt: "Date posted",
  impressions: "Reach",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
  follows: "Follows",
  clicks: "Clicks",
};

/**
 * Header aliases, longest-lived first.
 *
 * Matched after stripping everything but letters and digits, so "Post URL",
 * "post_url" and "Post  URL " are one alias rather than three.
 */
const COLUMNS: { field: Field; aliases: string[] }[] = [
  { field: "url", aliases: ["posturl", "postlink", "url", "link", "permalink", "postid"] },
  {
    field: "title",
    aliases: ["posttitle", "title", "postcontent", "content", "postcopy", "text", "post"],
  },
  {
    field: "postedAt",
    aliases: ["postpublishdate", "publishdate", "createddate", "date", "datepublished", "postedon"],
  },
  { field: "impressions", aliases: ["impressions", "impressionsorganic", "views", "reach"] },
  { field: "likes", aliases: ["likes", "reactions", "reactionscount"] },
  { field: "comments", aliases: ["comments", "commentscount"] },
  { field: "shares", aliases: ["reposts", "shares", "repostscount", "sharescount"] },
  { field: "saves", aliases: ["saves", "saved", "bookmarks"] },
  { field: "follows", aliases: ["follows", "newfollowers", "followsgained", "followers"] },
  { field: "clicks", aliases: ["clicks", "clickscount", "linkclicks"] },
];

/**
 * What each export calls things, ahead of the shared list. Earlier is
 * preferred when a file has two candidates for one field: Instagram's file can
 * carry both "Views" and "Reach", and reach is what FlashCC calls reach.
 */
const SOURCE_COLUMNS: Record<ImportSource, Partial<Record<Field, string[]>>> = {
  linkedin: {},
  instagram: {
    url: ["permalink", "postlink", "link", "url"],
    title: ["description", "caption", "posttitle", "title"],
    postedAt: ["publishtime", "publishedtime", "posttime", "publishdate", "date"],
    impressions: ["reach", "accountsreached", "views", "impressions"],
    likes: ["likes", "reactions"],
    shares: ["shares", "reposts"],
    saves: ["saves", "saved"],
  },
  tiktok: {
    url: ["videolink", "link", "url", "permalink"],
    title: ["videotitle", "title", "videodescription", "caption", "description"],
    postedAt: ["posttime", "postdate", "createtime", "publishtime", "date"],
    impressions: ["videoviews", "totalviews", "views", "reach"],
    likes: ["totallikes", "likes"],
    comments: ["totalcomments", "comments"],
    shares: ["totalshares", "shares"],
    saves: ["favorites", "addtofavorites", "totalfavorites", "saves"],
  },
};

const key = (header: string): string => header.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The field a header means for this export, and how strongly (lower is a better alias). */
function aliasFor(header: string, source: ImportSource): { field: Field; rank: number } | null {
  const k = key(header);
  if (!k) return null;
  for (const [field, aliases] of Object.entries(SOURCE_COLUMNS[source]) as [Field, string[]][]) {
    const at = aliases.indexOf(k);
    if (at >= 0) return { field, rank: at };
  }
  for (const c of COLUMNS) {
    const at = c.aliases.indexOf(k);
    if (at >= 0) return { field: c.field, rank: 100 + at };
  }
  return null;
}

const fieldFor = (header: string, source: ImportSource = "linkedin"): Field | null => aliasFor(header, source)?.field ?? null;

/**
 * "1,234", "1 234", "12.5%", or a dash for nothing at all.
 *
 * A blank and an unparseable value both become null rather than 0, and the
 * difference matters: writing a zero where LinkedIn gave nothing would put a
 * fabricated number into the median every insight screen runs on.
 */
export function readNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "").replace(/%$/, "");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

/** Whatever date format this export happens to use, or null. */
export function readDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  // Unambiguous ISO first, before Date's own guessing gets a chance at it.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/* ── one row of the export ────────────────────────────────────────────────── */

export type AnalyticsRow = {
  /** Index in the file, so the UI can name a row somebody has to look at. */
  line: number;
  url: string | null;
  title: string;
  postedAt: string | null;
  /** Only the metrics the file actually carried. Absent is not zero. */
  metrics: Partial<Metrics>;
};

/** One column of the file as it was read: what it is called and which field it fills, if any. */
export type Column = { index: number; header: string; field: Field | null };

export type ParsedAnalytics = {
  rows: AnalyticsRow[];
  /** Every column, in file order, with the field it was read as. The import screen shows these and lets them be changed. */
  columns: Column[];
  /** Headers matched to a field, for "we read these". */
  understood: string[];
  /** Headers we did not recognise. Shown, never silently dropped. */
  ignored: string[];
  warnings: string[];
};

const METRIC_FIELDS: (keyof Metrics)[] = [
  "impressions",
  "likes",
  "comments",
  "shares",
  "saves",
  "follows",
  "clicks",
];

const isMetric = (f: Field): f is keyof Metrics => (METRIC_FIELDS as Field[]).includes(f);

/**
 * LinkedIn's export has a preamble before the real table.
 *
 * Their analytics download puts a title row and sometimes a blank row above the
 * headers, so the first line is not reliably the header line. This finds the
 * first row that looks like one, two or more recognised columns, rather than
 * assuming, because assuming produces a confident parse of the wrong row.
 */
function headerRowIndex(rows: string[][], source: ImportSource): number {
  for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
    const matched = (rows[i] ?? []).filter((cell) => fieldFor(cell, source) !== null).length;
    if (matched >= 2) return i;
  }
  return 0;
}

/**
 * `overrides` are the person's corrections, by column index: a field, or null
 * for "ignore this column". They win over anything recognised.
 */
export function parseAnalytics(
  source: string,
  from: ImportSource = "linkedin",
  overrides: Readonly<Record<number, Field | null>> = {},
): ParsedAnalytics {
  const table = parseDelimited(source);
  const warnings: string[] = [];

  if (table.length === 0) {
    return { rows: [], columns: [], understood: [], ignored: [], warnings: ["There is nothing in that file."] };
  }

  const headerAt = headerRowIndex(table, from);
  const headers = table[headerAt] ?? [];
  const understood: string[] = [];
  const ignored: string[] = [];

  // Recognised, then one column per field: the best alias wins, and a column
  // the person assigned wins over anything recognised.
  const guessed = headers.map((h, i) => (i in overrides ? null : aliasFor(h, from)));
  const best = new Map<Field, { index: number; rank: number }>();
  guessed.forEach((g, i) => {
    if (!g) return;
    const held = best.get(g.field);
    if (!held || g.rank < held.rank) best.set(g.field, { index: i, rank: g.rank });
  });
  const fields: (Field | null)[] = headers.map((h, i) => {
    const field = i in overrides ? (overrides[i] ?? null) : guessed[i] && best.get(guessed[i]!.field)?.index === i ? guessed[i]!.field : null;
    if (field) understood.push(h.trim());
    else if (h.trim()) ignored.push(h.trim());
    return field;
  });
  // A field the person assigned to one column is not also read from another.
  for (const [i, f] of Object.entries(overrides)) {
    if (!f) continue;
    fields.forEach((g, j) => {
      if (g === f && j !== Number(i)) fields[j] = null;
    });
  }
  const columns: Column[] = headers.map((h, i) => ({ index: i, header: h.trim(), field: fields[i] ?? null }));

  if (!fields.some((f) => f !== null && isMetric(f))) {
    warnings.push(
      "No columns of numbers were recognised. This looks like a different export, check it is the post analytics one.",
    );
  }
  if (!fields.includes("url") && !fields.includes("title")) {
    warnings.push("Nothing in this file identifies a post, so none of it can be matched.");
  }

  const rows: AnalyticsRow[] = [];

  for (let i = headerAt + 1; i < table.length; i += 1) {
    const cells = table[i] ?? [];
    if (cells.every((c) => !c.trim())) continue;

    let url: string | null = null;
    let title = "";
    let postedAt: string | null = null;
    const metrics: Partial<Metrics> = {};

    fields.forEach((field, col) => {
      if (!field) return;
      const raw = cells[col] ?? "";

      if (field === "url") url = raw.trim() || null;
      else if (field === "title") title = raw.trim();
      else if (field === "postedAt") postedAt = readDate(raw);
      else if (isMetric(field)) {
        const n = readNumber(raw);
        if (n !== null) metrics[field] = n;
      }
    });

    if (!url && !title) continue;
    rows.push({ line: i + 1, url, title, postedAt, metrics });
  }

  if (rows.length === 0 && warnings.length === 0) {
    warnings.push("The columns were understood but there were no rows under them.");
  }

  return { rows, columns, understood, ignored, warnings };
}

/* ── matching a row to a post ─────────────────────────────────────────────── */

/**
 * Strips what makes two links to the same post look different.
 *
 * LinkedIn appends tracking parameters and a trailing slash inconsistently, and
 * the same post copied from the app and from the web differs by both.
 */
export function normaliseUrl(url: string): string {
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[?#]/)[0]!
    .replace(/\/+$/, "");
}

/** Comparable text: case, punctuation and runs of whitespace all removed. */
export const normaliseTitle = (text: string): string =>
  text.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();

export type MatchHow = "url" | "title" | "near";

export type Match = { row: AnalyticsRow; postId: string; how: MatchHow };

export type MatchResult = {
  matches: Match[];
  /** Rows nothing claimed. Shown so they can be placed by hand. */
  unmatched: AnalyticsRow[];
};

/** How far apart a post's date and a row's date may be for a title-only match. */
export const NEAR_DAYS = 3;
const DAY_MS = 86_400_000;

const dayGap = (a: string, b: string): number =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY_MS;

/**
 * Three passes, in descending confidence, each consuming what it claims.
 *
 * A post already matched cannot be matched again, and a row already matched is
 * not offered to the next pass, otherwise a weaker rule would overwrite a
 * stronger one, and the numbers would land on the wrong post with no sign that
 * anything went wrong.
 *
 * The third pass is deliberately narrow: an exact normalised title AND a date
 * within a few days. A fuzzy title alone would match two posts from a series
 * that share an opening line, which is precisely the shape of thing this product
 * encourages people to make.
 */
export function matchRows(rows: readonly AnalyticsRow[], all: readonly Post[], platform?: Platform): MatchResult {
  // Only posts on the export's own platform (28.4). The same carousel posted to
  // LinkedIn and to Instagram has the same words, which is exactly what a
  // text match keys on, so without this Instagram's numbers could land on the
  // LinkedIn post.
  const posts = platform ? all.filter((p) => p.platform === platform) : all;
  const matches: Match[] = [];
  const takenPosts = new Set<string>();
  const takenRows = new Set<number>();

  const claim = (row: AnalyticsRow, post: Post, how: MatchHow) => {
    matches.push({ row, postId: post.id, how });
    takenPosts.add(post.id);
    takenRows.add(row.line);
  };

  const free = (p: Post) => !takenPosts.has(p.id);

  // 1. The URL. The only key either side agrees on by construction.
  const byUrl = new Map<string, Post>();
  for (const p of posts) {
    const k = p.url ? normaliseUrl(p.url) : "";
    if (k && !byUrl.has(k)) byUrl.set(k, p);
  }
  for (const row of rows) {
    const k = row.url ? normaliseUrl(row.url) : "";
    const post = k ? byUrl.get(k) : undefined;
    if (post && free(post)) claim(row, post, "url");
  }

  // 2. An exact title, against the post title and its hook, LinkedIn's export
  //    carries the post's own first line, which is usually the hook rather than
  //    whatever the carousel was named in here.
  for (const row of rows) {
    if (takenRows.has(row.line) || !row.title) continue;
    const want = normaliseTitle(row.title);
    if (!want) continue;

    const post = posts.find(
      (p) => free(p) && (normaliseTitle(p.title) === want || normaliseTitle(p.hook) === want),
    );
    if (post) claim(row, post, "title");
  }

  // 3. A leading-text match within a date window. Narrow on purpose.
  for (const row of rows) {
    if (takenRows.has(row.line) || !row.title || !row.postedAt) continue;
    const want = normaliseTitle(row.title);
    if (want.length < 12) continue;

    const post = posts.find((p) => {
      if (!free(p)) return false;
      const when = p.postedAt ?? p.scheduledFor;
      if (!when || dayGap(when, row.postedAt!) > NEAR_DAYS) return false;

      const hook = normaliseTitle(p.hook);
      const title = normaliseTitle(p.title);
      return (
        (hook.length >= 12 && (want.startsWith(hook) || hook.startsWith(want))) ||
        (title.length >= 12 && (want.startsWith(title) || title.startsWith(want)))
      );
    });
    if (post) claim(row, post, "near");
  }

  return { matches, unmatched: rows.filter((r) => !takenRows.has(r.line)) };
}

export const HOW_LABEL: Record<MatchHow, string> = {
  url: "matched on the link",
  title: "matched on the text",
  near: "matched on the text and the date",
};

/* ── writing it back ──────────────────────────────────────────────────────── */

export type ApplyResult = { posts: Post[]; changed: number; filled: number };

/**
 * Puts the numbers on, and moves the post to `posted` if it is not already.
 *
 * Only fields the file actually carried are written. A LinkedIn export has no
 * saves column, and overwriting a hand-entered saves count with a zero because
 * the file was silent about it would destroy exactly the data this feature
 * exists to protect.
 *
 * `postedAt` is filled from the export when the post does not have one, because
 * a post that has numbers has demonstrably gone out, but never overwritten,
 * since the local date is the one somebody entered deliberately.
 */
export function applyMatches(
  posts: readonly Post[],
  matches: readonly Match[],
  now = new Date().toISOString(),
): ApplyResult {
  const byPost = new Map(matches.map((m) => [m.postId, m]));
  let changed = 0;
  let filled = 0;

  const next = posts.map((post) => {
    const match = byPost.get(post.id);
    if (!match) return post;

    const before = post.metrics;
    const metrics: Metrics = {
      impressions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      follows: 0,
      clicks: 0,
      ...(before ?? {}),
      ...match.row.metrics,
    };

    filled += Object.keys(match.row.metrics).length;
    changed += 1;

    return {
      ...post,
      metrics,
      stage: post.stage === "posted" ? post.stage : ("posted" as const),
      postedAt: post.postedAt ?? (match.row.postedAt ? `${match.row.postedAt}T12:00:00.000Z` : now),
      ...(post.url || !match.row.url ? {} : { url: match.row.url }),
      updatedAt: now,
    };
  });

  return { posts: next, changed, filled };
}

/** A sample of the shape, for the empty state. Not a real export. */
export const SAMPLE_ANALYTICS = `Post URL,Post title,Post publish date,Impressions,Likes,Comments,Reposts,Clicks,Follows
https://www.linkedin.com/feed/update/urn:li:activity:1,Your videos feel boring. Here's why.,2026-09-01,12480,318,41,22,190,17
https://www.linkedin.com/feed/update/urn:li:activity:2,Five editing mistakes that cost you the swipe,2026-09-04,8210,207,19,14,96,6`;
