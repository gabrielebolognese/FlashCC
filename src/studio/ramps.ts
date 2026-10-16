/**
 * Type ramps as presets (22.1).
 *
 * A ramp is one number, the ratio between steps, and it is the decision that
 * makes a deck look designed rather than typed: every size on every slide is
 * the body size multiplied up or down by the same ratio. A style or a brand
 * chooses one; a style that chooses none keeps the sizes each composition
 * always had, which are themselves roughly an Editorial ramp.
 *
 * **The ramp sets the TOP of each role's fit ladder, and nothing else.** The
 * ladder below it, and its 60% floor from Batch 4, are unchanged: a ramp makes
 * a deck louder or quieter, it never lets copy shrink further than it could.
 *
 * Every step, and the bottom of every ladder, sits on or above the pre-flight
 * floors from Batch 1.3: 18 for body text, 24 for headlines.
 */

export type RampId = "tight" | "editorial" | "loud";
export type Step = "caption" | "body" | "subhead" | "headline" | "display";

export const RAMPS: { id: RampId; label: string; ratio: number; hint: string }[] = [
  { id: "tight", label: "Tight", ratio: 1.2, hint: "Close sizes. Calm, dense, reads like a document." },
  { id: "editorial", label: "Editorial", ratio: 1.333, hint: "A clear step between each level. The default feel." },
  { id: "loud", label: "Loud", ratio: 1.5, hint: "Big headlines, small body. Posters and hooks." },
];

/** The body size every ramp is built from: the middle of the scale. */
export const RAMP_BODY = 36;

/** The pre-flight floors (Batch 1.3), by step. */
export const FLOOR: Record<Step, number> = { caption: 18, body: 18, subhead: 24, headline: 24, display: 24 };

/** How far down a ladder may go, as a fraction of its top (Batch 4). */
export const SHRINK_FLOOR = 0.6;

const POWER: Record<Step, number> = { caption: -1, body: 0, subhead: 1, headline: 2, display: 3 };

export const rampById = (id: string | undefined): (typeof RAMPS)[number] | undefined => RAMPS.find((r) => r.id === id);

/** Every step of a ramp, in px, each at or above its floor. */
export function rampSizes(id: RampId): Record<Step, number> {
  const r = rampById(id)!.ratio;
  const out = {} as Record<Step, number>;
  for (const step of Object.keys(POWER) as Step[]) {
    out[step] = Math.max(FLOOR[step], Math.round(RAMP_BODY * r ** POWER[step]));
  }
  return out;
}

/**
 * The [top, bottom] of a role's fit ladder. With no ramp, the composition's
 * own range, untouched; with one, the ramp's step on top and the usual 60%
 * floor (never below the pre-flight floor) under it.
 */
export function rampRange(
  ramp: string | undefined,
  step: Step,
  fallback: [max: number, min: number],
): [max: number, min: number] {
  const found = rampById(ramp);
  if (!found) return fallback;
  const top = rampSizes(found.id)[step];
  return [top, Math.max(FLOOR[step], Math.round(top * SHRINK_FLOOR))];
}
