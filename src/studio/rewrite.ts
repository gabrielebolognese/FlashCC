/**
 * Pushing on a line you almost like.
 *
 * Drafting is one shot: you get eight slides and then you are alone with them.
 * This is the thing between a line and a whole deck, so a slide four that is
 * nearly right can be worked on without redrafting the seven that were fine.
 *
 * Two rules it shares with every other AI surface in this product:
 *
 * It returns WORDS. The layout is recomputed from them by `restateSlide`, so
 * type scale and composition stay deterministic (invariant 5). Nothing here
 * proposes a size, a position or a colour.
 *
 * It does not rank them. Three options in the order the model wrote them, each
 * naming what it did, so the choice is made on judgement rather than on a score
 * the product cannot actually justify.
 */

import { authHeader } from "./billing.js";
import { hasVoice, type Voice } from "./brand.js";
import { readRefusal } from "./gate.js";
import type { Layer } from "./model.js";
import type { Slot } from "./structures.js";

export type RewriteIntent = "shorter" | "punchier" | "simpler" | "angle" | "expand" | "free";

export type RewriteOption = {
  /** Two or three words naming what this one did. Never a rank. */
  note: string;
  text: string;
};

export const REWRITE_COUNT = 3;

/**
 * What came back, including the character ceiling the server held it to.
 *
 * The ceiling is reported rather than duplicated here. It is 90 for a hook and
 * 220 for everything else, and both numbers already live in the prompt that
 * enforces them; a second copy on this side is how the two quietly diverge.
 */
export type RewriteResult = {
  options: RewriteOption[];
  limit: number;
};

/** What the chips say, in the order they are shown. */
export const INTENT_LABELS: { id: RewriteIntent; label: string }[] = [
  { id: "shorter", label: "Shorter" },
  { id: "punchier", label: "Punchier" },
  { id: "simpler", label: "Simpler" },
  { id: "angle", label: "New angle" },
  { id: "expand", label: "Longer" },
];

export type RewriteAsk = {
  text: string;
  intent: RewriteIntent;
  instruction?: string | undefined;
  slot?: Slot | undefined;
  deck?: readonly string[] | undefined;
  limit?: number | undefined;
  count?: number | undefined;
  voice?: Voice | undefined;
};

export async function rewriteLine(ask: RewriteAsk, signal?: AbortSignal): Promise<RewriteResult> {
  const res = await fetch("/api/rewrite", {
    method: "POST",
    headers: await authHeader(),
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      text: ask.text,
      intent: ask.intent,
      count: ask.count ?? REWRITE_COUNT,
      ...(ask.intent === "free" && ask.instruction ? { instruction: ask.instruction } : {}),
      // Only the three fields the prompt reads. A whole Slot carries `detail`,
      // `examples` and `repeatable`, which would be paid for on every request
      // and used by nothing.
      ...(ask.slot ? { slot: { id: ask.slot.id, label: ask.slot.label, note: ask.slot.note } } : {}),
      ...(ask.deck && ask.deck.length > 0 ? { deck: [...ask.deck] } : {}),
      ...(typeof ask.limit === "number" ? { limit: ask.limit } : {}),
      ...(hasVoice(ask.voice) ? { voice: ask.voice } : {}),
    }),
  });

  if (!res.ok) throw await readRefusal(res);

  const body = (await res.json().catch(() => null)) as {
    options?: RewriteOption[];
    limit?: number;
  } | null;

  const options = body?.options;
  if (!Array.isArray(options) || options.length === 0) throw new Error("No rewrites came back");
  return { options, limit: typeof body?.limit === "number" ? body.limit : 220 };
}

/**
 * Drops anything that is not actually an alternative.
 *
 * An option identical to the line already on the slide is not a choice, and two
 * that differ only by punctuation are one idea wearing two hats. Compared on
 * letters alone so "Stop doing this." and "Stop doing this!" collapse, the same
 * rule `distinctHooks` uses.
 *
 * Done here rather than on the server because the comparison that matters is
 * against what the user is looking at right now, which the server does not
 * necessarily have: a hand-drawn text layer is in no slide's copy.
 */
export function distinctRewrites(options: readonly RewriteOption[], current: string): RewriteOption[] {
  const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const now = key(current);
  const seen = new Set<string>();

  return options.filter((o) => {
    const k = key(o.text);
    if (!k || k === now || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Which slot a slide is, when that can be known at all.
 *
 * Roles are deliberately NOT stored on a document: `model.ts` keeps artboards of
 * layers and nothing derived, and `doc.framework` is recorded for analytics
 * rather than for layout. So the only way back to a slot is by position, and
 * that is only trustworthy while the deck still has the shape the framework gave
 * it.
 *
 * A split, a merge, an added slide or a reorder breaks the correspondence, and a
 * CTA rewritten as if it were a mid-deck point is worse than one rewritten with
 * no slot at all. So the count has to match exactly, and otherwise this returns
 * undefined and the prompt simply says less. Same rule as `contextVoice`: do not
 * guess.
 */
export function slotAt(
  index: number,
  slideCount: number,
  slots: readonly Slot[] | undefined,
): Slot | undefined {
  if (!slots || slots.length !== slideCount) return undefined;
  return slots[index];
}

/**
 * The slide's whole text, with one layer's line swapped for a new one.
 *
 * `restateSlide` replaces a slide's ENTIRE copy, because composition selection
 * depends on the deck's shape and it rebuilds from text. So rewriting one layer
 * of a two-layer slide and handing the result straight to it would rebuild the
 * slide from that line alone and silently delete the other one. A heading-plus-
 * body composition is exactly that case and it is not rare.
 *
 * The order here mirrors `textsOf` in `regenerate.ts` deliberately: biggest font
 * first, then the rest, joined with a newline. If the two ever disagree, a
 * rewrite reassembles the slide in a different order than the generator reads
 * it, and the slide quietly reflows.
 */
export function slideTextWith(
  slide: { layers: readonly Layer[] },
  layerId: string,
  text: string,
): string {
  const texts = slide.layers.filter((l) => l.kind === "text" && (l.text ?? "").trim() !== "");
  const sorted = [...texts].sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0));
  return sorted
    .map((l) => (l.id === layerId ? text.trim() : (l.text ?? "").trim()))
    .filter(Boolean)
    .join("\n");
}

/**
 * Whether applying a rewrite has to go back through the generator.
 *
 * **A hand-edited layer is written to directly, and that is not a violation of
 * the rule, it is the rule applied properly.** `restateSlide` keeps hand-edited
 * layers verbatim and rebuilds everything else from the text, so running it on
 * one would re-add the layer's new words as a generated layer AND keep the old
 * hand-placed one: the same line twice. More importantly, somebody who dragged a
 * box to where they wanted it has said where it goes, and recomputing its
 * position is the thing they would complain about.
 *
 * A generated layer has a box measured for the old words, so it must rebuild.
 */
export const rebuildsOnRewrite = (layer: Layer): boolean => layer.handEdited !== true;
