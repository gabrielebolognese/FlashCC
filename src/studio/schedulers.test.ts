import { describe, expect, it } from "vitest";

import {
  altFromTexts,
  buildSheet,
  schedulerById,
  SCHEDULERS,
  splitWhen,
  toCsv,
  type PublishedCarousel,
} from "./schedulers.js";

const carousel = (patch: Partial<PublishedCarousel> = {}): PublishedCarousel => ({
  id: "d1",
  name: "Five ways to fail",
  caption: "A hook that earns the swipe.",
  urls: ["https://cdn/1.jpg", "https://cdn/2.jpg", "https://cdn/3.jpg"],
  alts: ["One", "Two", "Three"],
  platform: "linkedin",
  scheduledFor: null,
  ...patch,
});

/** Header → value, so a test reads like the spreadsheet rather than like an index. */
function cells(schedulerId: string, item: PublishedCarousel): Record<string, string> {
  const scheduler = schedulerById(schedulerId);
  const row = scheduler.row(item);
  const out: Record<string, string> = {};
  scheduler.columns.forEach((c, i) => {
    out[c] = row[i] ?? "";
  });
  return out;
}

describe("every dialect", () => {
  it("emits exactly one value per column", () => {
    for (const s of SCHEDULERS) {
      expect(s.row(carousel())).toHaveLength(s.columns.length);
    }
  });

  it("has no duplicate column names", () => {
    for (const s of SCHEDULERS) {
      expect(new Set(s.columns).size).toBe(s.columns.length);
    }
  });

  it("falls back to Metricool rather than throwing on an unknown id", () => {
    expect(schedulerById("nope").id).toBe("metricool");
  });
});

/**
 * The three tools disagree about the ONE field that matters, and two of them are
 * exact opposites. These are the tests that stop a refactor quietly making them
 * all the same.
 */
describe("the URLs, which is where they all differ", () => {
  it("Metricool takes one URL per column and never one cell", () => {
    const row = cells("metricool", carousel());
    expect(row["Picture Url 1"]).toBe("https://cdn/1.jpg");
    expect(row["Picture Url 3"]).toBe("https://cdn/3.jpg");
    expect(row["Picture Url 4"]).toBe("");
    // The template says this in so many words.
    expect(row["Picture Url 1"]).not.toContain(",");
  });

  it("Publer takes them comma separated in one cell", () => {
    expect(cells("publer", carousel({ platform: "instagram" }))["Media URLs"]).toBe(
      "https://cdn/1.jpg,https://cdn/2.jpg,https://cdn/3.jpg",
    );
  });

  it("ContentStudio takes them NEWLINE separated in one cell", () => {
    const value = cells("contentstudio", carousel())["Media URLs"] ?? "";
    expect(value.split("\n")).toHaveLength(3);
    expect(value).not.toContain(",");
  });

  it("caps at ten, because no publishing API takes more", () => {
    const many = carousel({ urls: Array.from({ length: 14 }, (_, i) => `https://cdn/${i}.jpg`) });
    expect(cells("metricool", many)["Picture Url 10"]).toBe("https://cdn/9.jpg");
    expect((cells("publer", many)["Media URLs"] ?? "").split(",")).toHaveLength(10);
  });
});

describe("the platform, which each one spells differently", () => {
  it("Metricool uses a boolean per network", () => {
    const row = cells("metricool", carousel({ platform: "instagram" }));
    expect(row["Instagram"]).toBe("TRUE");
    expect(row["Linkedin"]).toBe("FALSE");
  });

  /** Hand it image URLs and it builds the LinkedIn document post itself. */
  it("Metricool turns its LinkedIn carousel switch on for a LinkedIn deck", () => {
    expect(cells("metricool", carousel())["LinkedIn Images as Carousel"]).toBe("TRUE");
    expect(
      cells("metricool", carousel({ platform: "instagram" }))["LinkedIn Images as Carousel"],
    ).toBe("FALSE");
  });

  it("ContentStudio needs its literal enum", () => {
    expect(cells("contentstudio", carousel())["Post Type"]).toBe("LinkedIn Carousel");
    expect(cells("contentstudio", carousel({ platform: "instagram" }))["Post Type"]).toBe(
      "Instagram Carousel",
    );
  });

  /** `Post subtype` accepts PDF, which is the shape LinkedIn wanted all along. */
  it("Publer sends a LinkedIn deck as the finished document when there is one", () => {
    const withPdf = carousel({ documentUrl: "https://cdn/deck.pdf" });
    expect(cells("publer", withPdf)["Type"]).toBe("pdf");
    expect(cells("publer", withPdf)["Media URLs"]).toBe("https://cdn/deck.pdf");
  });

  it("Publer sends pictures when there is no document", () => {
    expect(cells("publer", carousel())["Type"]).toBe("carousel");
  });
});

describe("alt text", () => {
  it("Publer takes it in one cell, double-pipe separated, in slide order", () => {
    expect(cells("publer", carousel())["Alt Texts"]).toBe("One||Two||Three");
  });

  it("Metricool takes one per column, aligned with its picture", () => {
    const row = cells("metricool", carousel());
    expect(row["Alt Text 2"]).toBe("Two");
    expect(row["Alt Text 4"]).toBe("");
  });

  it("ContentStudio has nowhere to put it, and says so rather than dropping it silently", () => {
    const sheet = buildSheet(schedulerById("contentstudio"), [carousel()]);
    expect(sheet.warnings.join(" ")).toContain("alt text");
  });

  it("is written from the words on the slide rather than left empty", () => {
    expect(altFromTexts(["Five ways to fail"], 0, 5)).toBe("Five ways to fail");
  });

  it("falls back to a position when a slide has no words", () => {
    expect(altFromTexts(["  "], 2, 5)).toBe("Slide 3 of 5");
  });

  it("is trimmed rather than allowed to run past what any field takes", () => {
    expect(altFromTexts(["word ".repeat(200)], 0, 1).length).toBeLessThanOrEqual(240);
  });
});

describe("dates", () => {
  it("splits into the separate date and time columns these tools use", () => {
    // Local time on purpose: a scheduler's grid is in the user's own day.
    const at = new Date(2026, 8, 22, 9, 5);
    expect(splitWhen(at.toISOString())).toEqual({ date: "2026-09-22", time: "09:05" });
  });

  it("leaves both blank when there is no date, rather than inventing one", () => {
    expect(splitWhen(null)).toEqual({ date: "", time: "" });
    expect(splitWhen("not a date")).toEqual({ date: "", time: "" });
  });
});

describe("the file itself", () => {
  it("quotes every field, because one format puts newlines inside cells", () => {
    expect(toCsv(["A"], [["x"]])).toBe('"A"\r\n"x"\r\n');
  });

  it("doubles an embedded quote, per RFC 4180", () => {
    expect(toCsv(["A"], [['he said "no"']])).toContain('"he said ""no"""');
  });

  it("survives a caption full of commas and quotes", () => {
    const line = toCsv(["A", "B"], [['a,b,"c"', "d"]]);
    expect(line).toContain('"a,b,""c"""');
  });

  it("ends every line with CRLF", () => {
    const csv = buildSheet(schedulerById("publer"), [carousel()]).csv;
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("has a header and one line per carousel", () => {
    const csv = buildSheet(schedulerById("publer"), [carousel(), carousel({ id: "d2" })]).csv;
    // Splitting on CRLF rather than LF: ContentStudio's own cells contain LF.
    expect(csv.trimEnd().split("\r\n")).toHaveLength(3);
  });
});

describe("what it refuses to pretend", () => {
  it("names the carousels it had to truncate", () => {
    const many = carousel({ urls: Array.from({ length: 12 }, (_, i) => `https://cdn/${i}.jpg`) });
    expect(buildSheet(schedulerById("publer"), [many]).warnings.join(" ")).toContain(
      "Five ways to fail",
    );
  });

  it("says when a carousel has nothing hosted", () => {
    const empty = carousel({ urls: [], alts: [] });
    expect(buildSheet(schedulerById("publer"), [empty]).warnings.join(" ")).toContain(
      "no hosted slides",
    );
  });

  it("stops at the row limit and says how many were left", () => {
    const lots = Array.from({ length: 520 }, (_, i) => carousel({ id: `d${i}` }));
    const sheet = buildSheet(schedulerById("publer"), lots);
    expect(sheet.csv.trimEnd().split("\r\n")).toHaveLength(501);
    expect(sheet.warnings.join(" ")).toContain("20 were left out");
  });

  it("is quiet when there is nothing to say", () => {
    expect(buildSheet(schedulerById("publer"), [carousel()]).warnings).toEqual([]);
  });
});
