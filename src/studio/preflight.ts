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
 * it has to name the slide, "something is too small" is not actionable at slide
 * seventeen.
 *
 * Pure and DOM-free on purpose: this is the kind of logic that is easy to get
 * subtly wrong and impossible to eyeball, which is exactly what the tests are for.
 *
 * One check deliberately lives elsewhere: file size. It cannot be known until
 * something is actually rendered, so the export path reports it after the fact.
 */

import { brokenSpans, isSpanning } from "./spans.js";
import { HONEST_BLANK } from "./honesty.js";
import { missingFurniture, pieceLabel } from "./furniture.js";
import type { Doc, Layer } from "./model.js";
import { safeBox, shapeOf, type Platform } from "./platforms.js";
import { stripMarks } from "./marks.js";
import { layerLines, overflowsBox } from "./text.js";
import {
  colourOnly,
  coverAtTile,
  denseSlides,
  feedScale,
  flatContrast,
  GRID_PLATFORMS,
  smallOnPhone,
  TILE_MIN_PX,
  VISIONS,
} from "./legibility.js";

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
const PLACEHOLDERS = [
  // The honesty rule (25.1): a result the brief did not give, left for the
  // person to fill rather than invented. It must never ship as it is.
  HONEST_BLANK.toLowerCase(),
  "type something",
  "your hook goes here",
  "the point",
  "say the thing.",
  // An empty testimonial block (19.5). It is never filled by a model, so an
  // empty one is caught here rather than shipping blank.
  "their words go here",
  // An author chip stamped before anybody added their name to the brand.
  "your name",
];


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

  if (platform.minSlides !== undefined && count < platform.minSlides) {
    add({
      severity: "block",
      code: "too-few-slides",
      slide: null,
      message: `${count} slide. A ${platform.label} carousel needs at least ${platform.minSlides}.`,
    });
  }

  // Any shape the platform takes is silent. 4:5 did not become wrong the day
  // Instagram started taking 3:4, and saying so would push every existing deck
  // through a reflow nobody asked for.
  const shape = shapeOf(platform, doc.width, doc.height);
  if (!shape) {
    add({
      severity: "warn",
      code: "wrong-size",
      slide: null,
      message: `Artboard is ${doc.width}×${doc.height}; ${platform.label} wants ${platform.w}×${platform.h}. It will be scaled or cropped.`,
    });
  } else if (shape.api === false) {
    // The other app-versus-API trap, on the shape rather than the count.
    add({
      severity: "warn",
      code: "app-only-shape",
      slide: null,
      message: `${shape.label} posts from the ${platform.label} app, but its publishing API still refuses anything taller than 4:5, so a scheduler may reject it. Post this one by hand.`,
    });
  }

  // Furniture that had no free corner (20.3). It never pushes content, so the
  // honest place to say "slide 4 has no counter" is here.
  for (const m of missingFurniture(doc)) {
    add({
      severity: "warn",
      code: "furniture-skipped",
      slide: m.slide,
      message: `No free corner for the ${pieceLabel(m.kind).toLowerCase()} on this slide, so it was left off rather than covering your content.`,
    });
  }

  // A design across slides whose seam a reorder, an insert or a lone move
  // broke (23.5). A warning, with Unspan offered in the editor; never fixed
  // silently.
  for (const b of brokenSpans(doc)) {
    add({
      severity: "warn",
      code: "span-broken",
      slide: (b.slides[0] ?? 0) + 1,
      message:
        b.reason === "apart"
          ? `A design across slides ${b.slides.map((x) => x + 1).join(" and ")} is no longer on neighbouring slides, so it will not meet at the edge.`
          : `A design across slides ${b.slides.map((x) => x + 1).join(" and ")} no longer lines up at the edge.`,
    });
  }

  // The cover still has to work alone (23.6). The profile grid and most feed
  // impressions show nothing else, so a headline cut by the edge the reader
  // has not swiped past yet is a hook nobody can read.
  if (isSpanning(doc)) {
    for (const l of doc.slides[0]?.layers ?? []) {
      if (l.kind !== "text" || !l.visible || !stripMarks(l.text ?? "").trim()) continue;
      if (l.spanId || l.x + l.w > doc.width + 0.5 || l.x < -0.5) {
        add({
          severity: "warn",
          code: "cover-cut",
          slide: 1,
          layerId: l.id,
          message: `"${l.name}" runs past the edge of the cover. The grid and the feed show the cover alone, so this line is cut there.`,
        });
      }
    }
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
        if (overflowsBox(l)) {
          const lines = layerLines(l, size, l.w);
          add({
            severity: "block",
            code: "text-overflows",
            slide: n,
            layerId: l.id,
            message: `"${l.name}" needs ${lines} lines and does not fit its box. Give it another slide rather than shrinking it.`,
          });
        }

        const plain = stripMarks(l.text ?? "").trim();
        if (PLACEHOLDERS.includes(plain.toLowerCase())) {
          add({
            severity: "warn",
            code: "placeholder-text",
            slide: n,
            layerId: l.id,
            message: `"${l.name}" still says "${l.text}".`,
          });
        } else {
          // A formula or a call to action with a blank nobody filled (25.3, 25.4).
          const blank = plain.match(/\[[a-z][a-z0-9 ,.'-]{0,40}\]/i);
          if (blank) {
            add({
              severity: "warn",
              code: "placeholder-text",
              slide: n,
              layerId: l.id,
              message: `"${l.name}" still has a blank to fill: ${blank[0]}.`,
            });
          }
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

      // A span piece (23.2) runs past the edge by design; the cover check
      // (cover-cut, above) is the one that asks whether that costs the cover its words.
      if (inScope && !l.spanId && intrudes(l, box, doc.width, doc.height)) {
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

  legibility(doc, platform).forEach(add);

  return out;
}

const fmt = (n: number): string => (Math.round(n * 10) / 10).toString();

/**
 * Can it be seen (Batch 30)? Every one a warning, never a block: somebody can
 * know something the check does not. Contrast over a picture needs rendered
 * pixels and is checked in the Legibility panel; over a flat colour it is
 * arithmetic and is here.
 */
function legibility(doc: Doc, platform: Platform): Finding[] {
  const out: Finding[] = [];
  const scale = feedScale(doc, platform);

  for (const c of flatContrast(doc, scale)) {
    out.push({
      severity: "warn",
      code: "low-contrast",
      slide: c.slide + 1,
      layerId: c.layerId,
      message: `"${c.name}" is ${fmt(c.ratio)}:1 against its background. At the size a phone shows it, it needs ${c.need}:1.`,
    });
  }

  for (const s of smallOnPhone(doc, platform)) {
    out.push({
      severity: "warn",
      code: "small-on-phone",
      slide: s.slide + 1,
      layerId: s.layerId,
      message: `"${s.name}" shows at about ${fmt(s.px)}px on a phone in the ${platform.label} feed. Under 10px is hard to read at a glance.`,
    });
  }

  if (GRID_PLATFORMS.has(platform.id)) {
    const cover = coverAtTile(doc);
    if (cover && cover.px < TILE_MIN_PX) {
      out.push({
        severity: "warn",
        code: "cover-small-in-grid",
        slide: 1,
        layerId: cover.layerId,
        message: `The cover's headline is about ${fmt(cover.px)}px in the ${platform.label} profile grid. Under ${TILE_MIN_PX}px it does not read as a headline there.`,
      });
    }
  }

  for (const c of colourOnly(doc)) {
    const who = VISIONS.find((v) => v.id === c.vision)!;
    out.push({
      severity: "warn",
      code: "colour-only",
      slide: c.slide + 1,
      message: `"${c.a}" and "${c.b}" differ only by colour, and look nearly the same with ${who.label.toLowerCase()}. Label them.`,
    });
  }

  for (const d of denseSlides(doc)) {
    out.push({
      severity: "warn",
      code: "dense",
      slide: d.slide + 1,
      message: `${d.words} words. Over about ${d.ceiling} on a slide this shape, nobody reads it at swipe speed: give it another slide.`,
    });
  }

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
      message: `${Math.round(bytes / 1000)}KB is light for ${platform.label}, it may already have been over-compressed.`,
    };
  }
  return null;
}
