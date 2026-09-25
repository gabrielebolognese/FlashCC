import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  atSameTimeOn,
  byDay,
  cadenceDates,
  dayKey,
  mixOf,
  monthLabel,
  monthOf,
  nudgeFor,
  rhythmOf,
  SLOT_HOUR,
  slotOn,
  startOfWeek,
  weekLabel,
  undated,
  weekdayLoad,
  weekOf,
  whenOf,
} from "./calendar.js";
import { makePost, type Post } from "./pipeline.js";

/** A local date, built from parts, so no test depends on the runner's timezone. */
const at = (y: number, m: number, d: number, h = 9): Date => new Date(y, m - 1, d, h, 0, 0);

const scheduled = (when: Date, patch: Partial<Post> = {}): Post =>
  makePost({ stage: "scheduled", scheduledFor: when.toISOString(), ...patch });

describe("day keys", () => {
  it("is built from local parts, not from the UTC instant", () => {
    // 23:30 local on the 3rd is the 4th in UTC anywhere east of Greenwich, and
    // the 2nd anywhere west of it. The key has to say the 3rd either way.
    expect(dayKey(at(2026, 3, 3, 23))).toBe("2026-03-03");
    expect(dayKey(at(2026, 3, 3, 0))).toBe("2026-03-03");
  });

  it("pads, so keys sort as strings", () => {
    expect(dayKey(at(2026, 1, 5))).toBe("2026-01-05");
    expect(dayKey(at(2026, 1, 5)) < dayKey(at(2026, 1, 12))).toBe(true);
    expect(dayKey(at(2026, 9, 30)) < dayKey(at(2026, 10, 1))).toBe(true);
  });
});

describe("weeks start on Monday", () => {
  it("leaves a Monday alone", () => {
    // 2026-09-21 is a Monday.
    expect(dayKey(startOfWeek(at(2026, 9, 21)))).toBe("2026-09-21");
  });

  it("pulls a Sunday back six days, not forward one", () => {
    // 2026-09-27 is a Sunday. The naive (day - 1) puts it in the wrong week.
    expect(dayKey(startOfWeek(at(2026, 9, 27)))).toBe("2026-09-21");
  });

  it("crosses a month boundary backwards when the week does", () => {
    // 2026-10-01 is a Thursday, so its week begins in September.
    expect(dayKey(startOfWeek(at(2026, 10, 1)))).toBe("2026-09-28");
  });
});

describe("date arithmetic", () => {
  it("steps days across a month end and a leap day", () => {
    expect(dayKey(addDays(at(2026, 1, 31), 1))).toBe("2026-02-01");
    expect(dayKey(addDays(at(2028, 2, 28), 1))).toBe("2028-02-29");
    expect(dayKey(addDays(at(2026, 2, 28), 1))).toBe("2026-03-01");
  });

  it("does not skip a month when the anchor day does not exist in the next one", () => {
    // The bug this guards: setMonth on the 31st of March lands in May.
    expect(monthLabel(addMonths(at(2026, 3, 31), 1))).toBe("April 2026");
    expect(monthLabel(addMonths(at(2026, 1, 31), 1))).toBe("February 2026");
    expect(monthLabel(addMonths(at(2026, 12, 15), 1))).toBe("January 2027");
    expect(monthLabel(addMonths(at(2026, 1, 15), -1))).toBe("December 2025");
  });
});

describe("the grids", () => {
  it("gives a week seven days in order", () => {
    const week = weekOf(at(2026, 9, 24), at(2026, 9, 24));
    expect(week).toHaveLength(7);
    expect(week[0]!.key).toBe("2026-09-21");
    expect(week[6]!.key).toBe("2026-09-27");
  });

  it("always gives a month six rows of seven, whatever shape the month is", () => {
    for (const m of [1, 2, 5, 8, 12]) {
      const grid = monthOf(at(2026, m, 1), at(2026, m, 1));
      expect(grid).toHaveLength(6);
      for (const row of grid) expect(row).toHaveLength(7);
    }
  });

  it("starts the month grid on the Monday on or before the 1st", () => {
    // 2026-09-01 is a Tuesday, so the grid opens on 31 August.
    expect(monthOf(at(2026, 9, 10), at(2026, 9, 10))[0]![0]!.key).toBe("2026-08-31");
  });

  it("marks the borrowed days at both ends as outside the month", () => {
    const grid = monthOf(at(2026, 9, 10), at(2026, 9, 10));
    const flat = grid.flat();
    expect(flat[0]!.inMonth).toBe(false);
    expect(flat.filter((d) => d.inMonth)).toHaveLength(30);
    expect(flat.at(-1)!.inMonth).toBe(false);
  });

  it("knows today, and knows yesterday is behind it", () => {
    const grid = monthOf(at(2026, 9, 10), at(2026, 9, 10)).flat();
    const today = grid.filter((d) => d.isToday);
    expect(today).toHaveLength(1);
    expect(today[0]!.key).toBe("2026-09-10");
    // Today is not past. A day that counts as its own gap would be reported the
    // moment the calendar opens.
    expect(today[0]!.isPast).toBe(false);
    expect(grid.find((d) => d.key === "2026-09-09")!.isPast).toBe(true);
    expect(grid.find((d) => d.key === "2026-09-11")!.isPast).toBe(false);
  });
});

describe("grouping posts onto days", () => {
  it("keys on the local day, and puts the earliest slot first", () => {
    const evening = scheduled(at(2026, 9, 24, 19), { title: "evening" });
    const morning = scheduled(at(2026, 9, 24, 8), { title: "morning" });
    const map = byDay([evening, morning]);

    expect(map.get("2026-09-24")!.map((p) => p.title)).toEqual(["morning", "evening"]);
  });

  it("ignores posts with no date and dates that are not dates", () => {
    const map = byDay([
      makePost({ stage: "ready" }),
      makePost({ stage: "scheduled", scheduledFor: "not a date" }),
      scheduled(at(2026, 9, 24)),
    ]);

    expect(map.size).toBe(1);
  });
});

describe("what the grid says about the habit", () => {
  const today = at(2026, 9, 21); // a Monday

  it("counts what is there, and the empty days ahead", () => {
    const week = weekOf(today, today);
    const posts = byDay([scheduled(at(2026, 9, 22)), scheduled(at(2026, 9, 26))]);
    const r = rhythmOf(week, posts);

    expect(r.count).toBe(2);
    // Mon, Wed, Thu, Sat, Sun are empty. Tue and Fri are not.
    expect(r.gaps).toBe(5);
    // Wed, Thu and Fri in a row, then Saturday has one.
    expect(r.longestGap).toBe(3);
  });

  it("does not count a gap behind you", () => {
    const week = weekOf(at(2026, 9, 24), at(2026, 9, 24)); // a Thursday
    const r = rhythmOf(week, byDay([]));

    // Thu, Fri, Sat, Sun. Monday to Wednesday are gone and nobody can fill them.
    expect(r.gaps).toBe(4);
    expect(r.longestGap).toBe(4);
  });

  it("counts a past post, because it still happened", () => {
    const week = weekOf(at(2026, 9, 24), at(2026, 9, 24));
    const r = rhythmOf(week, byDay([scheduled(at(2026, 9, 22))]));

    expect(r.count).toBe(1);
    expect(r.gaps).toBe(4);
  });

  it("notices a month that only ever goes to one place", () => {
    const week = weekOf(today, today);
    const one = rhythmOf(
      week,
      byDay([scheduled(at(2026, 9, 22)), scheduled(at(2026, 9, 23))]),
    );
    const two = rhythmOf(
      week,
      byDay([
        scheduled(at(2026, 9, 22)),
        scheduled(at(2026, 9, 23), { platform: "instagram" }),
      ]),
    );

    expect(one.platforms).toBe(1);
    expect(two.platforms).toBe(2);
  });

  it("has nothing to say about an empty range with nothing ahead of it", () => {
    const week = weekOf(at(2026, 9, 21), at(2026, 12, 1));
    const r = rhythmOf(week, byDay([]));

    expect(r.count).toBe(0);
    expect(r.gaps).toBe(0);
    expect(r.longestGap).toBe(0);
  });
});

describe("weekday load", () => {
  it("is Monday first, and counts history as well as the queue", () => {
    const load = weekdayLoad([
      scheduled(at(2026, 9, 21)), // Monday
      scheduled(at(2026, 9, 28)), // Monday
      makePost({ stage: "posted", postedAt: at(2026, 9, 27).toISOString() }), // Sunday
      makePost({ stage: "ready" }),
    ]);

    expect(load).toEqual([2, 0, 0, 0, 0, 0, 1]);
  });
});

describe("a cadence, before it is committed to", () => {
  it("lands on the dates the run will use", () => {
    const dates = cadenceDates("2026-09-28", 3, 4).map(dayKey);
    expect(dates).toEqual(["2026-09-28", "2026-10-01", "2026-10-04", "2026-10-07"]);
  });

  it("starts at the slot hour, so the preview matches what gets saved", () => {
    expect(cadenceDates("2026-09-28", 1, 1)[0]!.getHours()).toBe(SLOT_HOUR);
  });

  it("treats a gap of zero as a day, because a batch cannot all post at once", () => {
    expect(cadenceDates("2026-09-28", 0, 2).map(dayKey)).toEqual([
      "2026-09-28",
      "2026-09-29",
    ]);
  });

  it("returns nothing for a date it cannot read", () => {
    expect(cadenceDates("", 1, 3)).toEqual([]);
    expect(cadenceDates("2026-09-28", 1, 0)).toEqual([]);
  });
});

describe("moving a post to another day", () => {
  it("keeps the time of day", () => {
    const moved = new Date(atSameTimeOn(at(2026, 9, 21, 19).toISOString(), "2026-09-24"));
    expect(dayKey(moved)).toBe("2026-09-24");
    expect(moved.getHours()).toBe(19);
  });

  it("falls back to the default slot when there was no time to keep", () => {
    expect(new Date(atSameTimeOn(null, "2026-09-24")).getHours()).toBe(SLOT_HOUR);
    expect(new Date(atSameTimeOn("rubbish", "2026-09-24")).getHours()).toBe(SLOT_HOUR);
  });

  it("agrees with slotOn for an undated post", () => {
    expect(atSameTimeOn(null, "2026-09-24")).toBe(slotOn("2026-09-24"));
  });
});

describe("which date a post sits on", () => {
  it("prefers the day it actually went out over the day it was due", () => {
    const slipped = makePost({
      stage: "posted",
      scheduledFor: at(2026, 9, 22).toISOString(),
      postedAt: at(2026, 9, 24).toISOString(),
    });

    expect(whenOf(slipped)).toBe(slipped.postedAt);
    expect([...byDay([slipped]).keys()]).toEqual(["2026-09-24"]);
  });

  it("collects the ones with no date at all, newest first", () => {
    const older = makePost({ stage: "ready", updatedAt: "2026-09-01T00:00:00.000Z" });
    const newer = makePost({ stage: "ready", updatedAt: "2026-09-20T00:00:00.000Z" });
    const dated = scheduled(at(2026, 9, 24));

    expect(undated([older, dated, newer]).map((p) => p.id)).toEqual([newer.id, older.id]);
  });
});

describe("what the range is made of", () => {
  const today = at(2026, 9, 21);
  const week = weekOf(today, today);

  const tagged = (day: number, pillar: string, objective: Post["objective"]) =>
    scheduled(at(2026, 9, day), { pillar, objective });

  it("ranks pillars by count, then alphabetically", () => {
    const mix = mixOf(
      week,
      byDay([
        tagged(21, "Education", "authority"),
        tagged(22, "Education", "authority"),
        tagged(23, "Behind the scenes", null),
        tagged(24, "Ask", "conversion"),
      ]),
    );

    expect(mix.pillars).toEqual([
      { name: "Education", count: 2 },
      { name: "Ask", count: 1 },
      { name: "Behind the scenes", count: 1 },
    ]);
    expect(mix.objectives.map((o) => o.label)).toEqual(["Authority", "Conversion"]);
  });

  it("does not guess that two spellings are one pillar", () => {
    const mix = mixOf(
      week,
      byDay([tagged(21, "Behind the scenes", null), tagged(22, "behind-the-scenes", null)]),
    );

    expect(mix.pillars).toHaveLength(2);
  });

  it("counts a post carrying neither as untagged, and one carrying either as not", () => {
    const mix = mixOf(
      week,
      byDay([
        scheduled(at(2026, 9, 21)),
        tagged(22, "", "awareness"),
        tagged(23, "Education", null),
      ]),
    );

    expect(mix.untagged).toBe(1);
  });
});

describe("the one line under the grid", () => {
  const today = at(2026, 9, 21);
  const week = weekOf(today, today);
  const empty = mixOf(week, byDay([]));

  it("says the plan is empty before it says anything else", () => {
    expect(nudgeFor(rhythmOf(week, byDay([])), empty)).toBe("Nothing on these days yet.");
  });

  it("names a long gap ahead", () => {
    const posts = byDay([scheduled(at(2026, 9, 21))]);
    expect(nudgeFor(rhythmOf(week, posts), mixOf(week, posts))).toBe(
      "6 empty days in a row ahead.",
    );
  });

  it("says when a range is all one pillar", () => {
    const posts = byDay([
      scheduled(at(2026, 9, 21), { pillar: "Education" }),
      scheduled(at(2026, 9, 22), { pillar: "Education" }),
      scheduled(at(2026, 9, 23), { pillar: "Education" }),
      scheduled(at(2026, 9, 24), { pillar: "Education" }),
      scheduled(at(2026, 9, 25), { pillar: "Education" }),
      scheduled(at(2026, 9, 26), { pillar: "Education" }),
      scheduled(at(2026, 9, 27), { pillar: "Education" }),
    ]);

    expect(nudgeFor(rhythmOf(week, posts), mixOf(week, posts))).toBe(
      "Every one of these is Education.",
    );
  });

  it("says nothing when there is nothing worth saying", () => {
    const posts = byDay([
      scheduled(at(2026, 9, 21), { pillar: "Education" }),
      scheduled(at(2026, 9, 22), { pillar: "Ask", platform: "instagram" }),
      scheduled(at(2026, 9, 24), { pillar: "Education" }),
      scheduled(at(2026, 9, 26), { pillar: "Ask" }),
    ]);

    expect(nudgeFor(rhythmOf(week, posts), mixOf(week, posts))).toBe(null);
  });
});

describe("labels", () => {
  it("names a week by its ends, and repeats the month only when it changes", () => {
    expect(weekLabel(at(2026, 9, 24))).toBe("21 Sep to 27");
    expect(weekLabel(at(2026, 10, 1))).toBe("28 Sep to 4 Oct");
  });

  it("names a month with its year, because a calendar gets paged a long way", () => {
    expect(monthLabel(at(2026, 9, 1))).toBe("September 2026");
  });
});
