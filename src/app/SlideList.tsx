import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { blockText } from "../doc/parse.js";
import { effectiveRole, type Block, type Slide } from "../doc/types.js";
import { IconButton } from "../ui/IconButton.js";

type Props = {
  slides: Slide[];
  currentIndex: number;
  selectedId: string | null;
  onSelect: (index: number, blockId?: string) => void;
  onBlockText: (slideIndex: number, blockId: string, text: string) => void;
  onItemText: (slideIndex: number, blockId: string, itemIndex: number, text: string) => void;
  onAddSlideAt: (index: number) => void;
  onAddBlock: (slideIndex: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onPaste: (text: string) => void;
};

/**
 * Slides are an explicit list, not blank-line-separated prose. Each card is one slide
 * with its own text; the + between cards inserts a slide exactly there, so the
 * structure is visible instead of being a convention you have to know.
 */
export function SlideList({
  slides,
  currentIndex,
  selectedId,
  onSelect,
  onBlockText,
  onItemText,
  onAddSlideAt,
  onAddBlock,
  onDuplicate,
  onDelete,
  onMove,
  onPaste,
}: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  if (slides.length === 0) {
    return (
      <section className="flex min-w-0 flex-col bg-base">
        <Header count={0} />
        <div className="flex min-h-0 flex-1 flex-col items-start gap-3 p-4">
          <p className="text-body text-tertiary">
            Paste a post you already wrote. Each blank line becomes a slide.
          </p>
          <textarea
            autoFocus
            placeholder="Paste here…"
            onChange={(e) => {
              if (e.target.value.trim().length > 0) onPaste(e.target.value);
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text.trim().length > 0) {
                e.preventDefault();
                onPaste(text);
              }
            }}
            className="h-40 w-full resize-none rounded-md border border-edge bg-surface-1 p-3 font-mono text-[12px] leading-[20px] text-primary outline-none placeholder:text-muted focus:border-accent-dim"
          />
          <button
            type="button"
            onClick={() => onAddSlideAt(0)}
            className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
          >
            <Plus size={14} strokeWidth={2} />
            Start with one empty slide
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col bg-base">
      <Header count={slides.length} />

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {slides.map((slide, i) => (
          <div key={slide.id}>
            <InsertRow onClick={() => onAddSlideAt(i)} active={dragOver === i} />

            <div
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
              onClick={() => onSelect(i)}
              className={[
                "group rounded-lg border p-2",
                i === currentIndex ? "border-accent bg-surface-1" : "border-hairline bg-surface-1 hover:border-surface-5",
                dragFrom === i ? "opacity-40" : "",
              ].join(" ")}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <GripVertical size={12} className="cursor-grab text-muted" />
                <span className="font-mono text-[9.5px] text-muted">{i + 1}</span>
                <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-[9.5px] text-tertiary">
                  {effectiveRole(slide)}
                </span>
                <div className="flex-1" />
                <div className="hidden group-hover:flex">
                  <IconButton icon={Copy} label="Duplicate slide" onClick={() => onDuplicate(i)} />
                  <IconButton icon={Trash2} label="Delete slide" danger onClick={() => onDelete(i)} />
                </div>
              </div>

              {slide.blocks.map((block) => (
                <BlockRow
                  key={block.id}
                  block={block}
                  selected={selectedId === block.id}
                  onFocus={() => onSelect(i, block.id)}
                  onText={(text) => onBlockText(i, block.id, text)}
                  onItem={(idx, text) => onItemText(i, block.id, idx, text)}
                />
              ))}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddBlock(i);
                }}
                className="mt-1 flex h-6 items-center gap-1 rounded-sm px-1 text-caption text-muted opacity-0 hover:bg-white/[0.04] hover:text-primary group-hover:opacity-100"
              >
                <Plus size={11} strokeWidth={2} />
                text
              </button>
            </div>
          </div>
        ))}

        <InsertRow onClick={() => onAddSlideAt(slides.length)} last />
      </div>
    </section>
  );
}

function Header({ count }: { count: number }) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-hairline px-3">
      <span className="text-overline uppercase text-tertiary">Slides</span>
      <span className="text-caption text-muted">{count}</span>
    </div>
  );
}

/** The + between cards: inserts a slide exactly here. */
function InsertRow({ onClick, active = false, last = false }: { onClick: () => void; active?: boolean; last?: boolean }) {
  return (
    <div className={["group/ins flex items-center", last ? "pt-1.5" : "py-1.5"].join(" ")}>
      <div className={["h-px flex-1", active ? "bg-accent" : "bg-hairline"].join(" ")} />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        aria-label="Add slide here"
        className="mx-1 grid h-5 w-5 place-items-center rounded-full border border-hairline bg-surface-1 text-muted opacity-0 hover:border-accent hover:text-accent group-hover/ins:opacity-100"
      >
        <Plus size={11} strokeWidth={2} />
      </button>
      <div className={["h-px flex-1", active ? "bg-accent" : "bg-hairline"].join(" ")} />
    </div>
  );
}

function BlockRow({
  block,
  selected,
  onFocus,
  onText,
  onItem,
}: {
  block: Block;
  selected: boolean;
  onFocus: () => void;
  onText: (text: string) => void;
  onItem: (index: number, text: string) => void;
}) {
  const ring = selected ? "border-accent-dim" : "border-transparent hover:border-hairline";

  if (block.type === "list") {
    return (
      <div className="mb-1">
        {block.items.map((item, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
            <textarea
              rows={1}
              value={item}
              onFocus={onFocus}
              onChange={(e) => onItem(i, e.target.value)}
              className={`w-full resize-none rounded-sm border bg-transparent px-1 py-0.5 text-body text-primary outline-none ${ring}`}
            />
          </div>
        ))}
      </div>
    );
  }

  const value = blockText(block);
  return (
    <textarea
      rows={Math.max(1, Math.ceil(value.length / 38))}
      value={value}
      onFocus={onFocus}
      onChange={(e) => onText(e.target.value)}
      className={`mb-1 w-full resize-none rounded-sm border bg-transparent px-1 py-0.5 text-body text-primary outline-none ${ring} ${
        block.type === "heading" ? "font-semibold" : ""
      } ${block.type === "quote" ? "italic" : ""}`}
    />
  );
}
