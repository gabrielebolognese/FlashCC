/**
 * Turning slides into files people can actually upload.
 *
 * The browser sends the markup it is already showing, LayerView's own output,
 * serialised, and this renders it in a real Chromium at exact pixel size. That
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

import { slidePage } from "../src/studio/contrastgrid.js";
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
  /**
   * Runs of consecutive slides joined by a design across their edges (23.5),
   * e.g. [[0], [1, 2, 3], [4]]. A run longer than one is rendered as ONE strip
   * and sliced, so both sides of every seam come from the same pixels.
   * Absent, every slide renders alone, as before.
   */
  runs?: number[][] | undefined;
};

export type RenderedSlide = { index: number; bytes: Buffer };

const MAX_SLIDES = 300;
const MAX_DIMENSION = 4096;

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({
    args: ["--font-render-hinting=none"],
    // The server decides when the browser goes, not Playwright: its own
    // SIGTERM handler closed Chromium at once, killing the video render a
    // deploy's grace period exists to let finish (26.5). index.ts closes it.
    handleSIGTERM: false,
    handleSIGINT: false,
    handleSIGHUP: false,
  });
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
// Shared with the contrast check's test (30.1), so both render into the same root.
const page = (req: RenderRequest, body: string): string => slidePage(req.width, req.height, req.css, body);

/** The widest strip rendered in one screenshot; Chromium's limit is about 16k pixels. */
const MAX_STRIP_PX = 16_000;

/** Only well-formed runs: consecutive, in range, each slide once. Anything else renders slide by slide. */
export function stripRuns(req: Pick<RenderRequest, "runs" | "slides" | "width">): number[][] {
  const n = req.slides.length;
  const per = Math.max(1, Math.floor(MAX_STRIP_PX / req.width));
  const out: number[][] = [];
  const seen = new Set<number>();
  for (const run of req.runs ?? []) {
    if (!Array.isArray(run) || run.length < 2) continue;
    if (!run.every((v, k) => Number.isInteger(v) && v >= 0 && v < n && (k === 0 || v === run[k - 1]! + 1) && !seen.has(v))) continue;
    // A strip wider than one screenshot is cut into pieces that are; the seam
    // where it is cut renders slide by slide, the old way.
    for (let k = 0; k < run.length; k += per) {
      const part = run.slice(k, k + per);
      if (part.length > 1) out.push(part);
      for (const v of part) seen.add(v);
    }
  }
  return out;
}

/**
 * One run of slides as one picture, sliced (23.5).
 *
 * Screenshotting slides one at a time leaves a faint 1px seam on a shape that
 * crosses an edge, because each side is rasterised on its own. Here the slides
 * sit side by side in one page, each clipped exactly as it is alone, one
 * screenshot is taken, and the slices are cut from that one bitmap.
 */
async function renderStrip(req: RenderRequest, run: number[], context: import("playwright").BrowserContext): Promise<RenderedSlide[]> {
  const W = req.width;
  const H = req.height;
  const body = run
    .map(
      (i, k) =>
        `<div style="position:absolute;left:${k * W}px;top:0;width:${W}px;height:${H}px;overflow:hidden">${req.slides[i]!.html}</div>`,
    )
    .join("");
  const sheet = await context.newPage();
  try {
    await sheet.setViewportSize({ width: W * run.length, height: H });
    await sheet.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: transparent; }
  #strip { position: relative; width: ${W * run.length}px; height: ${H}px; overflow: hidden; }
  ${req.css}
</style></head><body><div id="strip">${body}</div></body></html>`,
      { waitUntil: "load" },
    );
    await sheet.evaluate("(document.body.offsetHeight, document.fonts.ready)");
    const element = await sheet.$("#strip");
    if (!element) throw new HttpError(500, "Strip root went missing during render");
    const full = (await element.screenshot({ type: "png" })).toString("base64");

    // Sliced in the same browser: it decodes and encodes without a dependency,
    // and every slice is cut from the one bitmap above.
    const type = req.format === "jpg" ? "image/jpeg" : "image/png";
    const slices = (await sheet.evaluate(`(async () => {
      const img = new Image();
      img.src = "data:image/png;base64,${full}";
      await img.decode();
      const out = [];
      for (let k = 0; k < ${run.length}; k += 1) {
        const c = document.createElement("canvas");
        c.width = ${W};
        c.height = ${H};
        c.getContext("2d").drawImage(img, k * ${W}, 0, ${W}, ${H}, 0, 0, ${W}, ${H});
        out.push(c.toDataURL("${type}", ${Math.max(0, Math.min(1, req.quality))}).split(",")[1]);
      }
      return out;
    })()`)) as string[];
    return run.map((i, k) => ({ index: i, bytes: Buffer.from(slices[k]!, "base64") }));
  } finally {
    await sheet.close();
  }
}

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
    const strips = stripRuns(req);
    const inStrip = new Set(strips.flat());
    for (const run of strips) out.push(...(await renderStrip(req, run, context)));

    const sheet = await context.newPage();

    for (let i = 0; i < req.slides.length; i += 1) {
      const slide = req.slides[i];
      if (!slide || inStrip.has(i)) continue;

      await sheet.setContent(page(req, slide.html), { waitUntil: "load" });
      // Uploaded faces arrive as data URLs in the CSS; without this the first
      // slide can screenshot mid-swap and ship in a fallback font.
      //
      // Passed as a string rather than a closure on purpose: this runs in the
      // page, and the server has no DOM lib, so a closure would mean either a
      // cast or pulling DOM types into a process that has no DOM.
      //
      // Layout is forced first (reading offsetHeight). A face only starts
      // loading once layout asks for one of its characters, and until then
      // `document.fonts.ready` is already resolved, so waiting on it alone let
      // a slide screenshot during the face's invisible `block` period and ship
      // blank text: found by the emoji test (22.6), true of uploads as well.
      await sheet.evaluate("(document.body.offsetHeight, document.fonts.ready)");

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
    return out.sort((a, b) => a.index - b.index);
  } finally {
    await context.close();
  }
}

/**
 * A PDF for LinkedIn document posts, one slide per page.
 *
 * Built from rendered JPEGs rather than from live HTML on purpose. LinkedIn
 * rasterises whatever it is given anyway, and PNG pages have been observed
 * converting into a PDF that renders blank, a failure nobody sees until the
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
