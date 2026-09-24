import { describe, expect, it } from "vitest";

import { isReadableFile, MIN_SOURCE_CHARS, SOURCE_TYPES } from "./distil.js";

describe("which files the source box accepts", () => {
  it("takes plain text and markdown", () => {
    expect(isReadableFile("notes.txt")).toBe(true);
    expect(isReadableFile("post.md")).toBe(true);
    expect(isReadableFile("post.markdown")).toBe(true);
  });

  /** A transcript arrives as subtitles more often than as prose. */
  it("takes both subtitle formats", () => {
    expect(isReadableFile("talk.srt")).toBe(true);
    expect(isReadableFile("talk.vtt")).toBe(true);
  });

  it("ignores case and surrounding space", () => {
    expect(isReadableFile("  TALK.SRT  ")).toBe(true);
  });

  /**
   * Deliberately out of this batch. Parsing one properly is a dependency and an
   * afternoon, and every PDF anybody has can be select-all-copied into the box.
   */
  it("refuses a PDF rather than pretending to read it", () => {
    expect(isReadableFile("deck.pdf")).toBe(false);
  });

  it("refuses the things somebody might drop by accident", () => {
    expect(isReadableFile("photo.png")).toBe(false);
    expect(isReadableFile("sheet.csv")).toBe(false);
    expect(isReadableFile("archive.zip")).toBe(false);
    expect(isReadableFile("noextension")).toBe(false);
    expect(isReadableFile("")).toBe(false);
  });

  /** A name that merely contains the extension is not that extension. */
  it("matches the extension, not the name", () => {
    expect(isReadableFile("srt-notes.docx")).toBe(false);
    expect(isReadableFile("my.txt.exe")).toBe(false);
  });

  it("lists the same types it accepts", () => {
    for (const ext of [".txt", ".md", ".vtt", ".srt"]) {
      expect(SOURCE_TYPES).toContain(ext);
    }
    expect(SOURCE_TYPES).not.toContain(".pdf");
  });
});

describe("the floor on a source", () => {
  /** Below this there is nothing to work out and a brief is the better tool. */
  it("is high enough to mean something", () => {
    expect(MIN_SOURCE_CHARS).toBeGreaterThan(100);
  });
});
