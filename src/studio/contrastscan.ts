/**
 * Asking the renderer what is behind the words (30.1), for the slides whose
 * ground is not a flat colour. The deck goes as the export sends it, with
 * every text layer hidden, so the grid is the picture, the scrim and the
 * shapes, and none of the letters being judged.
 */
import type { Grid } from "./contrastgrid.js";
import { renderPayload } from "./exporter.js";
import { slidesNeedingPixels, withoutText } from "./legibility.js";
import type { Doc } from "./model.js";
import { PLATFORMS } from "./platforms.js";

/** One grid per slide, null where the ground is flat and needs no rendering. */
export async function scanContrast(doc: Doc, signal?: AbortSignal): Promise<(Grid | null)[]> {
  const need = slidesNeedingPixels(doc);
  const out: (Grid | null)[] = doc.slides.map(() => null);
  if (need.length === 0) return out;
  const hidden = withoutText(doc);
  // The platform only chooses a file format, which this never makes.
  const payload = await renderPayload({ ...hidden, slides: need.map((i) => hidden.slides[i]!) }, PLATFORMS[0]!);
  const res = await fetch("/api/contrast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(signal ? { signal } : {}),
    body: JSON.stringify({ css: payload.css, width: payload.width, height: payload.height, slides: payload.slides }),
  });
  if (!res.ok) throw new Error(res.status === 429 ? "Checked a lot in the last minute. Try again shortly." : "The contrast check could not reach the renderer.");
  const body = (await res.json()) as { grids?: Grid[] };
  need.forEach((slide, k) => {
    out[slide] = body.grids?.[k] ?? null;
  });
  return out;
}
