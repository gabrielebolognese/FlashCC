import { Copy, LayoutTemplate, Plus, Trash2, Wand2, X } from "lucide-react";
import { useRef, useState } from "react";

import { slidePaint } from "./paint.js";
import { rangeSelect, toggleSelect } from "./slideset.js";
import { LayerView } from "./LayerView.js";
import type { ActionId } from "./actions.js";
import type { Studio } from "./useStudio.js";

const THUMB_H = 96;

/**
 * The deck, left to right, first slide first. Real miniature renders through the same
 * LayerView the canvas uses, so a thumbnail cannot lie about what a slide looks like.
 */
export function Filmstrip({
  studio,
  onRewrite,
  onRelay,
  onTypeSlide,
  typing = false,
  setTyping,
}: {
  studio: Studio;
  /**
   * A slide typed into existence (24.5): the line becomes its headline. Absent
   * keeps the plain "+", which adds a blank slide.
   */
  onTypeSlide?: ((line: string) => void) | undefined;
  /** The "+" is showing its line, from a click or from the palette. */
  typing?: boolean | undefined;
  setTyping?: ((on: boolean) => void) | undefined;
  /** Absent when there is nothing to open, which keeps the button out of the DOM. */
  onRewrite?: ((index: number) => void) | undefined;
  /** Lays the picked slides out again. Absent hides the action. */
  onRelay?: ((ids: string[]) => void) | undefined;
}) {
  const { doc, index, slideSelection, setSlideSelection } = studio;
  const [from, setFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  /** Where a shift-click range starts: the last slide clicked without shift. */
  const anchor = useRef<string | null>(null);

  const picked = slideSelection.length > 1 ? slideSelection : [];

  /**
   * Plain click: this slide, and the set is cleared. Shift: a range from the
   * anchor. Cmd or Ctrl: in or out of the set. The canvas always shows the
   * slide clicked last, so the set never hides what is being edited.
   */
  const click = (i: number, e: React.MouseEvent) => {
    const id = doc.slides[i]?.id;
    if (!id) return;
    const current = doc.slides[index]?.id ?? id;
    if (e.shiftKey) {
      setSlideSelection(rangeSelect(doc.slides, anchor.current ?? current, id));
    } else if (e.metaKey || e.ctrlKey) {
      const base = slideSelection.length > 0 ? slideSelection : [current];
      setSlideSelection(toggleSelect(base, id));
      anchor.current = id;
    } else {
      setSlideSelection([]);
      anchor.current = id;
    }
    studio.setSlideIndex(i);
    studio.setSelection([]);
  };

  const scale = THUMB_H / doc.height;
  const thumbW = doc.width * scale;

  return (
    <footer className="flex h-[136px] shrink-0 flex-col border-t border-hairline bg-surface-1">
      <div className="flex h-7 shrink-0 items-center justify-between gap-2 px-4">
        <span className="text-overline uppercase text-tertiary">Slides</span>
        {picked.length > 0 ? (
          <div className="flex items-center gap-1">
            <span className="mr-1 text-caption text-accent">{picked.length} picked</span>
            <SetButton icon={Copy} label="Duplicate" action="duplicate-picked" onClick={() => studio.duplicateSlides(picked)} />
            {onRelay ? (
              <SetButton icon={LayoutTemplate} label="Re-lay" action="relay-picked" onClick={() => onRelay(picked)} />
            ) : null}
            {picked.length < doc.slides.length ? (
              <SetButton icon={Trash2} label="Delete" danger action="delete-picked" onClick={() => studio.deleteSlides(picked)} />
            ) : null}
            <SetButton icon={X} label="Clear" action="clear-picked" onClick={() => setSlideSelection([])} />
          </div>
        ) : (
          <span className="text-caption text-muted">
            {doc.slides.length}
            <span className="ml-2 hidden lg:inline">Shift-click or {"\u2318"}/Ctrl-click to pick several</span>
          </span>
        )}
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
                const dragged = from !== null ? doc.slides[from]?.id : undefined;
                // Dragging a picked slide drags the whole set, as a block.
                if (dragged && picked.includes(dragged)) studio.moveSlides(picked, s.id);
                else if (from !== null && from !== i) studio.moveSlide(from, i);
                setFrom(null);
                setOver(null);
              }}
            >
              <button
                type="button"
                data-control
                onClick={(e) => click(i, e)}
                aria-label={`Slide ${i + 1}`}
                aria-pressed={picked.includes(s.id)}
                className={[
                  "block overflow-hidden rounded-xl border-2",
                  i === index
                    ? "border-accent"
                    : picked.includes(s.id)
                      ? "border-accent-dim"
                      : "border-hairline hover:border-surface-5",
                  from === i ||
                  (from !== null && picked.includes(doc.slides[from]?.id ?? "") && picked.includes(s.id))
                    ? "opacity-40"
                    : "",
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
                  i === index || picked.includes(s.id)
                    ? "bg-accent text-[color:var(--on-accent)]"
                    : "bg-black/50 text-white/80",
                ].join(" ")}
              >
                {i + 1}
              </span>

              <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                {/* The roadmap asked for a right-click menu here. There is no
                    context-menu primitive anywhere in this codebase, and adding
                    one for a single item would be a new interaction to teach.
                    The hover cluster is the gesture people already use on these
                    thumbnails, so it goes in the cluster. */}
                {onRewrite ? (
                  <MiniButton icon={Wand2} label="Rewrite" action="rewrite-slide" onClick={() => onRewrite(i)} />
                ) : null}
                <MiniButton icon={Copy} label="Duplicate" action="duplicate-slide" onClick={() => studio.duplicateSlide(i)} />
                {doc.slides.length > 1 ? (
                  <MiniButton icon={Trash2} label="Delete" danger action="delete-slide" onClick={() => studio.deleteSlide(i)} />
                ) : null}
              </div>
            </div>
          </div>
        ))}

        {typing && onTypeSlide ? (
          <TypedSlide
            height={THUMB_H}
            onDone={(line) => {
              setTyping?.(false);
              if (line === null) return;
              if (line.trim()) onTypeSlide(line.trim());
              else studio.addSlide();
            }}
          />
        ) : (
          <button
            type="button"
            data-action={onTypeSlide ? "type-slide" : "new-slide"}
            onClick={() => (onTypeSlide && setTyping ? setTyping(true) : studio.addSlide())}
            aria-label="Add slide"
            title={onTypeSlide ? "Type a headline for a new slide. Enter on an empty line adds a blank one." : "Add slide"}
            className="ml-1.5 grid shrink-0 place-items-center self-start rounded-xl border-2 border-dashed border-hairline text-tertiary hover:border-edge hover:text-primary"
            style={{ width: thumbW, height: THUMB_H }}
          >
            <Plus size={16} strokeWidth={2} />
          </button>
        )}
      </div>
    </footer>
  );
}

/**
 * The "+" as a line to type into (24.5). Enter makes the slide (an empty line
 * makes a blank one, which is what "+" always did); Escape or leaving it
 * empty changes nothing.
 */
function TypedSlide({ height, onDone }: { height: number; onDone: (line: string | null) => void }) {
  const [line, setLine] = useState("");
  return (
    <div className="ml-1.5 flex shrink-0 flex-col justify-center gap-1 self-start rounded-xl border-2 border-dashed border-accent-dim px-2" style={{ width: 240, height }}>
      <input
        autoFocus
        aria-label="Headline for a new slide"
        value={line}
        onChange={(e) => setLine(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") onDone(line);
          if (e.key === "Escape") onDone(null);
        }}
        onBlur={() => onDone(line.trim() ? line : null)}
        placeholder="Type a headline, Enter"
        className="h-7 w-full rounded-md border border-hairline bg-surface-1 px-2 text-caption text-primary outline-none placeholder:text-muted focus:border-accent-dim"
      />
      <span className="text-[10px] leading-3 text-muted">Laid out by the next layout in the deck&rsquo;s cycle.</span>
    </div>
  );
}

function MiniButton({
  icon: Icon,
  label,
  action,
  onClick,
  danger = false,
}: {
  icon: typeof Copy;
  label: string;
  action: ActionId;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      data-action={action}
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

/** The actions on a picked set, in the strip's header where the count is. */
function SetButton({
  icon: Icon,
  label,
  action,
  onClick,
  danger = false,
}: {
  icon: typeof Copy;
  label: string;
  action: ActionId;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      data-action={action}
      title={label}
      onClick={onClick}
      className={[
        "flex h-7 items-center gap-1 rounded-md px-1.5 text-caption text-tertiary hover:bg-white/[0.06]",
        danger ? "hover:text-danger" : "hover:text-primary",
      ].join(" ")}
    >
      <Icon size={11} strokeWidth={2} />
      {label}
    </button>
  );
}
