/**
 * Who is signed in, for the modules that are not components.
 *
 * `useAccount` owns the session and hands it down as props, which is right for
 * the screens. It is wrong for the library: uploading a picture happens in the
 * media pool, the font dialog, the brand editor and the library grid, and
 * threading a user id through four component trees to reach one `upload` call is
 * a lot of prop for one fact that is true globally.
 *
 * So this is one mutable fact, written from exactly one place, `useAccount`,
 * whenever the session changes, and read wherever a module needs to know
 * whether there is somewhere to put bytes. Deliberately not a store, not a
 * context and not reactive: nothing should RE-RENDER because of it, because
 * anything that should re-render already has the account as a prop.
 */

import { isCloudConfigured, type Plan } from "./cloud.js";

type Current = { userId: string | null; plan: Plan };

let current: Current = { userId: null, plan: "free" };

export function setSession(next: Partial<Current>): void {
  current = { ...current, ...next };
}

export const sessionUserId = (): string | null => current.userId;

export const sessionPlan = (): Plan => current.plan;

/** Signed in AND a project to talk to. Either one alone means local-only. */
export const hasCloudSession = (): boolean => Boolean(current.userId) && isCloudConfigured();
