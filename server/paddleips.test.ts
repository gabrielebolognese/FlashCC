import type { IncomingMessage } from "node:http";

import { describe, expect, it } from "vitest";

import { allowed, inCidr, parseIps, sourceAddress } from "./paddleips.js";

/**
 * An address allowlist is easy to write in a way that looks like it works and
 * checks nothing. The three ways that happens are all here: it trusts a header
 * the caller controls, it fails to match a mapped IPv6 address so it rejects
 * everybody, or it compares CIDRs as strings.
 */

/** Paddle's live addresses, as `api.paddle.com/ips` returned them. */
const PADDLE = [
  "34.237.3.244/32",
  "34.195.105.136/32",
  "34.232.58.13/32",
  "35.155.119.135/32",
  "34.212.5.7/32",
  "52.11.166.252/32",
];

const req = (socket: string, forwarded?: string): IncomingMessage =>
  ({
    headers: forwarded === undefined ? {} : { "x-forwarded-for": forwarded },
    socket: { remoteAddress: socket },
  }) as unknown as IncomingMessage;

describe("which address is the caller", () => {
  it("is the socket, by default, and no header can change that", () => {
    // The attack: claim to be Paddle by saying so. x-forwarded-for is just a
    // header, and with no proxy in front of us there is nothing to believe.
    expect(sourceAddress(req("203.0.113.9", "34.237.3.244"), 0)).toBe("203.0.113.9");
  });

  it("reads one trusted proxy from the END of the chain, not the start", () => {
    // Our proxy appended the real caller last. Anything earlier was supplied by
    // the caller, so taking the first entry, the usual shortcut, takes a value
    // the attacker chose.
    const r = req("10.0.0.1", "34.237.3.244, 198.51.100.7");
    expect(sourceAddress(r, 1)).toBe("198.51.100.7");
    expect(sourceAddress(r, 0)).toBe("10.0.0.1");
  });

  it("counts further in for more proxies", () => {
    const r = req("10.0.0.1", "1.1.1.1, 2.2.2.2, 3.3.3.3");
    expect(sourceAddress(r, 1)).toBe("3.3.3.3");
    expect(sourceAddress(r, 2)).toBe("2.2.2.2");
  });

  it("unmaps an IPv4 address arriving over IPv6", () => {
    // Node hands back the mapped form whenever the server listens on IPv6,
    // which is the default on most hosts. Without this, nothing ever matches
    // and the allowlist refuses Paddle itself.
    expect(sourceAddress(req("::ffff:34.237.3.244"), 0)).toBe("34.237.3.244");
    expect(allowed(sourceAddress(req("::ffff:34.237.3.244"), 0), PADDLE)).toBe(true);
  });

  it("copes with a header split across several lines, and with none at all", () => {
    expect(sourceAddress(req("10.0.0.1", " 1.1.1.1 ,  2.2.2.2 "), 1)).toBe("2.2.2.2");
    expect(sourceAddress(req(""), 0)).toBe(null);
  });

  it("does not run off the front of the chain when hops is too high", () => {
    expect(sourceAddress(req("10.0.0.1", "1.1.1.1"), 9)).toBe(null);
  });
});

describe("is it inside the block", () => {
  it("matches Paddle's own addresses and nothing else", () => {
    expect(allowed("34.237.3.244", PADDLE)).toBe(true);
    expect(allowed("52.11.166.252", PADDLE)).toBe(true);
    expect(allowed("34.237.3.245", PADDLE)).toBe(false);
    expect(allowed("203.0.113.9", PADDLE)).toBe(false);
    expect(allowed(null, PADDLE)).toBe(false);
  });

  /**
   * Paddle publishes `/32`s today, so a string compare would pass this
   * afternoon. The field is called `ipv4_cidrs`, and a `/24` appearing in it
   * next year would silently stop matching real webhooks.
   */
  it("honours the prefix rather than comparing strings", () => {
    expect(inCidr("10.1.2.3", "10.1.2.0/24")).toBe(true);
    expect(inCidr("10.1.3.3", "10.1.2.0/24")).toBe(false);
    expect(inCidr("10.1.2.3", "10.0.0.0/8")).toBe(true);
    expect(inCidr("11.1.2.3", "10.0.0.0/8")).toBe(false);
    expect(inCidr("34.237.3.244", "34.237.3.244")).toBe(true);
  });

  /** A 32-bit shift in JS is signed, so /1 goes negative without a >>> 0. */
  it("gets the wide and narrow edges right", () => {
    expect(inCidr("200.0.0.1", "128.0.0.0/1")).toBe(true);
    expect(inCidr("100.0.0.1", "128.0.0.0/1")).toBe(false);
    expect(inCidr("1.2.3.4", "0.0.0.0/0")).toBe(true);
  });

  it("refuses anything it cannot read rather than guessing", () => {
    expect(inCidr("not an ip", "10.0.0.0/8")).toBe(false);
    expect(inCidr("10.0.0.1", "garbage")).toBe(false);
    expect(inCidr("10.0.0.1", "10.0.0.0/33")).toBe(false);
    expect(inCidr("10.0.0.1", "10.0.0.0/-1")).toBe(false);
    expect(inCidr("999.0.0.1", "999.0.0.0/8")).toBe(false);
    expect(inCidr("10.0.0", "10.0.0.0/8")).toBe(false);
    // An IPv6 caller cannot match an IPv4 list, and must not be let through by
    // a parser that shrugs.
    expect(inCidr("2001:db8::1", "10.0.0.0/8")).toBe(false);
  });
});

describe("reading Paddle's list", () => {
  it("takes the addresses out of the response they actually send", () => {
    expect(parseIps({ data: { ipv4_cidrs: PADDLE }, meta: { request_id: "x" } })).toEqual(PADDLE);
  });

  /**
   * Empty means "we do not know", which the caller reads as "allow, and let the
   * signature decide". Every shape that is not a list of strings has to arrive
   * here as empty rather than as a partial list, or a malformed response would
   * quietly become a deny-all.
   */
  it("is empty for anything that is not a list of addresses", () => {
    expect(parseIps(null)).toEqual([]);
    expect(parseIps({})).toEqual([]);
    expect(parseIps({ data: {} })).toEqual([]);
    expect(parseIps({ data: { ipv4_cidrs: "34.237.3.244/32" } })).toEqual([]);
    expect(parseIps({ ipv4_cidrs: PADDLE })).toEqual([]);
  });

  it("drops a non-string entry instead of carrying it into a match", () => {
    expect(parseIps({ data: { ipv4_cidrs: ["10.0.0.0/8", 42, null] } })).toEqual(["10.0.0.0/8"]);
  });
});
