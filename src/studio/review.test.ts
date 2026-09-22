import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { makeDoc, makeLayer, type Doc } from "./model.js";
import {
  authorLabel,
  commentCounts,
  docVersion,
  isLive,
  MAX_COMMENT_CHARS,
  onSlide,
  stalenessOf,
  unresolved,
  validateComment,
  visibleTo,
  type Comment,
  type Share,
} from "./review.js";
import { styleById } from "./styles.js";

const THEME = styleById("ink").theme;
const COPY = ["A hook that earns the swipe.", "Some body copy.", "Follow for more."];

const deck = (): Doc => ({ ...makeDoc("Test"), slides: buildSlides(COPY, THEME) });

const share = (patch: Partial<Share> = {}): Share => ({
  id: "sh_1",
  docId: "d_1",
  token: "t".repeat(48),
  title: "Five ways to fail",
  snapshot: {
    version: "v0",
    slideCount: 3,
    urls: ["https://cdn/1.jpg"],
    alts: ["One"],
    capturedAt: "2026-09-01T00:00:00.000Z",
  },
  status: "open",
  decisionNote: "",
  decidedBy: null,
  decidedAt: null,
  approvedVersion: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...patch,
});

const comment = (patch: Partial<Comment> = {}): Comment => ({
  id: `cm_${Math.random()}`,
  shareId: "sh_1",
  slideIndex: 0,
  slideId: null,
  scope: "client",
  author: "Client",
  body: "Move the logo",
  resolved: false,
  createdAt: "2026-09-01T00:00:00.000Z",
  ...patch,
});

describe("versions", () => {
  it("is stable for the same deck", () => {
    const d = deck();
    expect(docVersion(d)).toBe(docVersion(d));
  });

  it("changes when the words change", () => {
    const before = deck();
    const after = { ...before, slides: buildSlides(["Different hook entirely.", ...COPY.slice(1)], THEME) };
    expect(docVersion(after)).not.toBe(docVersion(before));
  });

  /**
   * "I'd also like some safeties to ensure that approved images aren't confused
   * with modified ones" is about a nudged headline as much as a rewritten one.
   */
  it("changes when a layer moves, not only when the copy does", () => {
    const before = deck();
    const moved: Doc = {
      ...before,
      slides: before.slides.map((s, i) =>
        i === 0 ? { ...s, layers: s.layers.map((l) => ({ ...l, x: l.x + 40 })) } : s,
      ),
    };
    expect(docVersion(moved)).not.toBe(docVersion(before));
  });

  it("changes when a colour changes", () => {
    const before = deck();
    const recoloured: Doc = {
      ...before,
      slides: before.slides.map((s) => ({ ...s, background: "#ff00ff" })),
    };
    expect(docVersion(recoloured)).not.toBe(docVersion(before));
  });

  it("changes when a slide is added", () => {
    const before = deck();
    expect(docVersion({ ...before, slides: [...before.slides, before.slides[0]!] })).not.toBe(
      docVersion(before),
    );
  });

  /** Ids and timestamps are not visible, so they must not invalidate an approval. */
  it("ignores ids and timestamps", () => {
    const before = deck();
    const renamed: Doc = {
      ...before,
      id: "d_other",
      name: "Renamed",
      updatedAt: new Date().toISOString(),
    };
    expect(docVersion(renamed)).toBe(docVersion(before));
  });

  it("ignores a hidden layer, because a reviewer cannot see it", () => {
    const before = deck();
    const hidden: Doc = {
      ...before,
      slides: before.slides.map((s, i) =>
        i === 0
          ? { ...s, layers: [...s.layers, { ...makeLayer("rect", { x: 0, y: 0, w: 9, h: 9 }, "#fff"), visible: false }] }
          : s,
      ),
    };
    expect(docVersion(hidden)).toBe(docVersion(before));
  });
});

describe("approval against a version", () => {
  const d = deck();

  it("says nothing about a share nobody has answered", () => {
    expect(stalenessOf(share(), d).state).toBe("none");
  });

  it("confirms an approval that still matches the deck", () => {
    const approved = share({ status: "approved", approvedVersion: docVersion(d) });
    expect(stalenessOf(approved, d).state).toBe("current");
  });

  /** "Three people approved the post. None of them approved the same version." */
  it("reports an approval the deck has moved past", () => {
    const approved = share({ status: "approved", approvedVersion: "v-old" });
    const out = stalenessOf(approved, d);
    expect(out.state).toBe("stale");
    if (out.state === "stale") expect(out.now).toBe(docVersion(d));
  });

  /** Reported, never revoked: deciding that for somebody is worse than telling them. */
  it("does not change the share's status", () => {
    const approved = share({ status: "approved", approvedVersion: "v-old" });
    stalenessOf(approved, d);
    expect(approved.status).toBe("approved");
  });

  it("says nothing when changes were asked for rather than approval given", () => {
    expect(stalenessOf(share({ status: "changes" }), d).state).toBe("none");
  });

  it("knows a revoked link is not live", () => {
    expect(isLive(share({ status: "revoked" }))).toBe(false);
    expect(isLive(share({ status: "approved" }))).toBe(true);
  });
});

/**
 * "The ability to show the feed to the clients externally so that they're able
 * to view only what's needed and not all our comments."
 */
describe("what a reviewer may see", () => {
  const feed = [comment(), comment({ scope: "internal", body: "Client always hates green" })];

  it("gives the owner everything", () => {
    expect(visibleTo(feed, "owner")).toHaveLength(2);
  });

  it("gives the client only the client-scoped ones", () => {
    const seen = visibleTo(feed, "client");
    expect(seen).toHaveLength(1);
    expect(seen.map((c) => c.body).join()).not.toContain("hates green");
  });

  it("does not hand back the caller's own array to be mutated", () => {
    expect(visibleTo(feed, "owner")).not.toBe(feed);
  });
});

describe("threads", () => {
  it("gathers a slide's comments oldest first", () => {
    const feed = [
      comment({ body: "second", createdAt: "2026-09-02T00:00:00.000Z" }),
      comment({ body: "first", createdAt: "2026-09-01T00:00:00.000Z" }),
      comment({ slideIndex: 2, body: "elsewhere" }),
    ];
    expect(onSlide(feed, 0).map((c) => c.body)).toEqual(["first", "second"]);
  });

  it("keeps deck-wide comments separate from slide ones", () => {
    const feed = [comment({ slideIndex: null, body: "overall" }), comment({ body: "slide one" })];
    expect(onSlide(feed, null).map((c) => c.body)).toEqual(["overall"]);
  });

  it("counts unresolved comments per slide for the filmstrip dots", () => {
    const feed = [comment(), comment(), comment({ slideIndex: 2 }), comment({ resolved: true })];
    const counts = commentCounts(feed);
    expect(counts.get(0)).toBe(2);
    expect(counts.get(2)).toBe(1);
  });

  it("does not count a deck-wide comment against any slide", () => {
    expect(commentCounts([comment({ slideIndex: null })]).size).toBe(0);
  });

  it("filters to what is still outstanding", () => {
    expect(unresolved([comment(), comment({ resolved: true })])).toHaveLength(1);
  });
});

describe("what an open endpoint will accept", () => {
  const draft = { slideIndex: 0, author: "Sam", body: "Move the logo" };

  it("accepts an ordinary comment", () => {
    expect(validateComment(draft)).toBeNull();
  });

  it("refuses an empty one", () => {
    expect(validateComment({ ...draft, body: "   " })).toContain("Write something");
  });

  it("refuses one past the length ceiling", () => {
    expect(validateComment({ ...draft, body: "x".repeat(MAX_COMMENT_CHARS + 1) })).toContain("longer");
  });

  it("refuses a name long enough to be an attack", () => {
    expect(validateComment({ ...draft, author: "a".repeat(200) })).toContain("too long");
  });

  it("refuses once a share is full", () => {
    expect(validateComment(draft, 500)).toContain("comment limit");
  });

  /** Demanding a name from somebody with no account is a login by another route. */
  it("allows an anonymous comment and labels it", () => {
    expect(validateComment({ ...draft, author: "" })).toBeNull();
    expect(authorLabel("  ")).toBe("Someone");
    expect(authorLabel("Sam")).toBe("Sam");
  });
});
