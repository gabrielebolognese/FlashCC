/**
 * Colour resolution for the template interpreter. Pure arithmetic, no DOM.
 *
 * Templates bind colour by ROLE, never by hex (docs/template-system.md §1.5).
 * This module turns a role into a real colour against the user's brand kit, and
 * derives the two roles that are computed rather than authored: `onAccent` and
 * `hairline`.
 */
import type { BrandKit } from "../doc/types.js";
import type { ColourRole, Intensity } from "../doc/template.js";

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).padStart(6, "0")}`;
}

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The exact crossover where contrast(white, c) === contrast(black, c).
 * Below it, white text wins; above it, black does.
 */
export const isDark = (hex: string): boolean => luminance(hex) < 0.1791;

export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

/**
 * Move `text` toward the ground until it reads as a hairline (CR ~1.35).
 * Mixing toward the ground rather than to grey keeps the palette's temperature.
 */
export function deriveHairline(text: string, ground: string, target = 1.35): string {
  let lo = 0;
  let hi = 1;
  let out = mix(text, ground, 0.85);
  for (let i = 0; i < 18; i += 1) {
    const t = (lo + hi) / 2;
    out = mix(text, ground, t);
    if (contrast(out, ground) > target) lo = t;
    else hi = t;
  }
  return out;
}

/** Perceptual intensity → an alpha that lands at the same apparent weight on any ground. */
const INTENSITY_TARGET: Record<Intensity, number> = { 1: 1.08, 2: 1.18, 3: 1.35, 4: 1.7, 5: 2.2 };

export function derivePatternColour(text: string, ground: string, intensity: Intensity): string {
  return deriveHairline(text, ground, INTENSITY_TARGET[intensity]);
}

export type Palette = {
  bg: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  hairline: string;
  none: string;
};

/**
 * Resolve every colour role against the brand kit and the ground actually beneath
 * the element. `ground` differs from `palette.background` when a role inverts its
 * background, which is why it is a parameter rather than read from the kit.
 */
export function resolvePalette(brand: BrandKit, ground: string): Palette {
  const p = brand.palette;
  const lightest = luminance(p.text) > luminance(p.background) ? p.text : p.background;
  const darkest = luminance(p.text) > luminance(p.background) ? p.background : p.text;
  return {
    bg: p.background,
    text: p.text,
    muted: p.muted,
    accent: p.accent,
    onAccent: isDark(p.accent) ? lightest : darkest,
    hairline: deriveHairline(p.text, ground),
    none: "transparent",
  };
}

export function roleColour(role: ColourRole, palette: Palette): string {
  return palette[role];
}

/** Pick whichever of text/bg scores higher against the fill actually beneath the box. */
export function guardContrast(preferred: string, ground: string, palette: Palette): string {
  if (contrast(preferred, ground) >= 4.5) return preferred;
  const candidates = [preferred, palette.text, palette.bg, palette.onAccent];
  let best = preferred;
  let bestCr = contrast(preferred, ground);
  for (const c of candidates) {
    const cr = contrast(c, ground);
    if (cr > bestCr) {
      best = c;
      bestCr = cr;
    }
  }
  return best;
}
