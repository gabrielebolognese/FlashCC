import { describe, expect, it } from "vitest";

import { detectDelimiter, detectShape, looksDelimited, parseDelimited, parseSheet } from "./csv.js";

describe("the parser", () => {
  it("reads commas", () => {
    expect(parseDelimited("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  /** A spreadsheet paste is tab-separated, which is the common real case. */
  it("reads a spreadsheet paste", () => {
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(parseDelimited("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a comma inside a quoted field", () => {
    expect(parseDelimited('a,b\n"one, two",three')).toEqual([
      ["a", "b"],
      ["one, two", "three"],
    ]);
  });

  it("keeps a newline inside a quoted field", () => {
    const rows = parseDelimited('a,b\n"line one\nline two",x');
    expect(rows[1]?.[0]).toBe("line one\nline two");
    expect(rows).toHaveLength(2);
  });

  it("unescapes a doubled quote", () => {
    expect(parseDelimited('a\n"He said ""no"""')[1]?.[0]).toBe('He said "no"');
  });

  it("handles CRLF", () => {
    expect(parseDelimited("a,b\r\n1,2")).toHaveLength(2);
  });

  it("drops blank lines rather than producing empty carousels", () => {
    expect(parseDelimited("a,b\n\n1,2\n\n")).toHaveLength(2);
  });

  /** Prose is full of commas; one tab should still win. */
  it("does not let commas in prose outvote a real tab", () => {
    expect(detectDelimiter("post_id\ttext, with commas, here")).toBe("\t");
  });
});

describe("shape detection", () => {
  it("calls a grouped sheet long", () => {
    expect(detectShape(["post_id", "slide_index", "text"])).toBe("long");
    expect(detectShape(["Post", "Headline", "Body"])).toBe("long");
  });

  it("calls a slide-per-column sheet wide", () => {
    expect(detectShape(["Name", "Slide 1", "Slide 2", "Slide 3"])).toBe("wide");
    expect(detectShape(["slide1", "slide2"])).toBe("wide");
  });

  it("ignores spacing and case in header names", () => {
    expect(detectShape(["Post ID", "Slide Index", "Text"])).toBe("long");
  });
});

describe("long format", () => {
  const sheet = [
    "post_id,slide_index,text",
    "a,1,Why do your edits feel slow?",
    "a,2,Because the pacing never lands.",
    "a,3,Save this.",
    "b,1,A different hook entirely.",
    "b,2,And its body.",
  ].join("\n");

  it("groups rows into carousels", () => {
    const { shape, carousels } = parseSheet(sheet);
    expect(shape).toBe("long");
    expect(carousels).toHaveLength(2);
    expect(carousels[0]?.slides).toHaveLength(3);
    expect(carousels[1]?.slides).toHaveLength(2);
  });

  /** The whole reason long format exists. */
  it("produces carousels of different lengths from one file", () => {
    const lengths = parseSheet(sheet).carousels.map((c) => c.slides.length);
    expect(new Set(lengths).size).toBeGreaterThan(1);
  });

  it("orders slides by the index column, not by file order", () => {
    const jumbled = ["post_id,slide_index,text", "a,3,third", "a,1,first", "a,2,second"].join("\n");
    expect(parseSheet(jumbled).carousels[0]?.slides).toEqual(["first", "second", "third"]);
  });

  it("falls back to file order when there is no index column", () => {
    const noOrder = ["post,text", "a,first", "a,second", "a,third"].join("\n");
    expect(parseSheet(noOrder).carousels[0]?.slides).toEqual(["first", "second", "third"]);
  });

  it("joins a headline and a body into one slide, as two lines", () => {
    const two = ["post_id,headline,body", "a,The point,The evidence for it"].join("\n");
    expect(parseSheet(two).carousels[0]?.slides[0]).toBe("The point\nThe evidence for it");
  });

  /** Losing somebody's words is worse than including a column they did not mean. */
  it("includes an unrecognised column rather than dropping it", () => {
    const extra = ["post_id,text,footnote", "a,Main copy,And a note"].join("\n");
    expect(parseSheet(extra).carousels[0]?.slides[0]).toContain("And a note");
  });

  it("takes the name from a name column when there is one", () => {
    const named = ["post_id,name,text", "a,Client work,Some copy"].join("\n");
    expect(parseSheet(named).carousels[0]?.name).toBe("Client work");
  });

  it("names it from the hook when there is not", () => {
    expect(parseSheet(sheet).carousels[0]?.name).toContain("edits");
  });
});

describe("wide format", () => {
  const sheet = [
    "Name,Slide 1,Slide 2,Slide 3,Slide 4",
    "First,Hook one,Body one,Close one,",
    "Second,Hook two,Body two,Middle two,Close two",
  ].join("\n");

  it("makes one carousel per row", () => {
    const { shape, carousels } = parseSheet(sheet);
    expect(shape).toBe("wide");
    expect(carousels).toHaveLength(2);
  });

  /**
   * The specific pain of a fixed-width sheet: a shorter idea leaves trailing
   * blanks that Canva turns into empty slides you delete by hand in every
   * output. Dropping them is what gives variable slide count back.
   */
  it("drops trailing blanks instead of making empty slides", () => {
    const { carousels } = parseSheet(sheet);
    expect(carousels[0]?.slides).toHaveLength(3);
    expect(carousels[1]?.slides).toHaveLength(4);
  });

  it("orders by the column number, not by file position", () => {
    const jumbled = ["Slide 3,Slide 1,Slide 2", "third,first,second"].join("\n");
    expect(parseSheet(jumbled).carousels[0]?.slides).toEqual(["first", "second", "third"]);
  });

  it("treats every column as a slide when none are numbered", () => {
    const plain = ["a,b,c", "one,two,three"].join("\n");
    expect(parseSheet(plain).carousels[0]?.slides).toEqual(["one", "two", "three"]);
  });

  it("uses the name column and keeps it out of the slides", () => {
    const { carousels } = parseSheet(sheet);
    expect(carousels[0]?.name).toBe("First");
    expect(carousels[0]?.slides).not.toContain("First");
  });
});

describe("warnings", () => {
  it("names a column that is entirely empty", () => {
    const sheet = ["post_id,text,notes", "a,Some copy,", "a,More copy,"].join("\n");
    expect(parseSheet(sheet).warnings.join(" ")).toContain("notes");
  });

  /** The "I expected carousels and got singles" case, said before generation. */
  it("says so when every row came out one slide long", () => {
    const sheet = ["Name,Description", "One,Just a line", "Two,Another line"].join("\n");
    const { warnings } = parseSheet(sheet);
    expect(warnings.join(" ")).toMatch(/one slide long/i);
  });

  it("stays quiet on a healthy sheet", () => {
    const sheet = ["post_id,text", "a,One", "a,Two", "b,Three", "b,Four"].join("\n");
    expect(parseSheet(sheet).warnings).toEqual([]);
  });
});

describe("edges", () => {
  it("returns nothing rather than throwing on an empty string", () => {
    expect(parseSheet("").carousels).toEqual([]);
  });

  it("returns nothing on a header row with no data", () => {
    expect(parseSheet("post_id,text").carousels).toEqual([]);
  });

  it("skips rows with no text at all", () => {
    const sheet = ["post_id,text", "a,Real copy", "b,", "c,   "].join("\n");
    expect(parseSheet(sheet).carousels).toHaveLength(1);
  });

  it("knows a sheet from a plain-text paste", () => {
    expect(looksDelimited("post_id,slide,text")).toBe(true);
    expect(looksDelimited("a\tb")).toBe(true);
    expect(looksDelimited("Your videos feel boring. Here's why.")).toBe(false);
  });
});
