/**
 * Turning slides into files people can actually upload.
 *
 * The browser sends the markup it is already showing — LayerView's own output,
 * serialised — and this renders it in a real Chromium at exact pixel size. That
 * is the whole design: there is one painter in this codebase, and a second
 * renderer here would drift from it the first week and nobody would notice until
 * a customer's gradient text came out as a black box.
 *
 * Which is also why this is not a canvas library. FlashCC leans on
 * `background-clip: text` for gradient type and on FontFace for uploaded faces,
 * and the html-to-canvas converters are unreliable on exactly those two. A real
 * browser is the only thing guaranteed to agree with the editor.
 *
 * One browser is kept warm across requests. Launching Chromium costs about a
 * second, which is most of the time budget for a ten-slide deck.
 */
import { chromium, type Browser } from "playwright";

import { HttpError } from "./http.js";

export type SlideMarkup = { html: string };

export type RenderRequest = {
  /** One entry per slide, already serialised by the client. */
  slides: SlideMarkup[];
  /** Shared <style> text: the reset, the fonts, anything LayerView relies on. */
  css: string;
  width: number;
  height: number;
  format: "png" | "jpg";
  /** 0-1, JPEG only. */
  quality: number;
};

export type RenderedSlide = { index: number; bytes: Buffer };

const MAX_SLIDES = 300;
const MAX_DIMENSION = 4096;

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
  return browser;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
}

function validate(req: RenderRequest): void {
  if (!Array.isArray(req.slides) || req.slides.length === 0) {
    throw new HttpError(400, "No slides to render");
  }
  if (req.slides.length > MAX_SLIDES) {
    throw new HttpError(400, `Too many slides (${req.slides.length}); the ceiling is ${MAX_SLIDES}`);
  }
  if (
    !Number.isFinite(req.width) ||
    !Number.isFinite(req.height) ||
    req.width < 1 ||
    req.height < 1 ||
    req.width > MAX_DIMENSION ||
    req.height > MAX_DIMENSION
  ) {
    throw new HttpError(400, "Artboard size is out of range");
  }
}

/**
 * The page the slide is rendered into.
 *
 * `margin: 0` and an exactly-sized root matter more than they look: a stray
 * default margin shifts every slide by 8px, which is invisible on screen and
 * obvious once ten of them are swiped through.
 */
const page = (req: RenderRequest, body: string): string => `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: transparent; }
  #slide { position: relative; width: ${req.width}px; height: ${req.height}px; overflow: hidden; }
  ${req.css}
</style>
</head><body><div id="slide">${body}</div></body></html>`;

export async function renderSlides(req: RenderRequest): Promise<RenderedSlide[]> {
  validate(req);

  const b = await getBrowser();
  const context = await b.newContext({
    viewport: { width: req.width, height: req.height },
    deviceScaleFactor: 1,
    // sRGB and no dark-mode surprises: the slide decides its own colours.
    colorScheme: "light",
  });

  try {
    const out: RenderedSlide[] = [];
    const sheet = await context.newPage();

    for (let i = 0; i < req.slides.length; i += 1) {
      const slide = req.slides[i];
      if (!slide) continue;

      await sheet.setContent(page(req, slide.html), { waitUntil: "load" });
      // Uploaded faces arrive as data URLs in the CSS; without this the first
      // slide can screenshot mid-swap and ship in a fallback font.
      //
      // Passed as a string rather than a closure on purpose: this runs in the
      // page, and the server has no DOM lib, so a closure would mean either a
      // cast or pulling DOM types into a process that has no DOM.
      await sheet.evaluate("document.fonts.ready");

      const element = await sheet.$("#slide");
      if (!element) throw new HttpError(500, "Slide root went missing during render");

      const bytes = await element.screenshot(
        req.format === "jpg"
          ? { type: "jpeg", quality: Math.round(req.quality * 100) }
          : { type: "png" },
      );

      out.push({ index: i, bytes });
    }

    await sheet.close();
    return out;
  } finally {
    await context.close();
  }
}

/**
 * A PDF for LinkedIn document posts, one slide per page.
 *
 * Built from rendered JPEGs rather than from live HTML on purpose. LinkedIn
 * rasterises whatever it is given anyway, and PNG pages have been observed
 * converting into a PDF that renders blank — a failure nobody sees until the
 * post is live.
 */
export async function renderPdf(req: RenderRequest): Promise<Buffer> {
  const images = await renderSlides({ ...req, format: "jpg" });

  const pages = images
    .map(
      (img) =>
        `<img src="data:image/jpeg;base64,${img.bytes.toString("base64")}" ` +
        `style="display:block;width:${req.width}px;height:${req.height}px;page-break-after:always">`,
    )
    .join("");

  const b = await getBrowser();
  const context = await b.newContext();
  try {
    const sheet = await context.newPage();
    await sheet.setContent(
      `<!doctype html><html><head><style>
        @page { size: ${req.width}px ${req.height}px; margin: 0; }
        html, body { margin: 0; padding: 0; }
        img:last-child { page-break-after: auto; }
      </style></head><body>${pages}</body></html>`,
      { waitUntil: "load" },
    );

    return await sheet.pdf({
      width: `${req.width}px`,
      height: `${req.height}px`,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await context.close();
  }
}
