/**
 * The server.
 *
 * It exists for the things a browser must not be trusted with: the Anthropic key,
 * the Lemon Squeezy key, and the Supabase secret key that can write which plan
 * someone is on. Vite proxies /api here in dev.
 *
 * No framework. A handful of routes do not need one.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { billingConfigured, checkout, portal, status, webhook } from "./billing.js";
import { alt, caption } from "./caption.js";
import { distil } from "./distil.js";
import { tally } from "./tally.js";
import { learnVoice } from "./voice.js";
import { rewrite } from "./rewrite.js";
import { draft, draftConfigured, draftStatus, hooks } from "./draft.js";
import { exportDeck, renderDocument, renderImages } from "./export.js";
import { HttpError, json } from "./http.js";
import { addComment, decide, readShare } from "./review.js";
import { hasSecretKey } from "./supabase.js";

// Node reads .env itself; absent is fine, each route reports its own gap.
try {
  process.loadEnvFile();
} catch {
  /* no .env, fall back to the ambient environment */
}

const PORT = Number(process.env.PORT ?? 8787);

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

const ROUTES: Record<string, Record<string, Handler>> = {
  POST: {
    "/api/draft": draft,
    "/api/hooks": hooks,
    "/api/rewrite": rewrite,
    "/api/caption": caption,
    "/api/alt": alt,
    "/api/distil": distil,
    "/api/voice/learn": learnVoice,
    "/api/review/comment": addComment,
    "/api/review/decision": decide,
    "/api/export": exportDeck,
    "/api/slides": renderImages,
    "/api/document": renderDocument,
    "/api/billing/checkout": checkout,
    "/api/billing/portal": portal,
    "/api/billing/webhook": webhook,
  },
  GET: {
    "/api/billing/status": status,
    // The one route that answers to somebody with no account. See review.ts.
    "/api/review": readShare,
  },
};

const server = createServer((req, res) => {
  // Query strings are for the browser's benefit, never for routing.
  const path = (req.url ?? "").split("?")[0] ?? "";

  if (req.method === "GET" && path === "/api/health") {
    return json(res, 200, {
      ok: true,
      export: true,
      draft: draftConfigured(),
      billing: billingConfigured(),
      secretKey: hasSecretKey(),
      // Counts of which checks fired since this process started. Codes, not
      // customers. See tally.ts for why this is not in the database.
      checks: tally(),
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
    if (!res.headersSent) json(res, statusCode, { error: message });
  });
});

server.listen(PORT, () => {
  const bits = [
    draftConfigured() ? "drafting" : "NO ANTHROPIC_API_KEY",
    billingConfigured() ? "billing" : "no billing",
    hasSecretKey() ? "secret key" : "NO SUPABASE SECRET KEY",
  ];
  console.log(`server on http://localhost:${PORT} (${bits.join(" · ")})`);
});
