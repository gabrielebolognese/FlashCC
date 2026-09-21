import { describe, expect, it } from "vitest";

import { live, mergeEntries, type Entry } from "./sync.js";

const at = (n: number): string => `2026-01-${String(n).padStart(2, "0")}T00:00:00.000Z`;

const edit = (id: string, day: number, note = "v"): Entry<string> => ({
  id,
  updatedAt: at(day),
  value: `${note}${day}`,
});

const gone = (id: string, day: number): Entry<string> => ({
  id,
  updatedAt: at(day),
  value: null,
});

describe("mergeEntries", () => {
  it("pushes what only the browser has", () => {
    const r = mergeEntries([edit("a", 5)], []);
    expect(r.toPush.map((e) => e.id)).toEqual(["a"]);
    expect(r.toApply).toEqual([]);
  });

  it("applies what only the server has", () => {
    const r = mergeEntries([], [edit("a", 5)]);
    expect(r.toApply.map((e) => e.id)).toEqual(["a"]);
    expect(r.toPush).toEqual([]);
  });

  it("keeps the newer of the two", () => {
    expect(mergeEntries([edit("a", 9)], [edit("a", 3)]).toPush).toHaveLength(1);
    expect(mergeEntries([edit("a", 3)], [edit("a", 9)]).toApply).toHaveLength(1);
  });

  it("does nothing when both sides already agree", () => {
    const r = mergeEntries([edit("a", 5)], [edit("a", 5)]);
    expect(r.toPush).toEqual([]);
    expect(r.toApply).toEqual([]);
    expect(r.merged).toHaveLength(1);
  });

  /** Running it twice with nothing changed in between has to be free. */
  it("is idempotent", () => {
    const local = [edit("a", 5), edit("b", 6)];
    const remote = [edit("a", 5), edit("c", 7)];
    const first = mergeEntries(local, remote);
    const second = mergeEntries(first.merged, first.merged);
    expect(second.toPush).toEqual([]);
    expect(second.toApply).toEqual([]);
  });

  it("merges disjoint sets in both directions at once", () => {
    const r = mergeEntries([edit("a", 5)], [edit("b", 5)]);
    expect(r.merged).toHaveLength(2);
    expect(r.toPush.map((e) => e.id)).toEqual(["a"]);
    expect(r.toApply.map((e) => e.id)).toEqual(["b"]);
  });
});

describe("deletions", () => {
  /**
   * The bug this exists to stop: delete a project on the laptop, then sync the
   * phone, which still holds the row and has never heard otherwise. Without the
   * deletion carrying a timestamp of its own it is indistinguishable from "the
   * phone has something the server lacks", and the project comes back — every
   * time the two devices meet.
   */
  it("lets a delete beat the edit it followed", () => {
    const r = mergeEntries([gone("a", 9)], [edit("a", 3)]);
    expect(r.toPush).toHaveLength(1);
    expect(r.toPush[0]!.value).toBeNull();
    expect(live(r.merged)).toEqual([]);
  });

  it("applies a delete that happened on another device", () => {
    const r = mergeEntries([edit("a", 3)], [gone("a", 9)]);
    expect(r.toApply).toHaveLength(1);
    expect(r.toApply[0]!.value).toBeNull();
    expect(live(r.merged)).toEqual([]);
  });

  /** Deleting then remaking under the same id has to survive the round trip. */
  it("lets a later edit beat an earlier delete", () => {
    const r = mergeEntries([edit("a", 9, "remade")], [gone("a", 4)]);
    expect(r.toPush).toHaveLength(1);
    expect(live(r.merged)).toEqual(["remade9"]);
  });

  it("stays deleted once both sides know", () => {
    const r = mergeEntries([gone("a", 9)], [gone("a", 9)]);
    expect(r.toPush).toEqual([]);
    expect(r.toApply).toEqual([]);
    expect(live(r.merged)).toEqual([]);
  });

  it("does not resurrect across a second round trip", () => {
    const first = mergeEntries([gone("a", 9)], [edit("a", 3)]);
    // The server now holds the tombstone; the phone syncs next, still holding the row.
    const phone = mergeEntries([edit("a", 3)], first.merged);
    expect(live(phone.merged)).toEqual([]);
  });
});

describe("live", () => {
  it("drops deletions and keeps the rest in order", () => {
    expect(live([edit("a", 1), gone("b", 2), edit("c", 3)])).toEqual(["v1", "v3"]);
  });
});
