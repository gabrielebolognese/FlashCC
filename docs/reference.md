# FlashCC, reference

What the app is, how each part works, and where the bodies are buried.

Written by reading the source, not from memory. Every constant, threshold and algorithm below was
checked against the file it lives in. Where the code and its own comments disagree, that is noted
rather than smoothed over, §29 collects the lot.

**Supersedes** `architecture.md`, `document-schema.md`, `role-layouts.md` and `template-system.md`,
which describe the design that the Photoshop-model rewrite replaced. `interaction-principles.md`
is still current.

---

## Contents

| | |
| --- | --- |
| **Orientation** | [1 What it is](#1-what-it-is) · [2 Running it](#2-running-it) · [3 The invariants](#3-the-invariants) |
| **The canvas** | [4 Data model](#4-the-data-model) · [5 Canvas](#5-the-canvas) · [6 Text](#6-text-measurement-and-fitting) · [7 Colour](#7-colour-and-contrast) · [8 Gradients](#8-gradients) · [9 Format change](#9-changing-format-reflow) |
| **Making a deck** | [10 Frameworks](#10-the-four-frameworks) · [11 Generation](#11-generation) · [12 Styles](#12-styles-and-themes) · [13 Onboarding](#13-onboarding) · [14 AI drafting](#14-ai-drafting) · [15 Bulk and long form](#15-bulk-create-and-long-form-ingest) · [16 Media, fonts and assets](#16-media-and-fonts) · [17 Screen flow](#17-screen-flow) |
| **The product** | [17b Clients and review](#17b-clients-and-review) · [18 Pipeline and series](#18-the-pipeline) · [19 Analytics](#19-analytics) · [19b History](#19b-version-history) · [20 Library](#20-the-library) · [21 Export](#21-export) |
| **Infrastructure** | [22 Persistence](#22-persistence) · [23 Sync](#23-sync) · [24 Auth](#24-auth) · [25 Billing](#25-billing) · [26 Database](#26-database) · [27 Design tokens](#27-design-tokens) · [28 Testing](#28-testing) |
| **Reality check** | [29 Known defects](#29-known-defects) |

---

## 1. What it is

FlashCC turns a written post into a social carousel, and then keeps the record of how that carousel
did.

Two halves, and the split matters commercially. The **editor** is a Photoshop-style canvas that
makes the artwork. The **pipeline** is what happens after: schedule it, mark it posted, type the
numbers in, and find out which structural choices actually worked. The editor is what competitors
have. The pipeline, specifically the attribution of performance to *framework, hook shape and
slide count*, is what none of seventeen audited competitors ship.

The stack is React 19, Vite 6, Tailwind 3, TypeScript with every strict flag on, Supabase for
accounts and sync, Lemon Squeezy for billing, and Playwright for export. There is no framework on the
server: four routes do not need one.

---

## 2. Running it

```
npm run dev        # both servers via scripts/dev.mjs
npm run typecheck  # app AND server, the build only checks the app
npx vitest run     # 296 tests across 17 files
npm run build      # tsc --noEmit then vite build
```

- **App: http://localhost:5173** (Vite, `strictPort: false`, so it falls forward if taken)
- **API: http://localhost:8787** (bare `node:http`, `tsx watch`)

Vite proxies `/api` → `:8787`, which is why every client call is same-origin and the server has no
CORS handling at all. `scripts/dev.mjs` spawns both as separate shell processes; killing the
supervisor leaves them running.

Everything works with **no configuration**. No Supabase means no accounts and localStorage only;
no `ANTHROPIC_API_KEY` means AI drafting degrades to "write it yourself"; no Lemon Squeezy means no
checkout. None of these are error states, the free tier is the no-config state.

---

## 3. The invariants

Five rules the codebase is built on. Breaking one is how this gets slowly worse.

**Nothing is derived.** What is stored is what renders. A layer a preset created and a layer you
drew are the same object with the same handles. There is no template engine, no roles, no blocks.

**Presets run once.** `presets.ts`, `compositions.ts` and `styles.ts` return plain layers and are
then gone. There is no live template to fight with.

**`LayerView` is the only painter.** Canvas, filmstrip thumbnails, previews, the print portal and
the *server-side export* all render through it. Export works by serialising `LayerView`'s own
output and screenshotting it, a second renderer would drift within a week.

**Pure modules are DOM-free and tested.** `geometry.ts`, `text.ts`, `colour.ts`, `gradient.ts`,
`reflow.ts`, `insights.ts`, `preflight.ts`, `search.ts`, `sync.ts`. That is where the reasoning
lives and where the tests point.

**Two colour systems never mix.** App chrome uses the FlashFX tokens; slide content uses the
document's own palette. An app colour inside a slide is a bug.

---

## 4. The data model

```ts
Doc  { version: 3, id, name, width, height, palette[], media[],
       group?, framework?, styleId?, archived?, slides[], createdAt, updatedAt }
Slide{ id, name, background, gradient?, layers[] }
Layer{ id, name, kind, x, y, w, h, rotation, opacity, visible, locked,
       fill, gradient?, stroke, strokeWidth, radius, …kind-specific }
```

`LayerKind` is `text | rect | ellipse | triangle | line | icon | image`.

**Coordinates are artboard pixels.** A layer at `x: 540` is at 540. Not fractions, not percentages.

**Array order is z-order**, index 0 at the back.

`framework` and `styleId` are stamped once at generation and never re-derived. They exist so
analytics can attribute performance to how a carousel was built, a post cannot tell you that
Problem → Solution outperforms unless something remembered which one it was.

### Defaults worth knowing

| | |
| --- | --- |
| Text layer | `"Type something"`, sans, 64px, weight 600, line-height 1.2, align left, valign top |
| Icon | glyph `star`, `stroke = fill`, `strokeWidth 2`, `fill: "none"` |
| Line | `h: 8, radius: 4`, **forced, overriding whatever height you passed** |
| Image | `fit: "cover"` |
| Slide | background `#12161c` |
| Doc | 1080×1350, one slide |

`uid(prefix)` is `${prefix}_${Date.now().toString(36)}${seq.toString(36)}` with a module-level
counter. Unique per process, **not globally**, two tabs can collide.

`fontStack(id)` checks uploaded faces before built-ins and falls back to `FONTS[0]`, so an unknown
id silently becomes Sans rather than `undefined`.

---

## 5. The canvas

`Canvas.tsx` owns zoom, pan, tools, drag, resize, marquee, drawing, snapping, keyboard and media
drops. `useStudio.ts` owns all state and history.

### Structure

Four nested elements, and the split between them is load-bearing:

1. **host**, `overflow-hidden`, owns the wheel and pointer listeners
2. **centring wrapper**, `translate(-50%,-50%) translate(panX, panY)`
3. **board**, sized `width*zoom × height*zoom`, painted by `slidePaint`. Selection chrome, handles
   and the marquee are children here, in **screen space**
4. **inner**, sized `width × height` with `transform: scale(zoom)`. `LayerView`s, safe zones and
   snap guides live here, in **artboard space**

`toBoard(clientX, clientY) = (client - boardRect.left) / zoom`. Everything past that point is
artboard pixels.

**Every layer is `pointerEvents: "none"`.** All hit testing is done in artboard coordinates by
`Canvas` against `geometry.ts`, never by DOM events. Only a `contentEditable` being edited
re-enables pointer events.

### Zoom and pan

| | |
| --- | --- |
| Fit | `min((hostW - 120)/w, (hostH - 120)/h)`, clamped `[0.05, 2]` |
| Wheel | **zooms**, inverted from the browser default. `ctrl`/`meta`/`shift` pans. Step ×1.12, clamp `[0.05, 4]` |
| Keyboard | `Cmd+=` / `-` / `0`, step ×1.2 |

Zoom is cursor-anchored: `pan` is recomputed so the artboard point under the pointer stays put. The
wheel handler is registered once with `{ passive: false }` and reads zoom through a ref, because
the handler from whichever render installed it would otherwise hold a stale value.

A `ResizeObserver` on the host re-runs fit, **which discards the user's pan and zoom** on any host
resize.

### Tools and drag

`Tool = select | text | rect | ellipse | triangle | line | icon`.

Pointer-down with a draw tool creates a 1×1 layer and enters `draw` mode. On release, anything still
≤4px in either axis was a click rather than a drag and gets a default size: **text 640×120, line
400×8, everything else 240×240**. Text then enters editing. The tool resets to `select`, draw tools
are single-shot.

Hit testing runs **topmost first** and requires `visible && !locked`. Shift toggles membership.
Clicking an already-selected layer preserves the whole selection, so multi-drag works.

| Mode | Behaviour |
| --- | --- |
| `move` | Snaps unless **Alt** is held; positions rounded |
| `resize` | **Shift** constrains aspect. No snapping. Every selected layer re-derives from its captured origin rect |
| `marquee` | Selects everything intersecting, **including locked layers**, unlike click |
| `draw` | Normalised, clamped to ≥4 |
| `pan` | Space held, or middle mouse button |

### Snapping

`SNAP_PX = 6` screen pixels, divided by zoom before reaching `geometry.snap`.

Targets per axis: artboard `0`, midpoint and full extent, plus every other rect's start, mid and
end. Moving edges are the moving box's start, mid and end. Tolerance is strict `<`, so exactly-at-
tolerance does not snap.

**Guides only appear when a correction is actually applied.** A box already perfectly aligned
produces `dx = 0` and therefore no visible guide.

### Keyboard

Window-level, skipped while typing (`INPUT`, `TEXTAREA`, `contentEditable`).

| Key | |
| --- | --- |
| `Space` | Pan (checked before the typing guard) |
| `Cmd+Z` / `Shift+Cmd+Z` | Undo / redo |
| `Cmd+D` / `Cmd+A` | Duplicate / select all on slide |
| `Cmd+]` / `Cmd+[` | Forward / backward |
| `Delete` / `Backspace` | Remove selection |
| `Escape` | Clear editing, clear selection, tool → select |
| `Enter` | Edit text (exactly one text layer selected) |
| `v t r o l i` | select, text, rect, ellipse, line, icon |
| Arrows | Nudge 1px, **10px with Shift** |

There is **no shortcut for the triangle tool**.

### History

Snapshot-based: `commit(doc, coalesceTag?)` pushes the previous `Doc` onto `past`. `LIMIT = 120`
(the array peaks at 121). Undo covers everything, layer edits, reorders, slide operations, with
no command class per action.

Coalescing suppresses a push when the tag matches the previous one, so a drag is one undo step
rather than sixty. It has **no time or gesture boundary**, see §29.

`commit` is also where auto-naming happens: a document whose name is one the app supplied takes its
name from the first text layer on slide 1. A name you chose is never overwritten.

---

## 6. Text measurement and fitting

`text.ts` replaced `ceil(len / 18) * size`, which overflowed the artboard on long hooks. Canvas
`measureText` was rejected deliberately: *"a layout that differs between test and production is
worse than one that is slightly conservative in both."*

### Advance table (em)

| Class | Characters | Advance |
| --- | --- | --- |
| space | `" "` | 0.26 |
| thin | `iljI|!.,;:'` `` ` `` | 0.28 |
| narrow | `ft()[]{}/\-r` | 0.36 |
| wide | `mwMW@` | 0.86 |
| uppercase | `A–Z` | 0.68 |
| digits | `0–9` | 0.56 |
| everything else | | 0.53 |

`FAMILY_SCALE = { sans: 1, display: 1, serif: 0.97, mono: 1.15 }`, `MONO_ADVANCE = 0.6`,
**`SAFETY = 1.02`**, a deliberate 2% over-estimate, because predicting one line too many costs a
slightly smaller font and predicting one too few puts text off the slide.

### Wrapping

Greedy, with `pre-wrap` semantics. Split on `\n` (hard breaks), then on `/(\s+)/` keeping
whitespace runs as tokens. If a word does not fit, flush the line; if the token was whitespace, drop
it (browsers drop leading whitespace on a wrapped line); an over-wide single word is broken
mid-word by scanning for the longest prefix that fits.

`lineCount` is `Math.max(1, lines)`, never zero.

### Fitting

`fitToBox` sorts the ladder descending regardless of input order and returns the first size where
`lines × fontSize × lineHeight <= maxHeight`. If none fit it returns the smallest **with
`overflows: true`** and its real height. It never clamps; callers must.

`ladder(max, min, steps = 12)` produces evenly spaced integers, deduped. `ladder(104, 40)` →
`104, 98, 92, 87, 81, 75, 69, 63, 57, 52, 46, 40`.

`clampY` pins an oversized block to the top of its region rather than centring it, so the start
stays readable.

> **This guarantee currently holds for sans and serif only.** See §29 D1, it is the most
> consequential defect in this document.

---

## 7. Colour and contrast

`colour.ts` exists because literal RGB inversion is not contrast: `#808080` inverts to `#7f7f7f`,
a ratio of about 1.0.

Standard WCAG maths, sRGB linearisation `s <= 0.04045 ? s/12.92 : ((s+0.055)/1.055) ** 2.4`,
relative luminance `0.2126R + 0.7152G + 0.0722B`, contrast `(max + 0.05) / (min + 0.05)`.

| Constant | Value | |
| --- | --- | --- |
| `AA` | 4.5 | WCAG AA body text |
| `INK` / `PAPER` | `#0e1013` / `#f8fafc` | Softened poles, pure black and white read harsh on a tinted ground |
| Luminance crossover | **0.1791** | Where `bestText` switches to a pure pole |
| Muted target | 4.6 | `textFor`'s second colour |

`bestText(bg)` takes the softened pole with more contrast; if it clears 4.5 it is returned. If not
a mid-blue like `#6767e4` tops out at 4.33, it falls back to pure black or white, which
guarantee at least 4.58:1 against any colour.

Tested across a 168-point sweep: hue 0–345 in steps of 15, saturation 70, lightness
`{8, 20, 35, 50, 65, 80, 95}`.

---

## 8. Gradients

Stored as **data, never as a CSS string**, so the same value paints on canvas, reads back into the
editor, and rides along inside a style preset.

```ts
Gradient { kind: "linear" | "radial" | "conic", angle, cx, cy, stops: { colour, at }[] }
```

`angle` is direction for linear, sweep start for conic, and **unused by radial**. `cx`/`cy` are
0–1 origins for radial and conic only. `MIN_STOPS = 2`, `MAX_STOPS = 8`; `addStop` and `removeStop`
are no-ops at the limits rather than errors.

Ten presets. CSS emission sorts and clamps stops first, rounds percentages to one decimal.

### How each layer kind renders one

| Kind | |
| --- | --- |
| text | `backgroundImage` + `backgroundClip: text` + `color: transparent` |
| rect / line | `backgroundImage` on a div |
| **ellipse** | A div with `borderRadius: 50%`, deliberately not SVG, so a ramp and a border both work without a paint server |
| **triangle** | Stays SVG (a border cannot follow it), so the ramp becomes a `<defs>` paint server. **Conic falls back to linear**, SVG has no conic ramp |
| icon, image | **Gradients are ignored** |

---

## 9. Changing format (reflow)

The old `setFormat` changed `width`/`height` and left every layer at its pixel position, so 4:5 →
9:16 stranded the content in the top two-thirds. Proportional scaling, Magic Resize's approach,
is the other wrong answer: it squashes type and turns circles into ovals.

`reflow.ts` splits the rule:

- **Horizontal follows the board.**
- **Vertical position follows the board**, so a block that sat low still sits low.
- **Vertical size does not stretch.** Text keeps its point size, is re-wrapped to the new column,
  and its box is re-measured from the lines it actually needs.
- Full-bleed layers (≥98% of the board) re-cover exactly.
- Non-text layers scale by `min(sx, sy)`, which is what keeps circles circular.

It re-lays **the layers that are there** rather than regenerating from source text. Regenerating is
easier and silently deletes every hand-drawn shape, moved block and placed image.

`verticalFill` exists purely for the tests: *"everything is inside the artboard"* passes for the
broken version too, because stranded content overflows nothing.

### Clearing the destination's chrome (`safearea.ts`)

`reflow.ts` knows the new artboard. It does not know what the PLATFORM draws on top of it, so a
deck reflowed to 1080x1920 kept its 96px side margins and put every headline under TikTok's action
rail, which covers the right 180px of every slide.

`fitToSafeArea(doc, platform)` runs after the reflow in `setFormat`, when the new size belongs to a
platform. One **uniform** scale plus a translate, applied to everything that is not deliberately
full-bleed, clamping each layer into the box separately would move a headline and the rule beneath
it by different amounts and unalign a composition that was aligned.

Font size scales with the box and is **floored**, not rounded: the box shrinks by exactly `scale`,
so a font rounded up is proportionally larger than the box it now sits in, and one extra wrapped
line pushes the layer out the bottom.

`safeScope` is honoured, so Instagram's crop only ever moves the cover.

---

## 10. The four frameworks

`structures.ts`. The product's core IP. Every framework has 8 slots except Story, which has 9. Slot
1 is always `hook`; the last is always `cta`.

Slots carry `id`, `label`, `note` (one line, beside the box), `detail` (hover), `placeholder`,
`examples[]` and `repeatable?`. **`id` is not unique**, three `point` slots per framework, which
is exactly why `alignToSlots` needs two passes.

### `problem`, Problem → Solution
*Name a pain, then fix it. The workhorse, and it works on a cold audience.*

| # | id | Label | Note |
| --- | --- | --- | --- |
| 1 | hook | Hook | Decides whether slide 2 is ever seen |
| 2 | problem | The problem | Make it sting before you fix it |
| 3 | why | Why it happens | Name the cause, not the symptom |
| 4 | solution | Solution outline | The turn. One line, no detail yet |
| 5–7 | point ↻ | Fix | One fix per slide. Verb first · Same shape as the one before · Three is the sweet spot |
| 8 | cta | Call to action | One ask. Two gets you neither |

### `showcase`, Showcase / Portfolio
*Show the work and the thinking behind it. This is the one that books clients.*

| # | id | Label | Note |
| --- | --- | --- | --- |
| 1 | hook | Hook | Lead with the result, not the client |
| 2 | context | Context | One sentence a stranger would get |
| 3 | goal | The goal | Their brief, in their words |
| 4 | process | The process | Show where it started |
| 5–6 | point ↻ | Key decision | Explain the why. That's the expertise · Pick the surprising choice |
| 7 | result | Final result | A number beats three adjectives |
| 8 | cta | Call to action | A keyword beats a link |

### `educational`, Educational / Value
*Teach one thing properly. Builds the authority the others cash in.*

| # | id | Label | Note |
| --- | --- | --- | --- |
| 1 | hook | Hook | Numbers beat vague. "3 tricks" wins |
| 2 | promise | The promise | What they'll know by the end |
| 3 | concept | The concept | The principle underneath |
| 4 | breakdown | Breakdown | Start with the verb |
| 5–6 | point ↻ | Example | Show it working on something real · Three total. A fourth repeats |
| 7 | takeaway | Key takeaway | The line that gets quoted |
| 8 | cta | Call to action | "Save" beats "follow" here |

### `story`, Story / Case Study
*Take them through what happened. The most shared of the four.*

| # | id | Label | Note |
| --- | --- | --- | --- |
| 1 | hook | Hook | Open mid-scene. No setup |
| 2 | situation | The situation | Just enough for the turn to land |
| 3 | problem | The problem | Be specific about the symptom |
| 4 | point ↻ | What they'd tried | Failed attempts make the fix credible |
| 5 | turn | The turning point | The sharpest sentence you have |
| 6 | solution | What you changed | One change, precisely stated |
| 7 | result | The result | Let the numbers persuade |
| 8 | lesson | The lesson | This is what makes it a case study |
| 9 | cta | Call to action | "More breakdowns" beats a pitch |

Tests enforce the writing itself: notes are 11–46 characters, carry no trailing full stop and no em
dash; every slot has a placeholder and at least one example; slot 1 is `hook` and the last is `cta`;
every framework has a repeatable slot.

---

## 11. Generation

`buildSlides(texts, theme, roles?, options?) → Slide[]`. Runs once and returns plain layers.

1. Drop blank texts. **Roles are indexed by the original position**, so they stay attached to their
   text even when earlier entries were empty.
2. Nothing survives → one empty slide. Never an empty deck.
3. Per entry: pick a composition, compute the regions, build the layers, apply fonts.
4. The image placeholder is **layer 0 (back)**, so it and the text cannot hide each other.

### Geometry

**The margin is split by axis**: `MX = 96`, `MY = 140`. One constant served both until Batch 9, and
96 is smaller than Instagram's 135px crop, so every generated carousel failed its own pre-flight.
A single constant could only clear 135 by making every slide needlessly narrow, since Instagram
takes nothing from the sides. 140 rather than 135 exactly, because a margin equal to the boundary is
a rounding error away from crossing it.


`W 1080 · H 1350 · M 96 · COL 888 · BAND 430 · BAND_GAP 56`, inner height 1158.

| | Image band | Text region |
| --- | --- | --- |
| No image |, | 96, 96, 888, 1158 |
| `above` | 96, 96, 888, 430 | 96, 582, 888, 672 |
| `below` | 96, 824, 888, 430 | 96, 96, 888, 672 |

With images off, text gets the whole safe box, which is why "never" produces a visibly larger hook.

### Composition selection

`CYCLE = [heading-body, statement, numbered, quote, underline, caps]`.
`BY_ROLE = { hook: title, cta: block, takeaway: statement, lesson: statement, turn: quote, result: numbered }`.

Without roles: slide 1 is `title`, the last is `block` (when total > 2), everything else cycles.
With roles, a pinned composition is used unless it would repeat the previous slide.

Resolved sequences:

| Framework | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| problem | title | heading-body | statement | numbered | quote | underline | caps | block | |
| showcase | title | heading-body | statement | numbered | quote | underline | numbered | block | |
| educational | title | heading-body | statement | numbered | quote | underline | statement | block | |
| story | title | heading-body | statement | numbered | quote | underline | numbered | statement | block |

### The eight compositions

| id | Band | Ladder | Layers |
| --- | --- | --- | --- |
| `title` | above | 104→40, w700 | `Rule` (accent bar), `Title` |
| `heading-body` | above | head 58→30 (capped at 40% of region), body 40→22 in muted | `Heading`, `Body` |
| `statement` | below | 76→30, w700, centred | `Statement` |
| `numbered` | below | body 46→22, numeral fixed 100px | `Number`, `Tick`, `Text` |
| `quote` | above | 62→26, italic, indent 44 | `Bar`, `Quote` |
| `underline` | below | 70→30, w700 | `Text`, `Underline` |
| `caps` | below | 56→22, uppercase, tracked 0.06 | `Text` |
| `block` | above | 68→26, centred, text in `theme.bg` | `Block` (full-bleed 0→1080), `Text` |

Notes that matter: `heading-body` **silently delegates to `underline`** when the text has no
sentence break, so a slide whose composition "is" heading-body can render as a single underlined
block. `caps` is the only composition that measures uppercased and tracked, since that is what
renders. `block` is the only layer that ignores the 96px margin. `numbered`'s numeral is the
**slide's position in the deck**, not the nth point, "Fix 1" on slide 5 displays `05`.

### Decor

`0` removes accent rules, `1` normal, `1.8` bold. It scales the rule's **height** (quote's bar:
width). `block` ignores it entirely. `title` and `underline` also reserve vertical space for the
rule, so turning decor off changes the type fit, not just the graphics.

---

## 12. Styles and themes

```ts
Theme { bg, fg, accent, muted, displayFont?, bodyFont?, bgGradient? }
```

Fifteen styles: ten flat, five gradient.

| id | Name | bg | fg | accent | muted | Faces |
| --- | --- | --- | --- | --- | --- | --- |
| dark | Dark | `#101215` | `#f2f4f7` | `#ffffff` | `#8b93a1` | sans |
| light | Light | `#ffffff` | `#101215` | `#101215` | `#6b7280` | sans |
| ink | Ink | `#12161c` | `#f4f6f8` | `#d9a521` | `#8b96a5` | sans |
| paper | Paper | `#f7f4ed` | `#1a1a18` | `#c2410c` | `#6b665c` | serif |
| cobalt | Cobalt | `#12285a` | `#ffffff` | `#7ec8ff` | `#9fb2d9` | sans |
| bloom | Bloom | `#fdf2f8` | `#2b1220` | `#db2777` | `#7a556a` | sans |
| forest | Forest | `#0f2419` | `#eef7f0` | `#5fd08a` | `#8aa896` | sans |
| terminal | Terminal | `#0a0a0a` | `#e6e6e6` | `#4ade80` | `#7d7d7d` | **mono** |
| noir | Noir | `#0c0c0d` | `#fafafa` | `#ef4444` | `#8a8a8f` | sans |
| sand | Sand | `#efe7da` | `#2a2118` | `#9a6b3f` | `#7c6f5f` | serif/sans |

Gradient styles: **Dusk** indigo→magenta, **Ember** deep red→burnt amber, **Deep sea** navy→teal,
**Halo** (radial) lit centre on near-black, **Dawn** cream→rose.

Tests enforce per style: fg/bg ≥ 4.5:1, muted/bg ≥ 3:1, accent/bg ≥ 3:1, and **bg-on-accent ≥ 3:1**
because the CTA block prints `theme.bg` text on `theme.accent`. Gradient styles are additionally
checked against **every stop**, not just the first: contrast against `theme.bg` only checks one end
of a ramp that text sits across the whole of. That test caught two real failures during
development.

### Brands

A **brand is a named, saved `Theme`**, nothing more ambitious, and the restraint is the point. The
moment a brand becomes something documents *refer to* rather than something applied *once*, the
"nothing is derived" invariant goes and every carousel starts changing under the user when they
touch a swatch.

Brands join the style gallery as ordinary entries with the id `brand:<id>`, so nothing downstream
knows the difference.

**Applying one to an existing carousel** (`brand.ts#applyBrand`) is inference, and it says so. The
primary rule is an exact colour match against the theme the document was generated with, knowable
because `styleId` is stamped. That catches hand-drawn shapes that reached for a palette colour and
never touches a colour the old theme cannot explain.

A name-based fallback covers generator layers whose colour was since changed, but it is skipped
whenever the layer already wears one of the *target* theme's colours. That guard is load-bearing
rather than tidy: several compositions emit a layer called `Text` meaning different things, and the
CTA block's copy is deliberately `theme.bg` because it sits **on** the accent block. Without the
check, a second application "corrects" it to `fg` and makes it invisible against its own
background. The idempotence test is what caught that.

It returns `{ changed, skipped }` so the UI can report what happened instead of claiming success.

**Tier limits are enforced in Postgres**, not the browser, one free, three on Pro, unlimited on
Agency. The limit is an INSERT policy, so editing an existing brand is never refused and somebody
who downgrades keeps the brands they made. They simply cannot add another until they are back under
the line.

Brands are the first thing in the product that genuinely *is* Pro rather than advertised as Pro.

---

## 13. Onboarding

Five questions, stored under `flashcc:v3:prefs`.

| Question | Field | Effect |
| --- | --- | --- |
| Light or dark? | `ground` (+`customBg`) | `theme.bg/fg/muted` |
| Pick an accent | `accent` | Rules, numerals, quote bar, CTA block |
| How should headings read? | `displayFont` | `theme.displayFont` |
| Do you use photos? | `images` | Reserve an image band or not |
| Lines and accents? | `decor` | 0 / 1 / 1.8 |

Ten grounds, eight accent swatches, plus a freeform colour picker. A custom ground derives its text
colours through `colour.textFor`, so **one decision cannot produce an unreadable deck**.

Every storage access is try/caught, and in private mode `hasOnboarded()` returns **true**, never
nag someone whose browser cannot remember the answer.

> `REPLAY_IN_DEV = true` in `onboarding.ts` forces onboarding on every dev load. The returning-user
> path is unreachable in dev without flipping it.

---

## 14. AI drafting

The key lives on the server and never reaches the bundle. That is the entire reason the server
process exists.

1. `AiChat` takes a brief. `Cmd/Ctrl+Enter` submits; a new request aborts any in flight.
2. `draftSlides` POSTs `{ brief, structure: { name, shape, slots }, voice? }` to `/api/draft`.
3. The server assembles the prompt in `prompts.ts`, calls the model through `anthropic.ts`, and
   parses into a zod output format.
4. **A policy decline returns 200 with no usable content**, so `stop_reason === "refusal"` is
   checked before reading and mapped to 422.
5. Every slide goes through `plainText()` on the way out, see below.
6. `alignToSlots` runs **two passes**: first match drafts to slots by role, then fill what is left
   positionally. One pass swallowed the CTA whenever the model answered out of order, the three
   `point` slots sharing an id is exactly what breaks a naive match.

### Three server modules, and why it is not one

| Module | Holds | Why separate |
| --- | --- | --- |
| `prompts.ts` | every word sent to a model, and `plainText` | pure, so `prompts.test.ts` can prove it |
| `anthropic.ts` | the client, models, retry, usage logging, error translation | one policy, not one per route |
| `draft.ts` | request shape, zod schemas, rate limits | what is left is only the routes |

It was all inline in `draft.ts`, which meant a prompt edit showed up in somebody's carousel rather
than in a diff. The golden tests in `prompts.test.ts` assert the assembled bytes.

**A model per task.** Drafting seven slides from a brief is reasoning; five one-line rewrites is
not. `MODELS.draft` is `claude-sonnet-5`, `MODELS.hooks` is `claude-haiku-4-5-20251001`. This was
measured, not assumed: `npm run eval:draft -- --compare` ran four frameworks and two briefs through
Sonnet and Opus. Opus is richer on thin briefs, Sonnet is tighter and faster, and the gap does not
justify the price.

**The cache boundary is a design decision.** Anthropic caches a *prefix*, so anything before the
breakpoint must be byte-identical between calls. What never varies goes in the system block with
`cache_control: { type: "ephemeral" }` and caches across every user; what varies per request goes
in the user message. Brand voice is deliberately *not* in the cached block: it is per brand, so it
would give every brand its own cache entry and the shared prefix would be worth nothing.

**Rate limits are not credits.** `DRAFTS_PER_HOUR = 60`, `HOOKS_PER_HOUR = 120`, keyed per account.
They do not count down, do not appear in the interface, and nobody using the product normally will
meet one. Invariant 7 stands: a limiter stops a script, a credit system taxes ordinary use, and
they are opposites that look alike.

### `plainText`, and why a prompt was not enough

The house style has no em dashes and `copy.test.ts` holds every source file to it. Model output is
not a source file, so nothing held it to anything, and a comparison run had Opus put em dashes in
four slides out of eight. Both system prompts now ban them **and** `plainText()` strips them from
every slide and every hook before the response leaves the server. The prompt is a preference; the
function is the guarantee, and the difference matters when the words publish under somebody else's
name.

### Brand voice

`Brand.voice` is `{ tone?, samples?, avoid? }`, all optional, stored as one `jsonb` column
(`10-brand-voice.sql`). A brand with no voice produces exactly the prompt it produced before the
feature existed, so it can be ignored forever without the product feeling half-configured.

**The samples carry the weight.** Three posts somebody actually wrote do more than any number of
adjectives about being punchy, because a model can match a pattern it can see and can only guess at
a description.

Which voice applies: `voiceOf` reads it from the deck's own `styleId` when that names a brand.
`contextVoice`, for a deck that does not exist yet, takes the selected client's brand, or the only
brand that has a voice, and otherwise **nothing**. It refuses to guess between several, because no
voice reads as generic, which is what people expect from a machine, while the wrong one reads as
the product not understanding who they are.

### The eval harness (`npm run eval:draft`)

Not in `npm test`, because every run costs real money and a suite people run fifty times a day
cannot be one that bills them. It checks structural properties only: slot count, empty slides, hook
over 90, body over 220, placeholders, unknown slot ids, duplicate slides, dashes, and measurements
absent from the brief. Then it prints the copy, because the checks catch *broken* and only a person
catches *bad*.

It has already earned itself twice. It caught the showcase framework inventing a coffee brand and a
30-second reel from a three-word brief, fixed with a rule in `DRAFT_SYSTEM`. And it caught the em
dashes above. Its own fabrication check was wrong first: it flagged every educational draft for
hooks like "3 cutting rules", which is a deck counting its own slides, so it now looks only for
measurements, a currency amount, a percentage, a multiplier, a unit of time.

### AI writes text. It never writes layout.

Invariant 5, and the reason both routes return only words. Every documented complaint about AI
carousels in the research is about layout, *"Text sizing shifted from slide to slide with no clear
logic."* *"Some text ending up too small to read."*, while people value a model for exactly one
thing: splitting prose into headline-length beats. So `/api/draft` returns `{role, text}`,
`/api/hooks` returns `{angle, text}`, and `compositions.ts` decides everything visible from those
words deterministically.

A route that returned a size, a position, a colour or a composition would break this, and the
breakage is invisible until somebody's deck ships looking wrong.

### Rewriting one line (`/api/rewrite`, `rewrite.ts`, `RewritePicker.tsx`)

The thing that sat between the two routes. Drafting was one shot, so a slide four that was nearly
right had to be fixed by hand or by redrafting the whole carousel.

**One route, six intents**, because the difference between "shorter" and "punchier" is one line of
the prompt and six routes differing by one line is six things to keep in step. `INTENT_RULES` in
`prompts.ts` writes each one out, and every rule also says what *not* to do, because the obvious
failure of all six is the same: making a line better by making a bigger claim.

Returns `{ options: [{ note, text }], limit }`. **`limit` comes back from the server** rather than
being a constant on both sides: 90 for a hook, 220 otherwise, and two copies of those numbers is how
they stop agreeing.

`shortNote` clamps a note to 32 characters at a word boundary. A live run returned "Names the
sensory disconnect without using technical terms" where the interface shows two or three words. The
prompt asks for four words maximum and this guarantees it, the same split as `plainText`.

**Applying takes one of two paths, decided by who owns the box:**

| Layer | What runs | Why |
| --- | --- | --- |
| generated | `slideTextWith` then `restateSlide` | the box was measured for the old words |
| hand-edited | a direct `updateLayers` | see below |

`slideTextWith` exists because `restateSlide` replaces a slide's **entire** copy. Handing it one
layer's new text would rebuild the slide from that line alone and delete the other one, which a
heading-plus-body composition has. It swaps one line inside the slide's whole text, in the same
order `textsOf` reads it, and if those two ever disagree the slide quietly reflows.

The direct write for a hand-edited layer looks like a violation of "never a direct layer write" and
is the rule applied properly: `restateSlide` keeps hand-edited layers verbatim *and* rebuilds from
the text, so running it on one prints the new words as a generated layer and keeps the old
hand-placed one, the same line twice. Somebody who dragged a box has also already said where it
goes.

**`slotAt` refuses to guess.** Roles are not stored at runtime, see §the model, so the only route
back to a slot is positional, and it is only trustworthy while the slide count still equals the
structure's slot count. A split, a merge or a reorder breaks it, and a CTA rewritten as a mid-deck
point is worse than one rewritten with no slot at all.

**`effort` is not sent, to any Haiku route.** Haiku 4.5 rejects the parameter with a 400. This was
found by extending the eval harness to cover rewriting, and it revealed that `/api/hooks` had been
sending it since Batch 10 and failing on every call. It is a reasoning-model control and neither
route reasons.

**Multi-select rewrite is deliberately absent.** See Batch 11 in the roadmap: any apply rebuilds a
slide and invalidates the ids or indices the rest of a queue points at, so "accepting one does not
alter the other two" is the one thing that cannot be promised.

### Hook variants (`/api/hooks`, `variants.ts`, `HookPicker.tsx`)

A separate route rather than a flag on `draft`: one line in, several out, each labelled with the
**angle** it takes. The whole deck is sent, not just the current hook, a hook rewritten in
isolation promises whatever sounds best, one written against the slides promises what is in them.

`angle` is not decoration. Five near-identical rewordings do not help somebody iterating; five
genuinely different approaches do, and naming the approach is what lets a choice be made on
judgement.

**Nothing is ranked**, and that is load-bearing. The most-upvoted complaint in the corpus is about
exactly that: *"its virality score and my audience disagree, constantly... I have stopped trusting
the ranking and now I scrub the whole thing myself anyway, which defeats the point of paying."*

`distinctHooks` drops anything matching the current hook or another variant once punctuation and
case are stripped. Picking one calls `restateSlide`, which rebuilds the deck and takes one slide,
see §11, rather than writing new text onto a layer whose box was measured for the old words.

---

## 15. Bulk create, and long-form ingest

`---` on its own line separates carousels; a blank line separates slides.

```
parseBulk: normalise CRLF → split /^[ \t]*-{3,}[ \t]*$/m → trim, drop empties
           → split each on /\n\s*\n/ → title = nameFromHook(first line)
```

`"A --- B"` on one line does not split, and neither does `"Cut on motion - not on beat"`. Empty
blocks are dropped.

### Long form: one asset, several carousels (`longform.ts`, `Repurpose.tsx`)

Paste an article, a newsletter or a transcript; pick the moments; get a carousel each. It produces
the same `BulkBlock[]` bulk create already consumes, so there is one generation path rather than
two that drift.

**Two steps, and the order is the design.** Nobody in the research complains that the slides look
bad. They complain that the machine picked the wrong material. So: candidates, then a choice, then
the work, never a finished series handed back for approval.

**Deterministic, and it runs with no API key.** The thing people distrust is a model choosing their
material, and a heading is a choice the author already made.

| Shape | Detected by | Candidates from |
| --- | --- | --- |
| `markdown` | `#` headings, or a setext underline | one per heading; text before the first is its own |
| `transcript` | timestamps or `Speaker:` on a third of lines | timestamps and labels stripped, sentences regrouped in threes, then windowed |
| `prose` | anything else | even ~1400-character stretches, never splitting a paragraph, **labelled as exactly that** |

**Every cut lands on a sentence boundary.** `sentences()` is the one function in the file that
matters, because *"The Quotes, Hooks & Timestamps pick up in the middle of a sentence so it does not
make any sense"* is the most-cited failure of every competing tool. It rejects a boundary when the
preceding word is a known abbreviation, a single initial, or a number, `3.` is a list marker, not
the end of a thought.

Each candidate reports its title, where it came from, its size and how many slides it would make.
Nothing is scored, pre-ticked or called recommended. A section under `THIN_CHARS` (400) is offered
anyway, **labelled short** rather than hidden.

`toSlides` maps a candidate to 3–10 slides: short paragraphs whole, long ones divided at sentence
ends, and anything past the ceiling **folded into the last slide rather than dropped**, generation's
own split pass will give an overlong slide another slide, whereas material thrown away here is gone
without anyone being told.

---

## 15b. Slide backgrounds

A slide paints in one of three ways, and `paint.ts` is the only thing that decides which:

| | Stored as | Painted as |
| --- | --- | --- |
| Solid | `background` | `background` |
| Gradient | `gradient` | `background-image` over the colour |
| Picture | `image` | `background-image` over the colour, under a scrim |

**The picture is not a layer**, deliberately. A full-bleed image layer at z-order 0 would look the
same and would be the Photoshop-model answer, but it is selectable, draggable and deletable by
accident, and it shifts every other layer's index by one. A background is the thing you put content
*on*, so it belongs to the slide the way `background` and `gradient` already do.

The colour stays underneath a picture rather than being replaced, because it is what shows through a
`contain` fit.

**The scrim defaults to 0.35 and that is not a stylistic default.** Text on an unscrimmed photograph
is the fastest way to make a carousel unreadable, and the contrast rules enforced everywhere else
cannot see into an image. Dragging it to zero is a choice somebody makes on purpose.

The dimming is listed **first** in `background-image`, because CSS paints the first one nearest the
viewer. Second would put the photograph over the dimming, which looks identical at 0 and does
nothing at every other value.

The URL is quoted with **single** quotes. `exporter.tsx` flattens this into an HTML `style="..."`
attribute, so a double quote closes the attribute and the slide renders blank.

### The five paths a background has to survive

A slide background is the one picture that is not in `slide.layers`, which is why every path that
walks images forgot it at first. Each of these was a real hole:

| Path | What it does | What it missed |
| --- | --- | --- |
| `hoistInlineAssets` | data URL to library asset | bytes stayed inline forever |
| `dehydrateDoc` | drop bytes the library holds | full data URL written on every save |
| `resolveDoc` | signed URL back into `src` | broken picture once the link expired |
| `assetIdsIn` | what the doc depends on | the file could be collected while in use |
| `inlineDoc` | inline for the export Chromium | every slide printed with no background |

`assets.test.ts` and `paint.test.ts` hold all five.

---

## 16. Media and fonts

### Preparing a file

**`media.ts`** downscales to a 1600px long edge at quality 0.82. PNG and WebP re-encode to WebP,
everything else to JPEG, and the re-encode is discarded if it came out bigger. Small files under
400KB skip re-encoding entirely, **deliberately, so small GIFs keep their animation**, which a
canvas round-trip would kill. One unreadable file is swallowed so the rest of a drop survives.

It no longer decides where the bytes GO. That is `library.ts`.

`bytes` is now `dataUrlBytes(src)`, the decoded size. It used to be `src.length`, the length of a
base64 string, about a third larger than the file, so every size shown and every quota decision
made from it was wrong.

### The library (`assets.ts`, `library.ts`)

An asset is a record belonging to the **account**, not to a document:

```
Asset { id, kind: "image" | "font", name, path, mime, bytes,
        w?, h?, family?, brandId?, role?, folder?, key?, data? }
```

`path` is the object in the `media` bucket. `key` is a content fingerprint, which is what makes
the same logo across twenty carousels one object. `data` holds the bytes inline and exists only
for an asset that has never reached a bucket, signed out, or a failed upload waiting for the next
sign-in.

**A document refers to an asset by id.** `Layer.assetId` and `MediaItem.assetId` are the durable
half; `src` is whatever should be painted right now and is expected to go stale, because a signed
URL expires.

| Function | Does |
| --- | --- |
| `hoistInlineAssets(doc, known)` | Pure. Lifts every inlined data URL into an asset, deduplicated by fingerprint, and ADDS an `assetId` without touching `src` |
| `dehydrateDoc(doc)` | Pure. Blanks `src` wherever there is an `assetId`. Called by `putDoc`, so every write drops the redundant bytes |
| `resolveDoc(doc, urlOf)` | Pure. Puts a live URL back into `src`. Returns the same object when nothing changed |
| `ensureUrls(assets)` | Signs everything missing in ONE `createSignedUrls` call, into a module-level cache |
| `migrateInlineDocs(userId)` | The 5.1 migration. Rewrites references, stores the new assets, then writes the document, in that order |

The migration order is the whole safety argument: if it dies between steps the document on disk is
the untouched original with its pictures still inline, and the next run finds them again. It uses
`putDoc`, not `saveDoc`, a migration is not an edit, and restamping would make every local
document win the next merge.

**Nothing is derived still holds.** The layer owns its box, fit, radius and z-position. What moved
out is the file, which is what `<img src>` has always meant.

### Fonts

8 built-in stacks chosen so nothing has to be downloaded. **A font is an asset** with
`kind: "font"` and a `family`, which is what lifted the old `MAX_FONTS = 6`: that cap was
localStorage arithmetic, not a decision. Signed out it still applies (`LOCAL_FONT_LIMIT`, 400KB
each); signed in the ceiling is the plan (`FONT_LIMIT`: 12 / 50 / unlimited) at 4MB each.

Families are namespaced `FCC <label> <timestamp>` so an uploaded "Inter" cannot shadow a system
face. `migrateLegacyFonts()` moves anything under the old `flashcc:v3:fonts` key into the library
on first run, keeping ids so a document already naming a face still resolves to it. `FontUpload`
teaches what a usable font file is, because most people have never downloaded a `.woff2` and will
otherwise drop in a 3MB `.ttf` and hit the cap with no idea why.

### Brand logos

`Brand.logos` is `{ light?, dark?, mark? }`, **asset ids**, not files, so five brands can share
one object. `logoRoleFor(brand, background)` prefers the mark and otherwise picks from the
background's luminance, which is the only thing an automatic placement has to get right.

`stampLogo(doc, brand, resolve, slides?)` places it on the first and last slide as an **ordinary
image layer**, marked `handEdited` so a re-lay keeps it. Idempotent per slide. It runs once and
leaves plain layers, exactly as a preset does. Applying a brand calls it in the same commit, so
"it used my brand assets automatically" is true without a second button, the one line in the whole
research corpus that no competitor has review evidence of.

### The session shim

`session.ts` holds the current user id and plan, written only by `useAccount`. Uploading happens in
the media pool, the font dialog, the brand editor and the library grid; threading a user id through
four component trees to reach one `upload` call is a lot of prop for one globally true fact. It is
deliberately not reactive, anything that should re-render already has the account as a prop.

---

## 17. Screen flow

```
welcome → firstRun → start(Home) → frameworks → ai → compose → style → studio
```

- **welcome**, the five questions, or straight through
- **firstRun**, typewriter, then create / see examples / not yet
- **start**, `Home`, the six-view shell
- **frameworks**, the four cards plus "Not sure" (→ `problem`)
- **ai**, draft with Claude, or write it yourself
- **compose**, one field per slot, examples clickable, `+` between fields
- **style**, the gallery, then the document is minted
- **studio**, the canvas

The document is created in `style → onUse`: name from the hook, `framework` and `styleId` stamped,
palette built, `buildSlides` run. `Studio` is keyed on `doc.id` so each project gets a fresh
history stack.

Deliberate delays: frameworks 1000ms, AI chat 300ms, style picker 1500ms with five fake progress
steps, bulk 1400ms, welcome exit 1000ms. The style picker's comment says it plainly: *"Real work is
instant; this is the beat that shows it happened."*

---

## 17b. Clients and review

### Clients (`clients.ts`, `ClientAdmin.tsx`)

A client owns brands, assets, projects and posts. `clientId` is a nullable field on all four, and
**it does not replace `group`**, a group is a folder ("March", "Launch"), somebody with one client
still wants folders, and Batch 6 forms a series out of a group's contents. A client owns; a group
organises.

Two sentinels, both first class:

| Value | Means |
| --- | --- |
| `ALL_CLIENTS` | Everything, unassigned work included. The default and the top entry in the switcher |
| `UNASSIGNED` | Only work with no client. A real bucket, most of anybody's library starts here |

The roll-up is not an escape hatch. The evidence asks for both halves at once: *"I can separate
each one so that nothing gets mixed"* (Gain) alongside *"it was a downside to have to toggle back
and forth between clients instead of seeing everything under one view"* (CoSchedule), and a tool
that only does the first is what the second complaint is about.

`Home` filters `posts` once at the top into `visiblePosts`; every screen below reads that rather
than `posts`. An analytics tab that ignored the switcher would look like bad data rather than a
missing filter. `Projects` applies the client filter **before** counting facets, so a facet never
offers a count that clicking it cannot produce.

Limits are the ladder brands already use, free 1, pro 5, agency unlimited, enforced by an INSERT
policy in `06-clients.sql`, so a downgrade keeps what you have and only refuses the next one.

**Deleting a client does not delete their work.** `client_id` is deliberately not a foreign key: a
cascade would mean an agency losing a client loses a year of carousels, with no undo. Everything it
owned becomes unassigned, and the confirmation says so before anybody presses it.

### Review links (`review.ts`, `sharing.ts`, `server/review.ts`, `ReviewLink.tsx`)

The only feature in FlashCC with **no offline half**. A review link is a URL somebody else opens;
there is no localStorage version of that.

It is also the only place where **RLS is not the boundary**. A reviewer has no `auth.uid()`, that
is the feature, and an anon policy trusting a token in the row means letting the anon key read
`shares` to find the match, which is the same as letting it read every share. So the boundary is
`server/review.ts`: the service role key, one lookup by token, and a response containing only what
that token entitles the caller to.

`strip()` builds a **new object** rather than deleting keys. An allow list cannot leak a column
somebody adds next year; a deny list can.

| Route | Who | Does |
| --- | --- | --- |
| `GET /api/review?token=` | anyone with the link | the share, its client-scoped comments, the brand's paint |
| `POST /api/review/comment` | anyone with the link | one comment, scope hard-coded to `client` |
| `POST /api/review/decision` | anyone with the link | approve or request changes, stamping the version |

The owner's half goes through PostgREST as usual, gated by owner-only policies. **Shares and
comments do not sync**, a comment written by somebody else cannot originate on this machine, so a
local copy could only be a stale cache of a conversation. `sync.ts` is untouched by this.

Open-endpoint ceilings: 2000 characters a comment, 60 a name, 500 comments a share, 20 writes a
minute per token. A revoked link answers a plain **404**, saying "this link was turned off"
confirms to whoever holds it that it was once real, and the person who revoked it did so to end the
conversation.

### A share is a snapshot

Creating one publishes the deck through the Batch 5 path and records the public URLs plus a version
fingerprint. Three reasons it is not a live view of the editor:

1. a logged-out reviewer cannot read the private `media` bucket, and uploaded fonts live in the
   owner's browser, a live render would show missing images in a face nobody chose
2. the client should approve **what will be posted**, not a canvas that has moved since
3. it makes approval-per-version nearly free

### Approval, pinned to a version

*"Three people approved the post. None of them approved the same version."*

`docVersion(doc)` fingerprints geometry, colour, size and words of every **visible** layer,
because *"safeties to ensure that approved images aren't confused with modified ones"* is about a
nudged headline as much as a rewritten one. It ignores ids and timestamps, so re-laying a deck to
the identical result does not invalidate an approval.

Approving stamps `approved_version`. `stalenessOf` compares it to the deck as it stands and reports
`current` or `stale`. A stale approval is **reported, never revoked**, deciding for somebody that
their sign-off is void is worse than telling them it is old, because only they know whether the
change mattered. Re-capturing resets the share to `open` and clears the decision, since leaving a
tick on slides nobody has seen is the same failure wearing a badge.

### Two comment scopes

Internal and client-visible, in one thread for the owner and a shorter one for the client. The
filter is on the **server**, `scope` is hard-coded to `client` on the public insert route, so a
malformed body cannot mint an internal note, and the reviewer's read never selects one. A leak in
that direction is the single worst bug this product could ship.

Comments attach to a **slide index**, and that is the whole trick: every other proofing tool needs
an x/y annotation engine because it reviews arbitrary artwork, while a carousel is already an
ordered list of pictures. The index rather than the slide id is authoritative, because a comment is
against a snapshot and re-laying a deck can change ids while the pictures keep their order.

### White label

The review page wears the agency's brand, theme colours and logo, falling back to a neutral light
scheme rather than to FlashCC's dark chrome, so an unbranded page looks like a document rather than
somebody else's product with the logo taken off. `brands.logos` holds asset ids pointing into the
private bucket, so the server signs them at read time (one hour) rather than at share time; a link
opened in six weeks still shows a logo. Gain gates this at $199/month.

### No seats. Ever.

There is no reviewer record, no invitation and nothing counting them. Sprout charges **$499/month
per external approver** and caps the account at three; it is the loudest single complaint in the
research corpus. See invariant 6, the note at the foot of `07-review.sql`, and `REVIEWER_PROMISE`
on the pricing screen.

---

## 18. The pipeline

A **Post is not a Doc.** A Doc is the artwork; a Post is one publication of it, so the same carousel
can go to LinkedIn on Tuesday and Instagram on Friday as two records with two sets of numbers.

```ts
Post { id, docId, title, stage, platform,
       framework, slideCount, hook, styleId,      // the structural snapshot
       scheduledFor, postedAt, url, caption, notes, metrics,
       createdAt, updatedAt }
```

The structural fields are **copied at creation, not looked up through `docId`**, because the
document keeps being edited and the version that earned the numbers is the one that went out.

| Stage | Hint |
| --- | --- |
| `idea` | A thought, not a carousel yet |
| `drafting` | Being written or designed |
| `ready` | Finished, waiting for a slot |
| `scheduled` | Has a date |
| `posted` | Live, collecting numbers |

Entering `posted` stamps a date; **leaving it clears the date again.** A post sitting in "drafting"
while still carrying `postedAt` would keep feeding the baseline, a bug nobody notices and everybody
acts on.

`isMeasured` requires stage `posted`, a `postedAt`, a `metrics` object **and non-zero reach**. Every
ratio downstream divides by reach, so zero has to be turned away at the door.

Seven metrics are entered by hand, each labelled with the platform's own word for it, because the
fastest way to make manual entry hurt is to make people guess which number goes in which box.
`engagements = likes + comments + shares + saves`, clicks and follows excluded.

### Series (`series.ts`, `SeriesDue.tsx`)

`Doc.series` and `Post.series` are both `{ id, part }`. Two fields, not a table: every screen
showing a carousel wants to know whether it is part 3 of 6, and a join for a badge is a round trip.
The series **name** is taken from the lowest-numbered part, so a deleted part 1 does not blank it.

On `docs` the columns are a projection of the blob, like `framework` beside them. On `posts` they
are a **copy**: a post is the record of what went out, and renumbering afterwards must not rewrite
what "part 2" meant on the day it was published.

The roadmap had this as a numbering feature. The research says numbering is the least of it:

**Discovery**, *"My Part 4 has 1M views but Part 1 has only 5K, because viewers can't find it."*
Neither platform lets a carousel link to another post, so `seriesCaption` is the only fix available:
a list of every part, carrying real URLs for the ones already live, `(coming)` for the ones not,
and a marker on the current part. Copyable from `PostSheet`.

**Momentum**, *"by the time you make the part two in the series, it's like a month later and
there's just no momentum anymore."* `dueParts` reports a series with something live and an
unpublished next part, after `MOMENTUM_DAYS` (3), marked stale after `STALE_DAYS` (10). Three rules
keep it from becoming wallpaper: an unstarted series is not losing momentum, an already-scheduled
next part is a decision rather than a lapse, and it measures from the most recent live part rather
than from part one.

It is a **banner**, not a notification, because there is no background job and no permission to send
anything. Shown on Projects and Scheduled only, the board is a fixed-height column layout a banner
would squeeze.

**Reconciliation**, `renumber` closes the gap a deleted part leaves, breaking ties in place order,
and returns members in the caller's order rather than the sorted one: it fixes numbers, it does not
rearrange anybody's grid. Called from `deleteDoc`, so it happens however a carousel was removed.

`spread` answers the question people ask out loud, *"Drop them all at once? One per day?"*, with
the three cadences they describe, carrying the time of day across every part and skipping anything
already posted.

### Caption, transcript and first comment (`transcript.ts`)

All three read the **layers**, not a source text, because what is stored is what renders. Hidden
layers are excluded: a screen reader being told about something sighted readers cannot see is worse
than no transcript.

`slideText` sorts by font size, reading order on a slide IS type hierarchy, flattens soft line
breaks to spaces (a break inside a headline is where the line wrapped on a 1080px artboard, and
carrying it into a caption produces a post that looks broken on a phone), and undoes an `uppercase`
override, which is styling a screen reader spells out letter by letter.

**The transcript exists because per-slide alt text is impossible**, not merely unimplemented.
LinkedIn's Documents API carries a `title` and nothing else; Meta's excludes `alt_text` from
carousel children. A plain-text version in the caption or first comment is the only fix on either
platform, and nobody ships it. Numbered `1/` rather than `1.`, because a full stop starts an ordered
list in every editor on both platforms and silently renumbers from 1.

`captionOf` is slides 1 and 2 plus the closer, the rearrangement experienced creators already
hand-roll: *"write the carousel first, then pull the text post out of slides 1 and 2. You're forced
to fix the hook."* Deterministic, because those words are already approved. `CAPTION_LIMIT` is per
platform and `clamp` cuts on a word boundary, since a caption is truncated **live** rather than
rejected and nothing says so.

---

## 19. Analytics

Two ideas carry `insights.ts`.

### The baseline

An outlier is not "a big number", it is "a big number **for you**". 4,000 impressions is a triumph
on a small account and a flop on a large one. So everything is a ratio against the median of your
own recent posts.

**Median, never mean.** One genuinely viral post drags a mean so far up that nothing clears the bar
again, the feature would quietly stop working exactly when it got interesting. There is a test with
a 100k post among five ordinary ones that pins this.

| Constant | Value | Gates |
| --- | --- | --- |
| `BASELINE_WINDOW` | 20 | How many recent measured posts the median draws from |
| `MIN_TOTAL` | 5 | `Baseline.ready`; `findings()` returns `[]` entirely below it |
| `MIN_GROUP` | 3 | A bucket is not reported below this n |
| `OUTLIER_AT` | 2 | The outlier band |
| `WEAK_AT` | 0.5 | The weak band |

`confidence(n)`: under 5 "Early signal", under 10 "Worth watching", else "Consistent". The wording
is deliberately hedged at the low end, *"early signal" invites another post, "consistent" invites a
decision.*

### Attribution

Six dimensions, all derived from data already stored: **framework, hook shape, length band, style,
platform, weekday**.

Hook shape is classified in this order: leading digit → Number; `^how (to|i|we|this|these)` →
How-to; contains `?` → Question; a mid-string listicle pattern → Number; else Statement. So
*"3 reasons your edit drags. Recognise any?"* is a Number, and *"How do you know when it is done?"*
is a Question rather than a How-to.

`findings()` reports a bucket only when it clears both gates **and** sits outside a dead band of
0.8–1.25, sorted by `|log(lift)|` so the strongest deviation in either direction comes first.

`whatOutliersShare()` asks a different question: what do the winners have that the rest do not? A
trait must be present in **at least half the outliers and at least 1.2× rarer among everything
else**, a trait shared by every post you have ever made explains nothing about why five took off.

### Backfilling from LinkedIn (`linkedin.ts`, `LinkedInImport.tsx`)

Manual entry is what makes these screens honest and it is also what stops people
using them after a month. AuthoredUp's LinkedIn-archive backfill is one of the most-praised
features in the whole audit and the only comparable thing in the market.

**The matching is the feature.** LinkedIn's export carries no FlashCC id, so every row is matched
on what it does carry, in three passes of descending confidence:

| Pass | On | Why it is in this order |
| --- | --- | --- |
| `url` | normalised post URL | the only key both sides agree on by construction |
| `title` | exact normalised text, against `title` AND `hook` | an export carries the post's own first line, which is usually the hook |
| `near` | leading text, within `NEAR_DAYS` (3) | narrow on purpose, a fuzzy title alone matches two parts of a series |

Each pass CONSUMES what it claims, on both sides. Without that a weaker rule overwrites a stronger
one and the numbers land on the wrong post with nothing to show it.

**Unmatched rows are returned, never dropped**, and the screen is mostly about them: an import that
quietly places 40 of 60 is worse than one that places 40 and says so, because the first leaves
somebody believing their history is complete.

Two guards on the numbers themselves. `readNumber` returns **null for a blank**, not 0, a
fabricated zero goes straight into the median every insight screen runs on. And `applyMatches`
writes only the fields the file carried: a LinkedIn export has no saves column, and zeroing a
hand-entered count because the file was silent would destroy the data the feature exists to
protect. `postedAt` is filled when missing and never replaced.

Column aliases live in `COLUMNS` and nowhere else, matched after stripping everything but letters
and digits. An unrecognised column is **reported**, see §29 D21 for why that matters.

---

## 19b. Version history

`versions.ts`, `HistoryPanel.tsx`. Nobody names version history as a buying reason, so it is built
and not led with. The pain is real but is never called versioning, it is called file chaos: *"my
desktop used to be a graveyard of Canva exports, CapCut drafts, random PNGs and 'final_final'
files."* And from an agency, which is the version that matters: *"I'd also like some safeties to
ensure that approved images aren't confused with modified ones."*

**Not an undo history.** `useStudio` already has one and it covers keystrokes. This covers
MOMENTS, three of them, hooked at the call sites that already existed:

| Reason | Taken | Where |
| --- | --- | --- |
| `approve` | before the share is created | `ShareDialog` |
| `export` | before the render starts | `ExportDialog` |
| `brand` | **before** the brand lands | `Studio` |

The brand one is before rather than after on purpose: the version worth keeping is the one about to
stop existing.

**Local, and it does not sync.** The stated pain is losing your own earlier state on the machine
you are working on; syncing a snapshot of every export would multiply the largest records in the
product for a need nobody described. That also means no migration, it works with no database.

Stored per document (`flashcc:v1:versions:<id>`) rather than one key for the lot, because a
snapshot is a whole carousel and one key would mean rewriting every version of every project to add
one entry. Each is **dehydrated**, for the same reason `putDoc` dehydrates.

Retention is Planable's ladder, **none free, 30 days Pro, unlimited Agency**, with `MAX_PER_DOC`
(25) on top whatever the plan, because localStorage is a few megabytes. `prune` runs on **write as
well as read**: a limit enforced only on display is a filter, and the records accumulate behind it
until the quota dies. Free gets none rather than a token two, because a history going back to your
last two saves looks like a safety net without being one.

`capture` refuses an identical deck for the same reason twice, exporting three times is one
version, or the three moments worth finding are buried under fifty that are not.

**The diff compares by POSITION, not by slide id.** Re-laying a deck mints new ids for every
generated layer while the slides keep their order and their content, so an id-based diff would call
that a whole new deck. It shares `docVersion`'s rules exactly, so the filmstrip and the
stale-approval warning in §17b can never disagree about whether anything changed.

`restoreSlide` is the case that actually comes up, a client asked for slide four back and three
other things have been fixed since. A slide past the end of the current deck is appended rather
than refused. **Restoring is itself snapshotted first**: going back should never be the one move
you cannot take back.

---

## 20. The library

Search runs over a **flattened blob written into the summary at save time**, not over the
documents. Parsing fifty stored documents on every keystroke, each carrying its media as base64,
would make search feel broken at exactly the volume where search starts to matter. Capped at 4,000
characters.

Matching is **AND, not OR**. A two-word query that returns everything matching either word is
indistinguishable from a broken search box.

Facets are **derived, never entered.** There is no tag field and there will not be one: tagging
fails on vocabulary drift, one asset filed as "blazer" and the next as "sportscoat", and on
maintenance time small teams do not have. A facet only appears once there is more than one value to
choose between.

Counts are taken over the **active** set, never the filtered one. A facet reading "3" that then
shows one result is a bug report.

Archived work is dropped **before every other test**, including the query. "Unfiled" means no group
*or* a name the app supplied, both are how work goes missing. Published state is derived from the
pipeline rather than stored on the document, so the two cannot disagree.

---

## 21. Export

### What each platform does to a deck after upload

| | LinkedIn | Instagram | TikTok |
| --- | --- | --- | --- |
| Size | 1080×1350 | 1080×1350 | 1080×1920 |
| Output | PDF | Numbered images | Numbered images |
| Format / quality | JPEG 0.92 | JPEG 0.90 | JPEG 0.90 |
| Byte band | 800KB–2MB | 200KB–1.5MB | 200KB–2MB |
| Max slides | 300 | **10 API / 20 app** | 35 |
| Safe zone T/R/B/L | 80/40/80/40 | 135/0/135/0 | 100/180/480/40 |
| Min body / heading | 18 / 24pt | 18 / 24pt | 20 / 28pt |

Three facts these encode:

**LinkedIn rasterises every PDF** to 1080px wide at JPEG ~80–85%, so "keep the text vector" is folk
wisdom that does not survive the pipeline. What survives is designing at the exact size, in sRGB,
with type big enough to read after a lossy pass.

**Instagram crops every slide to the first slide's ratio.** Get slide 1 wrong and all ten are
ruined. Its profile grid also shows a centred square, which is why the safe inset at 4:5 is 135px
top and bottom, anything outside it is invisible to anyone browsing your profile.

**API ceilings differ from app ceilings.** A 20-slide Instagram deck can be posted by hand and by no
scheduler that exists.

### Pre-flight

Blocking: too many slides, an empty deck, type below the platform floor, text that does not fit its
box. Warnings: the app-vs-API slide gap, wrong artboard size, placeholder copy, hairline strokes,
anything reaching into a safe zone, a weak hook on slide 1, and, after rendering, a file outside
the byte band.

**The safe box is not one thing.** `Platform` carries `safeKind` and `safeScope`, because the
insets mean different things and apply to different slides:

| Platform | Kind | Scope | What it actually is |
| --- | --- | --- | --- |
| LinkedIn | `interface` | `all` | author name on top, slide counter and arrows at the bottom |
| TikTok | `interface` | `all` | action rail right, caption and nav bottom |
| Instagram | **`crop`** | **`first`** | the profile grid crops 4:5 to a centred square, nothing is drawn over it, and the grid only ever shows the cover |

Both of those were wrong until Batch 9, and together they made every generated carousel fail: the
message said "covers with its own interface" for a crop, and it fired on all ten slides for a
constraint that can only reach slide 1.

**Full bleed is judged per axis.** A layer spanning the full width is a decision, not a mistake,
every framework's closing block is one, and the old both-axes test reported all of them (D4).

**Blocks block; warnings do not.** A tool that refuses to export because a stroke is 1px is a tool
people route around. The overflow message names another slide as the remedy and names shrinking as
the thing not to do, because shrink-to-fit is the complaint rather than the fix.

### Rendering

The client serialises the markup `LayerView` already produced, `renderToStaticMarkup` per visible
layer, and POSTs it. The server renders it in a real headless Chromium at exact pixel size.

A canvas library was rejected because FlashCC leans on `background-clip: text` for gradient type and
the FontFace API for uploads, and the html-to-canvas converters are unreliable on exactly those two.

One browser is kept warm across requests; launching Chromium is most of the time budget for a
ten-slide deck. Uploaded faces travel with the markup as `@font-face` rules carrying their data
URLs, they live in that browser's library and the server has never heard of them, so anything not
sent is silently substituted with Arial.

**The payload is inlined before it is sent** (`inline.ts`). Since the asset library, pictures and
faces are signed URLs into a bucket, and a payload carrying those would make the renderer fetch a
customer's storage mid-screenshot, with credentials it does not have and no network isolation
(§29 D18). The browser already holds a session that can read them, so it fetches and re-inlines
just before serialising. The server's contract is unchanged: a page that needs nothing from the
network. Fetched payloads are cached for the session, so exporting for LinkedIn and then for
Instagram does not download the same photo twice.

**LinkedIn PDFs are built from JPEG pages**, not PNG: PNG pages have been observed converting into a
PDF that renders blank, and the failure is silent until the post is live.

Filenames are zero-padded (`01.jpg`), because every upload dialog sorts by filename and a carousel
out of order is worse than no carousel. The zip uses `STORE`, JPEG is already compressed, so
deflating costs time and saves nothing.

### Publishing for a scheduler

The other way out, and a different job. `POST /api/slides` returns the same `renderSlides` output as
base64 JSON rather than as a zip; `publish.ts` uploads each slide to the **public** `slides` bucket
at `<user>/<doc>/NN.<ext>` and hands back a `PublishedCarousel`.

Paths are deterministic, so republishing REPLACES a deck's slides rather than accumulating a second
set, a URL already pasted into a scheduler keeps working and shows the newer artwork.

Public is the requirement, not an oversight: **eight of nine bulk schedulers require publicly-hosted
image URLs for CSV import and none of them provides the hosting.** A signed URL cannot do it, because
the scheduler fetches days later with no credentials.

`publishDecks` runs sequentially with a progress callback. Each deck is a full headless render of up
to ten pages plus an upload each; firing twenty at once at one warm browser is how a render server
falls over. A deck that fails does not stop the rest.

### The CSV dialects (`schedulers.ts`)

There is no lingua franca, and two of the three are exact opposites:

| Destination | URLs | Platform | Alt text |
| --- | --- | --- | --- |
| **Metricool** | One per column, `Picture Url 1`..`10` | A boolean per network, plus `LinkedIn Images as Carousel`, which **builds the LinkedIn PDF from the image URLs for you** | `Alt Text 1`..`10` |
| **Publer** | All in one cell, **comma** separated | `Type`, which takes `pdf` so a finished document can go instead | One cell, `||` separated |
| **ContentStudio** | All in one cell, **newline** separated | A literal enum: `LinkedIn Carousel` / `Instagram Carousel` | None, `buildSheet` warns rather than dropping it silently |

`toCsv` quotes **every** field rather than deciding per field: ContentStudio's own format puts
newlines inside a cell, captions routinely contain commas and quotes, and a writer that has to
decide is a writer with an edge case in it. Lines end CRLF.

Alt text is generated from the words already on each slide (`altFromTexts`) rather than asked for.
An alt field nobody fills is an accessibility feature that does not exist, and a headline IS the
slide's description.

**The column names are a claim about somebody else's product.** They are gathered in `SCHEDULERS`
and nowhere else so that a renamed column is one line. These importers ignore unknown columns
rather than rejecting the file, so a stale name costs one empty field.

---

## 22. Persistence

| Key | Holds |
| --- | --- |
| `flashcc:v3:index` | `DocSummary[]`, the grid and the search blob |
| `flashcc:v3:doc:<id>` | One full `Doc`, **dehydrated**, see §16 |
| `flashcc:v3:index-version` | Retires the one-shot summary backfill |
| `flashcc:v3:fonts` | **Retired.** Migrated into `flashcc:v1:assets` on first run |
| `flashcc:v3:onboarded` / `:prefs` | Onboarding state and answers |
| `flashcc:v1:posts` | The entire pipeline in one key |
| `flashcc:v1:brands` | Saved brands, also read as a set |
| `flashcc:v1:assets` | The asset library. `data` present only for what has not uploaded |
| `flashcc:v1:tombstones` | Deletions, both kinds |
| `flashcc:v1:sync-cursor` | Last successful sync, read only for the "Synced 3m ago" label |

**`saveDoc` versus `putDoc` is the load-bearing distinction.** `saveDoc` restamps `updatedAt`;
`putDoc` writes verbatim. Sync applies remote records through `putDoc`, because restamping a record
the moment it arrives makes the local copy look newer than the server's, the next merge pushes it
straight back and the two sides take turns overwriting each other forever.

**`deleteDoc` versus `dropDoc`** is the same shape of decision. `deleteDoc` removes and records a
tombstone. `dropDoc` removes without one, for the only two cases that are not deletions: applying a
remote delete, and clearing the machine on sign-out. Tombstoning either would push a delete back up
for work that is very much alive on the account.

---

## 23. Sync

Last write wins on the record's own `updatedAt`. Not CRDTs, not field-level merging. One person on
a laptop and a phone rarely touches the same carousel in the same minute, and when they do, "the
newer edit survives" is a result they can predict. A clever merge produces a slide neither device
ever had, and nobody can explain it afterwards.

**Deletion is not a special case.** A deleted record becomes an entry whose value is null and whose
timestamp is when it went, so it competes on the same terms as an edit. Without that, deleting a
project on your laptop and syncing your phone resurrects it, and keeps resurrecting it every time
the two meet.

Ties resolve to **doing nothing**, which is what makes a repeated sync free.

The pull is deliberately **full, not incremental**. An incremental pull keyed on the server clock can
only be correct once every device is known to have seen every tombstone, and getting that wrong
resurrects deleted records. `server_updated_at` and the sync indexes exist for that future; the
cursor is currently written and read only for the UI label.

Docs push before posts, because posts reference docs. Tombstones are cleared **only after** the
upsert succeeds.

Triggers: session adoption, window focus (throttled to 30s), 3s after local edits settle, manual,
and sign-out. **Sign-out pushes before it clears**, the other order throws away anything edited
since the last sync.

---

## 24. Auth

Magic link only. No password to store, no reset flow, no credential for this app to be careless
with.

The redirect is pinned to `${origin}${pathname}`, origin-pinned so a stolen link cannot be bounced
elsewhere, query-stripped so the token does not land beside whatever state was in the URL.

The profile row is created **by the client on first sign-in**, not by a trigger on `auth.users`.
Supabase has tightened ownership of that table and the trigger now fails on many projects with
`must be owner of relation users`, and because the SQL editor runs a script in one transaction,
that single error rolls the whole schema back. Nothing is trusted to the client by moving it: the
INSERT privilege is narrowed to `(id, email, display_name)`, so `plan` takes its default whatever
the request contains.

An unknown email address gets no error, Supabase's enumeration protection, which the copy explains
rather than papers over.

---

## 25. Billing

The provider is **Lemon Squeezy**, and the reason is that they are the merchant of record: they
owe the VAT in every country a customer lives in, not us. The alternative is EU-wide VAT
registration and quarterly filings for a product that may earn nothing. Stripe now offers the same
under Managed Payments and owns Lemon Squeezy, so this is a choice worth revisiting, not a law; the
Stripe integration this replaced is in history at `572ebd7`.

The browser can do exactly one billing thing: **ask for a checkout link.** It never states what plan
someone is on and the server never believes it if it does. Entitlement is decided in one place, a
webhook whose signature is verified against the Lemon Squeezy signing secret, and written with the
Supabase secret key.

Signature verification is load-bearing, not hygiene: without it that endpoint is an open door where
anyone who guesses the URL POSTs themselves a subscription. It is HMAC-SHA256 of the **raw bytes**,
hex, compared in constant time. Raw for a real reason: string concatenation re-encodes, and one
multi-byte character on a chunk boundary breaks verification in a way that looks exactly like a
wrong secret. `timingSafeEqual` **throws** on a length mismatch rather than returning false, so
lengths are compared first, a short header is an ordinary refusal and not a 500.

`ENTITLED = { on_trial, active, past_due, cancelled }`. Two of those need saying:

- **`past_due` is in**, so a failed payment does not cut access off mid-retry.
- **`cancelled` is in**, because in Lemon Squeezy it means future payments are stopped while the
  period already paid for runs to `ends_at`. Treating it as unpaid would take away, the moment
  somebody clicks cancel, the month they have already been charged for.

`unpaid`, `expired` and `paused` are out. An **unrecognised variant id becomes `free`** rather than
a guess: a rotated variant should cost a support ticket, not hand out a tier.

**Variants, not prices.** A Lemon Squeezy product holds variants (monthly, yearly) and the variant
id is what a webhook carries. Ids arrive from the API as numbers and from the environment as
strings, so both sides are compared as strings.

`custom.user_id` on the checkout is how a payment becomes a *user*. It rides along on every webhook
the resulting subscription produces, under `meta.custom_data`. Without it the only link between the
two is an email address, which people change. A lookup by customer id is the fallback.

The provider returns the browser before the webhook necessarily lands, so the app polls the profile
for about 20 seconds and says "turning your plan on" rather than showing Free to somebody who has
just paid.

The three decisions that fail silently, is the request genuine, what did they buy, do they have it
now, are pure functions in `server/lemon.ts` and tested in `lemon.test.ts`.

### What is gated, and where

Every paid boundary is a Postgres policy or a check in `server/`. The interface explains the
boundary before the database refuses; it is never the boundary itself, because the publishable key
is in the bundle by design and anyone can POST to PostgREST with it.

| Feature | Enforced by |
| --- | --- |
| Cloud pipeline (`posts` writes) | `02-pro-gate.sql`, INSERT/UPDATE require `is_pro()` |
| Brand count | `03-brands.sql`, INSERT policy, allowance by plan |
| Client count | `06-clients.sql`, INSERT policy, allowance by plan |
| Review links | `09-gates.sql`, INSERT on `shares` requires `is_pro()` |
| AI drafting, hook variants | `server/draft.ts`, `requirePro()` → **402** |
| Numbered image export | `server/export.ts`, `requirePro()` → **402** |

And what is deliberately ungated: the editor, every framework and style, localStorage, document
sync, PDF export, and being a reviewer on somebody else's link (invariant 6).

**`is_pro()` is not callable from the server.** It is `security definer` and reads `auth.uid()`,
which is null for the service role, it would answer false for everybody and refuse paying
customers while looking like it worked. `server/` reads `profiles.plan` through `readBilling`.

**402, not 403.** Payment Required is the one status that means this, and `gate.ts` turns it into a
`PaywallError` that opens the pricing panel; every other status stays an ordinary error shown in
place. The panel is mounted at `App` level because three of the five gated calls happen in the
studio or a dialog above it, and `App` swaps screens rather than nesting them.

### Honest billing, said out loud

FlashCC already behaved correctly: `ENTITLED` includes `cancelled`, which in Lemon Squeezy means
the period already paid for runs on to `ends_at`. What was missing was the app
being able to SAY so, `plan_renews_at` alone cannot distinguish "renews on the 3rd" from "ends on
the 3rd", and the account card showed a renewal date either way.

`plan_ends_at_period_end` is written by the webhook through the service role and read by
`AccountCard`, which now shows **"Renews 3 Oct"** or **"Ends 3 Oct, everything stays unlocked
until then"**. The four promises are on the pricing screen as `BILLING_TERMS`, each one a verbatim
failure from the research: Loomly's 996% yearly increase, Taplio charging after a trial with "no
emails, no reminders", Contentdrips revoking access on cancel, Later charging $180 four months
post-cancellation.

`UNMETERED_PROMISE` sits beside `REVIEWER_PROMISE`. Neither is a footnote, and both are invariants
(6 and 7) so a future paywall cannot quietly contradict them.

---

## 26. Database

Eight tables, all with `(user_id, id)` composite primary keys. Version history is deliberately not among them, see §19b.

**Identity is the client's.** The app mints ids offline and creates records before anyone signs in,
so there is no id remapping on sync and ids only need to be unique per person.

**Two timestamps.** `updated_at` is the client's own and is what LWW compares; `server_updated_at`
is trigger-stamped. Collapsing them breaks sync in a way that looks fine until two devices
disagree.

**`docs.data` is the truth.** The flat columns beside it are a projection so the grid can draw
without pulling every slide and image down the wire. If they ever disagree, the blob wins.

**`posts` is columnar** because analytics groups and filters by those fields and a jsonb blob cannot
be indexed usefully for that.

`doc_id` has **no foreign key**, deliberately: a composite FK would need `ON DELETE SET NULL
(doc_id)`, which is Postgres 15+ only, and it makes account deletion order-sensitive.

### Planning fields and billing (`08-pipeline-fields.sql`)

Five columns on `posts`. Four are free text, because a pillar is somebody's own vocabulary and an
enum would either be wrong for most people or grow until it is a text field with extra steps.
`objective` is **constrained**, and that is the exception on purpose: it is the one the insight
screens group by, and an open set there turns every typo into its own bucket.

Columns rather than a jsonb bag, unlike `docs.data`, for the same reason `posts` was columnar to
begin with: these are exactly what somebody filters and groups on.

`profiles.plan_ends_at_period_end` is added here too, and the column-level grant is **re-stated**
rather than assumed, a column added after a `grant update (display_name)` is not in that grant,
which is correct, but "it was already safe" is how a schema acquires a hole.

### Clients and review (`06-clients.sql`, `07-review.sql`)

`clients` carries the same INSERT-only tier limit as `brands`. `client_id` is a nullable column on
`docs`, `posts`, `brands` and `assets`, deliberately **not** a foreign key, see §17b.

`shares` and `comments` are owner-only under RLS and are reached by a reviewer **only** through
`server/review.ts`, which holds the service role key. That is the single exception to "the RLS
policies are the boundary" in this schema, and the reason is in §17b.

`shares.token` is `unique` across every account, because it is the only thing identifying the row
on the way in. `approved_version` is separate from `snapshot.version` so that a re-capture can move
the snapshot forward while the approval stays where it was.

**There is no seat table and there will not be one.** See invariant 6.

### Series (`05-series.sql`)

Two nullable columns on `docs` and `posts`, a positive-part check, and a partial index, partial
because most carousels are not part of anything. No RLS changes: both tables already gate every
verb on `auth.uid() = user_id`, and a new column on a row-scoped policy is covered by it, which is
the advantage of gating on the row rather than per column.

### Storage (`04-storage.sql`)

**Two buckets with opposite postures.**

| Bucket | Holds | Access |
| --- | --- | --- |
| `media` | Uploads, logos, font files | Private. Signed per session, owner only |
| `slides` | Rendered, published slides | **Public read**, owner-only write |

Paths are `<user id>/…` and the first segment IS the access rule, every policy compares
`storage.foldername(name)[1]` against `auth.uid()`. Change the layout in `assets.ts` and the
policies stop matching.

**`assets`** is the library index. A bucket can be listed, so this looks redundant; it is not. A
name, a folder, the brand a logo belongs to and the family a font registered under have nowhere to
live in a bucket, and listing a bucket to find out what you own is a round trip per screen. One
table for images and fonts, discriminated by `kind`, they differ in three nullable columns and
agree on owner, path, size, folder, soft delete and sync clock.

`brands.logos` is jsonb holding asset ids. Pointing at the library rather than embedding is what
makes "a shared logo is stored once" true.

Asset deletions sync as an **UPDATE** rather than as a tombstone upsert: the table requires a
non-empty `path` and a placeholder row has none to offer.

### The paywall is a GRANT, not a policy

```sql
revoke update on public.profiles from authenticated, anon;
grant  update (display_name) on public.profiles to authenticated;
revoke insert on public.profiles from authenticated, anon;
grant  insert (id, email, display_name) on public.profiles to authenticated;
```

**This is the single most security-relevant passage in the repo.** RLS cannot express "this row but
not that column". Supabase grants `authenticated` UPDATE on the whole table by default, and in
Postgres **a column-level REVOKE does nothing while a table-wide grant stands**. The only way to
narrow it is to drop the table privilege and grant back the one safe column.

Get it wrong and the paywall is decorative: any signed-in user can `PATCH /rest/v1/profiles` with
`{"plan":"pro"}` from the console. The INSERT narrowing matters more, without it someone creates
their own row at `plan: 'pro'` on first sign-in and never pays.

`03-brands.sql` adds the brands table and the allowance policy. It **is** safe to run now,
nothing depends on it, and until it exists the client degrades brands to local-only (PostgREST
answers `PGRST205`, which `syncAll` treats as "not yet" rather than as a failure, so docs and posts
keep syncing).

`02-pro-gate.sql` makes the cloud pipeline Pro-only **and has not been run.** Until it is, a free
account syncs its pipeline exactly like a paying one. Reads stay open to lapsed subscribers, because
cancelling should not look like confiscation. Carousels are never gated, the editor is the free
tier; the history is what compounds, so the history is what costs money.

---

## 27. Design tokens

`tokens.css` is the single source of truth; `tailwind.config.ts` only points at it.

**Surface ladder**, depth via a lighter step, never a shadow: `#070f1c` sunken, `#0a1424` base,
then surfaces 1–5 from `#0e1b2e` to `#2a3f5c`.

**Lines** are white-alpha so they adapt to any surface: hairline `rgba(255,255,255,0.08)`, border
`0.14`.

**Text** is hierarchy by value step, not colour: `#e6edf6` → `#94a3b8` → `#64748b` → `#475569`.

**Accent** `#d9a521`, used sparingly. **Brand gold** is a gradient, so it cannot be a Tailwind
colour and is always applied inline.

Type scale: overline 10, caption 11, body 12, title 13, stat 15, display 22.

Motion: `instant 80ms`, `micro 120ms`, `standard 200ms`, `large 300ms`. **`* { transition-property:
none }`** is the base rule, hover and selection are 0ms, because motion on a pointer-reactive
control reads as latency. Onboarding is the deliberate exception and carries its own animation set,
all disabled under `prefers-reduced-motion`.

> **Gotcha:** because these are `var()`-based rather than RGB channels, Tailwind's `/opacity` suffix
> **does not work**. `text-accent/40` renders nothing. Use a predefined wash or a built-in scale
> like `white/[0.04]`.

---

## 28. Testing

296 tests across 17 files. They are design guards, not coverage theatre, several encode an argument
that would otherwise be lost:

- **mean vs median**, five posts and one at 100k, proving a mean baseline would switch outlier
  detection off permanently
- **contrast against every gradient stop**, not just the first; it caught two real failures
- **`verticalFill`**, because "everything is inside the artboard" passes for the broken reflow too
- **the gates stay quiet**, no finding below `MIN_TOTAL`, none from a group below `MIN_GROUP`
- **the demo's two Story posts** have excellent numbers on purpose, so a test can prove the app
  refuses to conclude from them
- **deletions do not resurrect** across a second sync round trip

---

## 29. Known defects

Found by reading the code for this document. Ordered by consequence. None are fixed.

> **D1, D10 and F1 are fixed** as of Batch 4. They are kept below with their
> original text, because the reasoning is the useful part and a defect list that
> silently loses its entries teaches nothing. Each carries a note.

### D1, ~~Text is fitted with sans metrics, then restyled. Terminal overflows.~~ FIXED

`compositions.ts` fits every text layer through `fit()` with the **default** `Measure`, then maps
`applyFonts` over the result. So the size is chosen using sans metrics and the layer is *then* given
the theme's real face. Mono measures **1.15× wider** and the safety margin is 2%.

Reproduced on the Terminal style with a four-slide deck, 3 of 4 slides overflow:

```
slide 2 "Heading"   font=mono size=58 box=67  needs=133
slide 3 "Statement" font=mono size=76 box=448 needs=538
slide 4 "Text"      font=mono size=68 box=82  needs=163
```

Serif is safe only by luck: it measures at 0.97, so sans **over**-estimates. The "text never
overflows" guarantee currently holds for sans and serif, not for mono, and not for `grotesk`,
`slab`, `elegant` or `impact`, which have no `FAMILY_SCALE` entry at all and silently take sans
metrics. `impact` is condensed and `elegant` is a Didot; both will mis-fit.

**Fixed in Batch 4:** every `fit()` call in `compositions.ts` now passes the face the layer will
actually wear, and `Measure.family` is documented as taking a FONTS id rather than a CSS stack,
which was the same bug in `split.ts` and `preflight.ts` (F1). `generation.test.ts` asserts every
shipped style fits its own copy.

### D2, Resizing a text layer compounds its font size

`Canvas.tsx`. Position and size derive from the **captured origin rect**; `fontSize` derives from
`l.fontSize`, the already-updated layer. So the cumulative ratio is re-applied on every pointer-move
event:

```
move 1  k=1.1  64 → 70     (correct)
move 2  k=1.2  70 → 84     (should be 77)
move 3  k=1.3  84 → 109    (should be 83)
```

**Fix:** derive from the origin rect's font size, captured alongside the geometry.

### D3, `app-only-slide-count` can never be useful advice

Its condition requires `count > maxSlides`, which is exactly the `too-many-slides` **block**
condition. A 15-slide Instagram deck therefore gets a warning saying it *"works if you post by
hand"* next to a hard block that disables the export button. The test asserts the warning fires and
never checks that the block does too.

**Fix:** block at `appMaxSlides ?? maxSlides`.

### D4, ~~`intrudes()` assumes symmetric safe-zone insets~~ FIXED

**Fixed in Batch 9**, and it was worse than recorded: the both-axes test meant every framework's
full-width closing block was reported as a mistake, on every deck. Full bleed is now judged per
axis in `preflight.ts`, and `safearea.ts` uses the same rule.

#### Original

It tests `l.w >= box.w + box.x * 2 - 1`, using the left inset twice. TikTok's insets are 40 left and
180 right, 100 top and 480 bottom, so the effective full-bleed threshold is 939×1539 rather than
1080×1920, and any layer above that size is exempted from the safe-zone warning wherever it sits.

### D5, Hidden layers are skipped everywhere except the hook check

The per-layer loop does `if (!l.visible) continue`, but the slide-1 hook check builds its candidate
list without a visibility test. A hidden 88pt layer suppresses the `weak-hook` warning for the
visible copy underneath.

### D6, Two exported types named `Platform`, two named `Finding`

`pipeline.ts` exports `Platform` as a four-value union **including `"x"`**; `platforms.ts` exports
`Platform` as the constraint object with three ids and no `"x"`. Both also export `PLATFORMS`. A
post on `"x"` has no artboard, no safe zone, no pre-flight and no export target.

`insights.ts` and `preflight.ts` both export an unrelated `Finding`.

### D7, `whatOutliersShare` is ungated

Unlike `findings`, it applies neither `MIN_TOTAL` nor `MIN_GROUP`. With a single outlier every
qualifying dimension hits `topShare = 1`, so it can report six "shared traits" from n=1,
contradicting its own file header.

### D8, Two denominators, one label

`Scored.ratio` divides by the **windowed** baseline (last 20). `Group.lift` divides by the median of
**all** measured posts. The Outliers screen calls both "your median" in adjacent paragraphs.

### D9, `bodyFont` reaches exactly one layer

`applyFonts` gives `theme.bodyFont` only to a layer literally named `"Body"`, which exists in one
composition branch. Quote prose and numbered body text all take the *display* face, despite the
module comment saying prose takes the body face.

### D10, ~~Samples and bulk decks are invisible to analytics~~ FIXED

**Fixed in Batch 4:** `buildDocs` and `buildFrameworkSamples` both stamp `framework`, and
`buildDocs` takes a `styleId`.

#### Original

`buildFrameworkSamples` and `buildDocs` never stamp `doc.framework` or `doc.styleId`, so example and
bulk carousels are excluded from the attribution that is the product's main differentiator, even
though the bulk UI made the user pick a framework.

### D11, Onboarding offers a choice generation does not make

`images: "always"` and `"sometimes"` are identical downstream; `wantsImages` only distinguishes
`"never"`. "A picture on every slide" and "keep the space, fill what I want" produce the same deck.

### D12, Rotation is invisible to the entire geometry layer

`bounds`, `rectOf`, `contains`, `intersects`, `snap`, `resize`, the selection outline, the handles
and reflow's clamp all use the **unrotated** box. Past roughly 15°, a layer is grabbable where it
is not drawn and not grabbable where it is. Nothing in the code acknowledges this.

### D13, Locked layers are marquee-selectable

Click filters `visible && !locked`; marquee filters only `visible`. Once selected, a locked layer
can be moved, nudged, resized and deleted. `locked` is consulted nowhere else.

### D14, Pasting slides ignores the document's style

`Studio.tsx` hardcodes `THEMES.ink` for the paste-a-post dialog, so slides appended to a Paper or
Cobalt project arrive in Ink colours. It also does not enforce `MAX_SLIDES`.

### D15, Undo coalescing has no boundary

`commit` suppresses a history push whenever the tag matches the previous one, and selection changes
do not commit. Two separate drags minutes apart collapse into one undo step.

### D16, A full quota silently defeats tombstones

`tombstones.write()` swallows quota errors so a delete is never blocked. The consequence is that
under quota pressure a delete succeeds locally, records nothing, and the next sync resurrects it.
This is the one failure mode that defeats the whole design.

### D17, `PostRow.impressions` documents a column that does not exist

`cloud.ts` describes it as generated by Postgres, and `forWrite` strips it. The generated column was
removed from the schema while de-risking a failed migration and the comment was not. Harmless today;
misleading to anyone who tries to index or order by it.

### D18, The production posture is unfinished

`/api/draft` and `/api/export` take **no authentication**. Anyone who can reach port 8787 can burn
Anthropic tokens or drive Chromium renders (up to 60MB of input, 300 slides). `render.ts`
interpolates client-supplied HTML and CSS into a page unescaped and the browser context is not
network-isolated. There is no rate limiting and no CORS policy anywhere, the design assumes the
Vite proxy and localhost. All of that needs revisiting before this is public.

### D19, `Upgrade.tsx` sells things nothing gates

PNG export, AI drafting and the pipeline are advertised as Pro. No screen reads `plan`, no platform
emits PNG, and `02-pro-gate.sql` is unrun. The tier list is currently aspirational copy.

### D25, LinkedIn's export columns are unverified against a real file

`COLUMNS` in `linkedin.ts` is a claim about somebody else's product, exactly like the scheduler
headers in D21, and LinkedIn's analytics export has changed shape at least twice.

The cost is bounded and visible rather than silent: an unrecognised column is listed in the import
dialog under "columns it did not recognise and ignored", so a missing number has a stated cause.
Every alias lives in one table.

**Fix:** download a real export and correct the aliases against it. Fifteen minutes, and it should
happen before anybody relies on a backfill.

### D23, A review link's slides outlive the link

Revoking a share flips its status; the rendered slides stay in the public `slides` bucket at the
same URLs. Anyone who noted a slide URL before the link was turned off can still open that image.

Publishing means "anyone with the link can see this", so the pixels behaving that way is
consistent, but "turn the link off" reads as stronger than it is, and it is the same shape of
problem as D22.

**Fix:** revoking should clear `<user>/<doc>/` from the bucket, or the button should say plainly
that it stops the review page rather than the images.

### D24, The client filter does not reach the asset library or brands

`Asset` and `Brand` both carry `clientId` and both sync it, but `AssetLibrary.tsx` and
`Brands.tsx` still list everything regardless of the rail's selection. Only Projects, the pipeline
views and the insight screens are filtered.

Not wrong, exactly, `filterAssets` already treats a brand scope as inclusive, so shared stock
should appear under every client, but it is inconsistent with the rest of the rail, and somebody
with fifteen clients will notice.

**Fix:** pass the selection into both screens and filter with `belongsTo`, keeping unscoped assets
visible everywhere.

### D26, Reflow to a taller artboard overflows text

Reflowing a 1080x1350 deck to TikTok's 1080x1920 produces 13 `text-overflows` findings across 60
style/framework combinations. Measured before and after the safe-area pass and it is unchanged by
it, this is `reflowDoc` re-laying vertically without re-fitting the type to the new box.

`compositions.ts` splits and shrinks to fit at generation time; `reflow.ts` does neither, so a
layer that grew taller in the new proportions simply hangs out of its box.

**Fix:** run the same `fit`/`splitToFit` pass over reflowed text that generation uses, or re-run
generation against the new artboard when the deck still carries its source copy. The second is
closer to the grain of the product, see `regenerate.restateSlide`.

### D27, TikTok's caption band is too big for a re-laid deck to respect

TikTok's safe box reserves 480px at the bottom and 180px on the right of 1080x1920. `safearea.ts`
pulls content clear, but a deck composed for 1350 and then squeezed into that box is scaled toward
0.8, legible, and not what anybody would have designed.

The real answer is size-aware generation, which `CLAUDE.md` already lists as not built: compositions
take `W`/`H` as module constants and only ever target 1080x1350.

**Fix:** parameterise `compositions.ts` on the artboard, so a TikTok deck is composed for 1920 rather
than reflowed into it.

### D21, Scheduler column names are unverified against live templates

Every header in `SCHEDULERS` is a claim about somebody else's product, taken from research rather
than from importing a file into each tool. `Alt Text 1..10` for Metricool and the exact Publer and
ContentStudio spellings are the least certain.

The cost is bounded: all three importers map by header name and **ignore** columns they do not
recognise rather than rejecting the file, so a stale name loses one field, not the import. They are
gathered in one table so that correcting one is one line.

**Fix:** import a generated CSV into each of the three and correct the names against what actually
lands. That is a fifteen-minute job with three trial accounts and it should happen before launch,
because "imports without a single manual edit" is the promise being made.

### D22, A deleted library asset leaves published slides behind

`removeLibraryAsset` deletes the object in the `media` bucket. Slides already published to the
public `slides` bucket are rendered pixels and keep their own copy, so deleting the source picture
does not unpublish anything that used it.

That is arguably correct, a URL handed to a scheduler should not rot, but it is not stated
anywhere in the interface, and "delete" reads as stronger than it is.

**Fix:** either an "unpublish" action that clears `<user>/<doc>/` from the `slides` bucket, or
wording on the publish confirmation that says plainly the slides stay up until the deck is
republished or removed.

### D20, Smaller things

- `paint.ts#layerPaint` is dead **and** disagrees with `LayerView` about whether a fill sits under a
  gradient
- `FAMILY_SCALE.mono` is unreachable, the mono branch substitutes `MONO_ADVANCE` first
- `useStudio.canUndo` reads a ref at render time, so it is never reactive; `canRedo` does not exist
- `undo`/`redo` mutate refs inside a `setDoc` updater, which StrictMode double-invokes
- The same 10-colour palette literal is written out three times
- `M = 96` in `compositions.ts`, `M = 88` in `presets.ts`
- Dead exports: `compositionLabel`, `slidesFromText`, `GRADIENT_STYLE_IDS`, `asChoice`,
  `isValidHex`, `NO_INSET`, `hasSafeZone`, `AuthState`, `setDisplayName`, `fetchBillingStatus`,
  `closeBrowser`, `boardCounts`, `outlierCount`, `DEMO_COUNT`
- `educational` slot 4 is labelled "Breakdown" with placeholder "Technique #1" while slots 5–6 are
  "Example" with "Technique #2/#3", labels and placeholders disagree
- Seven components re-enable transitions that `index.css` and R4 forbid
