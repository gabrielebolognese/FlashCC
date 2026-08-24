import type { FontRole } from "../../doc/types.js";

/**
 * Pure fit estimator (architecture.md Q1, answered as "pure"). No DOM, no measuring —
 * runs identically in the browser and in Node, so the phase-2 converter can resolve
 * final type sizes without a browser.
 *
 * Average advance widths in em, deliberately a shade wide: over-estimating predicts more
 * lines and therefore picks a smaller step, which fails safe. The DOM still does the real
 * line breaking; this only chooses which ladder step to hand it.
 */
const ADVANCE: Record<FontRole, number> = { sans: 0.52, serif: 0.5, mono: 0.6 };

export function countLines(
  text: string,
  fontSize: number,
  maxWidth: number,
  family: FontRole,
  tracking: number,
): number {
  const charW = fontSize * (ADVANCE[family] + tracking);
  const maxChars = Math.max(4, Math.floor(maxWidth / charW));
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 0;

  let lines = 1;
  let len = 0;
  for (const word of words) {
    const add = len === 0 ? word.length : word.length + 1;
    if (len + add > maxChars) {
      lines += 1;
      len = word.length;
    } else {
      len += add;
    }
  }
  return lines;
}

export type Fitted = { fontSize: number; lines: number; height: number; overflow: boolean };

/** Walk the ladder from the largest step; take the first that fits. */
export function fitText(
  text: string,
  ladder: readonly number[],
  maxWidth: number,
  maxHeight: number,
  family: FontRole,
  tracking: number,
  lineHeightRatio: number,
): Fitted {
  const smallest = ladder[ladder.length - 1] ?? 16;

  for (const fontSize of ladder) {
    const lines = countLines(text, fontSize, maxWidth, family, tracking);
    const height = lines * fontSize * lineHeightRatio;
    if (height <= maxHeight) return { fontSize, lines, height, overflow: false };
  }

  const lines = countLines(text, smallest, maxWidth, family, tracking);
  return {
    fontSize: smallest,
    lines,
    height: lines * smallest * lineHeightRatio,
    overflow: true,
  };
}
