# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

**FlashCC** (Carousel Creator) turns a post the user has already written into an on-brand
carousel. The user brings the words; FlashCC does layout, brand, and render. It never writes,
rewrites, or suggests copy. No AI in v1. Constraint is the product — very few controls, and the
brand kit is set once and cannot drift per slide.

Sibling project to **FlashFX**, whose visual language it uses — but it does **not** import or
depend on the FlashFX engine (no WebGPU, no compositor, no keyframes).

React + Vite + Tailwind + lucide-react. Node >= 20, ESM, strict tsconfig, vitest.

## Read before working

| Doc | Covers |
| --- | --- |
| `DESIGN_SYSTEM.md` | FlashFX tokens: colour, type, radii, motion. Paints the **app**. |
| `docs/interaction-principles.md` | Figma research + rules R1–R15 (timing, feedback, density, control budget) |
| `docs/architecture.md` | The four load-bearing decisions, file plan, open questions |
| `docs/document-schema.md` | Document model, split rules, role inference, persistence |
| `docs/role-layouts.md` | The five role layouts, the shared grid, the type ladders |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (5173, falls forward if taken) |
| `npm run build` | `tsc --noEmit` then `vite build` |
| `npm run typecheck` | Type check only; run before considering a change done |
| `npm test` | `vitest run` |
| `npm run test:watch` | vitest watch |

Single test file: `npx vitest run src/doc/split.test.ts`
Single test by name: `npx vitest run -t "is deterministic"`

## Architecture invariants

These are the rules that keep the product coherent. Breaking one is a design change, not a
refactor.

1. **One renderer, fixed logical coordinate space.** `src/render/SlideRenderer.tsx` always draws
   at the format's logical size (1080×1350) in absolute logical px. Scale is applied *outside* it
   by a `transform: scale()` wrapper — preview ≈0.3, thumbnail ≈0.05, export 1. No viewport units,
   no media queries, no `em`/`rem` inside the renderer: that is what makes preview and export
   pixel-identical structurally rather than by testing.
2. **Layout is a pure function; React only paints it.** `computeLayout(slide, brand, format, n)`
   returns `LayoutNode[]` — data with positions, sizes, and resolved type. Phase 2 converts that
   array into a FlashFX scene document. Never put layout maths in JSX.
3. **`src/doc/**` is pure.** Zero React, zero DOM. It runs in Node for tests and for the phase-2
   converter.
4. **The document is authoritative.** Slides are an explicit list in the left pane, not
   blank-line-separated prose — pasting still splits on blank lines, but after that the list is
   the editing surface. `serialize`/`rebuild` remain for the paste path only.
5. **Two colour systems, never mixed.** FlashFX tokens paint the app chrome; the user's brand kit
   paints the slides. A slide may be cream-on-hot-pink inside the navy app — that is correct.

## Conventions

- ESM only. Relative imports end in `.js` even in `.ts`/`.tsx` (Vite resolves `./App.js` →
  `App.tsx`; verified).
- Source in `src/`, tests colocated as `*.test.ts`.
- Strict flags in force: `verbatimModuleSyntax` (use `import type`),
  `noUncheckedIndexedAccess` (indexed access is `T | undefined`),
  `exactOptionalPropertyTypes` (optional props that need clearing are typed `T | undefined`).
- Tailwind colours point at CSS vars in `src/styles/tokens.css`. **The `/opacity` suffix does not
  work on them** (`text-accent/40` is broken) — use `--accent-wash` or a built-in scale like
  `white/[0.04]`.
- Every interactive control is **28px** tall. 14px icon glyph in a 28px hit box.
- No transition on colour, background, or border anywhere. Hover and selection are 0ms.

## Not built yet

- Server-side Playwright export (`server/`). Export currently prints the same component tree via
  the browser's own renderer — correct markup, PDF only, no PNG sequence.
- Image upload (the `image` slot renders a placeholder), format switcher, template validation,
  the phase-2 FlashFX converter.

## Canvas elements

Beyond template-driven content, a slide carries `overlays: Overlay[]` — hand-placed text, icons
and shapes. Position and size are **fractions of the slide**, never pixels, so an overlay survives
a format change the way template content does. Overlays are emitted last and paint above the
template layout; they never alter it. Per-block `style` overrides (font, size, weight, colour,
align, case) sit on top of what the template chose for that one block.
