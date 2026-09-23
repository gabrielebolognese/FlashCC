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

const EM_DASH = "—";

const SOURCE = ["src", "server", "scripts"];
const EXTENSIONS = [".ts", ".tsx", ".css", ".mjs"];
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
        // This file has to name the character to test for it.
        if (file.endsWith("copy.test.ts")) continue;

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

  /** The HTML shell is the first thing a visitor and a crawler both read. */
  it("has none in index.html either", () => {
    expect(readFileSync("index.html", "utf8")).not.toContain(EM_DASH);
  });
});
