import { useLayoutEffect, useRef, useState } from "react";

import { LayerView } from "./LayerView.js";
import type { Slide } from "./model.js";

/**
 * A slide at whatever size its container happens to be.
 *
 * The scale is measured rather than hardcoded, so this can sit in a fluid column
 * without the contents drifting out of the frame at other widths — which is exactly
 * what a fixed `scale(0.2778)` does the moment the layout is responsive.
 */
export function SlidePreview({
  slide,
  w = 1080,
  h = 1350,
  className = "",
  style,
}: {
  slide: Slide | undefined;
  w?: number;
  h?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / w);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio: `${w} / ${h}`, background: slide?.background, ...style }}
    >
      {scale > 0 ? (
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{ width: w, height: h, transform: `scale(${scale})` }}
        >
          {slide?.layers.map((l) => (
            <LayerView key={l.id} layer={l} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
