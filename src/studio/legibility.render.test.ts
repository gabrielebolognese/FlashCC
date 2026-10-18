/**
 * Done when (30.1): white text over a photo with a bright patch behind it is
 * flagged, and each fix makes the same check pass.
 *
 * Rendered for real: the slide's markup is `slideHtml`'s, the page is the
 * export's (`slidePage`), and the grid comes from `GRID_JS`, the script the
 * route runs. Skipped, with a note, where no Chromium can be launched.
 */
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GRID_CELL, GRID_JS, slidePage, type Grid } from "./contrastgrid.js";
import { slideHtml } from "./exporter.js";
import { cellsUnder, feedScale, inkRects, moveFix, pixelContrast, ratio, roleFix, applyRole, scrimFix, withoutText } from "./legibility.js";
import { makeDoc, makeLayer, type Doc } from "./model.js";
import { platformById, safeBox } from "./platforms.js";

const W = 1080;
const H = 1350;

/** Mostly dark, with a bright patch on the grid's own cells, behind the end of the headline. */
const PHOTO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#0b0e14"/><rect x="480" y="552" width="216" height="144" fill="#f2efe6"/></svg>`,
)}`;

const instagram = platformById("instagram");

function deck(): Doc {
  const photo = { ...makeLayer("image", { x: 0, y: 0, w: W, h: H }, "none"), id: "photo", name: "Photo", src: PHOTO };
  const words = {
    ...makeLayer("text", { x: 96, y: 560, w: 888, h: 140 }, "#ffffff"),
    id: "words",
    name: "Headline",
    text: "Golden hour",
    fontSize: 96,
    fontWeight: 700,
    lineHeight: 1.2,
  };
  return { ...makeDoc("photo"), width: W, height: H, slides: [{ id: "s1", name: "Cover", background: "#0b0e14", layers: [photo, words] }] };
}

let browser: Browser | null = null;

beforeAll(async () => {
  try {
    browser = await chromium.launch();
  } catch {
    browser = null;
  }
});
afterAll(async () => {
  await browser?.close();
});

/** What `/api/contrast` does: render with the text hidden, screenshot, sample. */
async function grid(doc: Doc): Promise<Grid> {
  const page = await browser!.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  try {
    await page.setContent(slidePage(W, H, "", slideHtml(withoutText(doc).slides[0]!)), { waitUntil: "load" });
    const shot = await (await page.$("#slide"))!.screenshot({ type: "png" });
    const args = { src: `data:image/png;base64,${shot.toString("base64")}`, width: W, height: H, cell: GRID_CELL };
    return (await page.evaluate(`(${GRID_JS})(${JSON.stringify(args)})`)) as Grid;
  } finally {
    await page.close();
  }
}

const scale = feedScale({ width: W, height: H }, instagram);

describe("contrast over a photo, rendered (30.1)", () => {
  it("flags the bright patch behind two letters, though the box passes on average", async (ctx) => {
    if (!browser) return ctx.skip();
    const doc = deck();
    const g = await grid(doc);
    const issues = pixelContrast(doc, [g], scale);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ layerId: "words", need: 3, flat: false });
    expect(issues[0]!.ratio).toBeLessThan(1.2);
    // The worst cell is inside the patch.
    expect(issues[0]!.at.x).toBeGreaterThanOrEqual(480);

    // On average the ground is dark, and white would pass: the reason to judge the worst cell.
    const cells = inkRects(doc.slides[0]!.layers[1]!).flatMap((r) => cellsUnder(g, r));
    const mean = cells.reduce((m, c) => ({ r: m.r + c.colour.r / cells.length, g: m.g + c.colour.g / cells.length, b: m.b + c.colour.b / cells.length }), { r: 0, g: 0, b: 0 });
    expect(ratio({ r: 255, g: 255, b: 255 }, mean)).toBeGreaterThan(3);
  });

  it("fix 1, a scrim behind the layer, makes the same check pass", async (ctx) => {
    if (!browser) return ctx.skip();
    const doc = deck();
    const fixed = scrimFix(doc, 0, "words", await grid(doc), scale)!;
    expect(fixed.slides[0]!.layers.map((l) => l.name)).toEqual(["Photo", "Text scrim", "Headline"]);
    expect(pixelContrast(fixed, [await grid(fixed)], scale)).toEqual([]);
  });

  it("fix 2, the nearest brand colour role that passes, makes the same check pass", async (ctx) => {
    if (!browser) return ctx.skip();
    const doc = deck();
    const g = await grid(doc);
    const roles = ["#ffffff", "#0b0e14", "#c2410c", "#9aa3b2"];
    const colour = roleFix(doc.slides[0]!, doc.slides[0]!.layers[1]!, g, roles, scale);
    expect(colour).toBe("#c2410c");
    const fixed = applyRole(doc, 0, "words", colour!);
    expect(pixelContrast(fixed, [await grid(fixed)], scale)).toEqual([]);
  });

  it("fix 3, moving the layer to where the photo passes inside the safe area, makes the same check pass", async (ctx) => {
    if (!browser) return ctx.skip();
    const doc = deck();
    const fixed = moveFix(doc, 0, "words", await grid(doc), safeBox(instagram, W, H), scale)!;
    const moved = fixed.slides[0]!.layers[1]!;
    expect([moved.x, moved.y]).not.toEqual([96, 560]);
    expect(pixelContrast(fixed, [await grid(fixed)], scale)).toEqual([]);
  });
});
