import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The environment has to be loaded before anything reads it.
 *
 * This is a source check rather than a behaviour check because the bug it
 * guards against cannot be reproduced in a test: it is about the order ES
 * modules are EVALUATED in, which is decided by the order imports are written.
 *
 * What went wrong: `process.loadEnvFile()` sat below the imports in `index.ts`.
 * Every import is evaluated before the importing module's body, so `supabase.ts`
 * read `SUPABASE_URL` and `paddle.ts` read `PADDLE_API_KEY` into module-level
 * constants while the environment was still empty, and those constants stayed
 * `undefined` for the life of the process.
 *
 * **The symptom is what let it survive.** `/api/health` said `draft: true`,
 * because `draftConfigured()` is a function and reads the environment when
 * called, while every authenticated route answered "Supabase is not configured
 * on the server" with the value plainly sitting in `.env`. Two reports of the
 * same file disagreeing is what a lazy read and an eager read look like from
 * outside.
 */

const SERVER = "server";

const sourceOf = (file: string): string => readFileSync(join(SERVER, file), "utf8");

describe("loading the environment", () => {
  const index = sourceOf("index.ts");

  it("is the first thing index.ts imports", () => {
    const imports = index
      .split("\n")
      .filter((l) => /^import\b/.test(l.trim()))
      .map((l) => l.trim());

    expect(imports[0]).toBe('import "./env.js";');
  });

  /** One loader. Two would each be correct and together would be confusing. */
  it("happens in exactly one place", () => {
    const loaders = readdirSync(SERVER)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) => sourceOf(f).includes("loadEnvFile"));

    expect(loaders).toEqual(["env.ts"]);
  });

  /**
   * The rule this all exists for. A module that reads `process.env` while it is
   * being evaluated is a module that must be evaluated after `env.ts`, and the
   * only thing keeping that true is the import above.
   *
   * Listed by name rather than counted, so adding one is a deliberate act that
   * shows up in a diff next to this comment.
   */
  it("knows which modules read the environment as they load", () => {
    const eager = readdirSync(SERVER)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "env.ts")
      .filter((f) =>
        sourceOf(f)
          .split("\n")
          // A top-level `const X = process.env...`, which runs at import time.
          // Anything indented is inside a function and reads when called.
          .some((l) => /^const .*process\.env/.test(l)),
      )
      .sort();

    // `index.ts` is on this list and is safe: it is the file whose first import
    // is `env.js`, so by the time its own body reads PORT the file is loaded.
    // The other four are safe only because nothing imports them before it.
    expect(eager).toEqual([
      "billing.ts",
      "index.ts",
      "paddle.ts",
      // TRUST_PROXY_HOPS, which decides how far into x-forwarded-for the
      // webhook allowlist looks. Reading it late would be safer still, but it
      // cannot change while the process runs and a module constant says so.
      "paddleips.ts",
      "supabase.ts",
    ]);
  });
});
