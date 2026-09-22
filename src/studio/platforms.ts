/**
 * What each platform actually does to a carousel after you upload it.
 *
 * Every number here is a constraint someone discovered the expensive way, and
 * the reason this file exists is that none of them are visible at design time.
 * A deck can look perfect in the editor and arrive cropped, blurred, or rejected.
 *
 * Three of these are worth knowing before reading the table:
 *
 * LinkedIn RASTERISES every PDF you give it — down to 1080px wide, JPEG at around
 * 80-85%. So "keep the text vector" is folk wisdom that does not survive contact
 * with the pipeline. What survives is designing at exactly the target size, in
 * sRGB, with type big enough to still be legible after a lossy pass.
 *
 * Instagram crops EVERY slide to the aspect ratio of the FIRST one. Get slide 1
 * wrong and all ten are ruined. Its grid also shows a centred square crop, which
 * is why the safe zone for a 4:5 slide is the middle 1080×1080 — anything outside
 * it is invisible to anyone browsing your profile.
 *
 * And the ceilings differ from what the apps allow. Instagram's Graph API takes
 * ten slides while the app takes twenty, so a twenty-slide deck can never be
 * published by any scheduler, ever — not a FlashCC limitation, and worth saying
 * out loud before somebody builds one.
 */

export type PlatformId = "linkedin" | "instagram" | "tiktok";

/** Pixels of each edge covered by platform UI, or lost to a crop. */
export type SafeZone = { top: number; right: number; bottom: number; left: number };

export type Platform = {
  id: PlatformId;
  label: string;
  /** The artboard this platform wants. */
  w: number;
  h: number;
  /** What leaves the app: a document, or a numbered run of images. */
  output: "pdf" | "images";
  /**
   * The encoder for each rendered page. JPG for anything LinkedIn-bound: PNG
   * pages have been observed converting to a PDF that renders blank, and the
   * failure is silent until it is live.
   */
  imageFormat: "jpg" | "png";
  /** JPEG quality, 0-1. Ignored for PNG. */
  quality: number;
  /** The band a finished file should land in, in bytes. */
  minBytes: number;
  maxBytes: number;
  /** What the publishing API will accept. */
  maxSlides: number;
  /** What the native app accepts, when it is more. The gap is a trap. */
  appMaxSlides?: number | undefined;
  safe: SafeZone;
  /** Below these, type stops surviving the platform's compression. */
  minBodyPt: number;
  minHeadingPt: number;
  minStrokePx: number;
  note: string;
};

const NO_INSET: SafeZone = { top: 0, right: 0, bottom: 0, left: 0 };

export const PLATFORMS: Platform[] = [
  {
    id: "linkedin",
    label: "LinkedIn",
    w: 1080,
    h: 1350,
    output: "pdf",
    imageFormat: "jpg",
    quality: 0.92,
    minBytes: 800_000,
    maxBytes: 2_000_000,
    maxSlides: 300,
    // Author name sits over the top, the slide counter and arrows over the bottom.
    safe: { top: 80, right: 40, bottom: 80, left: 40 },
    minBodyPt: 18,
    minHeadingPt: 24,
    minStrokePx: 2,
    note: "Rasterised to 1080px wide and recompressed. Big type survives; thin type does not.",
  },
  {
    id: "instagram",
    label: "Instagram",
    w: 1080,
    h: 1350,
    output: "images",
    imageFormat: "jpg",
    quality: 0.9,
    minBytes: 200_000,
    maxBytes: 1_500_000,
    maxSlides: 10,
    appMaxSlides: 20,
    // Not UI: the profile grid crops 4:5 to a centred square, so (1350-1080)/2
    // at top and bottom is invisible to anyone browsing your profile.
    safe: { top: 135, right: 0, bottom: 135, left: 0 },
    minBodyPt: 18,
    minHeadingPt: 24,
    minStrokePx: 2,
    note: "Every slide is cropped to the first slide's ratio. The grid shows a centred square.",
  },
  {
    id: "tiktok",
    label: "TikTok",
    w: 1080,
    h: 1920,
    output: "images",
    imageFormat: "jpg",
    quality: 0.9,
    minBytes: 200_000,
    maxBytes: 2_000_000,
    maxSlides: 35,
    // Caption, username, music ticker and nav eat the bottom; the action rail
    // covers the right edge.
    safe: { top: 100, right: 180, bottom: 480, left: 40 },
    minBodyPt: 20,
    minHeadingPt: 28,
    minStrokePx: 2,
    note: "The bottom quarter and the right rail are covered by UI on every slide.",
  },
];

export const platformById = (id: PlatformId): Platform =>
  PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0]!;

/**
 * The platform whose artboard matches this document, if any. Used to pick a
 * sensible default target rather than making people choose twice.
 */
export const platformForSize = (w: number, h: number): Platform | undefined =>
  PLATFORMS.find((p) => p.w === w && p.h === h);

/** The safe box in artboard coordinates. */
export function safeBox(
  platform: Platform,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  // Scale the insets when the document is not at the platform's own size, so the
  // overlay still means something on a 1:1 artboard aimed at LinkedIn.
  const sx = w / platform.w;
  const sy = h / platform.h;
  const left = platform.safe.left * sx;
  const right = platform.safe.right * sx;
  const top = platform.safe.top * sy;
  const bottom = platform.safe.bottom * sy;

  return {
    x: left,
    y: top,
    w: Math.max(0, w - left - right),
    h: Math.max(0, h - top - bottom),
  };
}

export const hasSafeZone = (p: Platform): boolean =>
  p.safe.top + p.safe.right + p.safe.bottom + p.safe.left > 0;

export { NO_INSET };
