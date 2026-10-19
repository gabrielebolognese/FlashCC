/**
 * `/api/flatten` (Batch 31.6): the parts of a deck an editable export cannot
 * hold as text or shapes, drawn by the export's own renderer.
 *
 * The client sends slides that each hold ONE layer on nothing (or only a
 * slide's background), already serialised by `slideHtml`, with the area of
 * the board each one paints. This renders each with a transparent ground and
 * returns that area as a PNG, which the PowerPoint or SVG file places at the
 * same position. So a gradient headline in the .pptx is the editor's gradient
 * headline, pixel for pixel, and invariant 3 holds: LayerView is still the
 * only painter.
 *
 * Free and open like the PDF export and the contrast check, with a per-address
 * rate limit for abuse that counts nothing a person sees.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { slidePage } from "../src/studio/contrastgrid.js";
import { callerKey, HttpError, json, rateLimit, readJson } from "./http.js";
import { getBrowser } from "./render.js";

const FLATTENS_PER_MINUTE = 10;
/** Every flattened piece of a long deck, with room to spare. */
export const MAX_PIECES = 400;
const MAX_DIMENSION = 4096;

type Clip = { x: number; y: number; w: number; h: number };
export type FlattenBody = { css: string; width: number; height: number; pieces: { html: string; clip: Clip }[] };

/** The clip, whole pixels, inside the board. Null when nothing of it is on the board. */
export function boardClip(c: Clip | undefined, width: number, height: number): Clip | null {
  if (!c || ![c.x, c.y, c.w, c.h].every(Number.isFinite)) return null;
  const x = Math.max(0, Math.floor(c.x));
  const y = Math.max(0, Math.floor(c.y));
  const x1 = Math.min(width, Math.ceil(c.x + c.w));
  const y1 = Math.min(height, Math.ceil(c.y + c.h));
  return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
}

export async function flattenPieces(body: FlattenBody): Promise<(string | null)[]> {
  const context = await (await getBrowser()).newContext({ viewport: { width: body.width, height: body.height }, deviceScaleFactor: 1, colorScheme: "light" });
  try {
    // The client inlines every picture and face first, so the page needs no
    // network, and markup somebody posted never makes this server fetch a URL.
    await context.route("**/*", (route) => (/^(data|blob|about):/.test(route.request().url()) ? route.continue() : route.abort()));
    const page = await context.newPage();
    const out: (string | null)[] = [];
    for (const piece of body.pieces) {
      const clip = boardClip(piece.clip, body.width, body.height);
      if (!clip) {
        out.push(null);
        continue;
      }
      await page.setContent(slidePage(body.width, body.height, body.css, piece.html), { waitUntil: "load" });
      // Layout first, then the faces: see renderSlides for why both.
      await page.evaluate("(document.body.offsetHeight, document.fonts.ready)");
      const png = await page.screenshot({ type: "png", omitBackground: true, clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h } });
      out.push(png.toString("base64"));
    }
    return out;
  } finally {
    await context.close();
  }
}

export async function flatten(req: IncomingMessage, res: ServerResponse): Promise<void> {
  rateLimit(`flatten:${callerKey(req)}`, FLATTENS_PER_MINUTE);
  const body = await readJson<FlattenBody>(req, 80_000_000);
  if (!Array.isArray(body?.pieces) || body.pieces.length === 0) throw new HttpError(400, "Nothing to flatten");
  if (body.pieces.length > MAX_PIECES) throw new HttpError(400, `One file flattens at most ${MAX_PIECES} pieces`);
  if (![body.width, body.height].every((v) => Number.isFinite(v) && v >= 1 && v <= MAX_DIMENSION)) throw new HttpError(400, "Artboard size is out of range");
  if (body.pieces.some((p) => typeof p?.html !== "string")) throw new HttpError(400, "Every piece needs its markup");
  json(res, 200, { images: await flattenPieces({ ...body, css: typeof body.css === "string" ? body.css : "" }) });
}
