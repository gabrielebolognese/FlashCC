import { describe, expect, it } from "vitest";

import {
  assembleDraft,
  assembleHooks,
  clip,
  DRAFT_SYSTEM,
  HOOK_SYSTEM,
  MAX_BRIEF_CHARS,
  MAX_SAMPLES,
  plainText,
  voiceBlock,
  type Structure,
} from "./prompts.js";

const STRUCTURE: Structure = {
  name: "Problem to Solution",
  shape: "Problem to Fix",
  slots: [
    { id: "hook", label: "Hook", note: "Decides whether slide 2 is seen", placeholder: "Your videos feel flat." },
    { id: "cost", label: "Cost", note: "What it is costing them", placeholder: "Every cut lands wrong." },
    { id: "cta", label: "Close", note: "Ask for the thing", placeholder: "Save this." },
  ],
};

const BRIEF = "Cutting on the beat makes edits feel mechanical. Cut on movement instead.";

describe("the cache boundary", () => {
  /**
   * Anthropic caches a PREFIX, so the system block has to be byte-identical
   * between calls or the cache misses entirely. Anything per-request in there
   * silently costs money rather than saving it.
   */
  it("keeps the system block identical whatever the request", () => {
    const a = assembleDraft({ brief: "One brief", structure: STRUCTURE });
    const b = assembleDraft({
      brief: "A completely different brief",
      structure: { ...STRUCTURE, name: "Story" },
      voice: { tone: "blunt", samples: ["Something I wrote"] },
    });

    expect(a.system).toBe(b.system);
    expect(a.system).toBe(DRAFT_SYSTEM);
  });

  it("does the same for hooks", () => {
    const a = assembleHooks({ hook: "x", deck: ["a"], count: 5 });
    const b = assembleHooks({ hook: "y", deck: ["b", "c"], count: 3, voice: { tone: "dry" } });

    expect(a.system).toBe(b.system);
    expect(a.system).toBe(HOOK_SYSTEM);
  });

  /** Per-brand content in the cached prefix would give every brand its own entry. */
  it("keeps voice out of the system block and in the user message", () => {
    const out = assembleDraft({
      brief: BRIEF,
      structure: STRUCTURE,
      voice: { tone: "blunt and short" },
    });

    expect(out.system).not.toContain("blunt and short");
    expect(out.user).toContain("blunt and short");
  });
});

describe("the draft prompt", () => {
  const out = assembleDraft({ brief: BRIEF, structure: STRUCTURE });

  it("names the framework and its shape", () => {
    expect(out.user).toContain("Framework: Problem to Solution (Problem to Fix)");
  });

  it("numbers every slot with its id, label, note and example", () => {
    expect(out.user).toContain('1. id="hook", Hook: Decides whether slide 2 is seen. e.g. "Your videos feel flat."');
    expect(out.user).toContain('3. id="cta", Close: Ask for the thing. e.g. "Save this."');
  });

  it("carries the brief", () => {
    expect(out.user).toContain(BRIEF);
  });

  it("clips a brief long enough to be an accident", () => {
    const huge = assembleDraft({ brief: "word ".repeat(10_000), structure: STRUCTURE });
    expect(huge.user.length).toBeLessThan(MAX_BRIEF_CHARS + 2000);
  });

  /** The golden. A careless edit to the prompt shows up here rather than in a carousel. */
  it("assembles exactly this", () => {
    expect(out.user).toBe(
      [
        "Framework: Problem to Solution (Problem to Fix)",
        "",
        'Slots, in order:\n1. id="hook", Hook: Decides whether slide 2 is seen. e.g. "Your videos feel flat."\n2. id="cost", Cost: What it is costing them. e.g. "Every cut lands wrong."\n3. id="cta", Close: Ask for the thing. e.g. "Save this."',
        "",
        `Brief:\n${BRIEF}`,
      ].join("\n"),
    );
  });
});

describe("the hook prompt", () => {
  const out = assembleHooks({
    hook: "Your videos feel flat.",
    deck: ["Your videos feel flat.", "Cut on movement."],
    framework: "Problem to Solution",
    count: 5,
  });

  it("numbers the deck so the model can refer to a slide", () => {
    expect(out.user).toContain("1. Your videos feel flat.\n2. Cut on movement.");
  });

  it("says how many are wanted", () => {
    expect(out.user).toContain("Write 5 alternative openings.");
  });

  it("says so plainly when there is no hook yet", () => {
    const blank = assembleHooks({ hook: "   ", deck: ["a"], count: 3 });
    expect(blank.user).toContain("Current opening: (none yet)");
  });

  it("leaves the framework line out entirely when there is none", () => {
    expect(assembleHooks({ hook: "x", deck: ["a"], count: 3 }).user).not.toContain("Framework:");
  });
});

/**
 * The block that makes a draft sound like somebody rather than like a model.
 * Examples beat adjectives, which is why samples carry the weight and get the
 * longest instruction.
 */
describe("voice", () => {
  it("is nothing at all when there is nothing to say", () => {
    expect(voiceBlock(undefined)).toBe("");
    expect(voiceBlock({})).toBe("");
    expect(voiceBlock({ tone: "   ", samples: [], avoid: [] })).toBe("");
  });

  /** An empty heading tells the model voice matters and gives it nothing to use. */
  it("leaves the prompt byte-identical to the no-voice prompt when empty", () => {
    const without = assembleDraft({ brief: BRIEF, structure: STRUCTURE });
    const blank = assembleDraft({ brief: BRIEF, structure: STRUCTURE, voice: {} });
    expect(blank.user).toBe(without.user);
  });

  it("carries a tone line", () => {
    expect(voiceBlock({ tone: "Blunt, no throat-clearing" })).toContain("Blunt, no throat-clearing");
  });

  it("lists banned words", () => {
    expect(voiceBlock({ avoid: ["leverage", "synergy"] })).toContain("leverage, synergy");
  });

  it("numbers the samples and tells the model to match rhythm, not subject", () => {
    const out = voiceBlock({ samples: ["First post", "Second post"] });
    expect(out).toContain("1. First post");
    expect(out).toContain("2. Second post");
    expect(out).toContain("not the subject");
  });

  it("takes no more than three samples, however many are stored", () => {
    const out = voiceBlock({ samples: ["a", "b", "c", "d", "e"] });
    expect(out).toContain(`${MAX_SAMPLES}. c`);
    expect(out).not.toContain("4. d");
  });

  it("clips a sample somebody pasted a whole newsletter into", () => {
    expect(voiceBlock({ samples: ["word ".repeat(5000)] }).length).toBeLessThan(2000);
  });

  it("drops blanks rather than numbering them", () => {
    expect(voiceBlock({ samples: ["real", "  ", "also real"] })).toContain("2. also real");
  });
});

describe("clipping", () => {
  it("leaves anything short enough alone", () => {
    expect(clip("short", 50)).toBe("short");
  });

  it("marks what it cut", () => {
    expect(clip("abcdefghij", 5).endsWith("…")).toBe(true);
  });
});

describe("cleaning what the model wrote", () => {
  /**
   * The case that prompted this. An Opus comparison run put em dashes in four
   * slides out of eight; the prompt asks for none, and a prompt is not a
   * guarantee.
   */
  it("turns an em dash into a comma", () => {
    expect(plainText("It started the way most edits do \u2014 footage on a timeline")).toBe(
      "It started the way most edits do, footage on a timeline",
    );
  });

  it("handles one with no spaces around it", () => {
    expect(plainText("fast\u2014cheap")).toBe("fast, cheap");
  });

  it("leaves a number range readable", () => {
    expect(plainText("takes 3\u20135 minutes")).toBe("takes 3-5 minutes");
  });

  it("does not leave a comma stranded next to other punctuation", () => {
    expect(plainText("the edit \u2014. Done")).toBe("the edit. Done");
  });

  it("drops one that opens or closes the line", () => {
    expect(plainText("\u2014 and that is the point \u2014")).toBe("and that is the point");
  });

  /** The overwhelming majority of slides. It must not touch them. */
  it("leaves ordinary copy exactly as it is", () => {
    const copy = "Cut on movement, not on the beat. The eye follows motion; the ear follows rhythm.";
    expect(plainText(copy)).toBe(copy);
  });

  it("leaves a hyphenated word alone", () => {
    expect(plainText("a beat-matched cut")).toBe("a beat-matched cut");
  });

  it("survives an empty string", () => {
    expect(plainText("")).toBe("");
  });
});
