import { describe, expect, it } from "vitest";

import { makePost, type Post } from "./pipeline.js";
import {
  cadenceById,
  collectSeries,
  crossReferenceText,
  dueParts,
  inSeries,
  makeSeries,
  MOMENTUM_DAYS,
  nextPart,
  renumber,
  seriesCaption,
  seriesIds,
  seriesTitle,
  spread,
  STALE_DAYS,
  type SeriesMember,
  type SeriesView,
} from "./series.js";

const member = (id: string, name: string, part?: number, seriesId = "s1"): SeriesMember => ({
  id,
  name,
  ...(part ? { series: { id: seriesId, part } } : {}),
});

const post = (patch: Partial<Post>): Post => makePost(patch);

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

describe("forming a series", () => {
  it("numbers from one in the order given", () => {
    const out = makeSeries([member("a", "A"), member("b", "B"), member("c", "C")]);
    expect(out.map((m) => m.series?.part)).toEqual([1, 2, 3]);
  });

  it("gives every part the same id", () => {
    const out = makeSeries([member("a", "A"), member("b", "B")]);
    expect(new Set(out.map((m) => m.series?.id)).size).toBe(1);
  });

  /** "Part 10" before "Part 2" is what guessing from names gets you. */
  it("uses the caller's order rather than sorting by name", () => {
    const out = makeSeries([member("z", "Part 10"), member("a", "Part 2")]);
    expect(out[0]?.name).toBe("Part 10");
    expect(out[0]?.series?.part).toBe(1);
  });
});

describe("renumbering", () => {
  it("closes the gap a deleted part leaves", () => {
    const out = renumber([member("a", "A", 1), member("b", "B", 2), member("d", "D", 4)]);
    expect(out.map((m) => m.series?.part)).toEqual([1, 2, 3]);
  });

  it("breaks a tie in place order rather than arbitrarily", () => {
    const out = renumber([member("a", "A", 2), member("b", "B", 2)]);
    expect(out.find((m) => m.id === "a")?.series?.part).toBe(1);
    expect(out.find((m) => m.id === "b")?.series?.part).toBe(2);
  });

  /** It fixes numbers. It does not rearrange anybody's grid. */
  it("returns them in the order they came in", () => {
    const out = renumber([member("c", "C", 3), member("a", "A", 1)]);
    expect(out.map((m) => m.id)).toEqual(["c", "a"]);
  });

  it("is idempotent", () => {
    const once = renumber([member("a", "A", 1), member("b", "B", 5)]);
    expect(renumber(once)).toEqual(once);
  });

  it("keeps the existing series id", () => {
    const out = renumber([member("a", "A", 2, "keep-me")]);
    expect(out[0]?.series?.id).toBe("keep-me");
  });
});

describe("reading a series back", () => {
  const members = [member("a", "A", 1), member("b", "B", 2), member("x", "Loner")];

  it("lists only its own parts, in order", () => {
    expect(inSeries(members, "s1").map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("knows what comes next", () => {
    expect(nextPart(members, "s1")).toBe(3);
    expect(nextPart(members, "unknown")).toBe(1);
  });

  it("finds every distinct series once", () => {
    expect(seriesIds([...members, member("c", "C", 1, "s2")])).toEqual(["s1", "s2"]);
  });

  it("joins parts to what the pipeline knows", () => {
    const posts = [post({ docId: "a", url: "https://x/1", postedAt: ago(2) })];
    const view = collectSeries(members, posts)[0];
    expect(view?.parts[0]?.url).toBe("https://x/1");
    expect(view?.posted).toBe(1);
  });

  /** Queued twice happens; showing the stale URL is the silent failure. */
  it("prefers the most recently updated post when a doc has two", () => {
    const posts = [
      post({ docId: "a", url: "https://old", updatedAt: "2026-01-01T00:00:00.000Z" }),
      post({ docId: "a", url: "https://new", updatedAt: "2026-06-01T00:00:00.000Z" }),
    ];
    expect(collectSeries(members, posts)[0]?.parts[0]?.url).toBe("https://new");
  });

  it("takes its name from the lowest part, so a deleted part 1 does not blank it", () => {
    const view = collectSeries([member("b", "Second", 2), member("c", "Third", 3)], [])[0];
    expect(view?.name).toBe("Second");
  });
});

/* ── the discovery fix ────────────────────────────────────────────────────── */

const view = (parts: SeriesView["parts"]): SeriesView => ({
  id: "s1",
  name: parts[0]?.title ?? "",
  parts,
  posted: parts.filter((p) => p.postedAt).length,
});

const part = (n: number, patch: Partial<SeriesView["parts"][number]> = {}) => ({
  docId: `d${n}`,
  part: n,
  title: `Part ${n} title`,
  url: null,
  postedAt: null,
  scheduledFor: null,
  ...patch,
});

describe("the caption that makes a series findable", () => {
  const v = view([
    part(1, { url: "https://x/1", postedAt: ago(9) }),
    part(2, { url: "https://x/2", postedAt: ago(5) }),
    part(3),
  ]);

  it("lists every part with its number and the total", () => {
    const text = seriesCaption(v);
    expect(text).toContain("1/3");
    expect(text).toContain("3/3");
  });

  it("carries the real URL of anything already live", () => {
    expect(seriesCaption(v)).toContain("https://x/2");
  });

  /** An audience that can see part 3 is coming will wait for it. */
  it("still lists a part that has not gone out, marked as coming", () => {
    expect(seriesCaption(v)).toContain("(coming)");
  });

  it("marks where the reader is", () => {
    expect(seriesCaption(v, { current: 2 })).toContain("← you are here");
    expect(seriesCaption(v, { current: 2 }).match(/you are here/g)).toHaveLength(1);
  });

  it("is empty for a series with no parts rather than a stray heading", () => {
    expect(seriesCaption(view([]))).toBe("");
  });

  it("writes a short cross-reference for the artwork", () => {
    expect(crossReferenceText(1, 5)).toContain("Part 1 of 5");
    expect(crossReferenceText(5, 5)).toContain("parts 1–4");
    expect(crossReferenceText(3, 5)).toContain("the others");
  });

  it("says nothing about a series of one", () => {
    expect(crossReferenceText(1, 1)).toBe("");
  });

  it("titles a part without decorating a standalone carousel", () => {
    expect(seriesTitle("Edits", 2, 5)).toBe("Edits (2/5)");
    expect(seriesTitle("Edits", 1, 1)).toBe("Edits");
  });
});

/* ── momentum ─────────────────────────────────────────────────────────────── */

describe("which series are losing momentum", () => {
  it("reports a next part once the gap opens up", () => {
    const v = view([part(1, { postedAt: ago(5) }), part(2)]);
    const due = dueParts([v]);
    expect(due).toHaveLength(1);
    expect(due[0]?.part.part).toBe(2);
    expect(due[0]?.daysSince).toBe(5);
  });

  it("stays quiet while the gap is still short", () => {
    expect(dueParts([view([part(1, { postedAt: ago(MOMENTUM_DAYS - 1) }), part(2)])])).toEqual([]);
  });

  /** Unstarted is not the same as losing momentum, and nagging makes it noise. */
  it("ignores a series nothing has been published from", () => {
    expect(dueParts([view([part(1), part(2)])])).toEqual([]);
  });

  /** The decision has been made; repeating it is a complaint, not a reminder. */
  it("ignores a next part that is already scheduled", () => {
    const v = view([part(1, { postedAt: ago(9) }), part(2, { scheduledFor: ago(-1) })]);
    expect(dueParts([v])).toEqual([]);
  });

  it("says nothing when the whole series is out", () => {
    expect(dueParts([view([part(1, { postedAt: ago(9) }), part(2, { postedAt: ago(4) })])])).toEqual([]);
  });

  it("marks the long-abandoned ones", () => {
    const v = view([part(1, { postedAt: ago(STALE_DAYS + 2) }), part(2)]);
    expect(dueParts([v])[0]?.stale).toBe(true);
  });

  it("puts the most overdue first", () => {
    const a = { ...view([part(1, { postedAt: ago(4) }), part(2)]), id: "a" };
    const b = { ...view([part(1, { postedAt: ago(20) }), part(2)]), id: "b" };
    expect(dueParts([a, b]).map((d) => d.seriesId)).toEqual(["b", "a"]);
  });

  it("measures from the most recent live part, not from part one", () => {
    const v = view([part(1, { postedAt: ago(40) }), part(2, { postedAt: ago(4) }), part(3)]);
    expect(dueParts([v])[0]?.daysSince).toBe(4);
  });
});

/* ── cadence ──────────────────────────────────────────────────────────────── */

describe("spreading a series over the calendar", () => {
  const from = new Date(2026, 8, 22, 9, 0);

  it("puts one a day by default", () => {
    const out = spread([part(1), part(2), part(3)], from);
    const days = out.map((o) => new Date(o.scheduledFor).getDate());
    expect(days).toEqual([22, 23, 24]);
  });

  it("honours the cadence asked for", () => {
    const out = spread([part(1), part(2)], from, "weekly");
    expect(new Date(out[1]?.scheduledFor ?? "").getDate()).toBe(29);
  });

  /** Whoever picked 09:00 for part 1 meant it for the series. */
  it("keeps the time of day across every part", () => {
    for (const o of spread([part(1), part(2), part(3)], from, "every-other")) {
      expect(new Date(o.scheduledFor).getHours()).toBe(9);
    }
  });

  it("skips anything already posted rather than rewriting history", () => {
    const out = spread([part(1, { postedAt: ago(3) }), part(2), part(3)], from);
    expect(out.map((o) => o.docId)).toEqual(["d2", "d3"]);
    expect(new Date(out[0]?.scheduledFor ?? "").getDate()).toBe(22);
  });

  it("falls back to a real cadence on an unknown id", () => {
    expect(cadenceById("nonsense").days).toBeGreaterThan(0);
  });
});
