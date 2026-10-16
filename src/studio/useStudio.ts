import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  cloneLayer,
  makeLayer,
  makeSlide,
  uid,
  type Doc,
  type Layer,
  type MediaItem,
  type Slide,
  type SlideImage,
  type Tool,
} from "./model.js";
import type { Gradient } from "./gradient.js";
import type { PlatformId } from "./platforms.js";
import { platformForSize } from "./platforms.js";
import { reflowDoc } from "./reflow.js";
import { fitToSafeArea } from "./safearea.js";
// Deck furniture (Batch 20) is resealed at every STRUCTURAL funnel below: slide
// insert, duplicate, delete, reorder, format change, and anything that replaces
// the document (re-lay, a rewrite that splits a slide, a restored version).
// Never on an ordinary layer edit, so a piece somebody deleted on purpose is
// not put straight back.
import { reseal } from "./furniture.js";
import { listBrands, themeOf } from "./brand.js";
import { hasMarks } from "./marks.js";
import { markColourFor } from "./texteffects.js";
import { bundledIdsIn, ensureFacesFor } from "./typefaces.js";
import { loadKerning } from "./typemetrics.js";
import { markEdited, retouched } from "./regenerate.js";
import { isUnnamed, nameFromDoc } from "./search.js";
import { deleteSet, duplicateSet, inDeckOrder, moveSet } from "./slideset.js";
import { saveDoc } from "./storage.js";
import { spacingFor } from "./compositions.js";
import { piecesOf, place, stripX } from "./spans.js";
import {
  align as alignLayers,
  distribute as distributeLayers,
  equalGap as equalGapLayers,
  group as groupLayers,
  matchAcross,
  matchWidth as matchWidthLayers,
  regroupCopies,
  tidySlide as tidyLayers,
  ungroup as ungroupLayers,
  withGroups,
  type Edge,
  type MatchResult,
  type Moves,
  type TidyResult,
} from "./tidy.js";

const LIMIT = 120;

const spanIds = { span: () => uid("span"), layer: () => uid("l") };

/**
 * All editor state. Snapshot history, so undo covers everything, every layer edit,
 * every reorder, every slide operation, without a command class per action.
 */
export function useStudio(initial: Doc) {
  const [doc, setDoc] = useState(initial);
  const [slideIndex, setSlideIndex] = useState(0);
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [editingId, setEditingId] = useState<string | null>(null);
  // Which platform's covered areas to draw over the canvas. Null is off. It lives
  // here rather than in Canvas so the toolbar can drive it, and it is deliberately
  // NOT part of Doc, it is a view setting, not something about the artwork, and
  // it must never reach the export path.
  const [safePlatform, setSafePlatform] = useState<PlatformId | null>(null);
  /** Every slide side by side, the only view a seam can be judged in (23.1). A view setting, not the doc. */
  const [stripView, setStripView] = useState(false);
  /** The deck as one text document (24.1). A view, like strip view. */
  const [outline, setOutline] = useState(false);
  /**
   * Slides picked in the filmstrip (18.5). IDS, not indexes, so a reorder does
   * not change what is selected. Separate from `index`, the slide on the
   * canvas: the canvas always shows one slide, the filmstrip can hold several.
   */
  const [slideSelection, setSlideSelection] = useState<string[]>([]);
  /**
   * The block picker (19.6, 19.8): inserting a new block, or editing the fields
   * of one already placed. A view state, like the safe-zone overlay.
   */
  const [picker, setPicker] = useState<
    { mode: "insert"; block?: string | undefined } | { mode: "edit"; instance: string } | null
  >(null);

  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const tag = useRef<string | null>(null);
  /**
   * What produced each state, for the undo button's name ("Undo Outline").
   * Keyed by the document object itself, so it needs no upkeep: a state that
   * leaves the history is forgotten with it.
   */
  const labels = useRef(new WeakMap<Doc, string>());
  const saveTimer = useRef<number | undefined>(undefined);

  const index = Math.min(slideIndex, Math.max(0, doc.slides.length - 1));
  const slide = doc.slides[index];

  const commit = useCallback((raw: Doc, coalesce?: string, label?: string) => {
    // A blank canvas has no hook to be named after yet. Rather than leaving it
    // "Untitled" forever, it takes a name the moment there is one to take,
    // which is also the only point at which the name would be right. A name the
    // user chose is never overwritten, because isUnnamed only matches the ones
    // the app supplied.
    const next = isUnnamed(raw.name) ? { ...raw, name: nameFromDoc(raw) } : raw;
    if (label) labels.current.set(next, label);

    setDoc((cur) => {
      if (!(coalesce !== undefined && tag.current === coalesce)) {
        past.current = [...past.current.slice(-LIMIT), cur];
        future.current = [];
      }
      tag.current = coalesce ?? null;
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setDoc((cur) => {
      const prev = past.current.at(-1);
      if (!prev) return cur;
      past.current = past.current.slice(0, -1);
      future.current = [cur, ...future.current];
      tag.current = null;
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    setDoc((cur) => {
      const next = future.current[0];
      if (!next) return cur;
      future.current = future.current.slice(1);
      past.current = [...past.current, cur];
      tag.current = null;
      return next;
    });
  }, []);

  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveDoc(doc), 400);
    return () => window.clearTimeout(saveTimer.current);
  }, [doc]);

  /* ── slide ops ──────────────────────────────────────────────────────── */

  const patchSlide = useCallback(
    (i: number, fn: (s: Slide) => Slide, coalesce?: string) => {
      commit({ ...doc, slides: doc.slides.map((s, n) => (n === i ? fn(s) : s)) }, coalesce);
    },
    [commit, doc],
  );

  const setLayers = useCallback(
    (layers: Layer[], coalesce?: string) => patchSlide(index, (s) => ({ ...s, layers }), coalesce),
    [index, patchSlide],
  );

  const addLayer = useCallback(
    (layer: Layer) => {
      patchSlide(index, (s) => ({ ...s, layers: [...s.layers, layer] }));
      setSelection([layer.id]);
      return layer;
    },
    [index, patchSlide],
  );

  // The faces this deck draws with (Batch 22): kerning for its bundled
  // families, so measurement is exact, and the CJK faces if it has CJK text.
  // Both are no-ops once loaded.
  useEffect(() => {
    void loadKerning(bundledIdsIn([doc]));
    void ensureFacesFor(doc.slides.flatMap((s) => s.layers.map((l) => l.text ?? "")));
  }, [doc]);

  /** The emphasis colour for a layer on a slide, from the deck's theme. */
  const markFor = useCallback(
    (s: Slide, l: Layer) => markColourFor(themeOf(doc, listBrands()), s.background, l.fill),
    [doc],
  );

  const updateLayers = useCallback(
    (ids: string[], patch: Partial<Layer>, coalesce?: string) => {
      // In strip view (23.1) a span is one design: a change that is not about
      // where it sits goes to every piece, so the seam cannot drift in colour
      // or type. A position or size typed into the inspector moves or resizes
      // the whole design along the strip, so the seam holds there too.
      const peers = stripView
        ? new Set(
            doc.slides[index]?.layers.flatMap((l) => (ids.includes(l.id) && l.spanId ? [l.spanId] : [])) ?? [],
          )
        : new Set<string>();
      if (peers.size > 0) {
        const { x, y, w, h, ...style } = patch;
        const geometry = x !== undefined || y !== undefined || w !== undefined || h !== undefined;
        const styled: Doc = {
          ...doc,
          slides: doc.slides.map((sl, n) => ({
            ...sl,
            layers: sl.layers.map((l) => {
              if (n === index && ids.includes(l.id) && !(geometry && ids.length === 1))
                return markEdited(retouched(l, { ...l, ...patch }, () => markFor(sl, l)));
              if ((l.spanId && peers.has(l.spanId)) || (n === index && ids.includes(l.id)))
                return markEdited(retouched(l, { ...l, ...style }, () => markFor(sl, l)));
              return l;
            }),
          })),
        };
        const own = ids.length === 1 ? styled.slides[index]?.layers.find((l) => l.id === ids[0]) : undefined;
        if (geometry && own?.spanId) {
          const template = { ...own, ...(w !== undefined ? { w } : {}), ...(h !== undefined ? { h } : {}) };
          const at = { x: stripX(index, x ?? own.x, doc.width), y: y ?? own.y };
          commit(place(styled, at, piecesOf(styled, own.spanId), template, spanIds, own.id), coalesce);
        } else {
          commit(styled, coalesce);
        }
        return;
      }
      patchSlide(
        index,
        // markEdited here rather than at each call site: this and updateEach are
        // the only two funnels an editor change can come through, so flagging
        // them both is the whole of it.
        (s) => ({
          ...s,
          layers: s.layers.map((l) =>
            ids.includes(l.id) ? markEdited(retouched(l, { ...l, ...patch }, () => markFor(s, l))) : l,
          ),
        }),
        coalesce,
      );
    },
    [index, patchSlide, markFor, stripView, doc, commit],
  );

  const updateEach = useCallback(
    (fn: (l: Layer) => Layer, ids: string[], coalesce?: string) => {
      patchSlide(
        index,
        (s) => ({
          ...s,
          layers: s.layers.map((l) => (ids.includes(l.id) ? markEdited(retouched(l, fn(l), () => markFor(s, l))) : l)),
        }),
        coalesce,
      );
    },
    [index, patchSlide, markFor],
  );

  const removeSelected = useCallback(() => {
    if (selection.length === 0) return;
    patchSlide(index, (s) => ({ ...s, layers: s.layers.filter((l) => !selection.includes(l.id)) }));
    setSelection([]);
  }, [index, patchSlide, selection]);

  const duplicateSelected = useCallback(() => {
    if (!slide || selection.length === 0) return;
    // Copies of a group form a group of their own, see regroupCopies.
    const copies = regroupCopies(
      slide.layers.filter((l) => selection.includes(l.id)).map((l) => cloneLayer(l)),
      () => uid("g"),
    );
    patchSlide(index, (s) => ({ ...s, layers: [...s.layers, ...copies] }));
    setSelection(copies.map((c) => c.id));
  }, [index, patchSlide, selection, slide]);

  /** Photoshop z-order: front is the end of the array. */
  const reorder = useCallback(
    (dir: "front" | "forward" | "backward" | "back") => {
      if (!slide || selection.length === 0) return;
      const picked = slide.layers.filter((l) => selection.includes(l.id));
      const rest = slide.layers.filter((l) => !selection.includes(l.id));

      if (dir === "front") return setLayers([...rest, ...picked]);
      if (dir === "back") return setLayers([...picked, ...rest]);

      const next = [...slide.layers];
      const idxs = next.map((l, i) => (selection.includes(l.id) ? i : -1)).filter((i) => i >= 0);
      const ordered = dir === "forward" ? [...idxs].reverse() : idxs;
      for (const i of ordered) {
        const j = dir === "forward" ? i + 1 : i - 1;
        if (j < 0 || j >= next.length) continue;
        const a = next[i];
        const b = next[j];
        if (!a || !b || selection.includes(b.id)) continue;
        next[i] = b;
        next[j] = a;
      }
      setLayers(next);
      return undefined;
    },
    [selection, setLayers, slide],
  );

  const moveLayerTo = useCallback(
    (from: number, to: number) => {
      if (!slide) return;
      const next = [...slide.layers];
      const [m] = next.splice(from, 1);
      if (!m) return;
      next.splice(to, 0, m);
      setLayers(next);
    },
    [setLayers, slide],
  );

  /* ── slides ─────────────────────────────────────────────────────────── */

  const addSlide = useCallback(
    (at = doc.slides.length) => {
      const s = makeSlide(slide?.background ?? "#12161c", `Slide ${doc.slides.length + 1}`);
      commit(reseal({ ...doc, slides: [...doc.slides.slice(0, at), s, ...doc.slides.slice(at)] }));
      setSlideIndex(at);
      setSelection([]);
      // The count changed, so the filmstrip's picked set is cleared (18.5).
      setSlideSelection([]);
    },
    [commit, doc, slide],
  );

  const duplicateSlide = useCallback(
    (i: number) => {
      const src = doc.slides[i];
      if (!src) return;
      const copy: Slide = {
        ...src,
        id: `${src.id}_c${Date.now().toString(36)}`,
        name: `${src.name} copy`,
        layers: regroupCopies(
          src.layers.map((l) => cloneLayer(l, 0, 0)),
          () => uid("g"),
        ),
      };
      commit(reseal({ ...doc, slides: [...doc.slides.slice(0, i + 1), copy, ...doc.slides.slice(i + 1)] }));
      setSlideIndex(i + 1);
      setSlideSelection([]);
    },
    [commit, doc],
  );

  const deleteSlide = useCallback(
    (i: number) => {
      if (doc.slides.length <= 1) return;
      commit(reseal({ ...doc, slides: doc.slides.filter((_, n) => n !== i) }));
      setSlideIndex(Math.max(0, i - 1));
      setSelection([]);
      setSlideSelection([]);
    },
    [commit, doc],
  );

  const moveSlide = useCallback(
    (from: number, to: number) => {
      const next = [...doc.slides];
      const [m] = next.splice(from, 1);
      if (!m) return;
      next.splice(to, 0, m);
      commit(reseal({ ...doc, slides: next }));
      setSlideIndex(to);
    },
    [commit, doc],
  );

  const setBackground = useCallback(
    (hex: string) =>
      // Clears the gradient but NOT the picture: the colour is what shows through
      // a `contain` fit, so changing it while an image is set is a real edit
      // rather than a mistake to undo on the user's behalf.
      patchSlide(index, (s) => ({ ...s, background: hex, gradient: undefined }), "bg"),
    [index, patchSlide],
  );

  const setBackgroundGradient = useCallback(
    (gradient: Gradient | undefined) => patchSlide(index, (s) => ({ ...s, gradient }), "bggrad"),
    [index, patchSlide],
  );

  /**
   * Alt text for any slide, not only the current one.
   *
   * Takes an index because the export dialog writes all of them at once, and
   * coalesced under one key so writing nine of them is one undo rather than
   * nine.
   */
  const setSlideAlt = useCallback(
    (at: number, alt: string) =>
      patchSlide(at, (s) => ({ ...s, alt: alt.trim() ? alt : undefined }), "alt"),
    [patchSlide],
  );

  const setBackgroundImage = useCallback(
    (image: SlideImage | undefined) => patchSlide(index, (s) => ({ ...s, image }), "bgimg"),
    [index, patchSlide],
  );

  // Re-lays the layers that are there rather than just changing the numbers.
  // The old version kept every pixel position, so going taller stranded the
  // content in the top two-thirds, see reflow.ts for why it is not a scale
  // either, and why it does not regenerate from the source text.
  const setFormat = useCallback(
    (w: number, h: number) => {
      const reflowed = reflowDoc(doc, w, h);
      // Reflow knows the new artboard; it does not know what the PLATFORM draws
      // on top of it. A deck moved to 1080x1920 kept its 96px side margins and
      // put every headline under TikTok's action rail. When the new size belongs
      // to a platform, pull the content clear of its chrome as well.
      const platform = platformForSize(w, h);
      commit(reseal(platform ? fitToSafeArea(reflowed, platform) : reflowed, { platform, replace: true }));
    },
    [commit, doc],
  );

  const setName = useCallback((name: string) => commit({ ...doc, name }, "name"), [commit, doc]);

  /* ── media pool ─────────────────────────────────────────────────────── */

  const addMedia = useCallback(
    (items: MediaItem[]) => {
      if (items.length === 0) return;
      commit({ ...doc, media: [...items, ...doc.media] });
    },
    [commit, doc],
  );

  const removeMedia = useCallback(
    (id: string) => commit({ ...doc, media: doc.media.filter((m) => m.id !== id) }),
    [commit, doc],
  );

  /**
   * Drop a picture onto a layer. The slot keeps its own box and the image is
   * cover-fitted into it, so the composition stays intact.
   */
  const fillWithMedia = useCallback(
    (layerId: string, media: MediaItem) => {
      patchSlide(index, (s) => ({
        ...s,
        layers: s.layers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                kind: "image",
                src: media.src,
                // Carried, not just the URL: a signed URL expires and the
                // document has to be able to ask for a fresh one. See
                // assets.resolveDoc.
                // Replaced, never kept: a stale asset id would let
                // `resolveDoc` put the PREVIOUS picture back on the next open.
                // Everything else on the layer (box, fit, focal, mask,
                // filter) stays, which is what Replace image (21.4) promises.
                assetId: media.assetId,
                // The photo's credit goes where the photo goes, or a stock
                // picture placed and then removed from the pool loses it.
                credit: media.credit,
                name: media.name,
                fit: l.fit ?? "cover",
              }
            : l,
        ),
      }));
      setSelection([layerId]);
    },
    [index, patchSlide],
  );

  /** Dropped on empty canvas: a new image layer, sized to fit inside the artboard. */
  const placeMedia = useCallback(
    (media: MediaItem, at: { x: number; y: number }) => {
      const max = Math.min(doc.width * 0.6, doc.height * 0.6);
      const scale = Math.min(1, max / Math.max(media.w, media.h));
      const w = Math.round(media.w * scale);
      const h = Math.round(media.h * scale);
      const layer: Layer = {
        ...makeLayer("image", { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h }, "#000000"),
        src: media.src,
        ...(media.assetId ? { assetId: media.assetId } : {}),
        ...(media.credit ? { credit: media.credit } : {}),
        name: media.name,
        radius: 12,
      };
      patchSlide(index, (s) => ({ ...s, layers: [...s.layers, layer] }));
      setSelection([layer.id]);
    },
    [doc.width, doc.height, index, patchSlide],
  );

  // `coalesce` folds a run of edits from one control (a slider) into one undo step.
  const replaceDoc = useCallback(
    (next: Doc, coalesce?: string, label?: string) => commit(reseal(next), coalesce, label),
    [commit],
  );

  /* ── layout tools that act once (Batch 18) ─────────────────────────── */

  /**
   * Every arranging tool ends here: a set of new coordinates, applied through
   * `updateEach`, so it flags `handEdited` and is one undo step like any edit.
   */
  const applyMoves = useCallback(
    (moves: Moves) => {
      if (moves.size === 0) return;
      updateEach((l) => ({ ...l, ...moves.get(l.id) }), [...moves.keys()]);
    },
    [updateEach],
  );

  const board = useMemo(() => ({ w: doc.width, h: doc.height }), [doc.width, doc.height]);
  const scale = spacingFor(slide?.composition);

  const alignSelected = useCallback(
    (edge: Edge) => applyMoves(alignLayers(slide?.layers ?? [], selection, edge, board)),
    [applyMoves, board, selection, slide],
  );

  const distributeSelected = useCallback(
    (axis: "x" | "y") => applyMoves(distributeLayers(slide?.layers ?? [], selection, axis)),
    [applyMoves, selection, slide],
  );

  const equalGapSelected = useCallback(
    (axis: "x" | "y") => {
      const result = equalGapLayers(slide?.layers ?? [], selection, axis, scale);
      applyMoves(result.moves);
      return result.gap;
    },
    [applyMoves, scale, selection, slide],
  );

  const matchWidthSelected = useCallback(
    () => applyMoves(matchWidthLayers(slide?.layers ?? [], selection)),
    [applyMoves, selection, slide],
  );

  /** Tidy slide: nothing selected, the whole slide re-spaced on its scale. */
  const tidy = useCallback((): TidyResult => {
    const result = tidyLayers(slide ?? { id: "", name: "", background: "", layers: [] }, board, scale);
    applyMoves(result.moves);
    return result;
  }, [applyMoves, board, scale, slide]);

  const groupSelected = useCallback(() => {
    if (!slide || selection.length < 2) return;
    setLayers(groupLayers(slide.layers, selection, uid("g")));
  }, [selection, setLayers, slide]);

  const ungroupSelected = useCallback(() => {
    if (!slide) return;
    setLayers(ungroupLayers(slide.layers, selection));
  }, [selection, setLayers, slide]);

  /** Selecting any member of a group selects the group. */
  const withGroupsOf = useCallback(
    (ids: string[]) => withGroups(slide?.layers ?? [], ids),
    [slide],
  );

  /** One layer's unit: itself, or every layer in its group. */
  const groupOf = useCallback((id: string) => withGroupsOf([id]), [withGroupsOf]);

  /**
   * Match on every slide (18.3), or on the slides picked in the filmstrip when
   * more than this one is picked: "this slide range only".
   */
  const matchOnSlides = useCallback(
    (layerId: string): MatchResult => {
      const only = slideSelection.length > 1 ? slideSelection : undefined;
      const result = matchAcross(doc, index, layerId, only);
      if (result.doc !== doc) commit(result.doc);
      return result;
    },
    [commit, doc, index, slideSelection],
  );

  /* ── several slides (18.5) ─────────────────────────────────────────── */

  /** Anything that changes the slide count clears the selection afterwards. */
  const duplicateSlides = useCallback(
    (ids: string[]) => {
      const set = inDeckOrder(doc.slides, ids);
      if (set.length === 0) return;
      const slides = duplicateSet(doc.slides, set, (src) => ({
        ...src,
        id: uid("s"),
        name: `${src.name} copy`,
        layers: regroupCopies(
          src.layers.map((l) => cloneLayer(l, 0, 0)),
          () => uid("g"),
        ),
      }));
      commit(reseal({ ...doc, slides }));
      setSlideSelection([]);
    },
    [commit, doc],
  );

  const deleteSlides = useCallback(
    (ids: string[]) => {
      const slides = deleteSet(doc.slides, ids);
      if (slides.length === doc.slides.length) return;
      commit(reseal({ ...doc, slides }));
      setSlideIndex((i) => Math.min(i, slides.length - 1));
      setSlideSelection([]);
      setSelection([]);
    },
    [commit, doc],
  );

  /** A reorder keeps the selection: it holds ids, so it is still right. */
  const moveSlides = useCallback(
    (ids: string[], target: string) => {
      const slides = moveSet(doc.slides, ids, target);
      commit(reseal({ ...doc, slides }));
      const current = doc.slides[index]?.id;
      const at = slides.findIndex((s) => s.id === current);
      if (at >= 0) setSlideIndex(at);
    },
    [commit, doc, index],
  );

  const selected = useMemo(
    () => (slide ? slide.layers.filter((l) => selection.includes(l.id)) : []),
    [slide, selection],
  );

  return {
    doc,
    slide,
    index,
    stripView,
    setStripView,
    setSlideIndex,
    selection,
    setSelection,
    selected,
    tool,
    setTool,
    editingId,
    setEditingId,
    safePlatform,
    setSafePlatform,
    slideSelection,
    setSlideSelection,
    picker,
    setPicker,
    withGroupsOf,
    groupOf,
    alignSelected,
    distributeSelected,
    equalGapSelected,
    matchWidthSelected,
    tidy,
    groupSelected,
    ungroupSelected,
    matchOnSlides,
    duplicateSlides,
    deleteSlides,
    moveSlides,
    undo,
    redo,
    canUndo: past.current.length > 0,
    /** The name of what Undo would undo, when it has one. */
    undoLabel: labels.current.get(doc),
    commit,
    outline,
    setOutline,
    addLayer,
    updateLayers,
    updateEach,
    setLayers,
    removeSelected,
    duplicateSelected,
    reorder,
    moveLayerTo,
    addSlide,
    duplicateSlide,
    deleteSlide,
    moveSlide,
    setBackground,
    setBackgroundGradient,
    setBackgroundImage,
    setSlideAlt,
    setFormat,
    setName,
    replaceDoc,
    addMedia,
    removeMedia,
    fillWithMedia,
    placeMedia,
  };
}

export type Studio = ReturnType<typeof useStudio>;
