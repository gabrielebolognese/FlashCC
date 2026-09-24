import type { CSSProperties } from "react";

import { gradientCss } from "./gradient.js";
import type { Layer, Slide, SlideImage } from "./model.js";

/**
 * How a slide or a layer paints. One place, so the canvas, the thumbnails, the
 * previews and the print path cannot disagree about what a gradient looks like.
 */

/**
 * A URL safe to drop inside `url('...')`.
 *
 * **Single quotes, not double, and this is load-bearing.** The export path
 * flattens this object into an HTML `style="..."` attribute, so a double quote
 * in the CSS would close the attribute and produce a slide that renders blank.
 * A data URL also contains `;` and `,`, which is why it has to be quoted at all
 * rather than sitting bare in `url()`.
 */
const cssUrl = (src: string): string => `url('${src.replace(/['\\]/g, "\\$&")}')`;

/** 0 to 1, and never NaN, because the value reaches CSS unvalidated otherwise. */
const scrimOf = (image: SlideImage): number => {
  const raw = image.scrim ?? DEFAULT_SCRIM;
  return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : DEFAULT_SCRIM;
};

/**
 * What a background picture starts at.
 *
 * Not zero. Text on an unscrimmed photograph is the fastest way to make a
 * carousel unreadable, and the contrast rules this product enforces everywhere
 * else cannot see into an image. Somebody who wants the picture untouched can
 * drag it to zero and has then made that choice on purpose.
 */
export const DEFAULT_SCRIM = 0.35;

export const slidePaint = (slide: Slide | undefined): CSSProperties => {
  if (!slide) return { background: undefined };

  const image = slide.image;
  if (image?.src) {
    const scrim = scrimOf(image);
    const contain = image.fit === "contain";

    // The scrim is listed FIRST because CSS paints the first background-image
    // nearest the viewer. Second would put the photograph over the dimming,
    // which looks identical at 0 and does nothing at every other value.
    const images = [
      ...(scrim > 0 ? [`linear-gradient(rgba(0,0,0,${scrim}), rgba(0,0,0,${scrim}))`] : []),
      cssUrl(image.src),
    ];

    return {
      // Stays underneath: it is what shows through a `contain` fit, so a
      // portrait picture on a square artboard is framed rather than letterboxed
      // against nothing.
      background: slide.background,
      backgroundImage: images.join(", "),
      backgroundSize: images.map(() => (contain ? "contain" : "cover")).join(", "),
      backgroundPosition: images.map(() => "center").join(", "),
      backgroundRepeat: images.map(() => "no-repeat").join(", "),
    };
  }

  return slide.gradient
    ? { background: slide.background, backgroundImage: gradientCss(slide.gradient) }
    : { background: slide.background };
};

export const layerPaint = (layer: Layer): CSSProperties =>
  layer.gradient
    ? { background: layer.fill, backgroundImage: gradientCss(layer.gradient) }
    : { background: layer.fill === "none" ? "transparent" : layer.fill };
