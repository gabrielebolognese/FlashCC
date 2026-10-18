# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

**FlashCC** (Carousel Creator) drafts a carousel from a brief and lets the user arrange it on a
canvas. Sixteen frameworks (the original four, problem-solve, showcase, educational, story, and
twelve added in Batch 25), each with its own per-slot guidance, slide-count range and two or three
running orders in `src/studio/structures.ts`.

**AI drafting is part of the product**, this reversed an earlier "no AI" position, so ignore that
line if you find it anywhere else. `server/` holds the API key: `prompts.ts` assembles every word (pure, golden-tested),
`anthropic.ts` owns the client, the model per task, retry and error translation, and
`draft.ts` is left with the two routes. Drafting is `claude-sonnet-5`, hooks are
`claude-haiku-4-5-20251001`, both through `messages.parse()` with a zod output format. The browser only ever talks to
`/api/draft` and `/api/hooks` on its own origin: **the key must never reach the bundle.** Everything
except drafting works with no key set, and the UI degrades to "write it yourself" when the server
says it has none, including long-form ingest, which is entirely deterministic on purpose (see
invariant 5 and `longform.ts`).

Sibling project to **FlashFX**, whose visual language it uses, but it does **not** import or
depend on the FlashFX engine (no WebGPU, no compositor, no keyframes).

React + Vite + Tailwind + lucide-react. Node >= 20, ESM, strict tsconfig, vitest.

## Read before working

| Doc | Covers |
| --- | --- |
| **`docs/reference.md`** | **Everything. How each subsystem works, every constant, and §29 known defects.** Start here. |
| `docs/feature-roadmap.md` | The batched plan of record. Worked through with `/next-batch`. |
| `DESIGN_SYSTEM.md` | FlashFX tokens: colour, type, radii, motion. Paints the **app**. |
| `docs/interaction-principles.md` | Figma research + rules R1–R15 (timing, feedback, density, control budget) |

`docs/superseded/` holds four documents describing the design the Photoshop-model rewrite replaced
(a semantic document, five roles, a template engine). None of them match the code. They are kept for
history and should never be used to answer a question about how the app works.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (5173, falls forward if taken). `VITE_PORT=4001 npm run dev` to pick one |
| `npm run build` | `tsc --noEmit` then `vite build` |
| `npm run typecheck` | Type check only; run before considering a change done |
| `npm test` | `vitest run --passWithNoTests` |
| `npm run test:watch` | vitest watch |
| `npm run build:icons` | Regenerates the bundled Tabler icon index from `@tabler/icons` |
| `npm run build:fonts` | Regenerates the bundled faces, their metrics and kerning (`src/render/fonts/`) |

Single test file: `npx vitest run src/doc/split.test.ts`
Single test by name: `npx vitest run -t "is deterministic"`

## The model

A document is **artboards of layers**, the Photoshop/Figma model. There is no document
model, no template engine, no roles, and nothing derived at render time. The block library
(Batch 19) is presets for content with a shape: it runs once and leaves plain layers carrying a
stamp, never a live block.

```
Doc { width, height, palette, slides }
Slide { background, layers[] }        // array order IS z-order, 0 = back
Layer { kind, x, y, w, h, rotation, opacity, visible, locked, fill, stroke, ...type }
```

Coordinates are **artboard pixels**, not fractions. A layer at x=540 is at x=540.
Changing the canvas size is a canvas resize: layers keep their positions.

Two tags ride on that model and are never read at render: `Layer.groupId`, which makes layers
select and move together (a tag, not a container, one level only), and `Slide.composition`, stamped
at generation so Tidy can use the spacing steps the slide was built from. The layout tools in
`tidy.ts` and `slideset.ts` compute coordinates once and forget they ran.

Four more stamps, all read only by the tools that wrote them: `Layer.block` (which block,
instance and part made it, `blocks.ts`), `Layer.furniture` (a deck furniture piece, `furniture.ts`),
`Layer.verbatim` (a quote still word for word), and `Layer.bridge` (a bridge preset, `panorama.ts`).
`Layer.spanId` is a tag like `groupId`, across slides (see below). Furniture follows **stamp and reseal**: it is
rewritten at the structural funnels in `useStudio.ts` and at export, never on an ordinary edit,
and typing into a piece hands it over to the user. There is one more layer kind, `path`, for the
shapes the others cannot draw (donut segments, arrows, QR codes).

Invariants worth keeping:

1. **Nothing is derived.** What is stored is what renders. A layer a preset created and
   a layer the user drew are the same kind of object with the same handles.
2. **Presets run once.** `presets.ts` returns plain layers and then is gone, there is no
   live template to fight with. Same for the text importer.
3. **`LayerView` is the only painter.** Canvas, preset thumbnails and the print/export
   path all render through it, so there is no second rendering path to drift.
4. **`geometry.ts` is pure and tested.** Resize, hit testing, marquee and snapping have no
   DOM dependency, because that is where a drag editor actually breaks.
5. **AI writes text. It never writes layout.** Every server route returns words,
   `/api/draft` returns `{role, text}`, `/api/hooks` returns `{angle, text}`, and every visual
   decision is made by `compositions.ts` from those words, deterministically. This is not a
   stylistic preference. Every documented complaint about AI carousels in the research is about
   layout: *"Text sizing shifted from slide to slide with no clear logic."* *"Some text ending up
   too small to read."* People value a model for splitting prose into headline-length beats and
   reject it for type scale, emphasis and colour. A new AI feature that returns a size, a
   position, a colour or a composition breaks this, and the way it breaks is invisible until
   somebody's deck ships looking wrong.
6. **Reviewers are free and unlimited, and there is no seat anywhere in the schema.** A review
   link costs nothing, is capped by nothing, and can be sent to as many people as you like.
   Sprout charges **$499/month per external approver** and caps the account at three; it is the
   loudest single complaint in the whole research corpus, and Planable, Gain and Ziflow all give
   reviewer seats away to win against it. `07-review.sql` has no reviewer table, no invitation and
   nothing counting them, deliberately. A migration that adds a seat count, or a paywall that
   meters share links, undoes the reason the feature exists. The promise is stated on the pricing
   screen as `REVIEWER_PROMISE` in `Upgrade.tsx`.
7. **Nothing is metered.** No credits, no generation limits, no per-export counter, no
   rationing of any kind. Grep confirms there is not one today and there must not be one
   tomorrow: *"a rationing system, not a content tool"* is how users describe the
   alternative, and a rival already uses "no credit limits" as its wedge. Plans differ by
   what they DO, the pipeline, clients, review links, version retention, never by how
   many times you may do it. Stated as `UNMETERED_PROMISE` in `Upgrade.tsx`.

## Conventions

- ESM only. Relative imports end in `.js` even in `.ts`/`.tsx` (Vite resolves `./App.js` →
  `App.tsx`; verified).
- **A component may not share a name with a module beside it, case aside.** Windows and macOS
  filesystems are case-insensitive and TypeScript refuses to hold `Review.tsx` and `review.ts` in
  one program. This has cost time four times now, `Analytics`/`analytics`, `Library`/`library`,
  `LongForm`/`longform`, `Review`/`review`, so the component takes the compound name:
  `insights.ts` + `Analytics.tsx`, `library.ts` + `AssetLibrary.tsx`, `longform.ts` +
  `Repurpose.tsx`, `review.ts` + `ReviewLink.tsx`, `imagetools.ts` + `PictureTools.tsx`,
  `texteffects.ts` + `TextEffectField.tsx`, `findreplace.ts` + `ReplaceDialog.tsx`.
- Source in `src/`, tests colocated as `*.test.ts`.
- Strict flags in force: `verbatimModuleSyntax` (use `import type`),
  `noUncheckedIndexedAccess` (indexed access is `T | undefined`),
  `exactOptionalPropertyTypes` (optional props that need clearing are typed `T | undefined`).
- Tailwind colours point at CSS vars in `src/styles/tokens.css`. **The `/opacity` suffix does not
  work on them** (`text-accent/40` is broken), use `--accent-wash` or a built-in scale like
  `white/[0.04]`.
- Every interactive control is **28px** tall. 14px icon glyph in a 28px hit box.
- No transition on colour, background, or border anywhere. Hover and selection are 0ms.

## Not built yet

- Template validation, the phase-2 FlashFX converter.
- Size-aware `compositions.ts`. `W`/`H`/`M` are module constants, so generation only ever targets
  1080×1350. `reflow.ts` re-lays existing layers onto another artboard, which is a different job.

## Type

- **Measure in the face you draw in, at the weight you draw at.** `text.ts` measures a bundled
  face (the pairing library) from its own advances and kerning, generated by `npm run build:fonts`
  from the woff2 files the browser renders; a system stack is estimated. Pass `weight` in every
  `Measure`, and measure a layer only through `layerMeasure`/`layerLines`: there were four copies
  once, and one measured a CSS stack (D1/F1). A new face goes in `scripts/build-fonts.mjs`, never
  only in CSS, and `pairs.ts` refuses an id without metrics at compile time.
- **Emphasis is three marks in the text**, `*accent*`, `**bold**`, `==highlight==` (`marks.ts`,
  shared with the server). Anything that reads slides as words strips them (`stripMarks`). The
  model may write ONE marked span per slide (`slideCopy`): emphasis is part of what a sentence
  means, the style decides how it looks, so invariant 5 holds. A model that returns a colour, a
  size or a second mark is still breaking it.
- **One effect per text layer** (`withEffect`), gradient text included.
- The export carries the bundled faces a deck uses (`bundledFaceCss`): emoji (Twemoji, COLR, which
  every engine draws) and CJK/Arabic/Hebrew render on a server that has none installed. Do not
  swap in an OpenType-SVG emoji font; Chrome draws those blank.

## Designs across slides (Batch 23)

- **A spanning layer is several ordinary layers**, one per slide it touches, sharing a `spanId`,
  the right-hand piece at `x - W` (`spans.ts`, pure and tested). Each slide clips its own piece.
  Never compute a piece at render, never add a "span" container: a slide exported alone must be
  exactly what it holds.
- **Anything that moves layers between boards treats a span as one layer on the strip** (N x W by
  H) and splits it again with `place`. `reflow.ts` does; a new layout tool that moves pieces one
  by one opens every seam.
- **A broken seam is reported, never repaired silently** (`brokenSpans`, the studio banner, the
  `span-broken` pre-flight). The remedy offered is Unspan.
- Strip view is `StripCanvas.tsx`; its inspector edits go to every piece. The export renders each
  run of linked slides as ONE strip and slices it (`server/render.ts`, `stripRuns`), so both sides
  of a seam come from the same pixels.
- `<img>` in `LayerView` carries `maxWidth: none`: Tailwind's preflight caps images at the parent's
  width in the editor only, which cut a strip background to one slide.

## Writing and the keyboard (Batch 24)

- **Outline mode is a view, not an importer** (`outline.ts`, `OutlineView.tsx`). It never creates a
  document; it changes the open one through `restateMany` (`regenerate.ts`), the same path as a
  rewrite: unchanged slides kept as they are, generated layout re-run, a slide whose copy layer
  the user edited written onto its layers, never split. A session is one undo step.
- **Every action is in `actions.ts`.** A new button gets `data-action` with a registry id (or
  `data-control` if it only sets a value), and its runner goes in the `runners` table in
  `Studio.tsx`, which is typed against the registry. `actions.test.ts` walks the editor's source
  and fails on a button the palette cannot reach.
- **Letter keys never fire while a field has focus**: `actionForKey(e, typing)` takes it as a
  parameter. A new single-letter key goes in that function, never in a component's own listener.
  T, R, O and L are Tidy, Rewrite, Outline and Layout; the drawing tools are on Shift.
- Words changed outside the two edit funnels go through `retouched` + `markEdited`
  (`regenerate.ts`), so a quote stops being verbatim and furniture is handed over, as typing does.

## Presets (Batch 25)

- **Every preset runs once and leaves plain layers**: frameworks, layouts, hook formulas, CTAs,
  style packs, templates, kits. A deck made from a template records `Doc.template` and nothing
  else; editing a template never reaches its decks, Re-apply template is the explicit way.
- **Nothing is ranked.** No preset carries a score, a "top converting" label or an order by
  claimed performance. Hooks are listed by kind, packs by kind of creator.
- **The honesty rule**: a slot reporting a result, a figure or a quote is `honest`, and the model
  returns `HONEST_BLANK` (`honesty.ts`, shared with the server) rather than inventing one. The
  checks accept it, the pre-flight flags it. A new framework's result slots must be `honest`.
- **A new framework needs** a `range`, two or three `rhythms` that open on `hook` and close on
  `cta`, and passes `server/frameworks.test.ts` and its sameness test. A new style pack must pass
  the full pack matrix (`packs.test.ts`): every framework, every destination, no overflow and no
  safe-zone warning.
- A new composition for cycling goes in `ringFor`'s rings, not in the generation `CYCLE`, unless
  changing what existing decks generate is the point.
- `slidePaint` uses `backgroundColor`, never the `background` shorthand next to
  `backgroundImage` (React warns and misorders when one replaces the other).

## Motion export (Batch 26)

- **A slide's duration is arithmetic** (`motion.ts`, pure, shared with the server): 2s plus words
  over 3.5, capped at 6, cover +0.5, last slide +1, `Slide.hold` overrides. Rounded to frames once
  in `slideFrames`; the timing strip and the server read the same numbers. A model never picks a
  duration (invariant 5). `motion.ts` types the model fields it reads structurally: importing
  `model.ts` would pull Vite-only modules into the server's typecheck.
- **Entrances are seeked, never played.** A new animation is a paused keyframe in `ENTRANCE_CSS` on
  the `wrapEntrance` wrapper, driven by `__fccSeek(t)`; nothing reads a clock, and a render twice
  must be the same bytes (`video.test.ts`). LayerView's markup goes in unchanged. A slide with
  nothing moving is ONE screenshot.
- **The video queue is durable, on disk** (`jobs.ts`): state written before it is acted on,
  unfinished jobs re-queued by `recover` on start, SIGTERM drains with a grace period, a job that
  keeps dying is reported failed with a retry, never dropped. Playwright's signal handlers stay off
  (`render.ts`) or a deploy kills the job in hand.
- **The Pro line is "something moves"** (`isAnimated`): a still slideshow is free with no account.
  The two-at-once and twelve-an-hour ceilings are abuse limits, never a meter (invariant 7).
- ffmpeg is the system's (`FFMPEG_PATH`), never bundled; `/api/health` reports `video`.

## Planning (Batch 27)

- **An idea is a post in the `idea` stage** (`ideas.ts`), never a separate record, and **never
  generated**: no feature fills the bank with a model. Q captures one from any screen (`actionForKey`
  plus `IdeaCapture` in `App`); nothing is typed as a tag, pillar and client come from what exists.
- **A lane is a plan, not a record** (`lanes.ts`). Posts copy what they need from it; editing or
  deleting a lane changes no post.
- **The session never pairs an idea for the person** (`week.ts`). `sessionQueue` takes only the
  pairings made; the runner reads the queue before every step (reorder) and `stopped()` before every
  step (stop keeps what is done). A new planning feature that fills a slot by itself breaks "no
  silent calendar filling".
- A session leaves carousels in **drafting**, dated on their lane's day; only the finishing pass's
  schedule step moves one to scheduled. The six steps and their order are `FINISH_STEPS`.
- `12-planning.sql` adds `posts.source`, `posts.lane_id` and `lanes`; the posts columns are required
  before a Batch 27 client syncs.

## Remix what worked (Batch 28)

- **The structure is copied without a key; only words may use the model** (`remix.ts`). A remix keeps
  framework, length, composition per position, blocks, furniture and style, and none of the original's
  words: block fields become `[Label]` brackets, never a sample figure.
- **Sorting by a column the person chose is not ranking** (`resurface.ts`). Nothing on Revisit or the
  insight screens says "best", predicts, or badges; the staleness check flags and never edits.
- **An analytics import shows its column mapping before writing anything** and matches only posts on
  its own platform (`linkedin.ts`). Instagram's and TikTok's columns are unverified (D53).
- **Attribution reads `Post.shape`, a snapshot taken when the post is made**; a post without one
  cannot answer. Any breakdown shows no median for a group under `MIN_SHOWN` (5) and `n` beside every
  median it does show.
- `13-remix.sql` adds `posts.shape`, required before a Batch 28 client syncs.

## Pictures

- **A stock API is not a scrape.** Batch 13 refused to fetch somebody else's page, and that stands:
  no feature fetches a page or an image from a link someone pasted. A stock provider's API is the
  owner offering, under written terms, to license exactly this use, so `server/stock.ts` may call
  Unsplash and Pexels, and nothing else. Their terms are followed to the stricter of the two:
  hotlink the URL they return (never copy it into our bucket), ping Unsplash's download endpoint
  when a photo is used, and carry the photographer's credit wherever the picture goes, into the
  first comment included. A new image source has to be a licensed API in the same sense.
- **Heavy things load when used.** The icon index (`src/render/iconsets/`, regenerate with
  `npm run build:icons`) and the cut-out runtime and model (`onnxruntime-web`,
  `public/models/u2netp.onnx`) are dynamic imports reached only from the screen that needs them.
  Nothing new goes in the main bundle that the editor does not use on every load.
- **Picture tools store values, CSS paints them.** Focal point, mask, filter and texture are fields
  read by `LayerView`/`slidePaint`. A tool that re-runs a pipeline at render breaks invariant 1.
- Licences checked before the first line: Tabler (MIT), onnxruntime-web (MIT), U^2-Net weights
  (Apache-2.0), rembg's ONNX export (MIT). The popular in-browser removal library is AGPL and must
  not be added.

## Export

`server/render.ts` renders in a real Chromium via Playwright. The client serialises the markup
`LayerView` already produced and posts it, there is no second renderer, which is the point: a
canvas reimplementation would drift, and `background-clip: text` gradients and uploaded FontFace
faces are exactly what such converters get wrong.

Per platform (`platforms.ts`): LinkedIn takes a PDF built from **JPEG** pages, PNG pages have
been seen converting to a PDF that renders blank, the image destinations take numbered images in a
zip. `preflight.ts` checks the deck against the destination before any of it runs; blocking
findings block, warnings do not.

Every platform row carries a `verified` date and its `sources`, and **a row with no date does not
ship** (Facebook, today). `npm run check:platforms` names any row older than 180 days. One deck to
several destinations, X and Bluesky threads, and Pinterest's pick of five all live in
`destinations.ts`, pure, with the zip arranging in `packing.ts`.
