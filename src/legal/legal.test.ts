import { describe, expect, it } from "vitest";

import { COMPANY, danglingAnchors, inlines, parse, plain, type LegalDoc } from "./legal.js";
import { PLANS } from "../studio/Upgrade.js";
import { PRIVACY } from "./privacy.js";
import { REFUND_DAYS, REFUNDS, RENEWAL_REFUND_DAYS } from "./refunds.js";
import { TERMS } from "./terms.js";

const DOCS: LegalDoc[] = [PRIVACY, TERMS, REFUNDS];

/**
 * Two kinds of test here, and the second kind is the point.
 *
 * The parser tests are ordinary. The document tests are guards on a legal text:
 * a stale product name, a table of contents pointing at a heading that was
 * renamed, a missing contact address. Every one of those is invisible on the page
 * and is exactly what a payment provider's review catches instead.
 */

describe("inline markup", () => {
  it("reads bold and links, and leaves the rest alone", () => {
    expect(inlines("plain")).toEqual([{ k: "text", text: "plain" }]);
    expect(inlines("a **b** c")).toEqual([
      { k: "text", text: "a " },
      { k: "bold", text: "b" },
      { k: "text", text: " c" },
    ]);
    expect(inlines("see [here](https://x.test) now")).toEqual([
      { k: "text", text: "see " },
      { k: "link", text: "here", href: "https://x.test" },
      { k: "text", text: " now" },
    ]);
  });

  /**
   * Legal prose is full of characters a fuller Markdown parser would eat: an
   * underscore in an address, a stray asterisk, a bracket in a citation.
   */
  it("does not invent markup a Markdown library would", () => {
    expect(inlines("_not italic_")).toEqual([{ k: "text", text: "_not italic_" }]);
    expect(inlines("2 * 3 * 4")).toEqual([{ k: "text", text: "2 * 3 * 4" }]);
    expect(inlines("[bracketed] but no url")).toEqual([
      { k: "text", text: "[bracketed] but no url" },
    ]);
  });

  it("handles several of each in one line", () => {
    const out = inlines("**a** and [b](u) and **c**");
    expect(out.filter((s) => s.k === "bold")).toHaveLength(2);
    expect(out.filter((s) => s.k === "link")).toHaveLength(1);
  });
});

describe("block parsing", () => {
  it("gives a heading its explicit anchor", () => {
    expect(parse("## {infocollect} 1. WHAT WE COLLECT")).toEqual([
      { k: "h2", id: "infocollect", text: "1. WHAT WE COLLECT" },
    ]);
  });

  it("joins wrapped lines into one paragraph and splits on a blank line", () => {
    const out = parse("one line\nand its wrap\n\na second one");
    expect(out).toHaveLength(2);
    expect(plain(out)).toBe("one line and its wrap\na second one");
  });

  it("reads a list, and closes the paragraph that introduced it", () => {
    const out = parse("We collect:\n- email\n- password");
    expect(out.map((b) => b.k)).toEqual(["p", "ul"]);
    expect(out[1]!.k === "ul" && out[1]!.items).toHaveLength(2);
  });

  it("reads a table, and drops the rule under its header", () => {
    const out = parse("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |");
    expect(out).toHaveLength(1);
    const table = out[0]!;
    expect(table.k).toBe("table");
    if (table.k !== "table") return;
    expect(table.head).toEqual(["A", "B"]);
    expect(table.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("keeps an empty trailing cell rather than dropping the column", () => {
    // The US state table has a row whose middle cell is deliberately blank.
    const out = parse("| A | B | C |\n|---|---|---|\n| L. Sensitive | | NO |");
    const table = out[0]!;
    if (table.k !== "table") throw new Error("expected a table");
    expect(table.rows[0]).toEqual(["L. Sensitive", "", "NO"]);
  });

  it("reads a quoted line as the italic summary, not as a paragraph", () => {
    const out = parse("> **In Short:** we do a thing");
    expect(out[0]!.k).toBe("note");
  });

  it("does not run a heading into the paragraph above it", () => {
    const out = parse("some text\n### A subheading\nmore text");
    expect(out.map((b) => b.k)).toEqual(["p", "h3", "p"]);
  });

  it("is empty for an empty document", () => {
    expect(parse("")).toEqual([]);
    expect(parse("\n\n   \n")).toEqual([]);
  });
});

describe.each(DOCS.map((d) => [d.title, d] as const))("%s", (_title, doc) => {
  const text = plain(parse(doc.body));

  /**
   * The rename this document exists for. A single surviving mention is the kind
   * of thing nobody reads far enough down the page to notice.
   */
  it("says FlashCC and never the old product name", () => {
    expect(text).toContain("FlashCC");
    expect(text.toLowerCase()).not.toContain("flashfx");
  });

  /**
   * Split from the positive check on purpose. Every document must never name the
   * old domain; only the two that describe where the Services live have a reason
   * to name the new one, and the refund policy is about money rather than about a
   * website. Asserting the positive here would have been a test insisting on a
   * sentence that does not belong.
   */
  it("never points at the old domain", () => {
    expect(text.toLowerCase()).not.toContain("flashfx.app");
  });

  /**
   * A table of contents entry pointing at an id no heading carries is a dead
   * link, and it looks exactly like a working one.
   */
  it("has a table of contents whose every anchor exists", () => {
    expect(danglingAnchors(doc)).toEqual([]);
  });

  it("lists every section it actually has", () => {
    const ids = parse(doc.body).flatMap((b) => (b.k === "h2" ? [b.id] : []));
    const listed = new Set(doc.contents.map((c) => c.id));
    // A heading that is not in the contents is allowed only for the preamble,
    // which is not a numbered section.
    const unlisted = ids.filter((id) => !listed.has(id));
    expect(unlisted.every((id) => id === "summary" || id === "agreement")).toBe(true);
  });

  /** Paddle's review looks for these, and so does anybody with a complaint. */
  it("can be contacted, by email and by post", () => {
    expect(text).toMatch(/@/);
    expect(text).toContain(COMPANY.town);
    expect(text).toContain(COMPANY.country);
  });

  it("says when it was last updated", () => {
    expect(doc.updated).toMatch(/\d{4}/);
  });

  it("is served from a real path", () => {
    expect(doc.path.startsWith("/")).toBe(true);
  });

  it("renders something substantial rather than a stub", () => {
    expect(text.length).toBeGreaterThan(5000);
  });
});

describe("the documents that describe the Services", () => {
  it("names the site those Services are at", () => {
    for (const doc of [PRIVACY, TERMS]) {
      expect(plain(parse(doc.body))).toContain(COMPANY.site);
    }
  });
});

describe("the privacy notice specifically", () => {
  const text = plain(parse(PRIVACY.body));

  /**
   * The one deviation from "keep everything else the same" that was not asked
   * for. The source named Stripe as the processor of all payment data; FlashCC
   * takes money through Paddle, and a notice naming the wrong processor is
   * inaccurate on the one point Paddle's own verification reads it for.
   */
  it("names Paddle as the payment processor, not the old one", () => {
    expect(text).toContain("Paddle");
    expect(text).not.toContain("Stripe");
  });

  it("still discloses the AI providers", () => {
    expect(text).toContain("Anthropic");
  });

  it("keeps the request form both documents linked to", () => {
    expect(PRIVACY.body).toContain(COMPANY.dsar);
  });
});

describe("the terms specifically", () => {
  const text = plain(parse(TERMS.body));

  it("names the company, which is what a payment provider checks", () => {
    expect(text).toContain(COMPANY.short);
  });

  it("links to the privacy notice at its real path", () => {
    expect(TERMS.body).toContain("(/privacy)");
  });

  /**
   * The terms still carry only the cancellation clause. The money-back guarantee
   * lives in its own policy, which is where Paddle's review looks for it, and
   * this asserts the terms' own wording did not drift while that was written.
   */
  it("keeps its cancellation clause, with the guarantee in the refund policy", () => {
    expect(text).toContain("cancellation will take effect at the end of the current paid term");
  });
});

describe("the refund policy specifically", () => {
  const text = plain(parse(REFUNDS.body));

  /**
   * The number Paddle's seller verification asks for. Their own buyer policy is
   * 14 days statutory in the EU and as little as 5 elsewhere, and it says the
   * highest level of rights applies, so this figure is the operative one for our
   * customers and it has to be at least 30.
   */
  it("promises at least the 30 days Paddle expects of a seller", () => {
    expect(REFUND_DAYS).toBeGreaterThanOrEqual(30);
    expect(text).toContain(`${REFUND_DAYS} days of your first payment`);
    expect(text.toLowerCase()).toContain("money-back guarantee");
  });

  /** Never below the statutory window it is measured against. */
  it("never offers a renewal less than the statutory 14 days", () => {
    expect(RENEWAL_REFUND_DAYS).toBeGreaterThanOrEqual(14);
  });

  it("names Paddle as the party that issues the refund", () => {
    expect(text).toContain("Paddle");
    expect(text).toContain("merchant of record");
    expect(text).toContain("paddle.net");
  });

  it("says statutory rights are not reduced, and that the higher one wins", () => {
    expect(text.toLowerCase()).toContain("statutory");
    expect(text).toContain("the law wins");
  });

  it("says how to ask and how long it takes", () => {
    expect(text).toContain("original payment method");
    expect(text).toMatch(/\d+ working days/);
  });

  /**
   * Invariant 7 reaching the exit. A refund that subtracted for usage would be a
   * rationing system arriving at the door, and it would contradict the promise
   * the pricing screen makes two clicks earlier.
   */
  it("deducts nothing for use, because nothing is metered", () => {
    expect(text).toContain("Nothing is deducted for use");
    expect(text.toLowerCase()).toContain("no credits to subtract");
  });

  /**
   * The four promises on the pricing screen are the ones people read first. A
   * refund policy contradicting any of them would make one surface a lie.
   */
  it("agrees with the pricing screen about cancelling and about your work", () => {
    expect(text).toContain("Cancelling and refunding are different things");
    expect(text).toContain("your work stays yours");
    expect(text.toLowerCase()).toContain("no retention call");
  });

  it("does not refuse a refund for any of the reasons people complain about", () => {
    expect(text).toContain("We do not refuse a refund because you used the product");
  });
});

/**
 * The terms say every payment is in Euros. The pricing screen is the other half
 * of that sentence, and a screen showing dollars against a contract promising
 * euros is both the mismatch Paddle's verification looks for and the "price you
 * agreed to is the price" promise broken before anybody has paid.
 */
describe("the prices and the terms agree", () => {
  it("states every plan in euros", () => {
    for (const tier of PLANS) {
      expect(tier.price).toContain("€");
      expect(tier.price).not.toContain("$");
    }
  });

  it("is the currency the terms commit to", () => {
    expect(plain(parse(TERMS.body))).toContain("All payments shall be in Euros");
  });
});
