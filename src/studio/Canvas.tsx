import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPE } from "react";

import {
  bounds,
  contains,
  CURSOR,
  HANDLES,
  intersects,
  normalize,
  rectOf,
  resize,
  snap,
  type Guide,
  type Handle,
  type Rect,
} from "./geometry.js";
import { slidePaint } from "./paint.js";
import { LayerView } from "./LayerView.js";
import { MEDIA_DRAG_TYPE } from "./MediaPool.js";
import { makeLayer, type Layer, type Tool } from "./model.js";
import type { Studio } from "./useStudio.js";

type Drag =
  | { mode: "move"; startX: number; startY: number; origin: Map<string, Rect> }
  | { mode: "resize"; handle: Handle; startX: number; startY: number; origin: Map<string, Rect>; box: Rect }
  | { mode: "marquee"; startX: number; startY: number; rect: Rect }
  | { mode: "draw"; startX: number; startY: number; layerId: string }
  | { mode: "pan"; startX: number; startY: number; origin: { x: number; y: number } }
  | null;

const SNAP_PX = 6;

export function Canvas({ studio }: { studio: Studio }) {
  const { doc, slide, selection, setSelection, tool, setTool, editingId, setEditingId } = studio;

  const hostRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.4);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<Drag>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [spaceDown, setSpaceDown] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // The wheel handler is registered once and needs today's zoom, not the zoom from
  // whichever render installed it.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const layers = slide?.layers ?? [];
  const selectedLayers = layers.filter((l) => selection.includes(l.id));
  const box = bounds(selectedLayers);

  /* ── zoom to fit ─────────────────────────────────────────────────────── */
  const fit = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const pad = 120;
    const z = Math.min((host.clientWidth - pad) / doc.width, (host.clientHeight - pad) / doc.height);
    setZoom(Math.max(0.05, Math.min(2, z)));
    setPan({ x: 0, y: 0 });
  }, [doc.width, doc.height]);

  useLayoutEffect(() => {
    fit();
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, [fit]);

  /* ── screen → artboard ───────────────────────────────────────────────── */
  const toBoard = useCallback(
    (clientX: number, clientY: number) => {
      const r = boardRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
    },
    [zoom],
  );

  /* ── keyboard ────────────────────────────────────────────────────────── */
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable === true;
    };

    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        setSpaceDown(true);
        e.preventDefault();
        return;
      }
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? studio.redo() : studio.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        studio.duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelection(layers.map((l) => l.id));
        return;
      }
      if (mod && e.key === "]") {
        e.preventDefault();
        studio.reorder("forward");
        return;
      }
      if (mod && e.key === "[") {
        e.preventDefault();
        studio.reorder("backward");
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoom((z) => Math.min(4, z * 1.2));
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        setZoom((z) => Math.max(0.05, z / 1.2));
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        fit();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        studio.removeSelected();
        return;
      }
      if (e.key === "Escape") {
        setEditingId(null);
        setSelection([]);
        setTool("select");
        return;
      }
      if (e.key === "Enter" && selection.length === 1) {
        const l = layers.find((x) => x.id === selection[0]);
        if (l?.kind === "text") {
          e.preventDefault();
          setEditingId(l.id);
        }
        return;
      }

      // single-letter tools, Photoshop style
      const keys: Record<string, Tool> = { v: "select", t: "text", r: "rect", o: "ellipse", l: "line", i: "icon" };
      const t = keys[e.key.toLowerCase()];
      if (t && !mod) {
        setTool(t);
        return;
      }

      // nudge
      const step = e.shiftKey ? 10 : 1;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const d = delta[e.key];
      if (d && selection.length > 0) {
        e.preventDefault();
        studio.updateEach((l) => ({ ...l, x: l.x + d[0], y: l.y + d[1] }), selection, "nudge");
      }
    };

    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [fit, layers, selection, setEditingId, setSelection, setTool, studio]);

  /* ── wheel: zoom by default, pan with a modifier ─────────────────────── */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Inverse of the browser default: on a canvas the wheel is the zoom control
      // people reach for. A modifier still pans, as does space-drag.
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
        return;
      }

      const board = boardRef.current;
      if (!board) return;
      const z = zoomRef.current;
      const next = Math.max(0.05, Math.min(4, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      if (next === z) return;

      // Keep the artboard point under the cursor pinned, or zooming walks the slide
      // away from wherever you were looking.
      const boardRect = board.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      const bx = (e.clientX - boardRect.left) / z;
      const by = (e.clientY - boardRect.top) / z;
      const cx = hostRect.left + hostRect.width / 2;
      const cy = hostRect.top + hostRect.height / 2;

      setPan({
        x: e.clientX - cx + (doc.width * next) / 2 - bx * next,
        y: e.clientY - cy + (doc.height * next) / 2 - by * next,
      });
      setZoom(next);
    };

    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [doc.width, doc.height]);

  /* ── pointer ─────────────────────────────────────────────────────────── */

  const onBoardDown = (e: RPE<HTMLDivElement>) => {
    if (editingId) return;
    const p = toBoard(e.clientX, e.clientY);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    if (spaceDown || e.button === 1) {
      setDrag({ mode: "pan", startX: e.clientX, startY: e.clientY, origin: { ...pan } });
      return;
    }

    if (tool !== "select") {
      const kind = tool === "icon" ? "icon" : tool;
      const fill = tool === "text" ? "#ffffff" : doc.palette[2] ?? "#d9a521";
      const layer = makeLayer(kind as Layer["kind"], { x: p.x, y: p.y, w: 1, h: 1 }, fill);
      studio.addLayer(layer);
      setDrag({ mode: "draw", startX: p.x, startY: p.y, layerId: layer.id });
      return;
    }

    // topmost layer under the cursor
    const hit = [...layers].reverse().find((l) => l.visible && !l.locked && contains(rectOf(l), p.x, p.y));

    if (hit) {
      const next = e.shiftKey
        ? selection.includes(hit.id)
          ? selection.filter((id) => id !== hit.id)
          : [...selection, hit.id]
        : selection.includes(hit.id)
          ? selection
          : [hit.id];
      setSelection(next);
      const origin = new Map<string, Rect>();
      for (const l of layers) if (next.includes(l.id)) origin.set(l.id, rectOf(l));
      setDrag({ mode: "move", startX: p.x, startY: p.y, origin });
      return;
    }

    if (!e.shiftKey) setSelection([]);
    setDrag({ mode: "marquee", startX: p.x, startY: p.y, rect: { x: p.x, y: p.y, w: 0, h: 0 } });
  };

  const onHandleDown = (e: RPE<HTMLDivElement>, handle: Handle) => {
    if (!box) return;
    e.stopPropagation();
    const p = toBoard(e.clientX, e.clientY);
    const origin = new Map<string, Rect>();
    for (const l of selectedLayers) origin.set(l.id, rectOf(l));
    setDrag({ mode: "resize", handle, startX: p.x, startY: p.y, origin, box });
  };

  const onMove = (e: RPE<HTMLDivElement>) => {
    if (!drag) return;

    if (drag.mode === "pan") {
      setPan({ x: drag.origin.x + (e.clientX - drag.startX), y: drag.origin.y + (e.clientY - drag.startY) });
      return;
    }

    const p = toBoard(e.clientX, e.clientY);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;

    if (drag.mode === "move") {
      const movingBox = bounds(
        selectedLayers.map((l) => {
          const o = drag.origin.get(l.id) ?? rectOf(l);
          return { ...l, x: o.x + dx, y: o.y + dy };
        }),
      );
      let sx = 0;
      let sy = 0;
      if (movingBox && !e.altKey) {
        const others = layers.filter((l) => !selection.includes(l.id)).map(rectOf);
        const s = snap(movingBox, others, { w: doc.width, h: doc.height }, SNAP_PX / zoom);
        sx = s.dx;
        sy = s.dy;
        setGuides(s.guides);
      } else {
        setGuides([]);
      }
      studio.updateEach(
        (l) => {
          const o = drag.origin.get(l.id) ?? rectOf(l);
          return { ...l, x: Math.round(o.x + dx + sx), y: Math.round(o.y + dy + sy) };
        },
        selection,
        "move",
      );
      return;
    }

    if (drag.mode === "resize") {
      const next = resize(drag.box, drag.handle, dx, dy, e.shiftKey);
      const kx = drag.box.w === 0 ? 1 : next.w / drag.box.w;
      const ky = drag.box.h === 0 ? 1 : next.h / drag.box.h;
      studio.updateEach(
        (l) => {
          const o = drag.origin.get(l.id) ?? rectOf(l);
          const layer: Layer = {
            ...l,
            x: Math.round(next.x + (o.x - drag.box.x) * kx),
            y: Math.round(next.y + (o.y - drag.box.y) * ky),
            w: Math.max(4, Math.round(o.w * kx)),
            h: Math.max(4, Math.round(o.h * ky)),
          };
          // Text scales its size with the box, the way it does when you scale type.
          if (l.kind === "text" && l.fontSize) {
            layer.fontSize = Math.max(6, Math.round(l.fontSize * ((kx + ky) / 2)));
          }
          return layer;
        },
        selection,
        "resize",
      );
      return;
    }

    if (drag.mode === "marquee") {
      const rect = normalize({ x: drag.startX, y: drag.startY, w: dx, h: dy });
      setDrag({ ...drag, rect });
      setSelection(layers.filter((l) => l.visible && intersects(rectOf(l), rect)).map((l) => l.id));
      return;
    }

    if (drag.mode === "draw") {
      const rect = normalize({ x: drag.startX, y: drag.startY, w: dx, h: dy });
      studio.updateLayers(
        [drag.layerId],
        {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.max(4, Math.round(rect.w)),
          h: Math.max(4, Math.round(rect.h)),
        },
        "draw",
      );
    }
  };

  const onUp = () => {
    if (drag?.mode === "draw") {
      const l = layers.find((x) => x.id === drag.layerId);
      // A click rather than a drag: give the new layer a sensible default size.
      if (l && (l.w <= 4 || l.h <= 4)) {
        const d =
          l.kind === "text"
            ? { w: 640, h: 120 }
            : l.kind === "line"
              ? { w: 400, h: 8 }
              : { w: 240, h: 240 };
        studio.updateLayers([l.id], d);
      }
      if (l?.kind === "text") setEditingId(l.id);
      setTool("select");
    }
    setDrag(null);
    setGuides([]);
  };

  /** Topmost image layer under the pointer — a drop lands there, sized to its box. */
  const imageUnder = (clientX: number, clientY: number): Layer | undefined => {
    const p = toBoard(clientX, clientY);
    return [...layers]
      .reverse()
      .find((l) => l.visible && !l.locked && l.kind === "image" && contains(rectOf(l), p.x, p.y));
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropTarget(imageUnder(e.clientX, e.clientY)?.id ?? null);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const id = e.dataTransfer.getData(MEDIA_DRAG_TYPE);
    if (!id) return;
    e.preventDefault();
    setDropTarget(null);
    const item = doc.media.find((m) => m.id === id);
    if (!item) return;

    const target = imageUnder(e.clientX, e.clientY);
    // Onto a slot: keep the slot's box. Onto bare canvas: a new layer at the pointer.
    if (target) studio.fillWithMedia(target.id, item);
    else studio.placeMedia(item, toBoard(e.clientX, e.clientY));
  };

  const cursor = spaceDown ? "grab" : tool === "select" ? "default" : "crosshair";

  return (
    <div
      ref={hostRef}
      className="relative min-w-0 flex-1 overflow-hidden bg-sunken"
      style={{ cursor }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onDragOver={onDragOver}
      onDragLeave={() => setDropTarget(null)}
      onDrop={onDrop}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{ transform: `translate(-50%,-50%) translate(${pan.x}px, ${pan.y}px)` }}
      >
        <div
          ref={boardRef}
          onPointerDown={onBoardDown}
          className="relative origin-center shadow-slide"
          style={{
            width: doc.width * zoom,
            height: doc.height * zoom,
            ...slidePaint(slide),
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: doc.width, height: doc.height, transform: `scale(${zoom})` }}
          >
            {layers.map((l) => (
              <LayerView
                key={l.id}
                layer={l}
                editing={editingId === l.id}
                onCommitText={(text) => {
                  studio.updateLayers([l.id], { text });
                  setEditingId(null);
                }}
              />
            ))}

            {/* snap guides */}
            {guides.map((g, i) =>
              g.axis === "x" ? (
                <div key={i} className="absolute top-0 bg-accent" style={{ left: g.at, width: 1 / zoom, height: doc.height }} />
              ) : (
                <div key={i} className="absolute left-0 bg-accent" style={{ top: g.at, height: 1 / zoom, width: doc.width }} />
              ),
            )}
          </div>

          {/* the slot a drop would land on */}
          {dropTarget
            ? layers
                .filter((l) => l.id === dropTarget)
                .map((l) => (
                  <div
                    key={`drop-${l.id}`}
                    className="pointer-events-none absolute rounded-lg border-2 border-accent bg-accent-wash"
                    style={{ left: l.x * zoom, top: l.y * zoom, width: l.w * zoom, height: l.h * zoom }}
                  />
                ))
            : null}

          {/* selection chrome, in screen space */}
          {selectedLayers.map((l) => (
            <div
              key={l.id}
              className="pointer-events-none absolute border border-accent"
              style={{ left: l.x * zoom, top: l.y * zoom, width: l.w * zoom, height: l.h * zoom }}
            />
          ))}

          {box && !editingId ? (
            <>
              {selectedLayers.length > 1 ? (
                <div
                  className="pointer-events-none absolute border border-dashed border-accent"
                  style={{ left: box.x * zoom, top: box.y * zoom, width: box.w * zoom, height: box.h * zoom }}
                />
              ) : null}
              {HANDLES.map((h) => {
                const hx = h.includes("w") ? box.x : h.includes("e") ? box.x + box.w : box.x + box.w / 2;
                const hy = h.startsWith("n") ? box.y : h.startsWith("s") ? box.y + box.h : box.y + box.h / 2;
                return (
                  <div
                    key={h}
                    onPointerDown={(e) => onHandleDown(e, h)}
                    className="absolute h-2.5 w-2.5 rounded-sm border border-accent bg-base"
                    style={{ left: hx * zoom - 5, top: hy * zoom - 5, cursor: CURSOR[h] }}
                  />
                );
              })}
            </>
          ) : null}

          {drag?.mode === "marquee" ? (
            <div
              className="pointer-events-none absolute border border-accent bg-accent-wash"
              style={{
                left: drag.rect.x * zoom,
                top: drag.rect.y * zoom,
                width: drag.rect.w * zoom,
                height: drag.rect.h * zoom,
              }}
            />
          ) : null}
        </div>
      </div>

      {/* zoom cluster */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md border border-hairline bg-surface-1 px-1 py-0.5">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.05, z / 1.2))}
          className="h-6 w-6 rounded-sm text-tertiary hover:bg-white/[0.06] hover:text-primary"
        >
          −
        </button>
        <button
          type="button"
          onClick={fit}
          title="Fit to view — scroll to zoom, hold Ctrl or Shift to pan"
          className="px-1 font-mono text-caption text-tertiary hover:text-primary"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(4, z * 1.2))}
          className="h-6 w-6 rounded-sm text-tertiary hover:bg-white/[0.06] hover:text-primary"
        >
          +
        </button>
      </div>
    </div>
  );
}
