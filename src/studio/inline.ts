/**
 * Putting the bytes back in, just before an export.
 *
 * Moving media into a bucket created a problem the roadmap did not mention: the
 * export payload used to be SELF-CONTAINED. Every picture and every uploaded
 * face travelled as a data URL, so the headless Chromium in `server/render.ts`
 * rendered a page that needed nothing from the network. Swap in remote URLs and
 * that quietly stops being true, the renderer starts fetching a customer's
 * storage bucket mid-screenshot, with whatever credentials it does not have, and
 * a slow or failed fetch becomes a slide that ships with a hole in it.
 *
 * So the browser inlines on the way out. It already holds a session that can
 * read these files; the server does not need one, does not need network access,
 * and the markup it receives is exactly as complete as it was before.
 *
 * Fetched payloads are cached for the session, because exporting for LinkedIn
 * and then for Instagram should not download the same photo twice.
 */

import { isDataUrl } from "./assets.js";
import type { Doc, Slide } from "./model.js";

const cache = new Map<string, string>();

const toDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the downloaded file"));
    reader.readAsDataURL(blob);
  });

/**
 * A URL as a data URL.
 *
 * Returns the input unchanged when it cannot be fetched. That is deliberate: a
 * picture that fails here would otherwise take the whole export down, and a
 * remote URL still has a chance of rendering server-side, where an exception has
 * none.
 */
export async function inlineUrl(url: string): Promise<string> {
  if (!url || isDataUrl(url)) return url;

  const hit = cache.get(url);
  if (hit) return hit;

  try {
    const response = await fetch(url);
    if (!response.ok) return url;
    const data = await toDataUrl(await response.blob());
    cache.set(url, data);
    return data;
  } catch {
    return url;
  }
}

/** Every distinct remote URL in a document, fetched once each, in parallel. */
async function urlMap(urls: readonly string[]): Promise<Map<string, string>> {
  const distinct = [...new Set(urls.filter((u) => u && !isDataUrl(u)))];
  const pairs = await Promise.all(distinct.map(async (u) => [u, await inlineUrl(u)] as const));
  return new Map(pairs);
}

/**
 * The document, with every picture carried rather than referenced.
 *
 * Never persisted, this is the copy handed to the serialiser and then dropped.
 * Writing it back would undo the whole point of the library.
 */
export async function inlineDoc(doc: Doc): Promise<Doc> {
  const urls: string[] = [];
  for (const slide of doc.slides) {
    for (const layer of slide.layers) if (layer.src) urls.push(layer.src);
    // The background picture is remote for exactly the same reason as a layer's
    // and is easy to miss because it is not in `layers`. Left out, the export
    // Chromium cannot fetch it and every slide prints without its background.
    if (slide.image?.src) urls.push(slide.image.src);
  }

  const map = await urlMap(urls);
  if (map.size === 0) return doc;

  const slides: Slide[] = doc.slides.map((slide) => {
    const bg = slide.image?.src ? map.get(slide.image.src) : undefined;
    return {
      ...slide,
      ...(slide.image && bg && bg !== slide.image.src
        ? { image: { ...slide.image, src: bg } }
        : {}),
      layers: slide.layers.map((l) => {
        const data = l.src ? map.get(l.src) : undefined;
        return data && data !== l.src ? { ...l, src: data } : l;
      }),
    };
  });

  return { ...doc, slides };
}

/** The same treatment for font files, which are remote for the same reason. */
export async function inlineSources<T extends { src: string }>(items: readonly T[]): Promise<T[]> {
  const map = await urlMap(items.map((i) => i.src));
  if (map.size === 0) return [...items];
  return items.map((i) => {
    const data = map.get(i.src);
    return data && data !== i.src ? { ...i, src: data } : i;
  });
}
