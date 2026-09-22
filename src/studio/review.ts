/**
 * Review: a link you send, a page somebody opens without an account, and an
 * answer that is attached to a specific version.
 *
 * ── What a reviewer sees, and why it is not the live document ────────────────
 *
 * A share is a SNAPSHOT of rendered slides, not a window onto the editor. Three
 * reasons, in order of how much they cost to get wrong:
 *
 *   1. A logged-out reviewer cannot read the private `media` bucket, and
 *      uploaded fonts live in the owner's browser. A live render would show a
 *      client missing images in a face nobody chose.
 *   2. The client should approve what will be POSTED. A canvas that has moved
 *      since is not the thing under discussion.
 *   3. It makes 7.4 nearly free. "Three people approved the post. None of them
 *      approved the same version" is only solvable if approval points at
 *      something that cannot change underneath it.
 *
 * So creating a share publishes the deck through the Batch 5 path and records
 * the public URLs. The cost is honest and worth stating: sharing needs an
 * account and the storage migration, and there is no offline version of it.
 *
 * ── Comments attach to a slide, and that is the whole trick ──────────────────
 *
 * Every proofing tool in the market needs an x/y annotation engine because it is
 * reviewing arbitrary artwork. A carousel is already an ordered list of slides,
 * so a comment is `(share, slideIndex, text)` and nothing more. Gain's own users
 * are asking for exactly this: "you just can leave a comment, not a 'post it'
 * over the content."
 *
 * ── Seats ────────────────────────────────────────────────────────────────────
 *
 * There is no reviewer record, no invitation and no seat count anywhere in this
 * file, deliberately. See `CLAUDE.md` invariant 6.
 *
 * Pure and DOM-free. `sharing.ts` does the talking.
 */

import type { Doc } from "./model.js";

/* ── versions ─────────────────────────────────────────────────────────────── */

/**
 * A fingerprint of everything a reviewer could see.
 *
 * Words AND geometry AND colour, because "the version I approved" has to change
 * when the design moves, not only when the copy does — an agency asking for
 * "safeties to ensure that approved images aren't confused with modified ones"
 * is asking about a nudged headline as much as a rewritten one.
 *
 * Deliberately excludes ids, timestamps and z-order-neutral churn, so re-laying
 * a deck to the identical result does not invalidate an approval. FNV-1a with
 * the length appended, as in assets.ts: a bucket key, not a checksum, where a
 * collision costs one stale warning rather than anything destructive.
 */
export function docVersion(doc: Doc): string {
  const parts: string[] = [`${doc.width}x${doc.height}`, `${doc.slides.length}`];

  for (const slide of doc.slides) {
    parts.push(`bg:${slide.background}`);
    for (const l of slide.layers) {
      if (!l.visible) continue;
      parts.push(
        [
          l.kind,
          Math.round(l.x),
          Math.round(l.y),
          Math.round(l.w),
          Math.round(l.h),
          l.fill,
          l.fontSize ?? "",
          (l.text ?? "").trim(),
          l.src ? "img" : "",
        ].join("|"),
      );
    }
  }

  const body = parts.join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i += 1) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `v${(h >>> 0).toString(36)}-${body.length.toString(36)}`;
}

/* ── the records ──────────────────────────────────────────────────────────── */

export type Snapshot = {
  /** `docVersion` at the moment it was captured. */
  version: string;
  slideCount: number;
  /** Public URLs, in slide order. */
  urls: string[];
  alts: string[];
  capturedAt: string;
};

export type ShareStatus = "open" | "approved" | "changes" | "revoked";

export type Share = {
  id: string;
  docId: string;
  /** The secret in the URL. Long and random; see `sharing.ts`. */
  token: string;
  title: string;
  snapshot: Snapshot;
  /** Paints the review page. 7.5 in one field. */
  brandId?: string | undefined;
  clientId?: string | undefined;
  status: ShareStatus;
  /** A note the reviewer left with their decision. */
  decisionNote: string;
  decidedBy: string | null;
  decidedAt: string | null;
  /**
   * The version that was approved, frozen at the moment of approval.
   *
   * Separate from `snapshot.version` because a share can be re-captured: the
   * snapshot moves forward, this does not, and the gap between them is exactly
   * the warning the editor needs to show.
   */
  approvedVersion: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommentScope = "internal" | "client";

export type Comment = {
  id: string;
  shareId: string;
  /** Which slide, 0-based. Null means the deck as a whole. */
  slideIndex: number | null;
  /** The layer-level anchor, kept so the editor can jump to it. Display uses the index. */
  slideId: string | null;
  scope: CommentScope;
  author: string;
  body: string;
  resolved: boolean;
  createdAt: string;
};

/* ── what the reviewer is allowed to see ──────────────────────────────────── */

/**
 * The client-visible feed.
 *
 * "The ability to show the feed to the clients externally so that they're able
 * to view only what's needed and not all our comments" (Planable). The filter
 * lives here rather than in the query so that it is one function with one test,
 * and so a future caller cannot forget it — a server route that leaked internal
 * notes to a client would be the single worst bug this product could ship.
 */
export const visibleTo = (comments: readonly Comment[], who: "owner" | "client"): Comment[] =>
  who === "owner" ? [...comments] : comments.filter((c) => c.scope === "client");

/** Comments for one slide, oldest first, so a thread reads top to bottom. */
export function onSlide(comments: readonly Comment[], slideIndex: number | null): Comment[] {
  return comments
    .filter((c) => c.slideIndex === slideIndex)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** How many comments sit on each slide, for the dots down the filmstrip. */
export function commentCounts(comments: readonly Comment[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const c of comments) {
    if (c.slideIndex === null || c.resolved) continue;
    out.set(c.slideIndex, (out.get(c.slideIndex) ?? 0) + 1);
  }
  return out;
}

export const unresolved = (comments: readonly Comment[]): Comment[] =>
  comments.filter((c) => !c.resolved);

/* ── approval, against a version ──────────────────────────────────────────── */

export type Staleness =
  | { state: "none" }
  | { state: "current"; version: string }
  | { state: "stale"; approved: string; now: string };

/**
 * Has the deck moved since somebody approved it?
 *
 * This is 7.4, and it is the answer to "three people approved the post, none of
 * them approved the same version". A stale approval is not revoked — deciding
 * that for somebody is worse than telling them — it is reported, and what they
 * do about it is theirs.
 */
export function stalenessOf(share: Share, doc: Doc): Staleness {
  if (share.status !== "approved" || !share.approvedVersion) return { state: "none" };
  const now = docVersion(doc);
  return share.approvedVersion === now
    ? { state: "current", version: now }
    : { state: "stale", approved: share.approvedVersion, now };
}

export const STATUS_LABEL: Record<ShareStatus, string> = {
  open: "Waiting on them",
  approved: "Approved",
  changes: "Changes asked for",
  revoked: "Link turned off",
};

/** A share that can still be opened. Revoked links answer 404, not a login page. */
export const isLive = (share: Share): boolean => share.status !== "revoked";

/* ── limits, because this endpoint is open to the world ───────────────────── */

/**
 * A public write endpoint with no account behind it needs a ceiling on
 * everything. These are enforced on the server; they live here so the page can
 * say no first and so both halves cannot drift apart.
 */
export const MAX_COMMENT_CHARS = 2000;
export const MAX_AUTHOR_CHARS = 60;
export const MAX_COMMENTS_PER_SHARE = 500;

export type CommentDraft = { slideIndex: number | null; author: string; body: string };

export function validateComment(draft: CommentDraft, existing = 0): string | null {
  if (!draft.body.trim()) return "Write something first.";
  if (draft.body.length > MAX_COMMENT_CHARS) {
    return `That is longer than ${MAX_COMMENT_CHARS} characters.`;
  }
  if (draft.author.length > MAX_AUTHOR_CHARS) return "That name is too long.";
  if (existing >= MAX_COMMENTS_PER_SHARE) {
    return "This link has reached its comment limit. Ask for a fresh one.";
  }
  return null;
}

/** Anonymous is allowed. Demanding a name from somebody with no account is a login by another route. */
export const authorLabel = (author: string): string => author.trim() || "Someone";
