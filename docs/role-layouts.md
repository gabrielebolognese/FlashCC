# Role → layout mapping

Five roles, five layouts. The role determines the layout **completely** — the user never positions
anything, and there is no layout picker. Changing the role from the on-slide control is the only
layout control in the product.

All geometry below is in the 4:5 logical space (1080×1350). Other formats derive from the same
fractions. Numbers are proposals sized against real posts; they live in one constants module and
are expected to be tuned once during implementation, not per document.

---

## 1. The shared grid

Every role sits on the same skeleton. This is what makes five different layouts read as one
system.

```
                 1080
   ┌──────────────────────────────────┐
   │ 81                               │   M   = 81   (0.075 × width, brandKit.safeMargin)
   │  ┌────────────────────────────┐  │
   │  │ top rail            h 72   │  │   y 81    logo · label · slide number
   │  ├────────────────────────────┤  │
   │  │            gap 48          │  │
   │  │                            │  │
   │  │ body zone          h 948   │  │   y 201   all content
   │  │                            │  │
   │  ├────────────────────────────┤  │
   │  │            gap 48          │  │
   │  │ bottom rail         h 72   │  │   y 1197  handle · logo · affordance
   │  └────────────────────────────┘  │
   │                               81 │
   └──────────────────────────────────┘
        content column: x 81, w 918
```

- **Nothing crosses the margin.** Ever. The margin is the safe area for platform UI overlap.
- **The rails are fixed** across all five roles, so the handle and logo never move between slides.
  That fixed furniture is most of what makes a deck feel like one deck.
- **Only the body zone varies** by role.

### Slide type scale

Separate from the app's chrome type scale. Each slot has a **fit ladder** — the estimator picks the
largest step that fits, then stops. If the smallest step still overflows, that is genuine overflow
(§4).

| Slot | Ladder (px) | Line height | Type role |
| --- | --- | --- | --- |
| cover heading | 96 · 84 · 72 · 64 · 56 | 1.08 | display |
| cta line | 72 · 64 · 56 | 1.10 | display |
| quote text | 64 · 56 · 48 · 42 | 1.20 | display |
| section heading | 48 · 44 · 40 | 1.15 | display |
| paragraph | 40 · 36 · 32 · 28 | 1.40 | body |
| list item | 36 · 32 · 28 · 24 | 1.35 | body |
| attribution | 28 | 1.30 | body |
| handle | 26 | 1.00 | body |
| label / eyebrow | 24, tracking +0.08em, uppercase | 1.00 | body |
| slide number | 24 | 1.00 | body |

**Alignment rule:** `cover`, `body`, and `list` are left-aligned — they are *read*. `quote` and
`cta` are centred — they are single focal statements. This is a deliberate two-mode split, not
per-slide freedom.

---

## 2. The five layouts

### `cover` — the hook

Anchored low. The heading rises from the bottom of the body zone, which leaves deliberate empty
space above it and reads as confident rather than under-filled.

| Slot | Blocks accepted | Geometry |
| --- | --- | --- |
| logo | `brandKit.logo` | top rail, at `logo.placement`, max h 56 |
| label | first `label` block | top of body zone, y 201 |
| accent rule | — | 120 × 6, brand accent, 32 above the heading |
| heading | first `heading` / `paragraph` | left, **bottom-anchored** to y 1149, max 5 lines |
| handle | `brandKit.handle` | bottom rail, at `handlePlacement` |
| affordance | — | bottom rail opposite corner: small chevron, brand accent, 32px |

The chevron is the only implied instruction in the product and it earns its place: it is what tells
a reader there is a slide 2.

---

### `body` — the workhorse

Optional heading, then prose. The group is **vertically centred** in the body zone, so short and
long slides both sit balanced rather than top-jammed.

| Slot | Blocks accepted | Geometry |
| --- | --- | --- |
| slide number | — | top rail, right, muted |
| heading | first `heading` | full content width, left |
| paragraph | all `paragraph` blocks | left, 32 gap below heading, 24 between paragraphs |
| handle | `brandKit.handle` | bottom rail |

Group is centred as a unit: `y = 201 + (948 − groupHeight) / 2`.

---

### `list` — the scannable one

| Slot | Blocks accepted | Geometry |
| --- | --- | --- |
| slide number | — | top rail, right |
| heading | first `heading` | top of the group, 48 gap below |
| items | `list.items[]` | each: marker + text, 32 between items |
| marker | — | unordered: 12px brand-accent dot, baseline-aligned. ordered: index in brand accent, same size as the item |
| item text | — | indent 56 from the content column, hanging (wrapped lines align to the text, not the marker) |
| handle | `brandKit.handle` | bottom rail |

Group vertically centred like `body`. **Six items** is the practical maximum before the ladder
bottoms out; beyond that it becomes overflow and offers a split.

---

### `quote` — the pull-quote

Narrower column than every other role — an extra 10% inset each side (x 189, w 702). The narrowness
*is* the signal that this slide is different, without needing different colours.

| Slot | Blocks accepted | Geometry |
| --- | --- | --- |
| accent rule | — | 80 × 6, brand accent, centred, 48 above the quote |
| quote text | `quote.text` | centred, narrow column, vertically centred in the body zone |
| attribution | `quote.attribution` | centred, 40 below, muted, prefixed `— ` |
| handle | `brandKit.handle` | bottom rail |

No slide number — a quote slide reads better without one. No decorative giant quotation mark: it is
a stock flourish and it fights the brand type.

---

### `cta` — the close

The **only** slide where the brand accent is used as a fill rather than a hairline or a marker.
That scarcity is what makes the last slide land.

| Slot | Blocks accepted | Geometry |
| --- | --- | --- |
| logo | `brandKit.logo` | centred, top of the body zone, max h 72 |
| cta line | first `heading` / `paragraph` | centred, display size, max 3 lines |
| handle plate | `brandKit.handle` | centred, 56 below the line: brand-accent filled pill, h 84, radius 42, horizontal padding 48, handle text in the palette's background colour |
| supporting | remaining `paragraph` | centred, 32 below, muted, one line |

Group vertically centred. The bottom rail is empty here — the handle has been promoted into the
content, so repeating it would be noise.

---

## 3. Block-to-slot resolution

Roles define slots; slides carry blocks. The mapping rules, in order:

1. Fill each slot with the first unconsumed block of an accepted type.
2. Blocks with no matching slot fall through to the role's **prose slot** (`paragraph` for
   `cover`/`body`/`cta`, item list for `list`, quote text for `quote`).
3. **Content is never dropped.** If a block cannot be placed, that is overflow, handled below —
   not silent deletion.

Rule 3 is absolute. A user who overrides a list slide to `quote` must still see every word, badly
laid out, rather than a clean slide missing three items.

---

## 4. Auto-fit and overflow

**Fit** — for each text slot, walk its ladder from the largest step and take the first that fits
its box. Slots fit independently, except `body` and `list`, where heading and prose fit as a group
so a long heading does not shrink while the paragraph stays large.

**Overflow** is when the smallest ladder step still exceeds the slot. Only then:

- A small inline marker on the affected block, on the slide, in `--danger`.
- One line of text offering to split the slide at the nearest sentence or item boundary.
- No modal, no toast, no blocking. Never truncate, never clip, never `overflow: hidden` as a
  disguise — the text stays visible and overflowing so the problem is legible.
- The split offer is a single undoable command.

---

## 5. What this mapping forbids

| Not possible in v1 | Why |
| --- | --- |
| moving, resizing, or nudging any element | role determines layout completely |
| per-slide colour, font, or background | brand lock |
| adding a slot that a role does not define | the five layouts are the product's opinion |
| more than one alignment per role | consistency across the deck |
| images beyond the brand logo | out of scope |
| a layout picker separate from the role control | role *is* the layout; two controls for one concept |

---

## 6. Open question

**Cover-slide handle placement.** The spec above puts the handle in the bottom rail on cover, body,
list, and quote, and promotes it into the content on CTA. The alternative is no handle on the cover
at all — cleaner hook, but the cover is the slide most likely to be screenshotted alone, which is
the single best argument for attribution being on it. Recommendation: keep it. Flagging it because
it is a brand judgement, not a layout one.
