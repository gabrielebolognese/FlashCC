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
 * Stripe signs the raw payload, so anything that re-encodes it — string
 * concatenation included, the moment a multi-byte character lands on a chunk
 * boundary — can produce a body that no longer matches the signature. Every
 * webhook then fails verification, which looks exactly like a wrong secret.
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

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
