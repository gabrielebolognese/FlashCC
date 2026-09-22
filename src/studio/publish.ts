/**
 * Publishing: rendered slides at public URLs, and a row that already knows them.
 *
 * This is the missing first half of the bulk pipeline. Every scheduler's CSV
 * importer wants `https://…/03.jpg` and every scheduler expects you to have
 * found that URL somewhere else — a WordPress install, a Drive share, a CDN. The
 * render already happens here, so the hosting may as well.
 *
 * Three steps, in this order, because each one can fail and the failure has to
 * be legible:
 *
 *   1. render  — the same `renderSlides` the download uses, asked for as data
 *   2. host    — each slide to the public `slides` bucket under the owner's id
 *   3. row     — a `PublishedCarousel`, which `schedulers.ts` turns into a line
 *
 * PUBLIC, deliberately. A signed URL cannot do this job: the scheduler fetches
 * the picture days later with no credentials. Nothing lands in that bucket
 * except by pressing Publish, which is the moment "anyone with the link" is the
 * thing being asked for. See 04-storage.sql.
 */

import { publicUrl, SLIDES_BUCKET, storageReady, uploadObject } from "./cloud.js";
import { renderPayload } from "./exporter.js";
import type { Doc } from "./model.js";
import type { Platform } from "./platforms.js";
import { altFromTexts, type PublishedCarousel } from "./schedulers.js";
import { captionOf, deckTexts } from "./transcript.js";

export type PublishResult =
  | { ok: true; carousel: PublishedCarousel }
  | { ok: false; error: string };

type RenderedResponse = { format: "jpg" | "png"; slides: { index: number; base64: string }[] };

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png" };

/** base64 → bytes. The upload wants bytes and the wire gave us text. */
function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function postSlides(payload: unknown): Promise<RenderedResponse> {
  const response = await fetch("/api/slides", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `output` is meaningless to this route — it always returns images — but the
    // payload is shared with the download path and trimming it here would mean
    // two shapes to keep in step.
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => null);
    const message =
      problem && typeof problem === "object" && "error" in problem
        ? String((problem as { error: unknown }).error)
        : `Render failed (${response.status})`;
    throw new Error(message);
  }

  return (await response.json()) as RenderedResponse;
}

/**
 * The deck as one PDF, also hosted.
 *
 * Publer's `Post subtype` accepts a PDF at a URL, which is the shape LinkedIn
 * wanted in the first place — a document post rather than ten pictures. Best
 * effort: a failure here loses the document row and keeps the picture row, which
 * is still a working import.
 */
async function renderDocumentPdf(payload: unknown): Promise<Uint8Array | null> {
  try {
    const response = await fetch("/api/document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { base64?: string };
    return body.base64 ? decode(body.base64) : null;
  } catch {
    return null;
  }
}

/**
 * Slide paths are `<user>/<doc>/NN.<ext>`, zero padded.
 *
 * Padded for the same reason the zip export pads: every listing anywhere sorts
 * by name, and a carousel whose tenth slide sorts after its first is a carousel
 * posted in the wrong order. Deterministic, so republishing a deck REPLACES its
 * slides rather than accumulating a new set beside the old one — a URL already
 * pasted into a scheduler keeps working and shows the newer artwork.
 */
export const slidePath = (userId: string, docId: string, index: number, ext: string): string =>
  `${userId}/${docId}/${String(index + 1).padStart(2, "0")}.${ext}`;

export async function publishDeck(
  doc: Doc,
  platform: Platform,
  userId: string,
  options: { caption?: string | undefined; scheduledFor?: string | null | undefined } = {},
): Promise<PublishResult> {
  if (!storageReady()) {
    return { ok: false, error: "Publishing needs an account. Sign in and try again." };
  }

  let payload: Awaited<ReturnType<typeof renderPayload>>;
  let rendered: RenderedResponse;
  try {
    payload = await renderPayload(doc, platform);
    rendered = await postSlides(payload);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not render the deck" };
  }

  const ext = rendered.format;
  const mime = MIME[ext] ?? "image/jpeg";
  const urls: string[] = [];

  for (const slide of rendered.slides) {
    const path = slidePath(userId, doc.id, slide.index, ext);
    const result = await uploadObject(SLIDES_BUCKET, path, decode(slide.base64), mime);
    if (!result.ok) {
      const missing = /bucket/i.test(result.error);
      return {
        ok: false,
        error: missing
          ? "The slides bucket does not exist yet. Run supabase/04-storage.sql."
          : result.error,
      };
    }
    urls.push(publicUrl(SLIDES_BUCKET, path));
  }

  // A LinkedIn deck gets its PDF hosted as well, so the row can offer the
  // document shape to the one importer that takes it.
  let documentUrl: string | undefined;
  if (platform.output === "pdf") {
    const pdf = await renderDocumentPdf(payload);
    if (pdf) {
      const path = `${userId}/${doc.id}/deck.pdf`;
      const result = await uploadObject(SLIDES_BUCKET, path, pdf, "application/pdf");
      if (result.ok) documentUrl = publicUrl(SLIDES_BUCKET, path);
    }
  }

  // Alt text comes from the words already on each slide. Asking for it produces
  // empty fields; a headline IS the slide's description.
  const texts = deckTexts(doc);
  const alts = doc.slides.map((_, i) => altFromTexts([texts[i] ?? ""], i, doc.slides.length));

  return {
    ok: true,
    carousel: {
      id: doc.id,
      name: doc.name,
      // Slides 1 and 2 and the closer, which is the text post creators already
      // hand-roll out of the deck. The hook alone reads as a truncated caption.
      caption: options.caption ?? (captionOf(doc, { platform: platform.id }) || doc.name),
      urls,
      alts,
      platform: platform.id,
      scheduledFor: options.scheduledFor ?? null,
      ...(documentUrl ? { documentUrl } : {}),
    },
  };
}

export type BatchProgress = { done: number; total: number; name: string };

/**
 * A whole batch, one deck at a time.
 *
 * Sequential rather than parallel on purpose: each deck is a headless Chromium
 * render of up to ten full-size pages, and firing twenty at once at one warm
 * browser is how a render server falls over. The progress callback exists
 * because this is minutes, not seconds, and a spinner with no numbers on it
 * reads as a hang.
 *
 * A deck that fails does not stop the rest. Getting nineteen carousels and a
 * named failure is strictly better than getting nothing and a stack trace.
 */
export async function publishDecks(
  docs: readonly Doc[],
  platform: Platform,
  userId: string,
  onProgress?: (p: BatchProgress) => void,
): Promise<{ published: PublishedCarousel[]; failures: { name: string; error: string }[] }> {
  const published: PublishedCarousel[] = [];
  const failures: { name: string; error: string }[] = [];

  for (let i = 0; i < docs.length; i += 1) {
    const doc = docs[i];
    if (!doc) continue;

    onProgress?.({ done: i, total: docs.length, name: doc.name });
    const result = await publishDeck(doc, platform, userId);
    if (result.ok) published.push(result.carousel);
    else failures.push({ name: doc.name, error: result.error });
  }

  onProgress?.({ done: docs.length, total: docs.length, name: "" });
  return { published, failures };
}

/** Hands the browser a file without going near the server. */
export function downloadText(filename: string, text: string, mime = "text/csv"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
