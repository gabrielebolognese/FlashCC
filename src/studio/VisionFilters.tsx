/**
 * The colour-vision previews (30.3): one SVG filter per deficiency, from the
 * same matrices the colour-only check uses (`CVD` in legibility.ts). Mounted
 * once beside whatever uses them; a view, never part of the doc or the export.
 */
import { filterValues, VISIONS, type Vision } from "./legibility.js";

export const visionFilter = (v: Vision | null | undefined): string | undefined => (v ? `url(#fcc-vision-${v})` : undefined);

export function VisionFilters() {
  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        {VISIONS.map((v) => (
          // linearRGB is the default for filters, and what the matrices expect.
          <filter key={v.id} id={`fcc-vision-${v.id}`} colorInterpolationFilters="linearRGB">
            <feColorMatrix type="matrix" values={filterValues(v.id)} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
