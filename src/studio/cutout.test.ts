import { describe, expect, it } from "vitest";

import { applyMask, maskFromPrediction, outputSize, preprocess } from "./cutout.js";

describe("preprocess", () => {
  it("scales by the image's own maximum, then applies ImageNet mean and deviation, planar", () => {
    // 2 by 2: one white pixel, three black.
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const out = preprocess(rgba, 2);
    expect(out).toHaveLength(12);
    // Red plane first: white pixel is (1 - 0.485) / 0.229.
    expect(out[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    expect(out[1]).toBeCloseTo((0 - 0.485) / 0.229, 5);
    // Green plane starts at n = 4.
    expect(out[4]).toBeCloseTo((1 - 0.456) / 0.224, 5);
    // Blue plane, a black pixel.
    expect(out[9]).toBeCloseTo((0 - 0.406) / 0.225, 5);
  });

  it("does not divide by zero on a black picture", () => {
    expect(preprocess(new Uint8ClampedArray(16), 2).every(Number.isFinite)).toBe(true);
  });
});

describe("maskFromPrediction", () => {
  it("normalises min to max, drops haze, keeps the edge soft", () => {
    const m = maskFromPrediction([0.1, 0.12, 0.5, 0.9], 0.06, 0.94);
    expect(m[0]).toBe(0);
    expect(m[1]).toBe(0); // 2.5% of the range: haze
    expect(m[2]).toBeGreaterThan(100);
    expect(m[2]).toBeLessThan(155);
    expect(m[3]).toBe(255);
  });

  it("survives a flat prediction", () => {
    expect([...maskFromPrediction([0.3, 0.3])]).toEqual([0, 0]);
  });
});

describe("applyMask", () => {
  it("writes the mask into alpha, keeping colour and existing transparency", () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128]);
    const mask = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    expect([...applyMask(rgba, mask)]).toEqual([10, 20, 30, 255, 40, 50, 60, 0]);
    const half = new Uint8ClampedArray([128, 0, 0, 255, 255, 0, 0, 255]);
    expect(applyMask(rgba, half)[7]).toBe(128);
  });
});

describe("outputSize", () => {
  it("keeps small pictures as they are and caps the long side", () => {
    expect(outputSize(800, 600)).toEqual({ w: 800, h: 600 });
    expect(outputSize(6000, 4000)).toEqual({ w: 2160, h: 1440 });
  });
});
