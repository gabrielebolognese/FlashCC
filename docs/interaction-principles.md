# Interaction principles

Research pass on why Figma feels good, and the concrete rules FlashCC inherits from it.

> **On the numbers below.** Figma publishes no interaction spec. Timings and sizes here are from
> observation of the product, and are stated as approximations. They are directionally reliable —
> the *pattern* (which things animate at all, which are pinned to zero) matters far more than
> whether a sheet takes 120ms or 160ms. Where a number is a judgement call rather than an
> observation, it is marked.

---

## Part 1 — What Figma actually does

### 1.1 The canvas is the interface

The canvas is the full viewport. Panels sit *on* it — a ~240px layers rail left, a ~240px
properties rail right, a single-row toolbar. Everything else is the document. The proportion is
the message: roughly 70% of the screen is the thing you are making, and the tool is a frame
around it.

The more instructive half is what Figma **refuses** to put on screen:

- **No ribbon, no formatting bar, no per-tool option strip.** Selecting the rectangle tool does
  not spawn a row of rectangle options. The tool changes the cursor and nothing else.
- **No disabled controls.** The properties panel shows only what applies to the current
  selection. Select nothing and you get document properties — not a wall of greyed-out fields.
  This is the single most copied-wrong thing about Figma: most tools disable, Figma *removes*.
  A disabled control still costs full attention on every scan while returning nothing.
- **No status bar, no breadcrumbs, no chrome that reports state the canvas already shows.**
- **No permanent panel for anything used occasionally.** Export settings, component properties,
  and prototyping all live in tabs or contextual sections that collapse away.
- **Almost no modals.** Right-click menus and inline editing carry work that other tools put in
  dialogs.

The operating rule is that **panel space is spent only on what is true right now**, and
everything else is one keystroke or one right-click away.

### 1.2 Hover, focus, and selection

The feedback budget is spent unevenly on purpose, and hover gets almost none of it.

**Hover** produces the cheapest possible signal:

- On canvas: a 1px outline in selection blue around the object under the cursor. Nothing else.
  No scale, no shadow, no fill change, no glow.
- In lists (layers, assets): a flat background tint on the row.
- On icon buttons: a subtle background fill inside the button's box.

That is the entire hover vocabulary. Its job is only to answer *"what would I hit if I clicked?"* —
and that answer must be legible without being distracting, because the pointer sweeps across
dozens of objects a second while you work.

**Press / selection** is where the real state change lands: a blue bounding box, eight square
resize handles, rotation zones just outside the corners, dimension readouts, and the properties
panel repopulating. This is a lot of new pixels — and it is justified, because selection is a
committed, persistent state, not a transient one.

The asymmetry is the point: **hover hints, press commits.** Tools that animate lift-and-glow on
hover have spent selection's budget on a state the user did not ask for.

Two further details worth stealing:

- **Extra information is modifier-gated.** Hold Alt/Option while hovering a second object and
  spacing measurements appear between it and the selection. That information is genuinely useful
  and genuinely noisy, so it is available on demand rather than always on.
- **Modes announce themselves on the object.** Entering text-edit changes the cursor and the
  object's border treatment. You never have to look at chrome to know which mode you are in.

### 1.3 Timing

Figma's transition inventory is remarkably short. Most interactions have no transition at all.

| Interaction | Duration | Why |
| --- | --- | --- |
| Hover outline appearing | 0ms | Tracks the pointer; any easing reads as the app lagging behind the mouse |
| Selection appearing | 0ms | Direct consequence of a click |
| Drag, resize, rotate, pan, zoom | 0ms, 1:1 | The object must be under the finger, not chasing it |
| Panel content swapping on selection change | 0ms | It is new content, not a moving object |
| Context menu appearing | ~0ms | No fade — the menu is *there* |
| Dialogs, sheets, toasts | ~100–150ms | Genuinely arriving from elsewhere |
| Multiplayer cursors | ~50–100ms interpolation | Network updates are discrete; un-smoothed cursors read as broken |

The governing insight: **animation duration is added to perceived latency.** A 200ms hover fade
means every hover feels 200ms slower, times thousands of hovers a session. Around 100ms is the
threshold where a response stops feeling instantaneous, so anything that responds to the pointer
must be pinned to zero, and anything that gets to animate must stay well under that threshold.

Note the one place Figma *adds* smoothing: remote cursors. Motion is used there to hide a defect
in the data (discrete network updates), not to decorate a state change. That is the only honest
reason to animate something continuous.

### 1.4 Icon treatment

Figma's icons are ~16px glyphs, ~1.5px stroke, monochrome, unlabelled, in hit targets of ~24–32px.

Why small:
- Icon size is a density signal before it is a legibility one. Large icons read as touch-first and
  consumer; small icons read as "this is used by someone who is here all day." The size *is* the
  positioning statement.
- Small glyphs let the toolbar be a single short row instead of a band across the screen.

Why thin and monochrome:
- A thin monochrome set has almost no visual weight, so it recedes behind the document. Filled or
  multi-colour icons compete with the artwork for attention — fatal when the artwork is the point.
- Monochrome keeps colour free to carry meaning. Because icons are never coloured decoratively,
  a coloured icon reliably means *active, selected, or wrong*.

Why unlabelled:
- Labels are training wheels bolted on permanently. They pay off in the first session and cost
  space in every session after. A tool used daily should optimise for the thousandth use.
- Discoverability is handled elsewhere: tooltips (with the shortcut), menus that list the same
  commands in words, and a searchable command palette.

**The compensating trick — hit area is decoupled from visual size.** The glyph is 16px; the
clickable box is 24–32px. Visual weight stays low while Fitts's-law targets stay comfortable. This
single decoupling is what makes small icons feel precise rather than fiddly. Tools that shrink
icons *and* their hit boxes produce something that looks professional and feels hostile.

### 1.5 Density and alignment

There is an invisible grid, and everything obeys it:

- Spacing on an 8px rhythm with 4px sub-steps.
- Property rows at a consistent height (~24px), section headers slightly taller.
- Labels for numeric fields reduced to a single glyph or letter — `X`, `Y`, `W`, `H` — because in
  context a word would be redundant.
- Value columns aligned to the same x across unrelated sections, so a vertical scan needs no
  horizontal eye movement.

The payoff of uniform control height is compositional: any control can sit beside any other and
the row still reads as one flat line. The moment heights vary, every row needs bespoke vertical
centring and the panel starts to look assembled rather than designed.

Density here is not about cramming. It is about **removing the variance** — same height, same
rhythm, same alignment — so the remaining differences are all meaningful.

### 1.6 Direct manipulation

The rule is that editing happens on the object:

- Double-click text on the canvas to edit it there, in place, at final size and final font.
- Resize with handles. Move by dragging. Rotate at the corners.
- Corner radius is dragged with an inset handle.
- Constraints are set by clicking a *picture* of the constraint, not choosing from a dropdown.

The properties panel is a **precision fallback and a mirror**, never the primary path. Both
directions are live: drag on canvas and the panel numbers move; type in the panel and the object
moves. Neither is authoritative in the user's mental model — they are two views of one truth.

The cost of the alternative is attention, not clicks: editing in a distant panel forces the eye to
leave the work, and every round trip is a chance to lose the thread.

### 1.7 Destructive vs creative separation

Figma separates them structurally rather than with warnings:

- **Creative actions are in the resting UI** — the toolbar's frame, shape, pen, and text tools sit
  in the top-left, permanently available.
- **Destructive actions are not in the resting UI at all.** There is no trash button in the
  toolbar. Delete is the Delete key and a context-menu item, usually below a divider, near the
  bottom of the menu.
- **Red is reserved.** It means error or genuine danger. It is never a decorative accent, so when
  it appears it is believed.
- **Confirmation dialogs are almost absent** — and this is the trade that makes the rest work.
  Undo is comprehensive and instant, so destruction does not need a gate. A tool with weak undo
  is forced to litter itself with "are you sure?", and each one trains the user to click through
  warnings without reading.

Strong undo is not a convenience feature. It is what buys the right to a calm, warning-free UI.

### 1.8 Empty states

Open a new Figma file and you get: the toolbar, and nothing. No tour, no coach marks, no modal
checklist, no autoplaying video.

The teaching happens structurally:

- Tools have obvious verbs. Press `R`, drag — a rectangle appears. The feedback *is* the lesson.
- Menus list every command in words, with its shortcut beside it. The menu is the manual.
- The file-browser empty state is one line of text and one button — placed exactly where the
  action happens.

The principle: **instruction sits at the point of action and disappears once the action is
possible.** A tour is instruction relocated away from the action and delivered before it is
needed, which is why nobody remembers one.

### 1.9 Keyboard as a first-class path

- Every tool has a single-letter shortcut: `V` `R` `T` `F` `P`. Not a chord — a letter.
- Modifiers are consistent across contexts: `Shift` constrains, `Alt` means from-centre /
  duplicate / measure, `Cmd` deep-selects.
- Nudge is `arrow` for 1px and `Shift+arrow` for the big step.
- Shortcuts are shown in menus and tooltips, so the keyboard path is learned *while* using the
  mouse path rather than from documentation.

The structural test Figma passes: the entire job can be done from the keyboard for everything
except the genuinely spatial parts. Keyboard is not an accessibility bolt-on layered over a mouse
design; it is a complete parallel path, and the mouse UI is arranged so that discovering it is
unavoidable.

---

## Part 2 — The rules for FlashCC

Concrete and checkable. These bind the implementation.

### R1 — The preview is the canvas

The preview pane is the largest region and holds the visual centre of gravity. The source pane and
filmstrip serve it. No control goes in the preview pane that is not either (a) on the slide itself
or (b) the low-contrast zoom cluster.

### R2 — Remove, never disable

No greyed-out control appears in FlashCC. If a control does not apply, it is absent. Applies
especially to the role control (absent until slide hover) and the overflow split offer (absent
until overflow is real).

### R3 — Hover hints, press commits

| State | Feedback | Animated |
| --- | --- | --- |
| Row / thumbnail / icon-button hover | background tint `rgba(255,255,255,0.04)` | **No** |
| Editable text block hover (on slide) | 1px hairline outline | **No** |
| Slide hover | role control fades in at slide's top-left | Yes, 120ms opacity only |
| Thumbnail hover | duplicate + delete icon buttons appear | **No** |
| Selection (current slide) | 1px `--accent` outline, no fill | **No** |
| Focus (keyboard) | double gold ring per FlashFX | **No** |
| Text edit mode | cursor change + block border treatment change | **No** |

Hover feedback is one property change. Never scale, never shadow, never translate.

### R4 — The timing budget

| Class | Duration | Easing |
| --- | --- | --- |
| Anything tracking the pointer (drag, resize, scrub, reorder-follow) | 0ms, 1:1 | — |
| Hover, selection, focus, mode change | 0ms | — |
| Panel content swap on slide change | 0ms | — |
| Role control / zoom cluster fade | 120ms, opacity only | out |
| Filmstrip reorder settle | 200ms transform | move |
| Brand kit sheet in/out | 200ms transform | out |
| Toast / island | 200ms | spring (the one exception) |

Nothing in FlashCC exceeds 200ms. Nothing that responds to the pointer is above 0ms. There is no
transition on `background-color`, `color`, or `border-color` anywhere in the app.

### R5 — Icons

`lucide-react`, **14px glyph** (16px only in the brand kit sheet header), default stroke,
monochrome, unlabelled, in a **28px** hit box. Icons are `--text-tertiary` at rest,
`--text-primary` on hover, `--accent` when active. No filled icon variants. No labels under icons.
Delete is the only icon permitted to turn `--danger`, and only on its own hover.

### R6 — One accent, used once

`--accent` gold appears in exactly three roles: the Export button (brand gradient — the one hero
control), the current-slide selection outline, and the focus ring. Nowhere else. No accent
dividers, no accent headings, no accent icons except the active state of a control.

*Note the two colour systems: FlashFX tokens paint the **app**; the user's brand kit paints the
**slides**. They never mix. A slide may be hot pink on cream inside a navy app, and that is
correct.*

### R7 — Controls appear on hover

Absent at rest, present on hover: the slide's role control, thumbnail duplicate/delete, the
project-name field's input chrome, the zoom cluster's contrast (present but muted, full contrast
on hover). Nothing reserves layout space for a hover-revealed control — revealing one must not
reflow anything.

### R8 — One rhythm

Every interactive control is **28px** tall. Spacing is a 4px scale, preferring 8px. Icon buttons
are 28×28. The top bar is 44px. The filmstrip is 96px. Text is 11–12px in chrome, 10px overline
for the two section labels that exist.

### R9 — Direct manipulation

Text is edited on the slide, at final size, in the final font. The source pane is the mirror, live
in both directions. No panel anywhere contains a text field that edits slide copy. Role is changed
from a control on the slide, not from a sidebar.

### R10 — Destructive separation

Delete exists in exactly two places: the hover control on a thumbnail, and the Delete key with a
slide selected. It is never in the top bar, never in the resting UI. No confirmation dialog —
undo covers it, which is what makes that safe.

### R11 — Undo covers everything

Command-based history. Every mutation is a command: text edit, split, re-split from granularity
change, role override, reorder, duplicate, delete, add, and every brand kit field. Brand kit edits
coalesce per field per interaction (dragging a colour picker is one undo entry, not two hundred).

### R12 — Empty state teaches at the point of action

Empty source pane: one line of instruction and a paste affordance, in the pane where pasting
happens. Empty preview: nothing at all — no placeholder slide, no illustration. No tour, no coach
marks, no dismissible tips.

### R13 — Tooltips are for shortcuts only

A tooltip may exist only where there is a keyboard shortcut to teach, and shows the command name
plus the shortcut. No tooltip restates an icon. Delay ~500ms, no animation.

### R14 — Keyboard is complete

| Key | Action |
| --- | --- |
| `←` `→` | Previous / next slide |
| `↑` `↓` | Previous / next text block within the slide |
| `Enter` | Edit the selected text block in place |
| `Esc` | Exit editing → deselect → close sheet (one level per press) |
| `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` | Undo / redo |
| `Cmd/Ctrl+E` | Export |
| `Cmd/Ctrl+D` | Duplicate current slide |
| `Cmd/Ctrl+B` | Toggle brand kit sheet |
| `Delete` / `Backspace` | Delete current slide (not while editing) |
| `Cmd/Ctrl+Enter` | Split slide at cursor |
| `0` | Zoom to fit |

One keymap module is the single source of truth; tooltips and menus read their shortcut strings
from it, so they cannot drift.

### R15 — No spinners

Loading indicators exist only during export. Everything else is synchronous or fast enough not to
need one. Autosave is silent — no "saving…" indicator, no checkmark.

---

## Part 3 — Reconciling with the FlashFX design system

FlashFX tokens win on colour, type, and brand. The Figma research wins on density, feedback,
timing, and restraint. The genuine conflicts:

| Conflict | FlashFX says | Figma research says | Resolution |
| --- | --- | --- | --- |
| Hover timing | 120–200ms ease-out on state changes | 0ms | **Figma wins.** 0ms for hover, selection, focus. FlashFX's 120–200ms applies only to things that *appear or move*: the sheet, the role control's fade, reorder settle. |
| Glass / blur | menus and island get blur | Figma uses none | **Split.** Blur only on the role dropdown menu and the island. The brand kit sheet is solid `--surface-2` — it is large, and blur at that size is compositor cost for no information. |
| Panel gradient + top highlight | panels may use the lit-from-above gradient | flat surfaces | **Restrained.** The gradient is permitted on the brand kit sheet and the filmstrip only. The two main panes are flat `--bg` / `--bg-sunken`. |
| Control height | 24 / 28 / 32 offered | one height, uniform | **Both.** Take FlashFX's 28px default and use it as the *only* height. No compact, no comfortable. |
| Icon size | 11–16px, 13–14 typical | 16px glyph in 24–32px box | **Both, they agree.** 14px glyph in a 28px box. |
| Accent usage | primary action, selection, focus, active | one accent, used sparingly | **They agree**, tightened to R6's three roles. |
| Shadows | floating overlays only | flat | **Plus one exception.** The slide in the preview gets a soft shadow — it is an object on a surface, which is exactly the case shadow is for. |
| Spring easing | reserved for the island | no springs | **FlashFX wins**, scope unchanged: the island only. |
| Type scale | 7 steps, 10–13px chrome | small, tight, uniform | **They agree.** Chrome uses `caption` (11) and `body` (12); `overline` for the two section labels; `title` (13) for the sheet header only. |

Where they conflict and this table does not cover it: **timing and feedback default to Figma,
colour and type default to FlashFX.**

---

## Part 4 — Control budget

Counted in the resting state: a document is open, nothing is hovered, the sheet is closed, no
text block is in edit mode.

| # | Control | Region |
| --- | --- | --- |
| 1 | Wordmark (opens project list) | top bar |
| 2 | Project name field (chrome hidden until hover) | top bar |
| 3 | Brand kit icon button | top bar |
| 4 | Export button | top bar |
| 5 | Granularity segmented control | source pane |
| 6 | Pane resize handle | between panes |
| 7 | Zoom-to-fit button | preview, muted |
| 8 | Add-slide tile | filmstrip, trailing |

**Total: 8.**

Counting rule, stated so the number is honest:

- **Not counted — static text:** slide-count readout, character/block count, zoom percentage,
  slide numbers. No affordance, no hit target.
- **Not counted — content surfaces:** the source textarea, the slide itself, the thumbnails. These
  are the document, not chrome — the same reason Figma's canvas is not a control. Counting them
  gives 11.
- **Not counted — hover-revealed:** role control, duplicate, delete, overflow marker and its split
  offer. Absent at rest by R7.
