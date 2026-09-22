/**
 * Assets — the pictures and faces that belong to the ACCOUNT rather than to one
 * carousel.
 *
 * Until now every image lived inside its document as a base64 data URL. That was
 * the right call while a project had to be self-contained and offline, and it is
 * the wrong call the moment there is an account: a logo used in twenty carousels
 * was stored twenty times over, and every sync pushed a multi-megabyte row
 * because one word changed on slide three.
 *
 * So an asset is now a RECORD, and the bytes live in Supabase Storage under a
 * path. A document refers to an asset by id. `src` still carries something an
 * `<img>` can paint — it is simply a URL that gets refreshed rather than the
 * file itself.
 *
 * That is not a hole in "nothing is derived". The layer still owns its box, its
 * fit, its radius and its place in the z-order; everything that decides what the
 * slide looks like is still stored on the slide. What moved out is the file,
 * which is what `<img src>` has always meant.
 *
 * With no account — or no Supabase configured at all — an asset keeps its bytes
 * inline in `data` and behaves exactly as the old media pool did. That is the
 * free tier, not a degraded mode, and it is why every function here treats a
 * missing `path` as ordinary rather than as an error.
 */

import type { Doc, MediaItem, Slide } from "./model.js";
import { uid } from "./model.js";
import { markDeleted } from "./tombstones.js";

export type AssetKind = "image" | "font";

/** A brand carries three, because a logo that only works on white is half a logo. */
export const LOGO_ROLES = ["light", "dark", "mark"] as const;
export type LogoRole = (typeof LOGO_ROLES)[number];

export const LOGO_ROLE_LABEL: Record<LogoRole, string> = {
  light: "On light",
  dark: "On dark",
  mark: "Mark",
};

export type Asset = {
  id: string;
  kind: AssetKind;
  name: string;
  /** Object path in the `media` bucket. Empty while the asset is local-only. */
  path: string;
  mime: string;
  /** Decoded file size. Not the length of a base64 string — see `dataUrlBytes`. */
  bytes: number;

  /** images */
  w?: number | undefined;
  h?: number | undefined;

  /** fonts: the namespaced family the FontFace was registered under. */
  family?: string | undefined;

  /** Scoped to one brand when set; otherwise available everywhere. */
  brandId?: string | undefined;
  /** Whose asset this is. See clients.ts. */
  clientId?: string | undefined;
  /** Which logo variant this is, when a brand points at it. */
  role?: LogoRole | undefined;
  /** The one organising idea the library needs. Absent means unfiled. */
  folder?: string | undefined;

  /**
   * A fingerprint of the file's bytes, so the same picture imported twice — or
   * found inlined in twenty old documents — becomes one object rather than
   * twenty. This is what makes "a shared logo is stored once" true.
   */
  key?: string | undefined;

  /**
   * The bytes, inline, for an asset that has never reached a bucket. Dropped the
   * moment it uploads — keeping both would put the thing this batch exists to
   * remove back into every sync.
   */
  data?: string | undefined;

  createdAt: string;
  updatedAt: string;
};

export const UNFILED = "Unfiled";

/* ── data URLs ────────────────────────────────────────────────────────────── */

// `s` so a payload containing a newline still matches; the importer does not
// produce one, but a font read back from storage can.
const DATA_URL = /^data:([^;,]*)((?:;[^,]*)*),(.*)$/s;

export function parseDataUrl(src: string): { mime: string; base64: string } | null {
  const m = DATA_URL.exec(src);
  if (!m) return null;
  // Only base64 payloads are ever produced here. A percent-encoded one would
  // need different decoding, and guessing wrong corrupts the file silently.
  if (!(m[2] ?? "").includes("base64")) return null;
  return { mime: m[1] || "application/octet-stream", base64: m[3] ?? "" };
}

export const isDataUrl = (src: string): boolean => src.startsWith("data:");

/**
 * What the file actually weighs.
 *
 * The media pool used to report `src.length`, which is the length of a base64
 * STRING — a third larger than the bytes it encodes. Every size the UI showed
 * was wrong by 33%, and so was every quota decision made from it.
 */
export function dataUrlBytes(src: string): number {
  const parsed = parseDataUrl(src);
  if (!parsed) return src.length;
  const b64 = parsed.base64;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/**
 * The decoded bytes, for handing to an upload.
 *
 * `atob` rather than a Buffer: this runs in the browser, and the one place it
 * runs outside one is a test, where Node has provided the same global since 16.
 */
export function dataUrlToBytes(src: string): Uint8Array {
  const parsed = parseDataUrl(src);
  if (!parsed) return new Uint8Array();
  const binary = atob(parsed.base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "font/otf": "otf",
  "application/font-woff": "woff",
  "application/x-font-ttf": "ttf",
};

export const extensionFor = (mime: string): string => EXT[mime.toLowerCase()] ?? "bin";

/**
 * Where an asset lives in the bucket.
 *
 * The user id is the FIRST path segment and that is load-bearing: the storage
 * policy in 04-storage.sql compares `storage.foldername(name)[1]` against
 * `auth.uid()`, so the layout is the access rule. Change the shape here and the
 * policy stops matching.
 */
export const assetPath = (userId: string, asset: Pick<Asset, "id" | "kind" | "mime">): string =>
  `${userId}/${asset.kind}/${asset.id}.${extensionFor(asset.mime)}`;

/* ── making one ───────────────────────────────────────────────────────────── */

export function makeAsset(patch: Partial<Asset> & { kind: AssetKind; mime: string }): Asset {
  const now = new Date().toISOString();
  return {
    id: uid("a"),
    name: "Untitled",
    path: "",
    bytes: 0,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

/** A library entry as the media pool sees it. The pool is a view, not a copy. */
export const assetToMedia = (asset: Asset, url: string): MediaItem => ({
  id: asset.id,
  assetId: asset.id,
  name: asset.name,
  src: url,
  w: asset.w ?? 0,
  h: asset.h ?? 0,
  bytes: asset.bytes,
});

/* ── organising ───────────────────────────────────────────────────────────── */

export const folderOf = (asset: Asset): string => asset.folder?.trim() || UNFILED;

/** Every folder in use, unfiled last — it is a fallback, not a category. */
export function foldersOf(assets: readonly Asset[]): string[] {
  const named = new Set<string>();
  let anyUnfiled = false;
  for (const a of assets) {
    const f = folderOf(a);
    if (f === UNFILED) anyUnfiled = true;
    else named.add(f);
  }
  const sorted = [...named].sort((a, b) => a.localeCompare(b));
  return anyUnfiled ? [...sorted, UNFILED] : sorted;
}

export type AssetQuery = {
  kind?: AssetKind | undefined;
  folder?: string | undefined;
  brandId?: string | undefined;
  text?: string | undefined;
};

/**
 * Filtering, in the order a person narrows: kind, then folder, then words.
 *
 * `brandId` is deliberately an INCLUSIVE filter rather than an exclusive one —
 * asking for a brand's assets returns its own plus everything unscoped, because
 * a stock photo does not stop being usable when a client folder is open.
 */
export function filterAssets(assets: readonly Asset[], q: AssetQuery = {}): Asset[] {
  const text = q.text?.trim().toLowerCase() ?? "";
  return assets.filter((a) => {
    if (q.kind && a.kind !== q.kind) return false;
    if (q.folder && folderOf(a) !== q.folder) return false;
    if (q.brandId && a.brandId && a.brandId !== q.brandId) return false;
    if (text && !`${a.name} ${a.folder ?? ""}`.toLowerCase().includes(text)) return false;
    return true;
  });
}

export const libraryBytes = (assets: readonly Asset[]): number =>
  assets.reduce((n, a) => n + a.bytes, 0);

/* ── putting a resolved URL back into a document ──────────────────────────── */

/** Every asset a document depends on, deduplicated. */
export function assetIdsIn(doc: Doc): string[] {
  const ids = new Set<string>();
  for (const m of doc.media) if (m.assetId) ids.add(m.assetId);
  for (const s of doc.slides) for (const l of s.layers) if (l.assetId) ids.add(l.assetId);
  return [...ids];
}

/**
 * Refresh every `src` that came from the library.
 *
 * Signed URLs expire, so the one saved inside a document is stale the moment it
 * is reopened on another day or another machine. Rather than store a URL that
 * rots, the document stores the asset id and this puts a live URL back in front
 * of the painter. A missing id keeps whatever `src` it already had, because a
 * picture that fails to resolve should go on showing the last thing it had
 * rather than blanking the slide.
 */
export function resolveDoc(doc: Doc, urlOf: (assetId: string) => string | undefined): Doc {
  let touched = false;

  const media = doc.media.map((m) => {
    const url = m.assetId ? urlOf(m.assetId) : undefined;
    if (!url || url === m.src) return m;
    touched = true;
    return { ...m, src: url };
  });

  const slides: Slide[] = doc.slides.map((slide) => {
    let slideTouched = false;
    const layers = slide.layers.map((l) => {
      const url = l.assetId ? urlOf(l.assetId) : undefined;
      if (!url || url === l.src) return l;
      slideTouched = true;
      touched = true;
      return { ...l, src: url };
    });
    return slideTouched ? { ...slide, layers } : slide;
  });

  // Same object back when nothing moved, so a resolve on every open does not
  // look like an edit to the history stack or to the sync clock.
  return touched ? { ...doc, media, slides } : doc;
}

/* ── deduplication ────────────────────────────────────────────────────────── */

/**
 * A stable fingerprint of a file's bytes.
 *
 * FNV-1a over the base64 payload, with the length appended. Not a checksum for
 * integrity — a bucket key for "have I already stored this?", where the length
 * is what keeps a 32-bit collision from ever merging two files of different
 * sizes. Two genuinely different pictures of identical length that also collide
 * would share an object; the odds are remote and the cost is one wrong picture,
 * not a corrupt one.
 *
 * Deliberately synchronous and dependency-free. SubtleCrypto would be a stronger
 * hash and would make every call site async, for a guarantee this does not need.
 */
export function contentKey(src: string): string {
  const parsed = parseDataUrl(src);
  const body = parsed ? parsed.base64 : src;
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i += 1) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}-${body.length.toString(36)}`;
}

/** `changed` counts references rewritten, which is not `created.length`: a
 * picture already in the library is linked without minting anything. */
export type Hoisted = { doc: Doc; created: Asset[]; changed: number };

/**
 * Lift every inlined picture out of a document and into the library.
 *
 * This is the migration 5.1 turns on, and it is written as a pure function
 * because losing somebody's images is the one failure in this batch that cannot
 * be apologised for. Nothing is removed: `src` keeps the data URL it always had
 * and an `assetId` is added beside it, so a document that is hoisted and never
 * uploaded renders exactly as it did. The bytes only leave once the upload has
 * come back ok.
 *
 * `known` is matched on the content fingerprint, so the same logo across twenty
 * carousels resolves to one asset — including assets already in the library from
 * an earlier run, which is what makes re-running this cheap.
 */
export function hoistInlineAssets(doc: Doc, known: readonly Asset[] = []): Hoisted {
  const byKey = new Map<string, Asset>();
  for (const a of known) if (a.key) byKey.set(a.key, a);

  const created: Asset[] = [];
  let changed = 0;

  /** The asset for this data URL, minting one the first time it is seen. */
  const assetFor = (src: string, name: string, w?: number, h?: number): Asset | null => {
    const parsed = parseDataUrl(src);
    if (!parsed) return null;

    const key = contentKey(src);
    const found = byKey.get(key);
    if (found) return found;

    const asset = makeAsset({
      kind: "image",
      mime: parsed.mime,
      name,
      key,
      data: src,
      bytes: dataUrlBytes(src),
      ...(w ? { w } : {}),
      ...(h ? { h } : {}),
    });
    byKey.set(key, asset);
    created.push(asset);
    return asset;
  };

  const media = doc.media.map((m) => {
    if (m.assetId || !isDataUrl(m.src)) return m;
    const asset = assetFor(m.src, m.name, m.w, m.h);
    if (!asset) return m;
    changed += 1;
    return { ...m, assetId: asset.id };
  });

  const slides = doc.slides.map((slide) => ({
    ...slide,
    layers: slide.layers.map((l) => {
      if (l.assetId || !l.src || !isDataUrl(l.src)) return l;
      const asset = assetFor(l.src, l.name || "Image", l.w, l.h);
      if (!asset) return l;
      changed += 1;
      return { ...l, assetId: asset.id };
    }),
  }));

  return { doc: { ...doc, media, slides }, created, changed };
}

/**
 * The document as it should be WRITTEN.
 *
 * Anything that came from the library drops its `src`, because the file is in
 * the library and a second copy in every document is the whole problem this
 * batch was opened to solve. `resolveDoc` puts a live URL back on the way in, so
 * the version held in memory — the one the painter and the exporter see — is
 * always complete.
 *
 * A picture with no `assetId` keeps its data URL untouched. That is a document
 * that has not been migrated, or one made with no account at all, and it has to
 * go on working.
 */
export function dehydrateDoc(doc: Doc): Doc {
  const strip = <T extends { assetId?: string | undefined; src?: string | undefined }>(x: T): T =>
    x.assetId && x.src ? { ...x, src: "" } : x;

  return {
    ...doc,
    media: doc.media.map((m) => (m.assetId ? { ...m, src: "" } : m)),
    slides: doc.slides.map((s) => ({ ...s, layers: s.layers.map(strip) })),
  };
}

/* ── the local store ──────────────────────────────────────────────────────── */

/**
 * One key for the lot, as with brands: the library is always read as a set, so
 * per-record keys would add a fan-out read and buy nothing.
 *
 * The local library is small on purpose. It exists so the app works with no
 * account at all; the moment there is one, the bytes go to a bucket and these
 * records lose their `data`.
 */
const KEY = "flashcc:v1:assets";

/** localStorage is a few megabytes in total, and documents need most of it. */
export const MAX_LOCAL_BYTES = 3_000_000;

export function listAssets(): Asset[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as Asset[]) : [];
  } catch {
    return [];
  }
}

export function saveAssets(assets: Asset[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(assets));
    return true;
  } catch {
    return false;
  }
}

export function upsertAsset(asset: Asset): Asset[] {
  const all = listAssets();
  const i = all.findIndex((a) => a.id === asset.id);
  const next = i === -1 ? [asset, ...all] : all.map((a) => (a.id === asset.id ? asset : a));
  saveAssets(next);
  return next;
}

export function removeAsset(id: string): Asset[] {
  const next = listAssets().filter((a) => a.id !== id);
  saveAssets(next);
  markDeleted("asset", id);
  return next;
}

/**
 * Room for one more, locally.
 *
 * Returns the reason rather than a boolean: "no" without a number is the kind of
 * refusal people file a bug about.
 */
export function localRoomFor(bytes: number, assets: readonly Asset[] = listAssets()): string | null {
  const inline = assets.filter((a) => a.data).reduce((n, a) => n + a.bytes, 0);
  if (inline + bytes <= MAX_LOCAL_BYTES) return null;
  return `This machine can hold about ${Math.round(MAX_LOCAL_BYTES / 1_000_000)}MB of assets without an account. Sign in and they move to your library instead.`;
}
