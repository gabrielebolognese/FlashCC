/**
 * Visual styles: a palette plus the two typefaces that carry it.
 *
 * A style is applied once, at generation, and then it is gone — every colour and font
 * it chose lands on ordinary layers you can change afterwards. It is a starting
 * point, not a theme the document keeps referring back to.
 */
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

export const DEFAULT_STYLE = STYLES[0]!;

export const styleById = (id: string): Style => STYLES.find((s) => s.id === id) ?? DEFAULT_STYLE;

/** A starting point for the custom editor: the current style, renamed. */
export const customFrom = (base: Style): Style => ({
  ...base,
  id: "custom",
  name: "Custom",
  note: "Yours",
  theme: { ...base.theme },
});
