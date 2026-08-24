import { newId } from "./ids.js";
import { blockChars, parseGroups, type Group } from "./parse.js";
import type { Block, Granularity, Slide, SlideRole } from "./types.js";

/** The only tuning in the product. docs/document-schema.md §5. */
const THRESHOLDS = {
  few: { merge: 520, split: Infinity },
  balanced: { merge: 0, split: 420 },
  many: { merge: 0, split: 220 },
} as const;

const CTA_MAX_CHARS = 140;

export function splitToSlides(source: string, granularity: Granularity): Slide[] {
  const groups = parseGroups(source);
  if (groups.length === 0) return [];

  const t = THRESHOLDS[granularity];
  const merged = t.merge > 0 ? mergeGroups(groups, t.merge) : groups;
  const sized = t.split < Infinity ? splitGroups(merged, t.split) : merged;

  const slides: Slide[] = sized.map((g) => ({
    id: newId("sld"),
    role: "body" as SlideRole,
    blocks: g.blocks,
  }));

  return assignRoles(slides);
}

/** `few`: pull consecutive prose groups together while they stay under the cap. */
function mergeGroups(groups: Group[], cap: number): Group[] {
  const out: Group[] = [];
  for (const group of groups) {
    const last = out[out.length - 1];
    const mergeable =
      last !== undefined &&
      !hasStructural(last) &&
      !hasStructural(group) &&
      last.chars + group.chars <= cap;

    if (mergeable && last) {
      last.blocks = [...last.blocks, ...group.blocks];
      last.chars += group.chars;
    } else {
      out.push({ blocks: [...group.blocks], chars: group.chars });
    }
  }
  return out;
}

/** `balanced` / `many`: break long prose groups at sentence boundaries. */
function splitGroups(groups: Group[], cap: number): Group[] {
  const out: Group[] = [];
  for (const group of groups) {
    if (hasStructural(group) || group.chars <= cap) {
      out.push(group);
      continue;
    }
    for (const block of group.blocks) {
      if (block.type !== "paragraph" || block.text.length <= cap) {
        out.push({ blocks: [block], chars: blockChars(block) });
        continue;
      }
      for (const part of splitSentences(block.text, cap)) {
        const next: Block = { id: newId("blk"), type: "paragraph", text: part };
        out.push({ blocks: [next], chars: part.length });
      }
    }
  }
  return out;
}

function splitSentences(text: string, cap: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (buffer.length > 0 && buffer.length + sentence.length > cap) {
      out.push(buffer.trim());
      buffer = sentence;
    } else {
      buffer += sentence;
    }
  }
  if (buffer.trim().length > 0) out.push(buffer.trim());
  return out;
}

const hasStructural = (group: Group): boolean =>
  group.blocks.some((b) => b.type === "list" || b.type === "quote");

/** Role inference. First match wins. docs/document-schema.md §5. */
export function assignRoles(slides: Slide[]): Slide[] {
  return slides.map((slide, i) => ({ ...slide, role: inferRole(slide, i, slides.length) }));
}

export function inferRole(slide: Slide, index: number, total: number): SlideRole {
  if (index === 0) return "cover";

  const chars = slide.blocks.reduce((n, b) => n + blockChars(b), 0);
  if (index === total - 1 && total >= 3 && chars <= CTA_MAX_CHARS) return "cta";
  if (slide.blocks.some((b) => b.type === "list")) return "list";
  if (slide.blocks.some((b) => b.type === "quote")) return "quote";
  return "body";
}
