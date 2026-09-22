/**
 * What worked, and what it had in common.
 *
 * Two ideas carry this file.
 *
 * The first is the BASELINE. An outlier is not "a big number", it is "a big number
 * for you" — 4,000 impressions is a triumph on a small account and a flop on a large
 * one. So everything here is a ratio against the median of your own recent posts.
 * Median, never mean: one genuinely viral post would drag a mean so far up that
 * nothing would ever clear the bar again, and the feature would quietly stop working
 * exactly when it got interesting.
 *
 * The second is ATTRIBUTION, and it is the part no other tool can copy. FlashCC knows
 * the structure of what went out — which framework, what shape of hook, how many
 * slides, which style — so it can group posts by those and compare. Canva does not
 * know your frameworks; a scheduler does not know your slides.
 *
 * Both ideas are easy to abuse, which is what the gates below are for. With four
 * posts, any pattern you find is noise, and a tool that says "Problem → Solution gets
 * you 3x" off four posts is not insightful, it is lying with confidence. Nothing is
 * reported unless the group clears MIN_GROUP and the whole set clears MIN_TOTAL, and
 * every finding carries its own n so the UI can never quote it without the caveat.
 */

import {
  engagementRate,
  engagements,
  isMeasured,
  objectiveLabel,
  type Metrics,
  type Post,
} from "./pipeline.js";
import { STRUCTURES } from "./structures.js";
import { styleById } from "./styles.js";

/* ── the metric under study ───────────────────────────────────────────── */

export type MetricKey = "impressions" | "engagements" | "rate" | "follows";

export const METRICS: { key: MetricKey; label: string; hint: string; percent?: boolean }[] = [
  { key: "impressions", label: "Reach", hint: "How many people saw it" },
  { key: "engagements", label: "Engagement", hint: "Likes, comments, shares and saves" },
  { key: "rate", label: "Engagement rate", hint: "Engagement as a share of reach", percent: true },
  { key: "follows", label: "Follows", hint: "New followers credited to the post" },
];

export const metricLabel = (k: MetricKey): string =>
  METRICS.find((m) => m.key === k)?.label ?? k;

export const isPercent = (k: MetricKey): boolean => METRICS.find((m) => m.key === k)?.percent === true;

function readMetric(m: Metrics, key: MetricKey): number {
  switch (key) {
    case "impressions":
      return m.impressions;
    case "engagements":
      return engagements(m);
    case "rate":
      return engagementRate(m);
    case "follows":
      return m.follows;
  }
}

/** Null for anything not live and measured, so callers cannot accidentally count it. */
export const valueOf = (p: Post, key: MetricKey): number | null =>
  isMeasured(p) ? readMetric(p.metrics, key) : null;

/* ── statistics ───────────────────────────────────────────────────────── */

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : ((s[mid - 1]! + s[mid]!) / 2);
}

/** How far apart two things are, as a symmetric multiple. 1 means identical. */
export const lift = (value: number, against: number): number =>
  against > 0 ? value / against : 0;

/* ── gates ────────────────────────────────────────────────────────────── */

/** Below this many posts in a group, a difference is noise and is not reported. */
export const MIN_GROUP = 3;
/** Below this many measured posts overall, there is no baseline worth having. */
export const MIN_TOTAL = 5;
/** At or above this multiple of your baseline, a post is an outlier. */
export const OUTLIER_AT = 2;
/** At or below this multiple, it underperformed. */
export const WEAK_AT = 0.5;
/** How many recent posts the baseline is drawn from. */
export const BASELINE_WINDOW = 20;

/**
 * Never let the UI quote a number without saying how thin the evidence is. The
 * wording is deliberately hedged at the low end — "early signal" invites another
 * post, "consistent" invites a decision.
 */
export const confidence = (n: number): "early" | "watching" | "consistent" =>
  n < 5 ? "early" : n < 10 ? "watching" : "consistent";

export const confidenceNote = (n: number): string =>
  ({ early: "Early signal", watching: "Worth watching", consistent: "Consistent" })[confidence(n)];

/* ── baseline ─────────────────────────────────────────────────────────── */

export type Baseline = {
  metric: MetricKey;
  /** The median of the window. Zero when there is nothing to measure. */
  value: number;
  /** How many measured posts went into it. */
  n: number;
  /** False until MIN_TOTAL is cleared; the UI must not draw conclusions before then. */
  ready: boolean;
};

export function baselineOf(posts: Post[], metric: MetricKey, window = BASELINE_WINDOW): Baseline {
  const live = posts
    .filter(isMeasured)
    .sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""))
    .slice(0, window);

  const values = live.map((p) => readMetric(p.metrics!, metric));
  return { metric, value: median(values), n: live.length, ready: live.length >= MIN_TOTAL };
}

/* ── scoring ──────────────────────────────────────────────────────────── */

export type Band = "outlier" | "strong" | "normal" | "weak";

export type Scored = {
  post: Post;
  value: number;
  /** Multiple of the baseline. 1 means dead average for this account. */
  ratio: number;
  band: Band;
};

export const bandOf = (ratio: number): Band =>
  ratio >= OUTLIER_AT ? "outlier" : ratio >= 1.25 ? "strong" : ratio <= WEAK_AT ? "weak" : "normal";

export function score(posts: Post[], metric: MetricKey, baseline?: Baseline): Scored[] {
  const base = baseline ?? baselineOf(posts, metric);
  return posts
    .filter(isMeasured)
    .map((post) => {
      const value = readMetric(post.metrics!, metric);
      const ratio = lift(value, base.value);
      return { post, value, ratio, band: bandOf(ratio) };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

export const outliers = (posts: Post[], metric: MetricKey, baseline?: Baseline): Scored[] =>
  score(posts, metric, baseline).filter((s) => s.band === "outlier");

/* ── the structural dimensions ────────────────────────────────────────── */

export type HookShape = "Question" | "Number" | "How-to" | "Statement";

/**
 * Four buckets, checked most-specific first. A hook that opens with a digit is a
 * listicle whether or not it also asks something; "How do you..." is a question
 * rather than a how-to, which is why the how-to test is anchored to the phrasings
 * that actually promise instructions.
 */
export function hookShape(hook: string): HookShape {
  const h = hook.trim();
  if (/^\d/.test(h)) return "Number";
  if (/^how (to|i|we|this|these)\b/i.test(h)) return "How-to";
  if (h.includes("?")) return "Question";
  if (/\b\d+\s+(ways|things|reasons|steps|lessons|mistakes|tips|rules|signs)\b/i.test(h)) return "Number";
  return "Statement";
}

export const lengthBand = (slides: number): string =>
  slides <= 5 ? "Short (up to 5)" : slides <= 8 ? "Medium (6 to 8)" : "Long (9+)";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const weekdayOf = (iso: string | null): string | null =>
  iso ? (WEEKDAYS[new Date(iso).getDay()] ?? null) : null;

const frameworkName = (id: string | null): string | null =>
  id ? (STRUCTURES.find((s) => s.id === id)?.name ?? id) : null;

export type Dimension = {
  id: string;
  label: string;
  /** The bucket this post falls in, or null when the post cannot answer. */
  of: (p: Post) => string | null;
};

export const DIMENSIONS: Dimension[] = [
  { id: "framework", label: "Framework", of: (p) => frameworkName(p.framework) },
  { id: "hook", label: "Hook shape", of: (p) => (p.hook.trim() ? hookShape(p.hook) : null) },
  { id: "length", label: "Length", of: (p) => (p.slideCount > 0 ? lengthBand(p.slideCount) : null) },
  { id: "style", label: "Style", of: (p) => (p.styleId ? styleById(p.styleId).name : null) },
  { id: "platform", label: "Platform", of: (p) => p.platform },
  // The two of the five new pipeline fields worth attributing. Campaign and
  // reviewer are proper nouns — grouping by them would produce one bucket per
  // post, which is a list rather than a finding.
  { id: "pillar", label: "Pillar", of: (p) => (p.pillar.trim() ? p.pillar.trim() : null) },
  { id: "objective", label: "Objective", of: (p) => objectiveLabel(p.objective) },
  { id: "weekday", label: "Day posted", of: (p) => weekdayOf(p.postedAt) },
];

export const dimensionById = (id: string): Dimension | undefined => DIMENSIONS.find((d) => d.id === id);

/* ── attribution ──────────────────────────────────────────────────────── */

export type Group = {
  dimension: string;
  dimensionLabel: string;
  value: string;
  n: number;
  median: number;
  /** Multiple of the overall median across every measured post. */
  lift: number;
};

/**
 * Every bucket of one dimension, including the thin ones — a table is allowed to show
 * a group of two as long as it also shows the two. `findings` is the filtered view
 * for anywhere the app speaks in sentences.
 */
export function groupBy(posts: Post[], dimension: Dimension, metric: MetricKey): Group[] {
  const live = posts.filter(isMeasured);
  const overall = median(live.map((p) => readMetric(p.metrics!, metric)));

  const buckets = new Map<string, number[]>();
  for (const p of live) {
    const key = dimension.of(p);
    if (key === null) continue;
    buckets.set(key, [...(buckets.get(key) ?? []), readMetric(p.metrics!, metric)]);
  }

  return [...buckets.entries()]
    .map(([value, values]) => ({
      dimension: dimension.id,
      dimensionLabel: dimension.label,
      value,
      n: values.length,
      median: median(values),
      lift: lift(median(values), overall),
    }))
    .sort((a, b) => b.lift - a.lift);
}

export type Finding = Group & {
  /** Above 1 it is working, below 1 it is not. Split out so the UI never has to guess. */
  direction: "up" | "down";
  note: string;
};

/**
 * The honest headlines: every dimension, every bucket big enough to mean something,
 * far enough from average to be worth saying out loud, strongest first.
 */
export function findings(posts: Post[], metric: MetricKey, minGroup = MIN_GROUP): Finding[] {
  const live = posts.filter(isMeasured);
  if (live.length < MIN_TOTAL) return [];

  return DIMENSIONS.flatMap((d) => groupBy(live, d, metric))
    .filter((g) => g.n >= minGroup && (g.lift >= 1.25 || g.lift <= 0.8) && g.lift > 0)
    .map((g) => ({
      ...g,
      direction: g.lift >= 1 ? ("up" as const) : ("down" as const),
      note: confidenceNote(g.n),
    }))
    .sort((a, b) => Math.abs(Math.log(b.lift)) - Math.abs(Math.log(a.lift)));
}

/**
 * What the outliers had in common that the rest did not.
 *
 * Deliberately compares outliers against everything else rather than against the
 * whole set: a trait shared by every post you have ever made explains nothing about
 * why five of them took off.
 */
export type Shared = { dimensionLabel: string; value: string; inOutliers: number; ofOutliers: number; rest: number };

export function whatOutliersShare(posts: Post[], metric: MetricKey, baseline?: Baseline): Shared[] {
  const live = posts.filter(isMeasured);
  const base = baseline ?? baselineOf(live, metric);
  const top = new Set(outliers(live, metric, base).map((s) => s.post.id));
  if (top.size === 0) return [];

  const rest = live.filter((p) => !top.has(p.id));
  const hits: Shared[] = [];

  for (const d of DIMENSIONS) {
    const counts = new Map<string, number>();
    for (const p of live) {
      if (!top.has(p.id)) continue;
      const key = d.of(p);
      if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    for (const [value, inOutliers] of counts) {
      const restShare = rest.length === 0 ? 0 : rest.filter((p) => d.of(p) === value).length / rest.length;
      const topShare = inOutliers / top.size;
      // Has to be common among the winners AND rarer among everything else.
      if (topShare >= 0.5 && topShare > restShare * 1.2) {
        hits.push({
          dimensionLabel: d.label,
          value,
          inOutliers,
          ofOutliers: top.size,
          rest: restShare,
        });
      }
    }
  }

  return hits.sort((a, b) => b.inOutliers / b.ofOutliers - a.inOutliers / a.ofOutliers);
}

/* ── totals for the header row ────────────────────────────────────────── */

export type Totals = {
  posts: number;
  measured: number;
  impressions: number;
  engagements: number;
  follows: number;
  rate: number;
};

export function totals(posts: Post[]): Totals {
  const live = posts.filter(isMeasured);
  const sum = (f: (m: Metrics) => number): number => live.reduce((t, p) => t + f(p.metrics!), 0);
  const impressions = sum((m) => m.impressions);
  const eng = sum(engagements);
  return {
    posts: posts.length,
    measured: live.length,
    impressions,
    engagements: eng,
    follows: sum((m) => m.follows),
    rate: impressions > 0 ? eng / impressions : 0,
  };
}

/* ── formatting ───────────────────────────────────────────────────────── */

export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export const percent = (x: number, dp = 1): string => `${(x * 100).toFixed(dp)}%`;

/** "2.4x" above average, "-38%" below. Reads the way a person would say it. */
export function liftLabel(x: number): string {
  if (x <= 0) return "n/a";
  return x >= 1 ? `${x.toFixed(x >= 10 ? 0 : 1)}x` : `-${Math.round((1 - x) * 100)}%`;
}

export const metricValueLabel = (v: number, key: MetricKey): string =>
  isPercent(key) ? percent(v) : compact(v);
