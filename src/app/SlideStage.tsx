import { Circle, Maximize2, Minus, Shapes, Sparkle, Square, Triangle, Type } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";

import { newId } from "../doc/ids.js";
import type { IconId, Template } from "../doc/template.js";
import { effectiveRole, ROLES, type BrandKit, type Element, type Slide, type SlideRole } from "../doc/types.js";
import { ICON_PATHS } from "../render/icons.js";
import { elementsToNodes } from "../render/materialize.js";
import type { Format, LayoutNode } from "../render/layout/node.js";
import { SlideRenderer } from "../render/SlideRenderer.js";
import { IconButton } from "../ui/IconButton.js";

type Props = {
  slide: Slide | undefined;
  template: Template;
  brand: BrandKit;
  format: Format;
  slideNumber: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRoleChange: (role: SlideRole | undefined) => void;
  onEdit: (node: LayoutNode, text: string) => void;
  onAddElement: (element: Element) => void;
  onUpdateElement: (id: string, patch: Partial<Element>, coalesce?: string) => void;
  onSplit: () => void;
};

type DragState = {
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  origin: { x: number; y: number; w: number; h: number };
};

const ICON_CHOICES = Object.keys(ICON_PATHS) as IconId[];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function SlideStage({
  slide,
  template,
  brand,
  format,
  slideNumber,
  selectedId,
  onSelect,
  onRoleChange,
  onEdit,
  onAddElement,
  onUpdateElement,
  onSplit,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [addMenu, setAddMenu] = useState<null | "icon" | "shape">(null);
  const drag = useRef<DragState | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const fit = () => {
      const pad = 112;
      setScale(
        Math.max(
          0.05,
          Math.min(1, Math.min((host.clientWidth - pad) / format.w, (host.clientHeight - pad) / format.h)),
        ),
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    return () => observer.disconnect();
  }, [format.w, format.h]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.isContentEditable || t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") {
        onSelect(null);
        setAddMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelect]);

  if (!slide) {
    return (
      <div ref={hostRef} className="relative grid min-w-0 flex-1 place-items-center bg-sunken">
        <p className="max-w-[280px] text-center text-body text-tertiary">
          No slides yet. Add one from the list on the left.
        </p>
      </div>
    );
  }

  const elements = slide.elements ?? [];
  const nodes = elementsToNodes(elements, format, slide.background ?? brand.palette.background);
  const role = effectiveRole(slide);
  const selected = elements.find((o) => o.id === selectedId) ?? null;
  const topZ = elements.reduce((m, e) => Math.max(m, e.z), 0);

  function addElement(kind: Element["kind"], extra: Partial<Element> = {}) {
    const element: Element = {
      id: newId("el"),
      kind,
      z: topZ + 1,
      x: 0.3,
      y: 0.42,
      w: kind === "text" ? 0.4 : 0.16,
      h: kind === "text" ? 0.07 : 0.16 * (format.w / format.h),
      colour: brand.palette.accent,
      ...(kind === "text"
        ? { text: "New text", fontSize: 48, family: "sans" as const, weight: 600, align: "left" as const }
        : {}),
      ...(kind === "shape" ? { shape: "rect" as const, filled: true, radius: 0 } : {}),
      ...(kind === "icon" ? { glyph: "star", strokeWidth: 2 } : {}),
      ...extra,
    };
    onAddElement(element);
    onSelect(element.id);
    setAddMenu(null);
  }

  const startDrag = (e: RPointerEvent<HTMLDivElement>, id: string, mode: DragState["mode"]) => {
    const o = elements.find((v) => v.id === id);
    if (!o) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, mode, startX: e.clientX, startY: e.clientY, origin: { x: o.x, y: o.y, w: o.w, h: o.h } };
    onSelect(id);
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // 1:1 with the pointer — no easing; the object must be under the finger.
    const dx = (e.clientX - d.startX) / (format.w * scale);
    const dy = (e.clientY - d.startY) / (format.h * scale);
    if (d.mode === "move") {
      onUpdateElement(
        d.id,
        { x: clamp(d.origin.x + dx, -0.2, 1.2), y: clamp(d.origin.y + dy, -0.2, 1.2) },
        `move:${d.id}`,
      );
    } else {
      onUpdateElement(
        d.id,
        { w: Math.max(0.02, d.origin.w + dx), h: Math.max(0.01, d.origin.h + dy) },
        `resize:${d.id}`,
      );
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  const glass = { background: "rgba(26,42,66,.85)", backdropFilter: "blur(24px) saturate(1.8)" };

  return (
    <div ref={hostRef} className="relative min-w-0 flex-1 overflow-hidden bg-sunken">
      {/* The visible answer to "what can I do here". */}
      <div
        className="absolute left-1/2 top-3 z-overlay flex -translate-x-1/2 items-center gap-1 rounded-lg border border-hairline p-1 shadow-overlay"
        style={glass}
      >
        <ToolButton icon={Type} label="Add text" onClick={() => addElement("text")} />
        <ToolButton
          icon={Shapes}
          label="Add shape"
          active={addMenu === "shape"}
          onClick={() => setAddMenu(addMenu === "shape" ? null : "shape")}
        />
        <ToolButton
          icon={Sparkle}
          label="Add icon"
          active={addMenu === "icon"}
          onClick={() => setAddMenu(addMenu === "icon" ? null : "icon")}
        />
        <div className="mx-0.5 h-4 w-px bg-hairline" />
        <span className="px-1.5 text-caption text-muted">click to select · drag to move · double-click text to edit</span>
      </div>

      {addMenu === "shape" ? (
        <div
          className="absolute left-1/2 top-14 z-overlay flex -translate-x-1/2 gap-1 rounded-lg border border-hairline p-1 shadow-overlay"
          style={glass}
        >
          <ToolButton icon={Square} label="Rectangle" onClick={() => addElement("shape", { shape: "rect" })} />
          <ToolButton icon={Circle} label="Ellipse" onClick={() => addElement("shape", { shape: "ellipse" })} />
          <ToolButton icon={Triangle} label="Triangle" onClick={() => addElement("shape", { shape: "triangle" })} />
          <ToolButton icon={Minus} label="Line" onClick={() => addElement("shape", { shape: "line", h: 0.005 })} />
        </div>
      ) : null}

      {addMenu === "icon" ? (
        <div
          className="absolute left-1/2 top-14 z-overlay grid w-[268px] -translate-x-1/2 grid-cols-9 gap-0.5 rounded-lg border border-hairline p-1.5 shadow-overlay"
          style={glass}
        >
          {ICON_CHOICES.map((glyph) => (
            <button
              key={glyph}
              type="button"
              title={glyph}
              onClick={() => addElement("icon", { glyph })}
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
                <path d={ICON_PATHS[glyph]} />
              </svg>
            </button>
          ))}
        </div>
      ) : null}

      <div className="absolute inset-0 grid place-items-center" onPointerDown={() => onSelect(null)}>
        <div
          className="group relative"
          style={{ width: format.w * scale, height: format.h * scale }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            className="origin-top-left shadow-slide"
            style={{ width: format.w, height: format.h, transform: `scale(${scale})` }}
          >
            <SlideRenderer
              nodes={nodes}
              format={format}
              editingId={editingId}
              onEditStart={(node) => {
                onSelect(node.overlayId ?? null);
              }}
              onEditCommit={(node, text) => {
                setEditingId(null);
                // A block-linked element syncs through the block, so the slide list
                // and the canvas stay one truth and it stays one undo step.
                if (node.blockId) onEdit(node, text);
                else if (node.overlayId) onUpdateElement(node.overlayId, { text });
              }}
            />
          </div>

          {/* Hit layer: one target per element, so EVERYTHING is selectable and
              draggable — template-seeded or hand-placed, text or shape or icon. */}
          {elements.map((el) => (
            <div
              key={el.id}
              className={selectedId === el.id ? "" : "hover:outline hover:outline-1 hover:outline-accent-dim"}
              style={{
                position: "absolute",
                left: el.x * format.w * scale,
                top: el.y * format.h * scale,
                width: Math.max(8, el.w * format.w * scale),
                height: Math.max(8, el.h * format.h * scale),
                cursor: "move",
              }}
              onPointerDown={(e) => startDrag(e, el.id, "move")}
              onDoubleClick={() => {
                if (el.kind === "text") setEditingId(el.blockId ? `${el.blockId}` : el.id);
              }}
            />
          ))}

          {/* Selection frame, in screen space over the scaled slide. */}
          {selected ? (
            <div
              className="absolute border border-accent"
              style={{
                left: selected.x * format.w * scale,
                top: selected.y * format.h * scale,
                width: Math.max(8, selected.w * format.w * scale),
                height: Math.max(8, selected.h * format.h * scale),
                cursor: "move",
              }}
              onPointerDown={(e) => startDrag(e, selected.id, "move")}
              onDoubleClick={() => {
                if (selected.kind === "text") setEditingId(selected.id);
              }}
            >
              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <div
                  key={corner}
                  className="absolute h-2.5 w-2.5 rounded-sm border border-accent bg-base"
                  style={{
                    left: corner.includes("w") ? -5 : undefined,
                    right: corner.includes("e") ? -5 : undefined,
                    top: corner.startsWith("n") ? -5 : undefined,
                    bottom: corner.startsWith("s") ? -5 : undefined,
                    cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize",
                  }}
                  onPointerDown={(e) => startDrag(e, selected.id, "resize")}
                />
              ))}
            </div>
          ) : null}

          <div className="absolute -top-8 left-0 hidden group-hover:block">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRoleOpen((v) => !v);
              }}
              className="flex h-7 items-center gap-1 rounded-md border border-hairline px-2 text-caption text-secondary hover:text-primary"
              style={glass}
            >
              {role}
              {slide.roleOverride ? <span className="text-accent">·</span> : null}
            </button>
            {roleOpen ? (
              <div
                className="absolute left-0 top-8 z-overlay w-32 rounded-lg border border-hairline p-1 shadow-overlay"
                style={glass}
              >
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRoleChange(r === slide.role ? undefined : r);
                      setRoleOpen(false);
                    }}
                    className={[
                      "flex h-6 w-full items-center rounded-sm px-2 text-caption",
                      r === role ? "bg-accent-wash text-accent" : "text-secondary hover:bg-white/[0.04]",
                    ].join(" ")}
                  >
                    {r}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

        </div>
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1 opacity-40 hover:opacity-100">
        <span className="font-mono text-caption text-tertiary">{Math.round(scale * 100)}%</span>
        <IconButton
          icon={Maximize2}
          label="Zoom to fit"
          onClick={() => {
            const host = hostRef.current;
            if (host) {
              setScale(Math.min((host.clientWidth - 112) / format.w, (host.clientHeight - 112) / format.h));
            }
          }}
        />
      </div>
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  icon: typeof Type;
  label: string;
  onClick: () => void;
  active?: boolean;
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
        "grid h-7 w-7 place-items-center rounded-md",
        active ? "bg-accent-wash text-accent" : "text-tertiary hover:bg-white/[0.06] hover:text-primary",
      ].join(" ")}
    >
      <Icon size={14} strokeWidth={2} />
    </button>
  );
}
