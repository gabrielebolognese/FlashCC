import { describe, expect, it } from "vitest";

import { contrast } from "./colour.js";
import { makeLayer, type Layer } from "./model.js";
import { blockStyle, contrastingWith, effectOf, lineStyle, markColourFor, markStyle, MIN_OUTLINE, withEffect } from "./texteffects.js";

const text = (patch: Partial<Layer> = {}): Layer => ({ ...makeLayer("text", { x: 0, y: 0, w: 800, h: 200 }, "#ffffff"), text: "Hi", fontSize: 64, ...patch });

describe("markColourFor", () => {
  it("takes the accent when it reads on the ground and differs from the words", () => {
    expect(markColourFor({ accent: "#d9a521", fg: "#f4f6f8" }, "#12161c", "#f4f6f8")).toBe("#d9a521");
  });
  it("skips an accent that is the same white as the text (the plain Dark style)", () => {
    const c = markColourFor({ accent: "#ffffff", fg: "#f2f4f7", muted: "#8b93a1" }, "#101215", "#ffffff");
    expect(c).toBe("#8b93a1");
    expect(contrast(c, "#ffffff")).toBeGreaterThanOrEqual(1.4);
  });
  it("skips an accent that disappears into the ground", () => {
    expect(markColourFor({ accent: "#d9a521", fg: "#12161c" }, "#d9a521", "#12161c")).not.toBe("#d9a521");
  });
});

describe("effects", () => {
  it("give a label box a colour the words read on, never the words' own", () => {
    const style = lineStyle(text({ textEffect: "label", markColour: "#ffffff" }), false)!;
    expect(contrast(String(style.background), "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(contrastingWith("#ffffff", "#d9a521")).not.toBe("#d9a521"); // 2.1:1 against white
    expect(contrastingWith("#111111", "#d9a521")).toBe("#d9a521");
  });
  it("pad a label by what text.ts subtracts from its width", () => {
    const style = lineStyle(text({ textEffect: "label", fontSize: 100 }), false)!;
    expect(String(style.padding)).toContain("28px");
  });
  it("never draw an outline thinner than the 2px floor", () => {
    expect(String(blockStyle(text({ textEffect: "outline", fontSize: 20 })).WebkitTextStroke)).toMatch(/^2px /);
    expect(MIN_OUTLINE).toBe(2);
  });
  it("put the highlighter on the marked words when there are some, on the whole line when not", () => {
    expect(lineStyle(text({ textEffect: "highlight" }), true)).toBeNull();
    expect(lineStyle(text({ textEffect: "highlight" }), false)?.backgroundImage).toContain("svg");
    expect(markStyle("highlight", text(), 700).backgroundImage).toContain("svg");
  });
});

describe("one effect per text layer", () => {
  it("clears gradient text when another effect is chosen, and the effect when gradient is", () => {
    const g = { kind: "linear" as const, angle: 90, cx: 0.5, cy: 0.5, stops: [{ colour: "#000000", at: 0 }, { colour: "#ffffff", at: 1 }] };
    const withGradient = text({ gradient: g });
    expect(effectOf(withGradient)).toBe("gradient");
    expect(withEffect(withGradient, "outline")).toMatchObject({ textEffect: "outline", gradient: undefined });
    expect(withEffect(text({ textEffect: "shadow" }), "gradient", g)).toMatchObject({ textEffect: undefined, gradient: g });
  });
  it("turns highlighter marks into accent marks under any other effect", () => {
    expect(withEffect(text({ text: "a ==b== c" }), "label").text).toBe("a *b* c");
    expect(withEffect(text({ text: "a ==b== c" }), "highlight").text).toBe("a ==b== c");
  });
});
