import { useCallback, useEffect, useRef, useState } from "react";

import { newId } from "../doc/ids.js";
import { rebuild, serialize } from "../doc/serialize.js";
import { assignRoles, splitToSlides } from "../doc/split.js";
import type { FlashCCDocument, Slide } from "../doc/types.js";
import { saveDocument } from "./persist.js";

/**
 * Snapshot history. R11 requires undo to cover everything — reorder, delete, split,
 * brand kit — and a snapshot stack gets that for free at this document size.
 */
const LIMIT = 100;

export function useDocument(initial: FlashCCDocument) {
  const [doc, setDoc] = useState(initial);
  const past = useRef<FlashCCDocument[]>([]);
  const future = useRef<FlashCCDocument[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);
  const tagRef = useRef<string | null>(null);

  /** `coalesce` merges rapid edits of the same kind into one undo entry. */
  const commit = useCallback((next: FlashCCDocument, coalesce?: string) => {
    setDoc((current) => {
      const lastTag = tagRef.current;
      if (!(coalesce !== undefined && lastTag === coalesce)) {
        past.current = [...past.current.slice(-LIMIT), current];
        future.current = [];
      }
      tagRef.current = coalesce ?? null;
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setDoc((current) => {
      const previous = past.current[past.current.length - 1];
      if (!previous) return current;
      past.current = past.current.slice(0, -1);
      future.current = [current, ...future.current];
      tagRef.current = null;
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setDoc((current) => {
      const next = future.current[0];
      if (!next) return current;
      future.current = future.current.slice(1);
      past.current = [...past.current, current];
      tagRef.current = null;
      return next;
    });
  }, []);

  // Silent debounced autosave (R15).
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveDocument(doc), 400);
    return () => window.clearTimeout(saveTimer.current);
  }, [doc]);

  // ── document operations ────────────────────────────────────────────────────

  const setSource = useCallback(
    (source: string) => {
      commit(
        { ...doc, source, slides: rebuild(source, doc.granularity, doc.slides) },
        "source",
      );
    },
    [commit, doc],
  );

  const setGranularity = useCallback(
    (granularity: FlashCCDocument["granularity"]) => {
      commit({
        ...doc,
        granularity,
        slides: rebuild(doc.source, granularity, doc.slides),
      });
    },
    [commit, doc],
  );

  const setSlides = useCallback(
    (slides: Slide[], coalesce?: string) => {
      const roled = assignRoles(slides).map((s, i) => ({
        ...s,
        roleOverride: slides[i]?.roleOverride,
      }));
      commit({ ...doc, slides: roled, source: serialize(roled) }, coalesce);
    },
    [commit, doc],
  );

  const replaceSource = useCallback(
    (source: string) => {
      commit({ ...doc, source, slides: splitToSlides(source, doc.granularity) });
    },
    [commit, doc],
  );

  const setBrandKit = useCallback(
    (brandKit: FlashCCDocument["brandKit"], coalesce?: string) => {
      commit({ ...doc, brandKit }, coalesce);
    },
    [commit, doc],
  );

  const setTemplate = useCallback(
    (template: FlashCCDocument["template"]) => commit({ ...doc, template }),
    [commit, doc],
  );

  const setName = useCallback(
    (name: string) => commit({ ...doc, name }, "name"),
    [commit, doc],
  );

  const duplicateSlide = useCallback(
    (index: number) => {
      const slide = doc.slides[index];
      if (!slide) return;
      const copy: Slide = {
        ...slide,
        id: newId("sld"),
        blocks: slide.blocks.map((b) => ({ ...b, id: newId("blk") })),
      };
      setSlides([...doc.slides.slice(0, index + 1), copy, ...doc.slides.slice(index + 1)]);
    },
    [doc.slides, setSlides],
  );

  const deleteSlide = useCallback(
    (index: number) => setSlides(doc.slides.filter((_, i) => i !== index)),
    [doc.slides, setSlides],
  );

  const addSlide = useCallback(() => {
    const blank: Slide = {
      id: newId("sld"),
      role: "body",
      blocks: [{ id: newId("blk"), type: "paragraph", text: "New slide" }],
    };
    setSlides([...doc.slides, blank]);
  }, [doc.slides, setSlides]);

  const moveSlide = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const next = [...doc.slides];
      const [moved] = next.splice(from, 1);
      if (!moved) return;
      next.splice(to, 0, moved);
      setSlides(next);
    },
    [doc.slides, setSlides],
  );

  const setRoleOverride = useCallback(
    (index: number, role: Slide["role"] | undefined) => {
      setSlides(doc.slides.map((s, i) => (i === index ? { ...s, roleOverride: role } : s)));
    },
    [doc.slides, setSlides],
  );

  return {
    doc,
    undo,
    redo,
    canUndo: past.current.length > 0,
    setSource,
    replaceSource,
    setGranularity,
    setSlides,
    setBrandKit,
    setTemplate,
    setName,
    duplicateSlide,
    deleteSlide,
    addSlide,
    moveSlide,
    setRoleOverride,
  };
}
