/**
 * The public API (Batch 31.3), and the personal keys that open it.
 *
 * Three things to start: `/v1/decks` (words in, a laid-out document out: the
 * splitter), `/v1/render` (a document in, a PDF or numbered images out, per
 * platform), `/v1/runs` (a list of ideas in, carousels out, with progress
 * through webhooks). `docs/api.md` documents each with an example that runs.
 *
 * **Keys are Agency.** A key is shown once and stored as its SHA-256; a
 * leaked table opens nothing. Every request is attributed to its key, in the
 * log and in `last_used_at`, and the plan is checked on every request, so a
 * downgrade closes the API at once.
 *
 * **Nothing is metered (invariant 7), and the API is where that promise
 * costs most.** Each key has the same kind of abuse ceiling as the app, set
 * high enough that no ordinary integration meets one, and over it the answer
 * is a 429 with the reset time, never a bill. There is no per-call price, no
 * counter anybody is charged by, and no column that counts calls.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";

import JSZip from "jszip";

import { draftConfigured } from "./anthropic.js";
import { draftWords } from "./draft.js";
import { engine } from "./engine.js";
import { bearer, HttpError, json, limitWithReset, readJson } from "./http.js";
import { renderPdf, renderSlides, type RenderRequest } from "./render.js";
import { keyPrefix, newApiKey, sha256 } from "./secrets.js";
import { store, type ApiKeyRow } from "./store.js";
import { devPro, readBilling, requireAgency, requireCaller } from "./supabase.js";
import { emit } from "./webhooks.js";

const HOUR = 3_600_000;

/** Per key, per hour. Stated in the docs and on the keys screen, in these words. */
export const CEILINGS = {
  decks: { max: 600, window: HOUR },
  render: { max: 120, window: HOUR },
  runs: { max: 10, window: HOUR },
} as const;

export const CEILING_TEXT: Record<keyof typeof CEILINGS, string> = {
  decks: "600 decks an hour",
  render: "120 renders an hour",
  runs: "10 runs an hour, 50 ideas each",
};

export const MAX_KEYS = 10;
export const MAX_RUN_IDEAS = 50;

/* ── keys, from the app ───────────────────────────────────────────────────── */

const shown = (k: ApiKeyRow) => ({ id: k.id, name: k.name, prefix: k.prefix, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt, revokedAt: k.revokedAt });

export async function listKeys(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  json(res, 200, { keys: (await store().keysFor(caller.id)).map(shown), limits: CEILING_TEXT });
}

/** The key is in this answer and nowhere else, ever. */
export async function createKey(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireAgency(bearer(req), "The API");
  const body = await readJson<{ name?: string }>(req, 4_000);
  const live = (await store().keysFor(caller.id)).filter((k) => !k.revokedAt);
  if (live.length >= MAX_KEYS) throw new HttpError(400, `Up to ${MAX_KEYS} keys; revoke one first`);
  const secret = newApiKey();
  const row: ApiKeyRow = {
    id: randomUUID(),
    userId: caller.id,
    name: String(body.name ?? "").trim().slice(0, 60) || "Key",
    prefix: keyPrefix(secret),
    hash: sha256(secret),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  await store().addKey(row);
  json(res, 200, { key: shown(row), secret });
}

export async function revokeKey(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = await requireCaller(bearer(req));
  const body = await readJson<{ id?: string }>(req, 4_000);
  await store().revokeKey(caller.id, String(body.id ?? ""), new Date().toISOString());
  json(res, 200, { ok: true });
}

/* ── a request, attributed to its key ─────────────────────────────────────── */

export type Keyed = { key: ApiKeyRow };

/** The key behind a request, still valid, its owner still on Agency. */
export async function authKey(req: IncomingMessage, route: string): Promise<Keyed> {
  const raw = bearer(req);
  if (!raw?.startsWith("fcc_")) throw new HttpError(401, "Send your API key as: Authorization: Bearer fcc_...");
  const key = await store().keyByHash(sha256(raw));
  if (!key || key.revokedAt) throw new HttpError(401, "That API key is not valid");
  if (!devPro() && (await readBilling(key.userId)).plan !== "agency") throw new HttpError(402, "The API is part of Agency");
  void store()
    .touchKey(key.id, new Date().toISOString())
    .catch(() => undefined);
  console.log(`[v1] ${route} key=${key.prefix} user=${key.userId}`);
  return { key };
}

/** The ceiling for this key and route, with its headers on the answer. */
function ceiling(res: ServerResponse, key: ApiKeyRow, which: keyof typeof CEILINGS): void {
  const c = CEILINGS[which];
  const headers = limitWithReset(`v1:${which}:${key.id}`, c.max, c.window);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
}

/* ── /v1/decks ────────────────────────────────────────────────────────────── */

type DeckBody = { slides?: unknown; text?: unknown; framework?: unknown; look?: unknown; platform?: unknown; name?: unknown };

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function deckInput(body: DeckBody) {
  return {
    ...(Array.isArray(body.slides) ? { slides: body.slides.map((s) => String(s ?? "")) } : {}),
    ...(str(body.text) ? { text: str(body.text) } : {}),
    ...(str(body.framework) ? { framework: str(body.framework) } : {}),
    ...(str(body.look) ? { look: str(body.look) } : {}),
    ...(str(body.platform) ? { platform: str(body.platform) } : {}),
    ...(str(body.name) ? { name: str(body.name) } : {}),
  };
}

export async function v1Decks(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { key } = await authKey(req, "POST /v1/decks");
  ceiling(res, key, "decks");
  const body = await readJson<DeckBody>(req, 400_000);
  json(res, 200, await engine("deck", deckInput(body)));
}

/** What a caller may name: frameworks, looks and platforms, so nobody guesses ids. */
export async function v1Catalogue(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await authKey(req, "GET /v1/decks");
  json(res, 200, await engine("catalogue"));
}

/* ── /v1/render ───────────────────────────────────────────────────────────── */

/**
 * Pictures arrive as data URLs and nothing else: the server never fetches a
 * URL somebody put in a document (Batch 13), and the engine page refuses to.
 */
export function remoteSources(doc: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key = ""): void => {
    if (typeof v === "string") {
      if ((key === "src" || key === "url") && v && !v.startsWith("data:")) out.push(v);
      return;
    }
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(doc);
  return out;
}

function checkDocument(doc: unknown): void {
  const d = doc as { slides?: unknown[]; width?: unknown; height?: unknown } | null;
  if (!d || !Array.isArray(d.slides) || d.slides.length === 0) throw new HttpError(400, '"document" needs slides; make one with POST /v1/decks');
  if (d.slides.length > 60) throw new HttpError(400, "At most 60 slides");
  if (typeof d.width !== "number" || typeof d.height !== "number") throw new HttpError(400, '"document" needs a width and height');
  const remote = remoteSources(doc);
  if (remote.length) throw new HttpError(400, `Pictures must be data URLs; ${remote.length} point elsewhere (the server fetches nothing on a document's say-so)`);
}

export async function v1Render(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { key } = await authKey(req, "POST /v1/render");
  ceiling(res, key, "render");
  const body = await readJson<{ document?: unknown; platform?: string; output?: string }>(req, 60_000_000);
  checkDocument(body.document);
  const payload = await engine<RenderRequest & { output: "pdf" | "images"; name: string }>("payload", body.document, body.platform ?? "instagram");
  const output = body.output === "pdf" || body.output === "images" ? body.output : payload.output;
  const name = (payload.name || "carousel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "carousel";
  if (output === "pdf") {
    const pdf = await renderPdf(payload);
    res.writeHead(200, { "content-type": "application/pdf", "content-length": pdf.length, "content-disposition": `attachment; filename="${name}.pdf"` });
    res.end(pdf);
    return;
  }
  const slides = await renderSlides(payload);
  const ext = payload.format === "jpg" ? "jpg" : "png";
  const zip = new JSZip();
  for (const s of slides) zip.file(`${String(s.index + 1).padStart(2, "0")}.${ext}`, s.bytes);
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  res.writeHead(200, { "content-type": "application/zip", "content-length": out.length, "content-disposition": `attachment; filename="${name}.zip"` });
  res.end(out);
}

/* ── /v1/runs ─────────────────────────────────────────────────────────────── */

export type Run = {
  id: string;
  userId: string;
  keyId: string;
  status: "running" | "done" | "failed";
  total: number;
  done: number;
  documents: (unknown | null)[];
  failures: { index: number; error: string }[];
  createdAt: string;
  finishedAt: string | null;
};

function runDir(): string {
  return process.env.RUN_DIR || join(process.cwd(), ".data", "runs");
}

async function saveRun(run: Run): Promise<void> {
  await mkdir(runDir(), { recursive: true });
  const file = join(runDir(), `${run.id}.json`);
  await writeFile(`${file}.part`, JSON.stringify(run));
  await rename(`${file}.part`, file);
}

async function loadRun(id: string): Promise<Run | null> {
  if (!/^run_[a-f0-9]{32}$/.test(id)) return null;
  try {
    return JSON.parse(await readFile(join(runDir(), `${id}.json`), "utf8")) as Run;
  } catch {
    return null;
  }
}

/** A run cut off by a restart is reported failed with what it finished, never left "running". */
export async function recoverRuns(): Promise<number> {
  let n = 0;
  try {
    for (const f of await readdir(runDir())) {
      if (!f.endsWith(".json")) continue;
      const run = await loadRun(f.slice(0, -5));
      if (run?.status === "running") {
        await saveRun({ ...run, status: "failed", finishedAt: new Date().toISOString(), failures: [...run.failures, { index: -1, error: "The server restarted during the run" }] });
        n += 1;
      }
    }
  } catch {
    /* No runs yet. */
  }
  return n;
}

type RunOptions = { framework?: string | undefined; look?: string | undefined; platform?: string | undefined; draft: boolean };

export type Maker = (idea: string, opts: RunOptions) => Promise<unknown>;

/** One carousel: drafted words when asked and possible, the framework's example words otherwise; laid out by the engine. */
export const makeCarousel: Maker = async (idea, opts) => {
  const look = { ...(opts.look ? { look: opts.look } : {}), ...(opts.platform ? { platform: opts.platform } : {}) };
  if (opts.draft && draftConfigured()) {
    const ask = await engine<{ framework: string; brief: string; structure: Parameters<typeof draftWords>[1] }>("draftStructure", idea, opts.framework);
    const words = await draftWords(ask.brief, ask.structure);
    return engine("drafted", words.slides, ask.framework, look);
  }
  return engine("idea", idea, { ...(opts.framework ? { framework: opts.framework } : {}), ...look });
};

/**
 * The run itself, in the background, one idea at a time. Each carousel is
 * kept the moment it is made; one that fails is named and the rest go on.
 */
export async function executeRun(run: Run, ideas: readonly string[], opts: RunOptions, make: Maker = makeCarousel): Promise<Run> {
  for (let i = 0; i < ideas.length; i += 1) {
    try {
      run.documents[i] = await make(ideas[i]!, opts);
    } catch (e) {
      run.documents[i] = null;
      run.failures.push({ index: i, error: e instanceof Error ? e.message : "Not made" });
    }
    run.done = i + 1;
    await saveRun(run);
    void emit(run.userId, "run.progress", { runId: run.id, index: i + 1, total: run.total, ok: run.documents[i] !== null });
  }
  run.status = run.failures.length === run.total ? "failed" : "done";
  run.finishedAt = new Date().toISOString();
  await saveRun(run);
  void emit(run.userId, "run.finished", { runId: run.id, count: run.total - run.failures.length, failed: run.failures.length });
  return run;
}

export async function v1CreateRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { key } = await authKey(req, "POST /v1/runs");
  ceiling(res, key, "runs");
  const body = await readJson<{ ideas?: unknown; framework?: unknown; look?: unknown; platform?: unknown; draft?: unknown }>(req, 200_000);
  const ideas = (Array.isArray(body.ideas) ? body.ideas : []).map((i) => String(i ?? "").trim()).filter(Boolean);
  if (!ideas.length) throw new HttpError(400, '"ideas" needs at least one idea');
  if (ideas.length > MAX_RUN_IDEAS) throw new HttpError(400, `At most ${MAX_RUN_IDEAS} ideas a run`);
  if (ideas.some((i) => i.length > 600)) throw new HttpError(400, "An idea is over 600 characters; an idea is a line, a brief is for /v1/decks");
  const draft = body.draft === true;
  if (draft && !draftConfigured()) throw new HttpError(503, "This server has no model key, so it cannot draft; send draft: false for the framework's own words");
  const run: Run = {
    id: `run_${randomUUID().replace(/-/g, "")}`,
    userId: key.userId,
    keyId: key.id,
    status: "running",
    total: ideas.length,
    done: 0,
    documents: [],
    failures: [],
    createdAt: new Date().toISOString(),
    finishedAt: null,
  };
  await saveRun(run);
  void executeRun(run, ideas, { framework: str(body.framework), look: str(body.look), platform: str(body.platform), draft });
  json(res, 202, { id: run.id, status: run.status, total: run.total, poll: `/v1/runs?id=${run.id}` });
}

export async function v1ReadRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { key } = await authKey(req, "GET /v1/runs");
  const id = new URL(req.url ?? "", "http://x").searchParams.get("id") ?? "";
  const run = await loadRun(id);
  // Another account's run does not exist, as far as this key is concerned.
  if (!run || run.userId !== key.userId) throw new HttpError(404, "No such run");
  const { userId: _u, keyId: _k, ...shownRun } = run;
  json(res, 200, shownRun);
}
