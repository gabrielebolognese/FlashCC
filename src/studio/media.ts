/**
 * The media pool.
 *
 * Images are stored as data URLs inside the document so a project stays
 * self-contained and works offline. That puts them in localStorage, which is a few
 * megabytes total — so every import is downscaled hard before it is kept. Storing
 * originals would fill the quota after three photos and the save would fail silently.
 */
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

/** Downscale to the long edge and re-encode. Returns the original if already small. */
async function shrink(file: File): Promise<{ src: string; w: number; h: number }> {
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
      const { src, w, h } = await shrink(file);
      out.push({
        id: uid("m"),
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Image",
        src,
        w,
        h,
        bytes: src.length,
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
