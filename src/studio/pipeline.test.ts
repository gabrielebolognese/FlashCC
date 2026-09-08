import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { makeDoc, type Doc } from "./model.js";
import { THEMES } from "./presets.js";
import {
  awaitingMetrics,
  EMPTY_METRICS,
  engagementRate,
  engagements,
  hookOf,
  isMeasured,
  makePost,
  markPosted,
  moveTo,
  overdue,
  postFromDoc,
  schedule,
  setMetrics,
  upcoming,
  type Post,
} from "./pipeline.js";

const withMetrics = (patch: Partial<Post> = {}): Post =>
  makePost({
    stage: "posted",
    postedAt: "2026-01-10T09:00:00.000Z",
    metrics: { ...EMPTY_METRICS, impressions: 1000, likes: 40 },
    ...patch,
  });

describe("posts", () => {
  it("snapshots the structure off the document rather than pointing at it", () => {
    const doc: Doc = {
      ...makeDoc("Client work"),
      framework: "showcase",
      styleId: "ink",
      slides: buildSlides(["The hook goes here.", "A body slide."], THEMES.ink!),
    };
    const post = postFromDoc(doc, "instagram");

    expect(post.framework).toBe("showcase");
    expect(post.styleId).toBe("ink");
    expect(post.platform).toBe("instagram");
    expect(post.slideCount).toBe(doc.slides.length);
    expect(post.hook.length).toBeGreaterThan(0);

    // The document keeps changing; the record of what went out must not.
    doc.framework = "story";
    expect(post.framework).toBe("showcase");
  });

  it("reads the hook off the first slide, skipping empty layers", () => {
    const doc = { ...makeDoc(), slides: buildSlides(["Stop editing like this.", "Body."], THEMES.ink!) };
    expect(hookOf(doc)).toContain("Stop editing");
  });

  it("survives a document with no slides at all", () => {
    expect(hookOf({ ...makeDoc(), slides: [] })).toBe("");
  });
});

describe("transitions", () => {
  it("stamps a date when a post goes live", () => {
    expect(moveTo(makePost(), "posted").postedAt).not.toBeNull();
  });

  it("keeps the original date when it was already scheduled", () => {
    const when = "2026-02-01T10:00:00.000Z";
    expect(markPosted(schedule(makePost(), when)).postedAt).toBe(when);
  });

  /**
   * The trap this guards: a post dragged back out of Posted that keeps its date would
   * still satisfy every "did this go live" check downstream, and would go on feeding
   * the baseline from the drafting column where nobody would ever look for it.
   */
  it("clears the posted date when a post is moved back out of posted", () => {
    const live = moveTo(makePost(), "posted");
    const back = moveTo(live, "drafting");
    expect(back.postedAt).toBeNull();
    expect(isMeasured(back)).toBe(false);
  });

  it("is a no-op when the stage did not change", () => {
    const p = makePost();
    expect(moveTo(p, "idea")).toBe(p);
  });
});

describe("isMeasured", () => {
  it("accepts a live post with real reach", () => {
    expect(isMeasured(withMetrics())).toBe(true);
  });

  it("rejects a live post nobody has typed numbers into", () => {
    expect(isMeasured(makePost({ stage: "posted", postedAt: "2026-01-01T00:00:00.000Z" }))).toBe(false);
  });

  /** Every ratio downstream divides by reach, so zero has to be turned away here. */
  it("rejects zero reach rather than admitting a division by zero", () => {
    expect(isMeasured(withMetrics({ metrics: { ...EMPTY_METRICS, likes: 5 } }))).toBe(false);
  });

  it("rejects a scheduled post even if it somehow carries metrics", () => {
    expect(isMeasured(withMetrics({ stage: "scheduled" }))).toBe(false);
  });
});

describe("engagement", () => {
  it("adds the four interaction kinds and nothing else", () => {
    const m = { ...EMPTY_METRICS, likes: 10, comments: 5, shares: 3, saves: 2, follows: 99, clicks: 99 };
    expect(engagements(m)).toBe(20);
  });

  it("returns zero rather than Infinity when nothing was seen", () => {
    expect(engagementRate({ ...EMPTY_METRICS, likes: 4 })).toBe(0);
  });
});

describe("queues", () => {
  it("orders the schedule soonest first and sinks undated posts to the bottom", () => {
    const list = [
      makePost({ stage: "scheduled", scheduledFor: "2026-03-05T00:00:00.000Z", title: "b" }),
      makePost({ stage: "scheduled", scheduledFor: null, title: "undated" }),
      makePost({ stage: "scheduled", scheduledFor: "2026-03-01T00:00:00.000Z", title: "a" }),
    ];
    expect(upcoming(list).map((p) => p.title)).toEqual(["a", "b", "undated"]);
  });

  it("flags only scheduled posts whose slot has already passed", () => {
    const at = new Date("2026-03-03T00:00:00.000Z");
    const list = [
      makePost({ stage: "scheduled", scheduledFor: "2026-03-01T00:00:00.000Z", title: "late" }),
      makePost({ stage: "scheduled", scheduledFor: "2026-03-09T00:00:00.000Z", title: "soon" }),
      makePost({ stage: "scheduled", scheduledFor: null, title: "undated" }),
      makePost({ stage: "posted", postedAt: "2026-03-01T00:00:00.000Z", title: "done" }),
    ];
    expect(overdue(list, at).map((p) => p.title)).toEqual(["late"]);
  });

  it("lists live posts that still need their numbers, and drops them once entered", () => {
    const bare = makePost({ stage: "posted", postedAt: "2026-01-02T00:00:00.000Z" });
    expect(awaitingMetrics([bare, withMetrics()])).toHaveLength(1);
    expect(awaitingMetrics([setMetrics(bare, { ...EMPTY_METRICS, impressions: 10 })])).toHaveLength(0);
  });
});
