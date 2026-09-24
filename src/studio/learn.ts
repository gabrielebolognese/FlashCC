/**
 * Working out somebody's voice from the carousels they already made.
 *
 * Batch 10 shipped brand voice and it works, but it asks somebody to sit down
 * and paste three posts into a form before they get anything, and almost nobody
 * will. Meanwhile the product is sitting on a folder of their own writing, which
 * is a better sample than anything they would have pasted.
 *
 * The selection logic is here and pure, because which decks get read is the
 * decision in this feature. Reading the wrong ones produces a confident,
 * plausible, wrong description of how somebody sounds, and nothing about the
 * result would look wrong.
 */

import { authHeader } from "./billing.js";
import { brandIdOf, type Voice } from "./brand.js";
import { readRefusal } from "./gate.js";
import { handEditedCount } from "./regenerate.js";
import { listDocs, loadDoc, type DocSummary } from "./storage.js";
import { deckTexts } from "./transcript.js";

/** Twelve is plenty to characterise a voice and keeps one call affordable. */
export const MAX_LEARN_DECKS = 12;

/**
 * Below three, this is a description of one carousel rather than of a person.
 *
 * Also the threshold for falling back: a brand with two decks of its own learns
 * more from everything than from those two.
 */
export const MIN_LEARN_DECKS = 3;

export const MAX_LEARN_CHARS = 20000;

export type LearnedTrait = { trait: string; evidence: string };

export type Learned = {
  tone: string;
  avoid: string[];
  /** Each claim with a line from their own decks that demonstrates it. */
  observed: LearnedTrait[];
};

/** Which decks were read, and what is worth saying about them. */
export type DeckPick = {
  decks: string[][];
  /** Whether these are this brand's own decks or everything. */
  scope: "brand" | "all";
  /** More than half had no hand edits, so this voice may be a model's. */
  drafted: boolean;
  count: number;
};

/**
 * Newest first, this brand's own decks preferred.
 *
 * **The fallback is the decision the plan did not make.** A brand's voice learned
 * from another brand's decks is straightforwardly wrong, and `styleId` carries
 * `brand:<id>` so those decks are identifiable. But strict filtering usually
 * returns nothing: most people have one brand, and everything made before that
 * brand existed carries a stock style.
 *
 * So: this brand's decks when there are enough of them, everything otherwise,
 * and the caller says which happened. Silently reading the wrong decks is the
 * failure to avoid; silently reading none is the failure that makes the button
 * look broken.
 */
export function pickDecks(
  summaries: readonly DocSummary[],
  brandId: string,
  max = MAX_LEARN_DECKS,
): { picked: DocSummary[]; scope: "brand" | "all" } {
  const newest = [...summaries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const own = newest.filter((d) => d.styleId && brandIdOf(d.styleId) === brandId);

  return own.length >= MIN_LEARN_DECKS
    ? { picked: own.slice(0, max), scope: "brand" }
    : { picked: newest.slice(0, max), scope: "all" };
}

/**
 * Were most of these written by a model?
 *
 * Learning your voice from a model's output is a loop, and the interface has to
 * say so when it is happening. `handEdited` is a real signal rather than a
 * guess: it is stamped by every editor mutation.
 *
 * **More than half**, deliberately generous and deliberately simple. A threshold
 * anybody can explain in one line beats one that is cleverer and cannot be
 * reasoned about from the warning it produces.
 *
 * The honest limit, which the interface also states: `markEdited` fires on
 * CANVAS edits. Somebody who writes everything in the compose screen and never
 * touches a layer has no hand edits either, so this over-warns for them. Over
 * is the right direction for a warning about a feedback loop.
 */
export function mostlyDrafted(edits: readonly number[]): boolean {
  if (edits.length === 0) return false;
  return edits.filter((n) => n === 0).length * 2 > edits.length;
}

/**
 * Everything the route needs, read out of local storage.
 *
 * Not pure, and deliberately thin for that reason: every decision it makes is
 * delegated to the two functions above, which are.
 */
export function gatherDecks(brandId: string): DeckPick {
  const { picked, scope } = pickDecks(listDocs(), brandId);

  const decks: string[][] = [];
  const edits: number[] = [];
  let chars = 0;

  for (const summary of picked) {
    const doc = loadDoc(summary.id);
    if (!doc) continue;

    const texts = deckTexts(doc).filter((t) => t.trim());
    if (texts.length === 0) continue;

    const size = texts.join(" ").length;
    // Stop at the ceiling rather than truncating a deck: half a carousel is a
    // misleading sample of how somebody writes a whole one.
    if (chars + size > MAX_LEARN_CHARS && decks.length > 0) break;

    decks.push(texts);
    edits.push(handEditedCount(doc));
    chars += size;
  }

  return { decks, scope, drafted: mostlyDrafted(edits), count: decks.length };
}

/* ── the call ─────────────────────────────────────────────────────────────── */

export async function learnVoice(
  decks: readonly string[][],
  existing?: Voice,
  signal?: AbortSignal,
): Promise<Learned> {
  const res = await fetch("/api/voice/learn", {
    method: "POST",
    headers: await authHeader(),
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      decks: decks.map((d) => [...d]),
      ...(existing ? { existing } : {}),
    }),
  });

  if (!res.ok) throw await readRefusal(res);

  const body = (await res.json().catch(() => null)) as Partial<Learned> | null;
  if (!body || typeof body.tone !== "string") throw new Error("Nothing came back");

  return {
    tone: body.tone,
    avoid: Array.isArray(body.avoid) ? body.avoid : [],
    observed: Array.isArray(body.observed) ? body.observed : [],
  };
}

/**
 * The tone that actually gets written, given which traits somebody kept.
 *
 * Unchecking a trait has to change the result, or the checkboxes are theatre.
 * The proposed tone is used as written when everything is kept, because that is
 * the model's own sentence and it reads better than a list; once anything is
 * dropped the tone is rebuilt from the traits that survived, so what is stored
 * says only what the person agreed with.
 */
export function toneFrom(learned: Learned, kept: readonly boolean[], edited: string): string {
  const all = kept.length === learned.observed.length && kept.every(Boolean);
  if (all) return edited.trim();

  const traits = learned.observed.filter((_, i) => kept[i]).map((o) => o.trait.trim()).filter(Boolean);
  return traits.join(". ");
}
