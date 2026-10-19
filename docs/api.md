# The FlashCC API

Three endpoints that do what the app does, for people who build their own
pipeline. On the **Agency** plan. Every example below runs as written once
`FCC` holds a key and `BASE` points at the server.

```sh
export BASE=https://your-flashcc-server   # the API server, port 8787 in development
export FCC=fcc_...                        # Integrations, API keys, New key
```

## What it costs

Nothing per call, ever. There are no credits and no metered tier. Each key has
ceilings that stop a runaway script, set high enough that an ordinary
integration never meets them:

| Endpoint | Ceiling, per key |
| --- | --- |
| `POST /v1/decks` | 600 decks an hour |
| `POST /v1/render` | 120 renders an hour |
| `POST /v1/runs` | 10 runs an hour, 50 ideas each |

Every answer carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
`X-RateLimit-Reset` (Unix seconds). Over a ceiling, the answer is a **429** with
`Retry-After` (seconds) and the reset time in the message, never a bill:

```json
{ "error": "Over this key's ceiling of 120 until 2026-10-19T11:00:00.000Z. A need beyond it is a conversation, not an invoice." }
```

A need beyond a ceiling is a conversation, not an invoice: write to us and the
ceiling is raised for that key.

## Keys

Make a key under **Integrations, API keys**. It is shown once; FlashCC keeps
only its SHA-256. Send it as a bearer token:

```
Authorization: Bearer fcc_...
```

Every request is attributed to the key that made it (the server logs the
route, the key's prefix and the account). Revoking a key stops it at once.
Up to ten live keys an account.

| Status | Means |
| --- | --- |
| 400 | The request is wrong; the message says how. |
| 401 | No key, or a key that is not valid or was revoked. |
| 402 | The account is not on Agency. |
| 429 | Over a ceiling; see above. |
| 503 | The server cannot do this right now (no model key for `draft`, or the layout engine is not reachable). |

## `GET /v1/decks`: what you can name

The frameworks, looks and platforms, by id, so nothing is guessed.

```sh
curl -s "$BASE/v1/decks" -H "Authorization: Bearer $FCC"
```

```json
{
  "frameworks": [{ "id": "educational", "name": "Educational / Value", "range": [5, 10] }],
  "looks": [{ "id": "dark", "name": "Dark" }, { "id": "pack:classroom", "name": "Classroom" }],
  "platforms": [{ "id": "instagram", "name": "Instagram", "width": 1080, "height": 1350 }]
}
```

## `POST /v1/decks`: words in, a laid-out deck out

The splitter. Send **one string per slide**, or **long-form text** (an
article, a newsletter, up to 40,000 characters) and FlashCC splits it into
slides itself, deterministically: the same text gives the same deck.
`*accent*`, `**bold**` and `==highlight==` work in the words.

| Field | |
| --- | --- |
| `slides` | `string[]`, one per slide. Or: |
| `text` | `string`, long-form, split into slides for you. |
| `framework` | optional, an id from `GET /v1/decks` |
| `look` | optional, a style id or `pack:<id>` |
| `platform` | optional, default `instagram`; the deck is laid out at its size and inside its safe area |
| `name` | optional |

```sh
curl -s "$BASE/v1/decks" \
  -H "Authorization: Bearer $FCC" -H "Content-Type: application/json" \
  -d '{"slides":["Why slide two loses people","Keep the promise in the first *five* words.","One idea a slide.","Follow for the next one"],"framework":"educational","platform":"linkedin"}' \
  > deck.json
```

```json
{ "document": { "width": 1080, "height": 1350, "slides": [] }, "slides": 4, "framework": "educational", "look": "dark", "platform": "linkedin", "warnings": [] }
```

`document` is a FlashCC document: artboards of plain layers, the same thing the
editor opens. Change anything in it, then render it. The model never decides
layout here or anywhere: the words are yours, every visual decision is made by
FlashCC's own compositions.

## `POST /v1/render`: a document in, files out

| Field | |
| --- | --- |
| `document` | a document from `/v1/decks` (or one you edited) |
| `platform` | optional, picks the file format: LinkedIn is a PDF, the image platforms a zip of numbered images |
| `output` | optional, `pdf` or `images`, to override the platform's |

Pictures in the document must be `data:` URLs. The server fetches nothing on a
document's say-so.

```sh
jq '{document: .document, platform: "linkedin"}' deck.json \
  | curl -s "$BASE/v1/render" -H "Authorization: Bearer $FCC" -H "Content-Type: application/json" -d @- \
  -o carousel.pdf
```

The PDF's pages are JPEGs (LinkedIn has been seen rendering PNG pages blank).
The zip holds `01.png`, `02.png`, ... in order. Rendering is the app's own
painter in a real browser, so a file is exactly what the editor shows.

## `POST /v1/runs`: ideas in, carousels out

A list of ideas, each made into a carousel. The answer is immediate (202);
progress arrives as `run.progress` webhooks and by polling.

| Field | |
| --- | --- |
| `ideas` | `string[]`, up to 50, each a line (600 characters at most) |
| `framework`, `look`, `platform` | optional, as for `/v1/decks` |
| `draft` | optional, `true` to have the model write each carousel's words from its idea. Without it, each carousel is the framework's own scaffold around the idea, with no model involved |

```sh
curl -s "$BASE/v1/runs" \
  -H "Authorization: Bearer $FCC" -H "Content-Type: application/json" \
  -d '{"ideas":["Three hiring mistakes we stopped making","What a good brief has in it"],"framework":"educational"}'
```

```json
{ "id": "run_3f1c...", "status": "running", "total": 2, "poll": "/v1/runs?id=run_3f1c..." }
```

```sh
curl -s "$BASE/v1/runs?id=run_3f1c..." -H "Authorization: Bearer $FCC"
```

```json
{ "id": "run_3f1c...", "status": "done", "total": 2, "done": 2, "documents": [{}, {}], "failures": [], "createdAt": "...", "finishedAt": "..." }
```

One idea failing names its index in `failures` and leaves the others made. A
run cut off by a server restart is reported `failed` with what it finished,
never left `running`. Another account's run is a 404.

## Webhooks

**Integrations, Webhooks**: a URL (HTTPS, public) and the events it wants. Each
event is a POST of JSON:

```json
{ "id": "evt_...", "type": "review.approved", "created": "2026-10-19T10:00:00.000Z", "data": { "shareId": "...", "docId": "...", "decidedAt": "..." } }
```

| Event | When | `data` |
| --- | --- | --- |
| `carousel.published` | a carousel's slides were hosted for a scheduler | `docId`, `platform`, `urls` |
| `run.progress` | each carousel of a `/v1/runs` run | `runId`, `index`, `total`, `ok` |
| `run.finished` | a run finished: the API's, or a bulk run in the app | API: `runId`, `count`, `failed`. App: `count`, `docIds` |
| `review.approved` | a reviewer approved | `shareId`, `docId`, `decidedAt` |
| `review.changes_requested` | a reviewer asked for changes | `shareId`, `docId`, `decidedAt` |
| `export.ready` | a video export finished | `jobId`, `docId`, `url` |
| `ping` | you pressed Send a ping | |

Events carry ids, links, numbers and dates, **never a carousel's words**.

Every delivery is signed. The headers are `FlashCC-Signature: t=<unix>,v1=<hex>`,
`FlashCC-Event` and `FlashCC-Delivery`. `v1` is HMAC-SHA256, keyed with the
webhook's signing secret (`whsec_...`, shown once), over `t + "." + body`.
Check it before trusting the body, and refuse a `t` more than five minutes old:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(secret, rawBody, header, now = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now - t) > 300 || !parts.v1) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
  const got = Buffer.from(parts.v1);
  return want.length === got.length && timingSafeEqual(want, got);
}
```

Answer with any 2xx within ten seconds. Anything else is retried after 1
minute, 5 minutes, 30 minutes, 2 hours and 12 hours (six attempts, about
fifteen hours), then marked failed in the delivery list. Redirects are not
followed, and a URL that resolves to a private address is refused at every
attempt.

## Running your own server

The API lays decks out with the app's own code, in a headless page
(`engine.html`) the server drives. Set `APP_ORIGIN` to where the app is
served: the Vite dev server in development, the built site in production. See
`.env.example` for `CONNECTIONS_KEY`, `WEBHOOK_DIR` and `RUN_DIR`, and run
`supabase/15-integrations.sql`.
