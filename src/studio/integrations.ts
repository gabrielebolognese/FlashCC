/**
 * The browser's side of Batch 31's integrations: a scheduler connection and
 * drafts sent to it (31.1), webhooks (31.2) and personal API keys (31.3).
 *
 * Every secret lives on the server. The browser sends a Publer key once, to
 * be sealed there, and sees a webhook secret or an API key exactly once, in
 * the answer that made it; nothing here stores any of them.
 */
import { authHeader } from "./bearer.js";
import { readRefusal } from "./gate.js";
import type { PublishedCarousel } from "./schedulers.js";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...(await authHeader()), ...(init.headers ?? {}) } });
  if (!res.ok) throw await readRefusal(res);
  return (await res.json()) as T;
}

const post = <T>(path: string, body: unknown): Promise<T> => call<T>(path, { method: "POST", body: JSON.stringify(body) });

/* ── schedulers (31.1) ────────────────────────────────────────────────────── */

export type SchedulerAccount = { id: string; name: string; network: string };
export type PublerConnection = { connected: true; workspaceId: string; accounts: SchedulerAccount[]; since: string };

export const readConnections = () => call<{ publer: PublerConnection | null; verified: { publer: string } }>("/api/schedulers");
export const connectPubler = (apiKey: string, workspaceId?: string | undefined) =>
  post<{ publer: PublerConnection; workspaces: { id: string; name: string }[] }>("/api/schedulers/publer/connect", { apiKey, ...(workspaceId ? { workspaceId } : {}) });
export const disconnectPubler = () => post<{ publer: null }>("/api/schedulers/publer/disconnect", {});

export type DraftResult = { id: string; name: string; ok: true } | { id: string; name: string; ok: false; error: string };

/** Published carousels in, one Publer draft each, each one's outcome back. */
export const sendPublerDrafts = (carousels: readonly PublishedCarousel[]) =>
  post<{ results: DraftResult[] }>("/api/schedulers/publer/drafts", {
    carousels: carousels.map((c) => ({ id: c.id, name: c.name, platform: c.platform, caption: c.caption, urls: c.urls, alts: c.alts, scheduledFor: c.scheduledFor })),
  });

/* ── webhooks (31.2) ──────────────────────────────────────────────────────── */

export type Webhook = { id: string; url: string; events: string[]; createdAt: string };
export type Delivery = { id: string; hookId: string; event: string; state: "pending" | "delivered" | "failed"; attempts: number; lastStatus?: number; lastError?: string; createdAt: string };

export const listWebhooks = () => call<{ events: string[]; webhooks: Webhook[]; deliveries: Delivery[] }>("/api/webhooks");
export const addWebhook = (url: string, events: readonly string[]) => post<{ webhook: Webhook; secret: string }>("/api/webhooks", { url, events });
export const removeWebhook = (id: string) => post<{ ok: true }>("/api/webhooks/delete", { id });
export const testWebhook = (id: string) => post<{ delivery: { state: string; lastStatus?: number; lastError?: string } | null }>("/api/webhooks/test", { id });

/** What each event means, in the person's words. */
export const EVENT_LABELS: Record<string, string> = {
  "carousel.published": "A carousel was published (its slides are hosted)",
  "run.progress": "An API run finished one carousel",
  "run.finished": "A run finished",
  "review.approved": "A reviewer approved",
  "review.changes_requested": "A reviewer asked for changes",
  "export.ready": "A video export is ready",
};

/**
 * Something the app did that the person's webhooks may want: ids and URLs
 * only, the server drops anything else. Never throws, never waits: a webhook
 * must not slow down or fail the thing that happened, and signed out there
 * is nobody's hooks to tell.
 */
export function reportEvent(type: "carousel.published" | "run.finished", data: Record<string, unknown>): void {
  void authHeader()
    .then((headers) => fetch("/api/events", { method: "POST", headers, body: JSON.stringify({ type, data }) }))
    .catch(() => undefined);
}

/* ── API keys (31.3) ──────────────────────────────────────────────────────── */

export type ApiKey = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

export const listKeys = () => call<{ keys: ApiKey[]; limits: Record<string, string> }>("/api/keys");
export const createKey = (name: string) => post<{ key: ApiKey; secret: string }>("/api/keys", { name });
export const revokeKey = (id: string) => post<{ ok: true }>("/api/keys/revoke", { id });
