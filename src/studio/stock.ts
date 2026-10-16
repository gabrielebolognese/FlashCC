/**
 * Stock photos in the browser (21.2): searching through our own server, and
 * turning a chosen photo into something the pool and the library hold.
 *
 * The keys live in `server/stock.ts` and never reach this file, the same rule
 * as the Anthropic key. The reasoning about the providers' terms is there too;
 * what matters here is the consequence: a stock photo is a hotlinked URL plus
 * a credit, never a copy of the file.
 */
import { makeAsset, type Asset } from "./assets.js";
import { uid, type Credit, type MediaItem } from "./model.js";

export type StockProvider = "unsplash" | "pexels";
export const STOCK_LABEL: Record<StockProvider, string> = { unsplash: "Unsplash", pexels: "Pexels" };

/** The server's normalised result. Mirrors `StockPhoto` in server/stock.ts. */
export type StockPhoto = {
  id: string;
  provider: StockProvider;
  thumb: string;
  src: string;
  w: number;
  h: number;
  alt: string;
  colour: string;
  credit: Credit;
  downloadLocation?: string | undefined;
};

export type StockPage = { photos: StockPhoto[]; page: number; more: boolean };

/** Which providers the server holds a key for. Read from `/api/health`. */
export async function stockProviders(): Promise<StockProvider[]> {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return [];
    const body = (await res.json()) as { stock?: Partial<Record<StockProvider, boolean>> };
    return (["unsplash", "pexels"] as const).filter((p) => body.stock?.[p]);
  } catch {
    return [];
  }
}

export async function searchStock(provider: StockProvider, query: string, page = 1): Promise<StockPage> {
  const res = await fetch("/api/stock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, query, page }),
  });
  const body = (await res.json().catch(() => ({}))) as StockPage & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Search failed (${res.status})`);
  return body;
}

/**
 * Tells the provider the photo was used, which Unsplash's terms require.
 * Fire and forget: a failed ping is not a reason to refuse somebody their
 * picture, and there is nothing they could do about it.
 */
export function markUsed(photo: StockPhoto): void {
  if (!photo.downloadLocation) return;
  void fetch("/api/stock/used", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ downloadLocation: photo.downloadLocation }),
  }).catch(() => undefined);
}

const nameOf = (photo: StockPhoto): string =>
  (photo.alt ? photo.alt.slice(0, 60) : `${STOCK_LABEL[photo.provider]} photo`).replace(/\s+/g, " ").trim();

/** A chosen photo as a pool item: the hotlink and the credit, no bytes. */
export function stockMedia(photo: StockPhoto): MediaItem {
  return {
    id: uid("m"),
    name: nameOf(photo),
    src: photo.src,
    w: photo.w,
    h: photo.h,
    bytes: 0,
    credit: photo.credit,
  };
}

/**
 * The same photo as a library entry, so it is on the shelf for the next
 * carousel. Local to this device: see `Asset.remote` for why there is no
 * bucket copy to sync.
 */
export function stockAsset(photo: StockPhoto): Asset {
  return makeAsset({
    kind: "image",
    mime: "image/jpeg",
    name: nameOf(photo),
    remote: photo.src,
    credit: photo.credit,
    w: photo.w,
    h: photo.h,
    folder: "Stock",
    // The provider's own id: choosing the same photo twice is one entry.
    key: photo.id,
  });
}
