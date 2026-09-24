/**
 * The export route.
 *
 * Returns a single file either way, a PDF for LinkedIn document posts, or a zip
 * of numbered images for anything you upload slide by slide. Numbered, because
 * every upload dialog sorts by filename and a carousel out of order is worse than
 * no carousel.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import JSZip from "jszip";

import { bearer, callerKey, HttpError, json, rateLimit, readJson } from "./http.js";
import { requireCaller, requirePro } from "./supabase.js";
import { renderPdf, renderSlides, type RenderRequest } from "./render.js";

type ExportBody = RenderRequest & {
  /** Used for the download filename. */
  name?: string;
  output: "pdf" | "images";
  /**
   * One description per slide, for `alt.txt` alongside the images.
   *
   * Not part of `RenderRequest`, because nothing about rendering reads it: the
   * pictures are identical whether it is present or not. It rides on the export
   * request because that is the only journey it can take.
   */
  alt?: string[];
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
  // Publishing already needs an account to upload the result anywhere, so
  // requiring one here takes nothing away and closes an open Playwright route.
  await requireCaller(bearer(req));
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
  await requireCaller(bearer(req));
  const body = await readJson<RenderRequest>(req, 60_000_000);
  const pdf = await renderPdf(body);
  json(res, 200, { base64: pdf.toString("base64") });
}

/**
 * How many full renders one address may ask for in a minute.
 *
 * A ten-slide deck is ten headless screenshots, so this is generous for a person
 * and useless to a script. It exists because this route CANNOT require an
 * account, see below.
 */
const EXPORTS_PER_MINUTE = 10;

export async function exportDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  /*
   * This is the one route that stays open, and the reason is the product rather
   * than an oversight.
   *
   * "Make carousels and export them" IS the free tier, and CLAUDE.md commits to
   * everything except drafting working with no key and no account at all.
   * Requiring a bearer token here would break that to fix an abuse problem, so
   * abuse is answered with a rate limit instead.
   *
   * The paid half is enforced separately and only on the image path: a bearer
   * token is OPTIONAL, absent means PDF only, and present is checked.
   */
  rateLimit(`export:${callerKey(req)}`, EXPORTS_PER_MINUTE);

  const body = await readJson<ExportBody>(req, 60_000_000);

  if (body.output !== "pdf" && body.output !== "images") {
    throw new HttpError(400, "output must be pdf or images");
  }

  // Free is "PDF export"; Pro is "PNG and PDF export". The numbered-image path
  // is the one that costs money, so it is the one that checks, and it checks on
  // the SERVER, because the platform picker is a dropdown anyone can edit.
  if (body.output === "images") {
    await requirePro(bearer(req), "Exporting numbered images");
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

  /*
   * Alt text travels as a file because it has nowhere else to go.
   *
   * It cannot be embedded in a JPEG in a way Instagram or TikTok reads, and
   * neither has an API to push it to: a person types it into the upload form,
   * one image at a time. Numbered to match the image files so the pairing needs
   * no explaining.
   *
   * Only when something was actually written. An `alt.txt` full of blank lines
   * is worse than no file, because it looks like the feature ran.
   */
  if (Array.isArray(body.alt) && body.alt.some((t) => t?.trim())) {
    const lines = body.alt.map(
      (t, i) => `${String(i + 1).padStart(2, "0")}.${ext}  ${t?.trim() || "(no description)"}`,
    );
    zip.file("alt.txt", lines.join("\n") + "\n");
  }

  // Store, not deflate: PNG and JPEG are already compressed, so deflating them
  // costs time and saves nothing.
  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  send(res, "application/zip", `${name}.zip`, archive);
}
