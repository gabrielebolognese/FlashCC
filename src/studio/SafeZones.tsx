/**
 * What the platform covers, drawn over the artboard.
 *
 * Nobody ships this in an editor. The state of the art is a standalone checker
 * web page you paste a screenshot into, or a rectangle people draw by hand in
 * Canva and remember to delete before exporting. Which is exactly why designs
 * keep arriving with the hook under TikTok's caption bar.
 *
 * Two deliberate choices:
 *
 * It dims the COVERED area rather than outlining the safe one. An outline reads
 * as a guide you may cross; a shadow over the dead zone reads as space that is
 * already taken, which is what it is.
 *
 * It renders only inside Canvas, never in the print portal. That is not a
 * precaution, it is the reason it can be this loud, an overlay that could leak
 * into an export would have to be subtle enough to be useless.
 */
import { safeBox, type Platform } from "./platforms.js";

export function SafeZones({
  platform,
  width,
  height,
  zoom,
}: {
  platform: Platform;
  width: number;
  height: number;
  /** Needed so hairlines and labels stay one screen pixel at any zoom. */
  zoom: number;
}) {
  const box = safeBox(platform, width, height);
  const px = 1 / zoom;

  // Four bands rather than one box with a hole, so each can be labelled.
  const bands = [
    { key: "top", x: 0, y: 0, w: width, h: box.y },
    { key: "bottom", x: 0, y: box.y + box.h, w: width, h: height - (box.y + box.h) },
    { key: "left", x: 0, y: box.y, w: box.x, h: box.h },
    { key: "right", x: box.x + box.w, y: box.y, w: width - (box.x + box.w), h: box.h },
  ].filter((b) => b.w > 0.5 && b.h > 0.5);

  if (bands.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {bands.map((b) => (
        <div
          key={b.key}
          className="absolute"
          style={{
            left: b.x,
            top: b.y,
            width: b.w,
            height: b.h,
            background: "rgba(229,84,90,0.18)",
          }}
        />
      ))}

      <div
        className="absolute"
        style={{
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          outline: `${px * 1.5}px dashed rgba(255,255,255,0.55)`,
          outlineOffset: -px,
        }}
      />

      {/* Scaled against zoom so it reads the same size whatever the canvas is at. */}
      <div
        className="absolute whitespace-nowrap rounded font-semibold"
        style={{
          left: box.x + px * 8,
          top: box.y + px * 8,
          padding: `${px * 3}px ${px * 6}px`,
          fontSize: px * 11,
          lineHeight: 1.2,
          background: "rgba(0,0,0,0.6)",
          color: "rgba(255,255,255,0.85)",
        }}
      >
        {platform.label} safe area
      </div>
    </div>
  );
}
