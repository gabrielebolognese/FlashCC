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

import { HttpError, json, readJson } from "./http.js";
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

/**
 * The same render, handed back as data rather than as a download.
 *
 * Publishing needs the slides INDIVIDUALLY so each one can be uploaded to its
 * own public URL, and a zip would mean unzipping in the browser to undo work
 * this just did. Base64 rather than a multipart response because the client has
 * to turn each one into bytes for the upload anyway, and one JSON body is one
 * thing to get wrong instead of two.
 *
 * It is the same `renderSlides` underneath, so a published slide and a
 * downloaded one are the same pixels.
 */
export async function renderImages(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson<RenderRequest>(req, 60_000_000);
  const slides = await renderSlides(body);

  json(res, 200, {
    format: body.format === "jpg" ? "jpg" : "png",
    slides: slides.map((s) => ({ index: s.index, base64: s.bytes.toString("base64") })),
  });
}

/**
 * A PDF, handed back as data. LinkedIn wants a document, and Publer's importer
 * takes one at a URL, so a published deck needs the file as well as the pages.
 */
export async function renderDocument(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson<RenderRequest>(req, 60_000_000);
  const pdf = await renderPdf(body);
  json(res, 200, { base64: pdf.toString("base64") });
}

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
