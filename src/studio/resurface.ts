/**
 * What already worked, brought back (28.2, 28.3). Pure.
 *
 * **Worth posting again** lists posts older than an age the person picks,
 * sorted by a metric the person picks. That is not ranking: the rule against
 * ranking is about a machine asserting which of somebody's sentences is
 * better. Here their own audience already said so, in numbers they brought,
 * and the column is theirs to choose.
 *
 * **Posted in one place only** lists posts that did well on one platform and
 * whose carousel never went out on another. Cross-posting what already worked
 * is the cheapest content anybody can make, and it is invisible until somebody
 * goes looking.
 *
 * **The staleness check** reads the copy and flags what time may have changed:
 * years, relative dates, prices, version numbers, and any other line with a
 * number in it. Flags, never edits: whether "2025" is still true is the
 * person's call.
 */
import { baselineOf, bandOf, type Band } from "./insights.js";
import type { Doc } from "./model.js";
import { isMeasured, PLATFORMS, postFromDoc, type Metrics, type Platform, type Post } from "./pipeline.js";

/* ── worth posting again ──────────────────────────────────────────────────── */

export type ResurfaceMetric = "saves" | "shares" | "impressions" | "comments" | "likes";

export const RESURFACE_METRICS: { id: ResurfaceMetric; label: string }[] = [
  { id: "saves", label: "Saves" },
  { id: "shares", label: "Shares" },
  { id: "impressions", label: "Reach" },
  { id: "comments", label: "Comments" },
  { id: "likes", label: "Likes" },
];

export const AGES: { months: number; label: string }[] = [
  { months: 2, label: "2 months" },
  { months: 4, label: "4 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "A year" },
];

export const DEFAULT_AGE_MONTHS = 4;

/** The date `months` before `now`, by the calendar, not by 30-day blocks. */
export function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), 1, now.getHours(), now.getMinutes());
  d.setMonth(d.getMonth() - months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(now.getDate(), last));
  return d;
}

/**
 * Measured posts that went out before the cut-off, the chosen metric highest
 * first. Ties keep the older post first, so a reorder never looks like a
 * judgement the numbers did not make.
 */
export function worthAgain(posts: readonly Post[], metric: ResurfaceMetric, months = DEFAULT_AGE_MONTHS, now = new Date()): Post[] {
  const cutoff = monthsBefore(now, months).toISOString();
  return posts
    .filter((p) => isMeasured(p) && p.postedAt! < cutoff)
    .sort((a, b) => b.metrics![metric as keyof Metrics] - a.metrics![metric as keyof Metrics] || a.postedAt!.localeCompare(b.postedAt!));
}

/* ── posted in one place only ─────────────────────────────────────────────── */

export type OnePlace = { post: Post; band: Band; missing: Platform[] };

/** Stages that mean "it went, or is going, out there". */
const OUT = new Set(["scheduled", "posted"]);

/**
 * Posts that did well (strong or an outlier against the person's own reach
 * baseline) whose carousel was never scheduled or posted anywhere else. Each
 * carries the platforms it has not been on. Nothing until the baseline is
 * ready: "did well" needs something to have done well against.
 */
export function onePlaceOnly(posts: readonly Post[]): OnePlace[] {
  const base = baselineOf([...posts], "impressions");
  if (!base.ready || base.value <= 0) return [];
  const out: OnePlace[] = [];
  for (const p of posts) {
    if (!isMeasured(p) || !p.docId) continue;
    const band = bandOf(p.metrics.impressions / base.value);
    if (band !== "outlier" && band !== "strong") continue;
    const elsewhere = new Set(
      posts.filter((q) => q.docId === p.docId && q.id !== p.id && OUT.has(q.stage)).map((q) => q.platform),
    );
    if ([...elsewhere].some((pl) => pl !== p.platform)) continue;
    out.push({ post: p, band, missing: PLATFORMS.map((x) => x.id).filter((id) => id !== p.platform) });
  }
  return out.sort((a, b) => b.post.metrics!.impressions - a.post.metrics!.impressions);
}

/* ── the staleness check ──────────────────────────────────────────────────── */

export type StaleKind = "year" | "relative" | "price" | "version" | "number";

export const STALE_LABELS: Record<StaleKind, string> = {
  year: "A year",
  relative: "A relative date",
  price: "A price",
  version: "A version number",
  number: "A number you may want to update",
};

const YEAR = /\b(19|20)\d{2}\b/;
const RELATIVE =
  /\b(today|tonight|tomorrow|yesterday|this (morning|week|weekend|month|quarter|year|season)|last (week|weekend|month|quarter|year)|next (week|weekend|month|quarter|year)|recently|right now|currently|these days|so far this year|just (launched|released|announced))\b/i;
const PRICE = /([$€£¥₹]\s?\d)|(\d\s?(usd|eur|gbp|dollars?|euros?|pounds?|bucks)\b)|(\/(mo|month|yr|year)\b)/i;
const VERSION = /\b(v\d+(\.\d+)*|(version|ios|ipados|macos|android|windows|chrome|node|python)\s?\d+(\.\d+)*|\d+\.\d+\.\d+)\b/i;
const DIGIT = /\d/;

export type StaleFlag = { slide: number; line: string; kinds: StaleKind[] };

/** The kinds a line trips, most specific first. A line with only "a number" is flagged as that. */
export function staleKinds(line: string): StaleKind[] {
  const kinds: StaleKind[] = [];
  if (YEAR.test(line)) kinds.push("year");
  if (RELATIVE.test(line)) kinds.push("relative");
  if (PRICE.test(line)) kinds.push("price");
  if (VERSION.test(line)) kinds.push("version");
  if (kinds.length === 0 && DIGIT.test(line)) kinds.push("number");
  return kinds;
}

/** Every line of every slide that time may have changed. `texts` is one entry per slide. */
export function stalenessFlags(texts: readonly string[]): StaleFlag[] {
  const out: StaleFlag[] = [];
  texts.forEach((t, i) => {
    for (const line of t.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const kinds = staleKinds(line);
      if (kinds.length) out.push({ slide: i + 1, line, kinds });
    }
  });
  return out;
}

/* ── repost as new ────────────────────────────────────────────────────────── */

/**
 * The carousel again, as a new deck: every slide kept, so the cover is the
 * thing to change (hook variants are one click away when it opens), and
 * `variantOf` pointing home. Not part of the source's series: the original is
 * still part 3, and two decks claiming to be part 3 would break the series.
 */
export function repostDoc(doc: Doc, id: string, now = new Date().toISOString()): Doc {
  const { series: _series, ...rest } = doc;
  return { ...rest, id, name: `${doc.name} (again)`, variantOf: doc.id, createdAt: now, updatedAt: now };
}

/** Its post: same platform, pillar and objective as the original, in drafting. */
export const repostPost = (source: Post, doc: Doc): Post => ({
  ...postFromDoc(doc, source.platform),
  stage: "drafting",
  pillar: source.pillar,
  objective: source.objective,
});
