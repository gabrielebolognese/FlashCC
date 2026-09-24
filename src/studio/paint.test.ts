import { describe, expect, it } from "vitest";

import { makeGradient } from "./gradient.js";
import { makeSlide, type Slide } from "./model.js";
import { DEFAULT_SCRIM, slidePaint } from "./paint.js";

const withImage = (over: Partial<NonNullable<Slide["image"]>> = {}): Slide => ({
  ...makeSlide("#101418"),
  image: { src: "https://example.com/a.jpg", ...over },
});

describe("a slide with no picture", () => {
  it("paints a solid colour", () => {
    expect(slidePaint(makeSlide("#ff0000"))).toEqual({ background: "#ff0000" });
  });

  it("paints a gradient over the colour", () => {
    const slide = { ...makeSlide("#ff0000"), gradient: makeGradient(["#000000", "#ffffff"]) };
    const out = slidePaint(slide);
    expect(out.background).toBe("#ff0000");
    expect(out.backgroundImage).toContain("gradient");
  });

  it("survives being handed nothing", () => {
    expect(() => slidePaint(undefined)).not.toThrow();
  });
});

describe("a slide with a background picture", () => {
  it("paints the picture", () => {
    const out = slidePaint(withImage());
    expect(out.backgroundImage).toContain("https://example.com/a.jpg");
  });

  /**
   * The colour stays underneath on purpose: it is what shows through a
   * `contain` fit, so a portrait picture on a square artboard is framed rather
   * than letterboxed against nothing.
   */
  it("keeps the colour underneath", () => {
    expect(slidePaint(withImage()).background).toBe("#101418");
  });

  it("covers by default and contains when asked", () => {
    expect(slidePaint(withImage()).backgroundSize).toContain("cover");
    expect(slidePaint(withImage({ fit: "contain" })).backgroundSize).toContain("contain");
  });

  /** A picture that tiled would be an obvious bug and an easy one to miss. */
  it("never repeats", () => {
    expect(slidePaint(withImage()).backgroundRepeat).toContain("no-repeat");
  });

  it("takes the picture over a gradient when both are set", () => {
    const slide = { ...withImage(), gradient: makeGradient(["#000000", "#ffffff"]) };
    expect(slidePaint(slide).backgroundImage).toContain("a.jpg");
  });
});

describe("the scrim, which decides whether the words can be read", () => {
  it("dims by default rather than shipping unreadable text", () => {
    const out = slidePaint(withImage());
    expect(DEFAULT_SCRIM).toBeGreaterThan(0);
    expect(out.backgroundImage).toContain(`rgba(0,0,0,${DEFAULT_SCRIM})`);
  });

  /**
   * CSS paints the FIRST background-image nearest the viewer. The dimming
   * listed second would put the photograph on top of it, which looks identical
   * at zero and does nothing at every other value.
   */
  it("puts the dimming in front of the picture, not behind it", () => {
    const out = String(slidePaint(withImage({ scrim: 0.5 })).backgroundImage);
    expect(out.indexOf("rgba")).toBeLessThan(out.indexOf("a.jpg"));
  });

  it("drops the dimming layer entirely at zero", () => {
    const out = slidePaint(withImage({ scrim: 0 }));
    expect(out.backgroundImage).not.toContain("rgba");
    expect(out.backgroundSize).toBe("cover");
  });

  it("clamps anything outside 0 to 1", () => {
    expect(String(slidePaint(withImage({ scrim: 4 })).backgroundImage)).toContain("rgba(0,0,0,1)");
    expect(String(slidePaint(withImage({ scrim: -2 })).backgroundImage)).not.toContain("rgba");
  });

  it("falls back to the default rather than emitting NaN", () => {
    const out = String(slidePaint(withImage({ scrim: Number.NaN })).backgroundImage);
    expect(out).not.toContain("NaN");
    expect(out).toContain(`rgba(0,0,0,${DEFAULT_SCRIM})`);
  });
});

/**
 * `exporter.tsx` flattens this object into an HTML `style="..."` attribute. A
 * double quote in the CSS closes the attribute and the slide renders blank,
 * which is the failure mode the LinkedIn PDF path already has history with.
 */
describe("the URL is safe to put in a style attribute", () => {
  it("quotes with single quotes, never double", () => {
    const out = String(slidePaint(withImage()).backgroundImage);
    expect(out).toContain("url('");
    expect(out).not.toContain('url("');
  });

  it("handles a data URL, semicolons and commas included", () => {
    const src = "data:image/png;base64,iVBORw0KGgo=";
    const out = String(slidePaint(withImage({ src })).backgroundImage);
    expect(out).toContain(`url('${src}')`);
  });

  it("escapes a quote in the URL rather than breaking out of it", () => {
    const out = String(slidePaint(withImage({ src: "a'b.jpg" })).backgroundImage);
    expect(out).toContain("a\\'b.jpg");
  });

  /**
   * CSS matches these lists to `background-image` by position, so a count that
   * drifts silently applies `cover` to the scrim and nothing to the photograph.
   * Counted from the known layer count rather than by parsing the value, since
   * `linear-gradient(rgba(...), rgba(...))` has commas of its own.
   */
  it("emits one size, position and repeat per image layer", () => {
    const dimmed = slidePaint(withImage({ scrim: 0.4 }));
    expect(String(dimmed.backgroundSize).split(",")).toHaveLength(2);
    expect(String(dimmed.backgroundPosition).split(",")).toHaveLength(2);
    expect(String(dimmed.backgroundRepeat).split(",")).toHaveLength(2);

    const plain = slidePaint(withImage({ scrim: 0 }));
    expect(String(plain.backgroundSize).split(",")).toHaveLength(1);
    expect(String(plain.backgroundPosition).split(",")).toHaveLength(1);
    expect(String(plain.backgroundRepeat).split(",")).toHaveLength(1);
  });
});
