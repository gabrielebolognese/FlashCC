/**
 * What each platform actually does to a carousel after you upload it.
 *
 * Every number here is a constraint someone discovered the expensive way, and
 * the reason this file exists is that none of them are visible at design time.
 * A deck can look perfect in the editor and arrive cropped, blurred, or rejected.
 *
 * Three of these are worth knowing before reading the table:
 *
 * LinkedIn RASTERISES every PDF you give it, down to 1080px wide, JPEG at around
 * 80-85%. So "keep the text vector" is folk wisdom that does not survive contact
 * with the pipeline. What survives is designing at exactly the target size, in
 * sRGB, with type big enough to still be legible after a lossy pass.
 *
 * Instagram crops EVERY slide to the aspect ratio of the FIRST one. Get slide 1
 * wrong and all ten are ruined. Its grid also crops the cover, which is why the safe zone is a crop of the cover to the grid's tile ratio, 3:4
 * since January 2025, anything outside it is invisible to anyone browsing your
 * profile.
 *
 * And the ceilings differ from what the apps allow. Instagram's Graph API takes
 * ten slides while the app takes twenty, so a twenty-slide deck can never be
 * published by any scheduler, ever, not a FlashCC limitation, and worth saying
 * out loud before somebody builds one.
 */

export type PlatformId =
  | "linkedin"
  | "instagram"
  | "tiktok"
  | "threads"
  | "x"
  | "bluesky"
  | "pinterest"
  | "facebook";

/** Pixels of each edge covered by platform UI, or lost to a crop. */
export type SafeZone = { top: number; right: number; bottom: number; left: number };

/**
 * One artboard a destination accepts.
 *
 * `api: false` marks a shape the native app takes and the publishing API does
 * not. Instagram's 3:4 is the case that made this a field: the app posts it,
 * and every scheduler guide that mentions it says the Graph API still refuses
 * anything taller than 4:5. Same trap as `appMaxSlides`, different axis.
 */
export type Shape = { label: string; w: number; h: number; api?: false | undefined };

export type Platform = {
  id: PlatformId;
  label: string;
  /** The artboard this platform wants by default. Always `shapes[0]`. */
  w: number;
  h: number;
  /**
   * Every artboard it takes without complaint, the default first.
   *
   * A list because "the right size" stopped being one size in 2025: Instagram
   * takes 4:5, 3:4 and 1:1, and a 4:5 deck is not wrong just because 3:4 now
   * exists. Anything in here is silent in the pre-flight; 3:4 is OFFERED,
   * never imposed.
   */
  shapes: Shape[];
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
  /** Fewer than this and it is not a carousel. Pinterest's floor is two. */
  minSlides?: number | undefined;
  /**
   * Images per POST, for destinations that have no carousel at all.
   *
   * X and Bluesky take four pictures a post, so a ten-slide deck is a thread of
   * posts, not a post. Present means the export splits, see `postSizes`.
   */
  perPost?: number | undefined;
  /**
   * How many slides the destination is FOR, when that is fewer than the deck.
   *
   * Pinterest takes five and each pin is found on its own, so the export
   * proposes which five rather than refusing the deck. See `pickSlides`.
   */
  keep?: number | undefined;
  safe: SafeZone;
  /**
   * The ratio a profile grid crops every cover to, when there is one.
   *
   * Instagram moved its grid to tall 3:4 tiles in January 2025. Before that the
   * grid was square and the crop was 135px top and bottom of a 4:5 cover, which
   * is what this file used to say. A 4:5 cover now loses about 34px off each
   * SIDE instead, a 3:4 cover loses nothing, and a square one loses 135px a
   * side. Derived from the board rather than stored as insets, because the
   * insets are different for every shape and the ratio is one number.
   */
  gridAspect?: number | undefined;
  /**
   * What the safe box actually IS, which decides what to say about it.
   *
   * "interface", platform chrome is drawn on top: an author name, a slide
   * counter, an action rail. Content under it is genuinely obscured.
   *
   * "crop", nothing is drawn on top and nothing is obscured. The image is
   * CUT, somewhere specific, and only there.
   *
   * These were one thing until a bug report, and the message said "covers with
   * its own interface" for both, which is simply untrue of Instagram and sent
   * people looking for an overlay that does not exist.
   */
  safeKind: "interface" | "crop";
  /**
   * Which slides it applies to.
   *
   * "all" for chrome, because chrome is on every slide. "first" for Instagram,
   * because the thing doing the cropping is the PROFILE GRID and the grid only
   * ever shows the cover, warning about slides 2 to 10 was reporting a
   * consequence that cannot happen.
   */
  safeScope: "all" | "first";
  /** Below these, type stops surviving the platform's compression. */
  minBodyPt: number;
  minHeadingPt: number;
  minStrokePx: number;
  note: string;
  /**
   * The day the numbers in this row were last checked against the platform's
   * own documentation, as YYYY-MM-DD. Null means never, and a row with no date
   * does not ship: unverified numbers from size-guide blogs are how Batch 1's
   * Instagram ceiling nearly shipped wrong. `npm run check:platforms` lists any
   * date older than 180 days.
   */
  verified: string | null;
  /** Where the numbers came from, so the next check starts somewhere. */
  sources: string[];
};

const NO_INSET: SafeZone = { top: 0, right: 0, bottom: 0, left: 0 };

/** The day the 17.2 rows were checked against each platform's own docs. */
const CHECKED = "2026-10-16";

/**
 * Every destination anybody cross-posts a carousel to, shipped or not.
 *
 * `PLATFORMS` below is the shipped list: the rows with a verified date. Keeping
 * the unverified ones here rather than in a comment means `check:platforms` can
 * name them, and adding one is a date away rather than a rewrite.
 */
export const CANDIDATES: Platform[] = [
  {
    id: "linkedin",
    label: "LinkedIn",
    w: 1080,
    h: 1350,
    // Any ratio works as a PDF page; these are the ones worth designing at.
    shapes: [
      { label: "4:5", w: 1080, h: 1350 },
      { label: "1:1", w: 1080, h: 1080 },
    ],
    output: "pdf",
    imageFormat: "jpg",
    quality: 0.92,
    minBytes: 800_000,
    maxBytes: 2_000_000,
    maxSlides: 300,
    // Author name sits over the top, the slide counter and arrows over the bottom.
    safe: { top: 80, right: 40, bottom: 80, left: 40 },
    safeKind: "interface",
    safeScope: "all",
    minBodyPt: 18,
    minHeadingPt: 24,
    minStrokePx: 2,
    note: "Rasterised to 1080px wide and recompressed. Big type survives; thin type does not.",
    verified: CHECKED,
    sources: ["https://www.linkedin.com/help/linkedin/answer/a518909 (100MB, 300 pages)"],
  },
  {
    id: "instagram",
    label: "Instagram",
    w: 1080,
    h: 1350,
    shapes: [
      { label: "4:5", w: 1080, h: 1350 },
      { label: "3:4", w: 1080, h: 1440, api: false },
      { label: "1:1", w: 1080, h: 1080 },
    ],
    output: "images",
    imageFormat: "jpg",
    quality: 0.9,
    minBytes: 200_000,
    maxBytes: 1_500_000,
    maxSlides: 10,
    appMaxSlides: 20,
    // Not UI, and not insets: the profile grid crops the cover to 3:4.
    safe: NO_INSET,
    gridAspect: 3 / 4,
    // A crop, not an overlay, and only on the cover, see the field docs above.
    safeKind: "crop",
    safeScope: "first",
    minBodyPt: 18,
    minHeadingPt: 24,
    minStrokePx: 2,
    note: "Every slide is cropped to the first slide's ratio. The grid shows a 3:4 tile, so 3:4 is the one size it never crops.",
    verified: CHECKED,
    sources: [
      "https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media (10 per carousel through the API)",
      "https://www.lindseygamble.com/blog/instagram-now-supports-34-aspect-ratio-for-photos-and-carousel-posts (3:4 uploads, 3:4 grid)",
      "Scheduler API guides, Oct 2026: the Graph API rejects feed images taller than 4:5, so 3:4 is app-only",
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    w: 1080,
    h: 1920,
    shapes: [{ label: "9:16", w: 1080, h: 1920 }],
    output: "images",
    imageFormat: "jpg",
    quality: 0.9,
    minBytes: 200_000,
    maxBytes: 2_000_000,
    maxSlides: 35,
    // Caption, username, music ticker and nav eat the bottom; the action rail
    // covers the right edge.
    safe: { top: 100, right: 180, bottom: 480, left: 40 },
    safeKind: "interface",
    safeScope: "all",
    minBodyPt: 20,
    minHeadingPt: 28,
    minStrokePx: 2,
    note: "The bottom quarter and the right rail are covered by UI on every slide.",
    verified: CHECKED,
    sources: [
      "https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post (35 photos, JPEG, max 1080p)",
    ],
  },
  {
    id: "threads",
    label: "Threads",
    w: 1080,
    h: 1350,
    shapes: [
      { label: "4:5", w: 1080, h: 1350 },
      { label: "1:1", w: 1080, h: 1080 },
    ],
    output: "images",
    imageFormat: "jpg",
    quality: 0.9,
    minBytes: 200_000,
    maxBytes: 1_500_000,
    // The plan expected Instagram's split (20 in app, 10 through the API).
    // Meta's own Threads docs say 2 to 20 through the API, so there is no gap.
    maxSlides: 20,
    minSlides: 2,
    safe: NO_INSET,
    safeKind: "interface",
    safeScope: "all",
    minBodyPt: 18,
    minHeadingPt: 24,
    minStrokePx: 2,
    note: "Shown at the slide's own ratio, nothing drawn over it. Twenty slides in the app and through the API alike.",
    verified: CHECKED,
    sources: ["https://developers.facebook.com/docs/threads/posts (carousel children: 2 to 20)"],
  },
  {
    id: "x",
    label: "X",
    w: 1080,
    h: 1350,
    shapes: [
      { label: "4:5", w: 1080, h: 1350 },
      { label: "1:1", w: 1080, h: 1080 },
    ],
    output: "images",
    imageFormat: "jpg",
    quality: 0.9,
    minBytes: 200_000,
    maxBytes: 20_000_000,
    // No carousel: a thread of posts, four pictures each. The ceiling is the
    // render's, not X's, which documents no limit on a thread's length.
    maxSlides: 300,
    perPost: 4,
    safe: NO_INSET,
    safeKind: "interface",
    safeScope: "all",
    minBodyPt: 18,
    minHeadingPt: 24,
    minStrokePx: 2,
    note: "Four pictures a post, so the deck becomes a numbered thread. Each image under 5MB.",
    verified: CHECKED,
    sources: ["https://docs.x.com/x-api/media/quickstart/best-practices (4 photos per post, 5MB images)"],
  },
  {
    id: "bluesky",
    label: "Bluesky",
    w: 1080,
    h: 1350,
    shapes: [
      { label: "4:5", w: 1080, h: 1350 },
      { label: "1:1", w: 1080, h: 1080 },
    ],
    output: "images",
    imageFormat: "jpg",
    quality: 0.9,
    minBytes: 200_000,
    maxBytes: 20_000_000,
    maxSlides: 300,
    // `app.bsky.embed.images` caps at four. A newer `embed.gallery` lexicon
    // allows ten, but four is what every client renders today.
    perPost: 4,
    safe: NO_INSET,
    safeKind: "interface",
    safeScope: "all",
    minBodyPt: 18,
    minHeadingPt: 24,
    minStrokePx: 2,
    note: "Four pictures a post, like X, so the deck becomes a numbered thread. Each image under 2MB.",
    verified: CHECKED,
    sources: [
      "github.com/bluesky-social/atproto lexicons/app/bsky/embed/images.json (maxLength 4, maxSize 2000000)",
    ],
  },
  {
    id: "pinterest",
    label: "Pinterest",
    w: 1000,
    h: 1500,
    shapes: [
      { label: "2:3", w: 1000, h: 1500 },
      { label: "1:1", w: 1000, h: 1000 },
    ],
    output: "images",
    imageFormat: "jpg",
    quality: 0.9,
    minBytes: 100_000,
    maxBytes: 20_000_000,
    maxSlides: 5,
    minSlides: 2,
    keep: 5,
    safe: NO_INSET,
    safeKind: "interface",
    safeScope: "all",
    minBodyPt: 18,
    minHeadingPt: 24,
    minStrokePx: 2,
    note: "Two to five images, all one ratio. Taller than anything else here, and each pin is found on its own.",
    verified: CHECKED,
    sources: ["https://help.pinterest.com/en/business/article/create-a-carousel (2 to 5 images, 1:1 or 2:3)"],
  },
  {
    id: "facebook",
    label: "Facebook",
    w: 1080,
    h: 1350,
    shapes: [
      { label: "4:5", w: 1080, h: 1350 },
      { label: "1:1", w: 1080, h: 1080 },
    ],
    output: "images",
    imageFormat: "jpg",
    quality: 0.9,
    minBytes: 200_000,
    maxBytes: 20_000_000,
    maxSlides: 10,
    safe: NO_INSET,
    safeKind: "interface",
    safeScope: "all",
    minBodyPt: 18,
    minHeadingPt: 24,
    minStrokePx: 2,
    note: "Multi-photo post. Not verified, so not offered.",
    // Lowest priority, mostly reached through schedulers, and nothing official
    // was found for the multi-photo ceiling. Not shipped until somebody checks.
    verified: null,
    sources: [],
  },
];

/** What the product offers: the candidates somebody has actually verified. */
export const PLATFORMS: Platform[] = CANDIDATES.filter((p) => p.verified !== null);

export const platformById = (id: PlatformId): Platform =>
  PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0]!;

/**
 * The platform whose artboard matches this document, if any. Used to pick a
 * sensible default target rather than making people choose twice.
 */
export const platformForSize = (w: number, h: number): Platform | undefined =>
  // Default shapes first, so 1080x1350 still means LinkedIn rather than
  // whichever later row happens to accept it as well.
  PLATFORMS.find((p) => p.w === w && p.h === h) ??
  PLATFORMS.find((p) => p.shapes.some((s) => s.w === w && s.h === h));

/** The accepted shape this artboard is, if it is one. */
export const shapeOf = (p: Platform, w: number, h: number): Shape | undefined =>
  p.shapes.find((s) => s.w === w && s.h === h);

/** The safe box in artboard coordinates. */
export function safeBox(
  platform: Platform,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  if (platform.gridAspect !== undefined) return gridCrop(platform.gridAspect, w, h);

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

/**
 * The centred box a grid tile of `aspect` (width over height) shows.
 *
 * Wider than the tile, the sides go; taller, the top and bottom go; the same
 * ratio, nothing does.
 */
export function gridCrop(
  aspect: number,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  const board = w / h;
  if (Math.abs(board - aspect) < 0.001) return { x: 0, y: 0, w, h };
  if (board > aspect) {
    const shown = h * aspect;
    return { x: (w - shown) / 2, y: 0, w: shown, h };
  }
  const shown = w / aspect;
  return { x: 0, y: (h - shown) / 2, w, h: shown };
}

export const hasSafeZone = (p: Platform): boolean =>
  p.gridAspect !== undefined || p.safe.top + p.safe.right + p.safe.bottom + p.safe.left > 0;

/** Days between a YYYY-MM-DD and `today`. */
const daysSince = (iso: string, today: Date): number =>
  Math.floor((today.getTime() - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);

/**
 * What `npm run check:platforms` reports. A warning, never a failing test: a
 * test that fails on the calendar is a test people learn to ignore.
 */
export function platformAudit(
  rows: readonly Platform[],
  today: Date,
  maxAgeDays = 180,
): { stale: { id: PlatformId; days: number }[]; unverified: PlatformId[] } {
  const stale: { id: PlatformId; days: number }[] = [];
  const unverified: PlatformId[] = [];
  for (const p of rows) {
    if (p.verified === null) unverified.push(p.id);
    else if (daysSince(p.verified, today) > maxAgeDays) {
      stale.push({ id: p.id, days: daysSince(p.verified, today) });
    }
  }
  return { stale, unverified };
}

export { NO_INSET };
