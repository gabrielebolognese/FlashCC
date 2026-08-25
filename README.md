# FlashCC

Fast and easy carousel creator website.

Describe a post and get a drafted, editable carousel — or write every slide yourself. Pick one of
four frameworks, draft it with Claude or by hand, then arrange it on a real canvas where every
element is a layer you can drag, resize and restyle.

**The framework is the product.** A carousel is one of four shapes, each with its own hook, and
most tools leave you to guess which. FlashCC picks the shape first, says what each slide is for,
and drafts to that structure.

## Setup

```bash
npm install
cp .env.example .env    # add ANTHROPIC_API_KEY for drafting
npm run dev             # starts the app and the drafting server together
```

Then open the printed localhost URL.

Drafting needs an `ANTHROPIC_API_KEY`; everything else works without one. The key stays on the
drafting server and never reaches the browser.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type check, then build to `dist/` |
| `npm run typecheck` | Type check only |
| `npm test` | Run vitest once |
| `npm run test:watch` | vitest in watch mode |

## How it works

1. **Paste and split.** Text splits into slides deterministically. Blank lines are slide breaks,
   consecutive list markers group into one list slide, the first block becomes the cover, a short
   trailing block becomes the CTA. A three-step granularity control is the only tuning exposed.
2. **Roles, not layouts.** Every slide is one of `cover`, `body`, `list`, `quote`, `cta`. The role
   is inferred from the block's shape and determines the layout completely — you never position
   anything. Override it from a control that appears on the slide itself.
3. **Brand lock.** One brand kit for the whole document: palette, type roles, handle, background
   treatment. It applies to every slide and cannot be overridden per slide. That absence is the
   feature.
4. **Direct editing.** Click text on the slide and edit it there. The source pane stays in sync
   both ways.
5. **Export.** The DOM is the renderer, so the preview and the export are the same markup — there
   is no second rendering path and no WYSIWYG drift.

## Architecture

The document is semantic and renderer-agnostic — it stores what a slide *means*, never pixel
positions. Layout is derived from `role + brandKit + format` by a pure function that returns data,
which is what lets a future phase render the same document as animated video without a browser.

Five invariants hold the product together; they are documented with the reasoning in `CLAUDE.md`
and the `docs/` folder:

| Doc | Covers |
| --- | --- |
| [`docs/interaction-principles.md`](docs/interaction-principles.md) | Research on why Figma feels good, and the rules taken from it |
| [`docs/architecture.md`](docs/architecture.md) | Load-bearing decisions, file plan, open questions |
| [`docs/document-schema.md`](docs/document-schema.md) | Document model, split rules, role inference, persistence |
| [`docs/role-layouts.md`](docs/role-layouts.md) | The five role layouts and the shared grid |
| [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | The FlashFX design language the app chrome uses |

## Status

Working: project home with local persistence, deterministic splitting, all five role layouts,
live canvas with in-place editing, filmstrip with reorder/duplicate/delete, brand kit, undo,
keyboard shortcuts, PDF export.

Not built yet: server-side headless-browser export (PNG sequence), logo upload, format switcher,
accounts. Animated vertical export is a deliberate phase-2 seam — the document model is designed
for it, but none of it is built.
