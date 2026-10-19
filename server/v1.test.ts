import type { IncomingMessage } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HttpError, limitWithReset } from "./http.js";
import { newApiKey, keyPrefix, sha256 } from "./secrets.js";
import { memoryStore, useStore, type IntegrationStore } from "./store.js";
import { authKey, CEILINGS, deckInput, executeRun, remoteSources, type Run } from "./v1.js";
import { theOutbox } from "./webhooks.js";

let dir: string;
let mem: IntegrationStore;
const secret = newApiKey();
const env = { ...process.env };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "fcc-v1-"));
  process.env.RUN_DIR = join(dir, "runs");
  process.env.WEBHOOK_DIR = join(dir, "hooks");
  process.env.DEV_PRO = "1";
  process.env.NODE_ENV = "test";
  mem = memoryStore();
  useStore(mem);
  await mem.addKey({ id: "k1", userId: "u1", name: "Zapier", prefix: keyPrefix(secret), hash: sha256(secret), createdAt: "2026-10-19T00:00:00.000Z", lastUsedAt: null, revokedAt: null });
});
afterAll(async () => {
  useStore(null);
  process.env = env;
  await rm(dir, { recursive: true, force: true });
});

const req = (auth?: string) => ({ headers: auth ? { authorization: auth } : {} }) as unknown as IncomingMessage;

describe("a request, attributed to its key (31.3)", () => {
  it("refuses no key, a session token, an unknown key and a revoked one", async () => {
    await expect(authKey(req(), "t")).rejects.toMatchObject({ status: 401 });
    await expect(authKey(req("Bearer eyJhbGciOi.session"), "t")).rejects.toMatchObject({ status: 401 });
    await expect(authKey(req(`Bearer ${newApiKey()}`), "t")).rejects.toMatchObject({ status: 401 });
    const revoked = newApiKey();
    await mem.addKey({ id: "k2", userId: "u1", name: "old", prefix: keyPrefix(revoked), hash: sha256(revoked), createdAt: "", lastUsedAt: null, revokedAt: "2026-10-01T00:00:00.000Z" });
    await expect(authKey(req(`Bearer ${revoked}`), "t")).rejects.toMatchObject({ status: 401 });
  });

  it("accepts a valid key, finds it by hash, and records when it was used", async () => {
    const { key } = await authKey(req(`Bearer ${secret}`), "POST /v1/decks");
    expect(key.id).toBe("k1");
    await new Promise((r) => setTimeout(r, 0));
    expect((await mem.keysFor("u1")).find((k) => k.id === "k1")!.lastUsedAt).not.toBeNull();
  });
});

describe("ceilings, never a meter", () => {
  it("answers a key over its ceiling with a 429 that says when it resets", () => {
    const now = 1_760_000_000_000;
    for (let i = 0; i < 3; i += 1) expect(limitWithReset("test:a", 3, 3_600_000, now)["x-ratelimit-remaining"]).toBe(String(2 - i));
    try {
      limitWithReset("test:a", 3, 3_600_000, now + 1000);
      throw new Error("no 429");
    } catch (e) {
      const err = e as HttpError;
      expect(err.status).toBe(429);
      expect(err.headers?.["retry-after"]).toBe("3599");
      expect(err.headers?.["x-ratelimit-reset"]).toBe(String(Math.ceil((now + 3_600_000) / 1000)));
      expect(err.message).toMatch(/conversation, not an invoice/);
    }
  });
  it("is set high enough that ordinary use never meets it", () => {
    expect(CEILINGS.decks.max).toBeGreaterThanOrEqual(600);
    expect(CEILINGS.render.max).toBeGreaterThanOrEqual(120);
  });
});

describe("what a request may carry", () => {
  it("keeps only the deck fields, as strings", () => {
    expect(deckInput({ slides: ["a", 2], framework: "educational", look: 5, extra: "x" } as never)).toEqual({ slides: ["a", "2"], framework: "educational" });
  });
  it("finds every picture that is not a data URL, however deep", () => {
    const doc = { slides: [{ image: { src: "https://evil.example/a.jpg" }, layers: [{ src: "data:image/png;base64,AA" }, { src: "http://10.0.0.1/x" }] }] };
    expect(remoteSources(doc)).toEqual(["https://evil.example/a.jpg", "http://10.0.0.1/x"]);
  });
});

describe("a run (31.3)", () => {
  it("makes each carousel in turn, names one that fails, keeps the rest, and reports progress to webhooks", async () => {
    await mem.addWebhook({ id: "h1", userId: "u1", url: "https://hooks.example.com/x", secret: "whsec", events: ["run.progress", "run.finished"], createdAt: "" });
    const run: Run = { id: `run_${"a".repeat(32)}`, userId: "u1", keyId: "k1", status: "running", total: 3, done: 0, documents: [], failures: [], createdAt: "", finishedAt: null };
    const made = await executeRun(run, ["one", "two", "three"], { draft: false }, async (idea) => {
      if (idea === "two") throw new Error("Unknown framework: nope");
      return { document: { name: idea } };
    });
    expect(made.status).toBe("done");
    expect(made.documents).toEqual([{ document: { name: "one" } }, null, { document: { name: "three" } }]);
    expect(made.failures).toEqual([{ index: 1, error: "Unknown framework: nope" }]);
    const saved = JSON.parse(await readFile(join(dir, "runs", `${run.id}.json`), "utf8")) as Run;
    expect(saved.done).toBe(3);
    await new Promise((r) => setTimeout(r, 50));
    const sent = (await theOutbox().forUser("u1")).map((d) => d.event).sort();
    expect(sent).toEqual(["run.finished", "run.progress", "run.progress", "run.progress"]);
  });
});
