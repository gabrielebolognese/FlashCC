/**
 * Does the database match the code?
 *
 * Every migration in supabase/ is a file somebody has to remember to run, and
 * nothing in the app notices when one has not been, the client degrades quietly
 * by design, so a missing table looks like a feature that is merely unused. This
 * is the thing that says so out loud.
 *
 *   npm run check:schema
 *
 * Read-only. It probes PostgREST with the PUBLISHABLE key, the same one the
 * browser holds, which authorises nothing by itself, so it can tell a missing
 * table from an empty one but never sees anybody's rows. An anonymous caller
 * getting 200 with zero rows back from a table that exists is RLS working, and
 * is reported as such.
 */
import { readFileSync } from "node:fs";

const env = {};
try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const at = trimmed.indexOf("=");
    env[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim();
  }
} catch {
  console.error("No .env file. Copy .env.example and fill it in.");
  process.exit(1);
}

const URL_BASE = (env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? "";

if (!URL_BASE || !KEY) {
  console.error("VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set in .env");
  process.exit(1);
}

/** What each migration is supposed to have created. */
const EXPECTED = [
  { migration: "01-schema.sql", table: "profiles" },
  { migration: "01-schema.sql", table: "docs" },
  { migration: "01-schema.sql", table: "posts" },
  { migration: "03-brands.sql", table: "brands" },
  { migration: "04-storage.sql", table: "assets" },
  { migration: "05-series.sql", table: "docs", column: "series_id" },
  { migration: "06-clients.sql", table: "clients" },
  { migration: "06-clients.sql", table: "docs", column: "client_id" },
  { migration: "07-review.sql", table: "shares" },
  { migration: "07-review.sql", table: "comments" },
  { migration: "08-pipeline-fields.sql", table: "posts", column: "pillar" },
  { migration: "08-pipeline-fields.sql", table: "profiles", column: "plan_ends_at_period_end" },
];

const probe = async (table, column) => {
  const select = column ?? "*";
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=${select}&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });

  if (res.ok) return { ok: true, rows: (await res.json()).length };

  let code = "";
  try {
    code = (await res.json()).code ?? "";
  } catch {
    /* a non-JSON error body is still an error */
  }
  // PGRST205 is "no such table"; 42703 is "no such column". Anything else is a
  // real problem rather than a missing migration, and is reported verbatim.
  return { ok: false, missing: code === "PGRST205" || code === "42703", code, status: res.status };
};

console.log(`\nChecking ${URL_BASE}\n`);

const missing = new Set();
let leaked = 0;

for (const { migration, table, column } of EXPECTED) {
  const what = column ? `${table}.${column}` : table;
  const result = await probe(table, column);

  if (result.ok) {
    // Zero rows to an anonymous caller is the correct answer. Anything else
    // means a policy is missing and is the single most serious thing this
    // script can find.
    const note = result.rows === 0 ? "ok" : `RLS LEAK, ${result.rows} row(s) to anon`;
    if (result.rows > 0) leaked += 1;
    console.log(`  ${what.padEnd(34)} ${note}`);
  } else if (result.missing) {
    missing.add(migration);
    console.log(`  ${what.padEnd(34)} MISSING   run supabase/${migration}`);
  } else {
    console.log(`  ${what.padEnd(34)} ERROR ${result.status} ${result.code}`);
  }
}

console.log("");

if (leaked > 0) {
  console.log(`  ${leaked} table(s) returned rows to an anonymous caller. Stop and fix RLS.\n`);
  process.exit(2);
}

if (missing.size > 0) {
  console.log("  Unrun migrations, in order:\n");
  for (const m of [...missing].sort()) console.log(`    supabase/${m}`);
  console.log("\n  Paste each into the Supabase SQL editor and run it.\n");
  process.exit(1);
}

console.log("  Everything the code expects is there.\n");
console.log("  Not checked, because a public key cannot see them:");
console.log("    02-pro-gate.sql and 09-gates.sql, the paywall policies.");
console.log("    Verify those by signing in on a free account and being refused.\n");
