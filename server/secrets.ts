/**
 * Keys, signatures and the one secret this server keeps for somebody else
 * (Batch 31).
 *
 * - **API keys** are shown once and stored as a SHA-256 hash: a leaked table
 *   gives nobody a working key. The prefix stays readable so a person can tell
 *   their keys apart.
 * - **Webhook payloads** are signed the way Stripe signs them, an HMAC over
 *   `timestamp.body`, so a receiver can check both who sent it and that it is
 *   not a replay.
 * - **A scheduler's API key** (Publer's) has to be used, not just checked, so
 *   it is encrypted with AES-256-GCM under `CONNECTIONS_KEY`, which lives only
 *   in the server's environment. Read when called, never at import (env.test).
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { HttpError } from "./http.js";

export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** `fcc_` and 32 random bytes, URL-safe. Recognisable in a leaked log, which is the point of a prefix. */
export const newApiKey = (): string => `fcc_${randomBytes(32).toString("base64url")}`;

/** The first characters a person sees in a list of keys. Never enough to use. */
export const keyPrefix = (key: string): string => key.slice(0, 12);

export const newWebhookSecret = (): string => `whsec_${randomBytes(24).toString("base64url")}`;

/** The `FlashCC-Signature` header: `t=<unix seconds>,v1=<hex hmac of "t.body">`. */
export function signature(secret: string, body: string, at = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${at}.${body}`).digest("hex");
  return `t=${at},v1=${mac}`;
}

/** What a receiver runs. Here so the documentation's example and the tests use the same code. */
export function verifySignature(secret: string, body: string, header: string, now = Math.floor(Date.now() / 1000), tolerance = 300): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const at = Number(parts.t);
  if (!Number.isFinite(at) || Math.abs(now - at) > tolerance || !parts.v1) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${at}.${body}`).digest("hex"));
  const got = Buffer.from(parts.v1);
  return want.length === got.length && timingSafeEqual(want, got);
}

function connectionsKey(): Buffer {
  const raw = process.env.CONNECTIONS_KEY?.trim();
  if (!raw) throw new HttpError(503, "No CONNECTIONS_KEY. The server cannot keep a scheduler's key without it.");
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new HttpError(503, "CONNECTIONS_KEY must be 32 bytes, as 64 hex characters or base64.");
  return key;
}

/** `iv.tag.ciphertext`, base64url each. */
export function seal(plain: string, key = connectionsKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function unseal(sealed: string, key = connectionsKey()): string {
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !body) throw new HttpError(500, "A stored connection is unreadable");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
