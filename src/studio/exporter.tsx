/**
 * Getting a deck out of the browser and into a file.
 *
 * The client does not draw anything here. It serialises the markup LayerView
 * already produces and posts it to the server, which renders it in a real
 * browser at exact size. That keeps the invariant that matters most in this
 * codebase, LayerView is the only painter, and it is why a gradient headline
 * in the editor is the same gradient headline in the export rather than an
 * approximation from a second renderer that drifted.
 *
 * Uploaded faces travel with the markup as @font-face rules carrying their data
 * URLs. They live in this browser's library and the server has never heard of
 * them, so anything not sent is silently substituted with Arial.
 *
 * Since the asset library, pictures and faces are no longer data URLs in the
 * editor, they are signed URLs into a bucket. So the payload is INLINED first,
 * by `inline.ts`, and the server goes on receiving a page that needs nothing
 * from the network. See the note there for why that matters more than it looks.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { authHeader } from "./billing.js";
import { readRefusal } from "./gate.js";
import { listCustomFonts } from "./fonts.js";
import { inlineDoc, inlineSources } from "./inline.js";
import { LayerView } from "./LayerView.js";
import type { Doc, Slide } from "./model.js";
import { slidePaint } from "./paint.js";
import type { Platform } from "./platforms.js";

/** The paint on the slide itself, as inline CSS rather than a React style object. */
function backgroundCss(slide: Slide): string {
  const paint = slidePaint(slide) as Record<string, string | undefined>;
  return Object.entries(paint)
    .filter(([, v]) => typeof v === "string" && v !== "")
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v}`)
    .join("; ");
}

function slideHtml(slide: Slide): string {
  const layers = slide.layers
    .filter((l) => l.visible)
    .map((l) => renderToStaticMarkup(<LayerView layer={l} />))
    .join("");

  return `<div style="position:absolute; inset:0; ${backgroundCss(slide)}">${layers}</div>`;
}

/** Every uploaded face, inlined, so the server can use fonts it does not have. */
async function fontCss(): Promise<string> {
  const faces = await inlineSources(listCustomFonts());
  return faces
    .map((f) => `@font-face { font-family: "${f.family}"; src: url(${f.src}); font-display: block; }`)
    .join("\n");
}

export type RenderPayload = {
  name: string;
  output: "pdf" | "images";
  format: "jpg" | "png";
  quality: number;
  width: number;
  height: number;
  css: string;
  slides: { html: string }[];
};

/**
 * Everything the render route needs, with nothing left pointing outward.
 *
 * Shared by the download path and the publish path so there is one serialiser,
 * for the same reason there is one painter: two would drift, and the difference
 * would only ever show up in whichever one is used less.
 */
export async function renderPayload(doc: Doc, platform: Platform): Promise<RenderPayload> {
  const [carried, css] = await Promise.all([inlineDoc(doc), fontCss()]);
  return {
    name: doc.name,
    output: platform.output,
    format: platform.imageFormat,
    quality: platform.quality,
    width: doc.width,
    height: doc.height,
    css,
    slides: carried.slides.map((s) => ({ html: slideHtml(s) })),
  };
}

export type ExportResult =
  | { ok: true; filename: string; bytes: number }
  | { ok: false; error: string };

/**
 * Renders server-side and hands the browser a download.
 *
 * The file is fetched rather than linked because the response is a POST, and
 * because the byte count is worth knowing: it feeds back into the size check,
 * which is the one pre-flight rule that cannot be evaluated until the pixels
 * exist.
 */
export async function exportDeck(doc: Doc, platform: Platform): Promise<ExportResult> {
  const body = await renderPayload(doc, platform);

  /*
   * The token is OPTIONAL on this one call, and that is the whole design.
   *
   * PDF export is the free tier and works with no account at all, so a missing
   * session must not stop the request, it just means the server will refuse the
   * numbered-image path. Sent when there is one, omitted when there is not.
   */
  let headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    headers = await authHeader();
  } catch {
    /* Signed out. PDF still works; images will come back 402. */
  }

  let response: Response;
  try {
    response = await fetch("/api/export", { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    return { ok: false, error: "Could not reach the export server. Is it running?" };
  }

  if (!response.ok) {
    // Opens the pricing panel on a 402 as a side effect, and still returns the
    // message so the dialog has something to show in place.
    return { ok: false, error: (await readRefusal(response)).message };
  }

  const blob = await response.blob();
  const filename =
    response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
    `carousel.${platform.output === "pdf" ? "pdf" : "zip"}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return { ok: true, filename, bytes: blob.size };
}
