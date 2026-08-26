/**
 * Visual styles: a palette plus the two typefaces that carry it.
 *
 * A style is applied once, at generation, and then it is gone — every colour and font
 * it chose lands on ordinary layers you can change afterwards. It is a starting
 * point, not a theme the document keeps referring back to.
 */
import { makeGradient } from "./gradient.js";
import type { Theme } from "./presets.js";

export type Style = {
  id: string;
  name: string;
  note: string;
  theme: Theme;
};

const style = (
  id: string,
  name: string,
  note: string,
  bg: string,
  fg: string,
  accent: string,
  muted: string,
  displayFont = "sans",
  bodyFont = "sans",
): Style => ({ id, name, note, theme: { bg, fg, accent, muted, displayFont, bodyFont } });

export const STYLES: Style[] = [
  // The two plain ones first — most people want one of these.
  style("dark", "Dark", "Plain, high contrast", "#101215", "#f2f4f7", "#ffffff", "#8b93a1"),
  style("light", "Light", "Plain, on white", "#ffffff", "#101215", "#101215", "#6b7280"),

  style("ink", "Ink", "Deep navy, warm gold", "#12161c", "#f4f6f8", "#d9a521", "#8b96a5"),
  style(
    "paper",
    "Paper",
    "Cream and rust, serif",
    "#f7f4ed",
    "#1a1a18",
    "#c2410c",
    "#6b665c",
    "serif",
    "serif",
  ),
  style("cobalt", "Cobalt", "Deep blue, sky accent", "#12285a", "#ffffff", "#7ec8ff", "#9fb2d9"),
  style("bloom", "Bloom", "Soft pink, magenta", "#fdf2f8", "#2b1220", "#db2777", "#7a556a"),
  style("forest", "Forest", "Dark green, mint", "#0f2419", "#eef7f0", "#5fd08a", "#8aa896"),
  style(
    "terminal",
    "Terminal",
    "Near-black, monospaced",
    "#0a0a0a",
    "#e6e6e6",
    "#4ade80",
    "#7d7d7d",
    "mono",
    "mono",
  ),
  style("noir", "Noir", "Black and red, heavy", "#0c0c0d", "#fafafa", "#ef4444", "#8a8a8f"),
  style(
    "sand",
    "Sand",
    "Warm beige, editorial",
    "#efe7da",
    "#2a2118",
    "#9a6b3f",
    "#7c6f5f",
    "serif",
    "sans",
  ),
];

/** The same slot system, with a ramp behind it instead of a flat ground. */
const gradientStyle = (
  id: string,
  name: string,
  note: string,
  colours: string[],
  fg: string,
  accent: string,
  muted: string,
  kind: Parameters<typeof makeGradient>[1] = "linear",
  angle = 160,
): Style => ({
  id,
  name,
  note,
  theme: {
    bg: colours[0]!,
    fg,
    accent,
    muted,
    displayFont: "sans",
    bodyFont: "sans",
    bgGradient: makeGradient(colours, kind, angle),
  },
});

STYLES.push(
  gradientStyle("dusk", "Dusk", "Indigo into magenta", ["#1e1b4b", "#6d28d9", "#be185d"], "#ffffff", "#fbbf24", "#c9c2e8"),
  gradientStyle("ember", "Ember", "Deep red into burnt amber", ["#3f0a0a", "#b91c1c", "#92400e"], "#fff7ed", "#fde68a", "#f0c9b0"),
  gradientStyle("deepsea", "Deep sea", "Navy into teal", ["#082f49", "#075985", "#0e7490"], "#f0fdff", "#67e8f9", "#a8d8e4"),
  gradientStyle("halo", "Halo", "A lit centre on near-black", ["#312e81", "#0b1020"], "#eef2ff", "#818cf8", "#a5a9c9", "radial"),
  gradientStyle("dawn", "Dawn", "Cream into rose", ["#fef3c7", "#fda4af"], "#3b0a1a", "#9f1239", "#7c5461", "linear", 200),
);

export const DEFAULT_STYLE = STYLES[0]!;

export const GRADIENT_STYLE_IDS = ["dusk", "ember", "deepsea", "halo", "dawn"];

export const styleById = (id: string): Style => STYLES.find((s) => s.id === id) ?? DEFAULT_STYLE;

/** A starting point for the custom editor: the current style, renamed. */
export const customFrom = (base: Style): Style => ({
  ...base,
  id: "custom",
  name: "Custom",
  note: "Yours",
  theme: { ...base.theme },
});
