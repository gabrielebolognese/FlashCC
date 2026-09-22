/**
 * Getting a deck out of the browser and into a file.
 *
 * The client does not draw anything here. It serialises the markup LayerView
 * already produces and posts it to the server, which renders it in a real
 * browser at exact size. That keeps the invariant that matters most in this
 * codebase — LayerView is the only painter — and it is why a gradient headline
 * in the editor is the same gradient headline in the export rather than an
 * approximation from a second renderer that drifted.
 *
 * Uploaded faces travel with the markup as @font-face rules carrying their data
 * URLs. They live in this browser's localStorage and the server has never heard
 * of them, so anything not sent is silently substituted with Arial.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { listCustomFonts } from "./fonts.js";
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
function fontCss(): string {
  return listCustomFonts()
    .map((f) => `@font-face { font-family: "${f.family}"; src: url(${f.src}); font-display: block; }`)
    .join("\n");
}

export type ExportResult =
  | { ok: true; filename: string; bytes: number }
  | { ok: false; error: string };

/**
 * Renders server-side and hands the browser a download.
 *
 * The file is fetched rather than linked because the response is a POST — and
 * because the byte count is worth knowing: it feeds back into the size check,
 * which is the one pre-flight rule that cannot be evaluated until the pixels
 * exist.
 */
export async function exportDeck(doc: Doc, platform: Platform): Promise<ExportResult> {
  const body = {
    name: doc.name,
    output: platform.output,
    format: platform.imageFormat,
    quality: platform.quality,
    width: doc.width,
    height: doc.height,
    css: fontCss(),
    slides: doc.slides.map((s) => ({ html: slideHtml(s) })),
  };

  let response: Response;
  try {
    response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Could not reach the export server. Is it running?" };
  }

  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => null);
    const message =
      problem && typeof problem === "object" && "error" in problem
        ? String((problem as { error: unknown }).error)
        : `Export failed (${response.status})`;
    return { ok: false, error: message };
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
