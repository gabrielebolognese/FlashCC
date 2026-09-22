/**
 * Talking to the review system, from both ends.
 *
 * The two ends use different doors, and that is the design rather than an
 * inconsistency:
 *
 *   THE OWNER creates, lists, revokes and reads internal comments through
 *   PostgREST, gated by the ordinary owner-only RLS policies in 07-review.sql.
 *
 *   THE REVIEWER reads and writes through `/api/review`, because they have no
 *   session for RLS to gate on. `server/review.ts` is the boundary.
 *
 * ── Shares are cloud-only ────────────────────────────────────────────────────
 *
 * Every other record in this app is local-first and syncs. Shares and comments
 * are not, deliberately: a comment written by somebody else cannot originate on
 * this machine, so a local copy could only ever be a stale cache of a
 * conversation. They are read when a dialog opens and that is all.
 *
 * It also means `sync.ts` is untouched by this batch, which is worth something
 * on its own.
 */

import { cloud } from "./cloud.js";
import { publishDeck } from "./publish.js";
import type { Doc } from "./model.js";
import type { Platform } from "./platforms.js";
import { docVersion, type Comment, type CommentScope, type Share, type Snapshot } from "./review.js";

/* ── the token ────────────────────────────────────────────────────────────── */

/**
 * The whole security of a review link is this string.
 *
 * `randomUUID` is a CSPRNG in every browser that has it, and two of them is 256
 * bits of entropy with the hyphens taken out — unguessable, and short enough to
 * paste into a message without wrapping. Not derived from the document id,
 * the user id or the time, because anything derived can be enumerated.
 */
function mintToken(): string {
  const uuid = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : // A browser without randomUUID is a browser this app has bigger problems
        // with, but a weak token must never be the silent fallback.
        `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${uuid()}${uuid()}`.slice(0, 48);
}

export const reviewUrl = (token: string): string =>
  `${window.location.origin}/r/${token}`;

/** The path the public page answers on. One place, so the router and the link agree. */
export const REVIEW_PATH = "/r/";

export function tokenFromPath(pathname: string): string | null {
  if (!pathname.startsWith(REVIEW_PATH)) return null;
  const token = pathname.slice(REVIEW_PATH.length).split("/")[0] ?? "";
  return token.trim() || null;
}

/* ── rows ─────────────────────────────────────────────────────────────────── */

type ShareRow = {
  id: string;
  doc_id: string;
  token: string;
  title: string;
  snapshot: Snapshot;
  brand_id: string | null;
  client_id: string | null;
  status: Share["status"];
  decision_note: string;
  decided_by: string | null;
  decided_at: string | null;
  approved_version: string | null;
  created_at: string;
  updated_at: string;
};

const rowToShare = (row: ShareRow): Share => ({
  id: row.id,
  docId: row.doc_id,
  token: row.token,
  title: row.title,
  snapshot: row.snapshot,
  ...(row.brand_id ? { brandId: row.brand_id } : {}),
  ...(row.client_id ? { clientId: row.client_id } : {}),
  status: row.status,
  decisionNote: row.decision_note,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at,
  approvedVersion: row.approved_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

type CommentRow = {
  id: string;
  share_id: string;
  slide_index: number | null;
  slide_id: string | null;
  scope: CommentScope;
  author: string;
  body: string;
  resolved: boolean;
  created_at: string;
};

const rowToComment = (row: CommentRow): Comment => ({
  id: row.id,
  shareId: row.share_id,
  slideIndex: row.slide_index,
  slideId: row.slide_id,
  scope: row.scope,
  author: row.author,
  body: row.body,
  resolved: row.resolved,
  createdAt: row.created_at,
});

/* ── the owner's side ─────────────────────────────────────────────────────── */

export type ShareResult = { ok: true; share: Share } | { ok: false; error: string };

export type CreateOptions = {
  platform: Platform;
  userId: string;
  title?: string | undefined;
  brandId?: string | undefined;
  clientId?: string | undefined;
};

/**
 * Publish the deck, then record the link.
 *
 * In that order, and the order is the safety: a share row pointing at slides
 * that were never uploaded is a link that opens to nothing, and the reviewer
 * has no way to tell that from the work being bad. If publishing fails, no row
 * is written at all.
 */
export async function createShare(doc: Doc, options: CreateOptions): Promise<ShareResult> {
  const db = cloud();
  if (!db) return { ok: false, error: "Sharing needs an account. Sign in and try again." };

  const published = await publishDeck(doc, options.platform, options.userId);
  if (!published.ok) return { ok: false, error: published.error };

  const snapshot: Snapshot = {
    version: docVersion(doc),
    slideCount: doc.slides.length,
    urls: published.carousel.urls,
    alts: published.carousel.alts,
    capturedAt: new Date().toISOString(),
  };

  const now = new Date().toISOString();
  const row = {
    user_id: options.userId,
    id: `sh_${mintToken().slice(0, 16)}`,
    doc_id: doc.id,
    token: mintToken(),
    title: options.title ?? doc.name,
    snapshot,
    brand_id: options.brandId ?? null,
    client_id: options.clientId ?? null,
    status: "open" as const,
    decision_note: "",
    decided_by: null,
    decided_at: null,
    approved_version: null,
    created_at: now,
    updated_at: now,
  };

  const { error } = await db.from("shares").insert(row);
  if (error) {
    const missing = error.code === "PGRST205";
    return {
      ok: false,
      error: missing ? "Run supabase/07-review.sql to turn review links on." : error.message,
    };
  }

  return { ok: true, share: rowToShare(row as ShareRow) };
}

/** Every link ever made for this carousel, newest first. */
export async function listShares(docId: string, userId: string): Promise<Share[]> {
  const db = cloud();
  if (!db) return [];

  const { data, error } = await db
    .from("shares")
    .select("*")
    .eq("user_id", userId)
    .eq("doc_id", docId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as ShareRow[]).map(rowToShare);
}

/**
 * Turns a link off.
 *
 * A status change rather than a delete, so the comments and the decision survive
 * — the conversation is the record of what happened, and throwing it away
 * because the link expired would lose the answer along with the question.
 */
export async function revokeShare(share: Share, userId: string): Promise<boolean> {
  const db = cloud();
  if (!db) return false;
  const { error } = await db
    .from("shares")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", share.id);
  return !error;
}

/** Re-captures the slides against the deck as it stands now. */
export async function recapture(
  share: Share,
  doc: Doc,
  options: CreateOptions,
): Promise<ShareResult> {
  const db = cloud();
  if (!db) return { ok: false, error: "Sharing needs an account." };

  const published = await publishDeck(doc, options.platform, options.userId);
  if (!published.ok) return { ok: false, error: published.error };

  const snapshot: Snapshot = {
    version: docVersion(doc),
    slideCount: doc.slides.length,
    urls: published.carousel.urls,
    alts: published.carousel.alts,
    capturedAt: new Date().toISOString(),
  };

  // Back to `open`, and the decision cleared. A re-captured link is a new ask:
  // leaving "approved" on top of slides nobody has seen is precisely the "three
  // people approved, none of them the same version" failure, wearing a tick.
  const patch = {
    snapshot,
    status: "open" as const,
    decision_note: "",
    decided_by: null,
    decided_at: null,
    approved_version: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from("shares")
    .update(patch)
    .eq("user_id", options.userId)
    .eq("id", share.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, share: { ...share, ...patch, snapshot } };
}

/* ── comments, from the owner's side ──────────────────────────────────────── */

export async function listComments(shareId: string, userId: string): Promise<Comment[]> {
  const db = cloud();
  if (!db) return [];

  const { data, error } = await db
    .from("comments")
    .select("*")
    .eq("user_id", userId)
    .eq("share_id", shareId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return (data as CommentRow[]).map(rowToComment);
}

export async function addInternalNote(
  shareId: string,
  userId: string,
  slideIndex: number | null,
  author: string,
  body: string,
  scope: CommentScope = "internal",
): Promise<Comment | null> {
  const db = cloud();
  if (!db) return null;

  const row = {
    user_id: userId,
    id: `cm_${mintToken().slice(0, 16)}`,
    share_id: shareId,
    slide_index: slideIndex,
    slide_id: null,
    scope,
    author,
    body,
    resolved: false,
    created_at: new Date().toISOString(),
  };

  const { error } = await db.from("comments").insert(row);
  return error ? null : rowToComment(row as CommentRow);
}

export async function setResolved(id: string, userId: string, resolved: boolean): Promise<boolean> {
  const db = cloud();
  if (!db) return false;
  const { error } = await db
    .from("comments")
    .update({ resolved, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  return !error;
}

/* ── the reviewer's side ──────────────────────────────────────────────────── */

export type ReviewPage = {
  share: {
    id: string;
    title: string;
    snapshot: Snapshot;
    status: Share["status"];
    decisionNote: string;
    decidedBy: string | null;
    decidedAt: string | null;
    createdAt: string;
  };
  comments: Comment[];
  /** Only the paint. See `readShare` on the server for why it is this narrow. */
  brand: { name: string; theme: Record<string, string>; logos: Record<string, string> } | null;
};

async function ask<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export const fetchReview = (token: string): Promise<ReviewPage> =>
  ask<ReviewPage>(`/api/review?token=${encodeURIComponent(token)}`);

export const postComment = (
  token: string,
  slideIndex: number | null,
  author: string,
  body: string,
): Promise<{ comment: Comment }> =>
  ask("/api/review/comment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, slideIndex, author, body }),
  });

export const postDecision = (
  token: string,
  decision: "approved" | "changes",
  author: string,
  note: string,
): Promise<{ status: Share["status"]; decidedAt: string }> =>
  ask("/api/review/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, decision, author, note }),
  });
