import { Maximize2 } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { effectiveRole, ROLES, type BrandKit, type Slide, type SlideRole } from "../doc/types.js";
import { computeLayout, type Format, type LayoutNode } from "../render/layout/computeLayout.js";
import { nodeKey, SlideRenderer } from "../render/SlideRenderer.js";

type Props = {
  slide: Slide | undefined;
  brand: BrandKit;
  format: Format;
  slideNumber: number;
  onRoleChange: (role: SlideRole | undefined) => void;
  onEdit: (node: LayoutNode, text: string) => void;
  onSplit: () => void;
};

/**
 * The canvas. Largest region, its own workspace background, the slide as an object on a
 * surface. Role control floats on the slide itself and only on hover (R7/R9).
 */
export function SlideStage({
  slide,
  brand,
  format,
  slideNumber,
  onRoleChange,
  onEdit,
  onSplit,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);

  // Zoom to fit. Recomputed on resize — this is chrome, not the renderer.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const fit = () => {
      const pad = 64;
      const k = Math.min(
        (host.clientWidth - pad) / format.w,
        (host.clientHeight - pad) / format.h,
      );
      setScale(Math.max(0.05, Math.min(1, k)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    return () => observer.disconnect();
  }, [format.w, format.h]);

  if (!slide) {
    return <div ref={hostRef} className="relative min-w-0 flex-1 bg-sunken" />;
  }

  const nodes = computeLayout(slide, brand, format, slideNumber);
  const overflowing = nodes.some((n) => n.overflow);
  const role = effectiveRole(slide);

  return (
    <div ref={hostRef} className="relative min-w-0 flex-1 overflow-hidden bg-sunken">
      <div className="absolute inset-0 grid place-items-center">
        <div className="group relative" style={{ width: format.w * scale, height: format.h * scale }}>
          <div
            className="origin-top-left shadow-slide"
            style={{ width: format.w, height: format.h, transform: `scale(${scale})` }}
          >
            <SlideRenderer
              nodes={nodes}
              brand={brand}
              format={format}
              editingId={editingId}
              onEditStart={(node) => setEditingId(nodeKey(node))}
              onEditCommit={(node, text) => {
                setEditingId(null);
                onEdit(node, text);
              }}
            />
          </div>

          {/* Role control — on the slide, hover-revealed, no reserved space. */}
          <div className="absolute -top-8 left-0 hidden group-hover:block">
            <button
              type="button"
              onClick={() => setRoleOpen((v) => !v)}
              className="flex h-7 items-center gap-1 rounded-md border border-hairline px-2 text-caption text-secondary hover:text-primary"
              style={{ background: "rgba(26,42,66,.85)", backdropFilter: "blur(24px) saturate(1.8)" }}
            >
              {role}
              {slide.roleOverride ? <span className="text-accent">·</span> : null}
            </button>
            {roleOpen ? (
              <div
                className="absolute left-0 top-8 z-overlay w-32 rounded-lg border border-hairline p-1 shadow-overlay"
                style={{ background: "rgba(26,42,66,.85)", backdropFilter: "blur(24px) saturate(1.8)" }}
              >
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
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

          {/* Overflow: inline, never a modal, never silent truncation. */}
          {overflowing ? (
            <div className="absolute -bottom-8 left-0 flex items-center gap-2 text-caption">
              <span className="text-danger">Text does not fit</span>
              <button type="button" onClick={onSplit} className="text-secondary underline hover:text-primary">
                split this slide
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1 opacity-40 hover:opacity-100">
        <span className="font-mono text-caption text-tertiary">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          aria-label="Zoom to fit"
          onClick={() => {
            const host = hostRef.current;
            if (!host) return;
            setScale(
              Math.min((host.clientWidth - 64) / format.w, (host.clientHeight - 64) / format.h),
            );
          }}
          className="grid h-7 w-7 place-items-center rounded-md text-tertiary hover:bg-white/[0.06] hover:text-primary"
        >
          <Maximize2 size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
