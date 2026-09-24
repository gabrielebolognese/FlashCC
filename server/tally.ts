/**
 * How often each check fires, per route, since this process started.
 *
 * **Not analytics on users, and not a record of anybody's carousels.** It counts
 * codes, and a code is a category of defect rather than a fact about a customer.
 *
 * The reason is narrow and worth stating: **a prompt edit that makes fabrication
 * twice as likely is invisible today.** If the rate of "measure-not-in-brief"
 * doubles the week after a prompt change, that is worth seeing, and counting it
 * costs nothing.
 *
 * In memory, so it resets on deploy, which is the right granularity for a signal
 * about prompts rather than about people. Putting it in the database would make
 * it a permanent record of something nobody needs permanently.
 */
import type { Finding } from "./checks.js";

const counts = new Map<string, number>();

export function countFindings(route: string, findings: readonly Finding[]): void {
  for (const f of findings) {
    const key = `${route}.${f.code}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
}

/** Sorted loudest first, because the question is always "what fires most". */
export const tally = (): Record<string, number> =>
  Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));

export const resetTally = (): void => counts.clear();
