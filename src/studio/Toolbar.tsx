import { Circle, Minus, MousePointer2, Sparkle, Square, Triangle, Type } from "lucide-react";
import { useState } from "react";

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

/** Vertical tool rail. Single-letter shortcuts, like every editor of this kind. */
export function Toolbar({ studio }: { studio: Studio }) {
  const [iconOpen, setIconOpen] = useState(false);
  const glyphs = Object.keys(ICON_PATHS);

  return (
    <div className="relative flex w-11 shrink-0 flex-col items-center gap-1 border-r border-hairline bg-surface-1 py-2">
      {TOOLS.map(({ id, icon: Icon, label, key }) => (
        <button
          key={id}
          type="button"
          title={key ? `${label} (${key})` : label}
          aria-label={label}
          onClick={() => {
            studio.setTool(id);
            setIconOpen(false);
          }}
          className={[
            "grid h-7 w-7 place-items-center rounded-md",
            studio.tool === id
              ? "bg-accent-wash text-accent"
              : "text-tertiary hover:bg-white/[0.06] hover:text-primary",
          ].join(" ")}
        >
          <Icon size={14} strokeWidth={2} />
        </button>
      ))}

      <button
        type="button"
        title="Icon (I)"
        aria-label="Icon"
        onClick={() => setIconOpen((v) => !v)}
        className={[
          "grid h-7 w-7 place-items-center rounded-md",
          iconOpen || studio.tool === "icon"
            ? "bg-accent-wash text-accent"
            : "text-tertiary hover:bg-white/[0.06] hover:text-primary",
        ].join(" ")}
      >
        <Sparkle size={14} strokeWidth={2} />
      </button>

      {iconOpen ? (
        <div
          className="absolute left-12 top-[196px] z-overlay grid w-[268px] grid-cols-9 gap-0.5 rounded-lg border border-hairline p-1.5 shadow-overlay"
          style={{ background: "rgba(26,42,66,.9)", backdropFilter: "blur(24px) saturate(1.8)" }}
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
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d={ICON_PATHS[g as keyof typeof ICON_PATHS]} />
              </svg>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
