# FlashFX Design System

Style rules for this app. It shares the visual language of **FlashFX**, a professional
browser-based motion-graphics/video editor. Treat this file as the source of truth for all UI
decisions.

**Aesthetic:** a dark, dense, precise "pro tool" — a calm deep-navy control room with a single
warm gold accent. Engineered, quiet, high-density (DaVinci Resolve / Linear / a pro DAW), never
bubbly or consumer-playful. **Dark theme only.**

**Stack:** Tailwind CSS + CSS custom properties, `lucide-react` icons.

**Net feel:** deep navy canvas, hairline structure, one confident gold accent, tiny tight type,
depth by surface-step, fast ease-out motion, glass only where things float.

---

## Core principles (obey these)

1. **Depth comes from a lighter surface step, not shadows.** Stack UI by moving up the surface
   ladder (darker → lighter navy). Shadows are reserved almost exclusively for floating overlays.
2. **Gold is used sparingly** — it marks the one primary action, the current selection, focus, and
   active state. Most of the UI is navy + grey text. If everything is gold, nothing is.
3. **Lines are white-alpha hairlines, not solid grey** — so they adapt to whatever surface they
   sit on.
4. **Type is small, tight, and quiet.** UI text lives at 10–13px, weights 400–600, with slightly
   negative tracking on titles. Density over generosity.
5. **Blur is a privilege of floating things** (menus, the dynamic island, modal scrims) — never on
   static panels (it's a compositor cost and visual noise).
6. **Motion is fast and physical** — 80–200ms, ease-out; spring only for the "island" expand.

---

## Color tokens

The source of truth. Reuse these `:root` vars verbatim.

```css
:root {
  /* Surface ladder — depth via a lighter step, never a shadow */
  --bg-sunken:  #070f1c;  /* deepest — app backdrop, timeline well */
  --bg:         #0a1424;  /* base canvas / page */
  --surface-1:  #0e1b2e;  /* cards, inputs, sidebars */
  --surface-2:  #142338;  /* panels, modals */
  --surface-3:  #1a2a42;  /* raised rows, menus */
  --surface-4:  #21344e;  /* controls, chips */
  --surface-5:  #2a3f5c;  /* strongest edge / hover top */

  /* Lines — white-alpha, adapt to any surface */
  --hairline:   rgba(255,255,255,0.08);  /* default divider/border */
  --border:     rgba(255,255,255,0.14);  /* stronger input border */

  /* Accent — the gold, used sparingly */
  --accent:       #d9a521;               /* primary action, selection, active */
  --accent-hover: #f0bd45;
  --accent-wash:  rgba(217,165,33,0.12); /* accent background tint */
  --accent-dim:   #a87d18;               /* accent border */
  --on-accent:    #12161c;               /* text/icon ON gold */

  /* Text — hierarchy via value step, not color */
  --text-primary:   #e6edf6;  /* headings, key values */
  --text-secondary: #94a3b8;  /* body, labels */
  --text-tertiary:  #64748b;  /* captions, meta */
  --text-muted:     #475569;  /* disabled, placeholder */

  /* Semantic */
  --success: #3dbe7a;
  --danger:  #e5545a;
  --info:    #4c86d6;
  --live:    #ff3b5c;  /* "recording"/scrub red — distinct from selection gold */
}
```

### Brand gold (hero moments only)

The logo mark and top-priority CTAs (primary "New", "Upgrade") use a brighter gold gradient:

```css
background: linear-gradient(135deg, #f7b500, #e09000);
/* hover: #ffc83d — text: #0a0f16 (near-black) */
```

Use this for the brand mark and **one hero button per screen**. Use `--accent` (`#d9a521`) for
everything else gold.

---

## Typography

- **Font:** system UI stack — `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
  "Segoe UI", Roboto, sans-serif`
- **Mono:** `"SF Mono", ui-monospace, "Cascadia Code", monospace` — numbers, timecodes, IDs.

7-step scale (each token bakes in line-height + tracking + weight):

| Token | Size / line | Tracking | Weight | Use |
| --- | --- | --- | --- | --- |
| `overline` | 10 / 12 | +0.4 | 600 | UPPERCASE section labels |
| `caption` | 11 / 14 | +0.05 | 500 | meta, captions |
| `body` | 12 / 16 | 0 | 450 | default body |
| `body-strong` | 12 / 16 | 0 | 600 | emphasized body |
| `title` | 13 / 18 | −0.1 | 600 | panel/dialog titles |
| `stat` | 15 / 20 | −0.2 | 600 | numeric values |
| `display` | 22 / 26 | −0.4 | 600 | rare hero text |

Weights only ever **400 / 450 / 500 / 600** — no bold/700+. Titles use slightly negative
letter-spacing.

---

## Shape, spacing, density

- **Radii:** `sm` 4px (inputs, chips), `md` 6px (buttons, default), `lg` 8px (cards), `xl` 12px
  (modals), `island` 14px (floating pill), `pill` 999px.
- **Control heights:** compact 24px, default 28px, comfortable 32px. Toolbars/headers ~36–44px.
  **This app runs dense** — default to 28px controls, 11–12px text, tight gaps (`gap-1`–`gap-2`,
  `px-2`–`px-3`).
- **Borders:** 1px hairline everywhere; inputs get the stronger `--border`.

---

## Elevation, shadow, material

Shadows — **floating only**:

```css
/* overlay */
box-shadow: 0 8px 24px -4px rgba(0,0,0,.5), 0 2px 6px -2px rgba(0,0,0,.4);
/* modal */
box-shadow: 0 16px 48px -8px rgba(0,0,0,.6), 0 4px 12px -4px rgba(0,0,0,.45);
/* top-highlight (subtle raised edge) */
box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
```

**Focus ring** (double gold ring):

```css
box-shadow: 0 0 0 2px rgba(217,165,33,.55), 0 0 0 4px rgba(217,165,33,.15);
```

**Material (glass) — floating surfaces only:**

- Menus: `rgba(26,42,66,.85)` + `blur(24px) saturate(1.8)`
- Island: `rgba(20,35,57,.78)` + `blur(20px) saturate(1.8)`
- Modal scrim: `rgba(0,0,0,.6)` + `blur(4px)`

**Raised-panel gradient trick:** panels can use
`linear-gradient(180deg, var(--surface-2), var(--surface-1))` + the top-highlight inset for a
subtle "lit from above" feel.

---

## Motion

- **Durations:** instant 80ms, micro 120ms, standard 200ms, large 300ms.
- **Easings:**
  - `out` — `cubic-bezier(.2,0,0,1)` (default)
  - `in` — `cubic-bezier(.4,0,1,1)`
  - `move` — `cubic-bezier(.4,0,.2,1)`
  - `spring` — `cubic-bezier(.34,1.3,.64,1)` — **reserve for the island expand**
- Hovers/state changes: 120–200ms ease-out. No long or bouncy transitions on ordinary controls.

---

## Z-index ladder

`canvas-banner` 40 · `overlay` 90 · `island` 95 · `modal` 100 · `recovery` 200 · `top` 9999

---

## Components

**Buttons.** Primary: gold bg (`--accent`, or the brand gradient for hero), `--on-accent` text,
radius-md, semibold 11–12px, hover → lighter gold. Secondary: `--surface-1`/`--surface-3` bg +
hairline border, secondary text, hover raises the surface + lightens text. Sizes = the 24/28/32
heights. Disabled = `opacity-60`.

**Inputs.** `--surface-1` bg, `--border` 1px, radius-sm, 11–12px primary text, muted placeholder.
Focus: border → `--accent-dim` + `0 0 0 1px var(--accent-wash)` ring (no browser outline).

**Cards** (e.g. project tiles). `--surface-1` bg, hairline border, radius-lg, thumbnail on top,
dense 11–12px title + tertiary meta row; hover lifts the border toward `--surface-5`/accent.

**Modal.** Centered, `max-w-sm`/`md`/`lg`, `--surface-2` panel, hairline border, radius-xl, modal
shadow. Scrim = black/60 + blur. Header row (icon in accent + title type + close X), body `p-5`,
optional footer action bar on `--surface-1` with a top hairline. Escape / scrim-click to close.

**Menus / dropdowns.** Floating, material glass bg + blur, hairline border, overlay shadow,
radius-lg; rows 11px, hover = `bg-white/[0.04]`, active item text = accent + `--accent-wash` bg.

**Chips / badges / pills.** `--surface-3`/`--surface-4` bg, 9.5–10px, radius `sm`→`pill`.
"Coming soon"/status pills are muted grey; semantic states use success/danger/info at low opacity.

**Sidebar + header shell.** Left rail ~200px on `--surface-1` with a hairline right edge: brand
mark (gold-gradient square, 5×5, bold letter) at top, nav rows (11–12px, icon + label; active row
= raised surface + gold icon + count badge), footer utility rows. Main area: a ~44px top header bar
(`--surface-1`, bottom hairline) with title + search + right-aligned actions ending in the gold
primary CTA + a round avatar.

**Dynamic Island.** A floating rounded-14px pill (material glass) for transient status/toasts,
entering with the `spring` easing — the app's one "delightful" motion moment.

**Avatar.** Small round; photo, else a gold-gradient circle with a bold uppercase initial in
near-black.

---

## Iconography

`lucide-react`, sizes 11–16px (13–14 typical in toolbars), default stroke; bump to
`strokeWidth={2.5}` only on a hero CTA icon. Icons are `--text-tertiary` at rest,
`--text-primary`/accent when active.

---

## Implementation notes

- Wire Tailwind's `theme.extend.colors` to the CSS vars (single source of truth), e.g.
  `accent: 'var(--accent)'`, `surface: { 1: 'var(--surface-1)', … }`, `hairline: 'var(--hairline)'`,
  and the primary/secondary/tertiary/muted text colors.
- **Gotcha:** because these are var-based colors (not RGB channels), Tailwind's `/opacity` suffix
  does **not** work on them (`text-accent/40` is broken). Pre-define washed variants (like
  `--accent-wash`), or use Tailwind's built-in scales (e.g. `red-500/20`) when you need alpha.
- Keep everything on the token scale; avoid one-off hex except the brand-gold gradient.
