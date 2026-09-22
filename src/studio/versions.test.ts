import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import { makeDoc, makeLayer, type Doc } from "./model.js";
import { docVersion } from "./review.js";
import { styleById } from "./styles.js";
import {
  capture,
  changedCount,
  diffSlides,
  makeVersion,
  MAX_PER_DOC,
  prune,
  restoreAll,
  restoreSlide,
  retentionDays,
  retentionLabel,
  type Version,
} from "./versions.js";

const THEME = styleById("ink").theme;
const COPY = ["A hook that earns the swipe.", "Some body copy.", "Follow for more."];

const deck = (): Doc => ({ ...makeDoc("Test"), slides: buildSlides(COPY, THEME) });

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

const at = (v: Version, when: string): Version => ({ ...v, capturedAt: when });

describe("retention", () => {
  /** Planable's ladder, which this market has already proven. */
  it("is none, thirty days, unlimited", () => {
    expect(retentionDays("free")).toBe(0);
    expect(retentionDays("pro")).toBe(30);
    expect(retentionDays("agency")).toBe(Infinity);
  });

  it("says what it means in words", () => {
    expect(retentionLabel("free")).toContain("not kept");
    expect(retentionLabel("pro")).toContain("30 days");
    expect(retentionLabel("agency")).toContain("as long as");
  });

  /** A history going back two saves looks like a safety net and is not one. */
  it("keeps nothing at all on free", () => {
    expect(prune([makeVersion(deck(), "export")], "free")).toEqual([]);
  });

  it("drops what has aged out", () => {
    const old = at(makeVersion(deck(), "export"), daysAgo(45));
    const recent = at(makeVersion(deck(), "approve"), daysAgo(2));
    expect(prune([old, recent], "pro").map((v) => v.reason)).toEqual(["approve"]);
  });

  it("keeps everything on agency however old", () => {
    const ancient = at(makeVersion(deck(), "export"), daysAgo(900));
    expect(prune([ancient], "agency")).toHaveLength(1);
  });

  it("caps the count whatever the plan, because localStorage is small", () => {
    const many = Array.from({ length: MAX_PER_DOC + 10 }, (_, i) =>
      at(makeVersion(deck(), "export"), daysAgo(i / 100)),
    );
    expect(prune(many, "agency")).toHaveLength(MAX_PER_DOC);
  });

  it("keeps the newest when it has to choose", () => {
    const many = Array.from({ length: MAX_PER_DOC + 5 }, (_, i) =>
      at(makeVersion(deck(), "export"), daysAgo(i)),
    );
    const kept = prune(many, "agency");
    expect(kept[0]?.capturedAt).toBe(many[0]?.capturedAt);
  });
});

describe("capturing", () => {
  const doc = deck();

  it("records the document as it was, with its fingerprint", () => {
    const v = makeVersion(doc, "approve", "Before the client saw it");
    expect(v.version).toBe(docVersion(doc));
    expect(v.slideCount).toBe(doc.slides.length);
    expect(v.label).toBe("Before the client saw it");
  });

  /** Images live in the library; twenty-five copies of them is how a quota dies. */
  it("stores the document dehydrated", () => {
    const withImage: Doc = {
      ...doc,
      slides: doc.slides.map((s, i) =>
        i === 0
          ? {
              ...s,
              layers: [
                ...s.layers,
                { ...makeLayer("image", { x: 0, y: 0, w: 100, h: 100 }, "#000"), src: "data:image/png;base64,AAAA", assetId: "a_1" },
              ],
            }
          : s,
      ),
    };
    const v = makeVersion(withImage, "export");
    const image = v.doc.slides[0]?.layers.find((l) => l.assetId === "a_1");
    expect(image?.src).toBe("");
  });

  /** Exporting the same deck three times is one version, not three. */
  it("does not record an identical deck for the same reason twice", () => {
    const once = capture([], doc, "export", "pro");
    expect(capture(once, doc, "export", "pro")).toHaveLength(1);
  });

  it("does record the same deck for a different reason", () => {
    const once = capture([], doc, "export", "pro");
    expect(capture(once, doc, "approve", "pro")).toHaveLength(2);
  });

  it("records it again once the deck has moved", () => {
    const once = capture([], doc, "export", "pro");
    const moved: Doc = { ...doc, slides: buildSlides(["Something else.", ...COPY.slice(1)], THEME) };
    expect(capture(once, moved, "export", "pro")).toHaveLength(2);
  });

  it("records nothing on free", () => {
    expect(capture([], doc, "approve", "free")).toEqual([]);
  });

  it("prunes as it writes, not only as it reads", () => {
    const old = at(makeVersion(doc, "export"), daysAgo(99));
    const moved: Doc = { ...doc, slides: buildSlides(["New.", ...COPY.slice(1)], THEME) };
    expect(capture([old], moved, "export", "pro")).toHaveLength(1);
  });
});

describe("the diff", () => {
  const before = deck();

  it("reports an untouched deck as entirely unchanged", () => {
    expect(changedCount(diffSlides(before, before))).toBe(0);
  });

  it("finds the one slide that moved", () => {
    const after: Doc = {
      ...before,
      slides: before.slides.map((s, i) =>
        i === 1 ? { ...s, layers: s.layers.map((l) => ({ ...l, x: l.x + 30 })) } : s,
      ),
    };
    const diff = diffSlides(before, after);
    expect(diff.map((d) => d.state)).toEqual(["same", "changed", "same"]);
  });

  it("notices a colour change, not only a word change", () => {
    const after: Doc = {
      ...before,
      slides: before.slides.map((s, i) => (i === 0 ? { ...s, background: "#ff00ff" } : s)),
    };
    expect(diffSlides(before, after)[0]?.state).toBe("changed");
  });

  it("reports added and removed slides", () => {
    const longer: Doc = { ...before, slides: [...before.slides, before.slides[0]!] };
    expect(diffSlides(before, longer)[3]?.state).toBe("added");
    expect(diffSlides(longer, before)[3]?.state).toBe("removed");
  });

  /**
   * Re-laying mints new ids for every generated layer while the slides keep
   * their order and their content. An id-based diff would call that a whole new
   * deck every time.
   */
  it("compares by position, so new layer ids alone are not a change", () => {
    const reIded: Doc = {
      ...before,
      slides: before.slides.map((s) => ({
        ...s,
        id: `${s.id}_new`,
        layers: s.layers.map((l) => ({ ...l, id: `${l.id}_new` })),
      })),
    };
    expect(changedCount(diffSlides(before, reIded))).toBe(0);
  });

  it("ignores a hidden layer, as docVersion does", () => {
    const hidden: Doc = {
      ...before,
      slides: before.slides.map((s, i) =>
        i === 0
          ? { ...s, layers: [...s.layers, { ...makeLayer("rect", { x: 0, y: 0, w: 9, h: 9 }, "#fff"), visible: false }] }
          : s,
      ),
    };
    expect(diffSlides(before, hidden)[0]?.state).toBe("same");
  });
});

describe("going back", () => {
  const before = deck();
  const version = makeVersion(before, "approve");

  const changed: Doc = {
    ...before,
    name: "Renamed since",
    slides: buildSlides(["A different hook.", "A different body.", "A different close."], THEME),
  };

  it("restores the whole deck", () => {
    const out = restoreAll(changed, version);
    expect(out.slides).toHaveLength(before.slides.length);
    expect(docVersion(out)).toBe(version.version);
  });

  /** The id, the name and the client are live facts, not part of the snapshot. */
  it("keeps the live identity rather than rolling it back", () => {
    const out = restoreAll({ ...changed, clientId: "cl_1" }, version);
    expect(out.id).toBe(changed.id);
    expect(out.name).toBe("Renamed since");
    expect(out.clientId).toBe("cl_1");
  });

  /** The useful case: a client asked for slide two back, not the whole deck. */
  it("restores one slide and leaves the others", () => {
    const out = restoreSlide(changed, version, 1);
    expect(out.slides[1]).toEqual(before.slides[1]);
    expect(out.slides[0]).toEqual(changed.slides[0]);
  });

  it("appends a slide the current deck no longer has", () => {
    const shorter: Doc = { ...changed, slides: changed.slides.slice(0, 1) };
    const out = restoreSlide(shorter, version, 2);
    expect(out.slides).toHaveLength(2);
    expect(out.slides[1]).toEqual(before.slides[2]);
  });

  it("does nothing for a slide the version never had", () => {
    expect(restoreSlide(changed, version, 9)).toBe(changed);
  });

  it("stamps the document as edited, because it was", () => {
    expect(restoreSlide(changed, version, 0).updatedAt).not.toBe(changed.updatedAt);
  });
});
