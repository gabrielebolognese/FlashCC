/**
 * Uploaded fonts.
 *
 * A font is an ASSET — the same record as an uploaded picture, with a `family`
 * and `kind: "font"`. That is not tidiness for its own sake: it is what lifts
 * `MAX_FONTS = 6` out of localStorage. The old cap was not a design decision, it
 * was arithmetic — a single uncompressed TTF can be larger than the whole
 * quota — and it disappears the moment the bytes live in a bucket instead.
 *
 * So the ceiling is now the PLAN rather than the browser. Signed out, the files
 * are still inline and the old, honest limit applies.
 *
 * The FontFace half is unchanged and still has to happen in this browser: a face
 * is registered at startup so the editor paints in it, and inlined into the
 * export payload so the server can use a face it has never heard of.
 */
import {
  contentKey,
  dataUrlBytes,
  listAssets,
  makeAsset,
  parseDataUrl,
  saveAssets,
  upsertAsset,
  type Asset,
} from "./assets.js";
import type { Plan } from "./cloud.js";
import { assetsOfKind, ensureUrls, importFontAsset, removeLibraryAsset, urlFor } from "./library.js";
import { registerFont, unregisterFont, type FontChoice } from "./model.js";
import { hasCloudSession, sessionPlan } from "./session.js";

export type CustomFont = {
  id: string;
  label: string;
  family: string;
  src: string;
  bytes: number;
  /** Scoped to one brand when set. Absent means available everywhere. */
  brandId?: string | undefined;
};

/**
 * What a plan is worth in faces.
 *
 * Six was the localStorage ceiling wearing a product's clothes. Signed out it
 * still is, and saying so plainly is better than pretending the number means
 * something it does not.
 */
export const FONT_LIMIT: Record<Plan, number> = { free: 12, pro: 50, agency: Infinity };

/** With no account the files stay in this browser, and the old arithmetic holds. */
export const LOCAL_FONT_LIMIT = 6;

export const fontLimit = (plan: Plan | undefined, cloud: boolean): number =>
  cloud ? FONT_LIMIT[plan ?? "free"] : LOCAL_FONT_LIMIT;

/** Inline, a big TTF eats the whole quota. In a bucket, it is just a file. */
export const MAX_FONT_BYTES = 400_000;
export const MAX_CLOUD_FONT_BYTES = 4_000_000;

/** woff2 first: it is the smallest, and every current browser reads it. */
export const FONT_FORMATS = [
  { ext: ".woff2", note: "Best — smallest file, widest support" },
  { ext: ".woff", note: "Fine — older but universal" },
  { ext: ".ttf", note: "Works, but several times larger" },
  { ext: ".otf", note: "Works, same size caveat as TTF" },
];

export const FONT_SOURCES = [
  { name: "Google Fonts", url: "fonts.google.com", note: "Free, open licence, huge range" },
  { name: "Fontshare", url: "fontshare.com", note: "Free for commercial use, more character" },
  { name: "Fontsource", url: "fontsource.org", note: "Google Fonts as downloadable woff2" },
  { name: "Velvetyne", url: "velvetyne.fr", note: "Free, experimental display faces" },
];

export const FONT_ACCEPT = ".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf";

/* ── reading them back ────────────────────────────────────────────────────── */

const asFont = (a: Asset): CustomFont[] => {
  const src = urlFor(a);
  if (!src || !a.family) return [];
  return [
    {
      id: a.id,
      label: a.name,
      family: a.family,
      src,
      bytes: a.bytes,
      ...(a.brandId ? { brandId: a.brandId } : {}),
    },
  ];
};

/**
 * Synchronous on purpose: the export path and `installCustomFonts` both call
 * this, and it reads the URL cache rather than the network. A face whose URL has
 * not been signed yet is simply absent — `installCustomFonts` signs first.
 */
export const listCustomFonts = (): CustomFont[] => assetsOfKind("font").flatMap(asFont);

export const countCustomFonts = (): number => assetsOfKind("font").length;

/* ── the one-time lift out of localStorage ────────────────────────────────── */

const LEGACY_KEY = "flashcc:v3:fonts";

type LegacyFont = {
  id: string;
  label: string;
  family: string;
  src: string;
  bytes: number;
  brandId?: string;
};

/**
 * Faces uploaded before fonts were assets.
 *
 * They keep their bytes inline as local assets, so nothing is lost and nothing
 * needs a network to keep working; `library.syncPendingUploads` sends them up on
 * the next sign-in like any other pending file. The old key is cleared only
 * after the new records are written.
 */
export function migrateLegacyFonts(): number {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;

  let legacy: LegacyFont[] = [];
  try {
    const parsed: unknown = JSON.parse(raw);
    legacy = Array.isArray(parsed) ? (parsed as LegacyFont[]) : [];
  } catch {
    legacy = [];
  }

  const existing = listAssets();
  let moved = 0;

  for (const font of legacy) {
    const key = contentKey(font.src);
    if (existing.some((a) => a.key === key)) continue;
    upsertAsset(
      makeAsset({
        kind: "font",
        mime: parseDataUrl(font.src)?.mime ?? "font/woff2",
        // The id is carried over, so a document already naming this face in
        // `fontFamily` still resolves to it.
        id: font.id,
        name: font.label,
        family: font.family,
        key,
        data: font.src,
        bytes: font.bytes || dataUrlBytes(font.src),
        ...(font.brandId ? { brandId: font.brandId } : {}),
      }),
    );
    moved += 1;
  }

  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* The records are written; a stubborn key only costs a repeat no-op. */
  }
  return moved;
}

/* ── installing ───────────────────────────────────────────────────────────── */

/** Hand every stored face to the browser. Call once, at startup. */
export async function installCustomFonts(): Promise<void> {
  migrateLegacyFonts();
  await ensureUrls(assetsOfKind("font"));
  for (const font of listCustomFonts()) await install(font);
}

async function install(font: CustomFont): Promise<boolean> {
  try {
    const face = new FontFace(font.family, `url(${font.src})`);
    await face.load();
    document.fonts.add(face);
    registerFont({
      id: font.id,
      label: font.label,
      stack: `"${font.family}", sans-serif`,
      ...(font.brandId ? { brandId: font.brandId } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

const readFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the file"));
    r.readAsDataURL(file);
  });

export type AddFontResult = { ok: true; font: CustomFont } | { ok: false; error: string };

export type AddFontOptions = {
  plan?: Plan | undefined;
  brandId?: string | undefined;
};

/**
 * The session is read rather than passed: this dialog is opened from the style
 * picker, the properties panel and the brand editor, and none of them has any
 * other reason to know who is signed in. See session.ts.
 */
export async function addCustomFont(file: File, options: AddFontOptions = {}): Promise<AddFontResult> {
  const cloud = hasCloudSession();
  const limit = fontLimit(options.plan ?? sessionPlan(), cloud);
  const ceiling = cloud ? MAX_CLOUD_FONT_BYTES : MAX_FONT_BYTES;

  if (!/\.(woff2?|ttf|otf)$/i.test(file.name)) {
    return { ok: false, error: "That is not a font file. Use .woff2, .woff, .ttf or .otf." };
  }
  if (countCustomFonts() >= limit) {
    return {
      ok: false,
      error: cloud
        ? `Your plan includes ${limit} uploaded fonts. Remove one first.`
        : `Signed out, fonts live in this browser and ${limit} is all it holds. Sign in and they move to your library.`,
    };
  }
  if (file.size > ceiling) {
    return {
      ok: false,
      error: cloud
        ? `That file is ${Math.round(file.size / 1024)}KB. The limit is ${Math.round(ceiling / 1024)}KB.`
        : `That file is ${Math.round(file.size / 1024)}KB. Signed out the limit is ${ceiling / 1024}KB — a .woff2 of the same face is usually well under it.`,
    };
  }

  const label = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 28) || "Custom";
  // Namespaced so an uploaded "Inter" cannot shadow a system face of that name.
  const family = `FCC ${label} ${Date.now().toString(36)}`;

  const dataUrl = await readFile(file);
  const asset = await importFontAsset(file, dataUrl, family, {
    ...(options.brandId ? { brandId: options.brandId } : {}),
  });

  const font = asFont(asset)[0] ?? {
    id: asset.id,
    label,
    family,
    src: dataUrl,
    bytes: asset.bytes,
  };

  if (!(await install(font))) {
    await removeLibraryAsset(asset.id);
    return { ok: false, error: "The browser could not read that font. It may be corrupt." };
  }
  return { ok: true, font };
}

export async function removeCustomFont(id: string): Promise<void> {
  await removeLibraryAsset(id);
  unregisterFont(id);
}

/** Signing out: drop the registrations too, or the next person sees dead families. */
export function forgetFonts(): void {
  for (const font of listCustomFonts()) unregisterFont(font.id);
  saveAssets(listAssets().filter((a) => a.kind !== "font"));
}

export const asChoice = (f: CustomFont): FontChoice => ({
  id: f.id,
  label: f.label,
  stack: `"${f.family}", sans-serif`,
  custom: true,
});
