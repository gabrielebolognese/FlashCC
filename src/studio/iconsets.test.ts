import { describe, expect, it } from "vitest";

import outline from "../render/iconsets/tabler-outline.json" with { type: "json" };
import filled from "../render/iconsets/tabler-filled.json" with { type: "json" };
import words from "../render/iconsets/tabler-words.json" with { type: "json" };
import { deckIconStyle, ICON_SET, iconLayer, searchIcons, type IconIndex } from "./iconsets.js";
import { makeDoc } from "./model.js";

const out: IconIndex = { icons: outline as Record<string, string>, words: words as Record<string, string> };
const fill: IconIndex = { icons: filled as Record<string, string>, words: words as Record<string, string> };

describe("the bundled sets", () => {
  it("ships thousands of outline icons and a filled set, each one path", () => {
    expect(Object.keys(out.icons).length).toBeGreaterThan(4000);
    expect(Object.keys(fill.icons).length).toBeGreaterThan(900);
    for (const d of Object.values(out.icons).slice(0, 200)) expect(d).toMatch(/^M/);
  });
});

describe("searchIcons", () => {
  it("puts the exact name first, then names that start with it", () => {
    const r = searchIcons("check", out);
    expect(r[0]).toBe("check");
    expect(r.slice(1, 4).every((n) => n.startsWith("check"))).toBe(true);
  });

  it("finds by tag when the name does not say it", () => {
    const r = searchIcons("tick", out, 500);
    expect(r.length).toBeGreaterThan(0);
  });

  it("needs every word, and joins words into a name", () => {
    const r = searchIcons("arrow right", out);
    expect(r[0]).toBe("arrow-right");
    for (const n of r) expect(`${n} ${out.words[n] ?? ""}`).toMatch(/arrow/);
  });

  it("is deterministic and capped", () => {
    expect(searchIcons("user", out, 20)).toEqual(searchIcons("user", out, 20));
    expect(searchIcons("", out, 20)).toHaveLength(20);
  });
});

describe("iconLayer", () => {
  const d = out.icons["check"]!;

  it("draws an outline as a 2-unit stroke on the 24 grid, scaled with the icon", () => {
    const l = iconLayer("check", d, "outline", { x: 10, y: 20, size: 160 }, "#ff0000");
    expect(l).toMatchObject({ kind: "path", x: 10, y: 20, w: 160, h: 160, pathW: 24, pathH: 24, scaleStroke: true });
    expect(l.stroke).toBe("#ff0000");
    expect(l.strokeWidth).toBe(2);
    expect(l.fill).toBe("none");
    expect(l.icon).toEqual({ set: ICON_SET.outline, name: "check" });
  });

  it("draws a filled icon as a fill with no stroke", () => {
    const l = iconLayer("heart", fill.icons["heart"]!, "filled", { x: 0, y: 0, size: 96 }, "#00ff00");
    expect(l.fill).toBe("#00ff00");
    expect(l.stroke).toBeNull();
    expect(l.icon?.set).toBe(ICON_SET.filled);
  });
});

describe("deckIconStyle", () => {
  it("is null with no icons and follows the first icon placed", () => {
    const doc = makeDoc();
    expect(deckIconStyle(doc)).toBeNull();
    const l = iconLayer("heart", fill.icons["heart"]!, "filled", { x: 0, y: 0, size: 96 }, "#000");
    const withIcon = { ...doc, slides: doc.slides.map((s, i) => (i === 0 ? { ...s, layers: [...s.layers, l] } : s)) };
    expect(deckIconStyle(withIcon)).toBe("filled");
  });
});
