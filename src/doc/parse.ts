import { newId } from "./ids.js";
import type { Block } from "./types.js";

const UNORDERED = /^\s*[-*•]\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;
const QUOTE = /^\s*>\s?/;
const ATTRIB = /^\s*[—–-]\s+/;

export const isListLine = (line: string): boolean => UNORDERED.test(line) || ORDERED.test(line);
const stripMarker = (line: string): string => line.replace(UNORDERED, "").replace(ORDERED, "").trim();

/** A blank-line-separated group of source text, already turned into blocks. */
export type Group = { blocks: Block[]; chars: number };

/** Deterministic. text → groups. Blank lines are group breaks. */
export function parseGroups(text: string): Group[] {
  const normalised = text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "");
  const chunks = normalised.split(/\n\s*\n/).map((c) => c.trim()).filter((c) => c.length > 0);

  return chunks.map((chunk) => {
    const blocks = parseChunk(chunk);
    const chars = blocks.reduce((n, b) => n + blockChars(b), 0);
    return { blocks, chars };
  });
}

function parseChunk(chunk: string): Block[] {
  const lines = chunk.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;

    // A run of 2+ marker lines is one list block. A single one is just a paragraph.
    if (isListLine(line)) {
      let j = i;
      while (j < lines.length) {
        const candidate = lines[j];
        if (candidate === undefined || !isListLine(candidate)) break;
        j += 1;
      }
      const run = lines.slice(i, j);
      if (run.length >= 2) {
        blocks.push({
          id: newId("blk"),
          type: "list",
          ordered: ORDERED.test(line),
          items: run.map(stripMarker),
        });
        i = j;
        continue;
      }
    }

    if (QUOTE.test(line)) {
      const text = line.replace(QUOTE, "").trim();
      const next = lines[i + 1];
      const hasAttrib = next !== undefined && ATTRIB.test(next) && !isListLine(next);
      blocks.push({
        id: newId("blk"),
        type: "quote",
        text,
        attribution: hasAttrib && next ? next.replace(ATTRIB, "").trim() : undefined,
      });
      i += hasAttrib ? 2 : 1;
      continue;
    }

    // A wholly quoted single line reads as a pull quote.
    if (/^["“].*["”]$/.test(line) && lines.length === 1) {
      blocks.push({ id: newId("blk"), type: "quote", text: line.replace(/^["“]|["”]$/g, "").trim() });
      i += 1;
      continue;
    }

    const isHeading = lines.length === 1 && line.length < 60 && !/[.!?:;]$/.test(line);
    blocks.push({ id: newId("blk"), type: isHeading ? "heading" : "paragraph", text: line });
    i += 1;
  }

  return blocks;
}

export function blockChars(block: Block): number {
  switch (block.type) {
    case "list":
      return block.items.join(" ").length;
    case "quote":
      return block.text.length + (block.attribution?.length ?? 0);
    default:
      return block.text.length;
  }
}

export function blockText(block: Block): string {
  switch (block.type) {
    case "list":
      return block.items.join(" ");
    case "quote":
      return block.text;
    default:
      return block.text;
  }
}
