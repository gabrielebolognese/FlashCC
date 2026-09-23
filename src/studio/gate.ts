/**
 * What the client does when the server says "that costs money".
 *
 * ── Why 402 and not 403 ──────────────────────────────────────────────────────
 *
 * Payment Required is the one status code that means exactly this, and the
 * distinction is load-bearing rather than pedantic: a 403 is a wall and a 402 is
 * an offer. Without the split, a gated feature surfaces as "Drafting failed
 * (403)", which reads as a bug, sends people to support, and sells nothing.
 *
 * ── Why a channel rather than a prop ─────────────────────────────────────────
 *
 * The pricing panel lives in `Home`, and three of the five gated calls happen in
 * `Studio` or in a dialog above it, different screens entirely, since `App`
 * swaps rather than nests. Threading an `onPaywall` callback down to `ai.ts` and
 * `variants.ts` would mean passing it through four component trees to reach two
 * fetch calls.
 *
 * So the same shape as `session.ts`: one module-level fact, written from one
 * place. `App` listens and mounts the panel over whatever is on screen, which is
 * the one place that works from every screen.
 */

import { sessionPlan, sessionUserId } from "./session.js";

/** Thrown by any call the server refused on plan grounds. */
export class PaywallError extends Error {
  constructor(
    readonly feature: string,
    message: string,
  ) {
    super(message);
    this.name = "PaywallError";
  }
}

export const isPaywall = (error: unknown): error is PaywallError =>
  error instanceof PaywallError;

/* ── the channel ──────────────────────────────────────────────────────────── */

type Listener = (feature: string) => void;

const listeners = new Set<Listener>();

/** `App` subscribes. Returns the unsubscribe, for an effect's cleanup. */
export function onPaywall(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Announce that somebody just hit a wall, and which one.
 *
 * Called from `ask` below rather than from each call site, so a new gated route
 * gets the prompt for free and cannot forget to.
 */
export function firePaywall(feature: string): void {
  for (const listener of listeners) listener(feature);
}

/* ── the fetch wrapper every gated call uses ──────────────────────────────── */

/**
 * A 402 becomes a `PaywallError` AND opens the panel; everything else is an
 * ordinary error the caller shows in place.
 *
 * Both, deliberately. The panel is the useful response, but the calling dialog
 * still needs something to put in its own error slot, a screen that goes
 * silent while a modal opens somewhere else reads as a dropped click.
 */
export async function readRefusal(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  const message =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : `Request failed (${response.status})`;

  if (response.status !== 402) return new Error(message);

  // The server names the feature in its message ("AI drafting is part of Pro."),
  // so the first clause is the label, no second field to keep in step.
  const feature = message.split(" is part of")[0] ?? "This";
  firePaywall(feature);
  return new PaywallError(feature, message);
}

/**
 * The plan as the client last heard it.
 *
 * Used only to decide whether to bother asking. It is never the boundary, the
 * server checks `profiles.plan` on every gated call, and this is a courtesy that
 * saves a round trip and a flash of failure.
 */
export const looksPaid = (): boolean => sessionPlan() !== "free";

export const looksSignedIn = (): boolean => sessionUserId() !== null;
