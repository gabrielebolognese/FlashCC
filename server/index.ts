/**
 * The server.
 *
 * It exists for the things a browser must not be trusted with: the Anthropic key
 * and the Supabase secret key that can write which plan someone is on. A payment
 * provider's key will belong on this list too, once one is wired again. Vite
 * proxies /api here in dev.
 *
 * No framework. A handful of routes do not need one.
 */
// FIRST, and it has to stay first. Every module below reads process.env when
// it is evaluated, and ES modules evaluate imports in declaration order. See
// env.ts for the bug this fixes.
import "./env.js";

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { angles } from "./angles.js";
import { alt, caption } from "./caption.js";
import { contrast } from "./contrast.js";
import { flatten } from "./flatten.js";
import { closeEngine } from "./engine.js";
import { createKey, listKeys, recoverRuns, revokeKey, v1Catalogue, v1CreateRun, v1Decks, v1ReadRun, v1Render } from "./v1.js";
import { connectPubler, disconnectPubler, publerDrafts, readConnections } from "./publer.js";
import { addWebhook, listWebhooks, removeWebhook, reportEvent, testWebhook, theOutbox } from "./webhooks.js";
import { distil } from "./distil.js";
import { tally } from "./tally.js";
import { learnVoice } from "./voice.js";
import { revise } from "./revise.js";
import { rewrite } from "./rewrite.js";
import { translate } from "./translate.js";
import { draft, draftConfigured, draftStatus, hooks } from "./draft.js";
import { exportDeck, renderDocument, renderImages } from "./export.js";
import { closeBrowser } from "./render.js";
import { HttpError, json } from "./http.js";
import { addComment, decide, readShare } from "./review.js";
import { stockConfigured, stockSearch, stockUsed } from "./stock.js";
import { devPro, hasSecretKey } from "./supabase.js";
import { ffmpegAvailable } from "./video.js";
import { createVideo, queue, readVideo, retryVideo, videoFile } from "./videoapi.js";

const PORT = Number(process.env.PORT ?? 8787);

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

const ROUTES: Record<string, Record<string, Handler>> = {
  POST: {
    "/api/draft": draft,
    "/api/hooks": hooks,
    "/api/rewrite": rewrite,
    "/api/revise": revise,
    "/api/translate": translate,
    "/api/angles": angles,
    "/api/caption": caption,
    "/api/alt": alt,
    "/api/distil": distil,
    "/api/voice/learn": learnVoice,
    "/api/review/comment": addComment,
    "/api/review/decision": decide,
    "/api/export": exportDeck,
    "/api/contrast": contrast,
    "/api/flatten": flatten,
    "/api/webhooks": addWebhook,
    "/api/webhooks/delete": removeWebhook,
    "/api/webhooks/test": testWebhook,
    "/api/events": reportEvent,
    "/api/schedulers/publer/connect": connectPubler,
    "/api/schedulers/publer/disconnect": disconnectPubler,
    "/api/schedulers/publer/drafts": publerDrafts,
    "/api/keys": createKey,
    "/api/keys/revoke": revokeKey,
    // The public API (31.3): keyed, Agency, ceilings with a reset time, no meter.
    "/v1/decks": v1Decks,
    "/v1/render": v1Render,
    "/v1/runs": v1CreateRun,
    "/api/slides": renderImages,
    "/api/document": renderDocument,
    "/api/stock": stockSearch,
    "/api/stock/used": stockUsed,
    "/api/video": createVideo,
    "/api/video/retry": retryVideo,
    /*
      The four /api/billing routes were here: checkout, portal, webhook and
      status. They were removed with the payment integration, to be rebuilt.

      The webhook is the one to be careful about when they come back. It is the
      only thing in this product permitted to change what plan somebody is on,
      and without a verified signature it is an open endpoint where anyone who
      guesses the URL can POST themselves a subscription.
    */
  },
  GET: {
    // The one route that answers to somebody with no account. See review.ts.
    "/api/review": readShare,
    // By id and token, the capability the POST handed back. See videoapi.ts.
    "/api/video": readVideo,
    "/api/video/file": videoFile,
    "/api/webhooks": listWebhooks,
    "/api/schedulers": readConnections,
    "/api/keys": listKeys,
    "/v1/decks": v1Catalogue,
    "/v1/runs": v1ReadRun,
  },
};

const server = createServer((req, res) => {
  // Query strings are for the browser's benefit, never for routing.
  const path = (req.url ?? "").split("?")[0] ?? "";

  if (req.method === "GET" && path === "/api/health") {
    return json(res, 200, {
      ok: true,
      export: true,
      // Whether this server can make videos at all: ffmpeg is the system's, not bundled.
      video: ffmpegAvailable(),
      draft: draftConfigured(),
      // Which stock photo providers have a key. The picker offers only these.
      stock: stockConfigured(),
      // No payment integration is wired. Reported rather than omitted, so the
      // answer to "can this take money" is explicit instead of absent.
      billing: false,
      secretKey: hasSecretKey(),
      // Counts of which checks fired since this process started. Codes, not
      // customers. See tally.ts for why this is not in the database.
      checks: tally(),
      // Loud on purpose. A paywall that is off should be impossible to miss.
      ...(devPro() ? { devPro: true } : {}),
    });
  }

  const handler = ROUTES[req.method ?? ""]?.[path];
  if (!handler) return json(res, 404, { error: "Not found" });

  void handler(req, res).catch((error: unknown) => {
    const known = error instanceof HttpError ? error : draftStatus(error);
    const statusCode = known ? ("status" in known ? known.status : 500) : 500;
    const message = known?.message ?? (error instanceof Error ? error.message : "Request failed");

    // The path, never the body: request bodies here carry access tokens.
    console.error(`[${path}] ${statusCode} ${message}`);
    if (!res.headersSent) {
      if (error instanceof HttpError && error.headers) for (const [k, v] of Object.entries(error.headers)) res.setHeader(k, v);
      json(res, statusCode, { error: message });
    }
  });
});

/*
 * The video queue is durable (jobs.ts): unfinished jobs from the last process
 * are picked up before the first request, and a deploy's SIGTERM gives the
 * job in hand a grace period, after which it is left for the next start.
 */
void queue.recover().then(({ requeued, failed }) => {
  if (requeued.length || failed.length) console.log(`video queue: ${requeued.length} resumed, ${failed.length} reported failed`);
});
const sweeper = setInterval(() => void queue.sweep(), 3600_000);
sweeper.unref();

// Webhook deliveries owed from the last process go first; then every 30 seconds (31.2).
const deliveries = setInterval(() => void theOutbox().tick(), 30_000);
deliveries.unref();
void theOutbox().tick();
// An API run cut off by the last process is reported failed, never left "running" (31.3).
void recoverRuns().then((n) => n && console.log(`api runs: ${n} interrupted by the restart, reported failed`));

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1);
    stopping = true;
    server.close();
    void queue
      .drain(Number(process.env.VIDEO_GRACE_MS ?? 25_000))
      .then(({ finished }) => {
        if (!finished) console.warn("video queue: stopping with a render in hand; the next start resumes it");
        return closeEngine().then(closeBrowser);
      })
      .finally(() => process.exit(0));
  });
}

server.listen(PORT, () => {
  const bits = [
    draftConfigured() ? "drafting" : "NO ANTHROPIC_API_KEY",
    "NO BILLING",
    hasSecretKey() ? "secret key" : "NO SUPABASE SECRET KEY",
    ffmpegAvailable() ? "video" : "NO FFMPEG",
  ];
  console.log(`server on http://localhost:${PORT} (${bits.join(" · ")})`);

  // Its own line, not a word in a list, because this one turns the paywall
  // off and somebody has to notice it is on.
  if (devPro()) {
    console.warn("  DEV_PRO is on. Every signed-in account is treated as Pro.");
    console.warn("  Remove DEV_PRO from .env before this is anywhere real.");
  }
});
