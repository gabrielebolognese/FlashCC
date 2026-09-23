/**
 * A carousel that swipes itself.
 *
 * ── These are real slides ────────────────────────────────────────────────────
 *
 * Not screenshots, not a Figma mock. `buildSlides` runs in the browser and the
 * result goes through `LayerView`, which is the only painter in this codebase —
 * so what a visitor watches on the landing page is the same pixels the editor
 * would show and the same pixels the export would render. If generation changes,
 * this changes with it, and a stale marketing image is one thing this product
 * cannot ship.
 *
 * It also means the demonstration cannot lie. Every slide here was laid out by
 * the thing being sold.
 */
import { useEffect, useState } from "react";

import type { Slide } from "../studio/model.js";
import { SlidePreview } from "../studio/SlidePreview.js";
import { prefersReducedMotion } from "./useInView.js";

/** Long enough to read a hook, short enough that nobody waits for the next one. */
const DWELL_MS = 2600;

export function DeckPlayer({
  slides,
  playing = true,
  index,
  onIndexChange,
  className = "",
}: {
  slides: readonly Slide[];
  playing?: boolean;
  /** Controlled when given; self-advancing when not. */
  index?: number;
  onIndexChange?: (i: number) => void;
  className?: string;
}) {
  const [inner, setInner] = useState(0);
  const current = index ?? inner;

  useEffect(() => {
    if (index !== undefined || !playing || slides.length < 2) return;
    if (prefersReducedMotion()) return;

    const t = setInterval(() => {
      setInner((i) => {
        const next = (i + 1) % slides.length;
        onIndexChange?.(next);
        return next;
      });
    }, DWELL_MS);

    return () => clearInterval(t);
  }, [index, playing, slides.length, onIndexChange]);

  return (
    <div className={`relative ${className}`}>
      <div
        className="overflow-hidden rounded-[22px] border border-hairline"
        style={{ boxShadow: "0 30px 80px -20px rgba(0,0,0,.65)" }}
      >
        {/*
          One track, translated. Cross-fading would let two slides overlap and
          read as a dissolve; a carousel SWIPES, and the motion is part of what
          is being demonstrated.
        */}
        <div
          className="flex"
          style={{
            transform: `translateX(-${current * 100}%)`,
            transition: "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {slides.map((slide) => (
            <div key={slide.id} className="w-full shrink-0">
              <SlidePreview slide={slide} />
            </div>
          ))}
        </div>
      </div>

      {/* The counter a real carousel has, because that is what it looks like. */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {slides.map((slide, i) => (
          <span
            key={slide.id}
            className="h-1.5 rounded-full"
            style={{
              width: i === current ? 20 : 6,
              background: i === current ? "var(--brand-gold)" : "var(--surface-5)",
              transition: "width 300ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
