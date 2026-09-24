import { afterEach, describe, expect, it } from "vitest";

import { devPro } from "./supabase.js";

const before = { DEV_PRO: process.env.DEV_PRO, NODE_ENV: process.env.NODE_ENV };

afterEach(() => {
  process.env.DEV_PRO = before.DEV_PRO;
  process.env.NODE_ENV = before.NODE_ENV;
});

/**
 * Batch 9 exists because every feature the pricing screen sold was free. A
 * switch that makes them free again has to be hard to leave on by accident, so
 * these assertions are about what CANNOT happen rather than what can.
 */
describe("the testing-only Pro switch", () => {
  it("is off unless it is explicitly turned on", () => {
    delete process.env.DEV_PRO;
    process.env.NODE_ENV = "development";
    expect(devPro()).toBe(false);
  });

  it("is on when set in development", () => {
    process.env.DEV_PRO = "1";
    process.env.NODE_ENV = "development";
    expect(devPro()).toBe(true);
  });

  /** The assertion that matters. Shipping with it set must do nothing. */
  it("refuses to engage in production, however it is set", () => {
    process.env.NODE_ENV = "production";
    for (const value of ["1", "true", "yes", "TRUE"]) {
      process.env.DEV_PRO = value;
      expect(devPro()).toBe(false);
    }
  });

  /** Exactly "1", so a leftover "DEV_PRO=0" does not read as truthy. */
  it("takes only the one value", () => {
    process.env.NODE_ENV = "development";
    for (const value of ["0", "", "true", "yes", "no"]) {
      process.env.DEV_PRO = value;
      expect(devPro()).toBe(false);
    }
  });

  /**
   * Read when called, not when the module loads, so it is unaffected by when
   * .env arrives. See env.ts for the bug that makes this worth asserting.
   */
  it("reads the environment at call time", () => {
    process.env.NODE_ENV = "development";
    delete process.env.DEV_PRO;
    expect(devPro()).toBe(false);
    process.env.DEV_PRO = "1";
    expect(devPro()).toBe(true);
  });
});
