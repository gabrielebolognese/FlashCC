/**
 * Text measurement.
 *
 * The old code guessed a slide's text height from character count
 * (`ceil(len / 18) * size`), which is wrong the moment a line breaks early or a word
 * is unusually wide — so long hooks overflowed the artboard. This wraps the text the
 * way the browser will, counts the lines that actually result, and derives the height
 * from that.
 *
 * Pure and DOM-free, so it runs identically in Node and in the browser and can be
 * tested. Canvas `measureText` would be exact but only exists in one of those, and a
 * layout that differs between test and production is worse than one that is slightly
 * conservative in both.
 */

/** Per-character advance, in em, for a typical sans face. */
function advance(ch: string): number {
  if (ch === " ") return 0.26;
  if ("iljI|!.,;:'`".includes(ch)) return 0.28;
  if ("ft()[]{}/\\-r".includes(ch)) return 0.36;
  if ("mwMW@".includes(ch)) return 0.86;
  if (ch >= "A" && ch <= "Z") return 0.68;
  if (ch >= "0" && ch <= "9") return 0.56;
  return 0.53;
}

/** Mono is fixed-pitch; serif runs a touch narrower than sans. */
const FAMILY_SCALE: Record<string, number> = { sans: 1, display: 1, serif: 0.97, mono: 1.15 };
const MONO_ADVANCE = 0.6;

/**
 * Deliberately over-estimate by 2%. Predicting one line too many costs a slightly
 * smaller font; predicting one too few puts text off the slide.
 */
const SAFETY = 1.02;

export type Measure = {
  family?: string | undefined;
  /** em, as stored on the layer */
  letterSpacing?: number | undefined;
  uppercase?: boolean | undefined;
};

export function textWidth(text: string, fontSize: number, m: Measure = {}): number {
  const source = m.uppercase ? text.toUpperCase() : text;
  const family = m.family ?? "sans";
  const scale = FAMILY_SCALE[family] ?? 1;
  const tracking = m.letterSpacing ?? 0;

  let em = 0;
  for (const ch of source) {
    em += (family === "mono" ? MONO_ADVANCE : advance(ch) * scale) + tracking;
  }
  return em * fontSize * SAFETY;
}

/**
 * Greedy word wrap, the way a browser breaks a `pre-wrap` block: explicit newlines
 * are hard breaks, and a word too long for the line is broken mid-word rather than
 * allowed to overhang.
 */
export function wrapLines(text: string, fontSize: number, maxWidth: number, m: Measure = {}): string[] {
  if (maxWidth <= 0) return text.length > 0 ? [text] : [];
  const out: string[] = [];

  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      out.push("");
      continue;
    }

    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      if (word === "") continue;
      const candidate = line + word;

      if (textWidth(candidate, fontSize, m) <= maxWidth) {
        line = candidate;
        continue;
      }

      // Whitespace that would start a line is dropped, as the browser drops it.
      if (/^\s+$/.test(word)) {
        if (line !== "") {
          out.push(line);
          line = "";
        }
        continue;
      }

      if (line !== "") {
        out.push(line.trimEnd());
        line = "";
      }

      // A single word wider than the box breaks across lines.
      let rest = word;
      while (textWidth(rest, fontSize, m) > maxWidth && rest.length > 1) {
        let cut = 1;
        while (cut < rest.length && textWidth(rest.slice(0, cut + 1), fontSize, m) <= maxWidth) {
          cut += 1;
        }
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }

    out.push(line.trimEnd());
  }

  return out;
}

export const lineCount = (text: string, fontSize: number, maxWidth: number, m: Measure = {}): number =>
  Math.max(1, wrapLines(text, fontSize, maxWidth, m).length);

export type Fitted = {
  fontSize: number;
  lines: number;
  /** Exactly what the rendered block will occupy. */
  height: number;
  /** True when even the smallest size still exceeds maxHeight. */
  overflows: boolean;
};

/**
 * Largest size from `sizes` (descending) whose real wrapped height fits `maxHeight`.
 * Falls back to the smallest and reports it, so callers can clamp rather than
 * silently run off the slide.
 */
export function fitToBox(
  text: string,
  opts: {
    maxWidth: number;
    maxHeight: number;
    sizes: readonly number[];
    lineHeight: number;
  } & Measure,
): Fitted {
  const { maxWidth, maxHeight, sizes, lineHeight, ...m } = opts;
  const ladder = [...sizes].sort((a, b) => b - a);
  const smallest = ladder[ladder.length - 1] ?? 16;

  for (const fontSize of ladder) {
    const lines = lineCount(text, fontSize, maxWidth, m);
    const height = lines * fontSize * lineHeight;
    if (height <= maxHeight) return { fontSize, lines, height, overflows: false };
  }

  const lines = lineCount(text, smallest, maxWidth, m);
  return {
    fontSize: smallest,
    lines,
    height: lines * smallest * lineHeight,
    overflows: true,
  };
}

/** A descending ladder from `max` to `min`, in even-ish steps. */
export function ladder(max: number, min: number, steps = 12): number[] {
  if (max <= min) return [max];
  const out: number[] = [];
  for (let i = 0; i < steps; i += 1) {
    out.push(Math.round(max - ((max - min) * i) / (steps - 1)));
  }
  return [...new Set(out)];
}

/** Keep a block inside a region: prefer the wanted y, never spill past either edge. */
export function clampY(wantedY: number, height: number, regionY: number, regionH: number): number {
  if (height >= regionH) return regionY;
  return Math.max(regionY, Math.min(wantedY, regionY + regionH - height));
}
