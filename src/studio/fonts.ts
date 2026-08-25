/**
 * Uploaded fonts.
 *
 * A font file is stored as a data URL and registered with the FontFace API at
 * startup, so a project keeps working offline and an exported PDF prints in the right
 * face. Font files are heavy for localStorage, so there is a hard per-file cap and a
 * small maximum — a single uncompressed TTF can be larger than the whole quota.
 */
import { registerFont, unregisterFont, type FontChoice } from "./model.js";

export type CustomFont = { id: string; label: string; family: string; src: string; bytes: number };

const KEY = "flashcc:v3:fonts";

export const MAX_FONTS = 6;
export const MAX_FONT_BYTES = 400_000;

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

function read<T>(): T | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(fonts: CustomFont[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(fonts));
    return true;
  } catch {
    return false;
  }
}

export const listCustomFonts = (): CustomFont[] => read<CustomFont[]>() ?? [];

/** Hand every stored face to the browser. Call once, at startup. */
export async function installCustomFonts(): Promise<void> {
  for (const font of listCustomFonts()) await install(font);
}

async function install(font: CustomFont): Promise<boolean> {
  try {
    const face = new FontFace(font.family, `url(${font.src})`);
    await face.load();
    document.fonts.add(face);
    registerFont({ id: font.id, label: font.label, stack: `"${font.family}", sans-serif` });
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

export async function addCustomFont(file: File): Promise<AddFontResult> {
  if (!/\.(woff2?|ttf|otf)$/i.test(file.name)) {
    return { ok: false, error: "That is not a font file. Use .woff2, .woff, .ttf or .otf." };
  }
  if (listCustomFonts().length >= MAX_FONTS) {
    return { ok: false, error: `You can keep ${MAX_FONTS} uploaded fonts. Remove one first.` };
  }
  if (file.size > MAX_FONT_BYTES) {
    return {
      ok: false,
      error: `That file is ${Math.round(file.size / 1024)}KB. The limit is ${MAX_FONT_BYTES / 1024}KB — a .woff2 of the same face is usually well under it.`,
    };
  }

  const label = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 28) || "Custom";
  const font: CustomFont = {
    id: `font_${Date.now().toString(36)}`,
    label,
    // Namespaced so an uploaded "Inter" cannot shadow a system face of that name.
    family: `FCC ${label} ${Date.now().toString(36)}`,
    src: await readFile(file),
    bytes: file.size,
  };

  if (!(await install(font))) {
    return { ok: false, error: "The browser could not read that font. It may be corrupt." };
  }
  if (!write([...listCustomFonts(), font])) {
    unregisterFont(font.id);
    return { ok: false, error: "Not enough room to store it. Remove another font or an image." };
  }
  return { ok: true, font };
}

export function removeCustomFont(id: string): void {
  write(listCustomFonts().filter((f) => f.id !== id));
  unregisterFont(id);
}

export const asChoice = (f: CustomFont): FontChoice => ({
  id: f.id,
  label: f.label,
  stack: `"${f.family}", sans-serif`,
  custom: true,
});
