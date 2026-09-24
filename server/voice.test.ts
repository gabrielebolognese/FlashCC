import { describe, expect, it } from "vitest";

import { assembleVoice, MAX_LEARN_CHARS, VOICE_SYSTEM } from "./prompts.js";
import { groundedTraits } from "./voice.js";

const DECKS = [
  ["Cutting on the beat feels mechanical.", "Cut on movement instead.", "Save this."],
  ["Your edits are too obedient to the music.", "The eye follows motion.", "Try it once."],
  ["Nobody asked what camera I used.", "They asked why the cuts felt good.", "Fix the cuts first."],
];

const CORPUS = DECKS.map((d) => d.join("\n")).join("\n");

describe("traits have to be backed by the decks", () => {
  it("keeps a trait whose evidence is really there", () => {
    const out = groundedTraits(
      [{ trait: "Short sentences", evidence: "Cut on movement instead." }],
      CORPUS,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.trait).toBe("Short sentences");
  });

  /**
   * The failure this exists to stop. A paraphrased line produces a panel that
   * LOOKS auditable and is not, which invites trust it has not earned.
   */
  it("drops a trait whose evidence was tidied", () => {
    const out = groundedTraits(
      [{ trait: "Short sentences", evidence: "Cut on movement, instead of the beat." }],
      CORPUS,
    );
    expect(out).toEqual([]);
  });

  it("drops a trait whose evidence was invented outright", () => {
    const out = groundedTraits(
      [{ trait: "Uses numbers", evidence: "I grew to 40,000 followers in six weeks." }],
      CORPUS,
    );
    expect(out).toEqual([]);
  });

  /**
   * Dropped as a PAIR. A trait shown without its line is exactly the
   * unfalsifiable claim this route exists to avoid.
   */
  it("never keeps a trait with its evidence stripped", () => {
    const out = groundedTraits(
      [
        { trait: "Real one", evidence: "The eye follows motion." },
        { trait: "Unsupported", evidence: "Something nobody wrote." },
      ],
      CORPUS,
    );
    expect(out).toHaveLength(1);
    expect(out.every((o) => o.evidence.length > 0)).toBe(true);
  });

  it("drops one with no trait at all", () => {
    expect(groundedTraits([{ trait: "   ", evidence: "The eye follows motion." }], CORPUS)).toEqual([]);
  });

  it("collapses two claims of the same trait", () => {
    const out = groundedTraits(
      [
        { trait: "Short sentences", evidence: "Cut on movement instead." },
        { trait: "short sentences!", evidence: "The eye follows motion." },
      ],
      CORPUS,
    );
    expect(out).toHaveLength(1);
  });

  it("matches evidence through a curly apostrophe", () => {
    const corpus = "It isn’t the rhythm that is wrong.";
    const out = groundedTraits([{ trait: "Contractions", evidence: "It isn't the rhythm that is wrong." }], corpus);
    expect(out).toHaveLength(1);
  });

  it("returns nothing from nothing", () => {
    expect(groundedTraits([], CORPUS)).toEqual([]);
    expect(groundedTraits([{ trait: "A", evidence: "B" }], "")).toEqual([]);
  });
});

describe("the voice request", () => {
  it("is byte identical in the system block whatever the decks", () => {
    const a = assembleVoice({ decks: DECKS });
    const b = assembleVoice({ decks: [["Something else entirely, at some length."]] });
    expect(a.system).toBe(b.system);
    expect(a.system).toBe(VOICE_SYSTEM);
  });

  /** The whole value of the feature, stated so it cannot drift out. */
  it("demands evidence copied exactly", () => {
    expect(VOICE_SYSTEM).toContain("COPIED EXACTLY");
    expect(VOICE_SYSTEM).toContain("take on faith");
  });

  /**
   * "Punchy" describes every piece of writing anybody has ever praised, and a
   * voice made of those words is a voice that fits everybody.
   */
  it("rules out the adjectives that describe nothing", () => {
    expect(VOICE_SYSTEM).toContain('"Direct", "punchy", "engaging"');
  });

  it("refuses to invent a list of banned words", () => {
    expect(VOICE_SYSTEM).toContain("invented list of banned words");
  });

  it("says to return fewer traits rather than unsupported ones", () => {
    expect(VOICE_SYSTEM).toContain("only support three, return three");
  });

  /**
   * Flattening the decks would lose the thing being measured: how somebody
   * opens and closes is a fact about a carousel, not about a sentence.
   */
  it("keeps each carousel's slides together and in order", () => {
    const { user } = assembleVoice({ decks: DECKS });
    expect(user).toContain("Carousel 1:");
    expect(user).toContain("Carousel 3:");
    expect(user.indexOf("Carousel 1:")).toBeLessThan(user.indexOf("Carousel 2:"));
  });

  it("counts the carousels it was given", () => {
    expect(assembleVoice({ decks: DECKS }).user).toContain("3 carousels they wrote");
    expect(assembleVoice({ decks: [DECKS[0]!] }).user).toContain("1 carousel they wrote");
  });

  it("drops blank slides and empty decks", () => {
    const { user } = assembleVoice({ decks: [["One", "   "], [], ["Two"]] });
    expect(user).toContain("2 carousels");
  });

  /**
   * Somebody's own description is context, not an answer to agree with. The
   * point of the feature is to say what the writing shows.
   */
  it("passes an existing description but tells it not to just agree", () => {
    const { user } = assembleVoice({ decks: DECKS, existing: { tone: "Warm and chatty" } });
    expect(user).toContain("Warm and chatty");
    expect(user).toContain("whether or not it agrees");
  });

  it("says nothing about a voice that does not exist yet", () => {
    expect(assembleVoice({ decks: DECKS }).user).not.toContain("already described");
  });

  it("clips an enormous set rather than billing for it", () => {
    const huge = Array.from({ length: 12 }, () => Array.from({ length: 40 }, () => "x".repeat(300)));
    expect(assembleVoice({ decks: huge }).user.length).toBeLessThan(MAX_LEARN_CHARS + 500);
  });
});
