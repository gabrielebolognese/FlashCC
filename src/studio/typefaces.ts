/**
 * The bundled faces in the browser (22.2, 22.5, 22.6): registering them, and
 * carrying the ones a deck uses into the export.
 *
 * Every face is a subset file with a unicode-range, registered as a `FontFace`
 * on startup. Registering is cheap and downloads nothing: the browser fetches a
 * subset the first time a character in its range is drawn in its family. So a
 * Latin deck in Inter never downloads Inter's Cyrillic, and a page with no emoji
 * never downloads the emoji font.
 *
 * The CJK manifest is a separate chunk, loaded the first time CJK text is seen
 * (`ensureFacesFor`), because its unicode ranges alone are most of the bytes.
 *
 * The export inlines exactly the faces a deck needs (the families its layers
 * use, plus the fallbacks, at the weights the browser will pick, for the
 * characters it contains) as data URLs, the same way uploaded faces already
 * travel, so the server renders with the files the editor rendered with and
 * needs none installed. That is the whole emoji fix (22.6): headless Chromium
 * on a Linux box usually has no colour emoji font, and now it does not need one.
 * The emoji face is Twemoji as a COLRv0 font, which every engine draws; the
 * Noto Color Emoji fontsource ships is OpenType-SVG, which Chrome does not.
 */
import { FACES, type FaceFile } from "../render/fonts/faces.js";
import { boldWeight, hasMarks } from "./marks.js";
import { allFonts, FALLBACK_FAMILIES, type Doc } from "./model.js";
import { matchWeight, MEASURED, weightsOf } from "./typemetrics.js";

/** The emoji face (22.6), which ships one weight. */
const EMOJI_FAMILY = "FCC Twemoji";

export type { FaceFile };

/* ── registering ──────────────────────────────────────────────────────────── */

const added = new Set<string>();

function register(faces: readonly FaceFile[]): void {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;
  for (const f of faces) {
    if (added.has(f.url)) continue;
    added.add(f.url);
    const face = new FontFace(f.family, `url(${f.url}) format("woff2")`, {
      weight: String(f.weight),
      unicodeRange: f.range,
      display: "swap",
    });
    document.fonts.add(face);
  }
}

/** Registers every non-CJK face. Idempotent; downloads nothing until a face is drawn. */
export function installFaces(): void {
  register(FACES);
}

const CJK_TEXT = /[ᄀ-ᇿ⺀-鿿ꥠ-꥿가-힯豈-﫿︰-﹏＀-￯]|[\u{20000}-\u{3ffff}]/u;

export const hasCjk = (text: string): boolean => CJK_TEXT.test(text);

let cjk: Promise<FaceFile[]> | null = null;

/** The CJK manifest, loaded once. */
function cjkFaces(): Promise<FaceFile[]> {
  cjk ??= import("../render/fonts/faces-cjk.js").then((m) => m.FACES);
  return cjk;
}

/** Makes sure the faces some text needs are registered. Cheap when they already are. */
export async function ensureFacesFor(texts: readonly string[]): Promise<void> {
  installFaces();
  if (texts.some(hasCjk)) register(await cjkFaces());
}

/* ── the export ───────────────────────────────────────────────────────────── */

type Range = [number, number];

const rangesCache = new Map<string, Range[]>();

/** A CSS unicode-range as numeric spans. */
export function parseRange(range: string): Range[] {
  const hit = rangesCache.get(range);
  if (hit) return hit;
  const out: Range[] = [];
  for (const part of range.split(",")) {
    const m = part.trim().match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i);
    if (!m) continue;
    if (m[1]!.includes("?")) {
      out.push([parseInt(m[1]!.replace(/\?/g, "0"), 16), parseInt(m[1]!.replace(/\?/g, "F"), 16)]);
    } else {
      const lo = parseInt(m[1]!, 16);
      out.push([lo, m[2] ? parseInt(m[2], 16) : lo]);
    }
  }
  rangesCache.set(range, out);
  return out;
}

export const rangeCovers = (range: string, cps: ReadonlySet<number>): boolean => {
  const spans = parseRange(range);
  for (const cp of cps) for (const [lo, hi] of spans) if (cp >= lo && cp <= hi) return true;
  return false;
};

/** CSS family name of a bundled id, or null for a system stack. */
const familyOf = (id: string | undefined): string | null => (id ? (MEASURED[id]?.family ?? null) : null);

/**
 * The faces a deck needs, by family, weight and character. Pure, so which
 * files travel with an export is tested rather than hoped for.
 */
export function facesFor(doc: Doc, faces: readonly FaceFile[]): FaceFile[] {
  const cps = new Set<number>();
  /** family → weights the browser will pick. */
  const wanted = new Map<string, Set<number>>();
  const want = (family: string, weight: number) => {
    if (!wanted.has(family)) wanted.set(family, new Set());
    wanted.get(family)!.add(weight);
  };

  for (const slide of doc.slides) {
    for (const l of slide.layers) {
      if (l.kind !== "text" || !l.visible || !l.text) continue;
      for (const ch of l.uppercase ? l.text.toUpperCase() : l.text) cps.add(ch.codePointAt(0) ?? 0);
      const base = l.fontWeight ?? 400;
      const weights = hasMarks(l.text) ? [base, boldWeight(base)] : [base];
      const family = familyOf(l.fontFamily);
      for (const w of weights) {
        if (family && l.fontFamily) want(family, matchWeight(weightsOf(l.fontFamily), w));
        // The fallbacks ship 400 and 700 (emoji 400 only): the same matching.
        for (const fb of FALLBACK_FAMILIES) want(fb, fb === EMOJI_FAMILY ? 400 : w >= 600 ? 700 : 400);
      }
    }
  }

  // A fallback only ever draws what the face in front of it cannot: never the
  // Latin a deck is written in. The emoji font's subsets include the digits and
  // `#` (for keycaps) and would otherwise ride along with every deck.
  const beyondLatin = new Set([...cps].filter((cp) => cp >= 0x250));
  // The space, always: a line's height and baseline come from the first face in
  // its stack that covers U+0020, whatever the line says. A line of nothing but
  // emoji exported without its primary face's Latin subset sat a pixel lower
  // than in the editor, which had that subset registered (found comparing the
  // two, 22.6).
  cps.add(0x20);
  const fallbacks = new Set(FALLBACK_FAMILIES);
  return faces.filter(
    (f) => wanted.get(f.family)?.has(f.weight) && rangeCovers(f.range, fallbacks.has(f.family) ? beyondLatin : cps),
  );
}

const dataUrls = new Map<string, Promise<string>>();

async function asDataUrl(url: string): Promise<string> {
  let hit = dataUrls.get(url);
  if (!hit) {
    hit = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Could not read a font file (${r.status})`);
        return r.blob();
      })
      .then(
        (b) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Could not read a font file"));
            reader.readAsDataURL(b);
          }),
      );
    hit.catch(() => dataUrls.delete(url));
    dataUrls.set(url, hit);
  }
  return hit;
}

/** `@font-face` rules for every bundled face the deck uses, carrying their bytes. */
export async function bundledFaceCss(doc: Doc): Promise<string> {
  const texts = doc.slides.flatMap((s) => s.layers.map((l) => l.text ?? ""));
  const pool = texts.some(hasCjk) ? [...FACES, ...(await cjkFaces())] : FACES;
  const faces = facesFor(doc, pool);
  const rules = await Promise.all(
    faces.map(
      async (f) =>
        `@font-face { font-family: "${f.family}"; src: url(${await asDataUrl(f.url)}) format("woff2"); ` +
        `font-weight: ${f.weight}; unicode-range: ${f.range}; font-display: block; }`,
    ),
  );
  return rules.join("\n");
}

/** Every bundled id a list of documents uses, for loading their kerning before measuring. */
export const bundledIdsIn = (docs: readonly Doc[]): string[] => [
  ...new Set(
    docs.flatMap((d) => d.slides.flatMap((s) => s.layers.flatMap((l) => (l.fontFamily && MEASURED[l.fontFamily] ? [l.fontFamily] : [])))),
  ),
];

/** The pickable bundled fonts, for a quick membership test. */
export const isBundledChoice = (id: string): boolean => allFonts().some((f) => f.id === id && f.bundled);
