/**
 * Generates the bundled type (Batch 22): `npm run build:fonts`.
 *
 * Reads the @fontsource packages (every family OFL-1.1) and writes:
 *
 *   src/render/fonts/faces.ts      one entry per woff2 subset file, with its
 *                                  unicode-range, imported with `?url` so Vite
 *                                  emits it and the browser fetches only the
 *                                  subsets a page actually uses.
 *   src/render/fonts/advances.json per family and weight, the advance of every
 *                                  Latin character in thousandths of an em,
 *                                  plus an average per other script. Small and
 *                                  synchronous: measurement cannot wait.
 *   src/render/fonts/kern/<id>.json kerning (and two-letter ligature) deltas
 *                                  for the Latin pairs that have one, loaded
 *                                  with the face. A refinement: without it the
 *                                  measure over-estimates, which is the safe way.
 *
 * Measured with fontkit from the same woff2 files the browser renders, which is
 * the whole point: Batch 4 found that measuring with one face and rendering
 * with another overflowed three slides in four (D1).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as fontkit from "fontkit";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const out = join(root, "src/render/fonts");

/**
 * The bundled families. `id` is what a layer stores in `fontFamily`; `pkg` the
 * fontsource package; `weights` the steps shipped. Every pair in `pairs.ts` is
 * built from these ids, and its types refuse an id with no metrics.
 */
const FAMILIES = [
  // Editorial
  ["playfair", "playfair-display", "Playfair Display", [400, 500, 700, 900]],
  ["sourceserif", "source-serif-4", "Source Serif 4", [400, 500, 700, 900]],
  ["fraunces", "fraunces", "Fraunces", [400, 500, 700, 900]],
  ["inter", "inter", "Inter", [400, 500, 700, 900]],
  ["dmserif", "dm-serif-display", "DM Serif Display", [400]],
  ["dmsans", "dm-sans", "DM Sans", [400, 500, 700, 900]],
  ["baskerville", "libre-baskerville", "Libre Baskerville", [400, 700]],
  ["lato", "lato", "Lato", [400, 700, 900]],
  // Technical
  ["spacegrotesk", "space-grotesk", "Space Grotesk", [400, 500, 700]],
  ["plexsans", "ibm-plex-sans", "IBM Plex Sans", [400, 500, 700]],
  ["plexmono", "ibm-plex-mono", "IBM Plex Mono", [400, 500, 700]],
  ["jetbrains", "jetbrains-mono", "JetBrains Mono", [400, 500, 700, 800]],
  ["spacemono", "space-mono", "Space Mono", [400, 700]],
  ["worksans", "work-sans", "Work Sans", [400, 500, 700, 900]],
  // Friendly
  ["poppins", "poppins", "Poppins", [400, 500, 700, 900]],
  ["opensans", "open-sans", "Open Sans", [400, 500, 700, 800]],
  ["nunito", "nunito", "Nunito", [400, 500, 700, 900]],
  ["rubik", "rubik", "Rubik", [400, 500, 700, 900]],
  ["karla", "karla", "Karla", [400, 500, 700, 800]],
  ["quicksand", "quicksand", "Quicksand", [400, 500, 700]],
  // Luxury
  ["cormorant", "cormorant-garamond", "Cormorant Garamond", [400, 500, 700]],
  ["montserrat", "montserrat", "Montserrat", [400, 500, 700, 900]],
  ["bodoni", "bodoni-moda", "Bodoni Moda", [400, 500, 700, 900]],
  ["jost", "jost", "Jost", [400, 500, 700, 900]],
  ["cinzel", "cinzel", "Cinzel", [400, 500, 700, 900]],
  ["raleway", "raleway", "Raleway", [400, 500, 700, 900]],
  ["marcellus", "marcellus", "Marcellus", [400]],
  // Brutal
  ["anton", "anton", "Anton", [400]],
  ["archivoblack", "archivo-black", "Archivo Black", [400]],
  ["archivo", "archivo", "Archivo", [400, 500, 700, 900]],
  ["bebas", "bebas-neue", "Bebas Neue", [400]],
  ["roboto", "roboto", "Roboto", [400, 500, 700, 900]],
  ["oswald", "oswald", "Oswald", [400, 500, 700]],
  ["sourcesans", "source-sans-3", "Source Sans 3", [400, 500, 700, 900]],
  // Handwritten
  ["caveat", "caveat", "Caveat", [400, 500, 700]],
  ["kalam", "kalam", "Kalam", [400, 700]],
  ["patrickhand", "patrick-hand", "Patrick Hand", [400]],
  ["gochihand", "gochi-hand", "Gochi Hand", [400]],
];

/**
 * Fallbacks every stack ends with, before the generic family: colour emoji
 * first (22.6), then the scripts the pairs do not cover (22.5). Faces only, no
 * metrics: measurement handles these scripts by their own rules.
 */
const FALLBACKS = [
  // Not Noto Color Emoji: fontsource ships its OpenType-SVG flavour, which
  // Chrome does not draw at all, so every emoji exported blank (found by the
  // 22.6 test). Twemoji as a COLRv0 font draws in Chrome, Firefox and Safari
  // alike, so the editor and the export agree on every browser. See EMOJI.
  ["emoji", null, "Twemoji", [400]],
  ["notosans", "noto-sans", "Noto Sans", [400, 700]],
  ["arabic", "noto-sans-arabic", "Noto Sans Arabic", [400, 700]],
  ["hebrew", "noto-sans-hebrew", "Noto Sans Hebrew", [400, 700]],
  ["jp", "noto-sans-jp", "Noto Sans JP", [400, 700]],
  ["sc", "noto-sans-sc", "Noto Sans SC", [400, 700]],
  ["kr", "noto-sans-kr", "Noto Sans KR", [400, 700]],
];

/**
 * The emoji face is one file, not a fontsource package. Its range is the emoji
 * blocks only, and deliberately not the digits, `#` or the © ® ™ signs the
 * file also draws: those belong to the text face in front of it.
 */
const EMOJI = {
  file: "twemoji-colr-font/twemoji.woff2",
  range:
    "U+200D,U+203C,U+2049,U+20E3,U+2139,U+2194-2199,U+21A9-21AA,U+231A-231B,U+2328,U+23CF,U+23E9-23F3,U+23F8-23FA,U+24C2,U+25AA-25AB,U+25B6,U+25C0,U+25FB-25FE,U+2600-27BF,U+2934-2935,U+2B05-2B07,U+2B1B-2B1C,U+2B50,U+2B55,U+3030,U+303D,U+3297,U+3299,U+FE0F,U+1F000-1FAFF,U+E0020-E007F",
};

/** Namespaced like uploads, so a face installed on the machine can never stand in. */
const cssFamily = (name) => `FCC ${name}`;

const pkgDir = (pkg) => dirname(require.resolve(`@fontsource/${pkg}/package.json`));

/** The @font-face rules of one weight, as the package's own CSS declares them. */
function facesOf(pkg, weight) {
  const css = readFileSync(join(pkgDir(pkg), `${weight}.css`), "utf8");
  const faces = [];
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const file = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
    if (file) faces.push({ file, range: range ?? "U+0-10FFFF" });
  }
  return faces;
}

/* ── metrics ──────────────────────────────────────────────────────────────── */

const LATIN = [];
for (let c = 32; c <= 126; c += 1) LATIN.push(c);
for (let c = 160; c <= 255; c += 1) LATIN.push(c);
for (const c of [0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2026, 0x2022, 0x20ac]) LATIN.push(c);
const LATIN_CHARS = String.fromCodePoint(...LATIN);

/** Kerning is measured between these: letters, digits and the punctuation next to them. */
const KERN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?'\"-()’“” ";

/** Representative letters per script, for an average advance. */
const SCRIPTS = {
  cyrillic: "абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ",
  greek: "αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ",
};

const fontCache = new Map();
const open = (path) => {
  if (!fontCache.has(path)) fontCache.set(path, fontkit.openSync(path));
  return fontCache.get(path);
};

/** The subset file that covers a code point, for one family and weight. */
function fileFor(pkg, faces, cp) {
  for (const f of faces) {
    if (covers(f.range, cp)) return join(pkgDir(pkg), "files", f.file);
  }
  return null;
}

function covers(range, cp) {
  for (const part of range.split(",")) {
    const m = part.trim().match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i);
    if (!m) continue;
    if (m[1].includes("?")) {
      const lo = parseInt(m[1].replace(/\?/g, "0"), 16);
      const hi = parseInt(m[1].replace(/\?/g, "F"), 16);
      if (cp >= lo && cp <= hi) return true;
      continue;
    }
    const lo = parseInt(m[1], 16);
    const hi = m[2] ? parseInt(m[2], 16) : lo;
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

/** Thousandths of an em. */
const milli = (units, upm) => Math.round((units / upm) * 1000);

function metricsOf(pkg, weight) {
  const faces = facesOf(pkg, weight);
  const latinFile = fileFor(pkg, faces, 0x41);
  if (!latinFile) throw new Error(`${pkg} ${weight}: no Latin subset`);
  const font = open(latinFile);
  const upm = font.unitsPerEm;

  const adv = [];
  const missing = [];
  for (const cp of LATIN) {
    if (!font.hasGlyphForCodePoint(cp)) {
      missing.push(cp);
      adv.push(-1);
      continue;
    }
    adv.push(milli(font.glyphForCodePoint(cp).advanceWidth, upm));
  }
  const known = adv.filter((a) => a >= 0);
  const avg = Math.round(known.reduce((s, a) => s + a, 0) / known.length);
  // A character the subset lacks falls back in the browser to the next face;
  // the average is a fair stand-in and is flagged so a test can see it.
  const filled = adv.map((a) => (a >= 0 ? a : avg));

  const scripts = {};
  for (const [name, letters] of Object.entries(SCRIPTS)) {
    const file = fileFor(pkg, faces, letters.codePointAt(0));
    if (!file) continue;
    const f = open(file);
    const ws = [...letters].filter((ch) => f.hasGlyphForCodePoint(ch.codePointAt(0)));
    if (ws.length === 0) continue;
    scripts[name] = Math.round(ws.reduce((s, ch) => s + milli(f.glyphForCodePoint(ch.codePointAt(0)).advanceWidth, f.unitsPerEm), 0) / ws.length);
  }

  // Pair deltas through the shaper, so kerning and two-letter ligatures both count.
  const kern = {};
  const chars = [...KERN_CHARS].filter((ch) => font.hasGlyphForCodePoint(ch.codePointAt(0)));
  const single = new Map(chars.map((ch) => [ch, font.layout(ch).advanceWidth]));
  for (const a of chars) {
    for (const b of chars) {
      const d = font.layout(a + b).advanceWidth - single.get(a) - single.get(b);
      const m = milli(d, upm);
      if (m !== 0) kern[a + b] = m;
    }
  }

  return { adv: filled, missing: missing.length, scripts, kern };
}

/* ── write ────────────────────────────────────────────────────────────────── */

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "kern"), { recursive: true });

/**
 * Two manifests. The CJK faces' unicode ranges alone are most of the bytes
 * (about 150KB gzipped), and they are only wanted on a page with CJK text on
 * it, so they are a separate chunk `typefaces.ts` loads when it sees some.
 */
const CJK = new Set(["jp", "sc", "kr"]);
const manifests = { main: { imports: [], faces: [] }, cjk: { imports: [], faces: [] } };
const advances = { chars: LATIN_CHARS, families: {} };
let n = 0;

for (const [id, pkg, name, weights] of [...FAMILIES, ...FALLBACKS]) {
  const into = manifests[CJK.has(id) ? "cjk" : "main"];
  if (pkg === null) {
    const v = `f${n++}`;
    into.imports.push(`import ${v} from "${EMOJI.file}?url";`);
    into.faces.push(`  { id: "${id}", family: "${cssFamily(name)}", weight: 400, range: "${EMOJI.range}", url: ${v} },`);
    continue;
  }
  for (const weight of weights) {
    for (const f of facesOf(pkg, weight)) {
      const v = `f${n++}`;
      into.imports.push(`import ${v} from "@fontsource/${pkg}/files/${f.file}?url";`);
      into.faces.push(`  { id: "${id}", family: "${cssFamily(name)}", weight: ${weight}, range: "${f.range}", url: ${v} },`);
    }
  }
}

for (const [id, pkg, name, weights] of FAMILIES) {
  const kernOut = {};
  advances.families[id] = { family: cssFamily(name), weights: {} };
  for (const weight of weights) {
    const m = metricsOf(pkg, weight);
    advances.families[id].weights[weight] = { adv: m.adv, scripts: m.scripts, missing: m.missing };
    kernOut[weight] = m.kern;
  }
  writeFileSync(join(out, "kern", `${id}.json`), JSON.stringify(kernOut));
  process.stdout.write(`${id} `);
}

/**
 * What the fallbacks measure, for text no pair face covers: the average letter
 * of each script in Noto, and the emoji advance. CJK is not measured, it is
 * square by design: one em.
 */
function averageIn(pkg, weight, letters) {
  const faces = facesOf(pkg, weight);
  const ws = [];
  for (const ch of letters) {
    const file = fileFor(pkg, faces, ch.codePointAt(0));
    if (!file) continue;
    const f = open(file);
    if (f.hasGlyphForCodePoint(ch.codePointAt(0))) ws.push(milli(f.glyphForCodePoint(ch.codePointAt(0)).advanceWidth, f.unitsPerEm));
  }
  return Math.round(ws.reduce((a, b) => a + b, 0) / Math.max(1, ws.length));
}
advances.fallbacks = {
  cyrillic: averageIn("noto-sans", 400, SCRIPTS.cyrillic),
  greek: averageIn("noto-sans", 400, SCRIPTS.greek),
  latin: averageIn("noto-sans", 400, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"),
  arabic: averageIn("noto-sans-arabic", 400, "ابتثجحخدذرزسشصضطظعغفقكلمنهوي"),
  hebrew: averageIn("noto-sans-hebrew", 400, "אבגדהוזחטיכלמנסעפצקרשת"),
  emoji: (() => {
    const f = fontkit.openSync(require.resolve(EMOJI.file));
    return milli(f.glyphForCodePoint(0x1f600).advanceWidth, f.unitsPerEm);
  })(),
  cjk: 1000,
};

for (const [file, m] of [["faces.ts", manifests.main], ["faces-cjk.ts", manifests.cjk]]) {
  writeFileSync(
    join(out, file),
    `// Generated by scripts/build-fonts.mjs. Do not edit.\n` +
      `// Every face is OFL-1.1, from the @fontsource packages; see LICENSE-fonts.md.\n` +
      `${m.imports.join("\n")}\n\n` +
      (file === "faces.ts"
        ? `export type FaceFile = { id: string; family: string; weight: number; range: string; url: string };\n\n`
        : `import type { FaceFile } from "./faces.js";\n\n`) +
      `export const FACES: FaceFile[] = [\n${m.faces.join("\n")}\n];\n`,
  );
}
writeFileSync(join(out, "advances.json"), JSON.stringify(advances));
// The ids as a type: `pairs.ts` names its faces with it, so a pair whose face
// has no metrics does not compile, and `npm run build` fails on it (22.2).
writeFileSync(
  join(out, "ids.ts"),
  `// Generated by scripts/build-fonts.mjs. Do not edit.\n` +
    `export const MEASURED_IDS = ${JSON.stringify(FAMILIES.map(([id]) => id))} as const;\n\n` +
    `export type MeasuredId = (typeof MEASURED_IDS)[number];\n`,
);

const lic = [...FAMILIES, ...FALLBACKS.filter(([, pkg]) => pkg !== null)]
  .map(([, pkg, name]) => {
    const p = require(`@fontsource/${pkg}/package.json`);
    return `- **${name}**: \`@fontsource/${pkg}\` ${p.version}, ${p.license ?? "OFL-1.1"}`;
  })
  .join("\n");
writeFileSync(
  join(out, "LICENSE-fonts.md"),
  `# Bundled fonts\n\nAll SIL Open Font License 1.1. The licence permits bundling, embedding and\nredistribution, including in commercial products; the fonts may not be sold on\ntheir own.\n\n${lic}\n` +
    `- **Twemoji**: \`twemoji-colr-font\` ${require("twemoji-colr-font/package.json").version}, the font file OFL-1.1. ` +
    `The emoji artwork is Twemoji, Copyright Twitter, Inc and other contributors, licensed under ` +
    `CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Built as a COLR font by Mozilla's twemoji-colr.\n`,
);

console.log(`\n${manifests.main.faces.length} + ${manifests.cjk.faces.length} CJK faces, ${FAMILIES.length} measured families`);
