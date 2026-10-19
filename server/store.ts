/**
 * Where the integrations keep their records (Batch 31): webhooks, API keys and
 * scheduler connections, in the tables `15-integrations.sql` adds.
 *
 * Every table is reached ONLY with the server's secret key: row level security
 * is on with no policies, so the browser can neither read a webhook's secret
 * nor list anybody's key hashes. The routes decide what a caller may see.
 *
 * Behind an interface, so the routes and the outbox are tested against an
 * in-memory store without a database.
 */
import { HttpError } from "./http.js";
import { serviceClient } from "./supabase.js";

export type WebhookRow = { id: string; userId: string; url: string; secret: string; events: string[]; createdAt: string };

export type ApiKeyRow = {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  hash: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type SchedulerAccount = { id: string; name: string; network: string };

export type ConnectionRow = {
  userId: string;
  tool: "publer";
  /** The tool's API key, sealed (`secrets.ts`). */
  secret: string;
  workspaceId: string;
  accounts: SchedulerAccount[];
  createdAt: string;
};

export interface IntegrationStore {
  webhooksFor(userId: string): Promise<WebhookRow[]>;
  webhook(id: string): Promise<WebhookRow | null>;
  addWebhook(row: WebhookRow): Promise<void>;
  removeWebhook(userId: string, id: string): Promise<void>;
  keysFor(userId: string): Promise<ApiKeyRow[]>;
  keyByHash(hash: string): Promise<ApiKeyRow | null>;
  addKey(row: ApiKeyRow): Promise<void>;
  revokeKey(userId: string, id: string, at: string): Promise<void>;
  touchKey(id: string, at: string): Promise<void>;
  connection(userId: string, tool: "publer"): Promise<ConnectionRow | null>;
  saveConnection(row: ConnectionRow): Promise<void>;
  removeConnection(userId: string, tool: "publer"): Promise<void>;
}

/* ── in memory, for tests ─────────────────────────────────────────────────── */

export function memoryStore(): IntegrationStore {
  const hooks: WebhookRow[] = [];
  const keys: ApiKeyRow[] = [];
  const conns: ConnectionRow[] = [];
  return {
    webhooksFor: async (u) => hooks.filter((h) => h.userId === u),
    webhook: async (id) => hooks.find((h) => h.id === id) ?? null,
    addWebhook: async (r) => void hooks.push(r),
    removeWebhook: async (u, id) => void hooks.splice(0, hooks.length, ...hooks.filter((h) => !(h.userId === u && h.id === id))),
    keysFor: async (u) => keys.filter((k) => k.userId === u),
    keyByHash: async (h) => keys.find((k) => k.hash === h) ?? null,
    addKey: async (r) => void keys.push(r),
    revokeKey: async (u, id, at) => {
      const k = keys.find((x) => x.userId === u && x.id === id);
      if (k) k.revokedAt = at;
    },
    touchKey: async (id, at) => {
      const k = keys.find((x) => x.id === id);
      if (k) k.lastUsedAt = at;
    },
    connection: async (u, t) => conns.find((c) => c.userId === u && c.tool === t) ?? null,
    saveConnection: async (r) => void conns.splice(0, conns.length, ...conns.filter((c) => !(c.userId === r.userId && c.tool === r.tool)), r),
    removeConnection: async (u, t) => void conns.splice(0, conns.length, ...conns.filter((c) => !(c.userId === u && c.tool === t))),
  };
}

/* ── Supabase ─────────────────────────────────────────────────────────────── */

const fail = (error: { message: string } | null): void => {
  if (error) throw new HttpError(500, error.message);
};

type HookDb = { id: string; user_id: string; url: string; secret: string; events: string[]; created_at: string };
type KeyDb = { id: string; user_id: string; name: string; prefix: string; hash: string; created_at: string; last_used_at: string | null; revoked_at: string | null };
type ConnDb = { user_id: string; tool: "publer"; secret: string; workspace_id: string; accounts: SchedulerAccount[]; created_at: string };

const hookRow = (r: HookDb): WebhookRow => ({ id: r.id, userId: r.user_id, url: r.url, secret: r.secret, events: r.events, createdAt: r.created_at });
const keyRow = (r: KeyDb): ApiKeyRow => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  prefix: r.prefix,
  hash: r.hash,
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at,
  revokedAt: r.revoked_at,
});

export function supabaseStore(): IntegrationStore {
  const db = () => serviceClient();
  return {
    async webhooksFor(u) {
      const { data, error } = await db().from("webhooks").select("*").eq("user_id", u);
      fail(error);
      return ((data ?? []) as HookDb[]).map(hookRow);
    },
    async webhook(id) {
      const { data, error } = await db().from("webhooks").select("*").eq("id", id).maybeSingle();
      fail(error);
      return data ? hookRow(data as HookDb) : null;
    },
    async addWebhook(r) {
      const { error } = await db().from("webhooks").insert({ id: r.id, user_id: r.userId, url: r.url, secret: r.secret, events: r.events, created_at: r.createdAt });
      fail(error);
    },
    async removeWebhook(u, id) {
      const { error } = await db().from("webhooks").delete().eq("user_id", u).eq("id", id);
      fail(error);
    },
    async keysFor(u) {
      const { data, error } = await db().from("api_keys").select("*").eq("user_id", u).order("created_at");
      fail(error);
      return ((data ?? []) as KeyDb[]).map(keyRow);
    },
    async keyByHash(h) {
      const { data, error } = await db().from("api_keys").select("*").eq("hash", h).maybeSingle();
      fail(error);
      return data ? keyRow(data as KeyDb) : null;
    },
    async addKey(r) {
      const { error } = await db().from("api_keys").insert({ id: r.id, user_id: r.userId, name: r.name, prefix: r.prefix, hash: r.hash, created_at: r.createdAt });
      fail(error);
    },
    async revokeKey(u, id, at) {
      const { error } = await db().from("api_keys").update({ revoked_at: at }).eq("user_id", u).eq("id", id);
      fail(error);
    },
    async touchKey(id, at) {
      const { error } = await db().from("api_keys").update({ last_used_at: at }).eq("id", id);
      fail(error);
    },
    async connection(u, t) {
      const { data, error } = await db().from("scheduler_connections").select("*").eq("user_id", u).eq("tool", t).maybeSingle();
      fail(error);
      const r = data as ConnDb | null;
      return r ? { userId: r.user_id, tool: r.tool, secret: r.secret, workspaceId: r.workspace_id, accounts: r.accounts ?? [], createdAt: r.created_at } : null;
    },
    async saveConnection(r) {
      const { error } = await db()
        .from("scheduler_connections")
        .upsert({ user_id: r.userId, tool: r.tool, secret: r.secret, workspace_id: r.workspaceId, accounts: r.accounts, created_at: r.createdAt });
      fail(error);
    },
    async removeConnection(u, t) {
      const { error } = await db().from("scheduler_connections").delete().eq("user_id", u).eq("tool", t);
      fail(error);
    },
  };
}

let current: IntegrationStore | null = null;

export const store = (): IntegrationStore => (current ??= supabaseStore());

/** Tests swap in `memoryStore()`. */
export const useStore = (s: IntegrationStore | null): void => {
  current = s;
};
