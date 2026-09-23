/**
 * A shelf of real slides, with one of them forward.
 *
 * ── These are not pictures of the product ────────────────────────────────────
 *
 * `buildSlides` runs in the browser and the result goes through `LayerView`,
 * which is the only painter in this codebase — so a visitor is looking at the
 * same pixels the editor draws and the export renders. If generation changes
 * tomorrow this changes with it, which is the one way a marketing page stays
 * true without anybody maintaining it.
 *
 * ── Why a shelf and not a phone ──────────────────────────────────────────────
 *
 * A single mockup shows one slide and reads as a screenshot. A row of them with
 * the middle one forward reads, instantly and without a caption, as a CAROUSEL —
 * which is the thing being sold. The motion is the demo.
 *
 * ── The layout rule this file exists to obey ─────────────────────────────────
 *
 * Exactly one `position: relative` wrapper, and everything absolute inside it is
 * decorative and empty. Nothing that holds content is taken out of flow. The
 * first version of this page put `.fcc-aurora` — which is `position: absolute;
 * inset: 0` — straight onto the page header, and the whole document stacked on
 * top of itself.
 */
import { useEffect, useState } from "react";

import type { Slide } from "../studio/model.js";
import { SlidePreview } from "../studio/SlidePreview.js";
import { prefersReducedMotion } from "./useInView.js";

/** Long enough to read a hook, short enough that nobody waits for the next. */
const DWELL_MS = 2800;

/** One card's width. The shelf is sized from this, so there is one number. */
const CARD = 186;
const GAP = 18;

export function DeckShelf({ slides, playing = true }: { slides: readonly Slide[]; playing?: boolean }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!playing || slides.length < 2 || prefersReducedMotion()) return;
    const t = setInterval(() => setActive((i) => (i + 1) % slides.length), DWELL_MS);
    return () => clearInterval(t);
  }, [playing, slides.length]);

  // The track slides so the active card sits in the middle of the viewport.
  // Computed rather than scrolled, because a scroll container would let the
  // wheel fight the timer.
  const shift = active * (CARD + GAP);

  return (
    <div className="relative">
      {/* Decorative only, and empty — see the note at the top of this file. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-8 mx-auto h-[220px] max-w-[520px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(217,165,33,.22), transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="relative overflow-hidden py-6">
        <div
          className="flex justify-start"
          style={{
            gap: GAP,
            // Half the container minus half a card centres the active one; the
            // translate is what moves the shelf under that fixed point.
            paddingLeft: `calc(50% - ${CARD / 2}px)`,
            paddingRight: `calc(50% - ${CARD / 2}px)`,
            transform: `translateX(-${shift}px)`,
            transition: "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {slides.map((slide, i) => {
            const isActive = i === active;
            return (
              <button
                key={slide.id}
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => setActive(i)}
                className="shrink-0 overflow-hidden rounded-2xl border border-hairline"
                style={{
                  width: CARD,
                  transform: isActive ? "scale(1.09)" : "scale(0.94)",
                  opacity: isActive ? 1 : 0.42,
                  boxShadow: isActive ? "0 26px 60px -18px rgba(0,0,0,.7)" : "none",
                  transition:
                    "transform 700ms cubic-bezier(0.22,1,0.36,1), opacity 700ms ease, box-shadow 700ms ease",
                }}
              >
                <SlidePreview slide={slide} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-center gap-1.5">
        {slides.map((slide, i) => (
          <span
            key={slide.id}
            className="h-1.5 rounded-full"
            style={{
              width: i === active ? 22 : 6,
              background: i === active ? "var(--brand-gold)" : "var(--surface-5)",
              transition: "width 400ms cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
