import { describe, expect, it } from "vitest";

import { insertBlock } from "./blockplace.js";
import { buildSlides } from "./compositions.js";
import { stampFurniture } from "./furniture.js";
import { DIMENSIONS, groupBy, MIN_SHOWN } from "./insights.js";
import { matchRows, parseAnalytics } from "./linkedin.js";
import { makeDoc, type Doc } from "./model.js";
import { makePost, postFromDoc, shapeOf, type Post } from "./pipeline.js";
import { remixDeck, remixStructure } from "./remix.js";
import { monthsBefore, onePlaceOnly, staleKinds, stalenessFlags, worthAgain } from "./resurface.js";
import { slideCopy } from "./regenerate.js";
import { styleById } from "./styles.js";

const THEME = styleById("ink").theme;

/** A 7-slide post with a stat block in slot 4, furniture and a style: the done-when's fixture. */
const SEVEN = [
  "Your edits feel mechanical",
  "You cut on the beat",
  "The beat is predictable",
  "Cut on movement instead",
  "A door closing hides the cut",
  "Follow for part two",
];
function original(): Doc {
  let doc: Doc = { ...makeDoc("Cutting"), framework: "problem", styleId: "ink", slides: buildSlides(SEVEN, THEME) };
  // Six slides of words, and the stat on its own slide after the third: slot 4 of 7.
  const r = insertBlock(doc, 2, "stat", { value: "73%", label: "of viewers leave at a hard cut" }, { theme: THEME }, "new", () => "blk1");
  if (!r.ok) throw new Error(`fixture: ${r.reason}`);
  doc = r.doc;
  return stampFurniture(doc, "minimal", { name: "Ada", handles: {} });
}

const words = (doc: Doc): string => doc.slides.map(slideCopy).join(" ") + " " + JSON.stringify(doc.slides.map((s) => s.blocks ?? []));

describe("make another like this (28.1)", () => {
  it("keeps the shape, slide for slide, with none of the original's words", () => {
    const src = original();
    expect(src.slides).toHaveLength(7);
    expect(src.slides[3]!.blocks?.[0]?.block).toBe("stat");

    const made = remixDeck(src, { theme: THEME });
    expect(made.id).not.toBe(src.id);
    expect(made.slides).toHaveLength(7);
    // The stat block is still in slot 4, and only there.
    expect(made.slides.map((s) => (s.blocks ?? []).map((b) => b.block))).toEqual(src.slides.map((s) => (s.blocks ?? []).map((b) => b.block)));
    // The same composition at every position, the same style, framework and furniture set.
    expect(made.slides.map((s) => s.composition)).toEqual(src.slides.map((s) => s.composition));
    expect([made.styleId, made.framework, made.furniture?.set]).toEqual(["ink", "problem", "minimal"]);
    expect(made.remixOf).toBe(src.id);
    expect(made.template).toBeUndefined();
    // Not one of the original's words, the block's figure included.
    const out = words(made);
    for (const w of [...SEVEN, "73%", "of viewers leave at a hard cut"]) expect(out).not.toContain(w);
    // The block's fields are honest brackets, never a sample figure.
    expect(made.slides[3]!.blocks?.[0]?.fields).toMatchObject({ value: "[Number]", label: "[What it means]", source: "" });
  });

  it("lays new words into the same shape when they are given, one per slide", () => {
    const fresh = Array.from({ length: 7 }, (_, i) => `New point ${i + 1}`);
    const made = remixDeck(original(), { theme: THEME, texts: fresh, name: "Sound sells the cut" });
    expect(made.name).toBe("Sound sells the cut");
    expect(slideCopy(made.slides[0]!)).toContain("New point 1");
    expect(slideCopy(made.slides[6]!)).toContain("New point 7");
  });

  it("asks a draft for the original's framework at the original's length", () => {
    expect(remixStructure(original())?.slots).toHaveLength(7);
    expect(remixStructure({ ...original(), framework: undefined })).toBeUndefined();
  });
});

/* ── 28.2, 28.3 ──────────────────────────────────────────────────────────── */

const NOW = new Date(2026, 9, 18, 12);
const metrics = (impressions: number, saves = 0, shares = 0) => ({ impressions, likes: 0, comments: 0, shares, saves, follows: 0, clicks: 0 });
const live = (patch: Partial<Post>): Post => makePost({ stage: "posted", ...patch });

describe("worth posting again (28.2)", () => {
  it("counts the age by the calendar", () => {
    expect(monthsBefore(new Date(2026, 6, 31), 4)).toEqual(new Date(2026, 2, 31, 0, 0));
    expect(monthsBefore(new Date(2026, 5, 30, 9), 4).getDate()).toBe(28); // February has no 30th
  });

  it("lists only posts older than the age, by the metric the person chose", () => {
    const posts = [
      live({ title: "old, many saves", postedAt: "2026-03-01T09:00:00.000Z", metrics: metrics(1000, 90, 1) }),
      live({ title: "old, many shares", postedAt: "2026-02-01T09:00:00.000Z", metrics: metrics(5000, 5, 40) }),
      live({ title: "recent", postedAt: "2026-10-01T09:00:00.000Z", metrics: metrics(9000, 500, 500) }),
      makePost({ title: "never posted", stage: "drafting" }),
    ];
    expect(worthAgain(posts, "saves", 4, NOW).map((p) => p.title)).toEqual(["old, many saves", "old, many shares"]);
    expect(worthAgain(posts, "shares", 4, NOW).map((p) => p.title)).toEqual(["old, many shares", "old, many saves"]);
    expect(worthAgain(posts, "impressions", 1, NOW).map((p) => p.title)).toEqual(["recent", "old, many shares", "old, many saves"].slice(1));
  });

  it("flags what time may have changed, and never edits it", () => {
    expect(staleKinds("The best tools of 2025")).toEqual(["year"]);
    expect(staleKinds("I tried this last month")).toEqual(["relative"]);
    expect(staleKinds("It costs $29/mo")).toEqual(["price"]);
    expect(staleKinds("Works on iOS 17.2")).toEqual(["version"]);
    expect(staleKinds("5 mistakes everyone makes")).toEqual(["number"]);
    expect(staleKinds("Cut on movement")).toEqual([]);
    const texts = ["Five ways\nfor 2025", "No numbers here", "Now $19"];
    expect(stalenessFlags(texts)).toEqual([
      { slide: 1, line: "for 2025", kinds: ["year"] },
      { slide: 3, line: "Now $19", kinds: ["price"] },
    ]);
    // The input is untouched.
    expect(texts[0]).toBe("Five ways\nfor 2025");
  });
});

describe("posted in one place only (28.3)", () => {
  const baseline = (n: number) =>
    Array.from({ length: n }, (_, i) => live({ docId: `d${i}`, platform: "linkedin", postedAt: `2026-0${(i % 8) + 1}-10T09:00:00.000Z`, metrics: metrics(1000) }));

  it("finds a post that did well on one platform and never went out on another", () => {
    const star = live({ docId: "star", platform: "linkedin", postedAt: "2026-09-01T09:00:00.000Z", metrics: metrics(5000) });
    const twin = live({ docId: "twin", platform: "linkedin", postedAt: "2026-09-02T09:00:00.000Z", metrics: metrics(5000) });
    const twinOnIg = makePost({ docId: "twin", platform: "instagram", stage: "scheduled" });
    const out = onePlaceOnly([...baseline(6), star, twin, twinOnIg]);
    expect(out.map((o) => o.post.docId)).toEqual(["star"]);
    expect(out[0]!.missing).toEqual(["instagram", "tiktok", "x"]);
  });

  it("says nothing before the baseline exists", () => {
    expect(onePlaceOnly([live({ docId: "a", metrics: metrics(5000), postedAt: "2026-09-01T09:00:00.000Z" })])).toEqual([]);
  });
});

/* ── 28.4 ───────────────────────────────────────────────────────────────── */

/*
 * These two headers are an ASSUMPTION about the current exports, from
 * third-party descriptions; neither could be checked against a real file
 * (D53). They test the reading and the matching, not the claim.
 */
const INSTAGRAM = `Post ID,Account username,Description,Publish time,Permalink,Post type,Date,Views,Reach,Likes,Shares,Follows,Comments,Saves
1790,ada,Cut on movement not on the beat,10/02/2026 09:00,https://www.instagram.com/p/AbC123/,IG carousel,Lifetime,9100,6400,310,44,12,28,190
1791,ada,A post nobody made here,10/05/2026 09:00,https://www.instagram.com/p/XyZ789/,IG carousel,Lifetime,800,500,20,1,0,2,3`;

const TIKTOK = `Video title,Video link,Post time,Total views,Total likes,Total comments,Total shares,Add to Favorites
Cut on movement not on the beat,https://www.tiktok.com/@ada/video/1,2026-10-03,22000,1800,90,300,640`;

describe("more analytics sources (28.4)", () => {
  it("reads Instagram's columns, preferring reach over views, and shows every column it read", () => {
    const parsed = parseAnalytics(INSTAGRAM, "instagram");
    expect(parsed.rows[0]).toMatchObject({ url: "https://www.instagram.com/p/AbC123/", title: "Cut on movement not on the beat", postedAt: "2026-10-02" });
    expect(parsed.rows[0]!.metrics).toEqual({ impressions: 6400, likes: 310, shares: 44, follows: 12, comments: 28, saves: 190 });
    const byHeader = Object.fromEntries(parsed.columns.map((c) => [c.header, c.field]));
    expect(byHeader).toMatchObject({ Reach: "impressions", Views: null, Date: null, "Publish time": "postedAt", Permalink: "url", "Post ID": null });
  });

  it("takes the person's correction over its own reading", () => {
    const views = parseAnalytics(INSTAGRAM, "instagram").columns.find((c) => c.header === "Views")!.index;
    const parsed = parseAnalytics(INSTAGRAM, "instagram", { [views]: "impressions" });
    expect(parsed.rows[0]!.metrics.impressions).toBe(9100);
    expect(parsed.columns.find((c) => c.header === "Reach")!.field).toBeNull();
  });

  it("reads TikTok's, favourites as saves", () => {
    const parsed = parseAnalytics(TIKTOK, "tiktok");
    expect(parsed.rows[0]!.metrics).toEqual({ impressions: 22000, likes: 1800, comments: 90, shares: 300, saves: 640 });
  });

  it("matches only posts on the export's platform, and returns the rest unmatched", () => {
    const words = "Cut on movement not on the beat";
    const onLinkedIn = makePost({ title: words, hook: words, platform: "linkedin", stage: "posted", postedAt: "2026-10-02T09:00:00.000Z" });
    const onInstagram = makePost({ title: words, hook: words, platform: "instagram", stage: "posted", postedAt: "2026-10-02T09:00:00.000Z" });
    const { matches, unmatched } = matchRows(parseAnalytics(INSTAGRAM, "instagram").rows, [onLinkedIn, onInstagram], "instagram");
    expect(matches.map((m) => m.postId)).toEqual([onInstagram.id]);
    expect(unmatched.map((r) => r.title)).toEqual(["A post nobody made here"]);
  });
});

/* ── 28.5 ───────────────────────────────────────────────────────────────── */

describe("attribution by the new dimensions (28.5)", () => {
  it("snapshots the structure when the post is made", () => {
    const doc = { ...original(), hookKind: "contrarian" };
    expect(shapeOf(doc)).toEqual({ blocks: ["stat"], furniture: "minimal", hookKind: "contrarian", panoramic: false, video: false });
    expect(postFromDoc(doc).shape?.blocks).toEqual(["stat"]);
  });

  it("puts a post in every block's group, and a post with no snapshot in none", () => {
    const shaped = (blocks: string[], reach: number) =>
      live({ shape: { blocks, furniture: null, hookKind: null, panoramic: false, video: false }, metrics: metrics(reach), postedAt: "2026-09-01T09:00:00.000Z" });
    const posts = [shaped(["stat", "checklist"], 3000), shaped(["stat"], 2000), shaped([], 1000), live({ metrics: metrics(500), postedAt: "2026-09-01T09:00:00.000Z" })];
    const groups = groupBy(posts, DIMENSIONS.find((d) => d.id === "block")!, "impressions");
    const n = Object.fromEntries(groups.map((g) => [g.value, g.n]));
    expect(n).toEqual({ "Big number": 2, Checklist: 1, "No block": 1 });
    const format = groupBy(posts, DIMENSIONS.find((d) => d.id === "format")!, "impressions");
    expect(format.map((g) => [g.value, g.n])).toEqual([["Carousel", 3]]);
  });

  it("has a floor of five for any median shown", () => {
    expect(MIN_SHOWN).toBe(5);
  });
});
