import { describe, expect, it } from "vitest";

import {
  assembleDraft,
  assembleHooks,
  clip,
  DRAFT_SYSTEM,
  HOOK_SYSTEM,
  MAX_BRIEF_CHARS,
  MAX_SAMPLES,
  assembleRewrite,
  BODY_CHARS,
  HOOK_CHARS,
  INTENT_RULES,
  limitFor,
  MAX_INSTRUCTION_CHARS,
  MAX_REWRITE_CHARS,
  plainText,
  MAX_NOTE_CHARS,
  REWRITE_INTENTS,
  REWRITE_SYSTEM,
  shortNote,
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

/* ── rewriting one line ───────────────────────────────────────── */

const SLOT = { id: "hook", label: "Hook", note: "Earn the swipe", placeholder: "e.g." };
const BODY_SLOT = { ...SLOT, id: "point", label: "Point" };

describe("the rewrite system block", () => {
  it("is byte identical for every request", () => {
    const a = assembleRewrite({ text: "One", intent: "shorter", count: 3 });
    const b = assembleRewrite({ text: "Two", intent: "angle", count: 5, slot: SLOT });
    expect(a.system).toBe(b.system);
    expect(a.system).toBe(REWRITE_SYSTEM);
  });

  it("bans the punctuation the house style bans", () => {
    expect(REWRITE_SYSTEM).toContain("No em dashes");
  });

  /** The failure every intent shares: making a line better by claiming more. */
  it("forbids adding a claim the deck does not contain", () => {
    expect(REWRITE_SYSTEM).toContain("Add no claim");
  });
});

describe("every intent says something different", () => {
  it("has a rule for each one", () => {
    for (const intent of REWRITE_INTENTS) {
      expect(INTENT_RULES).toHaveProperty(intent);
    }
  });

  /**
   * Two intents with the same instruction produce the same alternatives, which
   * makes one of the chips a lie.
   */
  it("gives no two intents the same instruction", () => {
    const written = REWRITE_INTENTS.filter((i) => i !== "free").map((i) => INTENT_RULES[i]);
    expect(new Set(written).size).toBe(written.length);
  });

  it("puts the intent at the top of the request", () => {
    const { user } = assembleRewrite({ text: "A line.", intent: "punchier", count: 3 });
    expect(user.startsWith("What to change: ")).toBe(true);
    expect(user).toContain(INTENT_RULES.punchier);
  });
});

describe("the character ceiling", () => {
  it("holds a hook to 90 and everything else to 220", () => {
    expect(limitFor(SLOT)).toBe(HOOK_CHARS);
    expect(limitFor(BODY_SLOT)).toBe(BODY_CHARS);
    expect(limitFor(undefined)).toBe(BODY_CHARS);
  });

  it("lets the caller override it", () => {
    expect(limitFor(SLOT, 140)).toBe(140);
  });

  /**
   * `expand` is the intent that grows a line past its box, so the number has to
   * be in the prompt and not only in the checks afterwards.
   */
  it("states the limit in the request, expand included", () => {
    const { user } = assembleRewrite({ text: "A line.", intent: "expand", count: 3, slot: SLOT });
    expect(user).toContain(`Hard limit: ${HOOK_CHARS} characters`);
  });
});

describe("free text", () => {
  it("uses the user's own instruction", () => {
    const { user } = assembleRewrite({
      text: "A line.",
      intent: "free",
      instruction: "Make it sound Scottish",
      count: 3,
    });
    expect(user).toContain("Make it sound Scottish");
  });

  it("clips a very long instruction", () => {
    const { user } = assembleRewrite({
      text: "A line.",
      intent: "free",
      instruction: "x".repeat(MAX_INSTRUCTION_CHARS + 500),
      count: 3,
    });
    expect(user.length).toBeLessThan(MAX_INSTRUCTION_CHARS + 900);
  });

  /** An empty box asks for something different, not for nothing. */
  it("falls back to a real instruction when the box was left empty", () => {
    const { user } = assembleRewrite({ text: "A line.", intent: "free", instruction: "  ", count: 3 });
    expect(user).toContain(INTENT_RULES.angle);
  });
});

describe("what the request carries", () => {
  it("puts the line last, after everything that frames it", () => {
    const { user } = assembleRewrite({
      text: "THE LINE ITSELF",
      intent: "shorter",
      slot: SLOT,
      deck: ["One", "Two"],
      count: 3,
    });
    expect(user.indexOf("THE LINE ITSELF")).toBeGreaterThan(user.indexOf("The job this line does"));
    expect(user.indexOf("THE LINE ITSELF")).toBeGreaterThan(user.indexOf("for context"));
  });

  it("names the slot's job when there is one", () => {
    const { user } = assembleRewrite({ text: "A.", intent: "shorter", slot: SLOT, count: 3 });
    expect(user).toContain("Hook. Earn the swipe");
  });

  /** A deck that has been reordered has no reliable slot, so it sends none. */
  it("says nothing about the job when no slot is known", () => {
    const { user } = assembleRewrite({ text: "A.", intent: "shorter", count: 3 });
    expect(user).not.toContain("The job this line does");
  });

  it("leaves the deck out entirely when it is empty", () => {
    const { user } = assembleRewrite({ text: "A.", intent: "shorter", deck: [], count: 3 });
    expect(user).not.toContain("for context");
  });

  it("drops blank slides from the deck", () => {
    const { user } = assembleRewrite({ text: "A.", intent: "shorter", deck: ["One", "  ", "Two"], count: 3 });
    expect(user).toContain("1. One");
    expect(user).toContain("2. Two");
  });

  it("asks for the count it was given", () => {
    expect(assembleRewrite({ text: "A.", intent: "shorter", count: 4 }).user).toContain(
      "Write 4 alternatives.",
    );
  });

  it("clips an enormous line rather than billing for it", () => {
    const { user } = assembleRewrite({ text: "x".repeat(MAX_REWRITE_CHARS + 4000), intent: "shorter", count: 3 });
    expect(user.length).toBeLessThan(MAX_REWRITE_CHARS + 1000);
  });

  /** Voice is per brand, so it stays out of the cached prefix. */
  it("carries voice in the user message, never the system block", () => {
    const { system, user } = assembleRewrite({
      text: "A.",
      intent: "shorter",
      count: 3,
      voice: { tone: "Blunt, no throat-clearing" },
    });
    expect(user).toContain("Blunt, no throat-clearing");
    expect(system).not.toContain("Blunt");
  });
});

describe("the note is a label, not a sentence", () => {
  it("leaves a short note alone", () => {
    expect(shortNote("tighter")).toBe("tighter");
    expect(shortNote("names the cost")).toBe("names the cost");
  });

  /** The real one that prompted this, from a live run of the `angle` intent. */
  it("cuts a note that came back as a whole sentence", () => {
    const out = shortNote("Names the sensory disconnect without using technical terms.");
    expect(out.length).toBeLessThanOrEqual(MAX_NOTE_CHARS);
    expect(out).toBe("Names the sensory disconnect");
  });

  /** Ending mid-word reads as a rendering bug rather than as a label. */
  it("cuts at a word boundary", () => {
    const full = "consequence first and active voice throughout";
    const out = shortNote(full);
    expect(full.startsWith(out)).toBe(true);
    // The character it stopped before is a space, so no word was cut in half.
    expect(full[out.length]).toBe(" ");
  });

  it("drops trailing punctuation", () => {
    expect(shortNote("tighter.")).toBe("tighter");
    expect(shortNote("plainer words,")).toBe("plainer words");
  });

  it("survives an empty note", () => {
    expect(shortNote("   ")).toBe("");
  });

  /** One very long word has no boundary to cut at, so it is cut anyway. */
  it("still bounds a note with no spaces in it", () => {
    expect(shortNote("x".repeat(80)).length).toBeLessThanOrEqual(MAX_NOTE_CHARS);
  });
});
