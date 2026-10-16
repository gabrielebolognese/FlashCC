/**
 * Text measurement.
 *
 * The old code guessed a slide's text height from character count
 * (`ceil(len / 18) * size`), which is wrong the moment a line breaks early or a word
 * is unusually wide, so long hooks overflowed the artboard. This wraps the text the
 * way the browser will, counts the lines that actually result, and derives the height
 * from that.
 *
 * Pure and DOM-free, so it runs identically in Node and in the browser and can be
 * tested. Canvas `measureText` would be exact but only exists in one of those, and a
 * layout that differs between test and production is worse than one that is slightly
 * conservative in both.
 *
 * ── Two kinds of face (Batch 22) ─────────────────────────────────────────────
 *
 * A **bundled** face (the pairing library) is measured from its own advances and
 * kerning, generated from the files the browser renders (`typemetrics.ts`), so a
 * line measures within a pixel of what is drawn. A **system** face (the eight
 * stacks a machine already has) is measured by the per-character table below,
 * which is an estimate and keeps its 2% margin.
 *
 * ── Runs ─────────────────────────────────────────────────────────────────────
 *
 * Text may carry emphasis marks (`marks.ts`). They are stripped before measuring,
 * and a `**bold**` run is measured at the weight it is drawn at: a bold run is wider
 * than a regular one, and measuring the string rather than the runs would let every
 * emphasised headline overflow by a few characters (the 22.3 landmine).
 *
 * ── Scripts ──────────────────────────────────────────────────────────────────
 *
 * CJK is square, one em a character, and breaks between almost any two of them,
 * except before closing punctuation and after opening punctuation (kinsoku).
 * Arabic, Hebrew, Cyrillic, Greek and emoji take measured averages from the Noto
 * fallbacks every stack ends with.
 */
import { boldWeight, parseMarks } from "./marks.js";
import { faceFor, FALLBACK_ADVANCE, type Face } from "./typemetrics.js";

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
/** A bundled face is measured, not estimated; the margin only covers subpixel rounding. */
const MEASURED_SAFETY = 1.005;

export type Measure = {
  /**
   * A FONTS id, "sans", "serif", "mono", "inter", NOT a CSS stack.
   *
   * Both tables are keyed by id, so handing this a stack makes every lookup miss
   * and silently measures as sans. That was live in two callers and is exactly
   * the kind of miss that shows up as text overflowing in production and fitting
   * in the tests.
   */
  family?: string | undefined;
  /** The layer's weight. A bundled face is measured at the weight the browser picks. */
  weight?: number | undefined;
  /** em, as stored on the layer */
  letterSpacing?: number | undefined;
  uppercase?: boolean | undefined;
};

/* ── scripts ──────────────────────────────────────────────────────────────── */

export type Script = "latin" | "cjk" | "arabic" | "hebrew" | "cyrillic" | "greek" | "emoji" | "mark" | "other";

const EMOJI = /\p{Extended_Pictographic}/u;

export function scriptOf(ch: string): Script {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 0x0250) return "latin";
  if ((cp >= 0x0300 && cp <= 0x036f) || (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0x200d || (cp >= 0x1f3fb && cp <= 0x1f3ff)) {
    return "mark";
  }
  if (cp >= 0x0370 && cp <= 0x03ff) return "greek";
  if (cp >= 0x1f00 && cp <= 0x1fff) return "greek";
  if (cp >= 0x0400 && cp <= 0x052f) return "cyrillic";
  if ((cp >= 0x0590 && cp <= 0x05ff) || (cp >= 0xfb1d && cp <= 0xfb4f)) return "hebrew";
  if ((cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0x0750 && cp <= 0x077f) || (cp >= 0x08a0 && cp <= 0x08ff) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff)) {
    return "arabic";
  }
  if (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x2e80 && cp <= 0x303f) ||
    (cp >= 0x3040 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff01 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3ffff)
  ) {
    return "cjk";
  }
  if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return "emoji";
  if (EMOJI.test(ch)) return "emoji";
  if (cp < 0x2000) return "latin";
  return "other";
}

/** Right-to-left: the first strong character decides, as `dir="auto"` does in the browser. */
export function isRtl(text: string): boolean {
  for (const ch of text) {
    const s = scriptOf(ch);
    if (s === "arabic" || s === "hebrew") return true;
    if (s === "latin" && /\p{L}/u.test(ch)) return false;
    if (s === "cyrillic" || s === "greek" || s === "cjk") return false;
  }
  return false;
}

/** Closing punctuation and small kana never start a line; opening punctuation never ends one. */
const NO_START = new Set([..."、。，．,.!?！？：；:;）」』】〕〉》〙〗〟’”ー〜ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ・…‥%）"]);
const NO_END = new Set([..."（「『【〔〈《〘〖〝‘“"]);

/* ── glyphs ───────────────────────────────────────────────────────────────── */

/** One character as it will be drawn: its weight comes from the run it sits in. */
type Glyph = { ch: string; weight: number };

function glyphsOf(text: string, m: Measure): Glyph[] {
  const base = m.weight ?? 400;
  const out: Glyph[] = [];
  for (const run of parseMarks(text)) {
    const weight = run.mark === "bold" ? boldWeight(base) : base;
    const source = m.uppercase ? run.text.toUpperCase() : run.text;
    for (const ch of source) out.push({ ch, weight });
  }
  return out;
}

/** The advance of one character in em, before tracking. */
function advanceEm(g: Glyph, prev: Glyph | undefined, m: Measure, face: Face | null): number {
  const script = scriptOf(g.ch);
  // Joiners, variation selectors, skin tones and combining marks draw nothing of
  // their own, and a character after a zero-width joiner is part of the glyph
  // before it (a family emoji is one picture, not five).
  if (script === "mark" || prev?.ch === "‍") return 0;
  if (script === "cjk") return FALLBACK_ADVANCE.cjk / 1000;
  if (script === "emoji") {
    // A flag is two regional indicators and one picture.
    const cp = g.ch.codePointAt(0) ?? 0;
    const prevCp = prev?.ch.codePointAt(0) ?? 0;
    if (cp >= 0x1f1e6 && cp <= 0x1f1ff && prevCp >= 0x1f1e6 && prevCp <= 0x1f1ff) return 0;
    return FALLBACK_ADVANCE.emoji / 1000;
  }
  if (script === "arabic" || script === "hebrew") return FALLBACK_ADVANCE[script] / 1000;

  if (face) {
    const own = face.advance(g.ch);
    if (own !== undefined) return own;
    if (script === "cyrillic" || script === "greek") return face.script(script) ?? FALLBACK_ADVANCE[script] / 1000;
    return FALLBACK_ADVANCE.latin / 1000;
  }

  const family = m.family ?? "sans";
  const scale = FAMILY_SCALE[family] ?? 1;
  // The heuristic table was calibrated at the weight a composition sets; a run
  // heavier than its line is wider by a few percent.
  const heavier = 1 + Math.max(0, g.weight - (m.weight ?? 400)) * 0.0002;
  if (script === "cyrillic" || script === "greek") return (FALLBACK_ADVANCE[script] / 1000) * scale * heavier;
  if (family === "mono") return MONO_ADVANCE;
  return advance(g.ch) * scale * heavier;
}

/** Width of glyphs [from, to) in px, with kerning between neighbours of the same run weight. */
function widthOf(gs: readonly Glyph[], from: number, to: number, fontSize: number, m: Measure): number {
  const tracking = m.letterSpacing ?? 0;
  let em = 0;
  let face: Face | null = null;
  let faceWeight = -1;
  for (let i = from; i < to; i += 1) {
    const g = gs[i]!;
    if (g.weight !== faceWeight) {
      face = faceFor(m.family, g.weight);
      faceWeight = g.weight;
    }
    const prev = i > from ? gs[i - 1] : undefined;
    em += advanceEm(g, prev, m, face) + tracking;
    if (face && prev && prev.weight === g.weight) em += face.kern(prev.ch, g.ch);
  }
  return em * fontSize;
}

const safetyOf = (m: Measure): number => (faceFor(m.family, m.weight ?? 400) ? MEASURED_SAFETY : SAFETY);

/** Width as drawn, with no margin. What the 22.3 "within a pixel" test compares. */
export function rawTextWidth(text: string, fontSize: number, m: Measure = {}): number {
  const gs = glyphsOf(text, m);
  return widthOf(gs, 0, gs.length, fontSize, m);
}

export function textWidth(text: string, fontSize: number, m: Measure = {}): number {
  return rawTextWidth(text, fontSize, m) * safetyOf(m);
}

/* ── wrapping ─────────────────────────────────────────────────────────────── */

type Atom = { from: number; to: number; space: boolean };

/**
 * Break opportunities: a run of spaces, a word, or a single CJK character.
 * Closing punctuation joins the atom before it and opening punctuation the atom
 * after it, so neither is left alone at the wrong end of a line.
 */
function atomsOf(gs: readonly Glyph[], from: number, to: number): Atom[] {
  const raw: Atom[] = [];
  let i = from;
  while (i < to) {
    const ch = gs[i]!.ch;
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < to && /\s/.test(gs[j]!.ch)) j += 1;
      raw.push({ from: i, to: j, space: true });
      i = j;
    } else if (scriptOf(ch) === "cjk" || NO_START.has(ch) || NO_END.has(ch)) {
      raw.push({ from: i, to: i + 1, space: false });
      i += 1;
    } else {
      let j = i + 1;
      while (j < to) {
        const c = gs[j]!.ch;
        if (/\s/.test(c) || scriptOf(c) === "cjk" || NO_START.has(c) || NO_END.has(c)) break;
        j += 1;
      }
      raw.push({ from: i, to: j, space: false });
      i = j;
    }
  }

  const out: Atom[] = [];
  for (let k = 0; k < raw.length; k += 1) {
    const a = raw[k]!;
    const first = gs[a.from]!.ch;
    const prev = out[out.length - 1];
    if (!a.space && prev && !prev.space && NO_START.has(first)) {
      prev.to = a.to;
      continue;
    }
    if (prev && !prev.space && NO_END.has(gs[prev.to - 1]!.ch) && !a.space) {
      prev.to = a.to;
      continue;
    }
    out.push({ ...a });
  }
  return out;
}

const textOf = (gs: readonly Glyph[], from: number, to: number): string =>
  gs
    .slice(from, to)
    .map((g) => g.ch)
    .join("");

/**
 * Greedy wrap, the way a browser breaks a `pre-wrap` block: explicit newlines
 * are hard breaks, spaces and CJK characters are break opportunities, and a
 * word too long for the line is broken mid-word rather than allowed to overhang.
 * Returns the lines as plain text (marks gone, case as drawn).
 */
export function wrapLines(text: string, fontSize: number, maxWidth: number, m: Measure = {}): string[] {
  const gs = glyphsOf(text, m);
  if (maxWidth <= 0) return gs.length > 0 ? [textOf(gs, 0, gs.length)] : [];
  const safety = safetyOf(m);
  const fits = (from: number, to: number) => widthOf(gs, from, to, fontSize, m) * safety <= maxWidth;
  const out: string[] = [];

  let p = 0;
  while (p <= gs.length) {
    let end = p;
    while (end < gs.length && gs[end]!.ch !== "\n") end += 1;

    if (textOf(gs, p, end).trim() === "") {
      out.push("");
    } else {
      let lineFrom = -1;
      let lineTo = -1;
      const flush = () => {
        if (lineFrom >= 0) out.push(textOf(gs, lineFrom, lineTo).trimEnd());
        lineFrom = -1;
        lineTo = -1;
      };

      for (const atom of atomsOf(gs, p, end)) {
        if (atom.space) {
          // Spaces never cause a break by themselves; at the start of a line the
          // browser drops them, at the end they hang.
          if (lineFrom >= 0) lineTo = atom.to;
          continue;
        }
        if (lineFrom < 0) {
          lineFrom = atom.from;
          lineTo = atom.from;
        }
        if (fits(lineFrom, atom.to)) {
          lineTo = atom.to;
          continue;
        }
        if (lineTo > lineFrom && textOf(gs, lineFrom, lineTo).trim() !== "") {
          flush();
          lineFrom = atom.from;
          lineTo = atom.from;
          if (fits(lineFrom, atom.to)) {
            lineTo = atom.to;
            continue;
          }
        }
        // A single atom wider than the box breaks across lines.
        let rest = atom.from;
        while (rest < atom.to && !fits(rest, atom.to)) {
          let cut = rest + 1;
          while (cut < atom.to && fits(rest, cut + 1)) cut += 1;
          out.push(textOf(gs, rest, cut));
          rest = cut;
        }
        lineFrom = rest;
        lineTo = atom.to;
      }
      if (lineFrom >= 0) flush();
      else out.push("");
    }
    p = end + 1;
  }

  return out;
}

export const lineCount = (text: string, fontSize: number, maxWidth: number, m: Measure = {}): number =>
  Math.max(1, wrapLines(text, fontSize, maxWidth, m).length);

/* ── a layer, measured ────────────────────────────────────────────────────── */

/** The fields of a text layer that change how it measures. */
export type TextLike = {
  fontFamily?: string | undefined;
  fontWeight?: number | undefined;
  letterSpacing?: number | undefined;
  uppercase?: boolean | undefined;
  fontSize?: number | undefined;
  textEffect?: string | undefined;
};

/**
 * The one way to measure a layer. There used to be four copies of this (pre-flight,
 * split, reflow, tidy), and one of them passed a CSS stack as the family (the F1 bug,
 * back again in reflow.ts) and so measured everything as sans.
 */
export const layerMeasure = (l: TextLike): Measure => ({
  family: l.fontFamily,
  // 600 is what `LayerView` draws a text layer with no weight at.
  weight: l.fontWeight ?? 600,
  letterSpacing: l.letterSpacing,
  uppercase: l.uppercase,
});

/** Horizontal padding a label box (22.4) puts either side of every line. Counts in measurement. */
export const labelPad = (fontSize: number): number => Math.round(fontSize * 0.28);

/** How much narrower than its box a layer's text wraps. */
export const textInset = (l: TextLike, fontSize = l.fontSize ?? 64): number =>
  l.textEffect === "label" ? labelPad(fontSize) * 2 : 0;

/** Lines a text layer wraps to at a size and width, effects included. */
export const layerLines = (l: TextLike & { text?: string | undefined }, fontSize: number, width: number): number =>
  lineCount(l.text ?? "", fontSize, width - textInset(l, fontSize), layerMeasure(l));

/* ── fitting ──────────────────────────────────────────────────────────────── */

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
