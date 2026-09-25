import { describe, expect, it } from "vitest";

import { sourcesFrom } from "./angles.js";
import { ANGLES_SYSTEM, assembleAngles, MAX_IDEA_CHARS } from "./prompts.js";

const result = (content: unknown) => ({ type: "web_search_tool_result", content });
const page = (url: string, title?: string) => ({ type: "web_search_result", url, title });

describe("reading what the search returned", () => {
  it("collects the pages", () => {
    const out = sourcesFrom([result([page("https://a.com", "A"), page("https://b.com", "B")])]);
    expect(out.sources).toEqual([
      { title: "A", url: "https://a.com" },
      { title: "B", url: "https://b.com" },
    ]);
    expect(out.searches).toBe(1);
  });

  /**
   * The branch this function exists for. A web search error arrives as HTTP 200
   * with `content` as an error OBJECT where a success is an ARRAY, so indexing
   * before checking turns a failed search into a crash in the middle of a
   * fourteen step run.
   */
  it("survives an error, which is an object where success is a list", () => {
    const out = sourcesFrom([result({ type: "web_search_tool_result_error", error_code: "max_uses_exceeded" })]);
    expect(out.sources).toEqual([]);
    expect(out.searches).toBe(1);
  });

  it("keeps the good searches when one of them failed", () => {
    const out = sourcesFrom([
      result([page("https://a.com", "A")]),
      result({ error_code: "unavailable" }),
      result([page("https://c.com", "C")]),
    ]);
    expect(out.sources.map((s) => s.url)).toEqual(["https://a.com", "https://c.com"]);
    expect(out.searches).toBe(3);
  });

  it("counts searches, not pages", () => {
    const out = sourcesFrom([result([page("https://a.com"), page("https://b.com"), page("https://c.com")])]);
    expect(out.searches).toBe(1);
    expect(out.sources).toHaveLength(3);
  });

  it("drops a duplicate url rather than listing it twice", () => {
    const out = sourcesFrom([result([page("https://a.com", "A"), page("https://a.com", "A again")])]);
    expect(out.sources).toHaveLength(1);
  });

  /** A source with no link is not a source anybody can check. */
  it("drops a result with no url", () => {
    const out = sourcesFrom([result([{ type: "web_search_result", title: "No link" }])]);
    expect(out.sources).toEqual([]);
  });

  it("falls back to the url when a page has no title", () => {
    const out = sourcesFrom([result([page("https://a.com")])]);
    expect(out.sources[0]?.title).toBe("https://a.com");
  });

  it("ignores blocks that are not search results", () => {
    const out = sourcesFrom([{ type: "text", text: "hello" }, { type: "thinking" }]);
    expect(out).toEqual({ sources: [], searches: 0 });
  });

  it("survives nothing at all", () => {
    expect(sourcesFrom([])).toEqual({ sources: [], searches: 0 });
  });
});

describe("the angles request", () => {
  const out = assembleAngles({ idea: "Cutting on the beat makes edits feel mechanical", count: 3 });

  it("is byte identical in the system block whatever the idea", () => {
    const other = assembleAngles({ idea: "Something else entirely", count: 5 });
    expect(out.system).toBe(other.system);
    expect(out.system).toBe(ANGLES_SYSTEM);
  });

  /**
   * The point of searching is that the result is about the world rather than
   * about the idea's phrasing. An angle writable without searching wasted a slot.
   */
  it("insists every angle is grounded in something found", () => {
    expect(ANGLES_SYSTEM).toContain("Ground every angle in something you actually found");
    expect(ANGLES_SYSTEM).toContain("not worth one of the slots");
  });

  it("forbids stating a figure it did not find", () => {
    expect(ANGLES_SYSTEM).toContain("Never state a figure");
  });

  it("says to return fewer rather than pad", () => {
    expect(ANGLES_SYSTEM).toContain("return fewer angles");
  });

  it("asks for the count it was given, and for search first", () => {
    expect(out.user).toContain("3 distinct carousel angles");
    expect(out.user).toContain("Search the web");
  });

  it("gets the singular right", () => {
    expect(assembleAngles({ idea: "x".repeat(20), count: 1 }).user).toContain("1 distinct carousel angle.");
  });

  it("clips an idea long enough to be a mistake", () => {
    const long = assembleAngles({ idea: "x".repeat(5000), count: 3 });
    expect(long.user.length).toBeLessThan(MAX_IDEA_CHARS + 300);
  });

  it("carries voice in the user message, never the system block", () => {
    const voiced = assembleAngles({ idea: "x".repeat(20), count: 3, voice: { tone: "Blunt" } });
    expect(voiced.user).toContain("Blunt");
    expect(voiced.system).not.toContain("Blunt");
  });
});
