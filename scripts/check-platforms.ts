/**
 * Are the platform numbers still current?
 *
 *   npm run check:platforms
 *
 * The sibling of check:schema. Every row in `platforms.ts` carries the day it
 * was last checked against the platform's own documentation, and platforms
 * change underneath a product without telling it: Instagram moved its grid to
 * 3:4 in 2025 and nothing in this repo noticed for a year.
 *
 * It WARNS and exits 0. A test that fails on the calendar is a test people
 * learn to ignore, so this is something to run, not something that blocks.
 */
import { CANDIDATES, platformAudit } from "../src/studio/platforms.js";

const MAX_AGE_DAYS = 180;
const audit = platformAudit(CANDIDATES, new Date(), MAX_AGE_DAYS);

for (const p of CANDIDATES) {
  const shapes = p.shapes.map((s) => `${s.label}${s.api === false ? " (app only)" : ""}`).join(", ");
  const status = p.verified === null ? "not shipped" : `verified ${p.verified}`;
  console.log(`${p.label.padEnd(10)} ${status.padEnd(20)} ${shapes}`);
}

console.log("");
for (const s of audit.stale) {
  const p = CANDIDATES.find((c) => c.id === s.id);
  console.warn(`! ${p?.label ?? s.id} was last verified ${s.days} days ago. Re-check:`);
  for (const src of p?.sources ?? []) console.warn(`    ${src}`);
}
for (const id of audit.unverified) {
  console.warn(`- ${id} has never been verified and is not offered in the app.`);
}
if (audit.stale.length === 0) console.log(`Every shipped row was verified in the last ${MAX_AGE_DAYS} days.`);
