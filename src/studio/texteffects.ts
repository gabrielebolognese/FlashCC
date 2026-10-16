/**
 * Text effects and emphasis, as CSS (22.3, 22.4).
 *
 * Pure: every function returns a style object, so `LayerView` stays the only
 * painter and the editor, the thumbnails and the export get identical output.
 * Nothing here changes layout except the label box, whose padding is counted
 * by `text.ts` (`textInset`), which is why it is the only one with a number
 * that matters to measurement.
 *
 * **One effect per text layer.** Two effects on one line is the second most
 * visible amateur tell after mixed icon styles, so the model enforces it:
 * `withEffect` clears every other effect, gradient text included, and turns
 * any `==highlight==` marks into accent marks when the effect is something
 * other than the highlighter.
 */
import type { CSSProperties } from "react";

import { bestText, contrast } from "./colour.js";
import { highlightsToAccent, type Mark } from "./marks.js";
import type { Layer, TextEffect } from "./model.js";
import { labelPad } from "./text.js";

export const TEXT_EFFECTS: { id: TextEffect | "gradient"; label: string; hint: string }[] = [
  { id: "highlight", label: "Highlighter", hint: "A rough stroke behind ==marked== words, or the whole line" },
  { id: "scribble", label: "Scribble underline", hint: "A hand-drawn line under marked words, or the whole line" },
  { id: "label", label: "Label box", hint: "Text on a solid box, line by line" },
  { id: "outline", label: "Outline", hint: "Stroked letters, never thinner than 2px" },
  { id: "shadow", label: "Soft shadow", hint: "For text over a photo; a scrim reads better" },
  { id: "gradient", label: "Gradient", hint: "A colour ramp clipped to the letters" },
];

/** The thinnest outline drawn, from the 1.3 stroke floor. */
export const MIN_OUTLINE = 2;

const svgUrl = (svg: string): string => `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;

/** A wobbly band across the lower part of the line: a marker pen, not a rectangle. */
export const highlighterImage = (colour: string): string =>
  svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" preserveAspectRatio="none">` +
      `<path d="M1 17 C20 14 40 16 60 14 S90 13 99 15 L98 36 C75 38 50 35 30 37 S8 38 2 36 Z" fill="${colour}" fill-opacity="0.45"/></svg>`,
  );

/** A loose, slightly uneven line, drawn as if by hand. */
export const scribbleImage = (colour: string): string =>
  svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 10" preserveAspectRatio="none">` +
      `<path d="M1 6 C15 3 25 8 40 5 S65 3 80 6 S95 5 99 4" fill="none" stroke="${colour}" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  );

const markColour = (l: Layer): string => l.markColour ?? l.fill;

const highlighter = (colour: string): CSSProperties => ({
  backgroundImage: highlighterImage(colour),
  backgroundSize: "100% 100%",
  backgroundRepeat: "no-repeat",
  WebkitBoxDecorationBreak: "clone",
  boxDecorationBreak: "clone",
});

const scribble = (colour: string): CSSProperties => ({
  backgroundImage: scribbleImage(colour),
  backgroundSize: "100% 0.2em",
  backgroundPosition: "0 100%",
  backgroundRepeat: "no-repeat",
  WebkitBoxDecorationBreak: "clone",
  boxDecorationBreak: "clone",
});

/** How one marked run is drawn inside its layer. */
export function markStyle(mark: Mark, l: Layer, boldAt: number): CSSProperties {
  const colour = markColour(l);
  const effect: CSSProperties =
    l.textEffect === "scribble" ? scribble(l.effectColour ?? colour) : {};
  switch (mark) {
    case "accent":
      // On gradient text the fill is the clip; an accent run paints its own colour over it.
      return { color: colour, WebkitTextFillColor: colour, ...effect };
    case "bold":
      return { fontWeight: boldAt, ...effect };
    case "highlight":
      return { ...highlighter(colour), ...effect };
  }
}

/**
 * The style of the inline span that wraps the whole text, for the effects
 * that apply to a whole line: the label box, and the highlighter or scribble
 * when the text has no marks of its own to put them on.
 */
export function lineStyle(l: Layer, hasMarkedRuns: boolean): CSSProperties | null {
  const size = l.fontSize ?? 64;
  switch (l.textEffect) {
    case "label": {
      const pad = labelPad(size);
      return {
        // The box has to hold the words: never the text's own colour.
        background: l.effectColour ?? contrastingWith(l.fill, l.markColour),
        padding: `${Math.round(size * 0.06)}px ${pad}px`,
        WebkitBoxDecorationBreak: "clone",
        boxDecorationBreak: "clone",
      };
    }
    case "highlight":
      return hasMarkedRuns ? null : highlighter(l.effectColour ?? markColour(l));
    case "scribble":
      return hasMarkedRuns ? null : scribble(l.effectColour ?? markColour(l));
    default:
      return null;
  }
}

/** Effects that style the whole block of text. */
export function blockStyle(l: Layer): CSSProperties {
  const size = l.fontSize ?? 64;
  switch (l.textEffect) {
    case "outline": {
      const w = Math.max(MIN_OUTLINE, Math.round(size * 0.025));
      return {
        WebkitTextStroke: `${w}px ${l.effectColour ?? l.fill}`,
        color: "transparent",
        WebkitTextFillColor: "transparent",
        paintOrder: "stroke fill",
      };
    }
    case "shadow":
      return {
        textShadow: `0 ${Math.max(1, Math.round(size * 0.04))}px ${Math.round(size * 0.22)}px ${l.effectColour ?? "rgba(0,0,0,0.55)"}`,
      };
    default:
      return {};
  }
}

/**
 * The layer with this one effect and no other. Gradient text is the
 * `gradient` field, so choosing it clears `textEffect`, and choosing anything
 * else clears the gradient. Highlight marks only survive under the highlighter.
 */
export function withEffect(l: Layer, effect: TextEffect | "gradient" | null, gradient?: Layer["gradient"]): Partial<Layer> {
  const text = effect !== "highlight" && l.text ? highlightsToAccent(l.text) : l.text;
  if (effect === "gradient") {
    return { textEffect: undefined, gradient: gradient ?? l.gradient, text };
  }
  return { textEffect: effect ?? undefined, gradient: undefined, text };
}

/** The effect a layer currently shows, gradient included. */
export const effectOf = (l: Layer): TextEffect | "gradient" | null =>
  l.textEffect ?? (l.gradient ? "gradient" : null);

/**
 * The colour emphasis takes on a ground: the style's accent when it reads
 * there AND looks different from the words around it, else its foreground,
 * else its muted colour, else the text's own fill. "Reads" is 3:1, the
 * large-text threshold, because a marked word is never smaller than its line;
 * "different" is 1.4:1 against the fill, because a plain style whose accent
 * is the same white as its text would otherwise mark words invisibly.
 */
export function markColourFor(
  theme: { accent: string; fg: string; muted?: string | undefined },
  ground: string,
  fill: string,
): string {
  for (const c of [theme.accent, theme.fg, theme.muted]) {
    if (c && contrast(c, ground) >= 3 && contrast(c, fill) >= 1.4) return c;
  }
  return fill;
}

/** A colour that sits clearly against the text: the mark colour when it does, else the text's opposite pole. */
export const contrastingWith = (fill: string, preferred: string | undefined): string =>
  preferred && contrast(preferred, fill) >= 3 ? preferred : bestText(fill);
