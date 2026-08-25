import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cloneLayer, makeSlide, type Doc, type Layer, type Slide, type Tool } from "./model.js";
import { saveDoc } from "./storage.js";

const LIMIT = 120;

/**
 * All editor state. Snapshot history, so undo covers everything — every layer edit,
 * every reorder, every slide operation — without a command class per action.
 */
export function useStudio(initial: Doc) {
  const [doc, setDoc] = useState(initial);
  const [slideIndex, setSlideIndex] = useState(0);
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [editingId, setEditingId] = useState<string | null>(null);

  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const tag = useRef<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  const index = Math.min(slideIndex, Math.max(0, doc.slides.length - 1));
  const slide = doc.slides[index];

  const commit = useCallback((next: Doc, coalesce?: string) => {
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

  const updateLayers = useCallback(
    (ids: string[], patch: Partial<Layer>, coalesce?: string) => {
      patchSlide(
        index,
        (s) => ({ ...s, layers: s.layers.map((l) => (ids.includes(l.id) ? { ...l, ...patch } : l)) }),
        coalesce,
      );
    },
    [index, patchSlide],
  );

  const updateEach = useCallback(
    (fn: (l: Layer) => Layer, ids: string[], coalesce?: string) => {
      patchSlide(
        index,
        (s) => ({ ...s, layers: s.layers.map((l) => (ids.includes(l.id) ? fn(l) : l)) }),
        coalesce,
      );
    },
    [index, patchSlide],
  );

  const removeSelected = useCallback(() => {
    if (selection.length === 0) return;
    patchSlide(index, (s) => ({ ...s, layers: s.layers.filter((l) => !selection.includes(l.id)) }));
    setSelection([]);
  }, [index, patchSlide, selection]);

  const duplicateSelected = useCallback(() => {
    if (!slide || selection.length === 0) return;
    const copies = slide.layers.filter((l) => selection.includes(l.id)).map((l) => cloneLayer(l));
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
      commit({ ...doc, slides: [...doc.slides.slice(0, at), s, ...doc.slides.slice(at)] });
      setSlideIndex(at);
      setSelection([]);
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
        layers: src.layers.map((l) => cloneLayer(l, 0, 0)),
      };
      commit({ ...doc, slides: [...doc.slides.slice(0, i + 1), copy, ...doc.slides.slice(i + 1)] });
      setSlideIndex(i + 1);
    },
    [commit, doc],
  );

  const deleteSlide = useCallback(
    (i: number) => {
      if (doc.slides.length <= 1) return;
      commit({ ...doc, slides: doc.slides.filter((_, n) => n !== i) });
      setSlideIndex(Math.max(0, i - 1));
      setSelection([]);
    },
    [commit, doc],
  );

  const moveSlide = useCallback(
    (from: number, to: number) => {
      const next = [...doc.slides];
      const [m] = next.splice(from, 1);
      if (!m) return;
      next.splice(to, 0, m);
      commit({ ...doc, slides: next });
      setSlideIndex(to);
    },
    [commit, doc],
  );

  const setBackground = useCallback(
    (hex: string) => patchSlide(index, (s) => ({ ...s, background: hex }), "bg"),
    [index, patchSlide],
  );

  const setFormat = useCallback(
    (w: number, h: number) => commit({ ...doc, width: w, height: h }),
    [commit, doc],
  );

  const setName = useCallback((name: string) => commit({ ...doc, name }, "name"), [commit, doc]);

  const replaceDoc = useCallback((next: Doc) => commit(next), [commit]);

  const selected = useMemo(
    () => (slide ? slide.layers.filter((l) => selection.includes(l.id)) : []),
    [slide, selection],
  );

  return {
    doc,
    slide,
    index,
    setSlideIndex,
    selection,
    setSelection,
    selected,
    tool,
    setTool,
    editingId,
    setEditingId,
    undo,
    redo,
    canUndo: past.current.length > 0,
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
    setFormat,
    setName,
    replaceDoc,
  };
}

export type Studio = ReturnType<typeof useStudio>;
