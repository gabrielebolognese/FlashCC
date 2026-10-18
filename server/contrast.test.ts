/**
 * `/api/contrast` renders through the export's own renderer and samples the
 * screenshot with `GRID_JS` (30.1). Skipped, with a note, where no Chromium
 * can be launched; the full done-when lives in legibility.render.test.ts.
 */
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contrastGrids } from "./contrast.js";
import { closeBrowser } from "./render.js";

let launched = true;
beforeAll(async () => {
  try {
    const b = await chromium.launch();
    await b.close();
  } catch {
    launched = false;
  }
});
afterAll(async () => {
  await closeBrowser();
});

describe("the contrast route's grid", () => {
  it("is each 24px cell's mean colour, row by row", async (ctx) => {
    if (!launched) return ctx.skip();
    const html =
      '<div style="position:absolute;inset:0;background:#000000"></div>' +
      '<div style="position:absolute;left:0;top:0;width:48px;height:24px;background:#ffffff"></div>' +
      '<div style="position:absolute;left:72px;top:24px;width:24px;height:24px;background:#ff0000"></div>';
    const [g] = await contrastGrids({ slides: [{ html }], css: "", width: 96, height: 48 });
    expect(g).toMatchObject({ cell: 24, cols: 4, rows: 2 });
    expect(g!.rgb).toEqual([255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0]);
  });
});
