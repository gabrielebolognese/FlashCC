/**
 * Backgrounds that are generated, not downloaded (21.3).
 *
 * Seven small generators drawn from the brand's own colours: a gradient mesh,
 * grain, a dot grid, a line field, soft blobs, paper and geometric tiles. Each
 * returns an SVG, transparent where it is not drawing, that sits over the
 * slide's own background or gradient.
 *
 * ── Generated once, then stored ─────────────────────────────────────────────
 *
 * Invariant 1 says what is stored is what renders, so the SVG is generated
 * when the texture is applied and the data URL is written onto the slide.
 * `kind`, `seed` and `strength` beside it are a record of the input, like a
 * block's fields: they let the control show what was chosen and regenerate on
 * purpose, and nothing re-reads them at paint time. Changing the brand
 * afterwards does not repaint a texture, re-applying it does.
 *
 * ── Seeded by the deck ──────────────────────────────────────────────────────
 *
 * The seed is `seedOf` over the deck's words, the same seed Batch 4 lays
 * compositions out with, so one carousel is consistent, two carousels differ,
 * and the same carousel twice gets the same texture. The patterns use the deck
 * seed on every slide; the mesh and the blobs move per slide, because the same
 * blob in the same corner of nine slides reads as a watermark.
 *
 * ── The landmine: noise does not compress ───────────────────────────────────
 *
 * Grain and paper are high-frequency detail, which is exactly what JPEG spends
 * bytes on. LinkedIn's PDF is built from JPEG pages and wants the file under
 * 2MB (Batch 1.2), so the strength of the two noisy generators is capped on
 * small-ceiling JPEG destinations. `strengthCap` is that cap and the pre-flight
 * file-size check is what proves it.
 */
import { seedOf } from "./compositions.js";
import { mix } from "./colour.js";
import type { Doc, Slide, SlideTexture, TextureKind } from "./model.js";
import type { Platform } from "./platforms.js";
import type { Theme } from "./presets.js";

export const TEXTURES: { id: TextureKind; label: string }[] = [
  { id: "mesh", label: "Gradient mesh" },
  { id: "grain", label: "Grain" },
  { id: "dots", label: "Dot grid" },
  { id: "lines", label: "Line field" },
  { id: "blobs", label: "Soft blobs" },
  { id: "paper", label: "Paper" },
  { id: "tiles", label: "Tiles" },
];

/** The two that put fine noise on every pixel, which is what costs bytes. */
export const NOISY: ReadonlySet<TextureKind> = new Set(["grain", "paper"]);

export const DEFAULT_STRENGTH = 0.5;

/**
 * The most a texture may be turned up for a destination. Noise on a JPEG
 * destination with a 2MB ceiling stops at 0.6, which measured comfortably
 * under the ceiling for a 10-slide deck (see the reference, 21.3); everything
 * else, and every destination with room, goes to 1.
 */
export function strengthCap(kind: TextureKind, platform: Platform | null | undefined): number {
  if (!platform || !NOISY.has(kind)) return 1;
  return platform.imageFormat === "jpg" && platform.maxBytes <= 2_000_000 ? 0.6 : 1;
}

/* ── seeded randomness ────────────────────────────────────────────────────── */

/** mulberry32: small, fast, and the same sequence for the same seed everywhere. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number): string => String(Math.round(n * 10) / 10);
const r3 = (n: number): string => String(Math.round(n * 1000) / 1000);

type Colours = Pick<Theme, "bg" | "fg" | "accent" | "muted">;
type Ctx = { w: number; h: number; c: Colours; s: number; rand: () => number; seed: number };

/**
 * A mask that keeps the pattern towards one corner and lets it fade out before
 * the middle, where the words are. A seeded corner, so it differs per deck.
 */
function fadeMask(x: Ctx): { defs: string; attr: string } {
  const corner = Math.floor(x.rand() * 4);
  const [x1, y1, x2, y2] = [
    ["0", "0", "1", "1"],
    ["1", "0", "0", "1"],
    ["0", "1", "1", "0"],
    ["1", "1", "0", "0"],
  ][corner]!;
  return {
    defs:
      `<linearGradient id="fg" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
      `<stop offset="0" stop-color="#fff"/><stop offset="0.75" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<mask id="fm"><rect width="${x.w}" height="${x.h}" fill="url(#fg)"/></mask>`,
    attr: ` mask="url(#fm)"`,
  };
}

const GENERATORS: Record<TextureKind, (x: Ctx) => { defs: string; body: string }> = {
  mesh(x) {
    const colours = [x.c.accent, x.c.muted, mix(x.c.accent, x.c.fg, 0.4), mix(x.c.accent, x.c.bg, 0.3)];
    let defs = "";
    let body = "";
    colours.forEach((colour, i) => {
      const r = (0.45 + x.rand() * 0.4) * Math.max(x.w, x.h);
      defs +=
        `<radialGradient id="m${i}"><stop offset="0" stop-color="${colour}" stop-opacity="${r3(0.4 * x.s)}"/>` +
        `<stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`;
      body += `<circle cx="${r1(x.rand() * x.w)}" cy="${r1(x.rand() * x.h)}" r="${r1(r)}" fill="url(#m${i})"/>`;
    });
    return { defs, body };
  },

  grain(x) {
    return {
      defs:
        `<filter id="n" x="0" y="0" width="100%" height="100%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${x.seed % 997}" stitchTiles="stitch"/>` +
        `<feColorMatrix type="saturate" values="0"/></filter>`,
      body: `<rect width="${x.w}" height="${x.h}" filter="url(#n)" opacity="${r3(0.3 * x.s)}"/>`,
    };
  },

  dots(x) {
    const gap = 22 + Math.round(x.rand() * 4) * 6;
    const r = 2 + Math.round(x.rand() * 2);
    const m = fadeMask(x);
    return {
      defs:
        m.defs +
        `<pattern id="p" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse">` +
        `<circle cx="${gap / 2}" cy="${gap / 2}" r="${r}" fill="${x.c.muted}"/></pattern>`,
      body: `<rect width="${x.w}" height="${x.h}" fill="url(#p)" opacity="${r3(0.7 * x.s)}"${m.attr}/>`,
    };
  },

  lines(x) {
    const gap = 16 + Math.round(x.rand() * 4) * 5;
    const angle = [45, -45, 30, -30, 90][Math.floor(x.rand() * 5)]!;
    const m = fadeMask(x);
    return {
      defs:
        m.defs +
        `<pattern id="p" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})">` +
        `<line x1="0" y1="0" x2="0" y2="${gap}" stroke="${x.c.muted}" stroke-width="2"/></pattern>`,
      body: `<rect width="${x.w}" height="${x.h}" fill="url(#p)" opacity="${r3(0.6 * x.s)}"${m.attr}/>`,
    };
  },

  blobs(x) {
    const colours = [x.c.accent, x.c.muted, mix(x.c.accent, x.c.fg, 0.3)];
    const blur = Math.round(Math.min(x.w, x.h) * 0.05);
    let body = "";
    // Corners, never the middle: a blob behind the headline is a contrast problem.
    const corners: [number, number][] = [
      [0.1, 0.1],
      [0.9, 0.15],
      [0.15, 0.9],
      [0.85, 0.85],
    ];
    // Fisher-Yates, not a random comparator: sort's algorithm is the engine's
    // business, and the editor and the export must agree.
    for (let i = corners.length - 1; i > 0; i -= 1) {
      const j = Math.floor(x.rand() * (i + 1));
      [corners[i], corners[j]] = [corners[j]!, corners[i]!];
    }
    for (let i = 0; i < 3; i += 1) {
      const [fx, fy] = corners[i]!;
      const cx = fx * x.w;
      const cy = fy * x.h;
      const base = (0.18 + x.rand() * 0.12) * Math.max(x.w, x.h);
      const n = 7;
      const pts = Array.from({ length: n }, (_, k) => {
        const a = (k / n) * Math.PI * 2;
        const rr = base * (0.75 + x.rand() * 0.5);
        return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as const;
      });
      // A closed curve through the midpoints, with the points as controls: smooth, no kinks.
      const mid = (p: readonly [number, number], q: readonly [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const start = mid(pts[n - 1]!, pts[0]!);
      let d = `M${r1(start[0]!)} ${r1(start[1]!)}`;
      for (let k = 0; k < n; k += 1) {
        const p = pts[k]!;
        const q = mid(p, pts[(k + 1) % n]!);
        d += `Q${r1(p[0])} ${r1(p[1])} ${r1(q[0]!)} ${r1(q[1]!)}`;
      }
      body += `<path d="${d}Z" fill="${colours[i]}" opacity="${r3(0.45 * x.s)}" filter="url(#b)"/>`;
    }
    return {
      defs: `<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur}"/></filter>`,
      body,
    };
  },

  paper(x) {
    return {
      defs:
        `<filter id="n" x="0" y="0" width="100%" height="100%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.04 0.06" numOctaves="4" seed="${x.seed % 997}" stitchTiles="stitch"/>` +
        `<feColorMatrix type="saturate" values="0"/></filter>` +
        `<filter id="f" x="0" y="0" width="100%" height="100%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="${(x.seed + 1) % 997}"/>` +
        `<feColorMatrix type="saturate" values="0"/></filter>`,
      body:
        `<rect width="${x.w}" height="${x.h}" filter="url(#n)" opacity="${r3(0.22 * x.s)}"/>` +
        `<rect width="${x.w}" height="${x.h}" filter="url(#f)" opacity="${r3(0.1 * x.s)}"/>`,
    };
  },

  tiles(x) {
    const size = [90, 108, 120, 135][Math.floor(x.rand() * 4)]!;
    const m = fadeMask(x);
    const fills = [x.c.accent, x.c.muted];
    let body = "";
    for (let ty = 0; ty < x.h; ty += size) {
      for (let tx = 0; tx < x.w; tx += size) {
        const pick = Math.floor(x.rand() * 5);
        const fill = fills[Math.floor(x.rand() * 2)]!;
        const s = size;
        if (pick === 0) {
          // A quarter circle in one corner.
          const q = Math.floor(x.rand() * 4);
          const cx = q === 1 || q === 2 ? tx + s : tx;
          const cy = q >= 2 ? ty + s : ty;
          const sx = q === 1 || q === 2 ? -1 : 1;
          const sy = q >= 2 ? -1 : 1;
          body += `<path d="M${cx} ${cy}h${sx * s}A${s} ${s} 0 0 ${sx * sy > 0 ? 1 : 0} ${cx} ${cy + sy * s}Z" fill="${fill}"/>`;
        } else if (pick === 1) {
          body += `<path d="M${tx} ${ty}h${s}L${tx} ${ty + s}Z" fill="${fill}"/>`;
        } else if (pick === 2) {
          body += `<circle cx="${tx + s / 2}" cy="${ty + s / 2}" r="${s * 0.3}" fill="${fill}"/>`;
        }
      }
    }
    return { defs: m.defs, body: `<g opacity="${r3(0.28 * x.s)}"${m.attr}>${body}</g>` };
  },
};

/** The SVG for one slide. Pure: the same arguments always give the same bytes. */
export function textureSvg(kind: TextureKind, seed: number, strength: number, colours: Colours, w: number, h: number): string {
  const s = Math.max(0, Math.min(1, strength));
  const x: Ctx = { w, h, c: colours, s, rand: rng(seed), seed };
  const { defs, body } = GENERATORS[kind](x);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">` +
    `<defs>${defs}</defs>${body}</svg>`
  );
}

export const svgDataUrl = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** The deck's own seed: its words, so it changes when the carousel does and not otherwise. */
export const deckSeed = (doc: Doc): number =>
  seedOf(doc.slides.flatMap((s) => s.layers.flatMap((l) => (l.kind === "text" && !l.furniture ? [l.text ?? ""] : []))));

/** The mesh and blobs move per slide; the patterns hold still across the deck. */
const slideSeed = (kind: TextureKind, seed: number, index: number): number =>
  kind === "mesh" || kind === "blobs" ? seed + index * 7919 : seed;

export function textureFor(
  kind: TextureKind,
  seed: number,
  index: number,
  strength: number,
  colours: Colours,
  w: number,
  h: number,
): SlideTexture {
  const own = slideSeed(kind, seed, index);
  return { kind, seed, strength, src: svgDataUrl(textureSvg(kind, own, strength, colours, w, h)) };
}

/**
 * Stamps a texture on the chosen slides (every slide when `only` is absent),
 * at a strength already held under the destination's cap.
 */
export function applyTexture(
  doc: Doc,
  kind: TextureKind | null,
  strength: number,
  colours: Colours,
  platform: Platform | null | undefined,
  only?: number,
): Doc {
  const seed = deckSeed(doc);
  const slides = doc.slides.map((s, i): Slide => {
    if (only !== undefined && i !== only) return s;
    if (!kind) {
      const { texture: _gone, ...rest } = s;
      return rest;
    }
    const capped = Math.min(strength, strengthCap(kind, platform));
    return { ...s, texture: textureFor(kind, seed, i, capped, colours, doc.width, doc.height) };
  });
  return { ...doc, slides };
}
