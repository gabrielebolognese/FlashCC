import { Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { slidePaint } from "./paint.js";
import { LayerView } from "./LayerView.js";
import type { Studio } from "./useStudio.js";

const THUMB_H = 96;

/**
 * The deck, left to right, first slide first. Real miniature renders through the same
 * LayerView the canvas uses, so a thumbnail cannot lie about what a slide looks like.
 */
export function Filmstrip({ studio }: { studio: Studio }) {
  const { doc, index } = studio;
  const [from, setFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const scale = THUMB_H / doc.height;
  const thumbW = doc.width * scale;

  return (
    <footer className="flex h-[136px] shrink-0 flex-col border-t border-hairline bg-surface-1">
      <div className="flex h-7 shrink-0 items-center justify-between px-4">
        <span className="text-overline uppercase text-tertiary">Slides</span>
        <span className="text-caption text-muted">{doc.slides.length}</span>
      </div>

      <div className="scroll-quiet flex flex-1 items-start gap-1 overflow-x-auto px-3 pb-3">
        {doc.slides.map((s, i) => (
          <div key={s.id} className="flex h-full items-start">
            {/* The landing line. Wide and lit, so it reads at thumbnail scale. */}
            <div
              className={[
                "h-[88px] shrink-0 self-center rounded-full transition-[width,background-color] duration-instant ease-out",
                over === i && from !== null && from !== i
                  ? "mx-1 w-[3px] bg-accent shadow-[0_0_10px_rgba(217,165,33,.7)]"
                  : "mx-0.5 w-0.5 bg-transparent",
              ].join(" ")}
            />

            <div
              className="group relative shrink-0"
              draggable
              onDragStart={() => setFrom(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(i);
              }}
              onDragEnd={() => {
                setFrom(null);
                setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (from !== null && from !== i) studio.moveSlide(from, i);
                setFrom(null);
                setOver(null);
              }}
            >
              <button
                type="button"
                onClick={() => {
                  studio.setSlideIndex(i);
                  studio.setSelection([]);
                }}
                aria-label={`Slide ${i + 1}`}
                className={[
                  "block overflow-hidden rounded-xl border-2",
                  i === index ? "border-accent" : "border-hairline hover:border-surface-5",
                  from === i ? "opacity-40" : "",
                ].join(" ")}
                style={{ width: thumbW, height: THUMB_H, ...slidePaint(s) }}
              >
                <div
                  className="pointer-events-none relative origin-top-left"
                  style={{ width: doc.width, height: doc.height, transform: `scale(${scale})` }}
                >
                  {s.layers.map((l) => (
                    <LayerView key={l.id} layer={l} />
                  ))}
                </div>
              </button>

              <span
                className={[
                  "pointer-events-none absolute left-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-md px-1 text-[9px] font-semibold",
                  i === index ? "bg-accent text-[color:var(--on-accent)]" : "bg-black/50 text-white/80",
                ].join(" ")}
              >
                {i + 1}
              </span>

              <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                <MiniButton icon={Copy} label="Duplicate" onClick={() => studio.duplicateSlide(i)} />
                {doc.slides.length > 1 ? (
                  <MiniButton icon={Trash2} label="Delete" danger onClick={() => studio.deleteSlide(i)} />
                ) : null}
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => studio.addSlide()}
          aria-label="Add slide"
          className="ml-1.5 grid shrink-0 place-items-center self-start rounded-xl border-2 border-dashed border-hairline text-tertiary hover:border-edge hover:text-primary"
          style={{ width: thumbW, height: THUMB_H }}
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>
    </footer>
  );
}

function MiniButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        "grid h-5 w-5 place-items-center rounded-md bg-black/60 text-white/80 backdrop-blur",
        danger ? "hover:text-danger" : "hover:text-white",
      ].join(" ")}
    >
      <Icon size={10} strokeWidth={2} />
    </button>
  );
}
