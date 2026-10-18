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
import { isSpanning, runs } from "./spans.js";
import { renderToStaticMarkup } from "react-dom/server";

import { authHeader } from "./bearer.js";
import { readRefusal } from "./gate.js";
import { listCustomFonts } from "./fonts.js";
import { bundledFaceCss } from "./typefaces.js";
import { inlineDoc, inlineSources } from "./inline.js";
import { LayerView } from "./LayerView.js";
import type { Doc, Slide } from "./model.js";
import { slidePaint } from "./paint.js";
import { entrancesFor, movingFrames, slideFrames, slideLuma, transitionOf, videoTarget, wrapEntrance, type Entrance, type MotionSettings } from "./motion.js";
import { platformById, type Platform, type PlatformId } from "./platforms.js";
import { reflowDoc } from "./reflow.js";
import { fitToSafeArea } from "./safearea.js";
import { reseal } from "./furniture.js";

/** The paint on the slide itself, as inline CSS rather than a React style object. */
function backgroundCss(slide: Slide): string {
  const paint = slidePaint(slide) as Record<string, string | undefined>;
  return Object.entries(paint)
    .filter(([, v]) => typeof v === "string" && v !== "")
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v}`)
    .join("; ");
}

export function slideHtml(slide: Slide, entrances?: ReadonlyMap<string, Entrance>): string {
  const layers = slide.layers
    .filter((l) => l.visible)
    .map((l) => {
      const markup = renderToStaticMarkup(<LayerView layer={l} />);
      // A video's entrances (26.3) wrap the SAME markup: the painter is unchanged.
      return entrances ? wrapEntrance(markup, l, entrances.get(l.id), entrances.get(`${l.id}#mark`)) : markup;
    })
    .join("");

  return `<div style="position:absolute; inset:0; ${backgroundCss(slide)}">${layers}</div>`;
}

/**
 * Every uploaded face, and every bundled face the deck draws with (Batch 22),
 * inlined, so the server can use fonts it does not have. The bundled half is
 * what makes an emoji or a Japanese line export as it looks in the editor.
 */
async function fontCss(doc: Doc): Promise<string> {
  const [faces, bundled] = await Promise.all([inlineSources(listCustomFonts()), bundledFaceCss(doc)]);
  return [
    ...faces.map((f) => `@font-face { font-family: "${f.family}"; src: url(${f.src}); font-display: block; }`),
    bundled,
  ].join("\n");
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
  /** Slides joined by a design across their edges, rendered as one strip and sliced (23.5). */
  runs?: number[][] | undefined;
  /**
   * One line per slide, for `alt.txt` in the zip. Omitted when nothing has
   * been written, so a deck with no alt text gets no empty file.
   */
  alt?: string[] | undefined;
};

/**
 * Everything the render route needs, with nothing left pointing outward.
 *
 * Shared by the download path and the publish path so there is one serialiser,
 * for the same reason there is one painter: two would drift, and the difference
 * would only ever show up in whichever one is used less.
 */
export async function renderPayload(doc: Doc, platform: Platform): Promise<RenderPayload> {
  const [carried, css] = await Promise.all([inlineDoc(doc), fontCss(doc)]);
  return {
    name: doc.name,
    output: platform.output,
    format: platform.imageFormat,
    quality: platform.quality,
    width: doc.width,
    height: doc.height,
    css,
    slides: carried.slides.map((s) => ({ html: slideHtml(s) })),
    ...(isSpanning(carried) ? { runs: runs(carried) } : {}),
    // Read from `carried`, not `doc`: that is the version the pictures were
    // inlined into, and the two have to describe the same slides.
    ...(carried.slides.some((s) => (s.alt ?? "").trim())
      ? { alt: carried.slides.map((s) => s.alt ?? "") }
      : {}),
  };
}

export type ExportResult =
  | { ok: true; filename: string; bytes: number }
  | { ok: false; error: string };

export type RenderedFile =
  | { ok: true; filename: string; blob: Blob }
  | { ok: false; error: string };

/**
 * Renders server-side and returns the file, without handing it to the browser.
 *
 * Split out of `exportDeck` for the multi-destination export, which renders
 * several of these and packs them into one zip before anything is saved.
 */
export async function renderFile(doc: Doc, platform: Platform): Promise<RenderedFile> {
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

  return { ok: true, filename, blob };
}

/** Hands the browser a file it already has. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Renders server-side and hands the browser a download.
 *
 * The file is fetched rather than linked because the response is a POST, and
 * because the byte count is worth knowing: it feeds back into the size check,
 * which is the one pre-flight rule that cannot be evaluated until the pixels
 * exist.
 *
 * `repack` gets the file before it is saved, which is how a four-image
 * destination turns one numbered zip into a folder per post.
 */
export async function exportDeck(
  doc: Doc,
  platform: Platform,
  repack?: (file: { filename: string; blob: Blob }) => Promise<{ filename: string; blob: Blob }>,
): Promise<ExportResult> {
  const rendered = await renderFile(doc, platform);
  if (!rendered.ok) return rendered;

  const file = repack ? await repack(rendered) : rendered;
  saveBlob(file.blob, file.filename);
  // The size check is about what the platform receives, which is the rendered
  // file, not the repacked one.
  return { ok: true, filename: file.filename, bytes: rendered.blob.size };
}

/* ── video (Batch 26) ─────────────────────────────────────────────────────── */

export type VideoPayload = {
  name: string;
  docId: string;
  css: string;
  width: number;
  height: number;
  target: string;
  backdrop: string;
  transition: MotionSettings["transition"];
  slides: { html: string; frames: number; moving: number; luma: number | null }[];
  audio?: { base64: string; type: string } | undefined;
};

/**
 * The deck in the video's shape. Reflow is the default (26.2): the same path
 * as a canvas resize, safe area and furniture included, so a 4:5 deck becomes
 * a 9:16 one with its headline clear of TikTok's caption band. Letterbox sends
 * the deck as it is and the server fits it, centred.
 */
export function videoDoc(doc: Doc, motion: MotionSettings): Doc {
  const target = videoTarget(motion.target);
  if (motion.fit === "letterbox" || (doc.width === target.w && doc.height === target.h)) return doc;
  const reflowed = reflowDoc(doc, target.w, target.h);
  if (!target.platform) return reflowed;
  const platform = platformById(target.platform as PlatformId);
  return reseal(fitToSafeArea(reflowed, platform), { platform, replace: true });
}

/**
 * What the video route renders: the same serialised LayerView markup as every
 * other export, each slide's frames from the reading-time formula, and the
 * frames where something moves. Durations are counted on the deck as written,
 * so the runtime the timing strip shows is the runtime of the file.
 */
export async function videoPayload(doc: Doc, motion: MotionSettings, audio?: VideoPayload["audio"]): Promise<VideoPayload> {
  const shaped = videoDoc(doc, motion);
  const [carried, css] = await Promise.all([inlineDoc(shaped), fontCss(shaped)]);
  const n = doc.slides.length;
  const first = doc.slides[0];
  return {
    name: doc.name,
    docId: doc.id,
    css,
    width: carried.width,
    height: carried.height,
    target: motion.target,
    // Behind a letterboxed slide: the deck's own first colour rather than black bars.
    backdrop: first && /^#[0-9a-f]{3,8}$/i.test(first.background) ? first.background : "#000000",
    // Reduced motion (30.5) turns a push or a zoom into a fade, and every entrance into a fade.
    transition: transitionOf(motion),
    slides: carried.slides.map((s, i) => {
      const entrances = entrancesFor(s, motion.animation, motion.reduced);
      return {
        html: slideHtml(s, entrances),
        frames: slideFrames(doc.slides[i]!, i, n),
        moving: movingFrames(entrances),
        // Each slide's ground, so the server can refuse a deck that flashes (30.5).
        luma: slideLuma(doc.slides[i]!),
      };
    }),
    ...(audio ? { audio } : {}),
  };
}
