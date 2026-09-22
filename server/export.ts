/**
 * The export route.
 *
 * Returns a single file either way — a PDF for LinkedIn document posts, or a zip
 * of numbered images for anything you upload slide by slide. Numbered, because
 * every upload dialog sorts by filename and a carousel out of order is worse than
 * no carousel.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import JSZip from "jszip";

import { HttpError, readJson } from "./http.js";
import { renderPdf, renderSlides, type RenderRequest } from "./render.js";

type ExportBody = RenderRequest & {
  /** Used for the download filename. */
  name?: string;
  output: "pdf" | "images";
};

/** Filesystem-safe, and recognisable a week later in a downloads folder. */
function slug(name: string | undefined): string {
  const base = (name ?? "carousel").trim().toLowerCase();
  const cleaned = base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 60) || "carousel";
}

const send = (res: ServerResponse, type: string, filename: string, body: Buffer): void => {
  res.writeHead(200, {
    "content-type": type,
    "content-length": body.length,
    "content-disposition": `attachment; filename="${filename}"`,
    // So the browser can read the size and report it back into pre-flight.
    "access-control-expose-headers": "content-length",
  });
  res.end(body);
};

export async function exportDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson<ExportBody>(req, 60_000_000);

  if (body.output !== "pdf" && body.output !== "images") {
    throw new HttpError(400, "output must be pdf or images");
  }

  const name = slug(body.name);

  if (body.output === "pdf") {
    const pdf = await renderPdf(body);
    send(res, "application/pdf", `${name}.pdf`, pdf);
    return;
  }

  const slides = await renderSlides(body);
  const ext = body.format === "jpg" ? "jpg" : "png";
  const zip = new JSZip();

  for (const slide of slides) {
    // Zero-padded so 10 sorts after 9 rather than after 1.
    const n = String(slide.index + 1).padStart(2, "0");
    zip.file(`${n}.${ext}`, slide.bytes);
  }

  // Store, not deflate: PNG and JPEG are already compressed, so deflating them
  // costs time and saves nothing.
  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  send(res, "application/zip", `${name}.zip`, archive);
}
