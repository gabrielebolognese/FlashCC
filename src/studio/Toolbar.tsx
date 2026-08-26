import { Circle, Minus, MousePointer2, Sparkle, Square, Triangle, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ICON_PATHS } from "../render/icons.js";
import { makeLayer, type Tool } from "./model.js";
import type { Studio } from "./useStudio.js";

const TOOLS: { id: Tool; icon: typeof Type; label: string; key: string }[] = [
  { id: "select", icon: MousePointer2, label: "Move", key: "V" },
  { id: "text", icon: Type, label: "Text", key: "T" },
  { id: "rect", icon: Square, label: "Rectangle", key: "R" },
  { id: "ellipse", icon: Circle, label: "Ellipse", key: "O" },
  { id: "triangle", icon: Triangle, label: "Triangle", key: "" },
  { id: "line", icon: Minus, label: "Line", key: "L" },
];

/**
 * A horizontal strip under the header rather than a rail down the side: it sits on
 * the shortest path from the canvas, and the eye already goes to the top of a
 * document. Single-letter shortcuts still do the same job.
 */
export function Toolbar({ studio }: { studio: Studio }) {
  const [iconOpen, setIconOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const glyphs = Object.keys(ICON_PATHS);

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

  return (
    <div className="relative flex h-11 shrink-0 items-center justify-center gap-1 border-b border-hairline bg-surface-1">
      {TOOLS.map(({ id, icon: Icon, label, key }, i) => (
        <div key={id} className="flex items-center">
          {/* select is a mode; the rest draw. */}
          {i === 1 ? <span className="mx-1.5 h-5 w-px bg-hairline" /> : null}
          <button
            type="button"
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

        {iconOpen ? (
          <div
            className="absolute left-1/2 top-10 z-overlay grid w-[268px] -translate-x-1/2 grid-cols-9 gap-0.5 rounded-2xl border border-hairline p-1.5 shadow-overlay"
            style={{ background: "rgba(26,42,66,.92)", backdropFilter: "blur(24px) saturate(1.8)" }}
          >
            {glyphs.map((g) => (
              <button
                key={g}
                type="button"
                title={g}
                onClick={() => {
                  const l = makeLayer(
                    "icon",
                    { x: studio.doc.width / 2 - 90, y: studio.doc.height / 2 - 90, w: 180, h: 180 },
                    studio.doc.palette[2] ?? "#d9a521",
                  );
                  studio.addLayer({ ...l, glyph: g, name: g });
                  setIconOpen(false);
                  studio.setTool("select");
                }}
                className="grid h-7 w-7 place-items-center rounded-md text-tertiary hover:bg-white/[0.06] hover:text-primary"
              >
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={ICON_PATHS[g as keyof typeof ICON_PATHS]} />
                </svg>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <span className="ml-3 hidden text-caption text-muted lg:block">
        {studio.tool === "select"
          ? "Click to select · drag to move · scroll to zoom"
          : "Drag on the canvas to draw · scroll to zoom"}
      </span>
    </div>
  );
}
