/**
 * Icon glyphs as pure path data, on a 24×24 grid.
 *
 * Shipped here rather than imported from lucide-react so `computeLayout` can emit an
 * icon node without a React dependency, and so phase 2 resolves one without a DOM.
 * 24 glyphs is a set; a searchable library is a second product (docs/template-system.md §5.7).
 */
import type { IconId } from "../doc/template.js";

export const ICON_PATHS: Record<IconId, string> = {
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
  "arrow-down": "M12 5v14M6 13l6 6 6-6",
  "arrow-up-right": "M7 17L17 7M8 7h9v9",
  "chevron-right": "M9 6l6 6-6 6",
  check: "M20 6L9 17l-5-5",
  x: "M18 6L6 18M6 6l12 12",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  dot: "M12 12h.01",
  star: "M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z",
  circle: "M12 3a9 9 0 100 18 9 9 0 000-18z",
  square: "M4 4h16v16H4z",
  triangle: "M12 3l9 17H3z",
  diamond: "M12 2l10 10-10 10L2 12z",
  quote: "M7 7h4v4a4 4 0 01-4 4zM15 7h4v4a4 4 0 01-4 4z",
  info: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 8h.01",
  alert: "M12 3l9 16H3zM12 9v4M12 17h.01",
  zap: "M13 2L4 14h7l-1 8 9-12h-7z",
};

export const ICON_VIEWBOX = 24;
