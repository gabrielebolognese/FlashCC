import { describe, expect, it } from "vitest";

import { isPaywall, onPaywall, PaywallError, readRefusal } from "./gate.js";
import { versionKeysIn } from "./versions.js";

const refusal = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("reading a refusal", () => {
  /**
   * 402 is an offer and 403 is a wall. Getting this wrong turns an upgrade
   * prompt into "Drafting failed (403)", which reads as a bug and sells nothing.
   */
  it("turns a 402 into a PaywallError", async () => {
    const error = await readRefusal(refusal(402, { error: "AI drafting is part of Pro." }));
    expect(isPaywall(error)).toBe(true);
    expect(error.message).toContain("part of Pro");
  });

  it("names the feature from the server's own wording", async () => {
    const error = await readRefusal(refusal(402, { error: "Hook variants is part of Pro." }));
    expect((error as PaywallError).feature).toBe("Hook variants");
  });

  it("leaves every other status an ordinary error", async () => {
    for (const status of [400, 401, 403, 429, 500, 503]) {
      const error = await readRefusal(refusal(status, { error: "Nope" }));
      expect(isPaywall(error)).toBe(false);
      expect(error.message).toBe("Nope");
    }
  });

  it("says something useful when the body is not JSON", async () => {
    const error = await readRefusal(new Response("<html>502</html>", { status: 502 }));
    expect(error.message).toContain("502");
  });

  it("announces the wall so the panel can open", async () => {
    const seen: string[] = [];
    const off = onPaywall((feature) => seen.push(feature));

    await readRefusal(refusal(402, { error: "Exporting numbered images is part of Pro." }));
    expect(seen).toEqual(["Exporting numbered images"]);

    // And stops when the listener goes away, or a remounted App would stack up
    // one panel per mount.
    off();
    await readRefusal(refusal(402, { error: "AI drafting is part of Pro." }));
    expect(seen).toHaveLength(1);
  });

  it("does not announce anything for an ordinary failure", async () => {
    const seen: string[] = [];
    const off = onPaywall((f) => seen.push(f));
    await readRefusal(refusal(500, { error: "Broken" }));
    off();
    expect(seen).toEqual([]);
  });
});

describe("sweeping version history on sign-out", () => {
  /**
   * `forgetLocal` cleared docs, posts, brands, clients and assets and left whole
   * documents behind in per-document version keys — for whoever signed in next
   * on a shared machine.
   */
  it("finds every version key and nothing else", () => {
    const keys = [
      "flashcc:v1:versions:d_1",
      "flashcc:v1:versions:d_2",
      "flashcc:v3:index",
      "flashcc:v1:brands",
      "flashcc:v1:posts",
      "unrelated",
    ];
    expect(versionKeysIn(keys)).toEqual(["flashcc:v1:versions:d_1", "flashcc:v1:versions:d_2"]);
  });

  it("is empty when there are none", () => {
    expect(versionKeysIn(["flashcc:v3:index"])).toEqual([]);
  });
});
