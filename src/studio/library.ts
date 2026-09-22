/**
 * The library, as a running thing: where bytes actually go, and where URLs come
 * back from.
 *
 * `assets.ts` holds the shape and the reasoning and has no idea Supabase exists.
 * This is the half that uploads, signs and migrates, and it has exactly one rule:
 *
 *   **Signed in and configured → the bucket. Otherwise → inline, as before.**
 *
 * Neither branch is the degraded one. An account with no cloud is the free tier
 * and has to keep working offline, which is why every function here takes a
 * `userId` that is allowed to be null and never treats that as an error.
 */

import {
  assetIdsIn,
  assetPath,
  contentKey,
  dataUrlBytes,
  dataUrlToBytes,
  hoistInlineAssets,
  listAssets,
  localRoomFor,
  makeAsset,
  parseDataUrl,
  removeAsset,
  resolveDoc,
  saveAssets,
  upsertAsset,
  type Asset,
  type AssetKind,
  type LogoRole,
} from "./assets.js";
import { MEDIA_BUCKET, removeObjects, signPaths, storageReady, uploadObject } from "./cloud.js";
import type { Doc } from "./model.js";
import { prepareImage } from "./media.js";
import { sessionUserId } from "./session.js";
import { listDocs, loadDoc, putDoc } from "./storage.js";

/* ── signed URLs ──────────────────────────────────────────────────────────── */

/**
 * Asset id → the URL currently good for it.
 *
 * Module-level rather than per-component: the same logo appears in the pool, on
 * three slides, in the brand card and in the library grid, and signing it five
 * times would be five round trips for one file. Cleared on sign-out, because the
 * next person's session cannot use this one's signatures.
 */
const urls = new Map<string, string>();

export const forgetUrls = (): void => urls.clear();

/** The address to paint, or nothing — never a broken empty string. */
export function urlFor(asset: Asset): string | undefined {
  if (asset.data) return asset.data;
  return urls.get(asset.id);
}

/** Signs everything missing in ONE round trip. See `signPaths` for why that matters. */
export async function ensureUrls(assets: readonly Asset[]): Promise<void> {
  const need = assets.filter((a) => !a.data && a.path !== "" && !urls.has(a.id));
  if (need.length === 0) return;

  const signed = await signPaths(need.map((a) => a.path));
  for (const a of need) {
    const url = signed.get(a.path);
    if (url) urls.set(a.id, url);
  }
}

/**
 * A document with live URLs in it, ready to paint.
 *
 * Called on open and after a sync applies a remote document. Returns the same
 * object when nothing needed refreshing, so it can sit in a `useEffect` without
 * looking like an edit.
 */
export async function resolveDocAssets(doc: Doc): Promise<Doc> {
  const ids = assetIdsIn(doc);
  if (ids.length === 0) return doc;

  const wanted = listAssets().filter((a) => ids.includes(a.id));
  await ensureUrls(wanted);

  const byId = new Map(wanted.map((a) => [a.id, a]));
  return resolveDoc(doc, (id) => {
    const asset = byId.get(id);
    return asset ? urlFor(asset) : undefined;
  });
}

/**
 * The resolver `brand.stampLogo` needs, closed over the library as it is now.
 *
 * Lives here rather than in brand.ts so that `stampLogo` stays pure and
 * testable: it takes a function, and this is the one that knows about buckets.
 */
export function logoResolver(): (assetId: string) => { src: string; w?: number; h?: number } | undefined {
  const assets = listAssets();
  return (assetId) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return undefined;
    const src = urlFor(asset);
    if (!src) return undefined;
    return {
      src,
      ...(asset.w ? { w: asset.w } : {}),
      ...(asset.h ? { h: asset.h } : {}),
    };
  };
}

/* ── putting something in ─────────────────────────────────────────────────── */

/**
 * `userId` defaults to whoever is signed in. Passing it explicitly is for the
 * migration, which has to name the account it is migrating INTO.
 */
export type StoreOptions = {
  userId?: string | null | undefined;
  folder?: string | undefined;
  brandId?: string | undefined;
  role?: LogoRole | undefined;
};

export type ImportResult = { assets: Asset[]; error?: string };

const cloudable = (userId: string | null | undefined): userId is string =>
  Boolean(userId) && storageReady();

/**
 * Upload if we can, keep it inline if we cannot.
 *
 * On a failed upload the asset is kept LOCALLY with its bytes rather than
 * thrown away. The person dropped a file in; losing it because a bucket was
 * missing would be the worst possible answer, and `syncPendingUploads` picks it
 * up on the next sign-in.
 */
async function store(asset: Asset, who: string | null | undefined): Promise<Asset> {
  const userId = who ?? sessionUserId();
  if (!cloudable(userId) || !asset.data) {
    upsertAsset(asset);
    return asset;
  }

  const path = assetPath(userId, asset);
  const result = await uploadObject(MEDIA_BUCKET, path, dataUrlToBytes(asset.data), asset.mime);
  if (!result.ok) {
    upsertAsset(asset);
    return asset;
  }

  // The URL is cached from the bytes we already hold, so the picture paints
  // immediately instead of waiting on a signature for a file we just sent.
  urls.set(asset.id, asset.data);
  const stored: Asset = { ...asset, path, data: undefined };
  upsertAsset(stored);
  return stored;
}

/** Reuse before mint: the same file twice is one object, in both directions. */
function existingFor(key: string): Asset | undefined {
  return listAssets().find((a) => a.key === key);
}

export async function importImages(
  files: readonly File[],
  options: StoreOptions = {},
): Promise<ImportResult> {
  const out: Asset[] = [];
  let error: string | undefined;

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;

    try {
      const prepared = await prepareImage(file);
      const key = contentKey(prepared.src);

      const already = existingFor(key);
      if (already) {
        out.push(already);
        continue;
      }

      const bytes = dataUrlBytes(prepared.src);
      if (!cloudable(options.userId ?? sessionUserId())) {
        const full = localRoomFor(bytes);
        if (full) {
          error ??= full;
          continue;
        }
      }

      const asset = makeAsset({
        kind: "image",
        mime: parseDataUrl(prepared.src)?.mime ?? file.type,
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Image",
        key,
        data: prepared.src,
        bytes,
        w: prepared.w,
        h: prepared.h,
        ...(options.folder ? { folder: options.folder } : {}),
        ...(options.brandId ? { brandId: options.brandId } : {}),
        ...(options.role ? { role: options.role } : {}),
      });

      out.push(await store(asset, options.userId));
    } catch {
      // One unreadable file must not abandon the rest of the drop.
      error ??= "One of those files could not be read.";
    }
  }

  return error === undefined ? { assets: out } : { assets: out, error };
}

/** A font, stored the same way — see fonts.ts for the FontFace half. */
export async function importFontAsset(
  file: File,
  dataUrl: string,
  family: string,
  options: StoreOptions = {},
): Promise<Asset> {
  const asset = makeAsset({
    kind: "font",
    mime: parseDataUrl(dataUrl)?.mime ?? file.type ?? "font/woff2",
    name: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 40) || "Custom",
    key: contentKey(dataUrl),
    data: dataUrl,
    bytes: dataUrlBytes(dataUrl),
    family,
    ...(options.brandId ? { brandId: options.brandId } : {}),
  });
  return store(asset, options.userId);
}

/* ── taking something out ─────────────────────────────────────────────────── */

/**
 * Removes the record, the tombstone for other devices, and the object.
 *
 * The object goes LAST and its failure is ignored: a bucket that refuses the
 * delete leaves an orphan nobody can see, which is a tidiness problem. A record
 * that survives a failed object delete is a library entry that paints nothing,
 * which is a bug the user has to look at.
 */
export async function removeLibraryAsset(id: string): Promise<Asset[]> {
  const asset = listAssets().find((a) => a.id === id);
  const next = removeAsset(id);
  urls.delete(id);
  if (asset?.path) await removeObjects(MEDIA_BUCKET, [asset.path]);
  return next;
}

export function renameAsset(id: string, patch: Partial<Pick<Asset, "name" | "folder">>): Asset[] {
  const asset = listAssets().find((a) => a.id === id);
  if (!asset) return listAssets();
  return upsertAsset({ ...asset, ...patch, updatedAt: new Date().toISOString() });
}

/* ── catching up ──────────────────────────────────────────────────────────── */

/** Anything imported while signed out, sent up once there is somewhere to send it. */
export async function syncPendingUploads(userId: string): Promise<number> {
  if (!cloudable(userId)) return 0;
  let sent = 0;
  for (const asset of listAssets()) {
    if (!asset.data || asset.path !== "") continue;
    const stored = await store(asset, userId);
    if (stored.path !== "") sent += 1;
  }
  return sent;
}

export type Migration = { docs: number; assets: number };

/**
 * The 5.1 migration: every base64 picture already inside a document, lifted out.
 *
 * Ordered so that nothing can be lost. For each document the references are
 * rewritten in memory, then every new asset is STORED, and only then is the
 * document written back — and `putDoc` is what dehydrates it. If the process
 * dies between the two, the document on disk is the untouched original with its
 * pictures still inline, and the next run finds them again.
 *
 * `putDoc` rather than `saveDoc` on purpose: a migration is not an edit. Stamping
 * `updatedAt` would make every document on this machine look newer than the
 * server's copy and win the next merge, quietly reverting work done elsewhere.
 */
export async function migrateInlineDocs(userId: string | null): Promise<Migration> {
  let docs = 0;
  let assets = 0;

  for (const summary of listDocs()) {
    const doc = loadDoc(summary.id);
    if (!doc) continue;

    const hoisted = hoistInlineAssets(doc, listAssets());
    if (hoisted.changed === 0) continue;

    for (const asset of hoisted.created) {
      await store(asset, userId);
      assets += 1;
    }

    putDoc(hoisted.doc);
    docs += 1;
  }

  return { docs, assets };
}

/** Signing out: the records go with everything else, and so do the signatures. */
export function forgetLibrary(): void {
  saveAssets([]);
  forgetUrls();
}

export const assetsOfKind = (kind: AssetKind): Asset[] =>
  listAssets().filter((a) => a.kind === kind);
