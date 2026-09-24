import { describe, expect, it } from "vitest";

import { altFile, isCaptionPlatform } from "./caption.js";

describe("which platforms the caption prompt knows", () => {
  it("knows the three that take a carousel", () => {
    expect(isCaptionPlatform("linkedin")).toBe(true);
    expect(isCaptionPlatform("instagram")).toBe(true);
    expect(isCaptionPlatform("tiktok")).toBe(true);
  });

  /**
   * `x` has a 280 character ceiling and no carousel, so a caption written for
   * it would be written against rules that do not apply. The button is hidden
   * rather than the request being made and refused.
   */
  it("does not know x, which has no carousel", () => {
    expect(isCaptionPlatform("x")).toBe(false);
    expect(isCaptionPlatform("")).toBe(false);
  });
});

describe("alt text as a file somebody can use", () => {
  it("numbers every line to match the image files", () => {
    expect(altFile(["First", "Second"])).toBe("01. First\n02. Second");
  });

  /** Zero-padded so 10 sorts after 9 rather than after 1, as the images do. */
  it("pads past nine", () => {
    const many = Array.from({ length: 10 }, (_, i) => `Slide ${i + 1}`);
    expect(altFile(many).split("\n")[9]).toBe("10. Slide 10");
  });

  /**
   * A blank line would look like the export dropped a slide. Saying so out loud
   * is what makes it obvious which one still needs writing.
   */
  it("says when a slide has no description rather than leaving a gap", () => {
    expect(altFile(["First", ""])).toBe("01. First\n02. (no description)");
  });

  it("survives an empty deck", () => {
    expect(altFile([])).toBe("");
  });
});
