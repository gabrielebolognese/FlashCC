import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import { newId } from "../doc/ids.js";
import type { Block, BlockStyle, FlashCCDocument, Overlay, Slide, SlideRole } from "../doc/types.js";
import { FORMATS, type LayoutNode } from "../render/layout/node.js";
import { saveTemplate } from "../state/persist.js";
import { useDocument } from "../state/useDocument.js";
import { BrandKitSheet } from "./BrandKitSheet.js";
import { ExportSheet } from "./ExportSheet.js";
import { Filmstrip } from "./Filmstrip.js";
import { FirstRunBar } from "./FirstRunBar.js";
import { Inspector } from "./Inspector.js";
import { SlideList } from "./SlideList.js";
import { SlideStage } from "./SlideStage.js";
import { TopBar } from "./TopBar.js";

const MIN_LIST_W = 240;
const MAX_LIST_W = 520;

type Props = { initial: FlashCCDocument; onHome: () => void };

export function Editor({ initial, onHome }: Props) {
  const api = useDocument(initial);
  const { doc } = api;

  const [index, setIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"none" | "brand" | "export">("none");
  const [listWidth, setListWidth] = useState(300);
  const dragging = useRef(false);

  const format = FORMATS[doc.format] ?? { w: 1080, h: 1350 };
  const current = Math.min(index, Math.max(0, doc.slides.length - 1));
  const slide = doc.slides[current];

  const selectedOverlay = useMemo(
    () => slide?.overlays?.find((o) => o.id === selectedId) ?? null,
    [slide, selectedId],
  );
  const selectedBlock = useMemo(
    () => (selectedOverlay ? null : (slide?.blocks.find((b) => b.id === selectedId) ?? null)),
    [slide, selectedId, selectedOverlay],
  );

  /* ── slide + block mutations ───────────────────────────────────────────── */

  const patchSlide = useCallback(
    (i: number, fn: (s: Slide) => Slide, coalesce?: string) => {
      api.setSlides(
        doc.slides.map((s, n) => (n === i ? fn(s) : s)),
        coalesce,
      );
    },
    [api, doc.slides],
  );

  const setBlockText = useCallback(
    (i: number, blockId: string, text: string) =>
      patchSlide(
        i,
        (s) => ({
          ...s,
          blocks: s.blocks.map((b) => (b.id !== blockId || b.type === "list" ? b : { ...b, text })),
        }),
        `text:${blockId}`,
      ),
    [patchSlide],
  );

  const setItemText = useCallback(
    (i: number, blockId: string, itemIndex: number, text: string) =>
      patchSlide(
        i,
        (s) => ({
          ...s,
          blocks: s.blocks.map((b) =>
            b.id === blockId && b.type === "list"
              ? { ...b, items: b.items.map((it, n) => (n === itemIndex ? text : it)) }
              : b,
          ),
        }),
        `item:${blockId}:${itemIndex}`,
      ),
    [patchSlide],
  );

  const setBlockStyle = useCallback(
    (patch: BlockStyle, coalesce?: string) => {
      if (!selectedBlock) return;
      patchSlide(
        current,
        (s) => ({
          ...s,
          blocks: s.blocks.map((b) =>
            b.id === selectedBlock.id ? { ...b, style: { ...b.style, ...patch } } : b,
          ),
        }),
        coalesce,
      );
    },
    [current, patchSlide, selectedBlock],
  );

  const addSlideAt = useCallback(
    (at: number) => {
      const blank: Slide = {
        id: newId("sld"),
        role: "body",
        blocks: [{ id: newId("blk"), type: "paragraph", text: "New slide" }],
      };
      api.setSlides([...doc.slides.slice(0, at), blank, ...doc.slides.slice(at)]);
      setIndex(at);
    },
    [api, doc.slides],
  );

  const addBlock = useCallback(
    (i: number) => {
      const block: Block = { id: newId("blk"), type: "paragraph", text: "New text" };
      patchSlide(i, (s) => ({ ...s, blocks: [...s.blocks, block] }));
      setSelectedId(block.id);
    },
    [patchSlide],
  );

  /* ── overlays ──────────────────────────────────────────────────────────── */

  const addOverlay = useCallback(
    (overlay: Overlay) =>
      patchSlide(current, (s) => ({ ...s, overlays: [...(s.overlays ?? []), overlay] })),
    [current, patchSlide],
  );

  const updateOverlay = useCallback(
    (id: string, patch: Partial<Overlay>, coalesce?: string) =>
      patchSlide(
        current,
        (s) => ({
          ...s,
          overlays: (s.overlays ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)),
        }),
        coalesce,
      ),
    [current, patchSlide],
  );

  const deleteOverlay = useCallback(() => {
    if (!selectedId) return;
    patchSlide(current, (s) => ({
      ...s,
      overlays: (s.overlays ?? []).filter((o) => o.id !== selectedId),
    }));
    setSelectedId(null);
  }, [current, patchSlide, selectedId]);

  /* ── keyboard ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable === true;
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
        setSelectedId(null);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
        setSelectedId(null);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedOverlay) deleteOverlay();
        else api.deleteSlide(current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api, current, deleteOverlay, doc.slides.length, selectedOverlay]);

  const onEdit = useCallback(
    (node: LayoutNode, text: string) => {
      if (!slide || !node.blockId) return;
      patchSlide(
        current,
        (s) => ({ ...s, blocks: s.blocks.map((b) => applyEdit(b, node, text)) }),
        `edit:${node.blockId}:${node.itemIndex ?? ""}`,
      );
    },
    [current, patchSlide, slide],
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
    if (dragging.current) setListWidth(Math.min(MAX_LIST_W, Math.max(MIN_LIST_W, e.clientX)));
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

      <FirstRunBar />

      <div className="relative flex min-h-0 flex-1">
        <div style={{ width: listWidth }} className="flex min-h-0 shrink-0">
          <SlideList
            slides={doc.slides}
            currentIndex={current}
            selectedId={selectedId}
            onSelect={(i, blockId) => {
              setIndex(i);
              setSelectedId(blockId ?? null);
            }}
            onBlockText={setBlockText}
            onItemText={setItemText}
            onAddSlideAt={addSlideAt}
            onAddBlock={addBlock}
            onDuplicate={api.duplicateSlide}
            onDelete={api.deleteSlide}
            onMove={api.moveSlide}
            onPaste={api.replaceSource}
          />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize slide list"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="group relative w-px shrink-0 cursor-col-resize bg-hairline"
        >
          <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-white/[0.06]" />
        </div>

        <SlideStage
          slide={slide}
          template={doc.template}
          brand={doc.brandKit}
          format={format}
          slideNumber={current + 1}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRoleChange={(role: SlideRole | undefined) => api.setRoleOverride(current, role)}
          onEdit={onEdit}
          onAddOverlay={addOverlay}
          onUpdateOverlay={updateOverlay}
          onSplit={onSplit}
        />

        <Inspector
          brand={doc.brandKit}
          overlay={selectedOverlay}
          block={selectedBlock}
          onOverlay={(patch, coalesce) => {
            if (selectedId) updateOverlay(selectedId, patch, coalesce);
          }}
          onBlockStyle={setBlockStyle}
          onDeleteOverlay={deleteOverlay}
        />

        {sheet === "brand" ? (
          <BrandKitSheet
            brand={doc.brandKit}
            template={doc.template}
            onChange={api.setBrandKit}
            onTemplateChange={api.setTemplate}
            onSaveAsTemplate={() => {
              const copy = {
                ...doc.template,
                id: newId("tpl"),
                name: `${doc.template.name} copy`,
                origin: { kind: "user" as const, from: doc.template.id },
              };
              saveTemplate(copy);
              api.setTemplate(copy);
            }}
            onClose={() => setSheet("none")}
          />
        ) : null}
        {sheet === "export" ? (
          <ExportSheet doc={doc} format={format} onClose={() => setSheet("none")} />
        ) : null}
      </div>

      <Filmstrip
        slides={doc.slides}
        template={doc.template}
        brand={doc.brandKit}
        format={format}
        currentIndex={current}
        onSelect={(i) => {
          setIndex(i);
          setSelectedId(null);
        }}
        onDuplicate={api.duplicateSlide}
        onDelete={api.deleteSlide}
        onAdd={() => addSlideAt(doc.slides.length)}
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
