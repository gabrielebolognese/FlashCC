# FlashCC

FlashCC (Carousel Creator) is a web app for making social media carousels for LinkedIn, Instagram and TikTok. You pick one of four content frameworks, write the slides yourself or have Claude draft them from a brief, choose a style, and then arrange the result on a layer-based canvas where every element can be dragged, resized and restyled. Around the editor sits a publishing pipeline: a board and calendar for planning posts, client review links, scheduler-ready exports and analytics that compare each post against your own baseline.

It is aimed at creators, freelancers and small agencies who publish carousels regularly. It is a sibling project of FlashFX and uses its visual language, but does not depend on the FlashFX engine.

## Features

### Making a deck

- **Four frameworks**, each with its own slot-by-slot guidance and examples: Problem → Solution, Showcase, Educational and Story (`src/studio/structures.ts`).
- **Guided flow**: welcome questions, framework choice, draft with AI or write by hand, one field per slot, style gallery, then the studio.
- **Deterministic layout**: eight compositions (title, heading and body, statement, numbered, quote, underline, caps, block) turn the text into layers at 1080×1350. AI only ever returns words, never positions, sizes or colours.
- **Fifteen styles**, ten flat and five gradient, each tested for contrast.
- **Brands**: saved palettes, fonts, logos and a brand voice that can be applied to a document.

### The canvas editor

- Artboards of layers, in artboard pixels. Array order is z-order; what is stored is what renders.
- Tools: select, text, rectangle, ellipse, triangle, line and icon (lucide icons).
- Move, resize, marquee select, snapping with guides, cursor-anchored zoom, pan with Space or the middle mouse button.
- Layers panel, properties panel, gradient editor, filmstrip with slide operations, safe-zone overlays per platform.
- Snapshot undo and redo (120 steps), plus a local version history that keeps a snapshot before each export, review link and brand change.
- Uploaded images and fonts, kept in an account-level asset library.
- Reflow of an existing deck onto another artboard size.

### AI writing (server-side, Anthropic API)

All of these run through the Node server so the API key never reaches the browser, and all of them require a signed-in account on a paid plan (see [Configuration](#configuration)).

- Draft a full carousel from a brief (`/api/draft`) and revise an existing draft (`/api/revise`).
- Hook variants (`/api/hooks`) and in-place rewriting of a single line (`/api/rewrite`).
- Captions and per-slide alt text (`/api/caption`, `/api/alt`).
- Distil a long source such as a transcript into angles and verified quotes (`/api/distil`); subtitle and long-form ingest itself is deterministic.
- Research angles for a batch run that produces several carousels from a few ideas (`/api/angles`).
- Learn a brand voice from existing decks (`/api/voice/learn`).
- Every model response is checked before it reaches the canvas: silent repairs, one retry on a named failure, and flags for things that cannot be verified, such as a figure absent from the brief (`server/checks.ts`).

### Export and publishing

- Rendering happens in a real headless Chromium via Playwright, from the same markup the editor shows, so the export matches the canvas.
- LinkedIn: a PDF built from JPEG pages. Instagram and TikTok: numbered images in a zip, with an optional `alt.txt`.
- Pre-flight checks against the destination platform (size, slide limits, safe zones, type size) before rendering.
- Publish rendered slides to public URLs in Supabase Storage and generate an import CSV for Metricool, Publer or ContentStudio.

### Pipeline, clients and analytics

- Posts as separate records from documents, moving through idea, drafting, ready, scheduled and posted, on a board and a calendar; recurring series.
- Clients, with projects, brands and posts filtered per client.
- Review links (`/r/<token>`): a snapshot of a deck that a reviewer can comment on and approve without an account.
- Analytics from manually entered metrics or a LinkedIn export import: outliers measured against the median of your own recent posts, attributed to framework, hook shape and slide count.

### Accounts and storage

- Works with no configuration: documents, posts, brands and assets live in `localStorage`.
- Optional Supabase project adds email sign-in (six-digit code with magic link fallback), last-write-wins sync across devices with tombstoned deletions, and file storage.
- A marketing landing page at `/`, the app at `/app`, and legal pages at `/privacy`, `/terms` and `/refunds`.

## Getting started

### Prerequisites

- Node.js 20 or newer (`engines` in `package.json`). The server loads `.env` with `process.loadEnvFile()`, which needs Node 20.12 or later.
- npm.
- A Chromium build for Playwright, needed only for export. The repo has no script for this; Playwright's own `npx playwright install chromium` provides it.
- Optional: an Anthropic API key and a Supabase project.

### Download and install

```bash
git clone https://github.com/gabrielebolognese/FlashCC.git
cd FlashCC
npm install
```

### Configuration

Copy the example file and fill in what you need. Everything is optional.

```bash
cp .env.example .env
```

| Variable | Used by | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | browser and server | Supabase project URL. Enables accounts, sync and storage. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser and server | Supabase publishable key. `VITE_SUPABASE_ANON_KEY` is read as a fallback. |
| `ANTHROPIC_API_KEY` | server only | Enables the AI routes. |
| `SUPABASE_SECRET_KEY` | server only | Lets the server read an account's plan. `SUPABASE_SERVICE_ROLE_KEY` is read as a fallback. Never give it a `VITE_` prefix. |
| `DEV_PRO` | server only | Set to `1` to treat every signed-in account as Pro. Ignored when `NODE_ENV` is `production`. Not in `.env.example`. |
| `PORT` | server only | API port, default `8787`. |
| `VITE_PORT` | dev script | Vite port, default `5173`. |
| `PUBLIC_SITE_URL` | none currently | Listed in `.env.example` for the removed payment integration; no code reads it now. |

What each level of configuration gives you:

- **Nothing set**: the editor, all frameworks and styles, local storage and PDF export.
- **Supabase set**: sign-in, sync, the asset library in the cloud, review links and publishing. Follow [`supabase/README.md`](supabase/README.md) to create the project, run the SQL migrations and configure the email template. `npm run check:schema` reports any migration that has not been applied.
- **AI**: the AI routes need `ANTHROPIC_API_KEY`, the Supabase variables, a signed-in user, and a Pro plan. Because there is no payment integration, the two ways to get a Pro plan locally are `DEV_PRO=1`, or setting `SUPABASE_SECRET_KEY` and changing your own row in `profiles.plan` to `pro`.

### Run in development

```bash
npm run dev
```

This starts the Vite dev server (http://localhost:5173, or the next free port) and the API server (http://localhost:8787) together. Vite proxies `/api` to the API server. Open the printed URL; the landing page is at `/` and the app at `/app`.

To pick the Vite port: `VITE_PORT=4001 npm run dev`.

## Build and deploy

```bash
npm run build
```

This type-checks the app and writes the static front end to `dist/`. `npm run preview` serves that build locally.

The repository contains no deployment configuration. A deployment needs two things:

- A static host for `dist/` with single-page fallback to `index.html`, because `/app`, `/r/<token>`, `/privacy`, `/terms` and `/refunds` are resolved in the browser.
- The Node server (`server/index.ts`) running on the same origin under `/api`. There is no server build step; it is run with `tsx`. The server has no CORS handling and assumes it sits behind a same-origin proxy. Environment variables are read from the host when no `.env` file exists.

## Usage

1. Open the app and answer the welcome questions, or skip them.
2. Pick a framework, then draft with Claude or write each slot yourself.
3. Pick a style. The document is created and opens in the studio.
4. Edit on the canvas, then export for LinkedIn, Instagram or TikTok.
5. From the home screen, use Projects, Clients, Brands, Library, Board, Calendar and Analytics to manage everything around the deck.

Useful canvas shortcuts: `v` `t` `r` `o` `l` `i` select tools, arrows nudge by 1px (10px with Shift), `Cmd/Ctrl+Z` undoes, `Cmd/Ctrl+D` duplicates, `Space` pans, `Enter` edits the selected text layer.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server and API server together (`scripts/dev.mjs`) |
| `npm run dev:web` | Vite dev server only |
| `npm run server` | API server only, with `tsx watch` |
| `npm run build` | Type-check the app, then build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Type-check the app and the server |
| `npm test` | Run the vitest suite once |
| `npm run test:watch` | vitest in watch mode |
| `npm run check:schema` | Read-only probe of the Supabase project; names migrations not yet applied |
| `npm run eval:draft` | Calls Anthropic directly to check the prompts still produce usable output. Costs API money; flags `--compare`, `--rewrite`, `--caption`, `--distil`, `--voice` |

### API routes

`GET /api/health` reports which parts are configured. `POST /api/export` is open and rate-limited: PDF needs no account, numbered images need Pro. `POST /api/slides` and `POST /api/document` (used for publishing) need a signed-in account. `GET /api/review`, `POST /api/review/comment` and `POST /api/review/decision` serve review links. The AI routes listed under Features need Pro.

## Project structure

| Path | Contents |
| --- | --- |
| `src/App.tsx` | Screen flow and path handling; there is no router |
| `src/studio/` | The app: canvas, panels, dialogs, and the pure modules behind them (geometry, text fitting, compositions, styles, export, sync, pipeline, analytics), with colocated tests |
| `src/landing/` | Marketing landing page |
| `src/legal/` | Privacy, terms and refund pages |
| `src/ui/`, `src/styles/` | Shared buttons, Tailwind entry and design tokens |
| `server/` | Framework-free Node HTTP server: AI routes, prompts, output checks, Playwright rendering, review links, Supabase access |
| `supabase/` | SQL migrations `01` to `11` and the setup guide |
| `scripts/` | Dev supervisor, schema check and the drafting eval |
| `docs/` | Reference, roadmap and design research |

The three CSV files at the repository root are YouTube analytics exports and are not used by the app.

## Tech stack

- TypeScript (strict), ESM, Node.js 20+
- React 19, Vite 6, Tailwind CSS 3, lucide-react
- Node `http` server run with tsx, zod for request and response schemas
- Anthropic SDK (`claude-sonnet-5` and `claude-haiku-4-5` are the models configured in `server/anthropic.ts`)
- Supabase (auth, Postgres with row level security, storage)
- Playwright (Chromium) and JSZip for export
- Vitest

## Further documentation

- [`docs/reference.md`](docs/reference.md): how every subsystem works, the constants, and a list of known defects. Some early sections predate later changes, so check them against the code.
- [`docs/feature-roadmap.md`](docs/feature-roadmap.md): the batched build plan and its status.
- [`docs/interaction-principles.md`](docs/interaction-principles.md): interaction rules the UI follows.
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md): the FlashFX design tokens used by the app chrome.
- [`supabase/README.md`](supabase/README.md): Supabase setup and migrations.
- [`CLAUDE.md`](CLAUDE.md): model, invariants and conventions for contributors.
- [`docs/superseded/`](docs/superseded/README.md): design documents for an earlier architecture, kept for history only. They do not describe the current code.

## Status

In development, version 0.1.0, not deployed anywhere this repository shows. All sixteen roadmap batches are marked done, but:

- The payment integration has been removed and is to be rebuilt. The pricing screen lists Free, Pro and Agency plans, yet nothing can grant a paid plan outside the local workarounds above.
- The reference lists open defects and describes the production posture as unfinished; the server is designed around localhost and the Vite proxy.
- Generation targets 1080×1350 only; other sizes are reached by reflowing an existing deck.
