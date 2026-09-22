/**
 * The media pool — preparing a file for use, and nothing else.
 *
 * Every import is downscaled hard before it is kept. That began as a localStorage
 * quota problem and survives the move to a bucket for a better reason: a 12
 * megapixel phone photo behind a 400px slot is bandwidth nobody gets anything
 * for, and it has to be re-fetched on every device.
 *
 * WHERE the prepared bytes go is `library.ts`'s decision, not this file's. This
 * one only knows how to read a picture, shrink it, and say how big it is.
 */
import { dataUrlBytes } from "./assets.js";
import { uid, type MediaItem } from "./model.js";

/** Long edge, in pixels. Comfortably past 1080 artboard width at 2x. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;
export const MAX_POOL = 24;

export const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif";

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Not a readable image"));
    img.src = src;
  });

export type Prepared = { src: string; w: number; h: number };

/** Downscale to the long edge and re-encode. Returns the original if already small. */
export async function prepareImage(file: File): Promise<Prepared> {
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  const { naturalWidth: w, naturalHeight: h } = img;

  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  // A GIF re-encoded to a canvas loses its animation, so leave small ones alone.
  if (scale === 1 && original.length < 400_000) return { src: original, w, h };

  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { src: original, w, h };
  ctx.drawImage(img, 0, 0, cw, ch);

  // PNG keeps transparency; everything else is smaller as JPEG.
  const type = file.type === "image/png" || file.type === "image/webp" ? "image/webp" : "image/jpeg";
  const out = canvas.toDataURL(type, QUALITY);
  return out.length < original.length ? { src: out, w: cw, h: ch } : { src: original, w, h };
}

export async function importFiles(files: readonly File[]): Promise<MediaItem[]> {
  const out: MediaItem[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    try {
      const { src, w, h } = await prepareImage(file);
      out.push({
        id: uid("m"),
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Image",
        src,
        w,
        h,
        // The decoded size, not the length of the base64 string it arrived as.
        // `src.length` over-reported every picture by a third, which meant every
        // size shown to the user and every quota decision made from it was wrong.
        bytes: dataUrlBytes(src),
      });
    } catch {
      // One bad file should not abandon the rest of the drop.
    }
  }
  return out;
}

export const poolBytes = (media: MediaItem[]): number =>
  media.reduce((n, m) => n + m.bytes, 0);

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
