import { describe, expect, it } from "vitest";

import { buildSlides } from "./compositions.js";
import {
  ACCENTS,
  DEFAULT_PREFS,
  decorScale,
  styleFromPrefs,
  stylesFor,
  wantsImages,
  type Prefs,
} from "./onboarding.js";
import { STYLES } from "./styles.js";

const H = 1350;
const prefs = (patch: Partial<Prefs> = {}): Prefs => ({ ...DEFAULT_PREFS, ...patch });
const build = (p: Prefs) => ({ images: wantsImages(p.images), decor: decorScale(p.decor) });

const slidesFor = (p: Prefs, texts = ["A hook.", "A second slide with some words on it."]) =>
  buildSlides(texts, styleFromPrefs(p).theme, undefined, build(p));

describe("preferences", () => {
  it("maps decoration to a scale, with none meaning none", () => {
    expect(decorScale("none")).toBe(0);
    expect(decorScale("normal")).toBe(1);
    expect(decorScale("bold")).toBeGreaterThan(1);
  });

  it("treats only 'never' as wanting no pictures", () => {
    expect(wantsImages("always")).toBe(true);
    expect(wantsImages("sometimes")).toBe(true);
    expect(wantsImages("never")).toBe(false);
  });

  it("builds a style from the answers", () => {
    const s = styleFromPrefs(prefs({ ground: "light", accent: "#ff0000", displayFont: "serif" }));
    expect(s.theme.accent).toBe("#ff0000");
    expect(s.theme.displayFont).toBe("serif");
    expect(s.theme.bg).toBe("#ffffff");
  });

  it("puts the user's own style first, and leaves the gallery alone without one", () => {
    expect(stylesFor(null)).toEqual(STYLES);
    const withMine = stylesFor(prefs());
    expect(withMine[0]?.id).toBe("yours");
    expect(withMine).toHaveLength(STYLES.length + 1);
  });

  it("offers accents that are all valid hex", () => {
    for (const a of ACCENTS) expect(a).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

/** The questions have to change the output, or they are theatre. */
describe("answers change what is generated", () => {
  it("drops every accent rule at 'none' and keeps them otherwise", () => {
    const none = slidesFor(prefs({ decor: "none" }));
    const some = slidesFor(prefs({ decor: "normal" }));

    const rules = (slides: typeof none) =>
      slides.flatMap((s) => s.layers.filter((l) => l.kind === "rect" && l.name !== "Block"));

    expect(rules(none)).toHaveLength(0);
    expect(rules(some).length).toBeGreaterThan(0);
  });

  it("makes rules heavier at 'bold'", () => {
    const thin = slidesFor(prefs({ decor: "normal" }))[0]!.layers.find((l) => l.name === "Rule")!;
    const thick = slidesFor(prefs({ decor: "bold" }))[0]!.layers.find((l) => l.name === "Rule")!;
    expect(thick.h).toBeGreaterThan(thin.h);
  });

  it("removes the picture band at 'never' and gives the text the room", () => {
    const withPics = slidesFor(prefs({ images: "sometimes" }));
    const without = slidesFor(prefs({ images: "never" }));

    expect(withPics[0]!.layers.some((l) => l.kind === "image")).toBe(true);
    expect(without.every((s) => s.layers.every((l) => l.kind !== "image"))).toBe(true);

    const title = (slides: typeof withPics) => slides[0]!.layers.find((l) => l.name === "Title")!;
    expect(title(without).fontSize!).toBeGreaterThanOrEqual(title(withPics).fontSize!);
  });

  it("carries the chosen accent and fonts onto the layers", () => {
    const slides = slidesFor(prefs({ accent: "#ff00ff", displayFont: "mono", bodyFont: "mono" }));
    const rule = slides[0]!.layers.find((l) => l.name === "Rule");
    expect(rule?.fill).toBe("#ff00ff");
    for (const s of slides) {
      for (const l of s.layers) if (l.kind === "text") expect(l.fontFamily).toBe("mono");
    }
  });

  it("still never overflows, whatever the answers", () => {
    const long = "This is a deliberately long hook that would overflow a naive layout engine twice over";
    for (const ground of ["dark", "light"] as const) {
      for (const images of ["always", "never"] as const) {
        for (const decor of ["none", "normal", "bold"] as const) {
          const p = prefs({ ground, images, decor });
          for (const s of slidesFor(p, [long, long, long])) {
            for (const l of s.layers) {
              expect(l.y + l.h, `${ground}/${images}/${decor}/${l.name}`).toBeLessThanOrEqual(H + 0.5);
              expect(l.y).toBeGreaterThanOrEqual(-0.5);
            }
          }
        }
      }
    }
  });
});
