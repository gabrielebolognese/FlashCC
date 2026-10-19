import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { keyPrefix, newApiKey, seal, sha256, signature, unseal, verifySignature } from "./secrets.js";
import type { WebhookRow } from "./store.js";
import { BACKOFF, checkHookUrl, isPrivateAddress, MAX_ATTEMPTS, Outbox, sanitise, type Deps } from "./webhooks.js";

const hook: WebhookRow = { id: "h1", userId: "u1", url: "https://hooks.example.com/in", secret: "whsec_test", events: ["review.approved"], createdAt: "2026-10-19T00:00:00.000Z" };

describe("what an event may carry (31.2)", () => {
  it("keeps ids, https URLs, numbers and dates, and drops words", () => {
    expect(
      sanitise({
        docId: "d_123",
        url: "https://cdn.example.com/s/1.jpg",
        slides: 7,
        at: "2026-10-19T10:00:00.000Z",
        title: "Why most carousels lose people",
        http: "http://example.com",
        "bad key": "x",
        urls: ["https://a.example/1.jpg", "not a url at all"],
      }),
    ).toEqual({ docId: "d_123", url: "https://cdn.example.com/s/1.jpg", slides: 7, at: "2026-10-19T10:00:00.000Z", urls: ["https://a.example/1.jpg"] });
  });
});

describe("where a webhook may point", () => {
  it("refuses http, credentials, localhost and private addresses", () => {
    expect(() => checkHookUrl("http://hooks.example.com")).toThrow(/https/);
    expect(() => checkHookUrl("https://u:p@hooks.example.com")).toThrow(/credentials/);
    for (const u of ["https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://[::1]/x", "https://169.254.169.254/latest"]) {
      expect(() => checkHookUrl(u), u).toThrow(/not reachable/);
    }
    expect(checkHookUrl("https://hooks.zapier.com/hooks/catch/1/abc").hostname).toBe("hooks.zapier.com");
  });
  it("knows the private ranges, v4 and v6", () => {
    for (const ip of ["10.1.2.3", "172.16.0.1", "192.168.1.1", "127.0.0.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("keys and signatures", () => {
  it("signs a body a receiver can verify, and rejects a tampered or stale one", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const header = signature("whsec_test", body, 1_700_000_000);
    expect(verifySignature("whsec_test", body, header, 1_700_000_010)).toBe(true);
    expect(verifySignature("whsec_test", `${body} `, header, 1_700_000_010)).toBe(false);
    expect(verifySignature("whsec_other", body, header, 1_700_000_010)).toBe(false);
    expect(verifySignature("whsec_test", body, header, 1_700_001_000)).toBe(false);
  });
  it("makes keys that are stored only as hashes, and seals a scheduler key", () => {
    const key = newApiKey();
    expect(key).toMatch(/^fcc_[A-Za-z0-9_-]{43}$/);
    expect(keyPrefix(key)).toHaveLength(12);
    expect(sha256(key)).toHaveLength(64);
    const k = Buffer.alloc(32, 7);
    const sealed = seal("publer-secret", k);
    expect(sealed).not.toContain("publer-secret");
    expect(unseal(sealed, k)).toBe("publer-secret");
    expect(() => unseal(sealed, Buffer.alloc(32, 8))).toThrow();
  });
});

describe("the outbox", () => {
  let dir: string;
  let now = 1_760_000_000_000;
  let calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  let answer = 200;
  let addresses = ["93.184.216.34"];
  let hooks: WebhookRow[] = [hook];

  const deps = (): Deps => ({
    dir,
    now: () => now,
    resolve: async () => addresses,
    hook: async (id) => hooks.find((h) => h.id === id) ?? null,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
      return new Response(null, { status: answer });
    }) as unknown as typeof fetch,
  });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fcc-hooks-"));
    calls = [];
    answer = 200;
    addresses = ["93.184.216.34"];
    hooks = [hook];
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("delivers only to hooks subscribed to the event, signed, with ids and no words", async () => {
    const box = new Outbox(deps());
    expect(await box.enqueue(hooks, "export.ready", { docId: "d1" })).toEqual([]);
    const [d] = await box.enqueue(hooks, "review.approved", { docId: "d1", note: "Love it" });
    await box.tick();
    expect(calls).toHaveLength(1);
    const sent = JSON.parse(calls[0]!.body);
    expect(sent).toMatchObject({ type: "review.approved", data: { docId: "d1" } });
    expect(sent.data.note).toBeUndefined();
    expect(verifySignature(hook.secret, calls[0]!.body, calls[0]!.headers["flashcc-signature"]!, Math.floor(now / 1000))).toBe(true);
    expect((await box.forUser("u1"))[0]).toMatchObject({ id: d!.id, state: "delivered", attempts: 1 });
  });

  it("retries a failing receiver with backoff, then records it failed", async () => {
    answer = 500;
    const box = new Outbox(deps());
    await box.enqueue(hooks, "review.approved", { docId: "d1" });
    await box.tick();
    for (let k = 0; k < BACKOFF.length; k += 1) {
      // Not before its time.
      now += BACKOFF[k]! * 1000 - 1000;
      await box.tick();
      expect(calls).toHaveLength(k + 1);
      now += 1000;
      await box.tick();
      expect(calls).toHaveLength(k + 2);
    }
    expect(calls).toHaveLength(MAX_ATTEMPTS);
    expect((await box.forUser("u1"))[0]).toMatchObject({ state: "failed", lastStatus: 500 });
  });

  it("is durable: a delivery owed when the process stopped is sent by the next", async () => {
    answer = 503;
    const first = new Outbox(deps());
    await first.enqueue(hooks, "review.approved", { docId: "d1" });
    await first.tick();
    answer = 204;
    now += BACKOFF[0]! * 1000;
    const second = new Outbox(deps());
    await second.tick();
    expect(calls).toHaveLength(2);
    expect((await second.forUser("u1"))[0]!.state).toBe("delivered");
  });

  it("never sends to an address that resolves inside a private network", async () => {
    addresses = ["10.0.0.7"];
    const box = new Outbox(deps());
    await box.enqueue(hooks, "review.approved", {});
    await box.tick();
    expect(calls).toHaveLength(0);
    expect((await box.forUser("u1"))[0]!.lastError).toMatch(/private network/);
  });

  it("drops a delivery whose hook was deleted", async () => {
    const box = new Outbox(deps());
    await box.enqueue(hooks, "review.approved", {});
    hooks = [];
    await box.tick();
    expect(calls).toHaveLength(0);
    expect((await box.forUser("u1"))[0]!.state).toBe("failed");
  });
});
