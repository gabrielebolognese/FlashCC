import { blockText } from "./parse.js";
import { splitToSlides } from "./split.js";
import type { Block, Granularity, Slide } from "./types.js";

/** document → text. Round-trip partner of parseGroups. No hidden syntax. */
export function serialize(slides: Slide[]): string {
  return slides.map(serializeSlide).join("\n\n");
}

function serializeSlide(slide: Slide): string {
  return slide.blocks.map(serializeBlock).join("\n");
}

function serializeBlock(block: Block): string {
  switch (block.type) {
    case "list":
      return block.items
        .map((item, i) => (block.ordered ? `${i + 1}. ${item}` : `- ${item}`))
        .join("\n");
    case "quote":
      return block.attribution ? `> ${block.text}\n— ${block.attribution}` : `> ${block.text}`;
    default:
      return block.text;
  }
}

/**
 * Re-split from source, carrying ids and role overrides forward where a slide's
 * content is unchanged. Stops a single keystroke from resetting the user's choices.
 */
export function rebuild(source: string, granularity: Granularity, previous: Slide[]): Slide[] {
  const next = splitToSlides(source, granularity);
  const byKey = new Map<string, Slide>();
  for (const slide of previous) {
    const key = slideKey(slide);
    if (!byKey.has(key)) byKey.set(key, slide);
  }

  return next.map((slide, i) => {
    const match = byKey.get(slideKey(slide)) ?? previous[i];
    if (!match) return slide;
    byKey.delete(slideKey(slide));
    return { ...slide, id: match.id, roleOverride: match.roleOverride };
  });
}

const slideKey = (slide: Slide): string =>
  slide.blocks.map((b) => `${b.type}:${blockText(b).slice(0, 80)}`).join("|");
