import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { entitlementOf, planForVariant, verifySignature } from "./lemon.js";

/**
 * The three ways a billing integration goes wrong without anybody noticing:
 * it trusts a request it should not, it grants the wrong plan, or it decides
 * somebody is unpaid on a day they are not. None of the three throws, all three
 * are pure, so all three are tested here.
 */

const SECRET = "test-signing-secret";
const sign = (body: string): string => createHmac("sha256", SECRET).update(body).digest("hex");

const VARIANTS = { pro: "111111", agency: "222222" };

describe("is this webhook genuine", () => {
  const body = JSON.stringify({ meta: { event_name: "subscription_created" } });

  it("accepts a correctly signed body", () => {
    expect(verifySignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  /**
   * The attack this exists to stop: anybody who learns the webhook URL POSTing
   * themselves a subscription. Without verification the route is an open door.
   */
  it("rejects a body signed with the wrong secret", () => {
    const forged = createHmac("sha256", "not-the-secret").update(body).digest("hex");
    expect(verifySignature(Buffer.from(body), forged, SECRET)).toBe(false);
  });

  it("rejects a body that changed after it was signed", () => {
    const signature = sign(body);
    const tampered = JSON.stringify({ meta: { event_name: "subscription_expired" } });
    expect(verifySignature(Buffer.from(tampered), signature, SECRET)).toBe(false);
  });

  it("rejects a missing signature rather than trusting it", () => {
    expect(verifySignature(Buffer.from(body), undefined, SECRET)).toBe(false);
    expect(verifySignature(Buffer.from(body), "", SECRET)).toBe(false);
  });

  /**
   * `timingSafeEqual` THROWS on a length mismatch rather than returning false.
   * An unhandled throw here would be a 500 where a 400 belongs, and on a route
   * the provider retries, so a short header must be an ordinary refusal.
   */
  it("refuses a wrong-length signature without throwing", () => {
    expect(() => verifySignature(Buffer.from(body), "abc", SECRET)).not.toThrow();
    expect(verifySignature(Buffer.from(body), "abc", SECRET)).toBe(false);
  });

  it("survives a body with multi-byte characters", () => {
    const wide = JSON.stringify({ name: "Ünïcodé ✓ 日本語" });
    expect(verifySignature(Buffer.from(wide), sign(wide), SECRET)).toBe(true);
  });
});

describe("what did they buy", () => {
  it("maps a configured variant to its plan", () => {
    expect(planForVariant("111111", VARIANTS)).toBe("pro");
    expect(planForVariant("222222", VARIANTS)).toBe("agency");
  });

  /** The API sends numbers, the environment holds strings. */
  it("compares a numeric id from the API against the string in the env", () => {
    expect(planForVariant(111111, VARIANTS)).toBe("pro");
  });

  /**
   * Another product in the same store, or a variant rotated without updating the
   * environment. Guessing would hand out a plan nobody bought.
   */
  it("refuses to guess at an unknown variant", () => {
    expect(planForVariant("999999", VARIANTS)).toBe("free");
  });

  it("is free for a missing variant", () => {
    expect(planForVariant(null, VARIANTS)).toBe("free");
    expect(planForVariant(undefined, VARIANTS)).toBe("free");
  });

  /** An unconfigured plan must not match an unconfigured variant id. */
  it("does not match when the env is empty", () => {
    expect(planForVariant("111111", { pro: undefined, agency: undefined })).toBe("free");
  });
});

describe("do they have it right now", () => {
  const sub = (over: Record<string, unknown>) => ({
    variant_id: 111111,
    renews_at: "2026-11-01T00:00:00.000Z",
    ends_at: null,
    ...over,
  });

  it("entitles an active subscription and reads its renewal date", () => {
    expect(entitlementOf(sub({ status: "active" }), VARIANTS)).toEqual({
      plan: "pro",
      entitled: true,
      renewsAt: "2026-11-01T00:00:00.000Z",
      endsAtPeriodEnd: false,
    });
  });

  it("entitles a trial", () => {
    expect(entitlementOf(sub({ status: "on_trial" }), VARIANTS).entitled).toBe(true);
  });

  /**
   * Retries are still running. Cutting somebody off over a card that expired on
   * Tuesday is a support ticket, not a policy.
   */
  it("entitles past_due, because the payment may still succeed", () => {
    expect(entitlementOf(sub({ status: "past_due" }), VARIANTS).entitled).toBe(true);
  });

  /**
   * The one that matters most. In Lemon Squeezy `cancelled` means future
   * payments are stopped while the period already paid for runs on. Treating it
   * as unpaid would take away, the moment somebody clicks cancel, the month they
   * have already been charged for. That is the complaint the billing terms on
   * the upgrade screen promise this product does not have.
   */
  it("keeps a cancelled subscription entitled until the period ends", () => {
    const out = entitlementOf(
      sub({ status: "cancelled", ends_at: "2026-10-15T00:00:00.000Z" }),
      VARIANTS,
    );
    expect(out.entitled).toBe(true);
    expect(out.plan).toBe("pro");
    expect(out.endsAtPeriodEnd).toBe(true);
    // The date shown has to be when access STOPS, not a renewal that will never
    // happen. Reading renews_at here is how somebody is told their cancelled
    // plan renews next month.
    expect(out.renewsAt).toBe("2026-10-15T00:00:00.000Z");
  });

  it("drops an expired subscription to free", () => {
    expect(entitlementOf(sub({ status: "expired" }), VARIANTS)).toEqual({
      plan: "free",
      entitled: false,
      renewsAt: null,
      endsAtPeriodEnd: false,
    });
  });

  /** Retries exhausted. This one really has not been paid. */
  it("drops unpaid to free", () => {
    expect(entitlementOf(sub({ status: "unpaid" }), VARIANTS).entitled).toBe(false);
  });

  it("drops paused to free", () => {
    expect(entitlementOf(sub({ status: "paused" }), VARIANTS).entitled).toBe(false);
  });

  it("drops an unrecognised status to free rather than assuming the best", () => {
    expect(entitlementOf(sub({ status: "something_new" }), VARIANTS).entitled).toBe(false);
    expect(entitlementOf(sub({}), VARIANTS).entitled).toBe(false);
  });

  /**
   * Entitled by status but carrying a variant we do not sell. The plan is free,
   * so nothing is unlocked, and `planForVariant` has already warned. Granting
   * Pro because the status looked healthy would be the worse failure.
   */
  it("grants nothing when the status is fine but the variant is unknown", () => {
    const out = entitlementOf(sub({ status: "active", variant_id: 999999 }), VARIANTS);
    expect(out.entitled).toBe(true);
    expect(out.plan).toBe("free");
  });
});
