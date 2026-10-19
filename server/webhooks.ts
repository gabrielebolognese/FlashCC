/**
 * Outgoing webhooks (Batch 31.2): the cheapest integration surface there is.
 * A Zapier or Make user wires FlashCC into anything without FlashCC building
 * each connection.
 *
 * - **Events carry ids and URLs, never document contents** (`sanitise`). A
 *   receiver that wants the words asks for them with a key it holds.
 * - **Signed** (`secrets.ts`): `FlashCC-Signature: t=..,v1=..`, an HMAC over
 *   `timestamp.body` with the hook's own secret, shown once when it is made.
 * - **Retried with backoff, durably**: every delivery is written to disk
 *   before it is attempted, the same rule as the video queue (26.5), so a
 *   restart re-sends what was owed. Six attempts over about fifteen hours,
 *   then it is recorded as failed and left for the person to see.
 * - **Never a way into the server's network**: https only, no address that is
 *   or resolves to a private, loopback or link-local range, redirects not
 *   followed. A webhook URL is somebody else's input.
 */
import { lookup } from "node:dns/promises";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { bearer, HttpError, json, rateLimit, readJson } from "./http.js";
import { newWebhookSecret, signature } from "./secrets.js";
import { store, type WebhookRow } from "./store.js";
import { requireCaller, requirePro } from "./supabase.js";

export const EVENTS = [
  "carousel.published",
  "run.progress",
  "run.finished",
  "review.approved",
  "review.changes_requested",
  "export.ready",
] as const;

export type EventType = (typeof EVENTS)[number] | "ping";

export const isEvent = (e: unknown): e is (typeof EVENTS)[number] => typeof e === "string" && (EVENTS as readonly string[]).includes(e);

/** Seconds to wait before attempt 2, 3, ... 6. */
export const BACKOFF = [60, 5 * 60, 30 * 60, 2 * 3600, 12 * 3600];
export const MAX_ATTEMPTS = BACKOFF.length + 1;
export const MAX_HOOKS = 10;

/* ── what an event may carry ──────────────────────────────────────────────── */

const ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const isUrl = (v: string): boolean => /^https:\/\/[^\s]{1,2000}$/.test(v);

/**
 * Ids, https URLs, numbers, booleans and ISO dates, under keys that are
 * words. Anything else is dropped, so no route can leak a slide's text into
 * somebody's Zapier history by accident.
 */
export function sanitise(data: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!data || typeof data !== "object") return out;
  const ok = (v: unknown): boolean =>
    typeof v === "number" ? Number.isFinite(v) : typeof v === "boolean" ? true : typeof v === "string" ? ID.test(v) || isUrl(v) || /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v) : false;
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (!/^[a-z][A-Za-z0-9]{0,40}$/.test(k)) continue;
    if (Array.isArray(v)) {
      const kept = v.filter(ok).slice(0, 100);
      if (kept.length) out[k] = kept;
    } else if (ok(v)) out[k] = v;
  }
  return out;
}

/* ── where a webhook may point ────────────────────────────────────────────── */

/** Private, loopback, link-local, carrier-grade NAT, multicast and unspecified ranges, v4 and v6. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

/** The shape check, at the moment a hook is added. The address check runs again at every delivery. */
export function checkHookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "That is not a URL");
  }
  if (url.protocol !== "https:") throw new HttpError(400, "Webhook URLs must be https");
  if (url.username || url.password) throw new HttpError(400, "Put no credentials in the URL; use the signing secret");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || (isIP(host) && isPrivateAddress(host))) {
    throw new HttpError(400, "That address is not reachable from the internet");
  }
  return url;
}

export type Resolver = (host: string) => Promise<string[]>;

const dnsResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

/* ── the outbox ───────────────────────────────────────────────────────────── */

export type Delivery = {
  id: string;
  hookId: string;
  userId: string;
  url: string;
  event: EventType;
  body: string;
  attempts: number;
  /** Epoch ms of the next attempt. */
  next: number;
  state: "pending" | "delivered" | "failed";
  lastStatus?: number | undefined;
  lastError?: string | undefined;
  createdAt: string;
};

export type Deps = {
  dir: string;
  fetch: typeof fetch;
  resolve: Resolver;
  now: () => number;
  hook: (id: string) => Promise<WebhookRow | null>;
};

/** Kept for a week, so a person can see what was sent and what failed. */
const KEEP_MS = 7 * 24 * 3600_000;

export class Outbox {
  private items: Delivery[] = [];
  private loaded = false;
  private writing: Promise<void> = Promise.resolve();
  private busy = false;

  constructor(private readonly deps: Deps) {}

  private get file(): string {
    return join(this.deps.dir, "outbox.json");
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      this.items = JSON.parse(await readFile(this.file, "utf8")) as Delivery[];
    } catch {
      this.items = [];
    }
  }

  /** Serialised, and to a temporary name first: a crash mid-write never leaves half a file. */
  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.items);
    this.writing = this.writing.then(async () => {
      await mkdir(this.deps.dir, { recursive: true });
      await writeFile(`${this.file}.part`, snapshot);
      await rename(`${this.file}.part`, this.file);
    });
    return this.writing;
  }

  /** One delivery per hook subscribed to the event, written down before anything is sent. */
  async enqueue(hooks: readonly WebhookRow[], event: EventType, data: unknown): Promise<Delivery[]> {
    await this.load();
    const created = new Date(this.deps.now()).toISOString();
    const made = hooks
      .filter((h) => event === "ping" || h.events.includes(event))
      .map((h): Delivery => {
        const id = `evt_${randomUUID().replace(/-/g, "")}`;
        return {
          id,
          hookId: h.id,
          userId: h.userId,
          url: h.url,
          event,
          body: JSON.stringify({ id, type: event, created, data: sanitise(data) }),
          attempts: 0,
          next: this.deps.now(),
          state: "pending",
          createdAt: created,
        };
      });
    if (!made.length) return [];
    this.items.push(...made);
    await this.persist();
    return made;
  }

  /** Everything due, once. Called on a timer and after every enqueue. */
  async tick(): Promise<void> {
    await this.load();
    if (this.busy) return;
    this.busy = true;
    try {
      const now = this.deps.now();
      this.items = this.items.filter((d) => d.state === "pending" || now - Date.parse(d.createdAt) < KEEP_MS);
      for (const d of this.items.filter((x) => x.state === "pending" && x.next <= now)) {
        await this.attempt(d);
        await this.persist();
      }
    } finally {
      this.busy = false;
    }
  }

  private async attempt(d: Delivery): Promise<void> {
    const hook = await this.deps.hook(d.hookId);
    // A hook deleted since: nobody is waiting for it any more.
    if (!hook) {
      d.state = "failed";
      d.lastError = "The webhook was deleted";
      return;
    }
    d.attempts += 1;
    try {
      const url = new URL(hook.url);
      const addresses = await this.deps.resolve(url.hostname.replace(/^\[|\]$/g, ""));
      if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("The address resolves inside a private network");
      const res = await this.deps.fetch(hook.url, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "content-type": "application/json",
          "user-agent": "FlashCC-Webhooks/1",
          "flashcc-event": d.event,
          "flashcc-delivery": d.id,
          "flashcc-signature": signature(hook.secret, d.body, Math.floor(this.deps.now() / 1000)),
        },
        body: d.body,
      });
      d.lastStatus = res.status;
      if (res.status >= 200 && res.status < 300) {
        d.state = "delivered";
        d.lastError = undefined;
        return;
      }
      throw new Error(`The receiver answered ${res.status}`);
    } catch (e) {
      d.lastError = e instanceof Error ? e.message : "Delivery failed";
      if (d.attempts >= MAX_ATTEMPTS) d.state = "failed";
      else d.next = this.deps.now() + (BACKOFF[d.attempts - 1] ?? BACKOFF.at(-1)!) * 1000;
    }
  }

  async forUser(userId: string): Promise<Delivery[]> {
    await this.load();
    return this.items.filter((d) => d.userId === userId).slice(-50).reverse();
  }
}

/** Read when first used, never at import (env.test.ts). */
let outbox: Outbox | null = null;

export function theOutbox(): Outbox {
  outbox ??= new Outbox({
    dir: process.env.WEBHOOK_DIR || join(process.cwd(), ".data", "webhooks"),
    fetch,
    resolve: dnsResolver,
    now: Date.now,
    hook: (id) => store().webhook(id),
  });
  return outbox;
}

/**
 * Something happened that a person's hooks may want to hear about. Never
 * throws: a webhook that cannot be queued must not fail the thing that
 * happened.
 */
export async function emit(userId: string, event: EventType, data: Record<string, unknown>): Promise<void> {
  try {
    const hooks = await store().webhooksFor(userId);
    if (!hooks.length) return;
    await theOutbox().enqueue(hooks, event, data);
    void theOutbox().tick();
  } catch (e) {
    console.warn(`[webhooks] ${event} for ${userId} not queued: ${e instanceof Error ? e.message : e}`);
  }
}

/* ── routes ───────────────────────────────────────────────────────────────── */

const masked = (h: WebhookRow) => ({ id: h.id, url: h.url, events: h.events, createdAt: h.createdAt });

export async function listWebhooks(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  const [hooks, deliveries] = await Promise.all([store().webhooksFor(caller.id), theOutbox().forUser(caller.id)]);
  json(res, 200, {
    events: EVENTS,
    webhooks: hooks.map(masked),
    deliveries: deliveries.map(({ body: _b, userId: _u, ...d }) => d),
  });
}

/** Pro, like the rest of the pipeline. The secret is in this answer and nowhere else, ever. */
export async function addWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requirePro(bearer(req), "Webhooks");
  rateLimit(`webhooks:${caller.id}`, 20);
  const body = await readJson<{ url?: string; events?: unknown[] }>(req, 16_000);
  const url = checkHookUrl(String(body.url ?? "").trim());
  const events = [...new Set((body.events ?? []).filter(isEvent))];
  if (!events.length) throw new HttpError(400, `Choose at least one event: ${EVENTS.join(", ")}`);
  const existing = await store().webhooksFor(caller.id);
  if (existing.length >= MAX_HOOKS) throw new HttpError(400, `Up to ${MAX_HOOKS} webhooks; remove one first`);
  const row: WebhookRow = { id: randomUUID(), userId: caller.id, url: url.toString(), secret: newWebhookSecret(), events, createdAt: new Date().toISOString() };
  await store().addWebhook(row);
  json(res, 200, { webhook: masked(row), secret: row.secret });
}

export async function removeWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  const body = await readJson<{ id?: string }>(req, 4_000);
  await store().removeWebhook(caller.id, String(body.id ?? ""));
  json(res, 200, { ok: true });
}

/** A `ping` to one hook, so a person can see their receiver work before anything real happens. */
export async function testWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  rateLimit(`webhook-test:${caller.id}`, 10);
  const body = await readJson<{ id?: string }>(req, 4_000);
  const hook = (await store().webhooksFor(caller.id)).find((h) => h.id === body.id);
  if (!hook) throw new HttpError(404, "No such webhook");
  const [d] = await theOutbox().enqueue([hook], "ping", { webhookId: hook.id });
  await theOutbox().tick();
  json(res, 200, { delivery: d ? { id: d.id, state: d.state, lastStatus: d.lastStatus, lastError: d.lastError } : null });
}

/**
 * Events that happen in the browser (a carousel published from the app, a run
 * finished there), reported by the signed-in owner and delivered to their own
 * hooks only. Two kinds, ids and URLs only.
 */
const CLIENT_EVENTS = new Set<EventType>(["carousel.published", "run.finished"]);

export async function reportEvent(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  rateLimit(`events:${caller.id}`, 120);
  const body = await readJson<{ type?: string; data?: unknown }>(req, 32_000);
  if (!isEvent(body.type) || !CLIENT_EVENTS.has(body.type)) throw new HttpError(400, "Not an event the app reports");
  await emit(caller.id, body.type, sanitise(body.data));
  json(res, 200, { ok: true });
}
