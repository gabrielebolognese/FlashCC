/**
 * Send as drafts, to Publer (Batch 31.1).
 *
 * One dialect, Publer's, never a generic adapter (the Batch 5.5 rule). It
 * creates DRAFTS and never published posts: the scheduler stays the thing
 * that publishes, and a mistake costs a deleted draft rather than a public
 * post.
 *
 * **What was verified, and how** (`PUBLER.verified`): Publer's API reference
 * and quickstart, read 2026-10-19, not a live call (no account was available
 * here, D66). It documents: `Authorization: Bearer-API <key>` with a
 * `Publer-Workspace-Id` header; `POST /posts/schedule` taking a `bulk` with a
 * `state` and `posts`, each post `networks` and `accounts`, where the draft
 * states are `draft`, `draft_private` and `draft_public`; media referenced by
 * id after `POST /media/from-url`, which, like post creation, answers with a
 * job polled at `GET /job_status/{id}`; and API keys on the Business and
 * Enterprise plans. Where the docs disagree with themselves (a finished job
 * is "complete" in one place and "completed" in another, a photo item is
 * `photo` in one example and `image` in another) both are accepted on the way
 * in and the documented example is sent on the way out.
 *
 * Metricool was checked too and is NOT here: its scheduler API documents a
 * `draft` flag but only one media object per post, so a carousel cannot be
 * sent through it. It stays on the CSV path.
 *
 * **Atomic per carousel** (the Batch 4.4 rule): each carousel is its own media
 * upload and its own draft, so one that fails is named and the rest are sent.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { bearer, HttpError, json, rateLimit, readJson } from "./http.js";
import { seal, unseal } from "./secrets.js";
import { store, type ConnectionRow, type SchedulerAccount } from "./store.js";
import { requireCaller, requirePro } from "./supabase.js";

export const PUBLER = {
  base: "https://app.publer.com/api/v1",
  verified: "2026-10-19",
  sources: [
    "https://publer.com/docs/getting-started/quickstart",
    "https://publer.com/docs/posting/create-posts",
    "https://publer.com/docs/posting/create-posts/publishing-methods/draft-posts",
    "https://publer.com/docs/posting/create-posts/content-types/photo-posts",
    "https://publer.com/docs/posting/create-posts/media-handling",
    "https://blog.publer.com/publer-api-for-marketers-and-developers/",
  ],
} as const;

/** Our platform ids, as Publer names its networks. A platform with no entry cannot be sent. */
export const NETWORKS: Record<string, string> = {
  instagram: "instagram",
  linkedin: "linkedin",
  tiktok: "tiktok",
  threads: "threads",
  x: "twitter",
  bluesky: "bluesky",
  pinterest: "pinterest",
};

/** Ten images a post, the ceiling Publer's own help gives for a carousel. */
export const MAX_IMAGES = 10;

export type Fetch = typeof fetch;

export const headers = (key: string, workspace?: string | undefined): Record<string, string> => ({
  Authorization: `Bearer-API ${key}`,
  "Content-Type": "application/json",
  Accept: "application/json",
  ...(workspace ? { "Publer-Workspace-Id": workspace } : {}),
});

async function call<T>(f: Fetch, path: string, init: RequestInit): Promise<T> {
  const res = await f(`${PUBLER.base}${path}`, { ...init, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (res.status === 401 || res.status === 403) throw new HttpError(400, "Publer did not accept that API key (it needs a Business or Enterprise plan)");
  if (!res.ok) {
    const why = (body as { errors?: unknown; error?: unknown; message?: unknown } | null) ?? {};
    throw new Error(`Publer answered ${res.status}${typeof why.message === "string" ? `: ${why.message}` : typeof why.error === "string" ? `: ${why.error}` : ""}`);
  }
  return body as T;
}

/* ── the connection ───────────────────────────────────────────────────────── */

type Workspace = { id: string; name?: string };
type Account = { id: string; name?: string; provider?: string; type?: string; network?: string };

export async function workspaces(f: Fetch, key: string): Promise<Workspace[]> {
  const body = await call<Workspace[] | { workspaces?: Workspace[] }>(f, "/workspaces", { headers: headers(key) });
  return Array.isArray(body) ? body : (body.workspaces ?? []);
}

export async function accounts(f: Fetch, key: string, workspace: string): Promise<SchedulerAccount[]> {
  const body = await call<Account[] | { accounts?: Account[] }>(f, "/accounts", { headers: headers(key, workspace) });
  const list = Array.isArray(body) ? body : (body.accounts ?? []);
  return list.map((a) => ({ id: String(a.id), name: a.name ?? String(a.id), network: String(a.provider ?? a.network ?? a.type ?? "").toLowerCase() }));
}

/* ── jobs ─────────────────────────────────────────────────────────────────── */

type JobStatus = { status?: string; payload?: unknown; result?: unknown; data?: unknown };

const DONE = new Set(["complete", "completed", "success", "succeeded"]);

/** Polls a job until it finishes. `sleep` is injected so tests do not wait. */
export async function waitForJob(f: Fetch, key: string, workspace: string, id: string, sleep: (ms: number) => Promise<void>, tries = 30): Promise<unknown> {
  for (let i = 0; i < tries; i += 1) {
    const s = await call<JobStatus>(f, `/job_status/${encodeURIComponent(id)}`, { headers: headers(key, workspace) });
    const status = String(s.status ?? "").toLowerCase();
    if (DONE.has(status)) return s.payload ?? s.result ?? s.data ?? null;
    if (status === "failed" || status === "error") throw new Error(`Publer's job failed${typeof s.payload === "string" ? `: ${s.payload}` : ""}`);
    await sleep(Math.min(5000, 500 * 2 ** i));
  }
  throw new Error("Publer's job did not finish in time");
}

/** Media ids out of a finished upload job, in the order the URLs were sent. Both documented shapes. */
export function mediaIds(payload: unknown): string[] {
  const list = Array.isArray(payload) ? payload : ((payload as { media?: unknown[] } | null)?.media ?? []);
  return (list as { id?: unknown; media_id?: unknown }[]).map((m) => String(m.id ?? m.media_id ?? "")).filter(Boolean);
}

/* ── one carousel ─────────────────────────────────────────────────────────── */

export type DraftItem = {
  id: string;
  name: string;
  platform: string;
  caption: string;
  urls: string[];
  alts: string[];
  /** ISO, or null: a draft with no date is fine, the person dates it in Publer. */
  scheduledFor: string | null;
};

export type DraftResult = { id: string; name: string; ok: true; jobId?: string | undefined } | { id: string; name: string; ok: false; error: string };

/** The documented bulk body, one post, as a draft, on every connected account of its network. */
export function draftBody(item: DraftItem, network: string, ids: readonly string[], accountIds: readonly string[]) {
  return {
    bulk: {
      state: "draft",
      posts: [
        {
          networks: {
            [network]: {
              type: "photo",
              text: item.caption,
              media: ids.map((id, i) => ({ id, type: "photo", ...(item.alts[i] ? { alt_text: item.alts[i] } : {}) })),
            },
          },
          accounts: accountIds.map((id) => ({ id, ...(item.scheduledFor ? { scheduled_at: item.scheduledFor } : {}) })),
        },
      ],
    },
  };
}

export async function sendDraft(f: Fetch, key: string, conn: Pick<ConnectionRow, "workspaceId" | "accounts">, item: DraftItem, sleep: (ms: number) => Promise<void>): Promise<DraftResult> {
  try {
    const network = NETWORKS[item.platform];
    if (!network) throw new Error(`Publer has no ${item.platform} network`);
    const targets = conn.accounts.filter((a) => a.network === network).map((a) => a.id);
    if (!targets.length) throw new Error(`No ${network} account is connected in this Publer workspace`);
    const urls = item.urls.filter((u) => /^https:\/\//.test(u));
    if (!urls.length) throw new Error("No hosted slides to send");
    if (urls.length > MAX_IMAGES) throw new Error(`${urls.length} slides; a Publer carousel takes ${MAX_IMAGES}`);

    const upload = await call<{ job_id?: string }>(f, "/media/from-url", {
      method: "POST",
      headers: headers(key, conn.workspaceId),
      // The body's exact fields are the least certain part of this dialect (D66).
      body: JSON.stringify({ media: urls.map((url, i) => ({ url, name: `${item.id}-${i + 1}` })) }),
    });
    if (!upload.job_id) throw new Error("Publer did not start the upload");
    const ids = mediaIds(await waitForJob(f, key, conn.workspaceId, upload.job_id, sleep));
    if (ids.length !== urls.length) throw new Error(`Publer took ${ids.length} of ${urls.length} slides`);

    const made = await call<{ job_id?: string }>(f, "/posts/schedule", {
      method: "POST",
      headers: headers(key, conn.workspaceId),
      body: JSON.stringify(draftBody(item, network, ids, targets)),
    });
    if (made.job_id) await waitForJob(f, key, conn.workspaceId, made.job_id, sleep);
    return { id: item.id, name: item.name, ok: true, ...(made.job_id ? { jobId: made.job_id } : {}) };
  } catch (e) {
    return { id: item.id, name: item.name, ok: false, error: e instanceof Error ? e.message : "Not sent" };
  }
}

/** Every carousel, one at a time; a failure names its carousel and the rest still go. */
export async function sendDrafts(f: Fetch, key: string, conn: Pick<ConnectionRow, "workspaceId" | "accounts">, items: readonly DraftItem[], sleep: (ms: number) => Promise<void>): Promise<DraftResult[]> {
  const out: DraftResult[] = [];
  for (const item of items) out.push(await sendDraft(f, key, conn, item, sleep));
  return out;
}

/* ── routes ───────────────────────────────────────────────────────────────── */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** What the browser may know about a connection: never the key. */
const shown = (c: ConnectionRow | null) => (c ? { connected: true, workspaceId: c.workspaceId, accounts: c.accounts, since: c.createdAt } : null);

export async function readConnections(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  json(res, 200, { publer: shown(await store().connection(caller.id, "publer")), verified: { publer: PUBLER.verified } });
}

/** Authorised once: the key is checked against Publer, then sealed and kept on the server. */
export async function connectPubler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requirePro(bearer(req), "Sending drafts to a scheduler");
  rateLimit(`publer-connect:${caller.id}`, 10);
  const body = await readJson<{ apiKey?: string; workspaceId?: string }>(req, 8_000);
  const key = String(body.apiKey ?? "").trim();
  if (!key) throw new HttpError(400, "Paste your Publer API key");
  const spaces = await workspaces(fetch, key);
  const workspace = body.workspaceId ? spaces.find((w) => String(w.id) === body.workspaceId) : spaces[0];
  if (!workspace) throw new HttpError(400, "That key opens no Publer workspace");
  const row: ConnectionRow = {
    userId: caller.id,
    tool: "publer",
    secret: seal(key),
    workspaceId: String(workspace.id),
    accounts: await accounts(fetch, key, String(workspace.id)),
    createdAt: new Date().toISOString(),
  };
  await store().saveConnection(row);
  json(res, 200, { publer: shown(row), workspaces: spaces.map((w) => ({ id: String(w.id), name: w.name ?? String(w.id) })) });
}

export async function disconnectPubler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  await store().removeConnection(caller.id, "publer");
  json(res, 200, { publer: null });
}

/** A ceiling that stops a script, never a person sending a month of drafts. */
const DRAFT_SENDS_PER_HOUR = 20;

export async function publerDrafts(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requirePro(bearer(req), "Sending drafts to a scheduler");
  rateLimit(`publer-drafts:${caller.id}`, DRAFT_SENDS_PER_HOUR, 3_600_000);
  const conn = await store().connection(caller.id, "publer");
  if (!conn) throw new HttpError(400, "Connect Publer first");
  const body = await readJson<{ carousels?: DraftItem[] }>(req, 2_000_000);
  const items = (body.carousels ?? []).slice(0, 100).map((c) => ({
    id: String(c.id ?? ""),
    name: String(c.name ?? ""),
    platform: String(c.platform ?? ""),
    caption: String(c.caption ?? "").slice(0, 5000),
    urls: Array.isArray(c.urls) ? c.urls.map(String) : [],
    alts: Array.isArray(c.alts) ? c.alts.map(String) : [],
    scheduledFor: typeof c.scheduledFor === "string" ? c.scheduledFor : null,
  }));
  if (!items.length) throw new HttpError(400, "Nothing to send");
  json(res, 200, { results: await sendDrafts(fetch, unseal(conn.secret), conn, items, sleep) });
}
