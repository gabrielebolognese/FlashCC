import { AlignLeft, Circle, GalleryHorizontal, LayoutGrid, Minus, MousePointer2, ScanLine, Search, Sparkle, Square, Triangle, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ActionId } from "./actions.js";
import type { Tool } from "./model.js";
import { hasSafeZone, PLATFORMS, type PlatformId } from "./platforms.js";
import { IconPicker } from "./IconPicker.js";
import type { Studio } from "./useStudio.js";

/**
 * The drawing tools. T, R, O and L belong to the keyboard map (24.3: Tidy,
 * Rewrite, Outline, Layout), so the tools that had them moved to Shift.
 */
const TOOLS: { id: Tool; icon: typeof Type; label: string; key: string; action: ActionId }[] = [
  { id: "select", icon: MousePointer2, label: "Move", key: "V", action: "tool-select" },
  { id: "text", icon: Type, label: "Text", key: "Shift+T", action: "tool-text" },
  { id: "rect", icon: Square, label: "Rectangle", key: "Shift+R", action: "tool-rect" },
  { id: "ellipse", icon: Circle, label: "Ellipse", key: "Shift+O", action: "tool-ellipse" },
  { id: "triangle", icon: Triangle, label: "Triangle", key: "", action: "tool-triangle" },
  { id: "line", icon: Minus, label: "Line", key: "", action: "tool-line" },
];

/**
 * A horizontal strip under the header rather than a rail down the side: it sits on
 * the shortest path from the canvas, and the eye already goes to the top of a
 * document. Single-letter shortcuts still do the same job.
 */
export function Toolbar({ studio, onFind }: { studio: Studio; onFind?: (() => void) | undefined }) {
  const [iconOpen, setIconOpen] = useState(false);
  const [safeOpen, setSafeOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const safeWrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!iconOpen) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setIconOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIconOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [iconOpen]);

  useEffect(() => {
    if (!safeOpen) return;
    const close = (e: MouseEvent) => {
      if (!safeWrap.current?.contains(e.target as Node)) setSafeOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [safeOpen]);

  return (
    <div className="relative flex h-11 shrink-0 items-center justify-center gap-1 border-b border-hairline bg-surface-1">
      {TOOLS.map(({ id, icon: Icon, label, key, action }, i) => (
        <div key={id} className="flex items-center">
          {/* select is a mode; the rest draw. */}
          {i === 1 ? <span className="mx-1.5 h-5 w-px bg-hairline" /> : null}
          <button
            type="button"
            data-action={action}
            title={key ? `${label} (${key})` : label}
            aria-label={label}
            aria-pressed={studio.tool === id}
            onClick={() => {
              studio.setTool(id);
              setIconOpen(false);
            }}
            className={[
              "grid h-8 w-8 place-items-center rounded-lg",
              studio.tool === id
                ? "bg-accent-wash text-accent"
                : "text-tertiary hover:bg-white/[0.06] hover:text-primary",
            ].join(" ")}
          >
            <Icon size={15} strokeWidth={2} />
          </button>
        </div>
      ))}

      <div ref={wrap} className="relative flex items-center">
        <button
          type="button"
          data-action="tool-icon"
          title="Icon (I)"
          aria-label="Icon"
          aria-expanded={iconOpen}
          onClick={() => setIconOpen((v) => !v)}
          className={[
            "grid h-8 w-8 place-items-center rounded-lg",
            iconOpen || studio.tool === "icon"
              ? "bg-accent-wash text-accent"
              : "text-tertiary hover:bg-white/[0.06] hover:text-primary",
          ].join(" ")}
        >
          <Sparkle size={15} strokeWidth={2} />
        </button>

        {iconOpen ? <IconPicker studio={studio} onClose={() => setIconOpen(false)} /> : null}
      </div>

      <span className="mx-1.5 h-5 w-px bg-hairline" />

      {/* Blocks (Batch 19). Also on "/" over the canvas. */}
      <button
        type="button"
        data-action="insert-block"
        title="Insert a block ( / )"
        aria-label="Insert a block"
        onClick={() => studio.setPicker({ mode: "insert" })}
        className="grid h-8 w-8 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-primary"
      >
        <LayoutGrid size={15} strokeWidth={2} />
      </button>

      {/* Every slide side by side (23.1). A view, like the safe areas. */}
      <button
        type="button"
        data-action="strip-view"
        title="Strip view: every slide side by side"
        aria-label="Strip view"
        aria-pressed={studio.stripView}
        onClick={() => {
          studio.setOutline(false);
          studio.setStripView(!studio.stripView);
        }}
        className={[
          "grid h-8 w-8 place-items-center rounded-lg",
          studio.stripView ? "bg-accent-wash text-accent" : "text-tertiary hover:bg-white/[0.06] hover:text-primary",
        ].join(" ")}
      >
        <GalleryHorizontal size={15} strokeWidth={2} />
      </button>

      {/* The deck as one text document (24.1). Also on O. */}
      <button
        type="button"
        data-action="outline"
        title="Outline: the whole deck as text (O)"
        aria-label="Outline"
        aria-pressed={studio.outline}
        onClick={() => {
          studio.setStripView(false);
          studio.setOutline(!studio.outline);
        }}
        className={[
          "grid h-8 w-8 place-items-center rounded-lg",
          studio.outline ? "bg-accent-wash text-accent" : "text-tertiary hover:bg-white/[0.06] hover:text-primary",
        ].join(" ")}
      >
        <AlignLeft size={15} strokeWidth={2} />
      </button>

      {/* Show what the platform covers. A view setting, never part of the doc. */}
      <div ref={safeWrap} className="relative flex items-center">
        <button
          type="button"
          data-action="safe-areas"
          title="Safe areas"
          aria-label="Safe areas"
          aria-expanded={safeOpen}
          onClick={() => setSafeOpen((v) => !v)}
          className={[
            "grid h-8 w-8 place-items-center rounded-lg",
            studio.safePlatform !== null
              ? "bg-accent-wash text-accent"
              : "text-tertiary hover:bg-white/[0.06] hover:text-primary",
          ].join(" ")}
        >
          <ScanLine size={15} strokeWidth={2} />
        </button>

        {safeOpen ? (
          <div
            className="absolute left-1/2 top-10 z-overlay w-[212px] -translate-x-1/2 rounded-2xl border border-hairline p-1.5 shadow-overlay"
            style={{ background: "rgba(26,42,66,.92)", backdropFilter: "blur(24px) saturate(1.8)" }}
          >
            <button
              type="button"
              data-action="safe:off"
              onClick={() => {
                studio.setSafePlatform(null);
                setSafeOpen(false);
              }}
              className={[
                "flex h-8 w-full items-center rounded-lg px-2 text-caption",
                studio.safePlatform === null
                  ? "bg-accent-wash text-accent"
                  : "text-secondary hover:bg-white/[0.06]",
              ].join(" ")}
            >
              Off
            </button>

            {/* Only the ones with something to draw. Threads or X would be an
                overlay toggle that shades nothing. */}
            {PLATFORMS.filter(hasSafeZone).map((pf) => (
              <button
                key={pf.id}
                type="button"
                data-action={`safe:${pf.id}`}
                title={pf.note}
                onClick={() => {
                  studio.setSafePlatform(pf.id as PlatformId);
                  setSafeOpen(false);
                }}
                className={[
                  "flex h-8 w-full items-center rounded-lg px-2 text-caption",
                  studio.safePlatform === pf.id
                    ? "bg-accent-wash text-accent"
                    : "text-secondary hover:bg-white/[0.06]",
                ].join(" ")}
              >
                {pf.label}
              </button>
            ))}

            <p className="px-2 pb-1 pt-1.5 text-caption leading-4 text-muted">
              The shaded band is covered by the platform&rsquo;s own interface. It never exports.
            </p>
          </div>
        ) : null}
      </div>

      {onFind ? (
        <button
          type="button"
          data-action="find-replace"
          title="Find and replace in this deck"
          aria-label="Find and replace"
          onClick={onFind}
          className="grid h-8 w-8 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-primary"
        >
          <Search size={15} strokeWidth={2} />
        </button>
      ) : null}

      <span className="ml-3 hidden text-caption text-muted lg:block">
        {studio.tool === "select"
          ? "Click to select · drag to move · scroll to zoom"
          : "Drag on the canvas to draw · scroll to zoom"}
      </span>
    </div>
  );
}
