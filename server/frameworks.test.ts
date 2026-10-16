import { describe, expect, it } from "vitest";

import { assembleDraft } from "./prompts.js";
import { checkDraft } from "./checks.js";
import { HONEST_BLANK } from "../src/studio/honesty.js";
import { slotsFor, STRUCTURES, type Structure } from "../src/studio/structures.js";

/** The three briefs the eval harness drafts every framework from (scripts/eval-draft.mjs). */
const BRIEFS = [
  "Cutting on the beat makes edits feel mechanical. Attention resets when the frame changes, not when the snare hits. Cut on movement instead: a hand leaving frame, a head turning, a door closing.",
  "Cut on movement, not on the beat.",
  "We rebuilt our onboarding this spring: one screen instead of five, and a checklist instead of a tour. Customers seem to like it more.",
];

/** What the server is sent, as `ai.ts` sends it. */
const asSent = (s: Structure) => ({
  name: s.name,
  shape: s.shape,
  slots: s.slots.map((x) => ({
    id: x.id,
    label: x.label,
    note: x.detail,
    placeholder: x.placeholder,
    ...(x.block ? { block: { id: x.block.id, label: x.block.label, fields: x.block.fields } } : {}),
    ...(x.honest ? { honest: true } : {}),
  })),
});

describe("sixteen frameworks (25.1)", () => {
  it("there are sixteen, with unique ids and names", () => {
    expect(STRUCTURES).toHaveLength(16);
    expect(new Set(STRUCTURES.map((s) => s.id)).size).toBe(16);
    expect(new Set(STRUCTURES.map((s) => s.name)).size).toBe(16);
  });

  /**
   * The structural half of the done-when, with no key and no bill: every
   * framework, at every rhythm, from each of the three eval briefs, assembles a
   * prompt that states its count, and a draft that does each slot's job
   * passes the production checks with nothing to retry. The live half is
   * `npm run eval:draft`, which needs a key.
   */
  for (const structure of STRUCTURES) {
    for (const rhythm of structure.rhythms ?? []) {
      it(`${structure.name} / ${rhythm.label}: zero structural failures from three briefs`, () => {
        const slots = slotsFor(structure, structure.slots.length, rhythm.id);
        const sent = asSent({ ...structure, slots });
        for (const brief of BRIEFS) {
          const { user } = assembleDraft({ brief, structure: sent });
          expect(user).toContain(`Return exactly ${slots.length} slide`);
          // A repeated slot gets a different line each time, as a real draft does.
          const draft = slots.map((s, i) => ({
            role: s.id,
            text: s.honest ? HONEST_BLANK : `${s.placeholder.split("\n")[0]!}${s.repeatable ? ` Case ${i + 1}.` : ""}`,
          }));
          const retries = checkDraft(draft, sent.slots, brief).filter((f) => f.tier === "retry");
          expect(retries, `${structure.id}/${rhythm.id}`).toEqual([]);
        }
      });
    }
  }
});

describe("the honesty rule (25.1)", () => {
  const data = STRUCTURES.find((s) => s.id === "data")!;

  it("tells the model to leave a result it was not given as the honest blank", () => {
    const { user } = assembleDraft({ brief: BRIEFS[2]!, structure: asSent(data) });
    expect(user).toContain(`return exactly "${HONEST_BLANK}"`);
  });

  it("applies to the result slots of Case study (the showcase) and Story too", () => {
    for (const id of ["showcase", "story"]) {
      expect(STRUCTURES.find((s) => s.id === id)!.slots.find((x) => x.id === "result")!.honest).toBe(true);
    }
  });

});

describe("a block with no words to ask for (25.1)", () => {
  it("is not asked for fields: a screen frame is placed by the framework alone", () => {
    const tools = STRUCTURES.find((s) => s.id === "tool-stack")!;
    const slots = slotsFor(tools, 6, "with-screens");
    const { user } = assembleDraft({ brief: BRIEFS[0]!, structure: asSent({ ...tools, slots }) });
    expect(user).not.toContain('"fields" with exactly 0');
  });
});
