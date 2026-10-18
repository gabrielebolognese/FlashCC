import { describe, expect, it } from "vitest";

import { dayKey } from "./calendar.js";
import { ALL_CLIENTS, UNASSIGNED } from "./clients.js";
import { buildSlides } from "./compositions.js";
import { altsFor, finishingQueue, hookText, markDone, nextStep, payoffText, stepsLeft } from "./finishing.js";
import { filterIdeas, ideasOf, isIdea, makeIdea, NO_PILLAR, pillarsOf } from "./ideas.js";
import { isoWeekday, laneAt, laneLabel, laneToRow, lanesOn, makeLane, rowToLane, type Lane } from "./lanes.js";
import { makeDoc, type Doc } from "./model.js";
import { makePost, type Post } from "./pipeline.js";
import { structureById } from "./structures.js";
import { styleById } from "./styles.js";
import { templateFrom } from "./templates.js";
import {
  deckForLane,
  emptyAfter,
  isStale,
  landIdea,
  laneStructure,
  moveStep,
  openLanesOn,
  ownWords,
  runSession,
  sessionQueue,
  slotsAhead,
  type SessionStep,
} from "./week.js";

/** Sunday 18 October 2026, mid-morning, local time. */
const SUNDAY = new Date(2026, 9, 18, 10, 0);

const idea = (title: string, patch: Partial<Post> = {}): Post => ({ ...makeIdea(title)!, ...patch });

describe("the idea bank (27.1)", () => {
  it("is one line in, and nothing for an empty one", () => {
    const i = makeIdea("  Cut on   movement, not on the beat ", { pillar: " Editing " })!;
    expect(i).toMatchObject({ title: "Cut on movement, not on the beat", stage: "idea", pillar: "Editing", source: "capture", docId: null });
    expect(makeIdea("   ")).toBeNull();
  });

  it("filters by pillar and client with nothing typed", () => {
    const bank = [
      idea("A", { pillar: "Editing", clientId: "c1" }),
      idea("B", { pillar: "Sound", clientId: "c1" }),
      idea("C", { pillar: "Editing" }),
      idea("D"),
    ];
    const titles = (f: { pillar: string; client: string }) => filterIdeas(bank, f).map((p) => p.title);
    expect(titles({ pillar: "Editing", client: ALL_CLIENTS })).toEqual(["A", "C"]);
    expect(titles({ pillar: "", client: "c1" })).toEqual(["A", "B"]);
    expect(titles({ pillar: "Editing", client: UNASSIGNED })).toEqual(["C"]);
    expect(titles({ pillar: NO_PILLAR, client: ALL_CLIENTS })).toEqual(["D"]);
  });

  it("offers the pillars already in use, most used first, taken as written", () => {
    const posts = [idea("a", { pillar: "Editing" }), idea("b", { pillar: "Editing" }), idea("c", { pillar: "editing" })];
    expect(pillarsOf(posts, [{ pillar: "Sound" }, { pillar: "  " }])).toEqual(["Editing", "editing", "Sound"]);
  });

  it("stops being an idea once it has a carousel", () => {
    const i = idea("x");
    expect(isIdea(i)).toBe(true);
    expect(isIdea({ ...i, docId: "d1" })).toBe(false);
    expect(ideasOf([i, makePost({ stage: "drafting" })])).toEqual([i]);
  });
});

describe("lanes (27.2)", () => {
  const lane = makeLane({ weekday: 1, time: "18:30", platform: "linkedin", framework: "myth", look: { kind: "pack", id: "studio" }, pillar: "Editing" });

  it("lands at its own wall-clock time on its weekday", () => {
    const monday = new Date(2026, 9, 19);
    expect(isoWeekday(monday)).toBe(1);
    expect(isoWeekday(SUNDAY)).toBe(7);
    expect(laneAt(lane, monday)).toEqual(new Date(2026, 9, 19, 18, 30));
    expect(lanesOn([lane], monday)).toEqual([lane]);
    expect(lanesOn([lane], SUNDAY)).toEqual([]);
  });

  it("is labelled by its fields when it has no name", () => {
    expect(laneLabel(lane, { framework: (id) => (id === "myth" ? "Myth versus fact" : undefined) })).toBe(
      "Monday · LinkedIn · Myth versus fact · studio · Editing",
    );
    expect(laneLabel({ ...lane, name: "Myth Monday" })).toBe("Myth Monday");
  });

  it("round-trips through its row", () => {
    expect(rowToLane(laneToRow(lane, "u1"))).toEqual(lane);
  });
});

/* ── make next week (27.3) ───────────────────────────────────────────────── */

const template = (() => {
  const s = structureById("myth")!;
  const doc: Doc = { ...makeDoc("Myth template"), framework: "myth", slides: buildSlides(s.slots.map((x) => x.placeholder), styleById("ink").theme, s.slots.map((x) => x.id)) };
  return templateFrom(doc, "Myth template");
})();

const FIVE: Lane[] = [
  makeLane({ weekday: 1, framework: "myth", look: { kind: "template", id: template.id }, platform: "linkedin", pillar: "Editing" }),
  makeLane({ weekday: 2, framework: "checklist", look: { kind: "pack", id: "studio" }, platform: "instagram", pillar: "Workflow" }),
  makeLane({ weekday: 3, framework: "educational", look: { kind: "style", id: "ink" }, platform: "linkedin" }),
  makeLane({ weekday: 4, framework: "story", look: { kind: "pack", id: "calm" }, platform: "tiktok" }),
  makeLane({ weekday: 5, framework: "hot-take", look: { kind: "style", id: "paper" }, platform: "linkedin", time: "07:45" }),
];

const IDEAS = ["Cut on movement", "Colour before contrast", "Sound sells the cut", "My worst edit", "Nobody needs LUTs"].map((t) => idea(t));

/** The run, without a network: each carousel from the framework's own words, in its lane's format. */
function harness(steps: SessionStep[], stopAfter = Infinity) {
  let queue = steps;
  const docs: Doc[] = [];
  const posts: Post[] = [];
  const deps = {
    read: () => queue,
    write: (s: SessionStep[]) => {
      queue = s;
    },
    stopped: () => docs.length >= stopAfter,
    make: async (step: SessionStep) => {
      const tpl = step.slot.lane.look.kind === "template" ? template : undefined;
      const structure = laneStructure(step.slot.lane, step.idea.title, tpl)!;
      return deckForLane(step.slot.lane, ownWords(structure, step.idea), { structure, template: tpl });
    },
    land: (step: SessionStep, doc: Doc) => {
      docs.push(doc);
      posts.push(landIdea(step.idea, doc, step.slot));
    },
  };
  return { deps, docs, posts, queue: () => queue };
}

describe("make next week (27.3)", () => {
  it("lays out the next seven days of lanes as slots, skipping a time already past", () => {
    const slots = slotsAhead(FIVE, [], SUNDAY);
    expect(slots.map((s) => s.day)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    // This Sunday's 09:00 has gone and next Sunday's is inside the seven days;
    // an 11:00 lane is still ahead today, and next Sunday's 11:00 is past the edge.
    const sunday = makeLane({ weekday: 7, framework: "myth", look: { kind: "style", id: "ink" } });
    expect(slotsAhead([sunday], [], SUNDAY).map((s) => s.day)).toEqual(["2026-10-25"]);
    expect(slotsAhead([{ ...sunday, time: "11:00" }], [], SUNDAY).map((s) => s.day)).toEqual(["2026-10-18"]);
  });

  it("never pairs an idea the person did not pick, and uses each idea once", () => {
    const slots = slotsAhead(FIVE, [], SUNDAY);
    const q = sessionQueue(slots, { [slots[0]!.key]: IDEAS[0]!.id, [slots[2]!.key]: IDEAS[0]!.id, [slots[3]!.key]: IDEAS[3]!.id }, IDEAS);
    expect(q.map((s) => [s.slot.day, s.idea.title])).toEqual([
      ["2026-10-19", "Cut on movement"],
      ["2026-10-22", "My worst edit"],
    ]);
  });

  it("five lanes and five ideas make five carousels, each in its lane's format and dated on its lane's day", async () => {
    const slots = slotsAhead(FIVE, [], SUNDAY);
    const pairing = Object.fromEntries(slots.map((s, i) => [s.key, IDEAS[i]!.id]));
    const h = harness(sessionQueue(slots, pairing, IDEAS));
    const done = await runSession(h.deps);

    expect(done.map((s) => s.state)).toEqual(["done", "done", "done", "done", "done"]);
    expect(h.docs.map((d) => d.framework)).toEqual(["myth", "checklist", "educational", "story", "hot-take"]);
    // The template lane's deck records its template and takes its length.
    expect(h.docs[0]!.template).toBe(template.id);
    expect(h.docs[0]!.slides).toHaveLength(template.slides.length);
    // The pack lanes carry their pack; the style lanes their style.
    expect(h.docs.map((d) => d.styleId)).toEqual([undefined, "pack:studio", "ink", "pack:calm", "paper"]);
    // The idea is on the cover.
    expect(h.posts.map((p) => p.hook)).toEqual(IDEAS.map((i) => i.title));
    // Each post sits on its lane's day, at its lane's time, on its lane's platform.
    expect(h.posts.map((p) => dayKey(new Date(p.scheduledFor!)))).toEqual(slots.map((s) => s.day));
    expect(new Date(h.posts[4]!.scheduledFor!).getHours()).toBe(7);
    expect(h.posts.map((p) => p.platform)).toEqual(["linkedin", "instagram", "linkedin", "tiktok", "linkedin"]);
    expect(h.posts.every((p) => p.stage === "drafting" && p.lane && p.docId)).toBe(true);
    // The lane's pillar fills an idea that had none.
    expect(h.posts[0]!.pillar).toBe("Editing");
    // And the next session sees those slots as filled.
    expect(slotsAhead(FIVE, h.posts, SUNDAY).every((s) => s.filled)).toBe(true);
  });

  it("stopped after the third: three carousels kept, two slots empty", async () => {
    const slots = slotsAhead(FIVE, [], SUNDAY);
    const pairing = Object.fromEntries(slots.map((s, i) => [s.key, IDEAS[i]!.id]));
    const h = harness(sessionQueue(slots, pairing, IDEAS), 3);
    const done = await runSession(h.deps);
    expect(h.docs).toHaveLength(3);
    expect(done.map((s) => s.state)).toEqual(["done", "done", "done", "waiting", "waiting"]);
    expect(emptyAfter(slots, done).map((s) => s.day)).toEqual(["2026-10-22", "2026-10-23"]);
  });

  it("follows a reorder made while it runs, and moves only what has not started", async () => {
    const slots = slotsAhead(FIVE, [], SUNDAY);
    const pairing = Object.fromEntries(slots.map((s, i) => [s.key, IDEAS[i]!.id]));
    const h = harness(sessionQueue(slots, pairing, IDEAS));
    const order: string[] = [];
    const make = h.deps.make;
    h.deps.make = async (step) => {
      order.push(step.idea.title);
      // Mid-run, after the first: Friday's idea jumps the queue.
      if (order.length === 1) {
        let q = h.queue();
        for (let k = 0; k < 3; k += 1) q = moveStep(q, slots[4]!.key, -1);
        h.deps.write(q);
      }
      return make(step);
    };
    await runSession(h.deps);
    expect(order).toEqual(["Cut on movement", "Nobody needs LUTs", "Colour before contrast", "Sound sells the cut", "My worst edit"]);
    // A started step does not move.
    const q = h.queue();
    expect(moveStep(q, q[0]!.key, 1)).toEqual(q);
  });

  it("marks a failed step and carries on", async () => {
    const slots = slotsAhead(FIVE.slice(0, 2), [], SUNDAY);
    const h = harness(sessionQueue(slots, { [slots[0]!.key]: IDEAS[0]!.id, [slots[1]!.key]: IDEAS[1]!.id }, IDEAS));
    const make = h.deps.make;
    h.deps.make = async (step) => {
      if (step.idea === IDEAS[0]) throw new Error("Rate limited");
      return make(step);
    };
    const done = await runSession(h.deps);
    expect(done.map((s) => [s.state, s.error])).toEqual([["failed", "Rate limited"], ["done", undefined]]);
  });
});

describe("the week view (27.5)", () => {
  it("shows a lane as an empty slot until a post fills it on that day", () => {
    const monday = new Date(2026, 9, 19);
    const lane = FIVE[0]!;
    expect(openLanesOn(FIVE, [], monday)).toEqual([lane]);
    const filled = { ...makePost({ lane: lane.id }), scheduledFor: new Date(2026, 9, 19, 9).toISOString() };
    expect(openLanesOn(FIVE, [filled], monday)).toEqual([]);
    // Same lane, another week: still open.
    expect(openLanesOn(FIVE, [filled], new Date(2026, 9, 26))).toEqual([lane]);
  });

  it("marks a draft untouched for more than a week, and nothing else", () => {
    const now = new Date(2026, 9, 18);
    const draft = makePost({ stage: "drafting", createdAt: new Date(2026, 9, 1).toISOString() });
    expect(isStale(draft, null, now)).toBe(true);
    expect(isStale(draft, new Date(2026, 9, 15).toISOString(), now)).toBe(false);
    expect(isStale({ ...draft, stage: "scheduled" }, null, now)).toBe(false);
  });
});

describe("the finishing pass (27.4)", () => {
  it("walks six steps in a fixed order, and a scheduled post has none left", () => {
    const p = makePost({ stage: "drafting", docId: "d" });
    let progress = {};
    expect(stepsLeft(p, progress)).toEqual(["hook", "payoff", "caption", "alt", "preflight", "schedule"]);
    progress = markDone(markDone(progress, p.id, "hook"), p.id, "caption");
    expect(nextStep(p, progress)).toBe("payoff");
    expect(stepsLeft(p, progress)).toHaveLength(4);
    expect(stepsLeft({ ...p, stage: "scheduled" }, progress)).toEqual([]);
  });

  it("queues drafted carousels soonest first, undated last", () => {
    const a = makePost({ stage: "drafting", docId: "a", scheduledFor: "2026-10-21T09:00:00.000Z" });
    const b = makePost({ stage: "drafting", docId: "b", scheduledFor: "2026-10-19T09:00:00.000Z" });
    const c = makePost({ stage: "drafting", docId: "c" });
    const idea = makePost({ stage: "idea" });
    expect(finishingQueue([c, a, idea, b]).map((p) => p.docId)).toEqual(["b", "a", "c"]);
  });

  it("reads the hook and payoff off the deck and writes alt text from its words", () => {
    const s = structureById("myth")!;
    const doc: Doc = { ...makeDoc("x"), slides: buildSlides(["Cut on movement", "Middle", "Follow for part two"], styleById("ink").theme, [s.slots[0]!.id, s.slots[1]!.id, "cta"]) };
    expect(hookText(doc)).toContain("Cut on movement");
    expect(payoffText(doc)).toContain("Follow for part two");
    const alts = altsFor({ ...doc, slides: doc.slides.map((sl, i) => (i === 1 ? { ...sl, alt: "Mine" } : sl)) });
    expect(alts[1]).toBe("Mine");
    expect(alts[0]).toContain("Cut on movement");
  });
});
