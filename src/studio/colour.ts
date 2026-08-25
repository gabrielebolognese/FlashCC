/**
 * Colour maths for deriving readable text from an arbitrary background.
 *
 * Note on "inverted": literal RGB inversion does not give contrast. Mid-grey
 * (#808080) inverts to #7f7f7f — a contrast ratio of about 1.0, which is invisible.
 * What is wanted is the *maximum-contrast* pole, so this picks near-black or
 * near-white by measured ratio, which is the same thing on the colours where
 * inversion happens to work and correct on the ones where it does not.
 */

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((c(r) << 16) | (c(g) << 8) | c(b)).toString(16).padStart(6, "0")}`;
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

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t,
  });
}

/** Softened poles — pure black and white read as harsh against a tinted ground. */
const INK = "#0e1013";
const PAPER = "#f8fafc";

export const AA = 4.5;

/**
 * The maximum-contrast pole, softened where it can afford to be.
 *
 * Around the luminance crossover (~0.179) neither softened pole clears 4.5:1 — a
 * mid-blue like #6767e4 tops out at 4.33 — so those backgrounds get the pure pole
 * instead. Pure black and white guarantee at least 4.58:1 against any colour, which
 * is the real floor for this. Everywhere else keeps the softer ink.
 */
export function bestText(bg: string): string {
  const soft = contrast(PAPER, bg) >= contrast(INK, bg) ? PAPER : INK;
  if (contrast(soft, bg) >= AA) return soft;
  const hard = luminance(bg) < 0.1791 ? "#ffffff" : "#000000";
  return contrast(hard, bg) > contrast(soft, bg) ? hard : soft;
}

/**
 * Blend `from` toward `ground` until it lands just above `target`, so muted text is
 * visibly quieter than body text without becoming unreadable.
 */
export function fadeToContrast(from: string, ground: string, target: number): string {
  if (contrast(from, ground) <= target) return from;
  let lo = 0;
  let hi = 1;
  let out = from;
  for (let i = 0; i < 20; i += 1) {
    const t = (lo + hi) / 2;
    out = mix(from, ground, t);
    if (contrast(out, ground) > target) lo = t;
    else hi = t;
  }
  return out;
}

/** Text and muted text for any background the user picks. */
export function textFor(bg: string): { fg: string; muted: string } {
  const fg = bestText(bg);
  return { fg, muted: fadeToContrast(fg, bg, 4.6) };
}

export const isValidHex = (v: string): boolean => /^#[0-9a-f]{6}$/i.test(v.trim());
