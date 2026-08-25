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

const W = 1080;
const H = 1350;
const M = 96;
const COL = W - M * 2;

/** How much height the image band takes, and the air between it and the text. */
const BAND = 430;
const BAND_GAP = 56;

export type Region = { x: number; y: number; w: number; h: number };
export type ImagePlacement = "above" | "below";

type Ctx = { text: string; index: number; total: number; theme: Theme };

/**
 * Area-based auto-size: text roughly fills its box regardless of length, so a
 * six-word slide is big and a sixty-word slide is readable.
 */
function autoSize(text: string, max: number, min: number, ideal: number): number {
  const n = Math.max(1, text.trim().length);
  return Math.round(Math.max(min, Math.min(max, max * Math.sqrt(ideal / n))));
}

function text(t: string, at: Region, fill: string, extra: Partial<Layer> = {}): Layer {
  return { ...makeLayer("text", at, fill), text: t, ...extra };
}

const rect = (at: Region, fill: string, extra: Partial<Layer> = {}): Layer => ({
  ...makeLayer("rect", at, fill),
  ...extra,
});

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
  build: ({ text: t, theme }, r) => {
    const size = autoSize(t, 104, 46, 46);
    const h = Math.min(r.h - 60, Math.max(150, Math.ceil(t.length / 18) * size * 1.06));
    const y = r.y + r.h - h;
    return [
      rect({ x: r.x, y: y - 46, w: 132, h: 10 }, theme.accent, { name: "Rule", radius: 5 }),
      text(t, { x: r.x, y, w: r.w, h }, theme.fg, {
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.06,
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
  build: ({ text: t, theme }, r) => {
    const size = autoSize(t, 70, 34, 80);
    const h = Math.min(r.h - 40, Math.max(size * 1.15, Math.ceil(t.length / 22) * size * 1.15));
    return [
      text(t, { x: r.x, y: r.y, w: r.w, h }, theme.fg, {
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.15,
        name: "Text",
      }),
      rect({ x: r.x, y: r.y + h + 28, w: r.w, h: 4 }, theme.accent, { name: "Underline", radius: 2 }),
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
    const hs = autoSize(head, 58, 34, 40);
    const bs = autoSize(rest, 40, 26, 220);
    const hh = Math.max(hs * 1.2, Math.ceil(head.length / 26) * hs * 1.2);
    const bh = Math.max(bs * 1.5, Math.ceil(rest.length / 44) * bs * 1.45);
    const y = centred(r, hh + 32 + bh);
    return [
      text(head, { x: r.x, y, w: r.w, h: hh }, theme.fg, {
        fontSize: hs,
        fontWeight: 700,
        lineHeight: 1.15,
        name: "Heading",
      }),
      text(rest, { x: r.x, y: y + hh + 32, w: r.w, h: bh }, theme.muted, {
        fontSize: bs,
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
    const size = autoSize(t, 76, 34, 70);
    const h = Math.min(r.h, Math.max(size * 1.2, Math.ceil(t.length / 22) * size * 1.18));
    return [
      text(t, { x: r.x, y: centred(r, h), w: r.w, h }, theme.fg, {
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.18,
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
  build: ({ text: t, index, theme }, r) => {
    const size = autoSize(t, 46, 26, 150);
    const th = Math.max(size * 1.4, Math.ceil(t.length / 34) * size * 1.4);
    const numH = 110;
    const y = centred(r, numH + 24 + 6 + 36 + th);
    return [
      text(String(index + 1).padStart(2, "0"), { x: r.x, y, w: 240, h: numH }, theme.accent, {
        fontSize: 100,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: -0.04,
        name: "Number",
      }),
      rect({ x: r.x, y: y + numH + 24, w: 72, h: 6 }, theme.accent, { name: "Tick", radius: 3 }),
      text(t, { x: r.x, y: y + numH + 24 + 6 + 36, w: r.w, h: th }, theme.fg, {
        fontSize: size,
        fontWeight: 500,
        lineHeight: 1.4,
        name: "Text",
      }),
    ];
  },
};

const QUOTE: Composition = {
  id: "quote",
  label: "Quote",
  image: "above",
  build: ({ text: t, theme }, r) => {
    const size = autoSize(t, 62, 28, 90);
    const h = Math.min(r.h, Math.max(size * 1.25, Math.ceil(t.length / 24) * size * 1.25));
    const y = centred(r, h);
    return [
      rect({ x: r.x, y, w: 8, h }, theme.accent, { name: "Bar", radius: 4 }),
      text(t, { x: r.x + 44, y, w: r.w - 44, h }, theme.fg, {
        fontSize: size,
        fontWeight: 500,
        lineHeight: 1.25,
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
    const size = autoSize(t, 68, 30, 80);
    const h = Math.max(size * 1.2, Math.ceil(t.length / 22) * size * 1.2);
    const padY = Math.min(64, Math.max(28, (r.h - h) / 2));
    const blockH = Math.min(r.h, h + padY * 2);
    const y = centred(r, blockH);
    return [
      rect({ x: 0, y, w: W, h: blockH }, theme.accent, { name: "Block" }),
      text(t, { x: r.x, y: y + (blockH - h) / 2, w: r.w, h }, theme.bg, {
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.2,
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
    const size = autoSize(t, 56, 24, 90);
    const h = Math.min(r.h, Math.max(size * 1.3, Math.ceil(t.length / 20) * size * 1.3));
    return [
      text(t, { x: r.x, y: centred(r, h), w: r.w, h }, theme.fg, {
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.3,
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

export function compositionFor(index: number, total: number, role?: string): Composition {
  if (role) {
    const pinned = BY_ROLE[role];
    if (pinned) {
      // ...unless it would repeat its neighbour, which is the one thing to avoid.
      const prev = index > 0 ? compositionFor(index - 1, total) : null;
      if (!prev || prev.id !== pinned.id) return pinned;
    }
    return CYCLE[(index - 1 + CYCLE.length) % CYCLE.length]!;
  }
  if (index === 0) return TITLE;
  // A short last slide closes on the colour block — the one loud slide in the deck.
  if (index === total - 1 && total > 2) return BLOCK;
  return CYCLE[(index - 1) % CYCLE.length]!;
}

export const compositionLabel = (index: number, total: number, role?: string): string =>
  compositionFor(index, total, role).label;

/** The picture band and the text region it leaves behind. */
export function bandsFor(placement: ImagePlacement): { image: Region; textRegion: Region } {
  const innerH = H - M * 2;
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

export function buildSlides(texts: string[], theme: Theme, roles?: string[]): Slide[] {
  const kept: { text: string; role: string | undefined }[] = [];
  texts.forEach((t, i) => {
    if (t.trim()) kept.push({ text: t.trim(), role: roles?.[i] });
  });
  if (kept.length === 0) return [makeSlide(theme.bg, "Slide 1")];

  return kept.map((k, i) => {
    const comp = compositionFor(i, kept.length, k.role);
    const { image, textRegion } = bandsFor(comp.image);
    // Picture first so it sits behind the text, which is what you want if either
    // ends up dragged over the other later.
    return {
      ...makeSlide(theme.bg, comp.id === "title" ? "Hook" : `Slide ${i + 1}`),
      layers: [
        imagePlaceholder(image, theme),
        ...comp.build({ text: k.text, index: i, total: kept.length, theme }, textRegion),
      ],
    };
  });
}

export const MAX_SLIDES = 35;
