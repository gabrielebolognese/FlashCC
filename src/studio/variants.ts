/**
 * Hook variants: several ways to open the same carousel.
 *
 * People iterate on the first slide constantly and currently do it by retyping,
 * losing each attempt as they go. The useful unit is not "a better hook", it is
 * *five different angles, side by side, none of them lost until one is chosen*.
 *
 * Two things this deliberately does not do:
 *
 * It does not rank them. The loudest complaint in the whole research corpus is
 * about exactly that: "its virality score and my audience disagree, constantly...
 * I have stopped trusting the ranking and now I scrub the whole thing myself
 * anyway, which defeats the point of paying." A confident score on an unknowable
 * quantity costs trust and buys nothing.
 *
 * It does not touch layout. A picked hook goes back through the same generator
 * every other slide came from, so type scale and composition stay deterministic.
 */

import { authHeader } from "./billing.js";
import { readRefusal } from "./gate.js";
import type { Structure } from "./structures.js";

export type HookVariant = {
  /** Two or three words naming the approach, so a choice can be made on judgement. */
  angle: string;
  text: string;
};

export const HOOK_COUNT = 5;

/**
 * Asks the server for openings, given the deck they have to pay off.
 *
 * The whole deck is sent, not just the current hook. A hook rewritten in
 * isolation promises whatever sounds best; a hook written against the slides
 * promises what is actually in them, which is the difference between a carousel
 * and a bait-and-switch.
 */
export async function draftHooks(
  hook: string,
  deck: readonly string[],
  structure?: Structure,
  count: number = HOOK_COUNT,
  signal?: AbortSignal,
): Promise<HookVariant[]> {
  const res = await fetch("/api/hooks", {
    method: "POST",
    headers: await authHeader(),
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      hook,
      deck: [...deck],
      ...(structure ? { framework: structure.name } : {}),
      count,
    }),
  });

  if (!res.ok) throw await readRefusal(res);

  const body: unknown = await res.json().catch(() => null);
  const hooks = (body as { hooks?: HookVariant[] } | null)?.hooks;
  if (!Array.isArray(hooks) || hooks.length === 0) throw new Error("No hooks came back");
  return hooks;
}

/**
 * Keeps the ones worth showing.
 *
 * A variant identical to what is already on the slide is not a variant, and two
 * that differ only by punctuation are one idea wearing two hats. Compared on
 * letters alone so that "Stop doing this." and "Stop doing this!" collapse.
 */
export function distinctHooks(variants: readonly HookVariant[], current: string): HookVariant[] {
  const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const seen = new Set<string>([key(current)]);

  return variants.filter((v) => {
    const k = key(v.text);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
