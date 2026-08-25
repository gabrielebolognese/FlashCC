import { Copy, Eye, EyeOff, Image, Lock, Minus, Plus, Square, Trash2, Type, Unlock } from "lucide-react";
import { useState } from "react";

import { IconButton } from "../ui/IconButton.js";
import type { Layer } from "./model.js";
import type { Studio } from "./useStudio.js";

const KIND_ICON = { text: Type, image: Image, line: Minus } as const;

/** Slides on top, layers for the current slide below. Top of the list is front. */
export function LayersPanel({ studio }: { studio: Studio }) {
  const { doc, slide, index, selection, setSelection } = studio;
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const layers = slide?.layers ?? [];
  const reversed = [...layers].reverse();

  return (
    <div className="flex w-[224px] shrink-0 flex-col border-r border-hairline bg-surface-1">
      {/* slides */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-hairline px-2.5">
        <span className="text-overline uppercase text-tertiary">Slides</span>
        <IconButton icon={Plus} label="Add slide" onClick={() => studio.addSlide()} />
      </div>

      <div className="scroll-quiet max-h-[176px] shrink-0 overflow-y-auto border-b border-hairline p-1.5">
        {doc.slides.map((s, i) => (
          <div
            key={s.id}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom !== null) studio.moveSlide(dragFrom, i);
              setDragFrom(null);
            }}
            onClick={() => {
              studio.setSlideIndex(i);
              setSelection([]);
            }}
            className={[
              "group mb-1 flex cursor-pointer items-center gap-2 rounded-md border p-1",
              i === index ? "border-accent bg-surface-3" : "border-transparent hover:bg-white/[0.04]",
            ].join(" ")}
          >
            <div
              className="h-8 w-[26px] shrink-0 rounded-sm border border-hairline"
              style={{ background: s.background }}
            />
            <span className="flex-1 truncate text-caption text-secondary">{i + 1}</span>
            <div className="hidden group-hover:flex">
              <IconButton icon={Copy} label="Duplicate slide" onClick={() => studio.duplicateSlide(i)} />
              {doc.slides.length > 1 ? (
                <IconButton icon={Trash2} label="Delete slide" danger onClick={() => studio.deleteSlide(i)} />
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* layers */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-hairline px-2.5">
        <span className="text-overline uppercase text-tertiary">Layers</span>
        <span className="text-caption text-muted">{layers.length}</span>
      </div>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-1.5">
        {reversed.length === 0 ? (
          <p className="p-2 text-caption leading-[16px] text-muted">
            Empty. Pick a tool on the left and drag on the canvas.
          </p>
        ) : null}

        {reversed.map((l, ri) => {
          const realIndex = layers.length - 1 - ri;
          return (
            <LayerRow
              key={l.id}
              layer={l}
              selected={selection.includes(l.id)}
              onSelect={(additive) =>
                setSelection(
                  additive
                    ? selection.includes(l.id)
                      ? selection.filter((id) => id !== l.id)
                      : [...selection, l.id]
                    : [l.id],
                )
              }
              onRename={(name) => studio.updateLayers([l.id], { name })}
              onToggleVisible={() => studio.updateLayers([l.id], { visible: !l.visible })}
              onToggleLock={() => studio.updateLayers([l.id], { locked: !l.locked })}
              onDragStart={() => setDragFrom(realIndex)}
              onDrop={() => {
                if (dragFrom !== null) studio.moveLayerTo(dragFrom, realIndex);
                setDragFrom(null);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function LayerRow({
  layer,
  selected,
  onSelect,
  onRename,
  onToggleVisible,
  onToggleLock,
  onDragStart,
  onDrop,
}: {
  layer: Layer;
  selected: boolean;
  onSelect: (additive: boolean) => void;
  onRename: (name: string) => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const Icon = KIND_ICON[layer.kind as keyof typeof KIND_ICON] ?? Square;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={(e) => onSelect(e.shiftKey)}
      onDoubleClick={() => setEditing(true)}
      className={[
        "group flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5",
        selected ? "bg-accent-wash text-accent" : "text-secondary hover:bg-white/[0.04]",
        layer.visible ? "" : "opacity-50",
      ].join(" ")}
    >
      <Icon size={12} strokeWidth={2} className="shrink-0" />
      {editing ? (
        <input
          autoFocus
          defaultValue={layer.name}
          onBlur={(e) => {
            onRename(e.target.value || layer.name);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            e.stopPropagation();
          }}
          className="min-w-0 flex-1 rounded-sm border border-edge bg-surface-1 px-1 text-caption text-primary outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-caption">
          {layer.kind === "text" ? layer.text?.slice(0, 24) || layer.name : layer.name}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleLock();
        }}
        className="hidden text-muted hover:text-primary group-hover:block"
      >
        {layer.locked ? <Lock size={11} /> : <Unlock size={11} />}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisible();
        }}
        className="text-muted hover:text-primary"
      >
        {layer.visible ? <Eye size={11} /> : <EyeOff size={11} />}
      </button>
    </div>
  );
}
