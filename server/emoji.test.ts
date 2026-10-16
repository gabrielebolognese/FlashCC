/**
 * Emoji that survive the server (22.6).
 *
 * Headless Chromium on a Linux server commonly has no colour emoji font, so an
 * emoji that looks fine in the editor exports as an empty box. The fix is that
 * the export carries the bundled emoji face (Twemoji, COLR) it needs (see
 * src/studio/typefaces.ts); this renders five common emoji through the real
 * render path with exactly that CSS and checks they come out in colour.
 *
 * Skipped, with a note, where no Chromium can be launched.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FACES } from "../src/render/fonts/faces.js";
import { closeBrowser, renderSlides } from "./render.js";

const require = createRequire(import.meta.url);
const EMOJI = "😀🎉🔥👍🚀";

/**
 * The emoji @font-face rule as the export builds it: the bundled Twemoji file,
 * inlined, with the unicode-range the face manifest gives it.
 */
function emojiCss(): string {
  const face = FACES.find((f) => f.family === "FCC Twemoji");
  if (!face) throw new Error("No emoji face in the manifest");
  const data = readFileSync(require.resolve("twemoji-colr-font/twemoji.woff2")).toString("base64");
  return `@font-face { font-family: "${face.family}"; src: url(data:font/woff2;base64,${data}) format("woff2"); unicode-range: ${face.range}; font-display: block; }`;
}

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

describe("emoji on the server (22.6)", () => {
  it("renders five common emoji in colour from the bundled font", async (ctx) => {
    if (!launched) return ctx.skip();
    const [slide] = await renderSlides({
      slides: [
        {
          html: `<div style="position:absolute;left:20px;top:20px;font-family:'FCC Twemoji',sans-serif;font-size:100px;line-height:1">${EMOJI}</div>`,
        },
      ],
      css: emojiCss(),
      width: 700,
      height: 160,
      format: "png",
      quality: 1,
    });
    expect(slide).toBeDefined();

    // Count saturated pixels: a missing glyph is a grey box or nothing; a
    // monochrome fallback is grey; a colour emoji is mostly saturated colour.
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      // A string, not a closure, for the same reason as in render.ts: the
      // server program has no DOM types, and this runs in the page.
      const coloured = (await page.evaluate(`(async () => {
        const img = new Image();
        img.src = "data:image/png;base64,${slide!.bytes.toString("base64")}";
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const max = Math.max(d[i], d[i + 1], d[i + 2]);
          const min = Math.min(d[i], d[i + 1], d[i + 2]);
          if (max - min > 80) n += 1;
        }
        return n;
      })()`)) as number;
      // Five 100px emoji are about 50,000 pixels; most of each is colour.
      expect(coloured).toBeGreaterThan(15000);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
