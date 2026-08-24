# FlashCC Template System — final specification

**Status:** implementable. Every type in §2 was compiled against this repo's exact `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `NodeNext`) together with a full `Template` literal; seven negative probes were confirmed **rejected** by the compiler (reflow without terminal `overflow`; a hex in a colour field; a `marker` patch on a text slot; an arrangement re-routing `content`; an arrangement changing region membership; a `roles` record missing roles; `radius: 99`). All arithmetic below was computed against the repo's own `countLines` and against `PALETTE_PRESETS`, not estimated.

**The one-sentence model.** A template is a **stylesheet plus a seating plan**: ten named slots styled once on the page, and each of the five roles says which slots sit in which of six regions, patches a handful of their fields, and declares — as ordered enums, never expressions — what yields when the user's words do not fit.

**What was overridden from the brief, and why.** The brief asks for a big square **"Rules"** button. The word is refused: `computeLayout` already emits `-rule`/`-qrule` node ids for drawn accent bars and `docs/document-schema.md` §5 calls the splitter's logic "rules". The drawn primitive is therefore renamed **`divider`** in the schema, which frees the word — and the entry point becomes something *bigger* than one square: a row of six starter cards on Home, each rendering a real slide through the real renderer. That is the same instinct (big, unmissable, answers "what do I do here") without leading a first-run user into an empty editor. §7 argues it in full.

---

## 1. The rule vocabulary

Every rule is a closed enum, an index into a closed scale, or a bounded number. **There is no `x`, no `y`, no font size in px, no hex, no expression, no `clip`, and no `truncate` anywhere in this vocabulary.** Position is a consequence of anchoring; size is a consequence of fitting.

### 1.0 The scales — why there are almost no free numbers

| Scale | Values | Used for |
| --- | --- | --- |
| `SPACE[0..13]` | 0 · 6 · 12 · 18 · 24 · 32 · 40 · 48 · 56 · 72 · 80 · 96 · 120 · 160 | every gap, inset, pad, rail height, divider length, icon size |
| `EM[0..7]` | 0.25 · 0.4 · 0.55 · 0.7 · 0.85 · 1.0 · 1.2 · 1.5 | any distance measured against the type it separates |
| `STROKE[0..4]` | 1 · 2 · 4 · 6 · 10 | divider/marker thickness |
| `RADIUS[0..4]` + `"pill"` | 0 · 4 · 8 · 16 · 32 · (h/2) | corners |
| `MARGIN` | tight .05 · default .075 · wide .10 | safe margin, as a fraction of `format.w` |

All are stored at `REFERENCE_WIDTH = 1080` and multiplied by `format.w / 1080` at resolve time, so **one template is valid at 4:5, 1:1 and 9:16 with no per-format authoring**. Enumerated indices are also what makes a unit bug unrepresentable: `radius: 99` does not compile.

### 1.1 Anchoring — where content sits, and where the extra space goes

| Rule | Type / range | Default | What it does |
| --- | --- | --- | --- |
| `anchor` | `"start" \| "center" \| "end"` | `"center"` | Pins the region's stack to a point of the region **and thereby declares its growth direction**. `end` is the cover's bottom-anchored heading: a 3-word cover and a 90-char cover share a baseline. |
| `sparseAnchor` | same enum | `"center"` | Where the stack sits when the region is barely full. Centring a little content in a big zone reads as indecision; this makes it a decision. |
| `fill.crowdedAbove` | `0..1` | `0.92` | Above this fill ratio (`groupH/regionH`) the stack is forced to `start` and reflow begins. |
| `fill.sparseBelow` | `0..1` | `0.55` | Below this ratio `sparseAnchor` is used instead of `anchor`. |
| `fill.centreBias` | `0..1` | `0.44` | Where a `center` anchor lands in the free space. 0.5 is arithmetic; 0.44 is the optical centre. Never a slider — three presets in the editor. |
| `distribute` | `"packed" \| "spaceBetween"` | `"packed"` | `spaceBetween` pins member 0 to the region start and packs the rest at the end — **one** slack point, never slack spread evenly through every gap. With one surviving member it degrades to `anchor`. |
| `align` | `"left" \| "center" \| "right"` | `"left"` | Cross-axis alignment of the **box**. Deliberately distinct from `type.align`, which aligns the text inside it. |
| `inset` | `SpaceStep` | `0` | Extra horizontal squeeze inside the content column. The quote role's whole signal, as data rather than a branch. |
| `offset` | — | **does not exist** | Refused. A nudge is a stored coordinate; it is correct for the one content length it was authored against. |

### 1.2 Sizing — three modes, and the third is never the clipping one

| Rule | Type / range | Default | What it does |
| --- | --- | --- | --- |
| `width` | `{mode:"column"} \| {mode:"span",start,span} \| {mode:"hug",padX}` | `column` | `span` resolves over `grid.columns`; `hug` sizes to measured text + 2·padX, clamped to the column. `hug` replaces the CTA pill's font-blind `handle.length*20+96`. |
| `size` | `{mode:"fixed",step} \| {mode:"shrink",from,to}` | `fixed` | Exactly two modes. Inside a packed stack, `fixed` **is** grow-and-push: the box hugs its content height and displaces later siblings. Every tool that ships a third mode ships the clipping one. |
| `maxHeight` | `SpaceStep \| null` | `null` | Clamp for images and logos only. |
| `aspect` | `"1:1"\|"4:5"\|"3:2"\|"16:9"\|"fill"` | `"4:5"` | Height derived from width. Image and logo slots only. |
| `hangingIndent` | `boolean` | `true` | Wrapped list lines align to the text, not the marker. Indent = marker column + `markerGap`, derived — not a fixed 56. |

### 1.3 Flow — routing, presence, gaps

| Rule | Type / range | Default | What it does |
| --- | --- | --- | --- |
| `members` | `SlotName[]` per region | — | **Membership is presence.** A slot exists in a role iff it is listed. There is no separate `visible` flag to fall out of sync. Order is flow order, routing order, and paint order. |
| `content.accepts` | `BlockType[]` | — | Which document blocks may fill this slot. |
| `content.take` | `"first" \| "all" \| "rest"` | `"first"` | `rest` consumes every accepted block no earlier slot took. |
| `content.part` | `"text" \| "items" \| "attribution"` | `"text"` | `attribution` **reads** the block the quote slot consumed and consumes nothing. |
| `sink` | `SlotName` | `"body"` | The role's fallback prose slot. Validator requires it to be a live member of `body`/`paneA`/`paneB` **and** to have `take:"rest"`. This is what makes "content is never dropped" structural — and it fixes the live `lists[0]` / `prose[0]` drop bugs. |
| `ifEmpty` | `"collapse" \| "reserve" \| "hideRegion"` | `"collapse"` | The field nobody thinks of and the one with the largest visual consequence. `reserve` keeps headings on one baseline across a deck. `hideRegion` collapses an empty rail so the body can use its height. |
| `gap` (region) | `{mode:"space",step} \| {mode:"em",k}` | `space 5` | Space between members. |
| `gapBefore` (slot) | `Gap \| null` | `null` | Overrides the region gap in front of this member. |
| `paraGap` | `Gap` | `em 2` | Gap between the blocks one slot consumed when `take` is `all`/`rest`. |
| `markerGap` | `EmStep` | `em 2` | Marker-to-text gutter, in em of the item. |
| — em gaps resolve against the **preceding** member's *fitted* size. Never the following one: that would depend on a size not yet chosen. Nominal gaps (computed from each slot's top step) are used for the fit budget; final gaps are recomputed from fitted sizes and can only shrink, so the group only ever gets shorter. Monotone, no cycle. |
| `split` | `{axis,at:3..9,gutter} \| null` | `null` | One-level partition of `body` into `paneA`/`paneB`, addressable by **any** slot — not image-only. When set, `body.members` must be empty. Depth stays 3 (slide → region → slot). |
| `prefix` / `suffix` | `string`, ≤4 chars | `""` | The `— ` before an attribution, as data. Capped at 4 characters so a template can never carry author-typed copy. |

### 1.4 Type — one ladder, contiguous windows

| Rule | Type / range | Default | What it does |
| --- | --- | --- | --- |
| `type.steps` | `number[]`, strictly descending | Anchored: `[96,84,72,64,56,48,44,40,36,32,30,28,26,24]` | **One** ladder for the whole template. Every slot takes a contiguous window of it. Six unrelated hand-tuned arrays cannot drift apart when they are indices into one array. |
| `type.floor` | `StepIndex` | `13` | No slot resolves below this. At feed scale 0.40 a 24px logical step renders ~10px — the practical legibility floor. |
| `face` | `"display" \| "body"` | `"body"` | The template picks the **role**; the brand kit picks the face. This seam is the brand lock. |
| `size.from` / `size.to` | `StepIndex` | — | The shrink window. The fit ladder is *derived* as the descending steps between them; `fit.ts`'s walk-the-ladder logic is unchanged, only the ladder's source moves to data. |
| `leading` | `{mode:"optical"} \| {mode:"fixed",ratio}` | `optical` | Optical = `clamp(1.02, 1.5 − 0.004·S, 1.5)`. `fixed` exists so a starter can reproduce a hand-tuned deck exactly (Anchored uses 1.08/1.10/1.15/1.20/1.35/1.40). |
| `measure` | `number \| null` (chars/line) | `null` | Caps `maxWidth` at `measure · S · advance`. **Only ever narrows**, never widens, never rejects a step. Replaces the quote role's hardcoded `format.w*0.1`. |
| `maxLines` | `number \| null` | `null` | A fit **target**, three-tier: (1) the largest step that fits by height *and* lands within N lines; (2) else the smallest step in the window, if it fits by height; (3) else the smallest step with `overflow:"lines"` set. Height is the only hard constraint. This finally implements role-layouts.md's "cover heading max 5 lines". |
| `balance` | `boolean` | `false` | Re-fit 2–5% narrower until the last line carries 2+ words. Cheapest available quality signal on a headline. |
| `tracking` | `"inherit" \| number` | `"inherit"` | Per-slot override of the brand face. |
| `case` | `"inherit" \| "none" \| "upper"` | `"inherit"` | So a label can be upper +0.08em without a third brand face. |
| `weight` | `"inherit" \| 400\|500\|600\|700` | `"inherit"` | Retires the three places today's code hardcodes 600/500 against the kit. |
| `uniform` / `uniformFloor` | `boolean` / `number` | `true` / `2` | Deck cohesion: one step per `(role, slot)` across the document, capped so one outlier cannot drag the whole deck. §4.6. |

### 1.5 Colour — roles bind, hexes never travel

| Rule | Type / range | Default | What it does |
| --- | --- | --- | --- |
| `ColourRole` | `"bg"\|"text"\|"muted"\|"accent"\|"onAccent"\|"hairline"\|"none"` | — | **Every** colour-bearing field. A hex does not compile. If a user-authored template could store `#db2777`, brand-kit swapping would produce broken slides and hard constraint 4 would be theatre. |
| `onAccent` | derived | — | `isDark(c) = relativeLuminance(c) < 0.1791` (the exact crossover where `contrast(white,c) = contrast(black,c)`); `onAccent = isDark(accent) ? lightest : darkest`. Replaces the CTA plate's hardcoded `palette.background`. Verified: today's value is correct for all six presets by coincidence, and fails the first time a user picks a dark accent on a dark background. It also *improves* two presets — Bloom's plate text goes 4.21:1 → **4.60:1**, Slate's 4.21 → **5.17**. |
| `hairline` | derived | — | `text` moved on L in OKLab (hue and chroma held) until CR ≈ 1.35 against the resolved ground. Mixing in linear sRGB instead produces grey and loses the palette's temperature. |
| `contrast` | `"off" \| "auto"` | `"auto"` | Picks whichever of text/bg scores higher WCAG contrast against the fill actually resolved beneath the box. Pure relative-luminance arithmetic, no DOM. |
| `background.fill` / `.treatment` | `ColourRole` / `flat\|gradient\|grid\|dots` | `bg` / `flat` | Lives on the page **and may be patched per role** — a dark cover into light body slides is template data, not a per-slide override. Emitted as a real node, closing the hole where `backgroundStyle(brand)` bypassed `LayoutNode[]` entirely. |
| `treatment.intensity` | `1..5` perceptual | `2` | The **alpha is derived** by bisecting contrast against the resolved ground. One authored alpha cannot be right on both Ink (0.013) and Paper (0.178) — a 13× spread. |
| `invariants.feedScale` | `number` | `0.40` | Contrast is checked at *rendered* size `S × feedScale`, not logical size. Verified: Paper muted = 4.16:1 and Slate muted = 4.11:1 already fail 4.5:1, and muted carries the quote attribution and the CTA supporting line. |
| `invariants.accentFill` | `SlideRole[]` | `["cta"]` | Where accent may be a **fill** rather than a hairline or a marker. role-layouts.md §5's "scarcity is what makes the last slide land" becomes a checked invariant instead of a paragraph. |

### 1.6 Decoration — attached, never floating

| Rule | Type / range | Default | What it does |
| --- | --- | --- | --- |
| `mark.kind` | `"divider" \| "plate" \| "dot" \| "icon"` | — | Closed. Everything the brief asks to place is here; nothing else can be added without a schema change, which is the point. |
| `attach` | `{to, edge, side, gap, from, align}` | — | **The only way decoration gets a position.** Resolved in pass 6 against final slot boxes, so a divider tracks a content-dependent heading for free. The cover's `headY − 32 − 6` becomes `attach(title, top, outside, 32)`. |
| `attach.to` | `{region} \| {slot}` | — | In the editor, "add a line" asks **"attached to what?"** — one extra question that makes every subsequent slide correct. |
| `attach.side` | `"inside"\|"outside"\|"behind"` | `outside` | `behind` sizes the mark to the target box + padding in the decor band: that single value expresses the CTA pill, a colour panel behind a heading, and a full-region block. |
| `attach.from` | `"box" \| "cap" \| "baseline"` | `"cap"` | Cap-relative distance is what makes a line sit correctly beside display type. Today's authored 32px gap renders as a ~49px optical gap because it measures from the box. |
| `length` | `{fixed,step} \| {match} \| {column}` | `fixed` | `match` ties a divider's width to the measured box of the slot it attaches to — how a rule under a centred heading stays the width of the text, not the column. |
| `requires` | `SlotName \| null` | `null` | Emitted only when that slot resolved to content. Fixes a live bug: the cover accent bar is pushed at line 123, *before* the `if (headBlock)` guard at 135, so an empty cover renders a floating rule. |
| `optional` | `boolean` | `true` | Whether reflow may drop it before anything shrinks. |
| `glyph` | `IconId`, 24 values | — | Shipped as pure path data in `src/render/icons.ts` so `computeLayout` emits an icon without importing `lucide-react`, and phase 2 resolves it without a DOM. An icon browser is a second product. |
| `invariants.maxDecorPerSlide` | `number` | `2` | Restraint as a number the engine enforces. |

### 1.7 Image

| Rule | Type / range | Default | What it does |
| --- | --- | --- | --- |
| region `bleed` | region | — | The **one** legal exception to "nothing crosses the margin", and it accepts only `image`. Full-bleed cover photography — the most common carousel look — is reachable. Text and decor are still clamped to the safe box, always. |
| reserve vs behind | **structural, not a boolean** | — | An image that *reserves* space is a member of `paneA`/`paneB`; an image that sits *behind* is the sole member of `bleed`. The region says which, so there is one fewer field and one fewer thing to explain. |
| `fit` / `focal` | `"cover"\|"contain"` / 9-point | `cover` / `center` | The twenty-five-year-stable intersection of InDesign, Figma, PowerPoint, Express: box ratio, cover-vs-contain, an anchor. No crop handles, no filters, no free transform. |
| `treatment` | `{none} \| {duotone, from, to}` | `none` | **Duotone is the only legal text-over-image treatment.** White text at 4.5:1 over an unknown photo needs a scrim of alpha ≥ 0.817, which destroys the photo; duotone remaps luminance onto a brand ramp and makes contrast provable by construction. There is no `scrim` in this schema — the editor must not be able to offer what the engine cannot guarantee. |
| `ifEmpty:"placeholder"` | — | — | The unfilled state is a first-class rendering, so the template editor needs no second code path. |
| `ImageAsset.intrinsic` | `{w,h}` on the asset **in the document** | — | Without it, layout would decode the file — which needs a browser and kills phase 2. |

### 1.8 Conditional — two mechanisms, both closed, both terminating

| Rule | Type / range | Default | What it does |
| --- | --- | --- | --- |
| `arrangements` | `Arrangement[]`, **max 2 per role**, first match wins | `[]` | Named, plain-English, pre-fit content queries selecting a patch. The unpatched role is the "otherwise" — no terminal entry needed. This is the answer to "a good slide for a 3-word cover *and* a 400-character body". |
| `when` | `{measure:"chars"\|"words"\|"blocks"\|"items", of, lt?, gte?} \| {has:flag, is}` | — | The measure union **deliberately excludes `lines` and `height`**. Those are post-fit; a query on them re-fires after the fit changes them and the layout oscillates. Typed so the bad case is unrepresentable. There is no OR and no NOT — a second arrangement expresses the alternative. |
| arrangement patch scope | `ArrangeSlots` / `ArrangeRegionPatch` | — | Type-level: an arrangement **cannot** change `content`, `kind`, `ifEmpty`, `members`, or `split`. Routing is decided in pass 1 and an arrangement must not be able to move it. Verified rejected by the compiler. |
| `byCount` | `CountBand[]` on the list slot | 4 bands | Beautiful.ai's count-driven variant, as data: 1–2 large · 3–4 standard · 5–6 compact · 7+ two columns. Reads item **count**, a pre-fit intrinsic, so it can never cycle with the fit it influences. The final band must have `maxItems: null`. |
| `reflow` | `readonly [...ReflowMove[], OverflowMove]` | — | Ordered, bounded, cumulative post-fit ladder. The terminal move is `overflow` **structurally** — verified: a ladder ending in anything else is TS2322. |
| moves | `tighten \| shrink{slot} \| drop{decor} \| widen \| columns{list} \| unreserve \| eatRail{rail} \| offerSplit \| overflow` | — | Each move must **strictly reduce the deficit (required − available)** or be skipped. (Stated this way deliberately: `eatRail` increases *available* rather than decreasing *required*, and the naïve "must decrease required height" invariant silently makes it dead code.) The walk is capped at `2 × reflow.length`. |
| `overflow` | engine behaviour, not a field | — | Renders at the floor step, sets `LayoutNode.overflow`, shows the existing red marker and split offer. A template cannot switch it off. |
| `invariants.centreVetoOverLines` | `number \| null` | `3` | Centred text past N lines flips its **text** alignment to the region's read alignment; the box stays centred. Alignment does not change height, so this cannot cycle with the fit. A 400-char centred quote is the strongest "a tool made this" signal there is. |

---

## 2. Template schema

`src/doc/template.ts` — pure data, imports only `./types.js`. This file compiles clean under the repo's tsconfig; the negative probes listed at the top of this document were confirmed rejected.

```ts
/**
 * src/doc/template.ts — the FlashCC Template model.
 * Pure data. No React, no DOM, no CSS strings, no hex, no x/y, no expressions.
 */
import type { SlideRole, Slide, BrandKit } from "./types.js";

/* ── 1. Closed scales ─────────────────────────────────────────────────── */

export type TemplateId = string;
export type DecorId = string;
export type AssetId = string;

export const REFERENCE_WIDTH = 1080;
export const FEED_SCALE = 0.4;

export const SPACE = [0, 6, 12, 18, 24, 32, 40, 48, 56, 72, 80, 96, 120, 160] as const;
export type SpaceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export const EM = [0.25, 0.4, 0.55, 0.7, 0.85, 1, 1.2, 1.5] as const;
export type EmStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const STROKE = [1, 2, 4, 6, 10] as const;
export type StrokeStep = 0 | 1 | 2 | 3 | 4;

export const RADIUS = [0, 4, 8, 16, 32] as const;
export type RadiusStep = 0 | 1 | 2 | 3 | 4 | "pill";

export const MARGIN = { tight: 0.05, default: 0.075, wide: 0.1 } as const;
export type MarginStep = keyof typeof MARGIN;

export type Intensity = 1 | 2 | 3 | 4 | 5;
export type StepIndex = number;
export type Fraction = number;

export type Gap =
  | { readonly mode: "space"; readonly step: SpaceStep }
  | { readonly mode: "em"; readonly k: EmStep };

/* ── 2. Colour ────────────────────────────────────────────────────────── */

export type ColourRole = "bg" | "text" | "muted" | "accent" | "onAccent" | "hairline" | "none";
export type ContrastGuard = "off" | "auto";

export type BackgroundTreatmentSpec =
  | { readonly kind: "flat" }
  | { readonly kind: "gradient"; readonly to: ColourRole; readonly angle: 0 | 45 | 90 | 135 | 180 }
  | { readonly kind: "grid"; readonly cell: SpaceStep; readonly weight: StrokeStep; readonly intensity: Intensity }
  | { readonly kind: "dots"; readonly cell: SpaceStep; readonly size: StrokeStep; readonly intensity: Intensity };

export type BackgroundSpec = {
  readonly fill: ColourRole;
  readonly treatment: BackgroundTreatmentSpec;
};

/* ── 3. Page skeleton ─────────────────────────────────────────────────── */

export type RegionName = "bleed" | "topRail" | "body" | "paneA" | "paneB" | "bottomRail";
export type Align = "left" | "center" | "right";
export type StackAnchor = "start" | "center" | "end";
export type Distribute = "packed" | "spaceBetween";
export type Anchor9 =
  | "topLeft" | "top" | "topRight"
  | "left" | "center" | "right"
  | "bottomLeft" | "bottom" | "bottomRight";
export type AspectId = "1:1" | "4:5" | "3:2" | "16:9" | "fill";

export type GridSpec = {
  readonly margin: MarginStep;
  readonly columns: 6 | 8 | 12;
  readonly gutter: SpaceStep;
  readonly railHeight: { readonly top: SpaceStep; readonly bottom: SpaceStep };
  readonly railGap: SpaceStep;
};

export type FillResponse = {
  readonly crowdedAbove: Fraction;
  readonly sparseBelow: Fraction;
  readonly centreBias: Fraction;
};

export type RegionSplit = {
  readonly axis: "x" | "y";
  readonly at: 3 | 4 | 5 | 6 | 7 | 8 | 9;
  readonly gutter: SpaceStep;
};

export type RegionSpec = {
  readonly members: readonly SlotName[];
  readonly anchor: StackAnchor;
  readonly sparseAnchor: StackAnchor;
  readonly distribute: Distribute;
  readonly gap: Gap;
  readonly align: Align;
  readonly inset: SpaceStep;
  readonly fill: FillResponse;
  readonly split: RegionSplit | null;
};

/* ── 4. Type ──────────────────────────────────────────────────────────── */

export type TypeSheet = {
  readonly steps: readonly number[];
  readonly floor: StepIndex;
  readonly uniform: boolean;
  readonly uniformFloor: number;
};

export type SizeRule =
  | { readonly mode: "fixed"; readonly step: StepIndex }
  | { readonly mode: "shrink"; readonly from: StepIndex; readonly to: StepIndex };

export type LeadingRule =
  | { readonly mode: "optical" }
  | { readonly mode: "fixed"; readonly ratio: number };

export type TypeStyle = {
  readonly face: "display" | "body";
  readonly size: SizeRule;
  readonly leading: LeadingRule;
  readonly tracking: "inherit" | number;
  readonly case: "inherit" | "none" | "upper";
  readonly weight: "inherit" | 400 | 500 | 600 | 700;
  readonly measure: number | null;
  readonly maxLines: number | null;
  readonly balance: boolean;
};

export type WidthSpec =
  | { readonly mode: "column" }
  | { readonly mode: "span"; readonly start: number; readonly span: number }
  | { readonly mode: "hug"; readonly padX: SpaceStep };

/* ── 5. Content routing ───────────────────────────────────────────────── */

export type BlockType = "heading" | "paragraph" | "list" | "quote" | "label";
export type Take = "first" | "all" | "rest";

export type ContentBinding =
  | {
      readonly from: "blocks";
      readonly accepts: readonly BlockType[];
      readonly take: Take;
      readonly part: "text" | "items" | "attribution";
    }
  | { readonly from: "brand"; readonly field: "handle" | "logo" }
  | { readonly from: "deck"; readonly field: "index" | "count" }
  | { readonly from: "asset" };

export type IfEmpty = "collapse" | "reserve" | "hideRegion";

/* ── 6. Slots ─────────────────────────────────────────────────────────── */

export type TextSlot = {
  readonly kind: "text";
  readonly content: ContentBinding;
  readonly ifEmpty: IfEmpty;
  readonly width: WidthSpec;
  readonly align: "inherit" | Align;
  readonly colour: ColourRole;
  readonly contrast: ContrastGuard;
  readonly type: TypeStyle;
  readonly paraGap: Gap;
  readonly gapBefore: Gap | null;
  readonly prefix: string;
  readonly suffix: string;
};

export type IconId =
  | "arrow-right" | "arrow-down" | "arrow-up-right" | "chevron-right"
  | "check" | "x" | "plus" | "minus" | "dot" | "star"
  | "heart" | "bookmark" | "flag" | "zap"
  | "circle" | "square" | "triangle" | "diamond"
  | "quote" | "info" | "alert" | "lightbulb" | "target" | "clock";

export type MarkerSpec =
  | { readonly kind: "none" }
  | { readonly kind: "dot"; readonly size: EmStep; readonly colour: ColourRole }
  | { readonly kind: "dash"; readonly length: EmStep; readonly weight: StrokeStep; readonly colour: ColourRole }
  | { readonly kind: "number"; readonly colour: ColourRole; readonly weight: "inherit" | 400 | 500 | 600 | 700 }
  | { readonly kind: "icon"; readonly glyph: IconId; readonly size: EmStep; readonly colour: ColourRole };

export type CountBand = {
  readonly maxItems: number | null;
  readonly sizeShift: number;
  readonly gap: Gap;
  readonly columns: 1 | 2;
};

export type RepeatSlot = {
  readonly kind: "repeat";
  readonly content: ContentBinding;
  readonly ifEmpty: IfEmpty;
  readonly width: WidthSpec;
  readonly align: "inherit" | Align;
  readonly colour: ColourRole;
  readonly contrast: ContrastGuard;
  readonly type: TypeStyle;
  readonly gap: Gap;
  readonly gapBefore: Gap | null;
  readonly marker: MarkerSpec;
  readonly markerGap: EmStep;
  readonly hangingIndent: boolean;
  readonly columns: 1 | 2;
  readonly byCount: readonly CountBand[];
};

export type ImageTreatment =
  | { readonly kind: "none" }
  | { readonly kind: "duotone"; readonly from: ColourRole; readonly to: ColourRole };

export type ImageSlot = {
  readonly kind: "image";
  readonly content: ContentBinding;
  readonly ifEmpty: IfEmpty | "placeholder";
  readonly width: WidthSpec;
  readonly aspect: AspectId;
  readonly fit: "cover" | "contain";
  readonly focal: Anchor9;
  readonly radius: RadiusStep;
  readonly treatment: ImageTreatment;
  readonly gapBefore: Gap | null;
  readonly maxHeight: SpaceStep | null;
};

export type SlotByName = {
  readonly label: TextSlot;
  readonly title: TextSlot;
  readonly body: TextSlot;
  readonly quote: TextSlot;
  readonly attribution: TextSlot;
  readonly handle: TextSlot;
  readonly number: TextSlot;
  readonly list: RepeatSlot;
  readonly image: ImageSlot;
  readonly logo: ImageSlot;
};
export type SlotName = keyof SlotByName;
export type SlotSpec = SlotByName[SlotName];
export type SlotStyles = { readonly [K in SlotName]: SlotByName[K] };

export type TypePatch = { readonly [K in keyof TypeStyle]?: TypeStyle[K] | undefined };

export type SlotPatch<T> = {
  readonly [K in keyof T]?: (K extends "type" ? TypePatch : T[K]) | undefined;
};
export type RoleSlots = { readonly [K in SlotName]?: SlotPatch<SlotByName[K]> | undefined };

/** Arrangements may restyle a slot but never re-route it or move it between regions. */
export type ArrangeSlotPatch<T> = SlotPatch<Omit<T, "kind" | "content" | "ifEmpty">>;
export type ArrangeSlots = {
  readonly [K in SlotName]?: ArrangeSlotPatch<SlotByName[K]> | undefined;
};

export type RegionPatch = {
  readonly [K in keyof RegionSpec]?: RegionSpec[K] | undefined;
};
export type ArrangeRegionPatch = {
  readonly [K in keyof Omit<RegionSpec, "members" | "split">]?: RegionSpec[K] | undefined;
};

/* ── 7. Decoration ────────────────────────────────────────────────────── */

export type DecorLength =
  | { readonly mode: "fixed"; readonly step: SpaceStep }
  | { readonly mode: "match" }
  | { readonly mode: "column" };

export type Mark =
  | {
      readonly kind: "divider";
      readonly orientation: "h" | "v";
      readonly length: DecorLength;
      readonly weight: StrokeStep;
      readonly radius: RadiusStep;
    }
  | {
      readonly kind: "plate";
      readonly padX: SpaceStep;
      readonly padY: SpaceStep;
      readonly radius: RadiusStep;
    }
  | { readonly kind: "dot"; readonly size: SpaceStep }
  | {
      readonly kind: "icon";
      readonly glyph: IconId;
      readonly size: SpaceStep;
      readonly stroke: StrokeStep;
    };

export type Attach = {
  readonly to: { readonly region: RegionName } | { readonly slot: SlotName };
  readonly edge: "top" | "bottom" | "left" | "right";
  readonly side: "inside" | "outside" | "behind";
  readonly gap: Gap;
  readonly from: "box" | "cap" | "baseline";
  readonly align: "start" | "center" | "end" | "match";
};

export type DecorSpec = {
  readonly id: DecorId;
  readonly mark: Mark;
  readonly attach: Attach;
  readonly colour: ColourRole;
  readonly requires: SlotName | null;
  readonly optional: boolean;
};

export type DecorPatch = {
  readonly mark?: Mark | undefined;
  readonly attach?: Attach | undefined;
  readonly colour?: ColourRole | undefined;
  readonly optional?: boolean | undefined;
};

/* ── 8. Conditional layer ─────────────────────────────────────────────── */

export type ContentMeasure = "chars" | "words" | "blocks" | "items";
export type ContentFlag = "label" | "attribution" | "image" | "handle" | "heading" | "ordered";

export type ContentQuery =
  | {
      readonly measure: ContentMeasure;
      readonly of: SlotName | "slide";
      readonly lt?: number | undefined;
      readonly gte?: number | undefined;
    }
  | { readonly has: ContentFlag; readonly is: boolean };

export type Arrangement = {
  readonly id: string;
  readonly name: string;
  readonly when: ContentQuery;
  readonly slots: ArrangeSlots;
  readonly regions: { readonly [R in RegionName]?: ArrangeRegionPatch | undefined };
  readonly decor: { readonly [id: string]: DecorPatch | undefined };
};

/* ── 9. Reflow ────────────────────────────────────────────────────────── */

export type ReflowMove =
  | { readonly move: "tighten" }
  | { readonly move: "shrink"; readonly slot: SlotName }
  | { readonly move: "drop"; readonly decor: DecorId }
  | { readonly move: "widen" }
  | { readonly move: "columns"; readonly slot: "list" }
  | { readonly move: "unreserve" }
  | { readonly move: "eatRail"; readonly rail: "topRail" | "bottomRail" }
  | { readonly move: "offerSplit" };

export type OverflowMove = { readonly move: "overflow" };
export type Reflow = readonly [...ReflowMove[], OverflowMove];

/* ── 10. Invariants ───────────────────────────────────────────────────── */

export type Invariants = {
  readonly neverCrossMargin: true;
  readonly neverTruncate: true;
  readonly minContrast: { readonly text: number; readonly largeText: number; readonly decor: number };
  readonly centreVetoOverLines: number | null;
  readonly accentFill: readonly SlideRole[];
  readonly maxDecorPerSlide: number;
  readonly feedScale: Fraction;
};

/* ── 11. Roles and template ───────────────────────────────────────────── */

export type RoleSpec = {
  readonly regions: { readonly [R in RegionName]: RegionSpec };
  readonly background: BackgroundSpec | null;
  readonly slots: RoleSlots;
  readonly decor: readonly DecorSpec[];
  readonly sink: SlotName;
  readonly arrangements: readonly Arrangement[];
  readonly reflow: Reflow;
};

export type PageSpec = {
  readonly grid: GridSpec;
  readonly background: BackgroundSpec;
  readonly type: TypeSheet;
  readonly slotStyles: SlotStyles;
  readonly invariants: Invariants;
};

export type StructuralAxis = "anchor" | "centre" | "divider" | "image" | "numbering" | "fill";

export type Template = {
  readonly schema: 1;
  readonly id: TemplateId;
  readonly name: string;
  readonly version: number;
  readonly teaches: StructuralAxis;
  readonly origin:
    | { readonly kind: "starter" }
    | { readonly kind: "user"; readonly from: TemplateId | null };
  readonly demoSource: string;
  readonly page: PageSpec;
  readonly roles: { readonly [R in SlideRole]: RoleSpec };
};

/* ── 12. Validation ───────────────────────────────────────────────────── */

export type IssueCode =
  | "schema-shape" | "missing-role" | "reflow-missing-terminal"
  | "sink-not-in-body" | "sink-not-rest"
  | "duplicate-slot-member" | "duplicate-decor-id"
  | "decor-requires-absent-slot" | "decor-target-absent"
  | "rail-illegal-member" | "bleed-illegal-member"
  | "split-body-not-empty" | "pane-without-split"
  | "span-out-of-grid" | "size-window-inverted" | "step-below-floor"
  | "arrangement-limit" | "hug-on-wrapping-slot"
  | "unknown-slot" | "unknown-decor" | "demo-missing-role";

export type TemplateIssue = {
  readonly code: IssueCode;
  readonly role: SlideRole | null;
  readonly at: string | null;
  readonly detail: string;
};

export type ValidationResult = {
  readonly ok: boolean;
  readonly template: Template | null;
  readonly issues: readonly TemplateIssue[];
};

export declare function validateTemplate(raw: unknown): ValidationResult;

/* ── 13. Assets ───────────────────────────────────────────────────────── */

export type ImageAsset = {
  readonly id: AssetId;
  readonly src: string;
  readonly intrinsic: { readonly w: number; readonly h: number };
  readonly bytes: number;
};

/* ── 14. Emission ─────────────────────────────────────────────────────── */

export type ZBand = "root" | "background" | "media" | "scrim" | "decor" | "content" | "furniture";
export type NodeKind = "group" | "rect" | "line" | "icon" | "image" | "text";

export type LayoutNode = {
  readonly id: string;
  readonly kind: NodeKind;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly z: number;
  readonly band: ZBand;
  readonly parentId?: string | undefined;
  readonly slot?: SlotName | undefined;
  readonly decorId?: DecorId | undefined;
  readonly color: string;
  readonly fill?: string | undefined;
  readonly radius?: number | undefined;
  readonly text?: string | undefined;
  readonly lines?: readonly string[] | undefined;
  readonly fontSize?: number | undefined;
  readonly lineHeight?: number | undefined;
  readonly weight?: number | undefined;
  readonly tracking?: number | undefined;
  readonly align?: Align | undefined;
  readonly family?: "sans" | "serif" | "mono" | undefined;
  readonly uppercase?: boolean | undefined;
  readonly strokeWidth?: number | undefined;
  readonly glyph?: IconId | undefined;
  readonly src?: string | undefined;
  readonly objectFit?: "cover" | "contain" | undefined;
  readonly objectPosition?: { readonly x: Fraction; readonly y: Fraction } | undefined;
  readonly duotone?: { readonly from: string; readonly to: string } | undefined;
  readonly gradient?: { readonly from: string; readonly to: string; readonly angle: number } | undefined;
  readonly pattern?:
    | {
        readonly kind: "grid" | "dots";
        readonly cell: number;
        readonly weight: number;
        readonly color: string;
      }
    | undefined;
  readonly blockId?: string | undefined;
  readonly itemIndex?: number | undefined;
  readonly overflow?: "height" | "lines" | undefined;
};

export type Format = { readonly w: number; readonly h: number };

/** Deck-resolved size steps, keyed "role:slot". */
export type DeckSizes = Readonly<Record<string, StepIndex>>;

export type LayoutInput = {
  readonly template: Template;
  readonly slide: Slide;
  readonly brand: BrandKit;
  readonly format: Format;
  readonly index: number;
  readonly count: number;
  readonly assets: Readonly<Record<AssetId, ImageAsset>>;
  readonly deck: DeckSizes | null;
};

export declare function computeLayout(input: LayoutInput): readonly LayoutNode[];

export declare function computeDeckLayout(
  template: Template,
  slides: readonly Slide[],
  brand: BrandKit,
  format: Format,
  assets: Readonly<Record<AssetId, ImageAsset>>,
): readonly (readonly LayoutNode[])[];
```

### 2.1 Changes to `src/doc/types.ts`

```ts
/** BrandKit v2 — VALUES only. Geometry moved to the template. */
export type BrandKit = {
  palette: { background: string; text: string; accent: string; muted: string };
  type: { display: TypeRoleSpec; body: TypeRoleSpec };
  handle: string;
  logo: ImageAsset | null;          // the asset; the template owns its box
};
// REMOVED: safeMargin, background, handlePlacement.

export type FlashCCDocument = {
  version: 2;                       // was 1
  id: string;
  name: string;
  format: FormatId;
  granularity: Granularity;
  source: string;
  brandKit: BrandKit;
  template: Template;                                   // embedded SNAPSHOT
  templateSource: { id: TemplateId; version: number } | null;  // provenance
  assets: Record<AssetId, ImageAsset>;                  // document-level image store
  slides: Slide[];
  createdAt: string;
  updatedAt: string;
};

export type Slide = {
  id: string;
  role: SlideRole;
  roleOverride?: SlideRole | undefined;
  blocks: Block[];
  /** CONTENT, not geometry — the same category as text. Explicit change to
   *  document-schema.md §2 and role-layouts.md §5; both docs get edited. */
  images?: Partial<Record<"image", AssetId>> | undefined;
};
```

### 2.2 Template vs BrandKit — the division, with no overlap

| Concern | Owner | Precisely |
| --- | --- | --- |
| **Colour values** | **BrandKit** | the four hexes: `background`, `text`, `accent`, `muted`. Nothing else in the product stores a hex for a slide. |
| **Colour usage** | **Template** | every `ColourRole` reference. `onAccent` and `hairline` are *derived* from the kit at resolve time and are not authored anywhere. |
| **Font face, weight, tracking, case** | **BrandKit** | the two `TypeRoleSpec`s (`display`, `body`). |
| **Which face a slot uses** | **Template** | `type.face: "display" \| "body"`. |
| **Font size, leading, measure, maxLines, balance** | **Template** | the whole `TypeSheet` + per-slot `TypeStyle`. `tracking`/`case`/`weight` are `"inherit"` by default and may be overridden per slot. |
| **Safe margin, rails, columns, gutter** | **Template** | `page.grid`. Removed from BrandKit. |
| **Background fill + treatment** | **Template** | `page.background`, patchable per role. Removed from BrandKit. |
| **Handle text** | **BrandKit** | it is content the user typed. |
| **Handle placement** | **Template** | which region lists `handle` as a member, plus that region's `align`. The four-corner enum is retired — it only ever resolved to (rail × align). |
| **Logo file** | **BrandKit** | `logo: ImageAsset \| null`. |
| **Logo box, aspect, fit, position** | **Template** | the `logo` slot. |
| **Per-slide images** | **Document** | `doc.assets` + `slide.images`. The template owns the *box*; the document owns the *file*. |
| **Overflow policy** | **Neither** | engine behaviour. Not authorable, by design. |

---

## 3. `computeLayout` contract

### 3.1 Signature

```ts
computeLayout(input: LayoutInput): readonly LayoutNode[]
computeDeckLayout(template, slides, brand, format, assets): readonly (readonly LayoutNode[])[]
```

One object argument (the old four positional params were already at the limit). Call sites to change: `SlideStage.tsx:172`, `Filmstrip.tsx:84`, `ExportSheet.tsx:80`, plus the new `TemplateEditor`.

### 3.2 The nine passes — one-way, no solver, no cycles

| # | Pass | Does | Reads |
| --- | --- | --- | --- |
| 0 | `resolve` | `page ⊕ role ⊕ first matching arrangement`. Shallow patch per named field, one nested level for `type`. Resolve grid → region boxes from `format`. Resolve colour roles → hexes. | template, brand, format |
| 1 | `route` | Blocks → slots by `accepts`/`take`, walked in (region order, member order). Leftovers → `role.sink`. Apply `ifEmpty`. | slide.blocks |
| 2 | `measure` | Bottom-up intrinsic sizes. Each slot walks its derived ladder against a budget = region height − reserved siblings − **nominal** gaps (computed from each slot's top step, an upper bound). | fit.ts + metrics |
| 3 | `reflow` | If deficit > 0, walk `role.reflow`; re-run pass 2 after each applied move. Skip any move that does not strictly reduce the deficit. Cap `2 × reflow.length`. Terminal = `overflow`. | — |
| 4 | `regap` | Recompute gaps from *fitted* sizes. Gaps can only shrink (sizes only shrank), so the group only gets shorter. No re-fit, no cycle. | — |
| 5 | `place` | Regions top-down. `fill = groupH/regionH` → `crowdedAbove` / `sparseBelow` / `anchor` / `sparseAnchor` / `centreBias`; then `distribute`, then `align`. Emits region group boxes. | — |
| 6 | `snap` | Baseline-snap each region's **first** baseline to a 12px grid, group-first only. **Before attach** — snapping after attach would orphan every attached mark. | metrics |
| 7 | `attach` | Decor resolved against final slot boxes: `edge`/`side`/`gap`/`from`/`align`. | — |
| 8 | `finish` | Contrast guard resolves final colours; centre veto flips `textAlign` where lines > N. Assertions only: margin containment, `accentFill`, `maxDecorPerSlide`. None of these changes a box, so none can cycle. | — |
| 9 | `emit` | Stable sort by `(band, authoring index)`; parents always precede children. | — |

**One declared coupling, stated rather than hidden:** pass 2's budget must subtract the extent of any `side:"outside"` decor attached to a slot in that stack (e.g. the cover's divider: `gap 32 + weight 6 = 38px`). That extent is static for `length:"fixed"|"column"` and is computed from the mark spec alone; `length:"match"` decor is *always* `side:"behind"` or attached on a horizontal edge, so it never consumes vertical budget. The engine therefore computes `decorReserve(slotId)` in pass 0 and passes it into pass 2. No later pass feeds a value backwards.

### 3.3 New node kinds

| Kind | Renders as | Fields used |
| --- | --- | --- |
| `group` | **nothing** — a box only | `x,y,w,h,parentId,band:"root"` |
| `rect` | absolutely positioned `div` | `fill,radius`, plus `gradient` / `pattern` on the background node |
| `line` | `div` for axis-aligned (all we allow) | `fill,strokeWidth,radius` |
| `icon` | inline `<svg>` from `src/render/icons.ts` path data | `glyph,strokeWidth,color` |
| `image` | `<img>` with a data URI | `src,objectFit,objectPosition,radius,duotone` |
| `text` | `div`, `white-space: pre-wrap` | `lines` (joined with `\n`), `text`, `fontSize,lineHeight,weight,tracking,align,family,uppercase,color,overflow` |

**`parentId` never dangles.** Every slide emits `${slide.id}:root` (a `group`) and one `group` per live region; every content node's `parentId` names a group that is present in the array. Repeat items emit a `group` per item. This is what `docs/architecture.md` §3 promised and the current `LayoutNode` does not have — added now, before the interpreter multiplies node kinds. Coordinates stay **absolute** (groups are metadata + phase-2 structure), so `SlideRenderer` remains a flat map and preview/export cannot drift.

**`z` and paint order.** `z = BAND_INDEX × 10000 + orderWithinBand`, with `root 0 · background 1 · media 2 · scrim 3 · decor 4 · content 5 · furniture 6`. Emitted array order **is** z-order, as `document-schema.md` §3 already promises. A 50-item list emits ~100 content nodes; the 10000 stride cannot collide.

**`lines`.** Every text node carries `lines: string[]` (the estimator's break decisions) **and** `text` (the unbroken string, used for editing). The renderer paints `lines.join("\n")` under `white-space: pre-wrap`, so a line the estimator broke correctly renders exactly, and a line it under-measured simply re-wraps in the DOM — one extra line, visible, never truncation. Constraint 3 holds in both directions. On edit commit, whitespace runs in the committed `textContent` are collapsed to single spaces before the document is mutated.

**Node ids** derive from `${slide.id}:${slotName}` / `${slide.id}:${slotName}#${i}` / `${slide.id}:decor:${decorId}` / `${slide.id}:region:${regionName}`. Never a counter, never `Date.now`, never `Math.random`.

### 3.4 Purity — the checklist review enforces

1. No DOM. No `useLayoutEffect` result feeding back into layout. No `document.fonts`.
2. No `Math.random`, no `Date.now`, no `Object.keys` iteration order affecting output — every emitted collection is explicitly sorted.
3. No viewport read, no percentage of anything but the format box, no `em`/`rem` in emitted values.
4. No expression evaluation. `when` and `reflow` are closed enums interpreted by a switch. A formula field would force phase 2 to ship an interpreter.
5. Image aspect comes from `ImageAsset.intrinsic` in the document — never from decoding a file.
6. `src/doc/**` imports nothing from `render/`, `app/`, `ui/`. `render/layout/**` imports no React.
7. Same inputs ⇒ byte-identical output, in Node and in the browser. This is asserted by a test, not assumed.

### 3.5 Phase-2 convertibility

| FlashFX layer needs | Comes from |
| --- | --- |
| position, size | `x,y,w,h` (absolute, already resolved) |
| z-order | `z` (array order equals it) |
| parent grouping | `parentId` → always resolves to an emitted `group` |
| text content | `text`; per-line stagger from `lines[]` without re-parsing |
| resolved type | `fontSize, lineHeight, weight, tracking, family, uppercase` |
| colour, fill, gradient, pattern | resolved hexes on the node |
| vector marks | `line` (`strokeWidth`), `icon` (`glyph` → path data in a pure table) |
| media | `src` (data URI), `objectFit`, `objectPosition`, `duotone` |
| canvas size | `format` |
| scene order | `slides[]` order |

The conversion stays a field rename. No browser, no scraping.

---

## 4. Content-adaptive behaviour

### 4.1 The fit estimator, fixed first

`src/render/layout/fit.ts` currently under-counts in three directions — all in the same direction, which defeats its own stated fail-safe intent:

1. `case:"upper"` is applied in CSS but the *lowercase* string is measured at 0.52em against a real caps advance of ~0.66em.
2. A token longer than `maxChars` is never broken, while the renderer sets `word-break: break-word`.
3. `text.split(/\s+/)` discards `\n`, while the renderer sets `white-space: pre-wrap`.

**fit v2** (a prerequisite, not polish):

- Sum **per-character advances** from `src/render/metrics/fontMetrics.ts`, plus `tracking × S` per character.
- Apply the `case` transform to the measured string **before** summing.
- Split on `\n` first; break any token wider than the column at the column edge.
- Multiply by an explicit `fitSlack = 1.02` — a declared, tunable safety margin rather than a fudge hidden in an average.
- Return `{ step, fontSize, lines: string[], height, overflow }`.

Three faces are bundled as self-hosted woff2 in `public/fonts` (one per `FontRole`: Inter / Source Serif 4 / JetBrains Mono, all OFL) and `SlideRenderer.FONT_STACK` stops using system stacks. Until this lands, export is not actually deterministic across machines, and `attach.from:"cap"|"baseline"`, x-height marker alignment and `hug` widths are unimplementable.

### 4.2 The fit ladder

For a slot with `size: {mode:"shrink", from: F, to: T}`, the ladder is `steps[F..T]` descending, clamped at `type.floor`. Walk it and take the first step where **both**:

- `height ≤ budget`, and
- `lines ≤ maxLines` (when `maxLines` is set).

Then the three tiers: if no step satisfies both, take the smallest step that satisfies height alone and set `overflow:"lines"`. If no step satisfies height either, take the smallest step and set `overflow:"height"`. **Height is the only hard constraint; a missed line target is a missed preference, never a reason to remove words.**

`measure` caps `maxWidth` at `measure × S × advance`, only ever narrowing. `balance` re-fits at 98%, 96%, 95% of the width and keeps the first result with the same line count and a last line carrying 2+ words.

`fitPolicy` for the `list` slot is **group**: all items resolve to one step. `role-layouts.md` §4 promises this and today's code does the opposite — it fits each item independently against `(bodyH − groupH)/items.length − 32`, so items can land at different sizes.

### 4.3 Distribution of leftover space

Let `fill = groupHeight / regionHeight`, computed after the fit.

| Condition | Behaviour |
| --- | --- |
| `fill > crowdedAbove` (0.92) | Force `anchor: "start"` and enter the reflow ladder. |
| `sparseBelow ≤ fill ≤ crowdedAbove` | Use `anchor`. If `anchor === "center"`, place at `centreBias` (0.44) of the free space, not 0.5. |
| `fill < sparseBelow` (0.55) | Use `sparseAnchor`. **A half-empty slide gets a decision, not a compromise.** |

Then `distribute`:

- `packed` — members are adjacent, separated by their gaps; the whole group is placed by the anchor.
- `spaceBetween` — member 0 pins to the region start, the remaining members pack at the region end. **One** slack point, for any member count. Slack is never spread evenly through every gap (which is what makes a deck look assembled).

Cross-axis: `align` positions the box; `type.align` positions text inside it; a centred box with left-aligned text is expressible, which the current code cannot do. A centred text block's box width is `widest fitted line × 1.02`, so a `length:"match"` divider aligns to the text rather than to the column.

### 4.4 Genuine overflow

The reflow ladder has already run and every bounded move is exhausted. Then:

- Render at the floor step. **Every word stays on the slide, visibly overflowing.**
- Set `LayoutNode.overflow = "height" | "lines"` — truthy, so `SlideRenderer`'s existing red marker keeps working unchanged.
- `SlideStage` shows the existing inline "Text does not fit · split this slide" line. No modal, no toast.
- A template cannot disable this. There is no `clip` and no `truncate` value anywhere in the schema.

The `offerSplit` move exists only to surface the split affordance *earlier* (before shrinking further) for roles where splitting is the honest answer — `body` and `list`.

### 4.5 A slot with no content

`ifEmpty` decides, and it is the highest-consequence field in the schema:

| Value | Effect |
| --- | --- |
| `collapse` | The slot occupies no height. Its `gapBefore` collapses with it. (Today's implicit behaviour.) |
| `reserve` | The box keeps its height at the slot's top step. Headings stay on one baseline across a deck; a `spaceBetween` cover keeps its geometry when a slide has no label. |
| `hideRegion` | The whole region collapses. An empty top rail returns its 72px to the body. |
| `placeholder` (image only) | Emits an empty panel in `hairline` — the template editor's resting state, with no second code path. |

`requires` does the same job for decor: the cover's accent divider is emitted only when `title` resolved to content, which fixes the floating-bar bug.

### 4.6 Deck cohesion

`computeDeckLayout` calls the pure per-slide function twice.

- **Pass 1** collects the chosen step index `Oᵢ` per `(role, slot)` key across every slide.
- **Deck index** `D = min( max(Oᵢ), min(Oᵢ) + uniformFloor )`.
- **Pass 2** forces each slide to `max(D, Oᵢ)`.

So the majority land on one size; a slide that genuinely needs to be smaller stays smaller (and never overflows because of the deck rule); and one 400-character outlier cannot drag every heading in the deck down more than `uniformFloor` steps. Verified behaviour: `O = [7,8,13]`, floor 2 → `D = 9` → rendered `[9,9,13]`.

Three body slides of 180/260/400 characters currently fit at 40/36/32px independently. In a feed swipe that reads as three different templates. This is the single largest "looks generated" factor and it is invisible in a per-slide preview.

### 4.7 Worked example — one template, four content shapes

Portrait 4:5 (1080×1350), template **Anchored**. Grid resolves to margin 81, rails 72/72, railGap 48 → topRail y 81, **body y 201 h 948**, bottomRail y 1197, content column x 81 w 918. Byte-identical to today's `grid()`.

**Cover, 66-char heading** ("Most founders write great posts and then let them die in the feed."). Routed to `title`; no label, so `label` collapses. Budget = 948 − decorReserve 38 = 910. Walking the window with the repo's own `countLines` at tracking −0.02: **96px → 19 chars/line → 4 lines → h 414.7** ≤ 910, and 4 ≤ `maxLines 5`. Step 0 on the first try. `fill = 0.44 < sparseBelow`… Anchored sets `cover.sparseBelow = 0`, so `anchor:"end"` applies: `titleY = 201 + 948 − 414.7 = 734.3`. The divider attaches to the title's **cap** line, 32 above → `y ≈ 696`, 120×6 accent. Handle bottom-left, swipe icon bottom-right. **6 nodes** (root group, bg rect, body region group, divider, title, handle, swipe = 7).

**Cover, 22-char heading** ("Stop designing slides."). Arrangement `short` fires (`chars < 40`): the divider becomes `length:"column"` (a full-width rule) and `measure` tightens to 18. **96px → 2 lines → h 207.4**, still bottom-anchored at y 941.6, with 733px of deliberate void above it. *Nothing changed but two patched fields; the anchor did the rest.*

**Cover, 377-char heading.** Arrangement `long` fires (`chars ≥ 160`): window 2→4, measure 40, maxLines 6. No step lands within 6 lines, so tier 2 applies — the smallest step (56px) fits by height, `overflow` is **not** set, and not one word is removed. The author sees the line count in the stress preview, where fixing it is cheap.

**List, 5 items + heading.** `byCount` band 3 (`maxItems 6`) → window shifts one step smaller, gap `em 3`. Heading 48px/1 line/h 55.2. All five items resolve to **one** step (32px) — verified, every item is one line at 862px wide. Group = 55.2 + 33.6 + 5×43.2 + 4×27.2 = 413.6; `fill = 0.44 < 0.55` → `sparseAnchor:"start"`, so the list reads from the top of the body zone instead of floating mid-slide. Markers are 0.28em dots (9px at 32px, and they scale with the step), placed at the x-height centre from face metrics — not `fontSize × 0.45`.

**List, 12 long items.** Open `byCount` band → two steps smaller, gap `em 2`. Still over. Reflow walks: `tighten` (gaps × 0.6) → still over; `shrink list` → still over; `columns list → 2` → fits. Three bounded moves, nothing cut, and `offerSplit`/`overflow` are never reached.

---

## 5. The template editor

**Screen budget, written down before the first component** (this becomes `docs/interaction-principles.md` Part 4b, alongside the editor's 8 and Home's ≤4): **the template editor is capped at 5 counted controls at rest and 7 contextual.** Every addition spends from the same budget the editor screen is held to.

Everything obeys the existing rhythm: 28px control height, 14px lucide glyph in a 28px hit box, `--text-tertiary` at rest → `--text-primary` on hover → `--accent` when active, 0ms on hover/selection/focus, 120ms opacity only on hover-revealed things, one accent used once (the Save button is the single brand-gold hero on this screen).

### 5.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 44px  ◇ FlashCC   [ Template name ]                        [ Save ]      │  ← 2 controls
├────────────┬─────────────────────────────────────────┬───────────────────┤
│  Page      │                                         │                   │
│  Cover  ●  │        (live SlideRenderer, k≈0.4)      │   INSPECTOR       │
│  Body      │                                         │   empty until     │
│  List      │                                         │   something is    │
│  Quote     │                                         │   selected        │
│  CTA       │   Short · Typical · Long   ← 1 control  │   (R2)            │
│            │   "Long: 2 lines over"     ← static     │                   │
│  ← 1 ctrl  │                                    [+]  ← 1 control (Add)   │
└────────────┴─────────────────────────────────────────┴───────────────────┘
```

### 5.2 Resting controls — **5**

| # | Control | Type | Writes |
| --- | --- | --- | --- |
| 1 | Tab strip: `Page · Cover · Body · List · Quote · CTA` | 6-way segmented, 28px | which surface is shown. It can never grow past six screens, because the roles are fixed by hard constraint 6 — so **authoring a template teaches what a role is as a side effect of its own structure**. |
| 2 | Specimen: `Short · Typical · Long` | 3-way segmented | which stress sample the preview renders |
| 3 | Add | icon button (`Plus`) opening a closed list | inserts a slot / divider / icon / image area |
| 4 | Template name | text field, chrome hidden until hover | `template.name` |
| 5 | Save | brand-gold hero button | writes to the library, returns to Home |

Not counted: the preview (content, same rule that exempts the canvas and thumbnails), the fit readout (static text), the six starter cards on Home (content).

### 5.3 Contextual — a slot is selected: **6 rows, max**

The inspector is **empty** until a click. All rows 28px, all segmented controls or swatch rows. **There is not one numeric field and not one colour picker in this editor.**

| Row | Control | Writes |
| --- | --- | --- |
| Where | `Top rail · Body · Bottom rail` + a 3-button anchor `Top · Middle · Bottom` | moves the name between `regions[*].members`; `anchor` |
| When there's little | `Sit high · Centre · Sit low` | `sparseAnchor` — **the most output-per-control in the whole product** |
| Width | `Half · Two-thirds · Full · Hug` | `WidthSpec` (four presets over `span`/`hug`/`column`) |
| Size | `− ▪ +` stepper on the window, with the resolved px shown as static text | `size.from` / `size.to` on the shared ladder |
| Colour | four swatches previewing the **current brand kit** | `colour: ColourRole` — visibly a different control from the brand kit's picker, so the two never read as duplicates |
| Show when | `Always · If present · Keep the space` | `ifEmpty` |

Rows appear only where they apply — `Size` never on an image, `Width` never on the number slot. Selecting a **region** shows 4 rows instead: `Anchor`, `Spacing` (Tight · Normal · Loose), `Alignment`, `Split` (None · Image left · Image top · Text/text).

### 5.4 The Page tab — **7 controls**

Shown *instead of* the inspector, not in addition. These change all five roles at once, which is what makes a tiny editor feel powerful.

Margin (3 steps) · Columns (6/8/12) · Background (Solid · Gradient · Grid · Dots + a 5-stop **perceptual** intensity) · Type scale (5 ladder presets) · One type size across the deck (checkbox → `uniform`) · Accent as a fill on (single-select role → `accentFill`) · **When text is long** — the reflow ladder.

**The reflow ladder is the "rules for procedural generation" surface, and it is a drag-reorderable list of plain-English cards** — never a condition builder, an operator dropdown, or a formula field:

```
  ≡  Tighten the spacing
  ≡  Make the list smaller
  ≡  Put the list in two columns
  ≡  Drop the accent line
  ≡  Offer to split the slide
     Show it overflowing              ← greyed, fixed, cannot be removed or reordered
```

That last card makes the never-truncate guarantee **legible in the UI**, not only in a tuple type — which matters precisely because the tuple type is erased the moment a template becomes JSON.

Arrangements appear on each *role* tab as a two-row table with a threshold stepper and a plain-English name ("Short hook — go big", "5–6 items — compact"), capped at two per role. The `ContentQuery` is never rendered as syntax.

**Max simultaneous controls on screen: 11** (5 resting + 6 slot rows) or **12** (5 + Page tab).

### 5.5 "Text position" without coordinates

The user asked for text position and an anchor picker can read as a refusal. So: **drag on the preview is a legal input gesture.** It snaps to the 3 regions × 3 anchors × 3 alignments and the inspector rows update live, Figma-style bidirectionally. What gets **stored** is always the enum. If drag ever stores pixels, the format switcher, the fit ladders and the phase-2 converter degrade at once — so this is enforced structurally by the schema simply not having an `x` or a `y`.

### 5.6 Live preview with sample content

- The preview is the **real** `SlideRenderer` over the **real** `computeLayout`, in the same `transform: scale()` wrapper `SlideStage` uses. Never a mock. A second preview path is exactly the drift D1 exists to prevent.
- `src/doc/specimens.ts` supplies three canned slides per role. The **Long** specimen is derived from the splitter's own constants (`src/doc/split.ts` THRESHOLDS: 520 / 420 / 220) so the stress case is by construction the worst case the splitter can emit — not a guess that confers false confidence.
- Under the preview sits a **static fit readout** covering all three specimens at once, even when only one is shown: `Short ✓ · Typical ✓ · Long: 2 lines over`. It is text, not a control, and it is the highest-leverage thing in the editor: no prior art previews two content lengths, and a template that looks perfect on "Click to edit Master title style" is exactly the template that breaks on a 400-character body.
- The Add menu's "add a line" immediately asks **"attached to what?"** — one extra question that makes every subsequent slide correct.

### 5.7 Controls deliberately REFUSED

This list goes in `docs/template-editor.md` as the counterpart to `role-layouts.md` §5. Additions to it get the same scrutiny as breaking an architecture invariant. Every item is something a competitor ships and every one would convert FlashCC into a worse Figma.

| Category | Refused | Why |
| --- | --- | --- |
| Geometry | x/y fields · drag that stores pixels · nudge keys · rotation · per-slot z-order · a layers tree · nesting past region → slot · per-format overrides | a coordinate is correct for exactly one content length; nesting makes "where will this go?" unanswerable in a six-row inspector |
| Type | font size in px · line-height control · per-slot family · a third type role · more than one alignment per role · italic/underline/small-caps | the ladder + two brand faces are what stop a template drifting out of proportion with itself |
| Colour | literal hex anywhere · opacity sliders · shadows · blur · blend modes · gradients as slot fills · a fifth palette slot | a hex in a template kills brand lock silently, and the failure is invisible until someone swaps a palette |
| Overflow | clip · hide overflow · max-lines + ellipsis · "do not autofit" · anything that can make text disappear | hard constraint 3. Made unrepresentable, not discouraged |
| Content | author-typed copy in the template · two headings in one role · slots for block types the document model lacks | all copy comes from the document; a free text box kills the phase-2 converter |
| Rules | condition builders · operators · formula fields · scripting · custom predicates | this is the phrase in the brief most likely to grow into a language, and that is the one change that makes phase 2 impossible |
| Decoration | a searchable icon library · SVG upload · bezier/polygon shapes · image filters · crop handles · a scrim over an image | 24 glyphs is a set; a library is a second product. A scrim cannot reach 4.5:1 without destroying the photo |
| System | per-slide template overrides · more than one template per document · animation · a layout picker separate from the role control | hard constraint 4; role *is* the layout |

---

## 6. The six starter templates

Each demonstrates exactly **one** structural axis, enforced by `Template.teaches` being a distinct value per starter (a 6-tuple check in the library index). Six recolours of one layout would teach that templates are a palette picker, and the user would correctly conclude nothing was added. All six share the same ten slots and the same five roles; they differ in **skeleton, anchor, decoration, and type ladder**.

Shared across all six unless stated: `invariants` = `{minContrast:{text:4.5,largeText:3,decor:1.35}, centreVetoOverLines:3, accentFill:["cta"], maxDecorPerSlide:2, feedScale:0.4}`; `sink` = `body` (`list` for the list role, `quote` for quote); every `reflow` ends in `{move:"overflow"}`.

---

### 1 · **Anchored** — `teaches: "anchor"`
*Confident and quiet. Content rises from the bottom; empty space accumulates above it on purpose.* **This is the migration target: it reproduces today's design.**

| | |
| --- | --- |
| grid | margin `default` (.075 → 81) · columns 12 · gutter 2 · railHeight `{top:9, bottom:9}` (72/72) · railGap 7 (48) |
| background | `{fill:"bg", treatment:{kind:"flat"}}` — no per-role override |
| ladder | `[96,84,72,64,56,48,44,40,36,32,30,28,26,24]` floor 13 · uniform **on**, uniformFloor 2 |
| leading | `fixed` throughout: title 1.08 · cta 1.10 · quote 1.20 · heading 1.15 · body 1.40 · list 1.35 |
| windows | title 0→4 (cover) / 5→7 (body,list) / 2→4 (cta) · quote 3→6 · body 7→11 · list 8→13 · label,number fixed 13 · handle fixed 12 · attribution fixed 11 |
| cover | body region `members:["label","title"]`, `anchor:"end"`, `sparseAnchor:"end"`, `distribute:"spaceBetween"`, `align:"left"`; bottomRail `["handle"]` |
| body / list | body region `anchor:"center"`, `centreBias 0.5`; topRail `["number"]` align right; bottomRail `["handle"]` align left. `list.sparseAnchor:"start"`, `sparseBelow 0.55` |
| quote | body `align:"center"`, `inset 11` (96), `members:["quote","attribution"]` |
| cta | body `align:"center"`, `members:["title","handle","body"]`; `handle` width `{hug, padX:7}` colour `onAccent` |
| decor | cover `accent`: divider, `length {fixed,12}` (120), weight 3 (6), radius 1, attach `{slot:"title", top, outside, gap:{space,5}, from:"cap", align:"start"}`, `requires:"title"` · cover `swipe`: icon `arrow-right` size 9 · quote `qrule`: divider `{fixed,10}` (80), align centre, `from:"cap"`, gap `{space,7}` · cta `plate`: plate `padX 7, padY 4, radius "pill"`, attach `{slot:"handle", behind}`, fill accent |
| arrangements | cover ×2: `short` (chars < 40 → `title.measure 18`, divider `length:"column"`), `long` (chars ≥ 160 → window 2→4, measure 40, maxLines 6) |
| reflow (cover) | `drop accent · shrink title · tighten · overflow` |

---

### 2 · **Stage** — `teaches: "centre"`
*One idea, dead centre, very large. No rails, no dividers, maximum air. Reads like a title card.*

| | |
| --- | --- |
| grid | margin `wide` (.10 → 108) · columns 6 · gutter 4 · railHeight `{top:0, bottom:9}` · railGap 9 (72) |
| background | flat `bg`; **cta role patches** `{fill:"accent", treatment:{kind:"flat"}}` — the whole last slide inverts |
| ladder | `[128,108,90,76,64,54,45,38,32,27,23,20]` floor 11 · uniform on |
| leading | `optical` throughout |
| windows | title 0→3 · quote 0→3 · body 4→7 · list 3→6 · handle fixed 9 |
| every role | body region `anchor:"center"`, `sparseAnchor:"center"`, `centreBias 0.44`, `align:"center"`, `gap {em,5}` (1.0em), `distribute:"packed"`; `type.align:"center"` on every slot; `measure` title 24, body 46 |
| topRail | **empty in every role** (`ifEmpty:"hideRegion"` on `number`, which is not a member) |
| bottomRail | `["handle"]` align centre |
| decor | **none anywhere** except cta `plate` (`padX 9, padY 5, radius "pill"`, behind `handle`, fill `bg`, text `accent` — inverted, because the whole slide is already accent) |
| list | marker `{kind:"none"}`, `hangingIndent:false`, items centred, `byCount` bands 1–2 large / 3–4 standard / 5+ compact |
| arrangements | cover ×1: `long` (chars ≥ 120 → window 3→5, `measure 34`, align stays centre — and the centre veto flips the *text* to left past 3 lines while the box stays centred) |
| reflow | `tighten · shrink title · shrink body · overflow` |

---

### 3 · **Ruled** — `teaches: "divider"`
*Editorial. Hairlines everywhere, top-anchored, tight margins, small confident type. A magazine spread, not a poster.*

| | |
| --- | --- |
| grid | margin `tight` (.05 → 54) · columns 12 · gutter 1 · railHeight `{top:7, bottom:7}` (48/48) · railGap 5 (32) |
| background | flat `bg` |
| ladder | `[72,64,56,48,42,38,34,30,27,24,22,20]` floor 11 · uniform on |
| leading | `fixed` 1.25 display, 1.45 body — generous, editorial |
| windows | title 2→4 · body 6→9 · quote 1→4 · list 6→9 |
| every role | body `anchor:"start"`, `sparseAnchor:"start"`, `align:"left"`, `gap {em,4}` (0.85em) |
| topRail | `["number","handle"]`, `distribute:"spaceBetween"` — number left, handle right, on **every** role including cover and quote |
| decor | `masthead` (all roles): divider, `length:{column}`, weight 0 (1px), colour `hairline`, attach `{region:"topRail", bottom, inside, gap:{space,4}}` · `underline` (all roles): divider, `length:{match}`, weight 1 (2px), colour `accent`, attach `{slot:"title", bottom, outside, gap:{em,2}, from:"baseline"}`, `requires:"title"` · quote adds a vertical `bar`: divider `orientation:"v"`, `length:{match}`, weight 1, attach `{slot:"quote", left, outside, gap:{space,4}}` |
| quote | `inset 5` only (32) — narrow-column signalling is done by the vertical bar, not by inset |
| list | marker `{kind:"dash", length:2, weight:0, colour:"muted"}`, `hangingIndent:true` |
| arrangements | body ×2: `dense` (chars ≥ 320 → body window 8→11, region gap `{em,2}`), `airy` (chars < 90 → body window 5→7) |
| reflow | `tighten · shrink body · drop underline · shrink title · offerSplit · overflow` |

---

### 4 · **Framed** — `teaches: "image"`
*Photography-led. A full-bleed duotone cover, and a picture beside the text on every content slide.*

| | |
| --- | --- |
| grid | margin `default` · columns 12 · gutter 2 · railHeight `{top:0, bottom:8}` · railGap 6 (40) |
| background | flat `bg` |
| ladder | `[104,88,74,62,52,44,38,32,28,24,21]` floor 10 · uniform on |
| cover | `bleed` region `members:["image"]`; image `aspect:"fill"`, `fit:"cover"`, `focal:"center"`, `treatment:{kind:"duotone", from:"bg", to:"text"}`, `ifEmpty:"placeholder"`. body region `["label","title"]`, `anchor:"end"`, `spaceBetween`; `title.contrast:"auto"`, `colour:"text"` |
| body / list | body region `split: {axis:"x", at:5, gutter:6}` → `paneA members:["image"]` (aspect `4:5`, radius 0), `paneB members:["title","body"]` `anchor:"center"`, `align:"left"`, `measure 42`. `body.members` is empty (validator requirement) |
| quote | no image. body region `align:"center"`, `inset 9` (72) |
| cta | `bleed ["image"]` with duotone; body `["title","handle"]` centred, `handle` on an accent `plate` |
| decor | cover `swipe` icon only. `maxDecorPerSlide: 1` |
| list | marker `{kind:"dot", size:0, colour:"accent"}`; `byCount` caps at 5 before two columns (the pane is narrow) |
| arrangements | body ×2: `noPicture` (`has:"image", is:false` → regions patch `paneB.align`/`inset`; the split collapses because `paneA` has no live member and `image.ifEmpty` is `collapse` in this role), `longText` (chars ≥ 320 → body window +2) |
| reflow | `tighten · shrink body · **unreserve** · shrink title · overflow` — `unreserve` moves the pane image behind the text with its duotone, which is the only contrast-provable way to reclaim that space |

---

### 5 · **Index** — `teaches: "numbering"`
*Numbered and systematic. A big numeral on every slide, numbered list markers, a faint grid. Looks like a reference card.*

| | |
| --- | --- |
| grid | margin `default` · columns 8 · gutter 2 · railHeight `{top:11, bottom:7}` (96/48) · railGap 5 (32) |
| background | `{fill:"bg", treatment:{kind:"grid", cell:9 (72), weight:0, intensity:2}}` — **perceptual** intensity, so the derived alpha is right on Ink (0.013) and Paper (0.178) alike |
| ladder | `[88,76,64,56,48,42,36,32,28,25,22,20]` floor 11 · uniform on |
| leading | `fixed` 1.15 display / 1.30 body — tight |
| topRail | `["number","handle"]`, `spaceBetween`; **`number` is display-size**: `type.face:"display"`, `size {fixed, 2}` (64px), `colour:"accent"`, `weight:700`, `ifEmpty:"reserve"` — a big numeral on every slide, cover included |
| every role | body `anchor:"start"`, `sparseAnchor:"start"`, `align:"left"`, `gap {em,3}` (0.7em) |
| cover | body `["label","title"]`, `anchor:"start"` (not bottom — this is Anchored's opposite pole); `label.case:"upper"`, tracking 0.08 |
| list | marker `{kind:"number", colour:"accent", weight:700}`, `markerGap 3`, `hangingIndent:true`; `byCount` 1–3 large / 4–6 standard / 7–9 compact / 10+ two columns |
| quote | `inset 7` (48), `align:"left"` — Index never centres |
| cta | body `["title","handle","body"]` **left** aligned, `handle` hug on an accent plate with `radius 0` (square, not a pill) |
| decor | `tick`: divider `{fixed, 6}` (40), weight 1, colour `accent`, attach `{region:"topRail", bottom, inside, gap:{space,3}, align:"start"}` |
| arrangements | list ×2: `few` (items < 3 → list window −2, `gap {em,6}`), `many` (items ≥ 8 → `columns 2`, window +1) |
| reflow | `tighten · shrink list · columns list · shrink title · offerSplit · overflow` |

---

### 6 · **Plate** — `teaches: "fill"`
*Colour blocks. Every heading sits inside a filled panel; the cover inverts the whole slide. Loud, flat, poster-like.*

| | |
| --- | --- |
| grid | margin `wide` (.10) · columns 6 · gutter 3 · railHeight `{top:7, bottom:7}` · railGap 5 |
| background | page flat `bg`; **cover role patches** `{fill:"text", treatment:{kind:"flat"}}` (full inversion) and **cta role patches** `{fill:"accent", …}` |
| ladder | `[112,94,80,68,58,48,41,35,30,26,22]` floor 10 · uniform on |
| radius | `0` everywhere. Mixing radii is the fastest route to looking assembled |
| type | `title.case:"upper"`, `tracking 0.01`, `weight 700`; `leading fixed 1.02` on plated titles |
| cover | body `["title"]`, `anchor:"end"`, `align:"left"`; `title.colour:"bg"` (inverted), `contrast:"auto"` |
| body / list | body `["title","body"]`, `anchor:"center"`, `centreBias 0.44`; `title.colour:"onAccent"`, `contrast:"auto"`, `title.width {hug, padX:5}` |
| quote | body `["quote","attribution"]` centred, `inset 5`; `quote.colour:"text"` — the one un-plated role, so the plates elsewhere keep their weight |
| cta | body `["title","handle"]` centred; background is already accent, so `handle` uses a `bg`-filled plate with `accent` text |
| decor | `titlePlate` (body, list): plate `padX 5` (32), `padY 3` (18), `radius 0`, attach `{slot:"title", top, behind}`, colour `accent`, `requires:"title"`, `optional:false` · `ctaBlock` (cta): plate `padX 8, padY 6, radius 0`, attach `{slot:"handle", behind}`, colour `bg` |
| list | marker `{kind:"icon", glyph:"square", size:0, colour:"accent"}`, `hangingIndent:true` |
| `accentFill` | `["body","list","cta"]` — the one starter that deliberately widens the invariant, and it says so |
| arrangements | cover ×1: `short` (chars < 50 → window 0→1, `measure 16` — a stacked, poster-sized headline) |
| reflow | `tighten · shrink title · shrink body · overflow` (plates are `optional:false`, so `drop` is unavailable — this template's identity does not degrade) |

---

## 7. Home page and discoverability

### 7.1 The "Rules" button — critique and verdict

The instinct is right: a first-run user does not know what to do, and the fix is something big and unmissable that answers it. Four things about the specific proposal are wrong, and one is fatal.

1. **"Rules" is not a word the user owns.** Nobody wakes up wanting to author rules; they want their slides to look a certain way.
2. **It collides three ways in this codebase.** `computeLayout.ts:124` and `:191` emit `-rule` and `-qrule` node ids for drawn accent bars, and `document-schema.md` §5 is headed "Splitting — deterministic rules". Three meanings for one word in one product is one too many. **Resolved at the schema level: the drawn primitive is named `divider`.**
3. **A big square breaks R8** (every control 28px) and reads consumer inside a deliberately dense pro-tool chrome, and **it competes with the brand-gold hero**, violating R6's one-accent-used-once.
4. **Fatal: it is a big button to an empty template editor** — reproducing the exact dead end "New carousel" already is. `create("", "Untitled")` → `splitToSlides("")` returns `[]` → `SlideStage` hits `if (!slide) return <div className="bg-sunken"/>` and the user gets a black rectangle. Since FlashCC's premise is "you bring the words", a curious first-run user has nothing in their clipboard. The blank path is unusable for essentially every evaluating user.

**Final design: a row of six template cards, each rendering a real cover slide.** Six cards is far *bigger* than one square, it is unmissable, and it teaches while it sits there. Every peer tool teaches at the browser, not at the canvas: Keynote and PowerPoint open into a theme chooser, Canva is a template gallery, Notion hands you a curated template. **R12 stays absolute inside the Editor** (no tour, no coach marks, no placeholder slide) and the entire teaching budget is spent on Home, which is a browser, not a canvas.

### 7.2 Home, final

```
┌───────────────────────────────────────────────────────────────────────┐
│ 44px   F  FlashCC                                        3 projects   │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   Pick a look. Then paste your post.                                  │
│                                                                       │
│   TEMPLATES                                                    ← 10px overline
│   ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌ ─ ─ ┐            │
│   │ ▓▓▓ │ │  ▓  │ │▔▔▔▔▔│ │ ███ │ │ 01  │ │█▓▓█ │ │  +  │            │
│   │▓▓▓▓ │ │ ▓▓▓ │ │ ▓▓▓ │ │ ▓▓▓ │ │▓▓▓▓ │ │ ▓▓  │ │     │            │
│   └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └ ─ ─ ┘            │
│   Anchored  Stage   Ruled  Framed   Index   Plate   New template      │
│                                                                       │
│   Blank carousel                                          ← quiet text button
│                                                                       │
│   YOUR CAROUSELS                                                      │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐                              │
└───────────────────────────────────────────────────────────────────────┘
```

**Home control budget: ≤ 4 counted.** Actual: New-template tile (1) + Blank carousel (1) + wordmark (1) = **3**. The six cards are content, exempt by the same rule that exempts thumbnails and the canvas. Delete-on-hover is not counted (R7).

**Cards are real slides.** Reuse `Filmstrip`'s wrapper verbatim — `scale = CARD_H / format.h`, a `transform: scale()` around `<SlideRenderer nodes={computeLayout(...)}>`. **Never a second preview path** — that is exactly the drift D1 exists to prevent. Card content is seeded from the user's most recent `ProjectSummary.preview` (already persisted, `persist.ts:44`) when one exists, and from `template.demoSource` otherwise. Seeing your own sentence laid out six different ways explains what a template is faster than any copy could. Memoise on `(templateId, formatId, previewText)`.

**Three states, derived from one named enum** (`HomeState = "first-run" | "returning" | "authored"`, from `listProjects().length` and `listTemplates().length`) rather than nested ternaries:

| State | Layout |
| --- | --- |
| `first-run` | Template row is the hero, occupying the space the project grid will later take. One imperative line: *"Pick a look. Then paste your post."* No project grid at all — no "Nothing here yet" line floating in space. |
| `returning` | Project grid first; the template row demotes to a single quiet row below it. **Teaching content retires itself once it has taught.** |
| `authored` | The user's own templates lead the row; starters follow. |

Clicking a card creates a document with that template embedded and the instruction-shaped sample post as its source, named after the template ("Anchored carousel"), landing the user in a working editor with real slides.

**The `Sparkles` icon is deleted.** In 2026 the sparkle glyph is the universal AI signifier, and `README` line 6 plus `CLAUDE.md` line 9 both say emphatically that there is no AI in this product. The one button whose job is to teach what FlashCC is currently mis-signals it. The template thumbnails *are* the icon; no glyph is needed.

**SAMPLE_POST is rewritten, not replaced.** Its structure is genuinely good — hook paragraph, prose, a heading-shaped line, a 4-item list, a quote, a short closer — so it exercises the splitter and all five role layouts in one paste. Two lines change so the cover and one body line **instruct at the point of action**: the cover reads *"Click this line and type your own."* and one body line reads *"Blank lines become new slides — try adding one."* The user's first act is the lesson, and typing deletes the instruction. That is R12's own sentence satisfied more literally than any tooltip could manage. Instruction lines stay on the cover and one body line only, never the CTA — a user can export an unedited deck, and shipped lorem ipsum is a real failure class.

### 7.3 Two free discoverability fixes, before any of this

1. **`.fcc-editable` is a dead class.** `SlideRenderer.tsx:158` sets it and grep finds no CSS rule for it anywhere in `src/`. So R3's mandated row ("editable text block hover → 1px hairline outline, not animated") is unimplemented, and the *only* signifier that slide text is editable is `cursor: text`. Four lines of CSS — `.fcc-editable:hover { box-shadow: inset 0 0 0 1px <brand muted at low alpha> }`, no transition — is the highest-leverage fix in the app, costs zero controls, and is already specified and already wired at the call site. Use a **brand-derived** colour, not a FlashFX token: an app token inside a slide breaks the two-colour-systems invariant. Export is already safe (`ExportSheet`/`Filmstrip` pass no `onEditStart`, so the class is absent).
2. **R13's only legal teaching channel is at zero.** `IconButton` has `aria-label` and no tooltip; its own comment says "tooltips exist only for shortcuts (R13)" and then none exist. `Editor.tsx` implements Cmd+Z/Shift+Z/E/B/D inline in a `useEffect`; there is no `state/keymap.ts` (planned in architecture.md §4) and no `ui/Tooltip.tsx`. Meanwhile the single `title=` attribute in the whole codebase is `BrandKitSheet.tsx:56` restating a palette swatch's name — the tooltip budget spent 1-for-1 in exactly the wrong place. Build `state/keymap.ts` as a data registry (`{id, label, keys, scope}`) and pass a `shortcut` prop through `Button`/`IconButton`. Remove the swatch `title`.
3. **Show the mirror.** On edit commit, scroll the source pane so the changed line is visible. One edit then teaches the whole two-way model with no copy, no tooltip, no control, and no R4 violation (it is a scroll position, not a transition).

### 7.4 Template selection stays inside the existing 8

The document editor's resting budget is 8 and **does not change**. Template is document-level, set-once, brand-locked — structurally identical to the brand kit, which already has a sheet, a scrim, and Cmd+B. So the sheet is renamed **"Brand"** and gains a template row above Palette. A ninth top-bar control for a concept that shares every property with the eighth is not worth the slot. Guard: the moment that sheet needs a second scroll it has become the settings panel `DESIGN_SYSTEM.md` warns about.

The editor also gains **"Save this carousel's look as a template"** in that sheet. It is far cheaper to build than a from-scratch flow, far more discoverable, and it converts today's hardcoded layout into a starter for free.

---

## 8. Migration

### 8.1 What happens to an existing document

`persist.ts:209` currently returns `null` for any `doc.version !== 1`, and `App.tsx`/`Home.tsx` treat `null` as "the card does nothing" — so bumping the version without a migration silently bricks every saved carousel. The gate widens to a range and a migration runs:

```ts
// src/doc/migrate.ts  (pure, Node-testable)
export function migrateDocument(raw: unknown): FlashCCDocument | null {
  // v1 → v2:
  //   template        := ANCHORED, patched from the v1 BrandKit:
  //                        page.grid.margin      ← nearest MARGIN step to brandKit.safeMargin
  //                        page.background       ← brandKit.background (grid opacity → Intensity 1..5)
  //                        handle region+align   ← brandKit.handlePlacement
  //                                                 ("none" → handle is not a member anywhere)
  //   templateSource  := { id: "tpl_anchored", version: 1 }
  //   assets          := {}
  //   brandKit        := { palette, type, handle, logo: null }   // three fields dropped
  //   version         := 2
}
```

The user's `safeMargin` slider value (a 4–14% range) snaps to the nearest of three steps. That is a deliberate, one-time, ≤2.5% geometry change, and it is what converts a control that changed nothing anyone could name into a control that does.

`lastBrandKit()` gets the same treatment — `Home.tsx:19-21` assigns the stored kit onto a new document with **zero validation**, so an old-shaped kit would otherwise produce `undefined` reads inside the interpreter. `migrateBrandKit()` runs on read; an unmigratable value returns `null` and the default kit is used.

### 8.2 Persistence

```
flashcc:index               ProjectSummary[]              (unchanged, + templateName)
flashcc:doc:<id>            FlashCCDocument v2            (template embedded)
flashcc:brandkit:last       BrandKit v2                   (migrated on read)
flashcc:template:<id>       Template                      NEW — the library
flashcc:templates           TemplateSummary[]             NEW — library index
flashcc:template:last       TemplateId                    NEW — seeds new documents
```

**The template is embedded as a snapshot, plus `templateSource` for provenance.** Documents stay self-contained and exportable offline (matching the logo-as-data-URI decision), a deleted library template cannot brick a saved carousel, and the editor can offer an explicit *"This template has changed — update?"* rather than silently restyling twelve decks.

**Quota gets a real signal.** `safeWrite` currently swallows failures silently (`persist.ts:194-200`), so an oversized document fails to save with no user-visible signal at all. It now returns `boolean`, and a `false` surfaces the FlashFX island with *"Not saved — this carousel is too large. Remove an image."* Asset budget, enforced at upload: max **2 images per document**, each downscaled to a 1600px long edge and ≤ 400KB, document total ≤ 3MB.

### 8.3 The interpreter port, and the honest gate

`ANCHORED` **is** the migration target — there is no separate hidden "Classic". Byte-for-byte reproduction is *not* achievable and pretending otherwise would hide the deltas. The gate is a **property suite**, not a golden snapshot:

> for every role × every format × the constraint-3 corpus: node count matches within the enumerated deltas · every node id is stable and unique · array order equals z-order · every `parentId` resolves to an emitted node · **every input word appears in some emitted node's text** · nothing crosses the safe margin except a `bleed` image · no node carries `overflow` that shouldn't · every emitted colour is a resolved brand hex.

**Every delta Anchored introduces against today's output, enumerated:**

| # | Delta | Why |
| --- | --- | --- |
| 1 | Quote ladder floor 42 → 44 | one unified 14-step ladder; the only step that moves |
| 2 | Paragraph gains a 30px step; list gains 30 and 26 | finer ladders, same top and bottom otherwise |
| 3 | The cover accent bar no longer renders on an empty cover | **bug fix** (`requires:"title"`; today it is pushed at line 123, before the guard at 135) |
| 4 | The swipe chevron becomes an `icon` node, not a `→` text glyph | font-independence; phase-2-resolvable |
| 5 | CTA plate text colour → `onAccent` | **bug fix**; identical on all six presets, correct on user palettes. Also raises Bloom 4.21→4.60 and Slate 4.21→5.17 |
| 6 | CTA plate width → real hug (advance table + 2×padX) | replaces `handle.length*20+96`, which is wrong for any serif, mono, or non-zero tracking |
| 7 | Handle placement → region membership + align | the four-corner enum only ever resolved to (rail × align) |
| 8 | List marker → 0.28em of the fitted size, x-height aligned from metrics | replaces a fixed 12px and `fontSize*0.45`; the dot now scales with the step |
| 9 | List hanging indent → marker column + `markerGap`, derived | replaces a fixed 56 |
| 10 | Quote inset 108 → 96 (x 177 / w 726) | quantised to `SPACE[11]` |
| 11 | Divider radius 3 → 4 | quantised to `RADIUS[1]` |
| 12 | Gaps separating type become em-relative (24→22, 32→33.6, 32→30.6 at today's sizes) | proportional at every ladder step instead of only at the default one |
| 13 | A second list block / extra cover paragraphs are no longer dropped | **bug fix** (`sink` + `take:"rest"`); visible on documents that hit the old bug |
| 14 | `list` role uses `sparseAnchor:"start"` below 0.55 fill | a 2-item list reads from the top instead of floating |

Items 3, 5, 6 and 13 are bug fixes; the rest are quantisation or proportion. All fourteen are visible in a diff and none is a surprise.

---

## 9. Build order

Riskiest and most-constraining first. Each step is independently shippable and independently testable; **nothing in the editor is built until the engine it edits is proven.**

| # | Step | Files | Why here |
| --- | --- | --- | --- |
| **1** | **Font metrics + fit v2.** Bundle three woff2 faces in `public/fonts` + `styles/fonts.css`; extract per-face `{unitsPerEm, ascent, descent, capHeight, xHeight, advances}`. Rewrite `fit.ts` per §4.1. Drop system font stacks from `SlideRenderer`. | `public/fonts/*`, `src/styles/fonts.css`, `src/render/metrics/fontMetrics.ts`, `src/render/layout/fit.ts` (+ test) | Half of this spec is unimplementable without it, **and export is not deterministic across machines today**. Everything downstream inherits its errors. Do it first or do it twice. |
| **2** | **Test harness before any rewrite.** `computeLayout` snapshot + property suite over five roles × three formats × the constraint-3 corpus (3-word cover, 400-char body, 12-item list, a 64-char URL, an all-caps headline, a 6-line quote, an empty slide). | `src/render/layout/computeLayout.test.ts`, `src/doc/specimens.ts` | The repo has exactly one test file (`split.test.ts`). Step 4 rewrites the most output-sensitive function in the product; with no coverage that is a blind rewrite. `specimens.ts` is also the editor's stress content, so it earns its keep twice. |
| **3** | **Extend `LayoutNode`; emit the background as a node; add the four kinds to the renderer.** Still the old hardcoded layout. | `computeLayout.ts` (type only), `SlideRenderer.tsx`, `src/render/icons.ts` | `parentId`/`z` retrofitted across a finished interpreter is far worse than added to five if-branches. Emitting the background closes a real hole: today `backgroundStyle(brand)` bypasses `LayoutNode[]` entirely, so phase 2 would receive a scene with no background — and `SlideRenderer` can finally drop its `brand` prop and become a pure painter (3 call sites). |
| **4** | **Schema + validator.** `template.ts` exactly as §2. `validateTemplate` with the full `IssueCode` list; **the save path and the load path both refuse on error.** | `src/doc/template.ts`, `src/doc/validate.ts` (+ tests) | The tuple terminal is real at compile time and worth nothing after `JSON.parse(raw) as Template`, which is the boundary **every user-authored template crosses**. Without this, "never truncate" is a slogan. |
| **5** | **The interpreter + ANCHORED.** Nine passes per §3.2, zero role branches. Delete `LADDER`, `LH`, `pushHandle`, and the five if-blocks. Reshape `grid()` to take the resolved template. Property suite from step 2 must pass with only the fourteen enumerated deltas. | `src/render/layout/interpret.ts`, `computeLayout.ts`, `src/doc/templates/anchored.ts` | This is the proof the vocabulary is complete: if one data record reproduces the shipped product, the schema covers it. |
| **6** | **Document, persistence, migration.** `types.ts` v2, `migrate.ts`, template library CRUD, quota signal, `BrandKitSheet` loses three sections and gains a template row (renamed "Brand"). | `src/doc/types.ts`, `src/doc/migrate.ts`, `src/state/persist.ts`, `src/app/BrandKitSheet.tsx`, `src/app/Home.tsx`, `src/App.tsx` | Every stored document and every stored brand kit must survive. Land it before anything can author a new template. |
| **7** | **Free wins, in parallel with 1–6.** `.fcc-editable` CSS. `state/keymap.ts` + `shortcut` prop on `Button`/`IconButton`. Remove the swatch `title`. Rewrite two SAMPLE_POST lines. Drop `Sparkles`. Scroll-the-source-on-commit. | `styles/index.css`, `src/state/keymap.ts`, `src/ui/*`, `src/doc/defaults.ts`, `src/app/*` | Hours of work, and the highest discoverability-per-hour in the product. None of it depends on the template system. |
| **8** | **Home + gallery.** `HomeState` enum, the six-card row, `New template` tile, first-run inversion. | `src/app/Home.tsx`, `src/app/TemplateGallery.tsx` | Needs step 5 (real cards render real slides) and step 6 (the library exists). Ships value before the editor does: six templates are already a product. |
| **9** | **The five remaining starters.** Each a JSON `Template` record; all six must round-trip the validator and clear the conformance harness on the pathological corpus. | `src/doc/templates/*.ts` | They are the schema's test corpus and the gallery's teaching surface. If they are not obviously better than a first attempt, the whole system reads as pointless — budget real design time. |
| **10** | **The template editor.** Three panes, 5 resting controls, ≤6 contextual, the stress strip, the reflow drag-list. Route added to `App.tsx` (three-way). | `src/app/TemplateEditor.tsx`, `src/app/Inspector.tsx`, `src/ui/AnchorPicker.tsx` | Deliberately last. It is the largest new surface and the one under most pressure to grow; building it over a proven, validated, tested engine is the only way its control budget survives contact with the first bug report. |
| **11** | **Image areas.** Upload + downscale + intrinsic extraction + budget enforcement; `bleed` region; duotone. Edit `docs/document-schema.md` §2 and `docs/role-layouts.md` §5 to record the deliberate scope change. | `src/doc/assets.ts`, `src/app/ImageDrop.tsx`, `docs/*` | There is **zero** data-URI plumbing in `src/` today — no upload, no downscale, no cap. It is net-new work, it contradicts two shipped docs, and it is the only part of this spec the product can ship without. |

**Two docs are written alongside, not after:** `docs/template-editor.md` (the refuse list, §5.7 verbatim) and `docs/interaction-principles.md` Part 4b (Home ≤4, template editor 5 + 7). Write both **before** the first component of step 10. The refusals are what keep `computeLayout` a bounded switch over enums, which is what keeps the phase-2 converter a field rename.