import { describe, expect, it } from "vitest";

import {
  captionFit,
  captionLimit,
  captionOf,
  clamp,
  deckTexts,
  firstCommentOf,
  slideText,
  transcriptOf,
} from "./transcript.js";
import { makeDoc, makeLayer, makeSlide, type Doc, type Layer, type Slide } from "./model.js";

const text = (t: string, size: number, patch: Partial<Layer> = {}): Layer => ({
  ...makeLayer("text", { x: 0, y: 0, w: 900, h: 200 }, "#ffffff"),
  text: t,
  fontSize: size,
  ...patch,
});

const slide = (layers: Layer[]): Slide => ({ ...makeSlide("#000000", "S"), layers });

const deck = (slides: Slide[]): Doc => ({ ...makeDoc("Five ways to fail"), slides });

const SAMPLE = deck([
  slide([text("Your videos feel boring. Here's why.", 96)]),
  slide([text("The reason", 72), text("Every cut lands on the beat and it still feels flat.", 40)]),
  slide([text("Cut on movement, not on beat.", 64)]),
  slide([text("Save this for your next edit.", 56)]),
]);

describe("reading a slide", () => {
  it("puts the largest type first, which is the reading order", () => {
    expect(slideText(SAMPLE.slides[1]!)).toBe(
      "The reason\nEvery cut lands on the beat and it still feels flat.",
    );
  });

  /** A hidden layer is not on the slide, so it is not in the transcript. */
  it("skips hidden layers", () => {
    const s = slide([text("Shown", 60), text("Hidden", 50, { visible: false })]);
    expect(slideText(s)).toBe("Shown");
  });

  it("skips shapes and empty text", () => {
    const s = slide([
      text("Real", 60),
      text("   ", 50),
      makeLayer("rect", { x: 0, y: 0, w: 10, h: 10 }, "#fff"),
    ]);
    expect(slideText(s)).toBe("Real");
  });

  /**
   * A break inside a headline is where the line wrapped on a 1080px artboard.
   * Carrying it into a caption produces a post that looks broken on a phone.
   */
  it("flattens a soft line break into a space", () => {
    expect(slideText(slide([text("Your videos\nfeel boring", 60)]))).toBe("Your videos feel boring");
  });

  it("keeps a paragraph break", () => {
    expect(slideText(slide([text("One.\n\nTwo.", 60)]))).toBe("One.\n\nTwo.");
  });

  /** Uppercase is styling, and a screen reader spells shouted text out letter by letter. */
  it("undoes a display-case override", () => {
    expect(slideText(slide([text("STOP DOING THIS. IT NEVER WORKS.", 60, { uppercase: true })]))).toBe(
      "Stop doing this. It never works.",
    );
  });

  it("leaves capitals the user actually typed alone", () => {
    expect(slideText(slide([text("NASA did it first", 60)]))).toBe("NASA did it first");
  });

  it("is empty for a slide with no copy", () => {
    expect(slideText(slide([]))).toBe("");
  });

  it("gives one entry per slide, holes included", () => {
    expect(deckTexts(deck([slide([]), slide([text("Words", 60)])]))).toEqual(["", "Words"]);
  });
});

describe("the transcript", () => {
  it("numbers the slides, because the artefact is a sequence", () => {
    const out = transcriptOf(SAMPLE);
    expect(out).toContain("1/ Your videos feel boring.");
    expect(out).toContain("4/ Save this for your next edit.");
  });

  /** `1.` starts an ordered list in every editor on both platforms. */
  it("does not use a full stop after the number", () => {
    expect(transcriptOf(SAMPLE).startsWith("1/")).toBe(true);
  });

  it("can be asked for it unnumbered", () => {
    expect(transcriptOf(SAMPLE, { numbered: false })).not.toContain("1/");
  });

  it("keeps the numbering true to the deck when a slide has no copy", () => {
    const withHole = deck([slide([text("One", 60)]), slide([]), slide([text("Three", 60)])]);
    const out = transcriptOf(withHole);
    expect(out).toContain("3/ Three");
    expect(out).not.toContain("2/");
  });

  it("takes a heading above it", () => {
    expect(transcriptOf(SAMPLE, { heading: "Full text:" }).startsWith("Full text:")).toBe(true);
  });

  it("covers every slide, which is the entire point", () => {
    const out = transcriptOf(SAMPLE);
    for (const word of ["boring", "beat", "movement", "Save"]) expect(out).toContain(word);
  });
});

describe("the caption", () => {
  /** The workflow creators already hand-roll: slides 1 and 2, plus the ask. */
  it("is slides one and two and the closer", () => {
    const out = captionOf(SAMPLE);
    expect(out).toContain("Your videos feel boring.");
    expect(out).toContain("The reason");
    expect(out).toContain("Save this for your next edit.");
    expect(out).not.toContain("Cut on movement");
  });

  it("does not repeat itself on a short deck", () => {
    const two = deck([slide([text("One", 60)]), slide([text("Two", 60)])]);
    expect(captionOf(two)).toBe("One\n\nTwo");
  });

  it("can leave the call to action off", () => {
    expect(captionOf(SAMPLE, { withCta: false })).not.toContain("Save this");
  });

  it("trims to the platform's ceiling rather than letting it be cut off live", () => {
    const long = deck([slide([text("word ".repeat(200), 60)])]);
    const out = captionOf(long, { platform: "x" });
    expect(out.length).toBeLessThanOrEqual(captionLimit("x"));
    expect(out.endsWith("…")).toBe(true);
  });

  it("knows each platform's allowance and has a sane default", () => {
    expect(captionLimit("linkedin")).toBe(3000);
    expect(captionLimit("instagram")).toBe(2200);
    expect(captionLimit("nonsense")).toBe(2200);
  });

  it("reports the fit so a draft can say how much room is left", () => {
    expect(captionFit("abc", "x")).toEqual({ used: 3, limit: 280, over: false });
    expect(captionFit("a".repeat(300), "x").over).toBe(true);
  });
});

describe("clamping", () => {
  it("leaves anything that fits alone", () => {
    expect(clamp("short", 50)).toBe("short");
  });

  /** A caption that stops mid-word reads as a bug. */
  it("cuts on a word boundary", () => {
    expect(clamp("one two three four five", 14)).toBe("one two three…");
  });

  it("cuts hard rather than losing most of the text to one long word", () => {
    expect(clamp("a".repeat(40), 10).length).toBeLessThanOrEqual(10);
  });
});

describe("the first comment", () => {
  it("is the transcript, labelled as what it is", () => {
    const out = firstCommentOf(SAMPLE);
    expect(out).toContain("Full text of the carousel");
    expect(out).toContain("1/ Your videos feel boring.");
  });

  it("respects the platform ceiling too", () => {
    const long = deck(Array.from({ length: 40 }, () => slide([text("word ".repeat(40), 60)])));
    expect(firstCommentOf(long, { platform: "instagram" }).length).toBeLessThanOrEqual(2200);
  });
});
