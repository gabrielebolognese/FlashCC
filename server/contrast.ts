/**
 * `/api/contrast` (Batch 30.1): the pixels behind a slide's words.
 *
 * The client sends the export payload with every text layer hidden; this
 * renders it with the export's own renderer and returns each slide as a grid
 * of 24px cells of mean colour (`GRID_JS`). Everything else, which cell is
 * behind which glyph, the threshold, the three fixes, is pure and runs in the
 * browser (`legibility.ts`).
 *
 * Free and open, like the PDF export: checking that words can be read is not
 * a feature to sell. A rate limit per address answers abuse, the way the
 * export route does, and it counts nothing a person sees.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { GRID_CELL, GRID_JS, type Grid } from "../src/studio/contrastgrid.js";
import { callerKey, HttpError, json, rateLimit, readJson } from "./http.js";
import { getBrowser, renderSlides, type RenderRequest } from "./render.js";

/** A ten-slide deck checked after every fix is a few a minute; this is generous for a person. */
const CHECKS_PER_MINUTE = 20;

type ContrastBody = Pick<RenderRequest, "slides" | "css" | "width" | "height">;

/** Each slide rendered with the text already hidden by the client, as a grid. */
export async function contrastGrids(body: ContrastBody): Promise<Grid[]> {
  const shots = await renderSlides({ ...body, format: "png", quality: 1 });
  const context = await (await getBrowser()).newContext({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const out: Grid[] = [];
    for (const shot of shots) {
      const args = { src: `data:image/png;base64,${shot.bytes.toString("base64")}`, width: body.width, height: body.height, cell: GRID_CELL };
      out.push((await page.evaluate(`(${GRID_JS})(${JSON.stringify(args)})`)) as Grid);
    }
    return out;
  } finally {
    await context.close();
  }
}

export async function contrast(req: IncomingMessage, res: ServerResponse): Promise<void> {
  rateLimit(`contrast:${callerKey(req)}`, CHECKS_PER_MINUTE);
  const body = await readJson<ContrastBody>(req, 60_000_000);
  if (!Array.isArray(body?.slides) || body.slides.length === 0) throw new HttpError(400, "No slides to check");
  if (body.slides.length > 60) throw new HttpError(400, "One check takes at most 60 slides");
  json(res, 200, { grids: await contrastGrids(body) });
}
