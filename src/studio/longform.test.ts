import { describe, expect, it } from "vitest";

import {
  preview,
  readLongForm,
  segments,
  sentences,
  shapeOf,
  slideEstimate,
  THIN_CHARS,
  toBlock,
  toSlides,
  type Candidate,
} from "./longform.js";

const ARTICLE = `# Why your edits feel flat

Every cut lands on the beat and it still feels wrong. Here is the reason.

## Cut on movement

Attention resets every time the frame changes. Cutting to the rhythm of the
audio is cutting to the wrong thing entirely.

The fix is to cut on movement instead. A hand leaving frame, a head turning, a
door closing, those are where the eye is already going.

## Punch in on the second sentence

A talking head is one shape for as long as you leave it. Punch in fifteen
percent on the second sentence of every answer and the shape changes.`;

const TRANSCRIPT = `00:00 Alex: So the thing nobody tells you about editing is that beats are a trap.
00:08 Alex: You cut to the music and it feels mechanical.
[00:15] Sam: Right, and then you blame the footage.
00:22 Alex: Exactly. The fix is to cut on movement.`;

const PROSE = `Beats are a trap. You cut to the music and it feels mechanical, and then you blame the footage.

The fix is to cut on movement. A hand leaving frame, a head turning, a door closing.

Attention resets every time the frame changes, which is the whole mechanism.`;

const candidate = (patch: Partial<Candidate> = {}): Candidate => ({
  id: "c0",
  title: "Cut on movement",
  paragraphs: ["First paragraph here.", "Second paragraph here."],
  chars: 44,
  reason: "Section",
  thin: false,
  ...patch,
});

describe("sentences", () => {
  it("splits on real terminators", () => {
    expect(sentences("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
  });

  /**
   * The single most-cited failure of every competing tool: "The Quotes, Hooks &
   * Timestamps pick up in the middle of a sentence so it does not make any
   * sense." Every cut in this module goes through here.
   */
  it("does not break on an abbreviation", () => {
    expect(sentences("Ask Dr. Smith about it. Then leave.")).toEqual([
      "Ask Dr. Smith about it.",
      "Then leave.",
    ]);
  });

  it("does not break on e.g. or i.e.", () => {
    expect(sentences("Use a cue, e.g. a hand leaving frame. Then cut.")).toHaveLength(2);
  });

  it("does not break on a numbered list marker", () => {
    expect(sentences("3. Cut on movement instead.")).toHaveLength(1);
  });

  it("does not break on an initial", () => {
    expect(sentences("It was J. R. Hartley who said it. He was right.")).toHaveLength(2);
  });

  it("keeps a trailing quote with its sentence", () => {
    expect(sentences('He said "stop." Then he left.')[0]).toBe('He said "stop."');
  });

  it("returns one entry for text with no terminator", () => {
    expect(sentences("Cut on movement")).toEqual(["Cut on movement"]);
  });

  it("is empty for empty input", () => {
    expect(sentences("   ")).toEqual([]);
  });

  it("loses nothing", () => {
    const joined = sentences(PROSE.replace(/\n+/g, " ")).join(" ");
    expect(joined).toContain("Beats are a trap");
    expect(joined).toContain("whole mechanism");
  });
});

describe("recognising what was pasted", () => {
  it("knows markdown by its headings", () => {
    expect(shapeOf(ARTICLE)).toBe("markdown");
  });

  it("knows a transcript by its timestamps and speakers", () => {
    expect(shapeOf(TRANSCRIPT)).toBe("transcript");
  });

  it("calls everything else prose", () => {
    expect(shapeOf(PROSE)).toBe("prose");
  });
});

describe("segmenting", () => {
  it("separates headings from paragraphs", () => {
    const segs = segments(ARTICLE);
    expect(segs.filter((s) => s.kind === "heading").map((s) => s.text)).toEqual([
      "Why your edits feel flat",
      "Cut on movement",
      "Punch in on the second sentence",
    ]);
  });

  it("joins wrapped lines back into one paragraph", () => {
    const para = segments(ARTICLE).find((s) => s.kind === "para" && s.text.includes("Attention resets"));
    expect(para?.text).not.toContain("\n");
  });

  it("reads a setext underline as a heading", () => {
    const segs = segments("Cut on movement\n===\n\nSome body copy here.");
    expect(segs[0]).toEqual({ kind: "heading", text: "Cut on movement" });
  });

  /** Timestamps and speaker labels are navigation, not slide copy. */
  it("strips timestamps and speaker labels from a transcript", () => {
    const text = segments(TRANSCRIPT).map((s) => s.text).join(" ");
    expect(text).not.toMatch(/\d{2}:\d{2}/);
    expect(text).not.toContain("Alex:");
    expect(text).toContain("cut on movement");
  });
});

describe("candidates", () => {
  it("offers one per heading", () => {
    const { candidates } = readLongForm(ARTICLE);
    expect(candidates.map((c) => c.title)).toEqual([
      "Why your edits feel flat",
      "Cut on movement",
      "Punch in on the second sentence",
    ]);
  });

  /** Never a score. The complaint this answers is about exactly that. */
  it("says why it was offered without judging it", () => {
    for (const c of readLongForm(ARTICLE).candidates) {
      expect(c.reason).toBeTruthy();
      expect(c).not.toHaveProperty("score");
    }
  });

  it("windows unstructured prose at paragraph boundaries and says so", () => {
    const { candidates, warnings } = readLongForm(PROSE);
    expect(candidates.length).toBeGreaterThan(0);
    expect(warnings.join(" ")).toContain("No headings found");
  });

  it("flags a thin section rather than hiding it", () => {
    const { candidates } = readLongForm("## Tiny\n\nToo short.");
    expect(candidates[0]?.thin).toBe(true);
    expect(candidates[0]?.chars).toBeLessThan(THIN_CHARS);
  });

  it("keeps material that came before the first heading", () => {
    const { candidates } = readLongForm("An opening thought.\n\n## Then a section\n\nBody.");
    expect(candidates[0]?.reason).toContain("Before the first heading");
  });

  it("says plainly when there is nothing to read", () => {
    expect(readLongForm("   ").warnings.join(" ")).toContain("nothing to read");
  });

  it("previews without running on", () => {
    expect(preview(candidate({ paragraphs: ["word ".repeat(200)] }), 60).length).toBeLessThanOrEqual(61);
  });
});

describe("turning a candidate into slides", () => {
  it("opens with the section title", () => {
    expect(toSlides(candidate())[0]).toBe("Cut on movement");
  });

  it("closes with the CTA when one is given", () => {
    const out = toSlides(candidate(), { cta: "Save this for your next edit." });
    expect(out[out.length - 1]).toBe("Save this for your next edit.");
  });

  it("never exceeds the ceiling any publishing API accepts", () => {
    const many = candidate({ paragraphs: Array.from({ length: 30 }, (_, i) => `Paragraph ${i}.`) });
    expect(toSlides(many, { cta: "Follow." }).length).toBeLessThanOrEqual(10);
  });

  /** Dropped material is gone without anyone being told; folded material is not. */
  it("folds the tail into the last slide rather than dropping it", () => {
    const many = candidate({ paragraphs: Array.from({ length: 30 }, (_, i) => `Para${i}.`) });
    expect(toSlides(many).join(" ")).toContain("Para29.");
  });

  it("divides a long paragraph at sentence ends and nowhere else", () => {
    const long = candidate({
      paragraphs: [Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is here.`).join(" ")],
    });
    for (const slide of toSlides(long).slice(1)) {
      expect(slide).toMatch(/[.!?]$/);
      expect(slide).not.toMatch(/\bSentence number \d+ is$/);
    }
  });

  it("leaves a short paragraph whole", () => {
    expect(toSlides(candidate({ paragraphs: ["One short line."] }))).toContain("One short line.");
  });

  it("drops empty entries rather than shipping a blank slide", () => {
    expect(toSlides(candidate({ paragraphs: ["Real.", "   "] }))).not.toContain("   ");
  });

  it("can be told to skip the title", () => {
    expect(toSlides(candidate(), { titleAsHook: false })[0]).toBe("First paragraph here.");
  });

  it("estimates what it will produce", () => {
    const c = candidate();
    expect(slideEstimate(c)).toBe(toSlides(c).length);
  });

  it("makes a block bulk-create already understands", () => {
    const block = toBlock(candidate());
    expect(block.texts.length).toBeGreaterThan(0);
    expect(block.title).toBeTruthy();
  });
});

describe("end to end", () => {
  it("turns an article into one carousel per section, all with copy", () => {
    const { candidates } = readLongForm(ARTICLE);
    const blocks = candidates.map((c) => toBlock(c, { cta: "Follow for more." }));

    expect(blocks).toHaveLength(3);
    for (const block of blocks) {
      expect(block.texts.length).toBeGreaterThanOrEqual(2);
      expect(block.texts.every((t) => t.trim() !== "")).toBe(true);
    }
  });

  it("turns a transcript into slides with no timestamps left in them", () => {
    const { candidates } = readLongForm(TRANSCRIPT);
    const texts = candidates.flatMap((c) => toSlides(c));
    expect(texts.join(" ")).not.toMatch(/\d{2}:\d{2}/);
  });
});
