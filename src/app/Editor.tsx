import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

import { newId } from "../doc/ids.js";
import type { Block, FlashCCDocument, Slide, SlideRole } from "../doc/types.js";
import { FORMATS, type LayoutNode } from "../render/layout/computeLayout.js";
import { useDocument } from "../state/useDocument.js";
import { BrandKitSheet } from "./BrandKitSheet.js";
import { ExportSheet } from "./ExportSheet.js";
import { Filmstrip } from "./Filmstrip.js";
import { SlideStage } from "./SlideStage.js";
import { SourcePane } from "./SourcePane.js";
import { TopBar } from "./TopBar.js";

const MIN_SOURCE_W = 280;
const MAX_SOURCE_W = 720;

type Props = {
  initial: FlashCCDocument;
  onHome: () => void;
};

export function Editor({ initial, onHome }: Props) {
  const api = useDocument(initial);
  const { doc } = api;

  const [index, setIndex] = useState(0);
  const [sheet, setSheet] = useState<"none" | "brand" | "export">("none");
  const [sourceWidth, setSourceWidth] = useState(400);
  const dragging = useRef(false);

  const format = FORMATS[doc.format] ?? { w: 1080, h: 1350 };
  const current = Math.min(index, Math.max(0, doc.slides.length - 1));
  const slide = doc.slides[current];

  // ── keyboard, first-class path (R14) ──────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) api.redo();
        else api.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setSheet("export");
        return;
      }
      if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSheet((s) => (s === "brand" ? "none" : "brand"));
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        api.duplicateSlide(current);
        return;
      }
      if (typing) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => Math.min(doc.slides.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        api.deleteSlide(current);
      } else if (e.key === "Escape") {
        setSheet("none");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api, current, doc.slides.length]);

  // ── direct manipulation: edit on the slide, source pane follows (R9) ──────
  const onEdit = useCallback(
    (node: LayoutNode, text: string) => {
      if (!slide || !node.blockId) return;
      const next = doc.slides.map((s, i) => {
        if (i !== current) return s;
        return {
          ...s,
          blocks: s.blocks.map((b) => applyEdit(b, node, text)),
        };
      });
      api.setSlides(next, `edit:${node.blockId}:${node.itemIndex ?? ""}`);
    },
    [api, current, doc.slides, slide],
  );

  const onSplit = useCallback(() => {
    if (!slide) return;
    const halves = splitSlide(slide);
    if (halves.length < 2) return;
    api.setSlides([...doc.slides.slice(0, current), ...halves, ...doc.slides.slice(current + 1)]);
  }, [api, current, doc.slides, slide]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setSourceWidth(Math.min(MAX_SOURCE_W, Math.max(MIN_SOURCE_W, e.clientX)));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <TopBar
        projectName={doc.name}
        onProjectNameChange={api.setName}
        slideCount={doc.slides.length}
        onHome={onHome}
        onBrandKit={() => setSheet((s) => (s === "brand" ? "none" : "brand"))}
        onExport={() => setSheet("export")}
      />

      <div className="relative flex min-h-0 flex-1">
        <div style={{ width: sourceWidth }} className="flex min-h-0 shrink-0">
          <SourcePane
            text={doc.source}
            onTextChange={api.setSource}
            granularity={doc.granularity}
            onGranularityChange={api.setGranularity}
            blockCount={doc.slides.length}
          />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize source pane"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="group relative w-px shrink-0 cursor-col-resize bg-hairline"
        >
          <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-white/[0.06]" />
        </div>

        <SlideStage
          slide={slide}
          brand={doc.brandKit}
          format={format}
          slideNumber={current + 1}
          onRoleChange={(role: SlideRole | undefined) => api.setRoleOverride(current, role)}
          onEdit={onEdit}
          onSplit={onSplit}
        />

        {sheet === "brand" ? (
          <BrandKitSheet
            brand={doc.brandKit}
            onChange={api.setBrandKit}
            onClose={() => setSheet("none")}
          />
        ) : null}
        {sheet === "export" ? (
          <ExportSheet doc={doc} format={format} onClose={() => setSheet("none")} />
        ) : null}
      </div>

      <Filmstrip
        slides={doc.slides}
        brand={doc.brandKit}
        format={format}
        currentIndex={current}
        onSelect={setIndex}
        onDuplicate={api.duplicateSlide}
        onDelete={api.deleteSlide}
        onAdd={api.addSlide}
        onMove={api.moveSlide}
      />
    </div>
  );
}

function applyEdit(block: Block, node: LayoutNode, text: string): Block {
  if (block.id !== node.blockId) return block;
  if (block.type === "list" && node.itemIndex !== undefined) {
    return { ...block, items: block.items.map((it, i) => (i === node.itemIndex ? text : it)) };
  }
  if (block.type === "list") return block;
  if (block.type === "quote") return { ...block, text };
  return { ...block, text };
}

/** Split at the block boundary nearest the middle; falls back to sentence halves. */
function splitSlide(slide: Slide): Slide[] {
  if (slide.blocks.length > 1) {
    const at = Math.ceil(slide.blocks.length / 2);
    return [
      { ...slide, blocks: slide.blocks.slice(0, at) },
      { id: newId("sld"), role: slide.role, blocks: slide.blocks.slice(at) },
    ];
  }

  const block = slide.blocks[0];
  if (!block) return [slide];

  if (block.type === "list" && block.items.length > 1) {
    const at = Math.ceil(block.items.length / 2);
    return [
      { ...slide, blocks: [{ ...block, items: block.items.slice(0, at) }] },
      {
        id: newId("sld"),
        role: slide.role,
        blocks: [{ ...block, id: newId("blk"), items: block.items.slice(at) }],
      },
    ];
  }

  const text = block.type === "list" ? block.items.join(" ") : block.text;
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [];
  if (sentences.length < 2) return [slide];
  const at = Math.ceil(sentences.length / 2);

  return [
    {
      ...slide,
      blocks: [{ id: newId("blk"), type: "paragraph", text: sentences.slice(0, at).join("").trim() }],
    },
    {
      id: newId("sld"),
      role: slide.role,
      blocks: [{ id: newId("blk"), type: "paragraph", text: sentences.slice(at).join("").trim() }],
    },
  ];
}
