/**
 * The small amount of plumbing a bare node:http server needs.
 *
 * No framework. There are four routes, and a router is not the interesting part of
 * this codebase.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export const json = (res: ServerResponse, code: number, body: unknown): void => {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
};

/**
 * The exact bytes, not a decoded string.
 *
 * A webhook signature is over the raw payload, so anything that re-encodes it,
 * string concatenation included, the moment a multi-byte character lands on a
 * chunk boundary, can produce a body that no longer matches. Every webhook then
 * fails verification, which looks exactly like a wrong secret.
 */
export function readRaw(req: IncomingMessage, limit = 1_000_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function readJson<T>(req: IncomingMessage, limit = 200_000): Promise<T> {
  const raw = await readRaw(req, limit);
  return JSON.parse(raw.toString("utf8")) as T;
}

/** The bearer token, or null. The caller decides whether that is fatal. */
export function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token === "" ? null : token;
}

/* ── rate limiting ────────────────────────────────────────────────────────── */

/**
 * A fixed window, in process, keyed by whatever the caller says identifies them.
 *
 * Lifted out of review.ts so the open export route and the open review route
 * share ONE implementation. Two would drift, and the one used less would drift
 * further.
 *
 * Its limits are real and worth stating: it resets on every deploy and does not
 * survive a second node. That is the right trade while there is one node, a
 * distributed limiter is infrastructure, and this is the thing that stops a
 * single script costing money this afternoon.
 */
const windows = new Map<string, { n: number; until: number }>();

export function rateLimit(key: string, max: number, windowMs = 60_000): void {
  const now = Date.now();
  const hit = windows.get(key);

  if (!hit || hit.until < now) {
    windows.set(key, { n: 1, until: now + windowMs });
    sweep(now);
    return;
  }

  hit.n += 1;
  if (hit.n > max) {
    throw new HttpError(429, "That is a lot of requests at once. Give it a minute.");
  }
}

/** Keeps the map from growing without bound on a long-lived process. */
function sweep(now: number): void {
  if (windows.size < 1000) return;
  for (const [key, hit] of windows) if (hit.until < now) windows.delete(key);
}

/**
 * Who to count against, for a route with no account behind it.
 *
 * `x-forwarded-for` first because anything deployed sits behind a proxy and the
 * socket address would otherwise be the proxy for every caller on earth, which
 * turns a per-caller limit into a global one and takes the whole service down
 * the first time somebody is impatient.
 */
export function callerKey(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return (first ?? req.socket.remoteAddress ?? "unknown").trim();
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Sent with the error: a 429's `Retry-After` and reset time (31.3). */
    readonly headers?: Record<string, string> | undefined,
  ) {
    super(message);
  }
}

/**
 * The same fixed window as `rateLimit`, for a caller who is owed the numbers:
 * an API key over its ceiling gets a 429 that says when it resets, never a
 * bill (31.3). Headers on every answer, the way every public API does it.
 */
export function limitWithReset(key: string, max: number, windowMs: number, now = Date.now()): Record<string, string> {
  let hit = windows.get(key);
  if (!hit || hit.until < now) {
    hit = { n: 0, until: now + windowMs };
    windows.set(key, hit);
    sweep(now);
  }
  hit.n += 1;
  const reset = Math.ceil(hit.until / 1000);
  const headers = {
    "x-ratelimit-limit": String(max),
    "x-ratelimit-remaining": String(Math.max(0, max - hit.n)),
    "x-ratelimit-reset": String(reset),
  };
  if (hit.n > max) {
    const wait = Math.max(1, Math.ceil((hit.until - now) / 1000));
    throw new HttpError(429, `Over this key's ceiling of ${max} until ${new Date(hit.until).toISOString()}. A need beyond it is a conversation, not an invoice.`, {
      ...headers,
      "retry-after": String(wait),
    });
  }
  return headers;
}
