# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

**FlashCC** (Carousel Creator) drafts a carousel from a brief and lets the user arrange it on a
canvas. Four frameworks (problem-solve, showcase, educational, story), each with its own per-slot
guidance in `src/studio/structures.ts`.

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
| `docs/billing.md` | Paddle setup, click by click |

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

Single test file: `npx vitest run src/doc/split.test.ts`
Single test by name: `npx vitest run -t "is deterministic"`

## The model

A document is **artboards of layers**, the Photoshop/Figma model. There is no document
model, no template engine, no roles, no blocks, and nothing derived at render time.

```
Doc { width, height, palette, slides }
Slide { background, layers[] }        // array order IS z-order, 0 = back
Layer { kind, x, y, w, h, rotation, opacity, visible, locked, fill, stroke, ...type }
```

Coordinates are **artboard pixels**, not fractions. A layer at x=540 is at x=540.
Changing the canvas size is a canvas resize: layers keep their positions.

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
  `Repurpose.tsx`, `review.ts` + `ReviewLink.tsx`.
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

## Export

`server/render.ts` renders in a real Chromium via Playwright. The client serialises the markup
`LayerView` already produced and posts it, there is no second renderer, which is the point: a
canvas reimplementation would drift, and `background-clip: text` gradients and uploaded FontFace
faces are exactly what such converters get wrong.

Per platform (`platforms.ts`): LinkedIn takes a PDF built from **JPEG** pages, PNG pages have
been seen converting to a PDF that renders blank, Instagram and TikTok take numbered images in a
zip. `preflight.ts` checks the deck against the destination before any of it runs; blocking
findings block, warnings do not.
