/**
 * Compositions: one block of text in, one arranged slide out.
 *
 * These run ONCE, at generate time, and return plain layers. Nothing stays live.
 * The point is that consecutive slides do not look the same — a deck where every
 * slide is the same box of centred text reads as generated, which is the one thing
 * it must not do. Slide 1 is always the title.
 */
import { makeLayer, makeSlide, type Layer, type Slide } from "./model.js";
import type { Theme } from "./presets.js";

const W = 1080;
const H = 1350;
const M = 96;
const COL = W - M * 2;

type Ctx = { text: string; index: number; total: number; theme: Theme };

/**
 * Area-based auto-size: text roughly fills its box regardless of length, so a
 * six-word slide is big and a sixty-word slide is readable.
 */
function autoSize(text: string, max: number, min: number, ideal: number): number {
  const n = Math.max(1, text.trim().length);
  return Math.round(Math.max(min, Math.min(max, max * Math.sqrt(ideal / n))));
}

function text(t: string, at: { x: number; y: number; w: number; h: number }, fill: string, extra: Partial<Layer> = {}): Layer {
  return { ...makeLayer("text", at, fill), text: t, ...extra };
}

const rect = (at: { x: number; y: number; w: number; h: number }, fill: string, extra: Partial<Layer> = {}): Layer => ({
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

type Composition = { id: string; label: string; build: (c: Ctx) => Layer[] };

const TITLE: Composition = {
  id: "title",
  label: "Title",
  build: ({ text: t, theme }) => {
    const size = autoSize(t, 108, 52, 46);
    const h = Math.max(200, Math.ceil(t.length / 18) * size * 1.06);
    const y = H - M - 120 - h;
    return [
      rect({ x: M, y: y - 56, w: 132, h: 10 }, theme.accent, { name: "Rule", radius: 5 }),
      text(t, { x: M, y, w: COL, h }, theme.fg, {
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.06,
        letterSpacing: -0.02,
        name: "Title",
      }),
    ];
  },
};

const HEADING_BODY: Composition = {
  id: "heading-body",
  label: "Heading + body",
  build: ({ text: t, theme }) => {
    const [head, rest] = lead(t);
    if (!rest) return UNDERLINE.build({ text: t, index: 1, total: 2, theme });
    const hs = autoSize(head, 64, 40, 40);
    const bs = autoSize(rest, 42, 28, 220);
    const hh = Math.max(hs * 1.2, Math.ceil(head.length / 26) * hs * 1.2);
    const bh = Math.max(bs * 1.5, Math.ceil(rest.length / 44) * bs * 1.45);
    const total = hh + 40 + bh;
    const y = (H - total) / 2;
    return [
      text(head, { x: M, y, w: COL, h: hh }, theme.fg, {
        fontSize: hs,
        fontWeight: 700,
        lineHeight: 1.15,
        name: "Heading",
      }),
      text(rest, { x: M, y: y + hh + 40, w: COL, h: bh }, theme.muted, {
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
  build: ({ text: t, theme }) => {
    const size = autoSize(t, 84, 40, 70);
    const h = Math.max(size * 1.2, Math.ceil(t.length / 22) * size * 1.18);
    return [
      text(t, { x: M, y: (H - h) / 2, w: COL, h }, theme.fg, {
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
  build: ({ text: t, index, theme }) => {
    const size = autoSize(t, 52, 30, 150);
    const h = Math.max(size * 1.4, Math.ceil(t.length / 34) * size * 1.4);
    return [
      text(String(index + 1).padStart(2, "0"), { x: M, y: M + 40, w: 260, h: 170 }, theme.accent, {
        fontSize: 150,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: -0.04,
        name: "Number",
      }),
      rect({ x: M, y: M + 240, w: 72, h: 6 }, theme.accent, { name: "Tick", radius: 3 }),
      text(t, { x: M, y: M + 320, w: COL, h }, theme.fg, {
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
  build: ({ text: t, theme }) => {
    const size = autoSize(t, 68, 34, 90);
    const h = Math.max(size * 1.25, Math.ceil(t.length / 24) * size * 1.25);
    const y = (H - h) / 2;
    return [
      rect({ x: M, y, w: 8, h }, theme.accent, { name: "Bar", radius: 4 }),
      text(t, { x: M + 48, y, w: COL - 48, h }, theme.fg, {
        fontSize: size,
        fontWeight: 500,
        lineHeight: 1.25,
        italic: true,
        name: "Quote",
      }),
    ];
  },
};

const UNDERLINE: Composition = {
  id: "underline",
  label: "Underlined",
  build: ({ text: t, theme }) => {
    const size = autoSize(t, 76, 36, 80);
    const h = Math.max(size * 1.15, Math.ceil(t.length / 22) * size * 1.15);
    const y = M + 180;
    return [
      text(t, { x: M, y, w: COL, h }, theme.fg, {
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.15,
        name: "Text",
      }),
      rect({ x: M, y: y + h + 36, w: COL, h: 4 }, theme.accent, { name: "Underline", radius: 2 }),
    ];
  },
};

const BLOCK: Composition = {
  id: "block",
  label: "Colour block",
  build: ({ text: t, theme }) => {
    const size = autoSize(t, 74, 34, 80);
    const h = Math.max(size * 1.2, Math.ceil(t.length / 22) * size * 1.2);
    const padY = 96;
    const blockH = h + padY * 2;
    const y = (H - blockH) / 2;
    return [
      rect({ x: 0, y, w: W, h: blockH }, theme.accent, { name: "Block" }),
      text(t, { x: M, y: y + padY, w: COL, h }, theme.bg, {
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
  build: ({ text: t, theme }) => {
    const size = autoSize(t, 62, 28, 90);
    const h = Math.max(size * 1.3, Math.ceil(t.length / 20) * size * 1.3);
    return [
      text(t, { x: M, y: (H - h) / 2, w: COL, h }, theme.fg, {
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

export function buildSlides(texts: string[], theme: Theme, roles?: string[]): Slide[] {
  const kept: { text: string; role: string | undefined }[] = [];
  texts.forEach((t, i) => {
    if (t.trim()) kept.push({ text: t.trim(), role: roles?.[i] });
  });
  if (kept.length === 0) return [makeSlide(theme.bg, "Slide 1")];

  return kept.map((k, i) => {
    const comp = compositionFor(i, kept.length, k.role);
    return {
      ...makeSlide(theme.bg, comp.id === "title" ? "Hook" : `Slide ${i + 1}`),
      layers: comp.build({ text: k.text, index: i, total: kept.length, theme }),
    };
  });
}

export const MAX_SLIDES = 35;
