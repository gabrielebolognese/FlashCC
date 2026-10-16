import { describe, expect, it } from "vitest";

import { fillsFor } from "./ai.js";
import { buildSlides } from "./compositions.js";
import { HONEST_BLANK } from "./honesty.js";
import { makeDoc } from "./model.js";
import { platformById } from "./platforms.js";
import { preflight } from "./preflight.js";
import { styleById } from "./styles.js";
import { slotsFor, STRUCTURES } from "./structures.js";

describe("block slots set by the framework (25.1)", () => {
  it("a Myth versus fact pair slot carries the framework's column headings, not the model's", () => {
    const myth = STRUCTURES.find((s) => s.id === "myth")!;
    const slots = slotsFor(myth, 6, "side-by-side");
    const fills = fillsFor([{ role: "myth-fact", text: "x", fields: ["More posts | Finished posts"] }], { ...myth, slots });
    expect(fills["myth-fact"]).toEqual({ id: "compare", fields: { preset: "Myth / Fact", rows: "More posts | Finished posts" } });
  });

  it("a block with no words to ask for (a screen frame) is placed from the framework alone", () => {
    const tools = STRUCTURES.find((s) => s.id === "tool-stack")!;
    const slots = slotsFor(tools, 6, "with-screens");
    expect(fillsFor([], { ...tools, slots }).screen).toEqual({ id: "screen-frame", fields: { style: "browser" } });
  });
});

describe("the honesty rule on a slide (25.1)", () => {
  it("the pre-flight catches the honest blank, so it cannot ship", () => {
    const doc = { ...makeDoc("x"), slides: buildSlides(["A hook that works.", HONEST_BLANK, "Follow for more."], styleById("ink").theme) };
    const found = preflight(doc, platformById("linkedin")!).filter((f) => f.code === "placeholder-text");
    expect(found.length).toBeGreaterThan(0);
  });
});

describe("a blank nobody filled (25.3, 25.4)", () => {
  it("the pre-flight names it", () => {
    const doc = { ...makeDoc("x"), slides: buildSlides(["Stop [doing the common thing].", "A point.", "Follow."], styleById("ink").theme) };
    const found = preflight(doc, platformById("linkedin")!).filter((f) => f.code === "placeholder-text");
    expect(found.map((f) => f.message).join(" ")).toContain("[doing the common thing]");
  });
});
