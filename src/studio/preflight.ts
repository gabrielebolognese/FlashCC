/**
 * Everything that can be wrong with a deck before it leaves the app.
 *
 * This exists because the failures it catches are all INVISIBLE at design time.
 * A slide with 14pt body text looks fine at 100% zoom and turns to mush after
 * LinkedIn recompresses it. A twenty-slide Instagram carousel looks fine right up
 * until no scheduler on earth will publish it. Content under the TikTok caption
 * bar looks fine to the person who drew it and to nobody else.
 *
 * So the check has to happen against the PLATFORM, not against the artboard, and
 * it has to name the slide — "something is too small" is not actionable at slide
 * seventeen.
 *
 * Pure and DOM-free on purpose: this is the kind of logic that is easy to get
 * subtly wrong and impossible to eyeball, which is exactly what the tests are for.
 *
 * One check deliberately lives elsewhere: file size. It cannot be known until
 * something is actually rendered, so the export path reports it after the fact.
 */

import type { Doc, Layer } from "./model.js";
import { safeBox, type Platform } from "./platforms.js";
import { lineCount, type Measure } from "./text.js";

export type Severity = "block" | "warn";

export type Finding = {
  severity: Severity;
  code: string;
  message: string;
  /** 1-based, the way a person counts slides. Null for whole-document findings. */
  slide: number | null;
  layerId?: string | undefined;
};

/** Placeholder copy the generator leaves behind; shipping it is always a mistake. */
const PLACEHOLDERS = ["type something", "your hook goes here", "the point", "say the thing."];

const measureOf = (l: Layer): Measure => ({
  // The id, not the stack — see the note on Measure.family.
  family: l.fontFamily,
  letterSpacing: l.letterSpacing,
  uppercase: l.uppercase,
});

const isText = (l: Layer): boolean => l.kind === "text" && (l.text ?? "").trim() !== "";

/**
 * Does this layer cross into the band, on an axis where crossing is a mistake?
 *
 * Full bleed is judged PER AXIS, and that is the fix for a whole class of false
 * positives. The old test asked whether a layer bled on both axes at once, which
 * assumed symmetric insets and missed the commonest deliberate shape in the
 * whole product: a band that spans the full width and is a few hundred pixels
 * tall. Every CTA block in every framework is one, and every one of them was
 * reported as a mistake.
 *
 * Bleeding on an axis is a decision. Stopping just short of the edge on that
 * axis is the thing worth mentioning.
 */
function intrudes(
  l: Layer,
  box: { x: number; y: number; w: number; h: number },
  width: number,
  height: number,
): boolean {
  // Half a pixel of tolerance, because a layer laid out at exactly the artboard
  // edge can land at 1079.9997 after a reflow and is not a different design.
  const bleedsX = l.x <= 0.5 && l.x + l.w >= width - 0.5;
  const bleedsY = l.y <= 0.5 && l.y + l.h >= height - 0.5;

  const crossesX = !bleedsX && (l.x < box.x || l.x + l.w > box.x + box.w);
  const crossesY = !bleedsY && (l.y < box.y || l.y + l.h > box.y + box.h);

  return crossesX || crossesY;
}

/** What to say about it, which depends on what the band actually is. */
const safeZoneMessage = (name: string, platform: Platform): string =>
  platform.safeKind === "crop"
    ? `"${name}" sits in the part ${platform.label} crops off in the profile grid. It is fine in the feed; it is the cover thumbnail that loses it.`
    : `"${name}" reaches into the area ${platform.label} covers with its own interface.`;

export function preflight(doc: Doc, platform: Platform): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => out.push(f);

  /* ── whole document ── */

  const count = doc.slides.length;
  if (count > platform.maxSlides) {
    add({
      severity: "block",
      code: "too-many-slides",
      slide: null,
      message: `${count} slides. ${platform.label} publishes at most ${platform.maxSlides}.`,
    });
  }

  // The gap between what the app allows and what its API allows is the sharpest
  // trap in the whole category, so it gets said explicitly rather than implied.
  if (
    platform.appMaxSlides !== undefined &&
    count > platform.maxSlides &&
    count <= platform.appMaxSlides
  ) {
    add({
      severity: "warn",
      code: "app-only-slide-count",
      slide: null,
      message: `${count} slides works if you post by hand, but ${platform.label}'s API caps carousels at ${platform.maxSlides}, so no scheduler can publish this.`,
    });
  }

  if (count === 0) {
    add({ severity: "block", code: "empty", slide: null, message: "There are no slides." });
    return out;
  }

  if (doc.width !== platform.w || doc.height !== platform.h) {
    add({
      severity: "warn",
      code: "wrong-size",
      slide: null,
      message: `Artboard is ${doc.width}×${doc.height}; ${platform.label} wants ${platform.w}×${platform.h}. It will be scaled or cropped.`,
    });
  }

  /* ── per slide ── */

  const box = safeBox(platform, doc.width, doc.height);

  doc.slides.forEach((slide, i) => {
    const n = i + 1;
    const texts = slide.layers.filter(isText);

    for (const l of slide.layers) {
      if (!l.visible) continue;

      if (isText(l)) {
        const size = l.fontSize ?? 0;

        if (size < platform.minBodyPt) {
          add({
            severity: "block",
            code: "type-too-small",
            slide: n,
            layerId: l.id,
            message: `"${l.name}" is ${Math.round(size)}pt. ${platform.label} needs at least ${platform.minBodyPt}pt to stay legible after compression.`,
          });
        }

        // Does the copy actually fit the box it was given? The generator
        // guarantees this; a person typing into an existing layer does not.
        const lines = lineCount(l.text ?? "", size, l.w, measureOf(l));
        const needed = lines * size * (l.lineHeight ?? 1.2);
        if (needed > l.h + 1) {
          add({
            severity: "block",
            code: "text-overflows",
            slide: n,
            layerId: l.id,
            message: `"${l.name}" needs ${lines} lines and does not fit its box. Give it another slide rather than shrinking it.`,
          });
        }

        if (PLACEHOLDERS.includes((l.text ?? "").trim().toLowerCase())) {
          add({
            severity: "warn",
            code: "placeholder-text",
            slide: n,
            layerId: l.id,
            message: `"${l.name}" still says "${l.text}".`,
          });
        }
      }

      if (l.stroke !== null && l.strokeWidth > 0 && l.strokeWidth < platform.minStrokePx) {
        add({
          severity: "warn",
          code: "stroke-too-thin",
          slide: n,
          layerId: l.id,
          message: `"${l.name}" has a ${l.strokeWidth}px stroke. Under ${platform.minStrokePx}px tends to disappear.`,
        });
      }

      // A crop that only the profile grid performs can only affect the slide the
      // grid shows. Reporting it on slide 7 described something that cannot
      // happen, and drowned the one slide where it can.
      const inScope = platform.safeScope === "all" || i === 0;

      if (inScope && intrudes(l, box, doc.width, doc.height)) {
        add({
          severity: "warn",
          code: "outside-safe-zone",
          slide: n,
          layerId: l.id,
          message: safeZoneMessage(l.name, platform),
        });
      }
    }

    // The hook is the only slide anyone is guaranteed to see, so it gets held to
    // a higher bar than the rest.
    if (n === 1 && texts.length > 0) {
      const biggest = texts.reduce((a, b) => ((a.fontSize ?? 0) >= (b.fontSize ?? 0) ? a : b));
      const size = biggest.fontSize ?? 0;
      if (size >= platform.minBodyPt && size < platform.minHeadingPt) {
        add({
          severity: "warn",
          code: "weak-hook",
          slide: 1,
          layerId: biggest.id,
          message: `The biggest text on slide 1 is ${Math.round(size)}pt. A hook usually wants ${platform.minHeadingPt}pt or more to stop a scroll.`,
        });
      }
    }
  });

  return out;
}

export const blockers = (findings: Finding[]): Finding[] =>
  findings.filter((f) => f.severity === "block");

export const canExport = (findings: Finding[]): boolean => blockers(findings).length === 0;

/** Bytes are only knowable once something is rendered, so this runs after. */
export function sizeFinding(bytes: number, platform: Platform): Finding | null {
  if (bytes > platform.maxBytes) {
    return {
      severity: "warn",
      code: "file-too-big",
      slide: null,
      message: `${(bytes / 1_000_000).toFixed(1)}MB. Over ${(platform.maxBytes / 1_000_000).toFixed(1)}MB, ${platform.label} compresses harder and quality drops.`,
    };
  }
  if (bytes < platform.minBytes) {
    return {
      severity: "warn",
      code: "file-too-small",
      slide: null,
      message: `${Math.round(bytes / 1000)}KB is light for ${platform.label} — it may already have been over-compressed.`,
    };
  }
  return null;
}
