# FlashCC — architecture and file plan

Standalone project. No FlashFX engine dependency: no WebGPU, no compositor, no keyframe system.
The DOM is the renderer.

---

## 1. The four load-bearing decisions

Everything else follows from these.

### D1 — One renderer, one coordinate space

There is exactly one component tree that draws a slide: `src/render/SlideRenderer.tsx`. It always
draws at the format's **logical size** (1080×1350 for the 4:5 default) in absolute logical pixels.
It never reads the viewport, never uses `vw`/`vh`/`%` against the window, never knows whether it
is in a preview, a thumbnail, or an export.

Scale is applied **outside** it by a wrapper:

```
preview:    <div style={{transform:`scale(${k})`}}><SlideRenderer …/></div>   k ≈ 0.4
thumbnail:  same wrapper, k ≈ 0.08
export:     no wrapper, k = 1, viewport set to 1080×1350
```

This is what makes "preview and export are pixel-identical" a structural guarantee rather than a
thing we test for. There is no responsive behaviour to diverge, because the renderer has no
responsive behaviour at all.

Consequence to enforce in review: **no `SlideRenderer` descendant may use a relative unit tied to
the viewport, a media query, or a container query.** `em`/`rem` are also banned inside the
renderer — root font size is an environment variable we do not control in the export browser.
Everything is unitless-computed logical px.

### D2 — Layout is a pure function; React only paints it

```ts
computeLayout(role, blocks, brandKit, format) -> LayoutNode[]
```

`LayoutNode` is data: a box with `x, y, w, h`, a type, a text run, a resolved font size / weight /
line-height / colour, alignment. `SlideRenderer` maps that array to absolutely-positioned divs and
does nothing else — no conditionals about roles, no measuring, no layout maths in JSX.

This exists for phase 2. Converting a FlashCC document into a FlashFX scene document (flat layer
array with `parentId`) is then `LayoutNode[] → Layer[]`, a field rename over data that already has
positions, sizes, and resolved type. If layout lived in JSX, phase 2 would have to run a browser
and scrape the DOM to find out where anything is, and the "pure function with no information
missing" requirement would be dead.

**Build the pure layout function now. Do not build the converter.** The seam is
`LayoutNode[]` and nothing else needs to exist for it.

### D3 — The document is authoritative; the source text is a projection

This is the subtlest part of the product and the place a naive build breaks.

The left pane looks like the source of truth but cannot be: the filmstrip can reorder, duplicate,
and delete slides, and those operations have no representation in a plain-text blob that would
survive a round trip.

So:

```
paste  →  parse(text)        →  document          (import, once)
         serialize(document) →  text               (what the pane displays)
         edit in pane        →  reparse + diff     (preserves ids where unchanged)
         edit on slide       →  mutate document    →  pane re-serialises
         reorder / delete    →  mutate document    →  pane re-serialises
```

`serialize` and `parse` must round-trip: `parse(serialize(doc))` produces the same block content
and slide boundaries as `doc`. The diff on re-parse matches blocks by content and position to
carry `id` and `roleOverride` forward, so typing a character in the source pane does not silently
reset a role the user chose. This is the one algorithm in v1 worth unit-testing exhaustively.

### D4 — Export is the app's own render route in a headless browser

```
POST /export { documentId }
  → Playwright launches Chromium
  → viewport = format logical size, deviceScaleFactor = 2
  → navigates to  /render?doc=<id>&slide=<n>   (the app's own route, chrome-free)
  → awaits document.fonts.ready + a render-complete signal the route sets
  → screenshot per slide → PNG
  → PNGs → single PDF at the same dimensions
  → returns ordered files: 01.png … NN.png, carousel.pdf
```

The route renders `<SlideRenderer>` — the same component the preview uses, from the same bundle.
There is no server-side re-implementation of layout and no HTML template that could drift.

Fonts are self-hosted `woff2` in `public/fonts`, declared with `@font-face`, and the export blocks
on `document.fonts.ready`. No Google Fonts, no CDN — a network hiccup in the export browser must
not be able to change the output.

Client-side rasterisation (`html2canvas`, `dom-to-image`) is explicitly rejected: it re-implements
CSS layout in JavaScript and drifts on exactly the things that matter here — font metrics, line
breaking, letter-spacing.

---

## 2. Boundaries

Three layers, with a hard dependency rule:

```
src/doc/     pure data + transforms   →  imports nothing from render/ app/ ui/
src/render/  pure layout + the one renderer  →  imports doc/ only
src/app/     the editor shell         →  imports doc/, render/, ui/, state/
```

`src/doc/**` must contain **zero** imports of React, DOM types, or anything browser-shaped. It runs
in Node for tests and, in phase 2, for conversion. Worth enforcing with a lint rule rather than
discipline.

`src/render/**` may import React (it renders), but `render/layout/**` must stay pure and testable
in Node.

---

## 3. Two colour systems, never mixed

| System | Source | Paints | Tokens |
| --- | --- | --- | --- |
| App | FlashFX design system, fixed | chrome: bars, panes, filmstrip, sheet, controls | `--bg`, `--surface-*`, `--accent`, `--text-*` |
| Brand | user's brand kit, per document | the slides only | `--brand-bg`, `--brand-text`, `--brand-accent`, … |

Brand values are injected as CSS custom properties on the `SlideRenderer` root element, scoped to
that subtree. No app token is legal inside a slide; no brand token is legal outside one. A slide
may be cream-on-hot-pink inside the navy app — that is correct, not a bug.

---

## 4. File plan

```
carousel/
├── docs/
│   ├── interaction-principles.md      ✓ written
│   ├── architecture.md                ✓ this file
│   ├── document-schema.md             ✓ written
│   └── role-layouts.md                ✓ written
│
├── public/
│   └── fonts/                         self-hosted woff2 (app UI + brand type roles)
│
├── src/
│   ├── main.tsx                       mount + route split (editor vs /render)
│   ├── App.tsx                        the one screen
│   │
│   ├── styles/
│   │   ├── tokens.css                 FlashFX :root vars, verbatim from DESIGN_SYSTEM.md
│   │   ├── fonts.css                  @font-face declarations
│   │   └── index.css                  tailwind layers + base reset
│   │
│   ├── doc/                           ── pure, no React, no DOM ──
│   │   ├── types.ts                   FlashCCDocument, Slide, Block, BrandKit, Role, Format
│   │   ├── defaults.ts                default brand kit, default format
│   │   ├── validate.ts                runtime validation + version + migrate()
│   │   ├── ids.ts                     stable id generation
│   │   ├── parse.ts                   text → blocks (deterministic tokeniser)
│   │   ├── split.ts                   blocks + granularity → slides
│   │   ├── roles.ts                   block shape → inferred role
│   │   ├── serialize.ts               document → text (round-trip partner of parse)
│   │   ├── reconcile.ts               reparse + diff, carries ids and overrides forward
│   │   ├── ops.ts                     document commands (reorder, duplicate, delete, …)
│   │   └── *.test.ts                  colocated; split/serialize/reconcile need heavy coverage
│   │
│   ├── render/                        ── the ONE renderer ──
│   │   ├── SlideRenderer.tsx          LayoutNode[] → absolutely positioned divs. No logic.
│   │   ├── ScaledSlide.tsx            the transform:scale wrapper (preview + thumbnail)
│   │   ├── brandVars.ts               BrandKit → CSS custom properties
│   │   ├── layout/                    ── pure, Node-testable ──
│   │   │   ├── computeLayout.ts       role → LayoutNode[]
│   │   │   ├── formats.ts             logical sizes, safe areas
│   │   │   ├── typeScale.ts           brand type roles → resolved sizes per layout slot
│   │   │   ├── fit.ts                 deterministic fit estimator + overflow detection
│   │   │   ├── cover.ts body.ts list.ts quote.ts cta.ts
│   │   │   └── *.test.ts
│   │   └── metrics/
│   │       └── fontMetrics.ts         per-face advance-width tables for the fit estimator
│   │
│   ├── app/                           ── editor chrome ──
│   │   ├── TopBar.tsx
│   │   ├── SourcePane.tsx
│   │   ├── GranularityControl.tsx
│   │   ├── PreviewPane.tsx
│   │   ├── SlideStage.tsx             workspace bg, shadow, hover role control, zoom cluster
│   │   ├── RoleControl.tsx            floating, on the slide, hover-revealed
│   │   ├── EditableBlock.tsx          in-place text editing
│   │   ├── OverflowMarker.tsx         inline warning + split offer
│   │   ├── Filmstrip.tsx              scroll, drag-reorder, insertion indicator
│   │   ├── Thumbnail.tsx              hover duplicate/delete
│   │   ├── AddSlideTile.tsx
│   │   ├── BrandKitSheet.tsx          side sheet over the preview
│   │   ├── ProjectList.tsx            from the wordmark
│   │   └── EmptyState.tsx
│   │
│   ├── ui/                            ── primitives, all 28px ──
│   │   ├── Button.tsx  IconButton.tsx  SegmentedControl.tsx
│   │   ├── Field.tsx   ColorField.tsx  Select.tsx  Menu.tsx
│   │   ├── Sheet.tsx   Tooltip.tsx     Island.tsx
│   │   └── tokens.ts                  height/spacing/radius constants, single source
│   │
│   ├── state/
│   │   ├── store.ts                   document + selection + ui state
│   │   ├── history.ts                 command stack; every mutation is a command
│   │   ├── persist.ts                 localStorage autosave, project index
│   │   └── keymap.ts                  the one keyboard source of truth
│   │
│   └── routes/
│       └── RenderRoute.tsx            /render — chrome-free export target, sets ready signal
│
├── server/
│   ├── index.ts                       tiny HTTP server, one endpoint
│   ├── export.ts                      Playwright orchestration
│   ├── pdf.ts                         PNG sequence → PDF
│   └── export.test.ts                 dimension + determinism checks
│
├── tailwind.config.ts                 theme.extend wired to the CSS vars
├── vite.config.ts
├── package.json                       + react, vite, tailwind, lucide-react, playwright, zod
├── CLAUDE.md                          ← needs the FlashCC section adding
└── DESIGN_SYSTEM.md
```

### Toolchain delta

The repo is currently a bare Node/ESM TypeScript scaffold — no React, no Tailwind, no
`node_modules`. Implementation starts by adding: `react`, `react-dom`, `vite`,
`@vitejs/plugin-react`, `tailwindcss`, `lucide-react`, `zod`, `playwright`, plus `@types/react`.
Existing strict tsconfig, ESM-with-`.js`-extensions, colocated `*.test.ts`, and the `typecheck`
gate all carry over unchanged.

---

## 5. Build order

1. `src/doc/**` + tests. Pure, headless, no UI. Parse → split → roles → serialize → reconcile.
2. `src/render/layout/**` + tests. Still headless. `computeLayout` for all five roles.
3. `SlideRenderer` + `ScaledSlide`. First pixels. Verify a slide at k=1 and k=0.4 are identical
   modulo scale.
4. `/render` route + `server/export.ts`. **Get export correct before building the editor** — it is
   the piece the brief says to engineer carefully, and it constrains the renderer. Everything after
   this is chrome over a proven pipeline.
5. `ui/**` primitives on the 28px rhythm.
6. `app/**` shell: top bar, source pane, preview, filmstrip, sheet.
7. State, history, keymap, persistence.
8. Empty states, overflow handling, control-budget audit.

---

## 6. Open questions for review

**Q1 — Auto-fit determinism.** The fit estimator can be:
  (a) *pure* — precomputed font-metric tables, deterministic in Node and browser, phase 2 gets
      exact type sizes for free; costs a metrics extraction step per bundled face; or
  (b) *DOM-measured* — measure and shrink in the browser. Simpler, still zero preview/export drift
      (same DOM both sides), but phase 2 would need a browser to learn the final sizes.

  Recommendation: **(a)**, because D2's whole purpose is that phase 2 needs no browser. It is
  perhaps a day of extra work and it is the difference between a pure converter and a scraper.

**Q2 — Granularity re-split vs. manual edits.** Changing granularity re-runs the split. Slides the
user has since edited, reordered, or deleted cannot all survive that. Proposed rule: re-split is a
single undoable command that rebuilds from the current source text, carries `roleOverride` forward
where a slide's content is unchanged, and drops manual reordering. Alternative is to disable
granularity once the document is edited — worse, because it violates R2 (remove, never disable).
Confirm the proposed rule.

**Q3 — Export delivery.** PNG sequence + PDF, ordered filenames. Delivered as a zip download, or
individual files? Zip is one click but adds a dependency and a "what's in here" moment.

**Q4 — Format presets.** Ship 4:5 portrait only in v1 (fastest, and the correct default for
LinkedIn/Instagram carousels), or 4:5 + 1:1 from the start? A format switcher is a ninth control,
which is inside budget but spends it.
