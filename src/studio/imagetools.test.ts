import { describe, expect, it } from "vitest";

import { blobPath, duotoneOf, filterCss, focalFromClick, focalPosition, maskClip, scrimFor, withScrim } from "./imagetools.js";
import { makeLayer, type Layer } from "./model.js";

const board = { w: 1080, h: 1350 };
const text = (y: number, fill = "#ffffff"): Layer => ({
  ...makeLayer("text", { x: 96, y, w: 888, h: 200 }, fill),
  text: "Words",
});

describe("focal point", () => {
  it("is the centre when unset and percentages when set", () => {
    expect(focalPosition(undefined)).toBe("50% 50%");
    expect(focalPosition({ x: 0.25, y: 0.8 })).toBe("25% 80%");
    expect(focalPosition({ x: -1, y: 2 })).toBe("0% 100%");
  });

  it("comes from a click on the preview, clamped to it", () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    expect(focalFromClick({ x: 150, y: 75 }, rect)).toEqual({ x: 0.25, y: 0.25 });
    expect(focalFromClick({ x: 999, y: 0 }, rect)).toEqual({ x: 1, y: 0 });
    expect(focalFromClick({ x: 1, y: 1 }, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("masks", () => {
  it("are CSS clip paths sized to the box", () => {
    expect(maskClip("circle", 400, 300, "a")).toBe("circle(closest-side at 50% 50%)");
    expect(maskClip("rounded", 400, 300, "a")).toBe("inset(0 round 36px)");
    expect(maskClip("arch", 400, 600, "a")).toBe("inset(0 round 200px 200px 0 0)");
    expect(maskClip("slant", 400, 300, "a")).toMatch(/^polygon\(/);
    expect(maskClip("blob", 400, 300, "a")).toMatch(/^path\('M[\d. QZ-]+'\)$/);
  });

  it("keeps a blob the same for the same layer and inside its box", () => {
    expect(maskClip("blob", 400, 300, "layer1")).toBe(maskClip("blob", 400, 300, "layer1"));
    expect(maskClip("blob", 400, 300, "layer1")).not.toBe(maskClip("blob", 400, 300, "layer2"));
    const nums = blobPath(400, 300, 7).match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(400);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(300);
  });
});

describe("filters", () => {
  it("are CSS, and absent when unset", () => {
    expect(filterCss(undefined)).toBeUndefined();
    expect(filterCss({ kind: "mono" })).toContain("grayscale(1)");
    expect(filterCss({ kind: "blur" })).toContain("blur(");
    expect(filterCss({ kind: "contrast" })).toContain("contrast(");
  });

  it("takes duotone from the brand: the darker ground for shadows, the accent for light", () => {
    expect(duotoneOf({ bg: "#12161c", fg: "#f4f6f8", accent: "#d9a521" })).toEqual({ kind: "duotone", dark: "#12161c", light: "#d9a521" });
    expect(duotoneOf({ bg: "#f7f4ed", fg: "#1a1a18", accent: "#c2410c" })).toEqual({ kind: "duotone", dark: "#1a1a18", light: "#c2410c" });
  });
});

describe("text scrim", () => {
  it("is full width, dark under light text, and darkest at the edge the text sits nearest", () => {
    const low = scrimFor(text(1000), board);
    expect(low).toMatchObject({ kind: "rect", x: 0, w: 1080, name: "Text scrim" });
    expect(low.y).toBeLessThan(1000);
    expect(low.y + low.h).toBeLessThanOrEqual(1350);
    expect(low.gradient?.angle).toBe(180);
    expect(low.gradient?.stops[0]?.colour).toBe("#00000000");
    expect(scrimFor(text(100), board).gradient?.angle).toBe(0);
  });

  it("is light under dark text", () => {
    expect(scrimFor(text(1000, "#111111"), board).gradient?.stops[2]?.colour.startsWith("#ffffff")).toBe(true);
  });

  it("goes directly under its text layer, and only for text", () => {
    const pic = makeLayer("image", { x: 0, y: 0, w: 1080, h: 1350 }, "#000");
    const t = text(1000);
    const out = withScrim([pic, t], t.id, board)!;
    expect(out.map((l) => l.kind)).toEqual(["image", "rect", "text"]);
    expect(withScrim([pic, t], pic.id, board)).toBeNull();
  });
});
