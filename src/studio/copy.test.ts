import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * No em dashes. Anywhere. Ever.
 *
 * A tidy-up is a one-off; a rule needs something that fails. Without this the
 * character walks back in the first time anybody writes a sentence with a
 * parenthetical in it, and nobody notices until it is on the landing page.
 *
 * Three places genuinely need the CHARACTER, because it arrives in data we do
 * not control: LinkedIn writes one for "no data" in its analytics export, and
 * transcripts use one as a speaker separator. Those are written `\\u2014`, which
 * is deliberate, greppable, and passes this test.
 *
 * The box-drawing character used in section separators is U+2500, a different
 * character entirely, and is not what this is about.
 */

// Built from its code point so this file contains no literal either, which
// means the scan below does not have to skip itself. A guard with a blind
// spot in it is a guard that will eventually be wrong about the one file
// somebody edits.
const EM_DASH = String.fromCharCode(0x2014);

const SOURCE = ["src", "server", "scripts", "docs", "supabase"];
const EXTENSIONS = [".ts", ".tsx", ".css", ".mjs", ".md", ".sql"];

// Checked by name rather than by extension, and at the repo root, where the
// walk above never goes. `.env.example` is the first file a new contributor
// opens and it had carried an em dash through two cleanups unnoticed.
const ROOT_FILES = ["index.html", ".env.example"];
const SKIP = new Set(["node_modules", "dist", ".git", ".vite"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXTENSIONS.some((e) => entry.endsWith(e))) out.push(path);
  }
  return out;
}

describe("punctuation", () => {
  it("has no literal em dash in any source file", () => {
    const offenders: string[] = [];

    for (const dir of SOURCE) {
      for (const file of walk(dir)) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (line.includes(EM_DASH)) {
            offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 80)}`);
          }
        });
      }
    }

    expect(offenders).toEqual([]);
  });

  /** The HTML shell a visitor reads, and the env file a contributor reads. */
  it("has none in the root files the walk does not reach", () => {
    const offenders = ROOT_FILES.filter((f) => readFileSync(f, "utf8").includes(EM_DASH));
    expect(offenders).toEqual([]);
  });
});
