# FlashCC document schema

Semantic and renderer-agnostic. The document stores what a slide **means**. It never stores a
pixel position, a font size, a colour, or any HTML/CSS concept. Layout is derived from
`role + brandKit + format` at render time by a pure function.

Test for any proposed field: *could this field only exist because the renderer is DOM?* If yes, it
does not belong here.

---

## 1. Types

```ts
// ─── document ────────────────────────────────────────────────────────────────

type FlashCCDocument = {
  version: 1
  id: DocId
  name: string                      // project name, edited in the top bar
  format: FormatId
  granularity: Granularity          // the split setting, part of the doc: it reproduces the split
  source: string                    // canonical source text — see §4
  brandKit: BrandKit
  slides: Slide[]
  createdAt: IsoDate
  updatedAt: IsoDate
}

type FormatId = "portrait-4x5" | "square-1x1" | "story-9x16"
type Granularity = "few" | "balanced" | "many"

// ─── slides ──────────────────────────────────────────────────────────────────

type Slide = {
  id: SlideId
  role: SlideRole                   // inferred by the splitter
  roleOverride?: SlideRole          // user's choice from the on-slide control
  blocks: Block[]
}

type SlideRole = "cover" | "body" | "list" | "quote" | "cta"

// effective role, used everywhere layout is computed:
const effectiveRole = (s: Slide): SlideRole => s.roleOverride ?? s.role
```

`role` holds what inference decided; `roleOverride` holds what the user decided. Keeping both
means a re-split can update inference without silently discarding a user's override, and clearing
an override restores the inferred value rather than a guess. `effectiveRole` is derived, never
stored.

```ts
// ─── blocks ──────────────────────────────────────────────────────────────────

type Block =
  | { id: BlockId; type: "heading";   text: string }
  | { id: BlockId; type: "paragraph"; text: string }
  | { id: BlockId; type: "list";      ordered: boolean; items: string[] }
  | { id: BlockId; type: "quote";     text: string; attribution?: string }
  | { id: BlockId; type: "label";     text: string }   // eyebrow / kicker
```

Four content types plus a label. All text is **plain strings** — no inline marks, no rich text, no
spans. The source pane is plain text, and FlashCC never rewrites copy, so there is nothing to
carry. This also keeps phase-2 conversion trivial: a block maps to one text layer, or in the list
case to one layer per item.

```ts
// ─── brand kit ───────────────────────────────────────────────────────────────

type BrandKit = {
  palette: {
    background: Hex
    text: Hex
    accent: Hex
    muted: Hex                      // derived-by-default from text at reduced contrast
  }
  type: {
    display: TypeRoleSpec           // cover heading, quote text, CTA line
    body: TypeRoleSpec              // paragraphs, list items
  }
  logo?: {
    src: DataUri                    // embedded, not a URL — export must not hit the network
    placement: Corner | "none"
    scale: number                   // 0.5–2, relative to the role layout's logo slot
  }
  handle?: string                   // "@name", rendered on every slide unless "none"
  handlePlacement: Corner | "none"
  background: BackgroundTreatment
  safeMargin: number                // fraction of slide width, default 0.075
}

type TypeRoleSpec = {
  family: FontFamilyId              // from the bundled set
  weight: 400 | 500 | 600 | 700
  tracking: number                  // em
  case: "none" | "upper"
}

type BackgroundTreatment =
  | { kind: "solid" }
  | { kind: "gradient"; to: Hex; angle: number }
  | { kind: "grid"; opacity: number }

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right"
```

**Brand lock:** `BrandKit` lives on the document, once. There is no per-slide brand field, and
adding one is the single change most likely to destroy the product's premise. That absence is the
feature.

The brand palette is the **slide's** colour system and is unrelated to the FlashFX app tokens
(see `architecture.md` §3).

---

## 2. What is deliberately absent

| Not stored | Because |
| --- | --- |
| positions, sizes, boxes | derived from role + format |
| font sizes in px | derived from `TypeRoleSpec` + fit estimator |
| colours on slides or blocks | brand lock: colour comes from `brandKit` only |
| any CSS or HTML | the document must survive being rendered by a non-DOM renderer (phase 2) |
| slide dimensions | derived from `format` |
| per-slide brand overrides | the product premise |
| "isSelected", "isEditing", zoom, scroll | UI state, lives in the store, never persisted into the doc |
| computed slide count | derived from `slides.length` |

---

## 3. Phase-2 completeness check

Phase 2 converts this document to a FlashFX scene document (flat layer array with `parentId`).
That conversion is `FlashCCDocument → computeLayout() → LayoutNode[] → Layer[]`, a pure function.
Confirming nothing is missing:

| FlashFX layer needs | Comes from |
| --- | --- |
| position, size | `LayoutNode.x/y/w/h` |
| text content | `Block.text` / `items[]` |
| font family, weight, size, tracking, case | `brandKit.type` + `typeScale` + fit estimator |
| colour | `brandKit.palette` |
| z-order | `LayoutNode` array order |
| parent grouping | `LayoutNode.parent` (slide root → block group → run) |
| scene ordering / timing | `slides[]` order + slide index |
| canvas size | `format` |
| stagger unit for animation | block and item boundaries are preserved, so per-line entrance is available without re-parsing text |

The one dependency: the fit estimator must be pure (`architecture.md` Q1). If fit is
DOM-measured, resolved font sizes are not recoverable without a browser and this table breaks at
row 3.

---

## 4. Source text ⇄ document

`source` is stored on the document and is canonical. The left pane displays it; it is regenerated
by `serialize(doc)` after any structural mutation (reorder, duplicate, delete, split).

**Round-trip requirement:** `parse(serialize(doc))` yields the same block content and slide
boundaries as `doc`.

Serialisation format — plain text, nothing invented:

- Slides separated by a blank line.
- A slide's blocks separated by a single newline where the role permits multiple blocks.
- List items keep their `- ` markers.
- Quote blocks keep a leading `> `.
- Attribution is the line after a quote, prefixed `— `.

No sentinels, no fenced metadata, no HTML comments. If the user pastes the serialised text into a
new document they get the same carousel back. Anything that requires hidden syntax to survive is a
design failure.

**Reconciliation on pane edits** (`reconcile.ts`): re-parse, then diff against the existing slides
matching on `(block type, normalised text)` first and position second. Matched slides keep their
`id` and `roleOverride`. Unmatched become new slides with inferred roles. This is what stops a
single typo from resetting the user's role choices.

---

## 5. Splitting — deterministic rules

Order matters; the first matching rule wins.

**Tokenise** (`parse.ts`):
1. Normalise line endings to `\n`, strip trailing whitespace per line, collapse 3+ blank lines to 2.
2. Split on blank lines → *groups*.
3. Within a group:
   - ≥2 consecutive lines each starting with `-`, `*`, `•`, or `1.` / `1)` → one `list` block
     (`ordered` from the marker type). A single such line is a paragraph, not a list.
   - Lines starting `>` → `quote` block; a following `— …` line becomes `attribution`.
   - Otherwise → `paragraph` block; a single line ending without terminal punctuation and under 60
     characters becomes a `heading`.

**Group → slides** (`split.ts`), by granularity:

| Granularity | Rule |
| --- | --- |
| `few` | merge consecutive non-list groups while combined length ≤ 520 chars |
| `balanced` | one group = one slide; split a group at sentence boundaries only if > 420 chars |
| `many` | split every group at sentence boundaries when > 220 chars |

All four thresholds live in one constants module and are the only tuning in the product.

**Role inference** (`roles.ts`), first match wins:

| # | Condition | Role |
| --- | --- | --- |
| 1 | slide index 0 | `cover` |
| 2 | last slide, ≥3 slides total, and length ≤ 140 chars | `cta` |
| 3 | slide contains a `list` block | `list` |
| 4 | slide contains a `quote` block | `quote` |
| 5 | otherwise | `body` |

Rule 2 is deliberately length-only. Detecting "this reads like a call to action" from wording is a
heuristic that will be wrong in public, and the on-slide role control makes being wrong cheap.

---

## 6. Persistence

```
localStorage
  flashcc:index          → [{ id, name, updatedAt, slideCount }]   for the project list
  flashcc:doc:<id>       → FlashCCDocument (JSON)
  flashcc:brandkit:last  → BrandKit, seeds new documents
```

Autosave is debounced ~500ms, silent, no indicator (R15). `version` + `validate.ts` gate every
load; an unknown or invalid document opens the project list rather than crashing into a blank
editor. No accounts, no sync, no server persistence in v1.

The logo is a data URI inside the document, which makes documents self-contained and exportable
without the network — at the cost of localStorage headroom. Cap the logo at ~256KB after
downscaling and reject larger uploads with an inline message.
