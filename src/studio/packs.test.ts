import { describe, expect, it } from "vitest";

import { themeOf } from "./brand.js";
import { contrast } from "./colour.js";
import { buildSlides } from "./compositions.js";
import { deckIconStyle } from "./iconsets.js";
import { deckFromKit, KITS } from "./kits.js";
import { HOOK_KINDS } from "./hooks.js";
import { CTAS } from "./ctas.js";
import { makeDoc, type Doc } from "./model.js";
import { applyPack, CREATOR_KINDS, packTheme, PACKS } from "./packs.js";
import { pairById } from "./pairs.js";
import { PLATFORMS, type Platform } from "./platforms.js";
import { preflight } from "./preflight.js";
import { reflowDoc } from "./reflow.js";
import { fitToSafeArea } from "./safearea.js";
import { STRUCTURES, structureById } from "./structures.js";
import { MEASURED } from "./typemetrics.js";

describe("style packs (25.6)", () => {
  it("cover every kind of creator, with unique ids", () => {
    expect(new Set(PACKS.map((p) => p.id)).size).toBe(PACKS.length);
    for (const k of CREATOR_KINDS) expect(PACKS.some((p) => p.creator === k.id), k.id).toBe(true);
  });

  it("every pack reads: body text at 4.5:1, muted and accent at 3:1, the accent block holds its words", () => {
    for (const p of PACKS) {
      const c = p.colours;
      expect(contrast(c.fg, c.bg), `${p.id} text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.muted, c.bg), `${p.id} muted`).toBeGreaterThanOrEqual(3);
      expect(contrast(c.accent, c.bg), `${p.id} accent`).toBeGreaterThanOrEqual(3);
      expect(contrast(c.bg, c.accent), `${p.id} block`).toBeGreaterThanOrEqual(3);
    }
  });

  it("every pack's pair exists and is measured, so its type fits as it is drawn", () => {
    for (const p of PACKS) {
      const pair = pairById(p.pair);
      expect(pair, p.id).toBeDefined();
      expect(MEASURED[pair!.display], p.id).toBeDefined();
      expect(MEASURED[pair!.body], p.id).toBeDefined();
    }
  });

  it("applies once: colours, faces, texture, furniture and icon style, and the deck remembers the pack", () => {
    const doc: Doc = { ...makeDoc("x"), slides: buildSlides(["A hook.", "A point\nWith a body.", "Follow."], packTheme(PACKS[0]!)) };
    const p = PACKS.find((x) => x.id === "launch")!;
    const out = applyPack(doc, p, { name: "Ada", handles: {} }, PLATFORMS[0]);
    expect(out.styleId).toBe("pack:launch");
    expect(themeOf(out)).toEqual(packTheme(p));
    expect(out.slides.every((s) => s.background === p.colours.bg)).toBe(true);
    expect(out.slides.every((s) => s.texture?.kind === "mesh")).toBe(true);
    expect(out.furniture?.set).toBe("corporate");
    expect(deckIconStyle(out)).toBe("outline");
    const text = out.slides[1]!.layers.find((l) => l.kind === "text")!;
    expect([pairById(p.pair)!.display, pairById(p.pair)!.body]).toContain(text.fontFamily);
  });
});

/**
 * The landmine: sixteen frameworks times thirteen packs times every
 * destination is well over a thousand decks. The roadmap planned a sample per
 * commit and the full matrix nightly, for speed; measured, the full matrix
 * runs in under two seconds, so it simply runs every time. Zero safe-zone
 * warnings and zero overflows.
 */
const problems = (structureId: string, packId: string, platform: Platform): string[] => {
  const structure = structureById(structureId)!;
  const pack = PACKS.find((p) => p.id === packId)!;
  const theme = packTheme(pack);
  const base: Doc = { ...makeDoc("m"), slides: buildSlides(structure.slots.map((s) => s.placeholder), theme, structure.slots.map((s) => s.id)) };
  const dressed = applyPack(base, pack, { name: "Ada Lovelace", handles: { instagram: "@ada", linkedin: "Ada Lovelace" } }, platform, theme);
  const doc = fitToSafeArea(reflowDoc(dressed, platform.w, platform.h), platform);
  return preflight(doc, platform)
    .filter((f) => f.code === "outside-safe-zone" || f.code === "text-overflows")
    .map((f) => `${structureId}/${packId}/${platform.id} slide ${f.slide}: ${f.message}`);
};

const combos = STRUCTURES.flatMap((s) => PACKS.flatMap((p) => PLATFORMS.map((pl) => [s.id, p.id, pl] as const)));

describe("the pack matrix (25.6)", () => {
  it(`every framework in every pack on every destination, ${combos.length} decks: no safe-zone warning, no overflow`, () => {
    expect(combos.length).toBeGreaterThan(1000);
    const found = combos.flatMap(([s, p, pl]) => problems(s, p, pl));
    expect(found.slice(0, 10)).toEqual([]);
  });
});

describe("starter kits (25.7)", () => {
  it("one per kind of creator, each pointing at a real pack, three real frameworks, a hook kind and a CTA", () => {
    expect(KITS.map((k) => k.id).sort()).toEqual(CREATOR_KINDS.map((k) => k.id).sort());
    for (const k of KITS) {
      expect(PACKS.some((p) => p.id === k.pack), k.id).toBe(true);
      expect(new Set(k.frameworks).size, k.id).toBe(3);
      for (const f of k.frameworks) expect(structureById(f), `${k.id}/${f}`).toBeDefined();
      expect(HOOK_KINDS.some((h) => h.id === k.hookKind)).toBe(true);
      expect(CTAS.some((c) => c.id === k.cta)).toBe(true);
    }
  });

  it("makes an ordinary deck once: the framework's slides, the kit's CTA last, dressed in its pack", () => {
    const kit = KITS.find((k) => k.id === "food")!;
    const doc = deckFromKit(kit, { platform: PLATFORMS.find((p) => p.id === "instagram") })!;
    expect(doc.framework).toBe("checklist");
    expect(doc.styleId).toBe("pack:kitchen");
    const last = doc.slides.at(-1)!.layers.filter((l) => l.kind === "text" && !l.furniture).map((l) => l.text).join(" ");
    expect(last).toMatch(/Comment/);
    expect(Object.keys(doc)).not.toContain("kit");
  });
});
