import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import {
  destinationFolder,
  destinationFor,
  destinationLabel,
  keepAsCarousel,
  pickSlides,
  postFilePath,
  postGroups,
  postLines,
  postSizes,
  subsetDoc,
  togglePick,
  gridNeighbours,
  postFileMap,
  variantFor,
} from "./destinations.js";
import { makeDoc, type Doc } from "./model.js";
import { makePost, type Post } from "./pipeline.js";
import { platformById } from "./platforms.js";
import { preflight } from "./preflight.js";
import { STRUCTURES } from "./structures.js";
import { STYLES } from "./styles.js";

const COPY = [
  "Your edits feel mechanical",
  "You cut on the beat",
  "The beat is predictable",
  "Cut on movement instead",
  "A hand leaving frame",
  "A door closing",
  "Motion hides the cut",
  "Try it on one scene",
  "Follow for part two",
];

const deck = (n = COPY.length): Doc => {
  const style = STYLES[0]!;
  const structure = STRUCTURES[0]!;
  const roles = structure.slots.map((s) => s.id);
  const copy = COPY.slice(0, n);
  return { ...makeDoc("Cutting"), slides: buildSlides(copy, style.theme, roles.slice(0, n)) };
};

describe("postSizes", () => {
  it("splits ten slides into 4, 4 and 2", () => {
    expect(postSizes(10, 4)).toEqual([4, 4, 2]);
  });

  it("never strands the CTA alone in the last post", () => {
    expect(postSizes(9, 4)).toEqual([4, 3, 2]);
    expect(postSizes(5, 4)).toEqual([3, 2]);
    expect(postSizes(13, 4)).toEqual([4, 4, 3, 2]);
    for (let n = 2; n <= 40; n += 1) {
      const sizes = postSizes(n, 4);
      expect(sizes.reduce((a, b) => a + b, 0), `n=${n}`).toBe(n);
      expect(sizes.at(-1), `n=${n}`).toBeGreaterThanOrEqual(2);
      expect(Math.max(...sizes), `n=${n}`).toBeLessThanOrEqual(4);
    }
  });

  it("leaves a deck that fits as one post", () => {
    expect(postSizes(4, 4)).toEqual([4]);
    expect(postSizes(1, 4)).toEqual([1]);
    expect(postSizes(0, 4)).toEqual([]);
  });

  it("numbers every slide exactly once, in order", () => {
    expect(postGroups(10, 4)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8, 9]]);
  });

  it("puts the post order in the folder and in the file name", () => {
    expect(postFilePath(1, 3, 0, "jpg")).toBe("post-2-of-3/post-2-slide-1.jpg");
  });
});

describe("postLines, the line per post that needs no key", () => {
  it("writes one numbered line per post from that post's first slide", () => {
    const doc = deck();
    const lines = postLines(doc, postGroups(doc.slides.length, 4), "x");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^1\/3 /);
    expect(lines[1]).toMatch(/^2\/3 /);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(280);
  });
});

describe("pickSlides, Pinterest's five", () => {
  it("keeps the hook, the first body slides in order, and the CTA", () => {
    expect(pickSlides(9, 5)).toEqual([0, 1, 2, 3, 8]);
  });

  it("keeps everything when the deck is short enough", () => {
    expect(pickSlides(4, 5)).toEqual([0, 1, 2, 3]);
  });

  it("lets the user swap any slide, and stays in deck order", () => {
    const out = togglePick([0, 1, 2, 3, 8], 2, 5, 2);
    expect(out).toEqual([0, 1, 3, 8]);
    expect(togglePick(out, 6, 5, 2)).toEqual([0, 1, 3, 6, 8]);
  });

  it("never grows past five or shrinks below two", () => {
    expect(togglePick([0, 1, 2, 3, 8], 5, 5, 2)).toEqual([0, 1, 2, 3, 8]);
    expect(togglePick([0, 8], 8, 5, 2)).toEqual([0, 8]);
  });

  it("subsets the deck in deck order", () => {
    const doc = deck();
    expect(subsetDoc(doc, [8, 0]).slides.map((s) => s.id)).toEqual([
      doc.slides[0]!.id,
      doc.slides[8]!.id,
    ]);
  });
});

describe("variants", () => {
  it("labels and folders destinations by shape only when it matters", () => {
    const doc = deck();
    const ig = destinationFor(platformById("instagram"), doc);
    expect(destinationLabel(ig)).toBe("Instagram");
    const tall = { ...ig, shape: platformById("instagram").shapes[1]! };
    expect(destinationLabel(tall)).toBe("Instagram 3:4");
    expect(destinationFolder(tall)).toBe("instagram-3x4");
  });

  it("starts Pinterest from the five it would keep", () => {
    const d = destinationFor(platformById("pinterest"), deck());
    expect(d.picked).toEqual([0, 1, 2, 3, 8]);
    expect(variantFor(deck(), d).slides).toHaveLength(5);
  });

  /**
   * 17.5's done-when: one 4:5 deck to Instagram 3:4, LinkedIn and TikTok, each
   * passing its own pre-flight, with nothing new saved. The render itself needs
   * a server; the three documents it would render are what can be asserted.
   */
  it("reflows one 4:5 deck to three destinations that each pass their own check", () => {
    const doc = deck();
    const ig = platformById("instagram");
    const targets = [
      { ...destinationFor(ig, doc), shape: ig.shapes.find((s) => s.label === "3:4")! },
      destinationFor(platformById("linkedin"), doc),
      destinationFor(platformById("tiktok"), doc),
    ];

    for (const d of targets) {
      const v = variantFor(doc, d);
      expect([v.width, v.height]).toEqual([d.shape.w, d.shape.h]);
      const bad = preflight(v, d.platform).filter(
        (f) => f.severity === "block" || f.code === "outside-safe-zone" || f.code === "wrong-size",
      );
      expect(bad, destinationLabel(d)).toEqual([]);
    }

    // The source is untouched: variants are built in memory.
    expect([doc.width, doc.height]).toEqual([1080, 1350]);
  });

  it("keeps a variant as its own carousel, pointing home and outside the series", () => {
    const source = { ...deck(), series: { id: "s1", part: 3 } };
    const d = destinationFor(platformById("tiktok"), source);
    const kept = keepAsCarousel(variantFor(source, d), source, d, "d_new", "2026-10-16T00:00:00Z");
    expect(kept.id).toBe("d_new");
    expect(kept.variantOf).toBe(source.id);
    expect(kept.name).toBe("Cutting (TikTok)");
    expect(kept.series).toBeUndefined();
    expect([kept.width, kept.height]).toEqual([1080, 1920]);
  });
});

describe("postFileMap", () => {
  it("sends each numbered image to its post's folder", () => {
    const map = postFileMap(10, 4, "jpg");
    expect(map.get("01.jpg")).toBe("post-1-of-3/post-1-slide-1.jpg");
    expect(map.get("05.jpg")).toBe("post-2-of-3/post-2-slide-1.jpg");
    expect(map.get("10.jpg")).toBe("post-3-of-3/post-3-slide-2.jpg");
    expect(map.size).toBe(10);
  });
});

describe("variantFor on a deck already the right shape", () => {
  it("exports it exactly as drawn", () => {
    const doc = deck();
    const d = destinationFor(platformById("linkedin"), doc);
    expect(variantFor(doc, d)).toBe(doc);
  });
});

describe("gridNeighbours", () => {
  const post = (id: string, patch: Partial<Post>): Post => ({ ...makePost({ id }), ...patch });

  it("is the newest published Instagram carousels, without this one, at most eight", () => {
    const posts = [
      post("old", { stage: "posted", platform: "instagram", docId: "a", postedAt: "2026-01-01T00:00:00Z" }),
      post("new", { stage: "posted", platform: "instagram", docId: "b", postedAt: "2026-09-01T00:00:00Z" }),
      post("li", { stage: "posted", platform: "linkedin", docId: "c", postedAt: "2026-09-02T00:00:00Z" }),
      post("draft", { stage: "ready", platform: "instagram", docId: "d" }),
      post("self", { stage: "posted", platform: "instagram", docId: "me", postedAt: "2026-09-03T00:00:00Z" }),
    ];
    expect(gridNeighbours(posts, "me").map((p) => p.id)).toEqual(["new", "old"]);

    const many = Array.from({ length: 12 }, (_, i) =>
      post(`p${i}`, { stage: "posted", platform: "instagram", docId: `d${i}`, postedAt: `2026-0${(i % 9) + 1}-01T00:00:00Z` }),
    );
    expect(gridNeighbours(many, "me")).toHaveLength(8);
  });
});
