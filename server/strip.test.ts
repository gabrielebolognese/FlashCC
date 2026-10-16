/**
 * The seam pixel test (23.5).
 *
 * A design that crosses a slide edge is two pieces, one per slide. Rendered
 * slide by slide, each side is rasterised on its own; rendered as one strip
 * and sliced, both sides of the seam come from the same bitmap. This renders a
 * spanning shape through the real render path, slices it, and asserts the two
 * columns that meet at the edge match.
 *
 * Skipped, with a note, where no Chromium can be launched.
 */
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeBrowser, renderSlides, stripRuns } from "./render.js";

const W = 400;
const H = 300;

/** A piece of a shape that spans slides 1 and 2 at strip x `sx`: the markup LayerView would give each slide. */
const piece = (x: number, inner: string) =>
  `<div style="position:absolute;left:${x}px;top:93.4px;width:300.7px;height:113.3px;${inner}"></div>`;

/** The hardest case measured: rotated, rounded and graded. */
const SHAPE = "border-radius:56px;background:linear-gradient(90deg,#d9a521,#e5545a);transform:rotate(8deg)";

let launched = true;
beforeAll(async () => {
  try {
    await (await chromium.launch()).close();
  } catch {
    launched = false;
  }
});
afterAll(async () => {
  await closeBrowser();
});

/** Column `x` of each PNG, as RGBA arrays, decoded in a page (the server program has no DOM). */
async function columns(pngs: Buffer[], xs: number[]): Promise<number[][]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const out: number[][] = [];
    for (let k = 0; k < pngs.length; k += 1) {
      out.push(
        (await page.evaluate(`(async () => {
          const img = new Image();
          img.src = "data:image/png;base64,${pngs[k]!.toString("base64")}";
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width; c.height = img.height;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0);
          return Array.from(ctx.getImageData(${xs[k]}, 0, 1, img.height).data);
        })()`)) as number[],
      );
    }
    return out;
  } finally {
    await browser.close();
  }
}

describe("stripRuns", () => {
  it("keeps only consecutive in-range runs longer than one, cut to a screenshot's width", () => {
    const slides = Array.from({ length: 30 }, () => ({ html: "" }));
    expect(stripRuns({ slides, width: 1080, runs: [[0], [1, 2, 3], [5, 7], [8, 99]] })).toEqual([[1, 2, 3]]);
    const long = stripRuns({ slides, width: 1080, runs: [Array.from({ length: 20 }, (_, i) => i)] });
    expect(long[0]).toHaveLength(14);
    expect(long.flat()).toHaveLength(20);
  });
});

/** Renders a shape across the edge of two slides as a sliced strip, and the same shape unbroken. */
async function seam(inner: string) {
  const sx = W - 140.35;
  const bg = (h: string) => `<div style="position:absolute;inset:0;background:#12161c">${h}</div>`;
  const slides = [{ html: bg(piece(sx, inner)) }, { html: bg(piece(sx - W, inner)) }];
  const rendered = await renderSlides({ slides, css: "", width: W, height: H, format: "png", quality: 1, runs: [[0, 1]] });
  const whole = await renderSlides({ slides: [{ html: bg(piece(sx, inner)) }], css: "", width: 2 * W, height: H, format: "png", quality: 1 });
  const [left, right, wholeLeft, wholeRight] = await columns(
    [rendered[0]!.bytes, rendered[1]!.bytes, whole[0]!.bytes, whole[0]!.bytes],
    [W - 1, 0, W - 1, W],
  );
  return { rendered, left: left!, right: right!, wholeLeft: wholeLeft!, wholeRight: wholeRight! };
}

const maxDiff = (a: number[], b: number[]) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i]!)), 0);
const coloured = (col: number[]) => col.filter((v, i) => i % 4 === 0 && v > 150).length;

describe("a seam rendered as one strip and sliced (23.5)", () => {
  it("matches an unbroken drawing of the shape exactly, column for column, at the edge", async (ctx) => {
    if (!launched) return ctx.skip();
    const r = await seam("border-radius:56px;background:linear-gradient(90deg,#d9a521,#e5545a)");
    expect(r.rendered.map((x) => x.index)).toEqual([0, 1]);
    // The shape really crosses: both edge columns carry colour.
    expect(coloured(r.left)).toBeGreaterThan(40);
    expect(coloured(r.right)).toBeGreaterThan(40);
    // Each side of the seam is exactly what one unbroken drawing has there.
    expect(r.left).toEqual(r.wholeLeft);
    expect(r.right).toEqual(r.wholeRight);
  }, 60_000);

  /**
   * Measured, and stated rather than hidden: Chromium rasterises a rotated
   * element differently once anything clips it (overflow, clip-path, even a
   * no-op `inset(0)`), so the anti-aliased pixels of a ROTATED shape at the
   * edge differ from an unbroken drawing: up to 14 levels in 255 for a flat
   * fill, 26 with a gradient and rounded corners, however the strip is
   * clipped (D33). Only on the edge's anti-aliased pixels; held under 32 here
   * so a change that made it worse would fail.
   */
  it("keeps a rotated shape's seam within a few levels of an unbroken drawing", async (ctx) => {
    if (!launched) return ctx.skip();
    const r = await seam(SHAPE);
    expect(coloured(r.left)).toBeGreaterThan(40);
    expect(maxDiff(r.left, r.wholeLeft)).toBeLessThanOrEqual(32);
    expect(maxDiff(r.right, r.wholeRight)).toBeLessThanOrEqual(32);
  }, 60_000);
});
