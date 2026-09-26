/**
 * Only Paddle may POST to the webhook, checked by address.
 *
 * ── This is the second lock, not the lock ────────────────────────────────────
 *
 * The signature is what makes the webhook safe: it is an HMAC nobody without the
 * secret can produce, over the exact bytes sent. An address check adds a layer
 * that stops junk before we hash it and narrows the blast radius if the secret
 * ever leaks, and that is all it is for. Every decision below follows from that
 * ordering, and two of them look wrong until you hold it in mind.
 *
 * **It fails OPEN.** If `api.paddle.com/ips` cannot be reached, requests are
 * allowed through to the signature check with a warning. Failing closed would
 * mean an outage at Paddle's status endpoint stops plans being granted to people
 * who have paid, which is a self-inflicted outage caused by a defence-in-depth
 * layer. The signature is still doing its job.
 *
 * **The list is never hard-coded.** Paddle's addresses change, and a copy in a
 * source file is a copy that goes stale silently and then rejects real webhooks.
 * The endpoint is the source of truth, fetched once and cached.
 */
import type { IncomingMessage } from "node:http";

const IPS_URL = "https://api.paddle.com/ips";

/** Twelve hours. Their list changes rarely, and a stale entry fails open anyway. */
const TTL_MS = 12 * 60 * 60 * 1000;

/**
 * How many reverse proxies we actually control sit in front of this process.
 *
 * Zero by default, which means the socket address is the caller. This matters
 * far more than it looks: `x-forwarded-for` is a header, anybody can send one,
 * so trusting it blindly would let a request claim to come from Paddle by
 * saying so. `callerKey` in `http.ts` does trust it, and that is fine for rate
 * limiting where the worst case is somebody evading their own limit. It is not
 * fine here.
 */
const HOPS = Math.max(0, Math.floor(Number(process.env.TRUST_PROXY_HOPS ?? 0)) || 0);

/* ── addresses ────────────────────────────────────────────────────────────── */

/**
 * The address to judge, taken from the end of the chain inwards.
 *
 * The chain is every `x-forwarded-for` entry followed by the socket address, and
 * each proxy appends. So the entry our own outermost proxy wrote is the LAST
 * one, and anything earlier was supplied by the caller. Counting from the end by
 * the number of hops we control is the only way to read this that a caller
 * cannot forge; taking the first entry, which is the usual shortcut, takes a
 * value the caller chose.
 */
export function sourceAddress(req: IncomingMessage, hops: number = HOPS): string | null {
  const header = req.headers["x-forwarded-for"];
  const forwarded = (Array.isArray(header) ? header.join(",") : (header ?? ""))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const chain = [...forwarded, req.socket.remoteAddress ?? ""];
  const at = chain.length - 1 - hops;
  const value = at >= 0 ? chain[at] : undefined;
  return value ? normalise(value) : null;
}

/**
 * `::ffff:34.237.3.244` is the same address as `34.237.3.244`.
 *
 * Node hands back the mapped form whenever the server is listening on IPv6,
 * which is the default on most hosts, so without this every single address fails
 * to match and the allowlist refuses Paddle itself.
 */
function normalise(address: string): string {
  const trimmed = address.trim().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  return mapped?.[1] ?? trimmed;
}

const toLong = (ip: string): number | null => {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out;
};

/**
 * Is this address inside this block?
 *
 * Paddle publishes `/32`s today, one address each, so a plain string compare
 * would work this afternoon. The field is called `ipv4_cidrs` and a `/24` in it
 * next year would silently stop matching, so the prefix is honoured properly.
 */
export function inCidr(ip: string, cidr: string): boolean {
  const [network, bitsRaw] = cidr.split("/");
  if (!network) return false;

  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const a = toLong(normalise(ip));
  const b = toLong(network.trim());
  if (a === null || b === null) return false;

  if (bits === 0) return true;
  // >>> 0 because a 32-bit shift in JS is signed, and /1 would go negative.
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

export const allowed = (ip: string | null, cidrs: readonly string[]): boolean =>
  ip !== null && cidrs.some((cidr) => inCidr(ip, cidr));

/* ── the list ─────────────────────────────────────────────────────────────── */

let cache: { cidrs: string[]; at: number } | null = null;
let inFlight: Promise<string[]> | null = null;

export function parseIps(body: unknown): string[] {
  const list = (body as { data?: { ipv4_cidrs?: unknown } } | null)?.data?.ipv4_cidrs;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Paddle's addresses, cached, and never allowed to fail the request.
 *
 * An empty array means "we do not know", which callers read as "allow". A stale
 * list is kept and reused when a refresh fails: a list from this morning is a
 * better filter than no list, and it still cannot reject a genuine webhook
 * because the signature is the thing that decides.
 */
export async function paddleIps(now: number = Date.now()): Promise<string[]> {
  if (cache && now - cache.at < TTL_MS) return cache.cidrs;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await fetch(IPS_URL, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(String(response.status));

      const cidrs = parseIps(await response.json());
      if (cidrs.length === 0) throw new Error("no addresses in the response");

      cache = { cidrs, at: now };
      return cidrs;
    } catch (e) {
      const why = e instanceof Error ? e.message : "unknown";
      if (cache) {
        console.warn(`[billing] could not refresh Paddle's IPs (${why}), using the cached list`);
        return cache.cidrs;
      }
      console.warn(`[billing] could not reach ${IPS_URL} (${why}), allowing by signature alone`);
      return [];
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * The check the webhook route runs. True means "let it reach the signature".
 *
 * Logs the address it turned away, because the one thing somebody debugging a
 * silently rejected webhook needs is what address it actually arrived from,
 * which is usually a proxy they did not know was there.
 */
export async function fromPaddle(req: IncomingMessage): Promise<boolean> {
  const cidrs = await paddleIps();
  if (cidrs.length === 0) return true;

  const ip = sourceAddress(req);
  if (allowed(ip, cidrs)) return true;

  console.warn(`[billing] webhook from ${ip ?? "an unknown address"}, which is not Paddle`);
  return false;
}

/** For a test, and for the local development case where no request is real. */
export function resetIpCache(): void {
  cache = null;
  inFlight = null;
}
