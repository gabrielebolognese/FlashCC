/**
 * Starting points, not templates.
 *
 * A preset is a function that returns plain layers. It runs once, when you pick it,
 * and then it is gone — there is no live template to fight with, nothing is re-derived,
 * and every layer it produced is as editable as one you drew yourself.
 */
import { makeLayer, makeSlide, uid, type Doc, type Layer, type Slide } from "./model.js";

export type Theme = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  /** FONTS ids. Display carries headings and statements; body carries prose. */
  displayFont?: string | undefined;
  bodyFont?: string | undefined;
};

export const THEMES: Record<string, Theme> = {
  ink: { bg: "#12161c", fg: "#f4f6f8", accent: "#d9a521", muted: "#8b96a5" },
  paper: { bg: "#f7f4ed", fg: "#1a1a18", accent: "#c2410c", muted: "#6b665c" },
  cobalt: { bg: "#12285a", fg: "#ffffff", accent: "#7ec8ff", muted: "#9fb2d9" },
  bloom: { bg: "#fdf2f8", fg: "#2b1220", accent: "#db2777", muted: "#7a556a" },
};

const W = 1080;
const H = 1350;
const M = 88;

function text(t: string, at: { x: number; y: number; w: number; h: number }, fill: string, opts: Partial<Layer> = {}): Layer {
  return { ...makeLayer("text", at, fill), text: t, ...opts };
}

export type Preset = {
  id: string;
  name: string;
  description: string;
  build: (theme: Theme) => Slide[];
};

export const PRESETS: Preset[] = [
  {
    id: "blank",
    name: "Blank",
    description: "One empty artboard",
    build: (t) => [makeSlide(t.bg, "Slide 1")],
  },
  {
    id: "hook",
    name: "Big hook",
    description: "Cover, two body slides, a closer",
    build: (t) => [
      {
        ...makeSlide(t.bg, "Cover"),
        layers: [
          { ...makeLayer("rect", { x: M, y: 880, w: 120, h: 8 }, t.accent), name: "Rule", radius: 4 },
          text("Your hook goes here", { x: M, y: 930, w: W - M * 2, h: 300 }, t.fg, {
            fontSize: 96,
            fontWeight: 700,
            lineHeight: 1.05,
            name: "Hook",
          }),
        ],
      },
      {
        ...makeSlide(t.bg, "Body"),
        layers: [
          text("The point", { x: M, y: 420, w: W - M * 2, h: 90 }, t.fg, { fontSize: 56, fontWeight: 700, name: "Heading" }),
          text("Say it in one paragraph. Keep it to one idea.", { x: M, y: 540, w: W - M * 2, h: 300 }, t.muted, {
            fontSize: 40,
            fontWeight: 400,
            lineHeight: 1.4,
            name: "Body",
          }),
        ],
      },
      {
        ...makeSlide(t.bg, "Body"),
        layers: [
          text("The second point", { x: M, y: 420, w: W - M * 2, h: 90 }, t.fg, { fontSize: 56, fontWeight: 700, name: "Heading" }),
          text("And the evidence for it.", { x: M, y: 540, w: W - M * 2, h: 300 }, t.muted, {
            fontSize: 40,
            fontWeight: 400,
            lineHeight: 1.4,
            name: "Body",
          }),
        ],
      },
      {
        ...makeSlide(t.accent, "CTA"),
        layers: [
          text("Follow for more", { x: M, y: 560, w: W - M * 2, h: 200 }, t.bg, {
            fontSize: 76,
            fontWeight: 700,
            align: "center",
            name: "CTA",
          }),
        ],
      },
    ],
  },
  {
    id: "centred",
    name: "Centre stage",
    description: "One idea per slide, dead centre",
    build: (t) => [
      {
        ...makeSlide(t.bg, "Cover"),
        layers: [
          text("One idea", { x: M, y: 540, w: W - M * 2, h: 280 }, t.fg, {
            fontSize: 120,
            fontWeight: 700,
            align: "center",
            lineHeight: 1.05,
            name: "Title",
          }),
        ],
      },
      {
        ...makeSlide(t.bg, "Body"),
        layers: [
          text("The next one", { x: M, y: 560, w: W - M * 2, h: 240 }, t.fg, {
            fontSize: 88,
            fontWeight: 700,
            align: "center",
            name: "Title",
          }),
        ],
      },
    ],
  },
  {
    id: "numbered",
    name: "Numbered",
    description: "A big numeral on every slide",
    build: (t) =>
      [1, 2, 3].map((n) => ({
        ...makeSlide(t.bg, `Slide ${n}`),
        layers: [
          text(String(n), { x: M, y: M, w: 200, h: 140 }, t.accent, {
            fontSize: 120,
            fontWeight: 700,
            name: `Number ${n}`,
          }),
          { ...makeLayer("rect", { x: M, y: 250, w: 64, h: 4 }, t.accent), name: "Tick" },
          text("Point title", { x: M, y: 320, w: W - M * 2, h: 100 }, t.fg, { fontSize: 60, fontWeight: 700, name: "Heading" }),
          text("Say the thing.", { x: M, y: 440, w: W - M * 2, h: 240 }, t.muted, {
            fontSize: 38,
            fontWeight: 400,
            lineHeight: 1.4,
            name: "Body",
          }),
        ],
      })),
  },
];

export function buildDoc(preset: Preset, themeId: keyof typeof THEMES, name: string): Doc {
  const theme = THEMES[themeId] ?? THEMES.ink!;
  const now = new Date().toISOString();
  return {
    version: 3,
    id: uid("d"),
    name,
    width: W,
    height: H,
    palette: [theme.bg, theme.fg, theme.accent, theme.muted, "#ffffff", "#000000", "#e5545a", "#3dbe7a", "#4c86d6", "#db2777"],
    media: [],
    slides: preset.build(theme),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Paste a written post and get one slide per blank-line group, as ordinary text
 * layers. This is an importer, not a layout engine — nothing stays live afterwards.
 */
export function slidesFromText(source: string, themeId: keyof typeof THEMES): Slide[] {
  const theme = THEMES[themeId] ?? THEMES.ink!;
  const groups = source
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((g) => g.trim())
    .filter(Boolean);

  if (groups.length === 0) return [makeSlide(theme.bg)];

  return groups.map((g, i) => {
    const cover = i === 0;
    const isList = g.split("\n").filter((l) => /^\s*[-*•]|\d+[.)]/.test(l)).length >= 2;
    const body = isList ? g.split("\n").map((l) => l.replace(/^\s*[-*•]\s*|\s*\d+[.)]\s*/, "• ")).join("\n") : g;

    return {
      ...makeSlide(theme.bg, cover ? "Cover" : `Slide ${i + 1}`),
      layers: [
        text(
          body,
          { x: M, y: cover ? 880 : 420, w: W - M * 2, h: cover ? 340 : 500 },
          cover ? theme.fg : theme.fg,
          {
            fontSize: cover ? 88 : 44,
            fontWeight: cover ? 700 : 400,
            lineHeight: cover ? 1.08 : 1.4,
            name: cover ? "Hook" : "Text",
          },
        ),
      ],
    };
  });
}
