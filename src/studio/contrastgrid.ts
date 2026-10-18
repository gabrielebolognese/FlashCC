/**
 * The pixels behind a slide's words, as a grid (Batch 30.1). Shared with the
 * server, so it imports nothing.
 *
 * The server renders a slide with its text hidden through the export's own
 * renderer, then runs `GRID_JS` in a page on the screenshot: every 24px cell's
 * mean colour, row by row. A string because it runs in the page, and the
 * server has no DOM types; the client test runs the same string, so the
 * route and its test cannot sample differently.
 */

/** A slide's ground, as cells of mean colour, three numbers per cell. */
export type Grid = { cell: number; cols: number; rows: number; rgb: number[] };

export const GRID_CELL = 24;

/**
 * `(args) => Promise<Grid>` in the page. A transparent pixel counts as white,
 * which is what an empty slide shows; a slide always paints its own ground.
 */
export const GRID_JS = `async ({ src, width, height, cell }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, width, height).data;
  const cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const sum = new Float64Array(cols * rows * 3), n = new Float64Array(cols * rows);
  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / cell) * cols;
    for (let x = 0; x < width; x += 1) {
      const k = row + Math.floor(x / cell), i = (y * width + x) * 4, a = data[i + 3] / 255;
      sum[k * 3] += data[i] * a + 255 * (1 - a);
      sum[k * 3 + 1] += data[i + 1] * a + 255 * (1 - a);
      sum[k * 3 + 2] += data[i + 2] * a + 255 * (1 - a);
      n[k] += 1;
    }
  }
  const rgb = [];
  for (let k = 0; k < cols * rows; k += 1) for (let c = 0; c < 3; c += 1) rgb.push(Math.round(sum[k * 3 + c] / Math.max(1, n[k])));
  return { cell, cols, rows, rgb };
}`;

/** The page a slide is rendered into: the same root the export's renderer uses. */
export const slidePage = (width: number, height: number, css: string, body: string): string => `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: transparent; }
  #slide { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; }
  ${css}
</style>
</head><body><div id="slide">${body}</div></body></html>`;
