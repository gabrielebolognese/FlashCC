/**
 * Stock photos, through the providers' own APIs (21.2).
 *
 * ── Why this is not the Batch 13 rejection ──────────────────────────────────
 *
 * Batch 13 refused to fetch somebody else's page. A stock API is the opposite
 * case: the owner offering, under written terms, to license exactly this use.
 * The keys stay here, so the browser never holds them, and nothing on this
 * route fetches anything but the two APIs it names.
 *
 * ── Built to the stricter of the two guidelines ─────────────────────────────
 *
 * Unsplash's API guidelines are the stricter, so both providers are built to
 * them:
 *
 *   - **Hotlink, never copy.** Unsplash requires the image URLs it returns to
 *     be used as they are, so its views are counted. Pexels allows either. The
 *     picture is therefore a REFERENCE (`src` is the provider's CDN URL), not a
 *     file in our bucket, and `inline.ts` fetches it at export the way it
 *     already does for any remote picture.
 *   - **Report the download.** Unsplash requires its `download_location`
 *     endpoint to be called when somebody uses a photo. `stockUsed` does that,
 *     and only for URLs on Unsplash's own API host.
 *   - **Credit the photographer and the source, with links.** Unsplash wants
 *     "Photo by NAME on Unsplash" with both linked and a referral tag on each.
 *     Pexels asks for a link to Pexels and a credit to the photographer where
 *     possible. Every result carries a `credit` that satisfies both.
 *
 * ── Invariant 7 ─────────────────────────────────────────────────────────────
 *
 * The ceiling is per caller and sits well above anything a person searching by
 * hand reaches. It exists so a script cannot burn the application's quota with
 * the provider, which would take search away from everybody.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { bearer, callerKey, HttpError, json, rateLimit, readJson } from "./http.js";
import { hasSecretKey, requireCaller } from "./supabase.js";

export const STOCK_PROVIDERS = ["unsplash", "pexels"] as const;
export type StockProvider = (typeof STOCK_PROVIDERS)[number];

/** What the browser gets back, the same shape whichever provider answered. */
export type StockPhoto = {
  id: string;
  provider: StockProvider;
  /** Small, for the picker grid. */
  thumb: string;
  /** The hotlink that goes on the slide, large enough for a full-bleed 1080 by 1350. */
  src: string;
  w: number;
  h: number;
  alt: string;
  /** The provider's average colour, painted while the thumb loads. */
  colour: string;
  credit: StockCredit;
  /** Unsplash only: the endpoint to call when the photo is used. */
  downloadLocation?: string | undefined;
};

export type StockCredit = {
  provider: StockProvider;
  /** The photographer, as the provider names them. */
  name: string;
  /** The photographer's page, with the referral tag where the provider asks for one. */
  url: string;
  /** The photo's own page on the provider. */
  page: string;
};

export type StockPage = { photos: StockPhoto[]; page: number; more: boolean };

/** Unsplash asks for these on every link back to it. */
const UTM = "utm_source=flashcc&utm_medium=referral";
export const withReferral = (url: string): string => (url ? `${url}${url.includes("?") ? "&" : "?"}${UTM}` : url);

export const PER_PAGE = 24;
const SEARCHES_PER_HOUR = 600;
const HOUR_MS = 3_600_000;

/**
 * Read when called, not at module load: the same reason `draftConfigured` is a
 * function. See env.ts.
 */
const keyFor = (provider: StockProvider): string | undefined =>
  (provider === "unsplash" ? process.env.UNSPLASH_ACCESS_KEY : process.env.PEXELS_API_KEY)?.trim() || undefined;

/** Which providers this server can search, for `/api/health`. */
export const stockConfigured = (): Record<StockProvider, boolean> => ({
  unsplash: Boolean(keyFor("unsplash")),
  pexels: Boolean(keyFor("pexels")),
});

/* ── normalising (pure, tested) ──────────────────────────────────────────── */

type UnsplashPhoto = {
  id?: string;
  width?: number;
  height?: number;
  color?: string | null;
  alt_description?: string | null;
  description?: string | null;
  urls?: { raw?: string; regular?: string; small?: string; thumb?: string };
  links?: { html?: string; download_location?: string };
  user?: { name?: string; username?: string; links?: { html?: string } };
};

/**
 * The raw URL with sizing parameters, which Unsplash's CDN supports and its
 * guidelines encourage. 2160 wide covers a 1080 artboard at 2x, the export's
 * pixel density, without shipping the 6000-pixel original.
 */
const unsplashSized = (raw: string): string => `${raw}${raw.includes("?") ? "&" : "?"}w=2160&q=80&fm=jpg&fit=max`;

export function normaliseUnsplash(body: unknown, page: number): StockPage {
  const b = (body ?? {}) as { results?: UnsplashPhoto[]; total_pages?: number };
  const photos = (b.results ?? []).flatMap((p): StockPhoto[] => {
    const raw = p.urls?.raw;
    const thumb = p.urls?.small ?? p.urls?.thumb;
    if (!p.id || !raw || !thumb || !p.user?.name) return [];
    return [
      {
        id: `unsplash:${p.id}`,
        provider: "unsplash",
        thumb,
        src: unsplashSized(raw),
        w: p.width ?? 0,
        h: p.height ?? 0,
        alt: (p.alt_description ?? p.description ?? "").trim(),
        colour: p.color ?? "#808080",
        credit: {
          provider: "unsplash",
          name: p.user.name,
          url: withReferral(p.user.links?.html ?? `https://unsplash.com/@${p.user.username ?? ""}`),
          page: withReferral(p.links?.html ?? "https://unsplash.com"),
        },
        ...(p.links?.download_location ? { downloadLocation: p.links.download_location } : {}),
      },
    ];
  });
  return { photos, page, more: page < (b.total_pages ?? 0) };
}

type PexelsPhoto = {
  id?: number;
  width?: number;
  height?: number;
  url?: string;
  photographer?: string;
  photographer_url?: string;
  avg_color?: string | null;
  alt?: string | null;
  src?: { original?: string; large2x?: string; large?: string; medium?: string; small?: string };
};

export function normalisePexels(body: unknown, page: number): StockPage {
  const b = (body ?? {}) as { photos?: PexelsPhoto[]; next_page?: string };
  const photos = (b.photos ?? []).flatMap((p): StockPhoto[] => {
    const original = p.src?.original;
    const thumb = p.src?.medium ?? p.src?.small;
    if (p.id === undefined || !original || !thumb || !p.photographer) return [];
    return [
      {
        id: `pexels:${p.id}`,
        provider: "pexels",
        thumb,
        // Pexels' CDN takes the same kind of sizing parameters on the original.
        src: `${original}?auto=compress&cs=tinysrgb&w=2160`,
        w: p.width ?? 0,
        h: p.height ?? 0,
        alt: (p.alt ?? "").trim(),
        colour: p.avg_color ?? "#808080",
        credit: {
          provider: "pexels",
          name: p.photographer,
          url: p.photographer_url ?? "https://www.pexels.com",
          page: p.url ?? "https://www.pexels.com",
        },
      },
    ];
  });
  return { photos, page, more: Boolean(b.next_page) };
}

/** The provider request for one search. Pure, so the URL and headers are tested. */
export function searchRequest(
  provider: StockProvider,
  query: string,
  page: number,
  key: string,
): { url: string; headers: Record<string, string> } {
  const q = encodeURIComponent(query);
  return provider === "unsplash"
    ? {
        url: `https://api.unsplash.com/search/photos?query=${q}&page=${page}&per_page=${PER_PAGE}&content_filter=high`,
        headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      }
    : {
        url: `https://api.pexels.com/v1/search?query=${q}&page=${page}&per_page=${PER_PAGE}`,
        headers: { Authorization: key },
      };
}

/**
 * Only Unsplash's own API host, only its download endpoint. Without this the
 * route would be a way to make the server GET any URL somebody posted, with
 * the Unsplash key attached.
 */
export const isDownloadLocation = (url: unknown): url is string =>
  typeof url === "string" && /^https:\/\/api\.unsplash\.com\/photos\/[A-Za-z0-9_-]+\/download(\?|$)/.test(url);

/* ── the routes ───────────────────────────────────────────────────────────── */

/**
 * Counted against the account when there is one and against the address when
 * there is not: stock search works signed out, like everything that costs
 * nothing.
 */
async function who(req: IncomingMessage): Promise<string> {
  const token = bearer(req);
  if (token && hasSecretKey()) {
    try {
      return (await requireCaller(token)).id;
    } catch {
      /* An expired session is not a reason to refuse a free search. */
    }
  }
  return callerKey(req);
}

const isProvider = (v: unknown): v is StockProvider =>
  typeof v === "string" && (STOCK_PROVIDERS as readonly string[]).includes(v);

export async function stockSearch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson<{ provider?: unknown; query?: unknown; page?: unknown }>(req, 10_000);
  if (!isProvider(body.provider)) throw new HttpError(400, `Unknown provider: ${String(body.provider)}`);
  const key = keyFor(body.provider);
  if (!key) {
    throw new HttpError(
      503,
      `No ${body.provider === "unsplash" ? "UNSPLASH_ACCESS_KEY" : "PEXELS_API_KEY"} on the server. Add it to .env and restart.`,
    );
  }

  const query = typeof body.query === "string" ? body.query.trim().slice(0, 100) : "";
  if (!query) throw new HttpError(400, "Search for something");
  const page = Math.max(1, Math.min(50, Math.round(Number(body.page) || 1)));

  rateLimit(`stock:${await who(req)}`, SEARCHES_PER_HOUR, HOUR_MS);

  const { url, headers } = searchRequest(body.provider, query, page, key);
  const response = await fetch(url, { headers });
  if (response.status === 429 || response.status === 403) {
    throw new HttpError(503, "The photo library is busy right now. Try again in a few minutes.");
  }
  if (!response.ok) throw new HttpError(502, `The photo search failed (${response.status})`);

  const raw: unknown = await response.json();
  json(res, 200, body.provider === "unsplash" ? normaliseUnsplash(raw, page) : normalisePexels(raw, page));
}

/** Tells Unsplash a photo was used. Pexels asks for nothing, so it is a no-op there. */
export async function stockUsed(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson<{ downloadLocation?: unknown }>(req, 10_000);
  if (body.downloadLocation === undefined) return json(res, 200, { ok: true });
  if (!isDownloadLocation(body.downloadLocation)) throw new HttpError(400, "Not an Unsplash download location");
  const key = keyFor("unsplash");
  if (!key) throw new HttpError(503, "No UNSPLASH_ACCESS_KEY on the server");

  rateLimit(`stock-used:${await who(req)}`, SEARCHES_PER_HOUR, HOUR_MS);
  const response = await fetch(body.downloadLocation, {
    headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
  });
  json(res, 200, { ok: response.ok });
}
