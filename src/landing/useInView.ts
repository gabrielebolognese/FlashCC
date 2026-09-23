/**
 * Has this scrolled into view yet?
 *
 * Every demonstration on the landing page costs something to run, a generator
 * pass, a recolour, an interval, and running all of them at once on load means
 * a page that stutters before anybody has seen anything. They start when they
 * are looked at.
 *
 * It latches. A section that has played does not replay on the way back up,
 * because an animation that restarts every time it crosses the fold stops
 * reading as a demonstration and starts reading as a glitch.
 */
import { useEffect, useRef, useState } from "react";

export function useInView<T extends HTMLElement = HTMLDivElement>(
  margin = "-15% 0px",
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;

    // No IntersectionObserver is not a reason to show nothing: without it every
    // section is simply already visible, which is the correct degraded state.
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [margin, seen]);

  return [ref, seen];
}

/**
 * Whether to animate at all.
 *
 * Read once rather than subscribed to: somebody changing this preference
 * mid-scroll is not a case worth a listener, and the page is built so that
 * "false" shows the finished state of every demonstration rather than an empty
 * frame. Nothing here is load-bearing, the copy says what the product does; the
 * motion only shows it.
 */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
