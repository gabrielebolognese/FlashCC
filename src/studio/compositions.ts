/**
 * Compositions: one block of text in, one arranged slide out.
 *
 * These run ONCE, at generate time, and return plain layers. Nothing stays live.
 * The point is that consecutive slides do not look the same — a deck where every
 * slide is the same box of centred text reads as generated, which is the one thing
 * it must not do. Slide 1 is always the title.
 *
 * Every slide reserves an image band, above or below the text. It renders as an empty
 * placeholder until something is dropped on it, and it is an ordinary image layer the
 * whole time — movable, resizable, deletable like anything else.
 */
import { makeLayer, makeSlide, type Layer, type Slide } from "./model.js";
import type { Theme } from "./presets.js";
import { clampY, fitToBox, ladder, lineCount, type Measure } from "./text.js";

/**
 * How far type may shrink before splitting is the better answer, as a fraction
 * of the composition's own top size.
 */
const SHRINK_FLOOR = 0.6;

const W = 1080;
const H = 1350;
const M = 96;
const COL = W - M * 2;

/** How much height the image band takes, and the air between it and the text. */
const BAND = 430;
const BAND_GAP = 56;

export type Region = { x: number; y: number; w: number; h: number };
export type ImagePlacement = "above" | "below";

/** `decor` scales every accent rule: 0 removes them, 1 is normal, 1.8 is bold. */
type Ctx = { text: string; index: number; total: number; theme: Theme; decor: number };

/**
 * The face a layer will actually be given, so it can be measured in that face.
 *
 * Fitting happened with the default (sans) metric and applyFonts ran afterwards,
 * so a mono or serif theme was sized for one typeface and then rendered in
 * another. Mono measures 15% wider against a 2% safety margin, which overflowed
 * three slides out of four on the Terminal style.
 */
const display = (t: Theme): Measure => ({ family: t.displayFont ?? "sans" });
const body = (t: Theme): Measure => ({ family: t.bodyFont ?? t.displayFont ?? "sans" });

/**
 * Fit text to a box by actually wrapping it.
 *
 * Everything here goes through this: the size comes off a ladder, and the HEIGHT is
 * the wrapped line count times the leading, never a guess from character count. That
 * is what stops a long hook running off the artboard.
 */
function fit(
  t: string,
  box: { w: number; h: number },
  range: [max: number, min: number],
  lineHeight: number,
  m: Measure = {},
) {
  return fitToBox(t, {
    maxWidth: box.w,
    maxHeight: box.h,
    // The ladder stops well short of its own floor. Below roughly 60% of the
    // top size a slide stops reading as designed and starts reading as crammed
    // — which is the single loudest complaint about every tool in this
    // category. Copy that needs to go lower does not get a smaller font; it
    // overflows here on purpose, and buildSlides gives it another slide.
    sizes: ladder(range[0], Math.max(range[1], Math.round(range[0] * SHRINK_FLOOR))),
    lineHeight,
    ...m,
  });
}

function text(t: string, at: Region, fill: string, extra: Partial<Layer> = {}): Layer {
  return { ...makeLayer("text", at, fill), text: t, ...extra };
}

const rect = (at: Region, fill: string, extra: Partial<Layer> = {}): Layer => ({
  ...makeLayer("rect", at, fill),
  ...extra,
});

/** An accent rule, scaled by the decoration setting and omitted entirely at zero. */
const accent = (decor: number, at: Region, fill: string, extra: Partial<Layer> = {}): Layer[] =>
  decor <= 0 ? [] : [rect({ ...at, h: Math.round(at.h * decor) }, fill, extra)];

/** Split a block into a lead line and the rest. */
function lead(t: string): [string, string] {
  const nl = t.indexOf("\n");
  if (nl > 0 && nl < 90) return [t.slice(0, nl).trim(), t.slice(nl + 1).trim()];
  const m = t.match(/^(.{4,90}?[.!?])\s+(.+)$/s);
  if (m && m[1] && m[2]) return [m[1].trim(), m[2].trim()];
  return [t.trim(), ""];
}

/** Vertically centre a block of height `h` inside a region. */
const centred = (region: Region, h: number): number => region.y + Math.max(0, (region.h - h) / 2);

type Composition = {
  id: string;
  label: string;
  /** Where this composition wants its picture. */
  image: ImagePlacement;
  build: (c: Ctx, region: Region) => Layer[];
};

const TITLE: Composition = {
  id: "title",
  label: "Title",
  image: "above",
  build: ({ text: t, theme, decor }, r) => {
    const LH = 1.06;
    const RULE = decor > 0 ? 56 : 0; // rule + the air under it
    const f = fit(t, { w: r.w, h: r.h - RULE }, [104, 40], LH, { ...display(theme), letterSpacing: -0.02 });
    // Sits in the upper third of its free space rather than on the floor of the
    // region: pinned to the bottom, a short hook stranded itself at the very edge
    // with a wall of dead space above it. A long one still grows upward from here.
    const LIFT = 0.34;
    const free = Math.max(0, r.h - RULE - f.height);
    const y = clampY(r.y + RULE + free * LIFT, f.height, r.y + RULE, r.h - RULE);
    return [
      ...accent(decor, { x: r.x, y: y - 46, w: 132, h: 10 }, theme.accent, { name: "Rule", radius: 5 }),
      text(t, { x: r.x, y, w: r.w, h: f.height }, theme.fg, {
        fontSize: f.fontSize,
        fontWeight: 700,
        lineHeight: LH,
        letterSpacing: -0.02,
        name: "Title",
      }),
    ];
  },
};

const UNDERLINE: Composition = {
  id: "underline",
  label: "Underlined",
  image: "below",
  build: ({ text: t, theme, decor }, r) => {
    const LH = 1.15;
    const RULE = decor > 0 ? 32 : 0;
    const f = fit(t, { w: r.w, h: r.h - RULE }, [70, 30], LH, display(theme));
    return [
      text(t, { x: r.x, y: r.y, w: r.w, h: f.height }, theme.fg, {
        fontSize: f.fontSize,
        fontWeight: 700,
        lineHeight: LH,
        name: "Text",
      }),
      ...accent(decor, { x: r.x, y: r.y + f.height + 28, w: r.w, h: 4 }, theme.accent, {
        name: "Underline",
        radius: 2,
      }),
    ];
  },
};

const HEADING_BODY: Composition = {
  id: "heading-body",
  label: "Heading + body",
  image: "above",
  build: (ctx, r) => {
    const [head, rest] = lead(ctx.text);
    if (!rest) return UNDERLINE.build(ctx, r);
    const { theme } = ctx;
    const GAP = 32;
    // The heading gets at most 40% of the region; the body takes what is left, so a
    // long heading cannot squeeze the body off the slide.
    const hf = fit(head, { w: r.w, h: r.h * 0.4 }, [58, 30], 1.15, display(theme));
    const bf = fit(rest, { w: r.w, h: r.h - hf.height - GAP }, [40, 22], 1.45, body(theme));
    const total = hf.height + GAP + bf.height;
    const y = clampY(centred(r, total), total, r.y, r.h);
    return [
      text(head, { x: r.x, y, w: r.w, h: hf.height }, theme.fg, {
        fontSize: hf.fontSize,
        fontWeight: 700,
        lineHeight: 1.15,
        name: "Heading",
      }),
      text(rest, { x: r.x, y: y + hf.height + GAP, w: r.w, h: bf.height }, theme.muted, {
        fontSize: bf.fontSize,
        fontWeight: 400,
        lineHeight: 1.45,
        name: "Body",
      }),
    ];
  },
};

const STATEMENT: Composition = {
  id: "statement",
  label: "Statement",
  image: "below",
  build: ({ text: t, theme }, r) => {
    const LH = 1.18;
    const f = fit(t, { w: r.w, h: r.h }, [76, 30], LH, display(theme));
    return [
      text(t, { x: r.x, y: clampY(centred(r, f.height), f.height, r.y, r.h), w: r.w, h: f.height }, theme.fg, {
        fontSize: f.fontSize,
        fontWeight: 700,
        lineHeight: LH,
        align: "center",
        name: "Statement",
      }),
    ];
  },
};

const NUMBERED: Composition = {
  id: "numbered",
  label: "Numbered",
  image: "below",
  build: ({ text: t, index, theme, decor }, r) => {
    const LH = 1.4;
    const numH = 110;
    const HEAD = numH + 24 + 6 + 36; // numeral, tick and the air around them
    const f = fit(t, { w: r.w, h: r.h - HEAD }, [46, 22], LH, display(theme));
    const total = HEAD + f.height;
    const y = clampY(centred(r, total), total, r.y, r.h);
    return [
      text(String(index + 1).padStart(2, "0"), { x: r.x, y, w: 240, h: numH }, theme.accent, {
        fontSize: 100,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: -0.04,
        name: "Number",
      }),
      ...accent(decor, { x: r.x, y: y + numH + 24, w: 72, h: 6 }, theme.accent, {
        name: "Tick",
        radius: 3,
      }),
      text(t, { x: r.x, y: y + HEAD, w: r.w, h: f.height }, theme.fg, {
        fontSize: f.fontSize,
        fontWeight: 500,
        lineHeight: LH,
        name: "Text",
      }),
    ];
  },
};

const QUOTE: Composition = {
  id: "quote",
  label: "Quote",
  image: "above",
  build: ({ text: t, theme, decor }, r) => {
    const LH = 1.25;
    const INDENT = 44;
    const f = fit(t, { w: r.w - INDENT, h: r.h }, [62, 26], LH, display(theme));
    const y = clampY(centred(r, f.height), f.height, r.y, r.h);
    return [
      ...(decor > 0
        ? [rect({ x: r.x, y, w: Math.round(8 * decor), h: f.height }, theme.accent, { name: "Bar", radius: 4 })]
        : []),
      text(t, { x: r.x + INDENT, y, w: r.w - INDENT, h: f.height }, theme.fg, {
        fontSize: f.fontSize,
        fontWeight: 500,
        lineHeight: LH,
        italic: true,
        name: "Quote",
      }),
    ];
  },
};

const BLOCK: Composition = {
  id: "block",
  label: "Colour block",
  image: "above",
  build: ({ text: t, theme }, r) => {
    const LH = 1.2;
    const MIN_PAD = 28;
    const f = fit(t, { w: r.w, h: r.h - MIN_PAD * 2 }, [68, 26], LH, display(theme));
    const padY = Math.min(64, Math.max(MIN_PAD, (r.h - f.height) / 2));
    const blockH = Math.min(r.h, f.height + padY * 2);
    const y = clampY(centred(r, blockH), blockH, r.y, r.h);
    return [
      rect({ x: 0, y, w: W, h: blockH }, theme.accent, { name: "Block" }),
      text(t, { x: r.x, y: y + (blockH - f.height) / 2, w: r.w, h: f.height }, theme.bg, {
        fontSize: f.fontSize,
        fontWeight: 700,
        lineHeight: LH,
        align: "center",
        name: "Text",
      }),
    ];
  },
};

const CAPS: Composition = {
  id: "caps",
  label: "Caps",
  image: "below",
  build: ({ text: t, theme }, r) => {
    const LH = 1.3;
    // Measured uppercased and tracked out, since that is what actually renders.
    const m: Measure = { ...display(theme), letterSpacing: 0.06, uppercase: true };
    const f = fit(t, { w: r.w, h: r.h }, [56, 22], LH, m);
    return [
      text(t, { x: r.x, y: clampY(centred(r, f.height), f.height, r.y, r.h), w: r.w, h: f.height }, theme.fg, {
        fontSize: f.fontSize,
        fontWeight: 700,
        lineHeight: LH,
        letterSpacing: 0.06,
        uppercase: true,
        align: "center",
        name: "Text",
      }),
    ];
  },
};

/** The rotation. Consecutive slides never share a composition. */
const CYCLE: Composition[] = [HEADING_BODY, STATEMENT, NUMBERED, QUOTE, UNDERLINE, CAPS];

/**
 * Roles that always get the same treatment, whatever their position. The hook is the
 * title because it is the hook; the CTA is the one loud slide because it is the ask.
 */
const BY_ROLE: Record<string, Composition> = {
  hook: TITLE,
  cta: BLOCK,
  takeaway: STATEMENT,
  lesson: STATEMENT,
  turn: QUOTE,
  result: NUMBERED,
};

/**
 * A stable number from the deck's own words.
 *
 * Used to rotate where the composition cycle starts, which is the difference
 * between "four frameworks" and "the same eight-slide layout every time" — the
 * loudest one-star complaint about every tool in this category. Two different
 * carousels get different rhythms; the same carousel twice gets the same one,
 * because the seed is the content rather than a clock or a counter.
 */
export function seedOf(texts: readonly string[]): number {
  let h = 0;
  for (const t of texts) {
    for (let i = 0; i < t.length; i += 1) {
      h = (h * 31 + t.charCodeAt(i)) | 0;
    }
  }
  return Math.abs(h);
}

export function compositionFor(
  index: number,
  total: number,
  role?: string,
  seed = 0,
): Composition {
  if (role) {
    const pinned = BY_ROLE[role];
    if (pinned) {
      // ...unless it would repeat its neighbour, which is the one thing to avoid.
      const prev = index > 0 ? compositionFor(index - 1, total) : null;
      if (!prev || prev.id !== pinned.id) return pinned;
    }
    return CYCLE[(index - 1 + seed + CYCLE.length) % CYCLE.length]!;
  }
  if (index === 0) return TITLE;
  // A short last slide closes on the colour block — the one loud slide in the deck.
  if (index === total - 1 && total > 2) return BLOCK;
  return CYCLE[(index - 1 + seed) % CYCLE.length]!;
}

export const compositionLabel = (index: number, total: number, role?: string): string =>
  compositionFor(index, total, role).label;

/** The picture band and the text region it leaves behind. */
export function bandsFor(
  placement: ImagePlacement,
  withImage = true,
): { image: Region; textRegion: Region } {
  const innerH = H - M * 2;
  const full = { x: M, y: M, w: COL, h: innerH };
  // No pictures: the text gets the whole safe box rather than a band of dead space.
  if (!withImage) return { image: full, textRegion: full };
  if (placement === "above") {
    return {
      image: { x: M, y: M, w: COL, h: BAND },
      textRegion: { x: M, y: M + BAND + BAND_GAP, w: COL, h: innerH - BAND - BAND_GAP },
    };
  }
  return {
    image: { x: M, y: H - M - BAND, w: COL, h: BAND },
    textRegion: { x: M, y: M, w: COL, h: innerH - BAND - BAND_GAP },
  };
}

/** An empty picture slot. Dotted outline and an upload mark until something lands on it. */
export function imagePlaceholder(at: Region, theme: Theme, name = "Image"): Layer {
  return { ...makeLayer("image", at, theme.muted), name, radius: 12, fit: "cover" };
}

/**
 * The style's typefaces, applied by the job a layer does rather than by editing every
 * composition: prose takes the body face, everything else takes display.
 */
function applyFonts(layer: Layer, theme: Theme): Layer {
  if (layer.kind !== "text") return layer;
  const font = layer.name === "Body" ? theme.bodyFont : theme.displayFont;
  return font ? { ...layer, fontFamily: font } : layer;
}

export type BuildOptions = {
  /** Reserve a picture band on every slide. */
  images?: boolean | undefined;
  /** 0 removes accent rules, 1 is normal, 1.8 is bold. */
  decor?: number | undefined;
  /**
   * Set false to take the layout exactly as composed, overflow and all.
   * Only the tests that assert on overflow want this.
   */
  split?: boolean | undefined;
};

/**
 * Copy that does not fit gets ANOTHER SLIDE rather than a smaller font.
 *
 * Built, measured, and rebuilt with the offending entry split — rather than
 * predicted up front — because the region a slide gets depends on which
 * composition it lands on, which depends on how many slides there are, which is
 * the thing splitting changes. Measuring the real output sidesteps the circle,
 * and each pass strictly shrinks the worst slide, so it converges.
 *
 * The alternative is what every tool in this category does and what its users
 * complain about loudest: shrink until it fits. `fit()` still shrinks — a couple
 * of ladder steps is a reasonable accommodation — but it no longer falls to the
 * floor silently and calls that a layout.
 */
const MAX_SPLIT_PASSES = 10;

/**
 * The first slide whose copy does not fit the ARTBOARD.
 *
 * Against the artboard rather than against the layer's own box, which is the
 * subtle part: when `fit` runs out of ladder it returns the real height it
 * needed, and the layer is built at that height. So the box grows to match the
 * overflow and "does this fit its box" is answered yes by a slide that is
 * visibly hanging off the bottom of the canvas. The board is the only reference
 * that cannot move.
 */
function overflowingIndex(slides: Slide[]): number | null {
  for (let i = 0; i < slides.length; i += 1) {
    for (const l of slides[i]?.layers ?? []) {
      if (l.kind !== "text" || !(l.text ?? "").trim()) continue;
      if (l.y < -0.5 || l.y + l.h > H + 0.5) return i;
    }
  }
  return null;
}

export function buildSlides(
  texts: string[],
  theme: Theme,
  roles?: string[],
  options: BuildOptions = {},
): Slide[] {
  let entries = texts.map((t, i) => ({ text: t, role: roles?.[i] }));

  let slides = layout(entries, theme, options);
  if (options.split === false) return slides;

  for (let pass = 0; pass < MAX_SPLIT_PASSES; pass += 1) {
    const bad = overflowingIndex(slides);
    if (bad === null) break;

    const kept = entries.filter((e) => e.text.trim() !== "");
    const target = kept[bad];
    if (!target) break;

    const pieces = splitAtMiddle(target.text);
    if (pieces.length < 2) break;

    // The role rides with the first piece only. A repeated slot would otherwise
    // pin both halves to the same composition and print the same layout twice.
    const at = entries.indexOf(target);
    entries = [
      ...entries.slice(0, at),
      { text: pieces[0] ?? "", role: target.role },
      ...pieces.slice(1).map((text) => ({ text, role: undefined })),
      ...entries.slice(at + 1),
    ];

    slides = layout(entries, theme, options);
  }

  return slides;
}

/** One cut at the sentence boundary nearest the middle. Never rewords. */
function splitAtMiddle(text: string): string[] {
  const t = text.trim();
  const breaks: number[] = [];
  const re = /[.!?]["')\]]*\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) breaks.push(m.index + m[0].length);

  if (breaks.length === 0) {
    for (let i = 1; i < t.length - 1; i += 1) if (/\s/.test(t[i] ?? "")) breaks.push(i + 1);
  }
  const usable = breaks.filter((i) => i > 0 && i < t.length);
  if (usable.length === 0) return [t];

  const middle = t.length / 2;
  const at = usable.reduce((a, b) => (Math.abs(a - middle) <= Math.abs(b - middle) ? a : b));
  const head = t.slice(0, at).trim();
  const tail = t.slice(at).trim();
  return head && tail ? [head, tail] : [t];
}

function layout(
  entries: { text: string; role: string | undefined }[],
  theme: Theme,
  options: BuildOptions,
): Slide[] {
  const images = options.images ?? true;
  const decor = options.decor ?? 1;

  const kept: { text: string; role: string | undefined }[] = [];
  entries.forEach((e) => {
    if (e.text.trim()) kept.push({ text: e.text.trim(), role: e.role });
  });
  if (kept.length === 0) return [makeSlide(theme.bg, "Slide 1")];

  const seed = seedOf(kept.map((k) => k.text));

  return kept.map((k, i) => {
    const comp = compositionFor(i, kept.length, k.role, seed);
    const { image, textRegion } = bandsFor(comp.image, images);
    const built = comp
      .build({ text: k.text, index: i, total: kept.length, theme, decor }, textRegion)
      .map((l) => applyFonts(l, theme));

    // Picture first so it sits behind the text, which is what you want if either
    // ends up dragged over the other later.
    return {
      ...makeSlide(theme.bg, comp.id === "title" ? "Hook" : `Slide ${i + 1}`),
      ...(theme.bgGradient ? { gradient: theme.bgGradient } : {}),
      layers: images ? [imagePlaceholder(image, theme), ...built] : built,
    };
  });
}

export const MAX_SLIDES = 35;
