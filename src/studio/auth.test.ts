import { describe, expect, it } from "vitest";

import { CODE_LENGTH, cleanCode, explain, looksLikeEmail, normaliseEmail } from "./auth.js";

describe("addresses", () => {
  it("lowercases and trims, so one person is one account", () => {
    expect(normaliseEmail("  Sam@Example.COM ")).toBe("sam@example.com");
  });

  it("accepts an ordinary address and refuses the obvious mistakes", () => {
    expect(looksLikeEmail("sam@example.com")).toBe(true);
    expect(looksLikeEmail("sam@example")).toBe(false);
    expect(looksLikeEmail("sam example.com")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });
});

describe("the code", () => {
  it("keeps six digits and nothing else", () => {
    expect(cleanCode("123456")).toBe("123456");
    expect(cleanCode("123 456")).toBe("123456");
    expect(cleanCode("123-456")).toBe("123456");
  });

  /** People paste from an email client that helpfully adds whitespace. */
  it("survives a messy paste", () => {
    expect(cleanCode(" 12 34 56 \n")).toBe("123456");
  });

  it("never returns more than the code length", () => {
    expect(cleanCode("1234567890")).toHaveLength(CODE_LENGTH);
  });

  it("is empty when there are no digits at all", () => {
    expect(cleanCode("abcdef")).toBe("");
  });
});

/**
 * Supabase's own wording, translated into something somebody can act on.
 * "email rate limit exceeded" on its own reads as the user's fault; it is a
 * project still on the built-in mailer, and nobody can fix what they are not told.
 */
describe("explaining a failure", () => {
  it("turns the rate limit into the configuration fact it is", () => {
    const out = explain("email rate limit exceeded");
    expect(out).toContain("built-in mailer");
    expect(out).toContain("SMTP");
  });

  it("catches the other phrasings of the same thing", () => {
    expect(explain("Too many requests")).toContain("built-in mailer");
  });

  it("says a stale code is stale", () => {
    expect(explain("Token has expired or is invalid")).toContain("expired");
  });

  it("names the setting when sign-ups are off", () => {
    expect(explain("Signups not allowed for otp")).toContain("Authentication");
  });

  it("passes anything it does not recognise through unchanged", () => {
    expect(explain("Network request failed")).toBe("Network request failed");
  });
});
