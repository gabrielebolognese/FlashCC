import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import {
  clearFurniture,
  counterText,
  FURNITURE_SETS,
  furnitureArea,
  handleFor,
  missingFurniture,
  reseal,
  resealWith,
  stampFurniture,
  wants,
} from "./furniture.js";
import { makeDoc, makeLayer, type Doc, type Identity } from "./model.js";
import { platformById } from "./platforms.js";
import { preflight } from "./preflight.js";
import { THEMES } from "./presets.js";
import { moveSet } from "./slideset.js";

const ME: Identity = {
  name: "Gabriele Bolognese",
  role: "Video editor",
  site: "flashcc.app",
  handles: { instagram: "@gabry.edits", linkedin: "Gabriele Bolognese", tiktok: "@gabryedits" },
};

const deck = (n = 7): Doc => {
  const texts = Array.from({ length: n }, (_, i) => (i === 0 ? "A hook that earns the swipe" : i === n - 1 ? "Follow for part two" : `Point ${i}\nA body line for point ${i}.`));
  return { ...makeDoc("F"), slides: buildSlides(texts, THEMES.ink!, undefined, { images: false }) };
};
const on = (doc: Doc, i: number, kind: string) => doc.slides[i]!.layers.filter((l) => l.furniture === kind);

describe("the six sets (20.6)", () => {
  it("are six, and None is empty", () => {
    expect(FURNITURE_SETS.map((s) => s.id)).toEqual(["minimal", "creator", "editorial", "corporate", "bold", "none"]);
    expect(FURNITURE_SETS.find((s) => s.id === "none")!.pieces).toEqual([]);
  });
});

describe("the default rules (20.2)", () => {
  it("counts from after the cover, so ten slides read 1 to 9", () => {
    expect(counterText(1, 10)).toBe("1 / 9");
    expect(counterText(9, 10)).toBe("9 / 9");
    const s = deck().slides[0]!;
    expect(wants("counter", 0, 10, s)).toBe(false);
    expect(wants("swipe", 9, 10, s)).toBe(false);
    expect(wants("swipe", 8, 10, s)).toBe(true);
    expect(wants("footer", 0, 10, s)).toBe(false);
    expect(wants("progress", 0, 10, s)).toBe(false);
  });
});

describe("stamping", () => {
  it("writes locked, tagged layers from the identity, large on the cover", () => {
    const doc = stampFurniture(deck(), "creator", ME);
    expect(doc.furniture).toEqual({ set: "creator", identity: ME });
    const cover = on(doc, 0, "author");
    const body = on(doc, 2, "author");
    expect(cover.length).toBeGreaterThan(0);
    expect(cover.every((l) => l.locked)).toBe(true);
    const size = (ls: typeof cover) => Math.max(...ls.map((l) => l.h));
    expect(size(cover)).toBeGreaterThan(size(body));
    expect(on(doc, 6, "swipe")).toEqual([]);
    expect(on(doc, 5, "swipe")).toHaveLength(1);
  });

  it("passes its own pre-flight on every platform it was stamped for", () => {
    for (const id of ["linkedin", "instagram", "tiktok"] as const) {
      const platform = platformById(id);
      for (const set of FURNITURE_SETS) {
        const base = { ...deck(), width: platform.w, height: platform.h };
        const doc = stampFurniture(base, set.id, ME, { platform });
        const bad = preflight(doc, platform).filter(
          (f) => (f.severity === "block" || f.code === "outside-safe-zone") && doc.slides[(f.slide ?? 1) - 1]?.layers.some((l) => l.id === f.layerId && l.furniture),
        );
        expect(bad, `${id}/${set.id}`).toEqual([]);
      }
    }
  });

  it("keeps clear of TikTok's rail and caption band", () => {
    const tiktok = platformById("tiktok");
    const doc = stampFurniture({ ...deck(), width: 1080, height: 1920 }, "editorial", ME, { platform: tiktok });
    const area = furnitureArea(doc, tiktok);
    for (const l of doc.slides.flatMap((s) => s.layers).filter((x) => x.furniture)) {
      expect(l.x + l.w).toBeLessThanOrEqual(area.x + area.w + 1);
      expect(l.y + l.h).toBeLessThanOrEqual(area.y + area.h + 1);
    }
  });

  it("takes everything off again", () => {
    const doc = clearFurniture(stampFurniture(deck(), "bold", ME));
    expect(doc.furniture).toBeUndefined();
    expect(doc.slides.flatMap((s) => s.layers).some((l) => l.furniture)).toBe(false);
  });
});

describe("reseal (20.4)", () => {
  /** 20.4's done-when. */
  it("after moving slide 7 to position 2: every counter renumbered, the swipe cue on the new last slide, and a second run changes nothing", () => {
    const stamped = stampFurniture(deck(7), "creator", ME);
    const withCounter = stampFurniture(deck(7), "minimal", ME);
    for (const base of [stamped, withCounter]) {
      const ids = base.slides.map((s) => s.id);
      const moved = { ...base, slides: moveSet(base.slides, [ids[6]!], ids[1]!) };
      const once = reseal(moved);
      const twice = reseal(once);
      expect(twice).toBe(once);

      if (base.furniture!.set === "minimal") {
        once.slides.forEach((s, i) => {
          const c = s.layers.find((l) => l.furniture === "counter");
          if (i === 0) expect(c).toBeUndefined();
          else expect(c?.text).toBe(counterText(i, 7));
        });
      } else {
        expect(on(once, 6, "swipe")).toEqual([]);
        expect(on(once, 1, "swipe")).toHaveLength(1);
        once.slides.slice(0, 6).forEach((_, i) => expect(on(once, i, "swipe")).toHaveLength(1));
      }
    }
  });

  it("leaves a moved piece where the user put it and only changes its words", () => {
    const doc = stampFurniture(deck(5), "minimal", ME);
    const moved = {
      ...doc,
      slides: doc.slides.map((s) => ({ ...s, layers: s.layers.map((l) => (l.furniture === "counter" ? { ...l, x: 300, y: 600 } : l)) })),
    };
    const ids = moved.slides.map((s) => s.id);
    const after = reseal({ ...moved, slides: moveSet(moved.slides, [ids[4]!], ids[1]!) });
    const c = after.slides[2]!.layers.find((l) => l.furniture === "counter")!;
    expect([c.x, c.y]).toEqual([300, 600]);
    expect(c.text).toBe(counterText(2, 5));
  });

  it("never touches, or doubles, a piece somebody typed into", () => {
    const doc = stampFurniture(deck(5), "creator", ME);
    const typed = {
      ...doc,
      slides: doc.slides.map((s, i) =>
        i === 1
          ? { ...s, layers: s.layers.map((l) => (l.furniture === "swipe" ? { ...l, furniture: undefined, furnitureOptOut: "swipe" } : l)) }
          : s,
      ),
    };
    const after = reseal({ ...typed, slides: [...typed.slides, { ...typed.slides[2]!, id: "extra", layers: typed.slides[2]!.layers.filter((l) => !l.furniture) }] });
    expect(after.slides[1]!.layers.filter((l) => l.furniture === "swipe")).toEqual([]);
    expect(after.slides[1]!.layers.filter((l) => l.furnitureOptOut === "swipe")).toHaveLength(1);
  });

  it("adds the pieces a new slide needs", () => {
    const doc = stampFurniture(deck(4), "minimal", ME);
    const blank = { ...doc.slides[1]!, id: "new", layers: [] };
    const after = reseal({ ...doc, slides: [...doc.slides.slice(0, 2), blank, ...doc.slides.slice(2)] });
    expect(after.slides[2]!.layers.find((l) => l.furniture === "counter")?.text).toBe(counterText(2, 5));
  });

  it("returns the same document when there is no furniture at all", () => {
    const d = deck();
    expect(reseal(d)).toBe(d);
  });
});

describe("placement (20.3)", () => {
  it("moves to the second corner when content is in the first, and skips the slide when none is free", () => {
    const base = deck(3);
    const area = furnitureArea(base, platformById("linkedin"));
    // Content in the top-right, where the counter wants to go.
    const blocker = { ...makeLayer("rect", { x: area.x + area.w - 200, y: area.y, w: 200, h: 120 }, "#ffffff"), name: "Box" };
    const blocked = { ...base, slides: base.slides.map((s, i) => (i === 1 ? { ...s, layers: [...s.layers, blocker] } : s)) };
    const doc = stampFurniture(blocked, "minimal", ME);
    const c = on(doc, 1, "counter")[0]!;
    expect(c.y).toBeGreaterThan(area.y + area.h / 2);

    // Content in both corners the counter accepts.
    const low = { ...blocker, y: area.y + area.h - 120 };
    const full = { ...base, slides: base.slides.map((s, i) => (i === 1 ? { ...s, layers: [...s.layers, blocker, { ...low, id: "low" }] } : s)) };
    const r = resealWith({ ...full, furniture: { set: "minimal", identity: ME } }, { replace: true });
    expect(r.missing).toEqual([{ slide: 2, kind: "counter" }]);
    expect(missingFurniture(r.doc)).toEqual([{ slide: 2, kind: "counter" }]);
    expect(preflight(r.doc, platformById("linkedin")).some((f) => f.code === "furniture-skipped" && f.slide === 2)).toBe(true);
  });
});

describe("identity per platform (20.1)", () => {
  it("shows the handle for the platform, else the name", () => {
    expect(handleFor(ME, platformById("instagram"))).toBe("@gabry.edits");
    expect(handleFor(ME, platformById("linkedin"))).toBe("Gabriele Bolognese");
    expect(handleFor({ ...ME, handles: {} }, platformById("x"))).toBe("Gabriele Bolognese");
  });
});

import { destinationFor, variantFor } from "./destinations.js";

describe("furniture per destination at export (20.5)", () => {
  /** 20.5's done-when. */
  it("one deck to Instagram and LinkedIn shows two handles, and neither sits in its platform's chrome", () => {
    const doc = stampFurniture(deck(5), "creator", ME, { platform: platformById("linkedin") });
    const ig = platformById("instagram");
    const li = platformById("linkedin");
    const chip = (d: Doc) => d.slides[1]!.layers.find((l) => l.furniture === "author" && l.name === "Author")!.text;

    const toIg = variantFor(doc, { ...destinationFor(ig, doc), shape: ig.shapes.find((s) => s.label === "3:4")! });
    const toLi = variantFor(doc, destinationFor(li, doc));
    expect(chip(toIg)).toBe("@gabry.edits");
    expect(chip(toLi)).toBe("Gabriele Bolognese");

    for (const [v, p] of [[toIg, ig], [toLi, li]] as const) {
      const chrome = preflight(v, p).filter(
        (f) => f.code === "outside-safe-zone" && v.slides[(f.slide ?? 1) - 1]?.layers.some((l) => l.id === f.layerId && l.furniture),
      );
      expect(chrome, p.id).toEqual([]);
    }
  });

  it("puts TikTok's furniture clear of the rail when a 4:5 deck is reflowed to 9:16", () => {
    const doc = stampFurniture(deck(5), "editorial", ME);
    const tt = platformById("tiktok");
    const v = variantFor(doc, destinationFor(tt, doc));
    const area = furnitureArea(v, tt);
    for (const l of v.slides.flatMap((s) => s.layers).filter((x) => x.furniture)) {
      expect(l.x + l.w).toBeLessThanOrEqual(area.x + area.w + 1);
      expect(l.y + l.h).toBeLessThanOrEqual(area.y + area.h + 1);
    }
  });
});
