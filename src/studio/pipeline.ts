/**
 * A post is a carousel on its way to a platform, and once it lands, the record of how
 * it did.
 *
 * This is deliberately NOT the document. A Doc is the artwork; a Post is one
 * publication of it, so the same carousel can go to LinkedIn on Tuesday and Instagram
 * on Friday as two records carrying two sets of numbers.
 *
 * The load-bearing fields are the structural ones — framework, hook, slideCount,
 * styleId. They are COPIED off the document when the post is created rather than
 * looked up through docId later, because the document keeps being edited and the
 * thing that earned the numbers is the version that actually went out. That snapshot
 * is what lets analytics say "your Problem → Solution carousels outperform", which a
 * generic scheduler can never do because it only ever sees a file.
 */

import { uid, type Doc } from "./model.js";
import { markDeleted } from "./tombstones.js";

/* ── stages ───────────────────────────────────────────────────────────── */

export type Stage = "idea" | "drafting" | "ready" | "scheduled" | "posted";

/**
 * What a post is FOR.
 *
 * Closed, because this is the one of the five new fields that analytics groups
 * by and an open set turns every typo into its own bucket. Four values, which is
 * the set every content calendar in the research converges on under different
 * names — deliberately not five, because "brand" and "authority" are the same
 * answer and offering both means the data splits across them.
 */
export type Objective = "awareness" | "engagement" | "authority" | "conversion";

export const OBJECTIVES: { id: Objective; label: string; hint: string }[] = [
  { id: "awareness", label: "Awareness", hint: "Reach people who do not know you" },
  { id: "engagement", label: "Engagement", hint: "Get a conversation going" },
  { id: "authority", label: "Authority", hint: "Be the one who explains it properly" },
  { id: "conversion", label: "Conversion", hint: "Ask for the click, the reply, the booking" },
];

export const objectiveLabel = (o: Objective | null): string | null =>
  o ? (OBJECTIVES.find((x) => x.id === o)?.label ?? null) : null;

export const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: "idea", label: "Idea", hint: "A thought, not a carousel yet" },
  { id: "drafting", label: "Drafting", hint: "Being written or designed" },
  { id: "ready", label: "Ready", hint: "Finished, waiting for a slot" },
  { id: "scheduled", label: "Scheduled", hint: "Has a date" },
  { id: "posted", label: "Posted", hint: "Live, collecting numbers" },
];

export const stageLabel = (s: Stage): string =>
  STAGES.find((x) => x.id === s)?.label ?? s;

/* ── platforms ────────────────────────────────────────────────────────── */

export type Platform = "linkedin" | "instagram" | "tiktok" | "x";

export const PLATFORMS: { id: Platform; label: string; short: string }[] = [
  { id: "linkedin", label: "LinkedIn", short: "in" },
  { id: "instagram", label: "Instagram", short: "ig" },
  { id: "tiktok", label: "TikTok", short: "tt" },
  { id: "x", label: "X", short: "x" },
];

export const platformLabel = (p: Platform): string =>
  PLATFORMS.find((x) => x.id === p)?.label ?? p;

/* ── metrics ──────────────────────────────────────────────────────────── */

export type Metrics = {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  follows: number;
  clicks: number;
};

export const EMPTY_METRICS: Metrics = {
  impressions: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  follows: 0,
  clicks: 0,
};

/**
 * Typed in by hand for now. The hint is the label the platform itself uses, because
 * the single fastest way to make manual entry hurt is to make people guess which of
 * their numbers goes in which box.
 */
export const METRIC_FIELDS: { key: keyof Metrics; label: string; hint: string }[] = [
  { key: "impressions", label: "Impressions", hint: "LinkedIn: impressions · Instagram: reach" },
  { key: "likes", label: "Likes", hint: "Reactions of any kind" },
  { key: "comments", label: "Comments", hint: "Replies on the post itself" },
  { key: "shares", label: "Shares", hint: "Reposts and sends" },
  { key: "saves", label: "Saves", hint: "Instagram and TikTok only" },
  { key: "follows", label: "Follows", hint: "New followers credited to this post" },
  { key: "clicks", label: "Clicks", hint: "Link or profile clicks" },
];

export const engagements = (m: Metrics): number => m.likes + m.comments + m.shares + m.saves;

/** Share of the people who saw it who did something. Guarded: reach can be zero. */
export const engagementRate = (m: Metrics): number =>
  m.impressions > 0 ? engagements(m) / m.impressions : 0;

/* ── the record ───────────────────────────────────────────────────────── */

export type Post = {
  id: string;
  /** The carousel this publishes. Null while it is still only an idea. */
  docId: string | null;
  title: string;
  stage: Stage;
  platform: Platform;

  /* the structural snapshot — see the note at the top of this file */
  framework: string | null;
  slideCount: number;
  hook: string;
  styleId: string | null;
  /** Copied from the document when the post is made. See clients.ts. */
  clientId?: string | undefined;
  /**
   * Copied from the document when the post is made, and then owned by the post.
   *
   * Copied rather than looked up for the same reason `framework` and `hook` are:
   * a post is the record of what went out, and a carousel renumbered afterwards
   * must not silently rewrite what "part 2" meant on the day it was published.
   */
  series: { id: string; part: number } | null;

  scheduledFor: string | null;
  postedAt: string | null;
  url: string | null;
  caption: string;
  notes: string;

  /* ── the five fields every content calendar has ──────────────────────────
   *
   * Every Notion and Airtable content calendar in the research carries these,
   * and `posts` did not. Free text rather than enums for four of the five,
   * because a pillar is somebody's own vocabulary and an enum would either be
   * wrong for most people or grow until it is a text field with extra steps.
   *
   * `objective` IS an enum, and that is the exception on purpose: it is the one
   * of the five that analytics groups by, and grouping needs a closed set or
   * every typo becomes its own bucket.
   */

  /** "Education", "Behind the scenes" — the recurring theme. Attributable. */
  pillar: string;
  /** A launch, a season, a campaign name. Free text; it is a proper noun. */
  campaign: string;
  objective: Objective | null;
  /** Who signed it off. Free text: most of the time it is a first name. */
  reviewer: string;
  /** What they said when they did. Kept beside the decision, not inside it. */
  approvalNotes: string;

  metrics: Metrics | null;

  createdAt: string;
  updatedAt: string;
};

const nowISO = (): string => new Date().toISOString();

export function makePost(patch: Partial<Post> = {}): Post {
  const now = nowISO();
  return {
    id: uid("p"),
    docId: null,
    title: "Untitled",
    stage: "idea",
    platform: "linkedin",
    framework: null,
    slideCount: 0,
    hook: "",
    styleId: null,
    series: null,
    scheduledFor: null,
    postedAt: null,
    url: null,
    caption: "",
    notes: "",
    pillar: "",
    campaign: "",
    objective: null,
    reviewer: "",
    approvalNotes: "",
    metrics: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

/** The first words on the first slide. What the reader actually stops for. */
export function hookOf(doc: Doc): string {
  const first = doc.slides[0];
  const layer = first?.layers.find((l) => l.kind === "text" && (l.text ?? "").trim() !== "");
  return (layer?.text ?? "").trim();
}

/** Takes the structural snapshot. Everything analytics can attribute is decided here. */
export function postFromDoc(doc: Doc, platform: Platform = "linkedin"): Post {
  return makePost({
    docId: doc.id,
    title: doc.name,
    stage: "ready",
    platform,
    framework: doc.framework ?? null,
    slideCount: doc.slides.length,
    hook: hookOf(doc),
    styleId: doc.styleId ?? null,
    ...(doc.clientId ? { clientId: doc.clientId } : {}),
    series: doc.series ?? null,
  });
}

/* ── transitions (pure) ───────────────────────────────────────────────── */

const touch = (p: Post, patch: Partial<Post>): Post => ({ ...p, ...patch, updatedAt: nowISO() });

/**
 * Entering `posted` stamps a date if none was set; LEAVING it clears the date again.
 *
 * That clearing looks destructive but the alternative is worse: a post sitting in
 * "drafting" while still carrying a postedAt would keep feeding the baseline, and a
 * baseline quietly computed from things that are not live is the kind of bug nobody
 * ever notices and everybody acts on.
 */
export function moveTo(p: Post, stage: Stage): Post {
  if (stage === p.stage) return p;
  if (stage === "posted") return touch(p, { stage, postedAt: p.postedAt ?? nowISO() });
  if (p.stage === "posted") return touch(p, { stage, postedAt: null });
  return touch(p, { stage });
}

export function schedule(p: Post, whenISO: string): Post {
  return touch(p, { stage: "scheduled", scheduledFor: whenISO });
}

export function markPosted(p: Post, whenISO?: string, url?: string): Post {
  return touch(p, {
    stage: "posted",
    postedAt: whenISO ?? p.scheduledFor ?? nowISO(),
    url: url ?? p.url,
  });
}

export function setMetrics(p: Post, metrics: Metrics): Post {
  return touch(p, { metrics });
}

/* ── selectors ────────────────────────────────────────────────────────── */

/**
 * A post only counts once it is live AND has numbers AND those numbers include reach.
 * Every ratio downstream divides by reach, so admitting a zero here would poison the
 * whole baseline with Infinity.
 */
export function isMeasured(p: Post): p is Post & { metrics: Metrics; postedAt: string } {
  return p.stage === "posted" && p.postedAt !== null && p.metrics !== null && p.metrics.impressions > 0;
}

export const measured = (posts: Post[]): Post[] => posts.filter(isMeasured);

export const inStage = (posts: Post[], stage: Stage): Post[] => posts.filter((p) => p.stage === stage);

/** Soonest first, and anything undated sinks to the bottom rather than to the top. */
export const byScheduled = (a: Post, b: Post): number =>
  (a.scheduledFor ?? "9999").localeCompare(b.scheduledFor ?? "9999");

/** Most recent first. */
export const byPosted = (a: Post, b: Post): number =>
  (b.postedAt ?? "").localeCompare(a.postedAt ?? "");

export const upcoming = (posts: Post[]): Post[] =>
  posts.filter((p) => p.stage === "scheduled").sort(byScheduled);

export const published = (posts: Post[]): Post[] =>
  posts.filter((p) => p.stage === "posted").sort(byPosted);

/** Scheduled, dated, and that date has come and gone. The nudge list. */
export function overdue(posts: Post[], at: Date = new Date()): Post[] {
  const cutoff = at.toISOString();
  return posts
    .filter((p) => p.stage === "scheduled" && p.scheduledFor !== null && p.scheduledFor < cutoff)
    .sort(byScheduled);
}

/** Live, but nobody has typed the numbers in yet. The other nudge list. */
export const awaitingMetrics = (posts: Post[]): Post[] =>
  posts.filter((p) => p.stage === "posted" && !isMeasured(p)).sort(byPosted);

/* ── dates ────────────────────────────────────────────────────────────── */

export const shortDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No date";

export const shortDateTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "No date";

/** For a datetime-local input, which wants local time with no zone and no seconds. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fromLocalInput = (value: string): string | null =>
  value ? new Date(value).toISOString() : null;

/* ── storage ──────────────────────────────────────────────────────────── */

/**
 * One key for the lot. Posts are small records and are almost always read as a set
 * (every board, chart and baseline needs all of them), so per-record keys would only
 * add a fan-out read with nothing to show for it.
 */
const KEY = "flashcc:v1:posts";

export function listPosts(): Post[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as Post[]) : [];
  } catch {
    return [];
  }
}

export function savePosts(posts: Post[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(posts));
    return true;
  } catch {
    return false;
  }
}

export function upsertPost(post: Post): Post[] {
  const all = listPosts();
  const i = all.findIndex((p) => p.id === post.id);
  const next = i === -1 ? [post, ...all] : all.map((p) => (p.id === post.id ? post : p));
  savePosts(next);
  return next;
}

export function removePost(id: string): Post[] {
  const next = listPosts().filter((p) => p.id !== id);
  savePosts(next);
  markDeleted("post", id);
  return next;
}

/** Deleting a project should not leave its posts pointing at nothing. */
export function detachDoc(docId: string): Post[] {
  const next = listPosts().map((p) => (p.docId === docId ? { ...p, docId: null } : p));
  savePosts(next);
  return next;
}
