/**
 * The finishing pass (27.4): the same small decisions, in the same order, for
 * every new carousel, one carousel at a time.
 *
 * A batch breaks at post three or four, not because drafting is hard but
 * because finishing is a dozen small decisions spread over several screens,
 * and by the fourth carousel the energy for them is gone. Here they are six
 * screens with one decision each, always in this order, so the fifth carousel
 * costs less attention than the first:
 *
 *   hook       slide one, the slide that decides whether anyone swipes (4.1)
 *   payoff     the last slide, the one that decides whether anyone acts (4.1)
 *   caption    the text post, from slides one and two and the closer (12)
 *   alt        a description per slide, from the words already on it
 *   preflight  the destination's checks; a blocking finding stops here
 *   schedule   the date, which is when the post becomes "scheduled"
 *
 * Progress is kept per post on this device. A carousel's place in the pass is
 * a working note, not a record of anything that went out, so it does not sync.
 */
import { stripMarks } from "./marks.js";
import type { Doc } from "./model.js";
import type { Post } from "./pipeline.js";
import { slideCopy } from "./regenerate.js";
import { altFromTexts } from "./schedulers.js";
import { deckTexts } from "./transcript.js";

export type FinishStep = "hook" | "payoff" | "caption" | "alt" | "preflight" | "schedule";

export const FINISH_STEPS: { id: FinishStep; label: string; question: string }[] = [
  { id: "hook", label: "Hook", question: "Would you stop for this?" },
  { id: "payoff", label: "Payoff", question: "Does the last slide pay off the first?" },
  { id: "caption", label: "Caption", question: "Is this the text that goes with it?" },
  { id: "alt", label: "Alt text", question: "Does each description say what the slide says?" },
  { id: "preflight", label: "Pre-flight", question: "Anything that would go wrong on upload?" },
  { id: "schedule", label: "Schedule", question: "When does it go out?" },
];

export type Progress = Record<string, FinishStep[]>;

/** What is left for one post. A scheduled or posted post has nothing left, whatever was ticked. */
export function stepsLeft(post: Pick<Post, "id" | "stage">, progress: Progress): FinishStep[] {
  if (post.stage === "scheduled" || post.stage === "posted") return [];
  const done = new Set(progress[post.id] ?? []);
  return FINISH_STEPS.map((s) => s.id).filter((s) => !done.has(s));
}

/** The next step for a post: the first one not done, in the fixed order. */
export const nextStep = (post: Pick<Post, "id" | "stage">, progress: Progress): FinishStep | null =>
  stepsLeft(post, progress)[0] ?? null;

export const markDone = (progress: Progress, postId: string, step: FinishStep): Progress => ({
  ...progress,
  [postId]: [...new Set([...(progress[postId] ?? []), step])],
});

/**
 * The queue: carousels drafted and not yet scheduled, soonest slot first,
 * undated last, a session's carousels in the order their lanes fall.
 */
export function finishingQueue(posts: readonly Post[]): Post[] {
  return posts
    .filter((p) => p.docId && p.stage === "drafting")
    .sort((a, b) => (a.scheduledFor ?? "9999").localeCompare(b.scheduledFor ?? "9999") || a.createdAt.localeCompare(b.createdAt));
}

/** The words on the hook and payoff slides, as the outline would show them. */
export const hookText = (doc: Doc): string => (doc.slides[0] ? slideCopy(doc.slides[0]) : "");
export const payoffText = (doc: Doc): string => {
  const last = doc.slides[doc.slides.length - 1];
  return last && doc.slides.length > 1 ? slideCopy(last) : "";
};

/**
 * Alt text for every slide: what the person already wrote, and the slide's own
 * words where they wrote nothing. The step shows these and asks only whether
 * they are right.
 */
export function altsFor(doc: Doc): string[] {
  const texts = deckTexts(doc);
  return doc.slides.map((s, i) => (s.alt ?? "").trim() || altFromTexts([stripMarks(texts[i] ?? "")], i, doc.slides.length));
}

/* ── storage ──────────────────────────────────────────────────────────────── */

const KEY = "flashcc.finishing";

export function loadProgress(): Progress {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return raw && typeof raw === "object" ? (raw as Progress) : {};
  } catch {
    return {};
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* A private window keeps the pass for this tab only. */
  }
}
