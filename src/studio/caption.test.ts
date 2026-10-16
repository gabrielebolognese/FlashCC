import { describe, expect, it } from "vitest";

import { altFile, isCaptionPlatform } from "./caption.js";

describe("which platforms the caption prompt knows", () => {
  it("knows the three that take a carousel", () => {
    expect(isCaptionPlatform("linkedin")).toBe(true);
    expect(isCaptionPlatform("instagram")).toBe(true);
    expect(isCaptionPlatform("tiktok")).toBe(true);
  });

  /**
   * X and Bluesky have no carousel, so until Batch 17 a caption written for
   * them would have been written against rules that did not apply. Now a deck
   * goes out there as a thread, and the prompt has rules for opening one.
   * Pinterest still has none, so its button stays hidden.
   */
  it("knows the two thread destinations, and nothing it has no rules for", () => {
    expect(isCaptionPlatform("x")).toBe(true);
    expect(isCaptionPlatform("bluesky")).toBe(true);
    expect(isCaptionPlatform("pinterest")).toBe(false);
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
