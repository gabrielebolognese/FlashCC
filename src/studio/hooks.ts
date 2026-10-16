/**
 * Hook formulas (25.3): about thirty fill-in-the-blank openings.
 *
 * Two ways to use one. By hand, with no model at all: pick a formula, fill
 * the blanks, and it goes onto the cover through the generator like any other
 * hook (Batch 4.1's finding that people should write the hook themselves). Or
 * as a hint: the pattern goes to `/api/hooks`, which then writes its variants
 * in that shape.
 *
 * **Nothing is ranked.** They are listed by kind, never by a claimed
 * performance number: a "top converting hooks" label would be the virality
 * score this product refuses to ship, arriving by a different door.
 *
 * Pure.
 */

export type HookKind = "curiosity" | "contrarian" | "result" | "list" | "story";

export const HOOK_KINDS: { id: HookKind; label: string; note: string }[] = [
  { id: "curiosity", label: "Curiosity", note: "Opens a gap the deck closes" },
  { id: "contrarian", label: "Contrarian", note: "Says the common advice is wrong" },
  { id: "result", label: "Result", note: "Leads with what happened" },
  { id: "list", label: "List", note: "Promises a countable payoff" },
  { id: "story", label: "Story", note: "Starts at a moment" },
];

export type HookFormula = { id: string; kind: HookKind; template: string };

const f = (id: string, kind: HookKind, template: string): HookFormula => ({ id, kind, template });

export const HOOK_FORMULAS: HookFormula[] = [
  f("nobody-tells", "curiosity", "Nobody tells you this about [topic]."),
  f("unknown-mistake", "curiosity", "The [topic] mistake you do not know you are making."),
  f("why-happens", "curiosity", "Why [common result] happens, and how to stop it."),
  f("experts-know", "curiosity", "What [experts] know about [topic] that you do not."),
  f("real-reason", "curiosity", "The real reason [problem]."),
  f("not-about", "curiosity", "[Topic] is not about [what people think]. It is about [what it is]."),

  f("stop", "contrarian", "Stop [doing the common thing]."),
  f("not-bad-at", "contrarian", "You are not bad at [X]. You are [doing Y]."),
  f("advice-wrong", "contrarian", "[Common advice] is wrong. Here is what works."),
  f("unpopular", "contrarian", "Unpopular opinion: [claim]."),
  f("missing", "contrarian", "Everyone says [belief]. They are missing [thing]."),
  f("costing-you", "contrarian", "[Thing everyone does] is costing you [cost]."),

  f("how-i", "result", "How I [result] in [time]."),
  f("did-for", "result", "I [did X] for [time]. Here is what happened."),
  f("from-to", "result", "From [before] to [after] in [time]."),
  f("changes-that", "result", "The [number] changes that [result]."),
  f("taught-me", "result", "What [number] [units] taught me about [topic]."),
  f("without", "result", "[Result] without [the usual cost]."),

  f("nobody-list", "list", "[Number] [things] nobody tells you about [topic]."),
  f("mistakes-weekly", "list", "[Number] [topic] mistakes I see every week."),
  f("ways-to", "list", "[Number] ways to [goal] this week."),
  f("checklist", "list", "The [number]-step [topic] checklist."),
  f("tools-for", "list", "[Number] tools I use for [job]."),
  f("save-this", "list", "Save this: [number] [things] for [goal]."),

  f("ago-today", "story", "[Time] ago I [low point]. Today [high point]."),
  f("the-day", "story", "The day I [moment] changed how I [practice]."),
  f("almost-quit", "story", "I almost gave up on [thing]. Then [turn]."),
  f("worst-taught", "story", "My worst [thing] taught me [lesson]."),
  f("client-asked", "story", "A client asked me [question]. Here is my answer."),
  f("wish-i-read", "story", "This is the [thing] I wish I had read [time] ago."),
];

const BLANK = /\[([^\]]+)\]/g;

/** The blanks in a formula, in order, each once. */
export function blanksOf(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(BLANK)) {
    const label = m[1]!.trim();
    if (!out.some((b) => b.toLowerCase() === label.toLowerCase())) out.push(label);
  }
  return out;
}

/**
 * The formula with its blanks filled. A blank left empty stays as it is, so
 * a half-filled hook says what is missing rather than reading as finished. A
 * filled blank at the start of the line takes a capital.
 */
export function fillFormula(template: string, values: Record<string, string>): string {
  const get = (label: string) => {
    const key = Object.keys(values).find((k) => k.toLowerCase() === label.trim().toLowerCase());
    return key ? (values[key] ?? "").trim() : "";
  };
  return template.replace(BLANK, (whole, label: string, at: number) => {
    const v = get(label);
    if (!v) return whole;
    const start = at === 0 || /[.:!?]\s*$/.test(template.slice(0, at));
    return start ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  });
}

export const isFilled = (text: string): boolean => !/\[[^\]]+\]/.test(text);

/** The formulas of one kind, in their fixed order. */
export const formulasOf = (kind: HookKind): HookFormula[] => HOOK_FORMULAS.filter((h) => h.kind === kind);
