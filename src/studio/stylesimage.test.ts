import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { customFrom, styleById, withStyleImage, type Style } from "./styles.js";

const BASE = styleById("ink");
const withPicture = (over: Partial<NonNullable<Style["image"]>> = {}): Style => ({
  ...BASE,
  image: { src: "https://example.com/bg.jpg", fit: "cover", scrim: 0.35, ...over },
});

const deck = (style: Style, n = 4) =>
  withStyleImage(
    buildSlides(Array.from({ length: n }, (_, i) => `Slide ${i + 1} text.`), style.theme),
    style,
  );

describe("a style with a background picture", () => {
  it("puts it on every slide it builds", () => {
    const slides = deck(withPicture());
    expect(slides).toHaveLength(4);
    for (const s of slides) expect(s.image?.src).toBe("https://example.com/bg.jpg");
  });

  it("carries the fit and the dim through to each slide", () => {
    const slides = deck(withPicture({ fit: "contain", scrim: 0.6 }));
    for (const s of slides) {
      expect(s.image?.fit).toBe("contain");
      expect(s.image?.scrim).toBe(0.6);
    }
  });

  /**
   * Once stamped it is an ordinary slide background, so changing one slide in
   * the editor afterwards must not reach into the others.
   */
  it("gives each slide its own copy rather than one shared object", () => {
    const slides = deck(withPicture());
    expect(slides[0]?.image).not.toBe(slides[1]?.image);
  });

  it("leaves a style with no picture completely alone", () => {
    const slides = deck(BASE);
    for (const s of slides) expect(s.image).toBeUndefined();
  });

  /** An empty src is not a picture, and would paint a broken image. */
  it("ignores a picture with no source", () => {
    const slides = deck({ ...BASE, image: { src: "" } });
    for (const s of slides) expect(s.image).toBeUndefined();
  });

  it("does not touch the slides it was given", () => {
    const built = buildSlides(["One.", "Two."], BASE.theme);
    withStyleImage(built, withPicture());
    expect(built.every((s) => s.image === undefined)).toBe(true);
  });

  /** None of the stock styles can have one: there is no picture to point at. */
  it("is absent from every stock style", () => {
    expect(BASE.image).toBeUndefined();
  });

  it("survives being turned into a custom style", () => {
    const custom = customFrom(withPicture());
    expect(custom.image?.src).toBe("https://example.com/bg.jpg");
    expect(custom.image).not.toBe(withPicture().image);
  });

  it("does not invent one when the base had none", () => {
    expect(customFrom(BASE).image).toBeUndefined();
  });
});
