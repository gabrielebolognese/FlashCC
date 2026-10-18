import { describe, expect, it } from "vitest";

import { validateVideo, type VideoRequest } from "./video.js";

const request = (frames: number, luma: (i: number) => number | null): VideoRequest => ({
  css: "",
  width: 1080,
  height: 1920,
  target: "vertical",
  transition: "cut",
  slides: Array.from({ length: 30 }, (_, i) => ({ html: "<div></div>", frames, moving: 0, luma: luma(i) })),
});

describe("the video route refuses a deck that flashes (30.5)", () => {
  it("refuses more than three flashes a second, and names when", () => {
    expect(() => validateVideo(request(3, (i) => (i % 2 ? 1 : 0)))).toThrow(/flash 5 times in one second/);
  });
  it("accepts the same slides held long enough", () => {
    expect(() => validateVideo(request(15, (i) => (i % 2 ? 1 : 0)))).not.toThrow();
  });
});
