import { describe, expect, it } from "vitest";

import {
  applyMatches,
  matchRows,
  normaliseTitle,
  normaliseUrl,
  parseAnalytics,
  readDate,
  readNumber,
  SAMPLE_ANALYTICS,
  type AnalyticsRow,
} from "./linkedin.js";
import { makePost, type Post } from "./pipeline.js";

const post = (patch: Partial<Post>): Post => makePost(patch);

const row = (patch: Partial<AnalyticsRow> = {}): AnalyticsRow => ({
  line: 2,
  url: null,
  title: "",
  postedAt: null,
  metrics: {},
  ...patch,
});

describe("reading numbers", () => {
  it("takes the formats an export actually uses", () => {
    expect(readNumber("12480")).toBe(12480);
    expect(readNumber("12,480")).toBe(12480);
    expect(readNumber("12 480")).toBe(12480);
    expect(readNumber("4.5%")).toBe(5);
  });

  /**
   * Blank is not zero. Writing a fabricated zero into the median every insight
   * screen runs on is worse than having no number for that post.
   */
  it("returns null rather than zero for anything it cannot read", () => {
    expect(readNumber("")).toBeNull();
    expect(readNumber("\u2014")).toBeNull();
    expect(readNumber("n/a")).toBeNull();
  });

  it("never returns a negative", () => {
    expect(readNumber("-5")).toBe(0);
  });
});

describe("reading dates", () => {
  it("takes ISO without letting Date guess at it", () => {
    expect(readDate("2026-09-22T10:00:00Z")).toBe("2026-09-22");
  });

  it("takes a written date", () => {
    expect(readDate("Sep 22, 2026")).toBe("2026-09-22");
  });

  it("is null for nonsense", () => {
    expect(readDate("not a date")).toBeNull();
    expect(readDate("  ")).toBeNull();
  });
});

describe("parsing an export", () => {
  const parsed = parseAnalytics(SAMPLE_ANALYTICS);

  it("reads a row per post", () => {
    expect(parsed.rows).toHaveLength(2);
  });

  it("puts the numbers where they belong", () => {
    expect(parsed.rows[0]?.metrics).toMatchObject({
      impressions: 12480,
      likes: 318,
      comments: 41,
      shares: 22,
      clicks: 190,
      follows: 17,
    });
  });

  /** A LinkedIn export has no saves column, and absent is not zero. */
  it("leaves out a metric the file does not carry", () => {
    expect(parsed.rows[0]?.metrics.saves).toBeUndefined();
  });

  it("is insensitive to case, spacing and punctuation in headers", () => {
    const odd = parseAnalytics("post_url,POST  Title,Impressions\nhttps://x/1,Hello,50");
    expect(odd.rows[0]?.metrics.impressions).toBe(50);
    expect(odd.rows[0]?.url).toBe("https://x/1");
  });

  /** Their download puts a title and a blank line above the real headers. */
  it("finds the header row under a preamble", () => {
    const withPreamble = `Your post analytics\n\n\nPost URL,Post title,Impressions\nhttps://x/1,Hello,50`;
    expect(parseAnalytics(withPreamble).rows).toHaveLength(1);
  });

  /** Reported, never silently ignored, see D21 for why that matters here. */
  it("says which columns it did not understand", () => {
    const parsedOdd = parseAnalytics("Post URL,Impressions,Engagement rate\nhttps://x/1,50,0.04");
    expect(parsedOdd.ignored).toContain("Engagement rate");
    expect(parsedOdd.understood).toContain("Impressions");
  });

  it("says so when nothing looks like an analytics export", () => {
    const wrong = parseAnalytics("Name,Address\nSam,Nowhere");
    expect(wrong.warnings.join(" ")).toContain("different export");
  });

  it("says so when the file is empty", () => {
    expect(parseAnalytics("").warnings.join(" ")).toContain("nothing in that file");
  });

  it("skips blank rows rather than making empty entries", () => {
    const gappy = parseAnalytics("Post URL,Impressions\nhttps://x/1,50\n\n,\nhttps://x/2,60");
    expect(gappy.rows).toHaveLength(2);
  });
});

describe("normalising", () => {
  it("makes two links to the same post equal", () => {
    expect(normaliseUrl("https://www.linkedin.com/feed/update/x/?utm=1")).toBe(
      normaliseUrl("http://linkedin.com/feed/update/x"),
    );
  });

  it("strips case and punctuation from text", () => {
    expect(normaliseTitle("Your videos feel BORING. Here's why!")).toBe(
      "your videos feel boring heres why",
    );
  });
});

describe("matching rows to posts", () => {
  const posts = [
    post({ id: "p1", title: "Boring videos", hook: "Your videos feel boring.", url: "https://li/1" }),
    post({ id: "p2", title: "Five editing mistakes", hook: "Five editing mistakes", postedAt: "2026-09-04T09:00:00.000Z" }),
    post({ id: "p3", title: "Something else entirely" }),
  ];

  it("matches on the link first, which is the only key both sides agree on", () => {
    const out = matchRows([row({ url: "https://li/1/?utm=x", title: "Anything at all" })], posts);
    expect(out.matches[0]).toMatchObject({ postId: "p1", how: "url" });
  });

  it("matches on an exact title when there is no link", () => {
    const out = matchRows([row({ title: "five editing MISTAKES" })], posts);
    expect(out.matches[0]).toMatchObject({ postId: "p2", how: "title" });
  });

  it("matches the hook, since an export carries the post's own first line", () => {
    const out = matchRows([row({ title: "Your videos feel boring." })], posts);
    expect(out.matches[0]?.postId).toBe("p1");
  });

  it("matches on leading text within a few days", () => {
    const out = matchRows(
      [row({ title: "Five editing mistakes that cost you the swipe", postedAt: "2026-09-05" })],
      posts,
    );
    expect(out.matches[0]).toMatchObject({ postId: "p2", how: "near" });
  });

  it("will not make a near match outside the date window", () => {
    const out = matchRows(
      [row({ title: "Five editing mistakes that cost you the swipe", postedAt: "2026-11-01" })],
      posts,
    );
    expect(out.matches).toHaveLength(0);
  });

  /** Otherwise a weaker rule overwrites a stronger one and nothing says so. */
  it("never claims the same post twice", () => {
    const out = matchRows(
      [row({ line: 2, url: "https://li/1" }), row({ line: 3, title: "Your videos feel boring." })],
      posts,
    );
    expect(out.matches).toHaveLength(1);
    expect(out.unmatched).toHaveLength(1);
  });

  /** The difference between "backfilled my year" and "imported 40 of 60". */
  it("returns what it could not place rather than dropping it", () => {
    const out = matchRows([row({ title: "A post that is not in here" })], posts);
    expect(out.matches).toHaveLength(0);
    expect(out.unmatched[0]?.title).toBe("A post that is not in here");
  });

  it("does not near-match on a title too short to be distinctive", () => {
    const out = matchRows([row({ title: "Hi", postedAt: "2026-09-04" })], posts);
    expect(out.matches).toHaveLength(0);
  });
});

describe("writing the numbers back", () => {
  const posts = [post({ id: "p1", title: "One", stage: "scheduled" })];

  it("fills the metrics it was given", () => {
    const out = applyMatches(posts, [
      { row: row({ metrics: { impressions: 900, likes: 30 } }), postId: "p1", how: "url" },
    ]);
    expect(out.posts[0]?.metrics).toMatchObject({ impressions: 900, likes: 30 });
    expect(out.changed).toBe(1);
    expect(out.filled).toBe(2);
  });

  /**
   * A LinkedIn export has no saves column. Overwriting a hand-entered number
   * with a zero because the file was silent would destroy the data this feature
   * exists to protect.
   */
  it("does not overwrite a hand-entered number the file is silent about", () => {
    const measured = [
      post({
        id: "p1",
        metrics: { impressions: 1, likes: 0, comments: 0, shares: 0, saves: 77, follows: 0, clicks: 0 },
      }),
    ];
    const out = applyMatches(measured, [
      { row: row({ metrics: { impressions: 900 } }), postId: "p1", how: "url" },
    ]);
    expect(out.posts[0]?.metrics?.saves).toBe(77);
    expect(out.posts[0]?.metrics?.impressions).toBe(900);
  });

  it("moves the post to posted, because numbers mean it went out", () => {
    const out = applyMatches(posts, [{ row: row({ metrics: { impressions: 1 } }), postId: "p1", how: "url" }]);
    expect(out.posts[0]?.stage).toBe("posted");
  });

  it("fills a missing date from the export but never replaces one", () => {
    const dated = [post({ id: "p1", postedAt: "2026-01-01T00:00:00.000Z" })];
    const out = applyMatches(dated, [
      { row: row({ postedAt: "2026-09-22" }), postId: "p1", how: "url" },
    ]);
    expect(out.posts[0]?.postedAt).toBe("2026-01-01T00:00:00.000Z");

    const undated = applyMatches(posts, [
      { row: row({ postedAt: "2026-09-22" }), postId: "p1", how: "url" },
    ]);
    expect(undated.posts[0]?.postedAt?.startsWith("2026-09-22")).toBe(true);
  });

  it("leaves unmatched posts completely alone", () => {
    const two = [...posts, post({ id: "p2" })];
    const out = applyMatches(two, [{ row: row({ metrics: { likes: 1 } }), postId: "p1", how: "url" }]);
    expect(out.posts[1]).toBe(two[1]);
  });
});
