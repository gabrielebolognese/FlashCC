import { Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Template } from "../doc/template.js";
import type { BrandKit, Slide } from "../doc/types.js";
import type { Format } from "../render/layout/node.js";
import { elementsToNodes } from "../render/materialize.js";
import { SlideRenderer } from "../render/SlideRenderer.js";
import { IconButton } from "../ui/IconButton.js";

const THUMB_H = 68;

type Props = {
  slides: Slide[];
  template: Template;
  brand: BrandKit;
  format: Format;
  currentIndex: number;
  onSelect: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
  onMove: (from: number, to: number) => void;
};

export function Filmstrip({
  slides,
  template,
  brand,
  format,
  currentIndex,
  onSelect,
  onDuplicate,
  onDelete,
  onAdd,
  onMove,
}: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const scale = THUMB_H / format.h;
  const thumbW = format.w * scale;

  return (
    <footer className="scroll-quiet flex h-24 shrink-0 items-center gap-1 overflow-x-auto border-t border-hairline bg-surface-1 px-3">
      {slides.map((slide, i) => (
        <div key={slide.id} className="flex h-[76px] items-center">
          {/* Insertion indicator during a reorder drag. */}
          <div
            className={["h-[68px] w-0.5 rounded-full", dragOver === i ? "bg-accent" : "bg-transparent"].join(" ")}
          />
          <div
            className="group relative shrink-0"
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(i);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null) onMove(dragFrom, i);
              setDragFrom(null);
              setDragOver(null);
            }}
            style={{ width: thumbW, height: THUMB_H }}
          >
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-label={`Slide ${i + 1}`}
              className={[
                "block overflow-hidden rounded-sm border",
                i === currentIndex ? "border-accent" : "border-hairline",
                dragFrom === i ? "opacity-40" : "",
              ].join(" ")}
              style={{ width: thumbW, height: THUMB_H }}
            >
              <div
                className="pointer-events-none origin-top-left"
                style={{ width: format.w, height: format.h, transform: `scale(${scale})` }}
              >
                <SlideRenderer
                  nodes={elementsToNodes(slide.elements ?? [], format, slide.background ?? brand.palette.background)}
                  format={format}
                />
              </div>
            </button>

            <span className="pointer-events-none absolute -bottom-3 left-0 font-mono text-[9.5px] text-muted">
              {i + 1}
            </span>

            <div className="absolute right-0 top-0 hidden group-hover:flex">
              <IconButton icon={Copy} label="Duplicate slide" onClick={() => onDuplicate(i)} />
              <IconButton icon={Trash2} label="Delete slide" danger onClick={() => onDelete(i)} />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        aria-label="Add slide"
        onClick={onAdd}
        className="ml-1 grid shrink-0 place-items-center rounded-sm border border-dashed border-hairline text-tertiary hover:border-edge hover:text-primary"
        style={{ width: thumbW, height: THUMB_H }}
      >
        <Plus size={14} strokeWidth={2} />
      </button>
    </footer>
  );
}
