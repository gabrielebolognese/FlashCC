/**
 * A palette from an image (21.6): pick a logo, a product or a photo, get a
 * proposed brand theme back.
 *
 * Deterministic all the way through: median-cut quantisation over a 5-bit
 * histogram (no random k-means seeding), ties broken by colour value, so the
 * same picture always proposes the same palette. The roles are then chosen,
 * not just listed:
 *
 *   - **accent** is the most colourful swatch with a real share of the
 *     picture, because the accent is what the brand is recognised by;
 *   - **bg** keeps the hue of the dominant colour, pushed to a light or a dark
 *     extreme depending on which way the picture leans;
 *   - **fg** is the readable pole for that ground, tinted towards the accent;
 *   - **muted** is fg faded towards the ground until just above AA.
 *
 * Every proposal passes contrast (Batch 30's rule): fg and muted on bg at 4.5
 * or more, the accent on bg at 3 or more, which is the large-text and
 * graphics threshold an accent is used at.
 */
import { AA, bestText, contrast, fadeToContrast, hexToRgb, luminance, mix, rgbToHex } from "./colour.js";
import type { Theme } from "./presets.js";

export type Swatch = { hex: string; share: number };

/** Below this alpha a pixel is background, not picture: a logo's transparent margin. */
const OPAQUE = 128;

/** Median cut to at most `count` swatches, most common first. */
export function quantise(rgba: Uint8ClampedArray | Uint8Array, count = 8): Swatch[] {
  // 5 bits per channel: 32768 buckets, small enough to hold, fine enough to keep hues apart.
  const hist = new Map<number, number>();
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < OPAQUE) continue;
    const key = ((rgba[i]! >> 3) << 10) | ((rgba[i + 1]! >> 3) << 5) | (rgba[i + 2]! >> 3);
    hist.set(key, (hist.get(key) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return [];

  type Px = { r: number; g: number; b: number; n: number };
  const all: Px[] = [...hist.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, n]) => ({ r: (k >> 10) & 31, g: (k >> 5) & 31, b: k & 31, n }));

  let boxes: Px[][] = [all];
  while (boxes.length < count) {
    // Split the box with the widest channel range, weighted by population; ties by index.
    let best = -1;
    let bestScore = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const span = rangeOf(box);
      const score = span.size * Math.log2(1 + box.reduce((s, p) => s + p.n, 0));
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best === -1) break;
    const box = boxes[best]!;
    const ch = rangeOf(box).channel;
    const sorted = [...box].sort((a, b) => a[ch] - b[ch] || a.r - b.r || a.g - b.g || a.b - b.b);
    const half = sorted.reduce((s, p) => s + p.n, 0) / 2;
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < sorted.length - 1; i += 1) {
      acc += sorted[i]!.n;
      if (acc >= half) {
        cut = i + 1;
        break;
      }
      cut = i + 1;
    }
    boxes = [...boxes.slice(0, best), sorted.slice(0, cut), sorted.slice(cut), ...boxes.slice(best + 1)];
  }

  return boxes
    .map((box) => {
      const n = box.reduce((s, p) => s + p.n, 0);
      const avg = (k: "r" | "g" | "b") => (box.reduce((s, p) => s + p[k] * p.n, 0) / n) * 8 + 4;
      return { hex: rgbToHex({ r: avg("r"), g: avg("g"), b: avg("b") }), share: n / total };
    })
    .sort((a, b) => b.share - a.share || a.hex.localeCompare(b.hex));
}

function rangeOf(box: { r: number; g: number; b: number }[]): { channel: "r" | "g" | "b"; size: number } {
  let out: { channel: "r" | "g" | "b"; size: number } = { channel: "r", size: -1 };
  for (const channel of ["r", "g", "b"] as const) {
    let lo = 31;
    let hi = 0;
    for (const p of box) {
      lo = Math.min(lo, p[channel]);
      hi = Math.max(hi, p[channel]);
    }
    if (hi - lo > out.size) out = { channel, size: hi - lo };
  }
  return out;
}

/**
 * The picture's most vivid colour, found before averaging can lose it.
 *
 * Median cut averages a box, and a box that holds a tiger's orange fur and the
 * jungle's browns comes out brown: the one colour a person would call the
 * picture's accent is gone. So the vivid pixels (chroma at least 0.25) are
 * binned by hue on their own, and the heaviest hue is averaged within itself.
 * Null when under 1% of the picture is vivid: a grey photo has no accent to
 * find, and inventing one would be worse.
 */
export function vividOf(rgba: Uint8ClampedArray | Uint8Array, minShare = 0.01): Swatch | null {
  const BINS = 12;
  const bins = Array.from({ length: BINS }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < OPAQUE) continue;
    total += 1;
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if ((max - min) / 255 < 0.25) continue;
    const d = max - min;
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const bin = bins[Math.floor((h / 6) * BINS) % BINS]!;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bin.n += 1;
  }
  let best = -1;
  bins.forEach((bin, i) => {
    if (bin.n > (bins[best]?.n ?? 0)) best = i;
  });
  const top = bins[best];
  if (!top || total === 0 || top.n / total < minShare) return null;
  return { hex: rgbToHex({ r: top.r / top.n, g: top.g / top.n, b: top.b / top.n }), share: top.n / total };
}

/** HSL saturation, 0 to 1. Colourfulness is what makes an accent. */
export function saturation(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return 0;
  return (max - min) / (1 - Math.abs(2 * l - 1));
}

/** Push a colour towards white or black until its luminance crosses `target`. */
function towards(hex: string, pole: "#ffffff" | "#000000", target: number): string {
  const lighter = pole === "#ffffff";
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const c = mix(hex, pole, t);
    if (lighter ? luminance(c) >= target : luminance(c) <= target) return c;
  }
  return pole;
}

/** The proposed theme for a set of swatches. Pure, so the contrast promise is tested. */
export function proposeTheme(swatches: readonly Swatch[], vivid: Swatch | null = null): Theme | null {
  if (swatches.length === 0) return null;
  const dominant = swatches[0]!.hex;

  // The picture's vivid hue when it has one; otherwise the most colourful
  // swatch that is more than a speck; failing that, the dominant one.
  const candidates = swatches.filter((s) => s.share >= 0.03);
  const accentSource =
    vivid?.hex ??
    [...candidates].sort((a, b) => saturation(b.hex) - saturation(a.hex) || b.share - a.share)[0]?.hex ??
    dominant;

  const light = luminance(dominant) > 0.35;
  const bg = light ? towards(mix(dominant, "#ffffff", 0.6), "#ffffff", 0.82) : towards(mix(dominant, "#000000", 0.55), "#000000", 0.02);

  // Text keeps a trace of the accent so it belongs to the palette, but never at the cost of AA.
  const pole = bestText(bg);
  let fg = mix(pole, accentSource, 0.08);
  if (contrast(fg, bg) < AA + 2) fg = pole;

  // Darkened on a light ground, lightened on a dark one, only as far as it
  // takes to reach 3:1, so it keeps as much of its own colour as it can.
  let accent = accentSource;
  const away = light ? "#000000" : "#ffffff";
  for (let t = 0.02; t <= 1.0001 && contrast(accent, bg) < 3; t += 0.02) accent = mix(accentSource, away, t);

  const muted = fadeToContrast(fg, bg, 4.6);
  return { bg, fg, accent, muted };
}

/** The swatches of a picture already decoded to RGBA. */
export const paletteOf = (rgba: Uint8ClampedArray, count = 8): { swatches: Swatch[]; theme: Theme | null } => {
  const swatches = quantise(rgba, count);
  return { swatches, theme: proposeTheme(swatches, vividOf(rgba)) };
};

/** Decodes a picture in the browser at a small size, which is all a palette needs. */
export async function paletteFromImage(src: string): Promise<{ swatches: Swatch[]; theme: Theme | null }> {
  const res = await fetch(src, { mode: "cors" });
  if (!res.ok) throw new Error(`Could not read the picture (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const k = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw off screen");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return paletteOf(ctx.getImageData(0, 0, w, h).data);
}
