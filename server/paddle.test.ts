import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  entitlementOf,
  planForPrice,
  SIGNATURE_WINDOW_MS,
  userIdOn,
  verifySignature,
  type PaddleSubscription,
} from "./paddle.js";

/**
 * The three ways a billing integration goes wrong without anybody noticing:
 * it trusts a request it should not, it grants the wrong plan, or it decides
 * somebody is unpaid on a day they are not. None of the three throws, all three
 * are pure, so all three are tested here.
 */

const SECRET = "pdl_ntfset_test";
const NOW = 1_770_000_000_000;
const TS = Math.floor(NOW / 1000);

/** `Paddle-Signature: ts=...;h1=...`, over `${ts}:${body}`. */
const sign = (body: string, ts: number = TS, secret: string = SECRET): string =>
  `ts=${ts};h1=${createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")}`;

const PRICES = { pro: "pri_pro_monthly", agency: "pri_agency_monthly" };

describe("is this webhook genuine", () => {
  const body = JSON.stringify({ event_type: "subscription.created" });

  it("accepts a correctly signed body", () => {
    expect(verifySignature(Buffer.from(body), sign(body), SECRET, NOW)).toBe(true);
  });

  /**
   * The timestamp is part of what is signed, and hashing the body alone is the
   * easy mistake: it verifies nothing that was actually sent, and it fails
   * closed, so it looks like Paddle misbehaving.
   */
  it("rejects a signature taken over the body without the timestamp", () => {
    const naive = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifySignature(Buffer.from(body), `ts=${TS};h1=${naive}`, SECRET, NOW)).toBe(false);
  });

  /**
   * The attack this exists to stop: anybody who learns the webhook URL POSTing
   * themselves a subscription. Without verification the route is an open door.
   */
  it("rejects a body signed with the wrong secret", () => {
    expect(verifySignature(Buffer.from(body), sign(body, TS, "nope"), SECRET, NOW)).toBe(false);
  });

  it("rejects a body that changed after it was signed", () => {
    const signature = sign(body);
    const tampered = JSON.stringify({ event_type: "subscription.canceled" });
    expect(verifySignature(Buffer.from(tampered), signature, SECRET, NOW)).toBe(false);
  });

  it("rejects a timestamp moved after the fact, since it is signed too", () => {
    const signature = sign(body);
    const moved = signature.replace(`ts=${TS}`, `ts=${TS + 1}`);
    expect(verifySignature(Buffer.from(body), moved, SECRET, NOW)).toBe(false);
  });

  it("rejects a missing or malformed header rather than trusting it", () => {
    expect(verifySignature(Buffer.from(body), undefined, SECRET, NOW)).toBe(false);
    expect(verifySignature(Buffer.from(body), "", SECRET, NOW)).toBe(false);
    expect(verifySignature(Buffer.from(body), "garbage", SECRET, NOW)).toBe(false);
    expect(verifySignature(Buffer.from(body), `h1=${"a".repeat(64)}`, SECRET, NOW)).toBe(false);
    expect(verifySignature(Buffer.from(body), `ts=notanumber;h1=abc`, SECRET, NOW)).toBe(false);
  });

  /**
   * `timingSafeEqual` THROWS on a length mismatch rather than returning false.
   * An unhandled throw here would be a 500 where a 400 belongs, and on a route
   * the provider retries, so a short signature must be an ordinary refusal.
   */
  it("refuses a wrong-length signature without throwing", () => {
    expect(() => verifySignature(Buffer.from(body), `ts=${TS};h1=abc`, SECRET, NOW)).not.toThrow();
    expect(verifySignature(Buffer.from(body), `ts=${TS};h1=abc`, SECRET, NOW)).toBe(false);
  });

  /** Paddle versions this header by adding parts. An unknown one is not fatal. */
  it("ignores parts it does not know about", () => {
    expect(verifySignature(Buffer.from(body), `${sign(body)};h2=whatever`, SECRET, NOW)).toBe(true);
  });

  it("survives a body with multi-byte characters", () => {
    const wide = JSON.stringify({ name: "Ünïcodé ✓ 日本語" });
    expect(verifySignature(Buffer.from(wide), sign(wide), SECRET, NOW)).toBe(true);
  });

  describe("the replay window", () => {
    it("accepts a delivery inside it, in either direction", () => {
      const early = TS - 60;
      const late = TS + 60;
      expect(verifySignature(Buffer.from(body), sign(body, early), SECRET, NOW)).toBe(true);
      // A clock a minute ahead of ours is a container with drift, not an attack.
      expect(verifySignature(Buffer.from(body), sign(body, late), SECRET, NOW)).toBe(true);
    });

    it("refuses one from far enough back to be a replay", () => {
      const old = TS - Math.floor(SIGNATURE_WINDOW_MS / 1000) - 60;
      expect(verifySignature(Buffer.from(body), sign(body, old), SECRET, NOW)).toBe(false);
    });

    /**
     * Wide enough that ordinary clock drift does not start refusing real
     * webhooks. A refused webhook means somebody who paid does not get their
     * plan, and the HMAC is what stops forgery: this only bounds replay.
     */
    it("is wide enough to survive a drifting clock", () => {
      expect(SIGNATURE_WINDOW_MS).toBeGreaterThanOrEqual(60_000);
    });
  });
});

describe("what did they buy", () => {
  it("maps a configured price to its plan", () => {
    expect(planForPrice("pri_pro_monthly", PRICES)).toBe("pro");
    expect(planForPrice("pri_agency_monthly", PRICES)).toBe("agency");
  });

  /**
   * Another product in the same account, or a price rotated without updating
   * the environment. Guessing would hand out a plan nobody bought.
   */
  it("refuses to guess at an unknown price", () => {
    expect(planForPrice("pri_something_else", PRICES)).toBe("free");
  });

  it("is free for a missing price", () => {
    expect(planForPrice(null, PRICES)).toBe("free");
    expect(planForPrice(undefined, PRICES)).toBe("free");
    expect(planForPrice("", PRICES)).toBe("free");
  });

  /** An unconfigured plan must not match an unconfigured price id. */
  it("does not match when the env is empty", () => {
    expect(planForPrice("pri_pro_monthly", { pro: undefined, agency: undefined })).toBe("free");
  });
});

describe("do they have it right now", () => {
  const sub = (over: Partial<PaddleSubscription> = {}): PaddleSubscription => ({
    id: "sub_1",
    status: "active",
    customer_id: "ctm_1",
    next_billed_at: "2026-11-01T00:00:00.000Z",
    current_billing_period: { starts_at: "2026-10-01T00:00:00.000Z", ends_at: "2026-11-01T00:00:00.000Z" },
    scheduled_change: null,
    items: [{ price: { id: "pri_pro_monthly" } }],
    ...over,
  });

  it("entitles an active subscription and reads its next payment date", () => {
    expect(entitlementOf(sub(), PRICES)).toEqual({
      plan: "pro",
      entitled: true,
      renewsAt: "2026-11-01T00:00:00.000Z",
      endsAtPeriodEnd: false,
    });
  });

  it("entitles a trial", () => {
    expect(entitlementOf(sub({ status: "trialing" }), PRICES).entitled).toBe(true);
  });

  /**
   * Retries are still running. Cutting somebody off over a card that expired on
   * Tuesday is a support ticket, not a policy.
   */
  it("entitles past_due, because the payment may still succeed", () => {
    expect(entitlementOf(sub({ status: "past_due" }), PRICES).entitled).toBe(true);
  });

  /**
   * THE one that differs from the provider this replaced, and the reason this
   * function is pure and tested.
   *
   * The old provider's `cancelled` meant "stopped renewing, paid period runs
   * on", so it had to count as entitled. Paddle keeps a cancelling subscription
   * `active` with a scheduled change until the period ends, and only then marks
   * it `canceled`. Carrying the old set across would have granted a plan, for
   * ever, to everybody whose subscription had genuinely ended.
   */
  it("keeps a subscription cancelling at period end entitled, and dates the end", () => {
    const out = entitlementOf(
      sub({ scheduled_change: { action: "cancel", effective_at: "2026-10-15T00:00:00.000Z" } }),
      PRICES,
    );
    expect(out.entitled).toBe(true);
    expect(out.plan).toBe("pro");
    expect(out.endsAtPeriodEnd).toBe(true);
    // The date shown has to be when access STOPS, not a payment that will never
    // be taken. Reading next_billed_at here is how somebody is told their
    // cancelled plan renews next month.
    expect(out.renewsAt).toBe("2026-10-15T00:00:00.000Z");
  });

  it("falls back to the end of the billing period when the change has no date", () => {
    const out = entitlementOf(sub({ scheduled_change: { action: "cancel" } }), PRICES);
    expect(out.renewsAt).toBe("2026-11-01T00:00:00.000Z");
  });

  /** A pause or a resume is scheduled the same way and is not an ending. */
  it("does not treat a scheduled pause as an ending", () => {
    const out = entitlementOf(
      sub({ scheduled_change: { action: "pause", effective_at: "2026-10-15T00:00:00.000Z" } }),
      PRICES,
    );
    expect(out.endsAtPeriodEnd).toBe(false);
    expect(out.renewsAt).toBe("2026-11-01T00:00:00.000Z");
  });

  it("drops a canceled subscription to free, because in Paddle it is over", () => {
    expect(entitlementOf(sub({ status: "canceled" }), PRICES)).toEqual({
      plan: "free",
      entitled: false,
      renewsAt: null,
      endsAtPeriodEnd: false,
    });
  });

  it("drops paused to free", () => {
    expect(entitlementOf(sub({ status: "paused" }), PRICES).entitled).toBe(false);
  });

  it("drops an unrecognised status to free rather than assuming the best", () => {
    expect(entitlementOf(sub({ status: "something_new" }), PRICES).entitled).toBe(false);
    expect(entitlementOf({}, PRICES).entitled).toBe(false);
  });

  /**
   * Entitled by status but carrying a price we do not sell. The plan is free, so
   * nothing is unlocked, and `planForPrice` has already warned. Granting Pro
   * because the status looked healthy would be the worse failure.
   */
  it("grants nothing when the status is fine but the price is unknown", () => {
    const out = entitlementOf(sub({ items: [{ price: { id: "pri_other" } }] }), PRICES);
    expect(out.entitled).toBe(true);
    expect(out.plan).toBe("free");
  });

  it("survives a subscription with no items at all", () => {
    expect(entitlementOf(sub({ items: [] }), PRICES).plan).toBe("free");
    expect(entitlementOf(sub({ items: [{ price: null }] }), PRICES).plan).toBe("free");
  });
});

describe("which user a payment belongs to", () => {
  it("reads the id we put on the checkout", () => {
    expect(userIdOn({ custom_data: { user_id: "abc-123" } })).toBe("abc-123");
  });

  /** Anything else is not an id, and half an id is worse than none. */
  it("is null for anything that is not a non-empty string", () => {
    expect(userIdOn({})).toBe(null);
    expect(userIdOn({ custom_data: null })).toBe(null);
    expect(userIdOn({ custom_data: {} })).toBe(null);
    expect(userIdOn({ custom_data: { user_id: "" } })).toBe(null);
    expect(userIdOn({ custom_data: { user_id: 12345 } })).toBe(null);
  });
});
