import { describe, expect, it } from "vitest";

import { SAMPLE_POST } from "./defaults.js";
import { serialize } from "./serialize.js";
import { splitToSlides } from "./split.js";
import { effectiveRole } from "./types.js";

describe("splitToSlides", () => {
  it("makes the first slide a cover and the last a CTA", () => {
    const slides = splitToSlides(SAMPLE_POST, "balanced");
    expect(slides.length).toBeGreaterThan(2);
    expect(slides[0]?.role).toBe("cover");
    expect(slides[slides.length - 1]?.role).toBe("cta");
  });

  it("groups consecutive marker lines into one list slide", () => {
    const slides = splitToSlides(SAMPLE_POST, "balanced");
    const list = slides.find((s) => effectiveRole(s) === "list");
    expect(list).toBeDefined();
    const block = list?.blocks[0];
    expect(block?.type).toBe("list");
    if (block?.type === "list") expect(block.items).toHaveLength(4);
  });

  it("detects a quote block", () => {
    const slides = splitToSlides(SAMPLE_POST, "balanced");
    expect(slides.some((s) => effectiveRole(s) === "quote")).toBe(true);
  });

  it("treats blank lines as slide breaks", () => {
    const slides = splitToSlides("One.\n\nTwo.\n\nThree.", "balanced");
    expect(slides).toHaveLength(3);
  });

  it("produces fewer slides on `few` than on `many`", () => {
    const few = splitToSlides(SAMPLE_POST, "few");
    const many = splitToSlides(SAMPLE_POST, "many");
    expect(few.length).toBeLessThanOrEqual(many.length);
  });

  it("is deterministic", () => {
    const a = serialize(splitToSlides(SAMPLE_POST, "balanced"));
    const b = serialize(splitToSlides(SAMPLE_POST, "balanced"));
    expect(a).toBe(b);
  });
});

describe("serialize", () => {
  it("round-trips: parsing serialized output yields the same slide boundaries", () => {
    const first = splitToSlides(SAMPLE_POST, "balanced");
    const second = splitToSlides(serialize(first), "balanced");
    expect(second).toHaveLength(first.length);
    expect(serialize(second)).toBe(serialize(first));
  });
});
