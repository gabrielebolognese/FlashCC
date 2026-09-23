/**
 * The review endpoint: the one route in this product that answers to somebody
 * with no account.
 *
 * ── Why this is a server route and not row level security ────────────────────
 *
 * Everywhere else in FlashCC, RLS is the boundary and the browser talks to
 * PostgREST directly. That cannot work here. A reviewer has no `auth.uid()` — by
 * design, because a login is the thing this feature exists to avoid — and the
 * obvious alternative, an anon policy that trusts a token in the row, requires
 * letting the anon key read `shares` to find the matching row, which is the same
 * as letting it read every share.
 *
 * So the boundary is this file: the service role key, one lookup by token, and
 * a response containing only what that token entitles the caller to. It is a
 * deliberate exception, it is the only one, and it is written to be read end to
 * end in one sitting.
 *
 * ── What a token entitles you to ─────────────────────────────────────────────
 *
 * Exactly one share, its snapshot of rendered slides, and its CLIENT-SCOPED
 * comments. Never the document, never the internal notes, never the owner's
 * identity, never another share. `strip()` below is the single place that
 * decides, and it builds a fresh object rather than deleting keys — an allow
 * list cannot leak a column somebody adds later, and a deny list can.
 *
 * ── Abuse ────────────────────────────────────────────────────────────────────
 *
 * This is an open write endpoint. Nothing stops somebody who has the link from
 * filling it with rubbish, and that is acceptable — they could equally email the
 * client. What is not acceptable is unbounded writes, so length, count and rate
 * are all capped, and a revoked link answers 404 rather than explaining itself.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import { HttpError, json, rateLimit, readJson } from "./http.js";
import { serviceClient } from "./supabase.js";

/** Mirrors `review.ts` in the browser. Both halves have to agree, so both say so. */
const MAX_COMMENT_CHARS = 2000;
const MAX_AUTHOR_CHARS = 60;
const MAX_COMMENTS_PER_SHARE = 500;
const MAX_NOTE_CHARS = 2000;

/**
 * Counted per SHARE TOKEN rather than per address.
 *
 * A review link is deliberately sent to a roomful of people who may all be
 * behind one office NAT, so limiting by address would have one reviewer's
 * enthusiasm lock out their colleagues. The token is the conversation, and the
 * conversation is the thing worth bounding.
 */
const MAX_WRITES_PER_WINDOW = 20;

type ShareRow = {
  user_id: string;
  id: string;
  doc_id: string;
  token: string;
  title: string;
  snapshot: Record<string, unknown>;
  brand_id: string | null;
  status: string;
  decision_note: string;
  decided_by: string | null;
  decided_at: string | null;
  approved_version: string | null;
  created_at: string;
  deleted_at: string | null;
};

type CommentRow = {
  id: string;
  slide_index: number | null;
  scope: string;
  author: string;
  body: string;
  resolved: boolean;
  created_at: string;
};

/**
 * Everything the reviewer is allowed to know, built as a NEW object.
 *
 * An allow list rather than a delete list: this way a column added to `shares`
 * next year is absent by default instead of leaking by default, and the failure
 * mode of forgetting to update this function is a missing field rather than an
 * exposed one.
 */
const strip = (row: ShareRow) => ({
  id: row.id,
  title: row.title,
  snapshot: row.snapshot,
  status: row.status,
  decisionNote: row.decision_note,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at,
  createdAt: row.created_at,
});

function tokenOf(req: IncomingMessage): string {
  const url = new URL(req.url ?? "", "http://localhost");
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!token || token.length > 128) throw new HttpError(400, "No link token");
  return token;
}

/**
 * Finds the share, or says it does not exist.
 *
 * A revoked or deleted link gets a plain 404 with no explanation. Saying "this
 * link was turned off" confirms to whoever holds it that it was once real, and
 * the person who revoked it did so to end the conversation.
 */
async function findShare(token: string): Promise<ShareRow> {
  const { data, error } = await serviceClient()
    .from("shares")
    .select("*")
    .eq("token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);

  const row = data as ShareRow | null;
  if (!row || row.status === "revoked") throw new HttpError(404, "That link is not available.");
  return row;
}

async function clientComments(shareId: string): Promise<CommentRow[]> {
  const { data, error } = await serviceClient()
    .from("comments")
    .select("id, slide_index, scope, author, body, resolved, created_at")
    .eq("share_id", shareId)
    .eq("scope", "client")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new HttpError(500, error.message);
  return (data ?? []) as CommentRow[];
}

const asComment = (row: CommentRow) => ({
  id: row.id,
  slideIndex: row.slide_index,
  slideId: null,
  scope: "client" as const,
  author: row.author,
  body: row.body,
  resolved: row.resolved,
  createdAt: row.created_at,
});

/* ── GET /api/review?token=… ──────────────────────────────────────────────── */

export async function readShare(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const share = await findShare(tokenOf(req));
  const comments = await clientComments(share.id);

  json(res, 200, {
    share: strip(share),
    comments: comments.map(asComment),
    brand: await brandPaint(share),
  });
}

type BrandRow = { name: string; theme: Record<string, string>; logos: Record<string, string> };

/** How long a review page's logo URL is good for. One sitting, not one week. */
const LOGO_TTL_SECONDS = 60 * 60;

/**
 * The agency's paint, and only the paint.
 *
 * 7.5 is their logo across the top of the page, not a licence to hand a stranger
 * their whole brand record — so this returns a name, four colours and up to
 * three images, built as a new object like `strip` above.
 *
 * `brands.logos` holds ASSET IDS, and those assets live in the private `media`
 * bucket that a reviewer cannot read. Signed here with the service role, at read
 * time rather than at share time, so a link opened in six weeks still shows a
 * logo instead of a broken image. A short expiry because the page uses it
 * immediately; there is nothing to gain from a URL that outlives the visit.
 */
async function brandPaint(share: ShareRow): Promise<BrandRow | null> {
  if (!share.brand_id) return null;

  const { data } = await serviceClient()
    .from("brands")
    .select("name, theme, logos")
    .eq("user_id", share.user_id)
    .eq("id", share.brand_id)
    .maybeSingle();

  const brand = data as BrandRow | null;
  if (!brand) return null;

  const ids = Object.values(brand.logos ?? {}).filter(Boolean);
  if (ids.length === 0) return { name: brand.name, theme: brand.theme ?? {}, logos: {} };

  const { data: assets } = await serviceClient()
    .from("assets")
    .select("id, path")
    .eq("user_id", share.user_id)
    .in("id", ids);

  const paths = new Map((assets ?? []).map((a) => [(a as { id: string }).id, (a as { path: string }).path]));
  const wanted = [...paths.values()].filter(Boolean);
  const signed = new Map<string, string>();

  if (wanted.length > 0) {
    const { data: urls } = await serviceClient()
      .storage.from("media")
      .createSignedUrls(wanted, LOGO_TTL_SECONDS);
    for (const entry of urls ?? []) {
      if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
    }
  }

  const logos: Record<string, string> = {};
  for (const [role, assetId] of Object.entries(brand.logos ?? {})) {
    const path = paths.get(assetId);
    const url = path ? signed.get(path) : undefined;
    if (url) logos[role] = url;
  }

  return { name: brand.name, theme: brand.theme ?? {}, logos };
}

/* ── POST /api/review/comment ─────────────────────────────────────────────── */

type CommentBody = {
  token?: string;
  slideIndex?: number | null;
  author?: string;
  body?: string;
};

export async function addComment(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson<CommentBody>(req, 64_000);
  const token = (body.token ?? "").trim();
  if (!token) throw new HttpError(400, "No link token");

  rateLimit(`review:${token}`, MAX_WRITES_PER_WINDOW);

  const text = (body.body ?? "").trim();
  if (!text) throw new HttpError(400, "Write something first.");
  if (text.length > MAX_COMMENT_CHARS) throw new HttpError(400, "That comment is too long.");

  const author = (body.author ?? "").trim().slice(0, MAX_AUTHOR_CHARS);
  const share = await findShare(token);

  const { count, error: countError } = await serviceClient()
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("share_id", share.id)
    .is("deleted_at", null);

  if (countError) throw new HttpError(500, countError.message);
  if ((count ?? 0) >= MAX_COMMENTS_PER_SHARE) {
    throw new HttpError(429, "This link has reached its comment limit.");
  }

  const slideIndex =
    typeof body.slideIndex === "number" && Number.isInteger(body.slideIndex) && body.slideIndex >= 0
      ? body.slideIndex
      : null;

  const row = {
    // The SHARE's owner. A reviewer has no account, so there is no other user id
    // — and this is what the owner's RLS policy gates their own reads on.
    user_id: share.user_id,
    id: `cm_${randomUUID()}`,
    share_id: share.id,
    slide_index: slideIndex,
    // Always client scope. An internal note cannot originate out here, and
    // hard-coding it means a malformed body can never mint one.
    scope: "client",
    author,
    body: text,
  };

  const { error } = await serviceClient().from("comments").insert(row);
  if (error) throw new HttpError(500, error.message);

  json(res, 200, { comment: asComment({ ...row, resolved: false, created_at: new Date().toISOString() }) });
}

/* ── POST /api/review/decision ────────────────────────────────────────────── */

type DecisionBody = {
  token?: string;
  decision?: "approved" | "changes";
  author?: string;
  note?: string;
};

/**
 * Approve, or ask for changes.
 *
 * Approving stamps `approved_version` from the snapshot the reviewer was
 * actually looking at, which is the entire point of 7.4 — an approval that
 * pointed at "the current document" would answer the wrong question the moment
 * anybody touched it.
 *
 * A decision can be changed. Somebody who approves and then spots something must
 * be able to say so without being told to ask for a new link, so this is an
 * update rather than an insert-once.
 */
export async function decide(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson<DecisionBody>(req, 64_000);
  const token = (body.token ?? "").trim();
  if (!token) throw new HttpError(400, "No link token");
  if (body.decision !== "approved" && body.decision !== "changes") {
    throw new HttpError(400, "That is not a decision");
  }

  rateLimit(`review:${token}`, MAX_WRITES_PER_WINDOW);
  const share = await findShare(token);

  const snapshotVersion =
    typeof share.snapshot?.version === "string" ? (share.snapshot.version as string) : null;

  const patch = {
    status: body.decision,
    decision_note: (body.note ?? "").trim().slice(0, MAX_NOTE_CHARS),
    decided_by: (body.author ?? "").trim().slice(0, MAX_AUTHOR_CHARS) || null,
    decided_at: new Date().toISOString(),
    // Cleared when changes are asked for: a deck with outstanding changes has no
    // approved version, and leaving the old one there would show a green tick
    // beside a request to fix something.
    approved_version: body.decision === "approved" ? snapshotVersion : null,
  };

  const { error } = await serviceClient()
    .from("shares")
    .update(patch)
    .eq("user_id", share.user_id)
    .eq("id", share.id);

  if (error) throw new HttpError(500, error.message);

  json(res, 200, { status: patch.status, decidedAt: patch.decided_at });
}
