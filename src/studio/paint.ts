import type { CSSProperties } from "react";

import { gradientCss } from "./gradient.js";
import type { Layer, Slide } from "./model.js";

/**
 * How a slide or a layer paints. One place, so the canvas, the thumbnails, the
 * previews and the print path cannot disagree about what a gradient looks like.
 */
export const slidePaint = (slide: Slide | undefined): CSSProperties =>
  slide?.gradient
    ? { background: slide.background, backgroundImage: gradientCss(slide.gradient) }
    : { background: slide?.background };

export const layerPaint = (layer: Layer): CSSProperties =>
  layer.gradient
    ? { background: layer.fill, backgroundImage: gradientCss(layer.gradient) }
    : { background: layer.fill === "none" ? "transparent" : layer.fill };
