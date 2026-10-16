import type { CSSProperties } from "react";

import { gradientCss } from "./gradient.js";
import { focalPosition } from "./imagetools.js";
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
  // backgroundColor, never the `background` shorthand: the shorthand beside
  // backgroundImage makes React warn (and misorder) when a slide gains or
  // loses a picture, a gradient or a texture between renders.
  if (!slide) return { backgroundColor: undefined };
  const base = basePaint(slide);
  const texture = slide.texture?.src;
  if (!texture) return base;

  // The texture is the top background layer, over the picture and its scrim
  // or the gradient. Its SVG is transparent wherever it is not drawing, and
  // `cover` with the SVG's own `slice` keeps a pattern undistorted after a
  // canvas resize.
  const under = base.backgroundImage ? String(base.backgroundImage) : "";
  // A picture brings its own per-layer lists; a gradient is one layer with the
  // CSS defaults, which have to be spelled out once the list has two entries.
  const list = (first: string, rest: string | undefined, fill: string) =>
    [first, ...(rest ? [rest] : under ? [fill] : [])].join(", ");
  return {
    ...base,
    backgroundImage: under ? `${cssUrl(texture)}, ${under}` : cssUrl(texture),
    backgroundSize: list("cover", base.backgroundSize as string | undefined, "auto"),
    backgroundPosition: list("center", base.backgroundPosition as string | undefined, "0% 0%"),
    backgroundRepeat: list("no-repeat", base.backgroundRepeat as string | undefined, "repeat"),
  };
};

function basePaint(slide: Slide): CSSProperties {
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
      backgroundColor: slide.background,
      backgroundImage: images.join(", "),
      backgroundSize: images.map(() => (contain ? "contain" : "cover")).join(", "),
      // The focal point for the picture; the scrim is flat, so its position is moot.
      backgroundPosition: images.map(() => focalPosition(image.focal)).join(", "),
      backgroundRepeat: images.map(() => "no-repeat").join(", "),
    };
  }

  return slide.gradient
    ? { backgroundColor: slide.background, backgroundImage: gradientCss(slide.gradient) }
    : { backgroundColor: slide.background };
}

export const layerPaint = (layer: Layer): CSSProperties =>
  layer.gradient
    ? { background: layer.fill, backgroundImage: gradientCss(layer.gradient) }
    : { background: layer.fill === "none" ? "transparent" : layer.fill };
