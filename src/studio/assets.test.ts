import { describe, expect, it } from "vitest";

import {
  assetIdsIn,
  assetPath,
  contentKey,
  dataUrlBytes,
  dataUrlToBytes,
  dehydrateDoc,
  extensionFor,
  filterAssets,
  folderOf,
  foldersOf,
  hoistInlineAssets,
  isDataUrl,
  makeAsset,
  parseDataUrl,
  resolveDoc,
  UNFILED,
  type Asset,
} from "./assets.js";
import { makeDoc, makeLayer, makeSlide, type Doc, type Layer } from "./model.js";

/** "hello" — eight bytes of base64 for five bytes of file. */
const PNG = "data:image/png;base64,aGVsbG8=";
const OTHER = "data:image/jpeg;base64,d29ybGQ=";

const image = (src: string, at = { x: 0, y: 0, w: 100, h: 100 }): Layer => ({
  ...makeLayer("image", at, "#000000"),
  src,
});

const deck = (layers: Layer[][], media: Doc["media"] = []): Doc => ({
  ...makeDoc("Test"),
  media,
  slides: layers.map((ls, i) => ({ ...makeSlide("#000000", `S${i}`), layers: ls })),
});

describe("data URLs", () => {
  it("splits one into its mime and its payload", () => {
    expect(parseDataUrl(PNG)).toEqual({ mime: "image/png", base64: "aGVsbG8=" });
  });

  it("refuses one that is not base64, rather than decoding it wrongly", () => {
    expect(parseDataUrl("data:text/plain,hello")).toBeNull();
  });

  it("is not fooled by an ordinary URL", () => {
    expect(parseDataUrl("https://example.com/a.png")).toBeNull();
    expect(isDataUrl("https://example.com/a.png")).toBe(false);
  });

  /**
   * The whole point of this function. `src.length` on this string is 29; the
   * file is 5 bytes. Every size the media pool reported was inflated by a third.
   */
  it("counts the DECODED bytes, not the length of the string", () => {
    expect(dataUrlBytes(PNG)).toBe(5);
    expect(dataUrlBytes(PNG)).toBeLessThan(PNG.length);
  });

  it("handles both amounts of padding", () => {
    // "hell" -> aGVsbA==  (4 bytes, two pad), "hel" -> aGVs (3 bytes, none)
    expect(dataUrlBytes("data:image/png;base64,aGVsbA==")).toBe(4);
    expect(dataUrlBytes("data:image/png;base64,aGVs")).toBe(3);
  });

  it("decodes to the actual bytes", () => {
    expect([...dataUrlToBytes(PNG)]).toEqual([104, 101, 108, 108, 111]);
  });

  it("maps mime types to the extension a bucket should use", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("IMAGE/PNG")).toBe("png");
    expect(extensionFor("font/woff2")).toBe("woff2");
    expect(extensionFor("application/x-nonsense")).toBe("bin");
  });
});

describe("paths", () => {
  /**
   * The storage policy compares the first path segment against auth.uid(), so
   * this layout IS the access rule. If this test changes, 04-storage.sql has to.
   */
  it("puts the owner first, because that is what the policy matches on", () => {
    const asset = makeAsset({ kind: "image", mime: "image/png", id: "a_1" });
    expect(assetPath("user-42", asset)).toBe("user-42/image/a_1.png");
  });

  it("separates fonts from images", () => {
    const font = makeAsset({ kind: "font", mime: "font/woff2", id: "a_2" });
    expect(assetPath("u", font)).toBe("u/font/a_2.woff2");
  });
});

describe("fingerprints", () => {
  it("is the same for the same bytes and different for different ones", () => {
    expect(contentKey(PNG)).toBe(contentKey(PNG));
    expect(contentKey(PNG)).not.toBe(contentKey(OTHER));
  });

  /** The mime is not part of it: the same picture re-encoded is a different file. */
  it("ignores the mime and reads only the payload", () => {
    expect(contentKey("data:image/png;base64,aGVsbG8=")).toBe(
      contentKey("data:image/webp;base64,aGVsbG8="),
    );
  });
});

describe("hoisting inlined pictures out of a document", () => {
  it("gives every inlined picture an asset", () => {
    const out = hoistInlineAssets(deck([[image(PNG)], [image(OTHER)]]));
    expect(out.created).toHaveLength(2);
    expect(out.changed).toBe(2);
  });

  /** The reason the whole batch exists: one logo in twenty decks is one object. */
  it("stores the same picture once, however many times it appears", () => {
    const out = hoistInlineAssets(deck([[image(PNG), image(PNG)], [image(PNG)]]));
    expect(out.created).toHaveLength(1);
    expect(out.changed).toBe(3);

    const ids = new Set(out.doc.slides.flatMap((s) => s.layers.map((l) => l.assetId)));
    expect(ids.size).toBe(1);
  });

  it("reuses an asset the library already has", () => {
    const known: Asset = makeAsset({
      kind: "image",
      mime: "image/png",
      id: "a_known",
      key: contentKey(PNG),
    });
    const out = hoistInlineAssets(deck([[image(PNG)]]), [known]);

    expect(out.created).toHaveLength(0);
    expect(out.changed).toBe(1);
    expect(out.doc.slides[0]?.layers[0]?.assetId).toBe("a_known");
  });

  /**
   * Nothing may be lost. The reference is ADDED; the bytes stay where they were
   * until an upload has actually come back ok, so a half-finished migration
   * leaves a document that still renders.
   */
  it("leaves the original src in place", () => {
    const out = hoistInlineAssets(deck([[image(PNG)]]));
    expect(out.doc.slides[0]?.layers[0]?.src).toBe(PNG);
  });

  it("covers the media pool as well as the layers", () => {
    const out = hoistInlineAssets(
      deck([[]], [{ id: "m1", name: "Logo", src: PNG, w: 10, h: 10, bytes: 5 }]),
    );
    expect(out.doc.media[0]?.assetId).toBeDefined();
  });

  it("does nothing on a second run", () => {
    const once = hoistInlineAssets(deck([[image(PNG)]]));
    const twice = hoistInlineAssets(once.doc, once.created);
    expect(twice.changed).toBe(0);
    expect(twice.created).toHaveLength(0);
  });

  it("ignores a layer that already points at a remote file", () => {
    const remote = { ...image("https://cdn.example.com/a.png") };
    const out = hoistInlineAssets(deck([[remote]]));
    expect(out.changed).toBe(0);
  });
});

describe("dehydrating for storage", () => {
  it("drops the bytes of anything the library holds", () => {
    const hoisted = hoistInlineAssets(deck([[image(PNG)]])).doc;
    const flat = dehydrateDoc(hoisted);
    expect(flat.slides[0]?.layers[0]?.src).toBe("");
    expect(flat.slides[0]?.layers[0]?.assetId).toBeDefined();
  });

  /** A document with no account behind it has to go on working. */
  it("leaves an un-migrated picture exactly as it was", () => {
    const flat = dehydrateDoc(deck([[image(PNG)]]));
    expect(flat.slides[0]?.layers[0]?.src).toBe(PNG);
  });

  it("is much smaller on disk", () => {
    const hoisted = hoistInlineAssets(deck([[image(PNG), image(PNG), image(PNG)]])).doc;
    expect(JSON.stringify(dehydrateDoc(hoisted)).length).toBeLessThan(
      JSON.stringify(hoisted).length,
    );
  });
});

describe("resolving on the way back in", () => {
  const hoisted = hoistInlineAssets(deck([[image(PNG)]])).doc;
  const id = hoisted.slides[0]?.layers[0]?.assetId ?? "";

  it("finds every asset a document depends on", () => {
    expect(assetIdsIn(hoisted)).toEqual([id]);
  });

  it("puts a live URL back into src", () => {
    const flat = dehydrateDoc(hoisted);
    const out = resolveDoc(flat, (a) => (a === id ? "https://signed/one.png" : undefined));
    expect(out.slides[0]?.layers[0]?.src).toBe("https://signed/one.png");
  });

  /**
   * Returned unchanged when nothing moved, so a resolve on every open does not
   * register as an edit — which would restamp the document and win every
   * subsequent merge.
   */
  it("returns the same object when there is nothing to do", () => {
    const flat = dehydrateDoc(hoisted);
    expect(resolveDoc(flat, () => undefined)).toBe(flat);
  });

  it("keeps whatever src it had when an asset cannot be resolved", () => {
    const out = resolveDoc(hoisted, () => undefined);
    expect(out.slides[0]?.layers[0]?.src).toBe(PNG);
  });
});

describe("organising", () => {
  const a = (patch: Partial<Asset>): Asset =>
    makeAsset({ kind: "image", mime: "image/png", ...patch });

  it("treats a blank folder as unfiled", () => {
    expect(folderOf(a({ folder: "   " }))).toBe(UNFILED);
    expect(folderOf(a({ folder: "Logos" }))).toBe("Logos");
  });

  it("lists named folders alphabetically with unfiled last", () => {
    const list = [a({ folder: "Zed" }), a({}), a({ folder: "Acme" })];
    expect(foldersOf(list)).toEqual(["Acme", "Zed", UNFILED]);
  });

  it("omits unfiled entirely when everything is filed", () => {
    expect(foldersOf([a({ folder: "Acme" })])).toEqual(["Acme"]);
  });

  it("searches name and folder together", () => {
    const list = [a({ name: "Headshot" }), a({ name: "Mark", folder: "Acme" })];
    expect(filterAssets(list, { text: "acme" })).toHaveLength(1);
    expect(filterAssets(list, { text: "head" })).toHaveLength(1);
  });

  /** A stock photo does not stop being usable because a client folder is open. */
  it("includes unscoped assets when filtering by brand", () => {
    const list = [a({ brandId: "b1" }), a({ brandId: "b2" }), a({})];
    expect(filterAssets(list, { brandId: "b1" })).toHaveLength(2);
  });

  it("separates fonts from images", () => {
    const list = [a({}), makeAsset({ kind: "font", mime: "font/woff2" })];
    expect(filterAssets(list, { kind: "font" })).toHaveLength(1);
  });
});
