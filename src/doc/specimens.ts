/**
 * Stress content for the template editor. Three lengths per role.
 *
 * The Long specimen is sized from the splitter's own thresholds (split.ts: 520/420/220)
 * so it is by construction the worst case the splitter can emit — not a guess that
 * confers false confidence. A template that looks perfect on placeholder copy is
 * exactly the template that breaks on a real 400-character body.
 */
import { newId } from "./ids.js";
import type { Slide, SlideRole } from "./types.js";

export type SpecimenLength = "short" | "typical" | "long";

const slide = (role: SlideRole, blocks: Slide["blocks"]): Slide => ({
  id: `spec_${role}`,
  role,
  blocks,
});

const p = (text: string): Slide["blocks"][number] => ({ id: newId("spec"), type: "paragraph", text });
const h = (text: string): Slide["blocks"][number] => ({ id: newId("spec"), type: "heading", text });

const LONG_BODY =
  "Most founders write something genuinely good and then let it die in the feed after ninety minutes. " +
  "The words were never the problem. The container was. A carousel holds attention for as long as it " +
  "takes to swipe, and swiping is cheap, so the same paragraph earns several times the dwell time it " +
  "would have earned sitting in a text post nobody scrolled back to.";

const LONG_QUOTE =
  "Constraint is the product. Every tool that lost this category lost it by adding one more option, " +
  "and every one of those options was reasonable on the day it shipped.";

export function specimen(role: SlideRole, length: SpecimenLength): Slide {
  if (role === "cover") {
    if (length === "short") return slide("cover", [h("Stop designing")]);
    if (length === "typical") return slide("cover", [h("Your post deserves a better container")]);
    return slide("cover", [
      h("Everything you already wrote is one paste away from being the best-performing thing you post this month"),
    ]);
  }

  if (role === "body") {
    if (length === "short") return slide("body", [h("The rule"), p("One idea per slide.")]);
    if (length === "typical")
      return slide("body", [
        h("Why it works"),
        p("A carousel earns dwell time because swiping is cheap. Same words, different container."),
      ]);
    return slide("body", [h("Why it works"), p(LONG_BODY)]);
  }

  if (role === "list") {
    const items =
      length === "short"
        ? ["Write first", "Design never"]
        : length === "typical"
          ? ["Write the post first", "One idea per slide", "The cover is a promise", "Ask for one thing"]
          : [
              "Write the post first, never design first",
              "One idea per slide, no exceptions, however tempting",
              "The cover is a promise, not a summary of what follows",
              "The last slide asks for exactly one thing and nothing else",
              "Never let a tool talk you into a second call to action",
              "If it does not fit, it is two slides and always was",
              "Ship it before you have finished admiring it",
            ];
    return slide("list", [
      h(length === "short" ? "Rules" : "The whole playbook"),
      { id: newId("spec"), type: "list", ordered: false, items },
    ]);
  }

  if (role === "quote") {
    const text =
      length === "short"
        ? "Constraint is the product."
        : length === "typical"
          ? "Constraint is the product. Fewer choices, faster output."
          : LONG_QUOTE;
    return slide("quote", [
      { id: newId("spec"), type: "quote", text, attribution: length === "short" ? undefined : "The brief" },
    ]);
  }

  if (length === "short") return slide("cta", [h("Follow")]);
  if (length === "typical") return slide("cta", [h("You already wrote the words."), p("Stop designing.")]);
  return slide("cta", [
    h("You already wrote the words, and you wrote them well — the only thing left is to stop designing them"),
    p("Follow for more posts that take thirty seconds to turn into a carousel."),
  ]);
}

export const LENGTHS: SpecimenLength[] = ["short", "typical", "long"];
