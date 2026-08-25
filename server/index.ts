/**
 * Drafting server.
 *
 * The API key lives here and never reaches the browser — that is the whole reason
 * this process exists. Vite proxies /api to it in dev.
 */
import { createServer } from "node:http";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Node reads .env itself; absent is fine, the key check below reports it properly.
try {
  process.loadEnvFile();
} catch {
  /* no .env — fall back to the ambient environment */
}

const PORT = Number(process.env.PORT ?? 8787);
const MODEL = "claude-opus-5";

const DraftSchema = z.object({
  slides: z
    .array(
      z.object({
        role: z.string().describe("The slot id this text is for"),
        text: z.string().describe("The finished slide copy, ready to publish"),
      }),
    )
    .describe("One entry per slot, in the same order as the framework"),
});

type SlotSpec = { id: string; label: string; note: string; placeholder: string };
type DraftRequest = {
  brief: string;
  structure: { name: string; shape: string; slots: SlotSpec[] };
};

const SYSTEM = `You write social carousels. You are given a framework, the job each slide does, and a brief.

Rules:
- Write finished copy, not instructions or placeholders. Never write "your hook here".
- One idea per slide. If a slide needs an "and also", it belongs in two slides.
- Keep each slide short enough to read at a glance: the hook under 90 characters, body slides under 220.
- Match the job of each slot exactly. The hook decides whether slide 2 is seen, so make it specific — a number, a cost, a consequence — never a category.
- Write in the brief's own voice and vocabulary. Do not add claims, numbers, or results the brief does not contain.
- No hashtags, no emoji, no "in today's fast-paced world".
- Return one entry per slot, in order, using the given slot ids.`;

const json = (res: import("node:http").ServerResponse, code: number, body: unknown) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
};

async function draft(body: DraftRequest) {
  const client = new Anthropic();
  const slotLines = body.structure.slots
    .map((s, i) => `${i + 1}. id="${s.id}" — ${s.label}: ${s.note}. e.g. "${s.placeholder}"`)
    .join("\n");

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: {
      effort: "medium",
      format: zodOutputFormat(DraftSchema),
    },
    messages: [
      {
        role: "user",
        content:
          `Framework: ${body.structure.name} (${body.structure.shape})\n\n` +
          `Slots, in order:\n${slotLines}\n\n` +
          `Brief:\n${body.brief}`,
      },
    ],
  });

  // A policy decline returns 200 with no usable content — check before reading.
  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "the request was declined";
    throw Object.assign(new Error(`Claude declined this brief: ${why}`), { status: 422 });
  }

  const parsed = response.parsed_output;
  if (!parsed) throw Object.assign(new Error("Draft came back unreadable"), { status: 502 });
  return parsed;
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    return json(res, 200, { ok: true, configured: Boolean(process.env.ANTHROPIC_API_KEY) });
  }

  if (req.method !== "POST" || req.url !== "/api/draft") {
    return json(res, 404, { error: "Not found" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return json(res, 503, {
      error:
        "No ANTHROPIC_API_KEY. Copy .env.example to .env, add your key, and restart the server.",
    });
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 200_000) req.destroy();
  });

  req.on("end", () => {
    void (async () => {
      try {
        const body = JSON.parse(raw) as DraftRequest;
        if (!body?.brief?.trim()) return json(res, 400, { error: "Brief is empty" });
        if (!body.structure?.slots?.length) return json(res, 400, { error: "No framework given" });
        json(res, 200, await draft(body));
      } catch (error) {
        const status =
          error instanceof Anthropic.AuthenticationError
            ? 401
            : error instanceof Anthropic.RateLimitError
              ? 429
              : ((error as { status?: number }).status ?? 500);
        const message =
          error instanceof Anthropic.AuthenticationError
            ? "That API key was rejected."
            : error instanceof Anthropic.RateLimitError
              ? "Rate limited. Try again in a moment."
              : error instanceof Error
                ? error.message
                : "Drafting failed";
        console.error("[draft]", message);
        json(res, status, { error: message });
      }
    })();
  });
});

server.listen(PORT, () => {
  const configured = process.env.ANTHROPIC_API_KEY ? "key loaded" : "NO KEY — set ANTHROPIC_API_KEY";
  console.log(`draft server on http://localhost:${PORT} (${configured})`);
});
