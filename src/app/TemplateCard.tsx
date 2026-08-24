import { useMemo } from "react";

import { splitToSlides } from "../doc/split.js";
import type { Template } from "../doc/template.js";
import type { BrandKit } from "../doc/types.js";
import { computeLayout } from "../render/layout/computeLayout.js";
import type { Format } from "../render/layout/node.js";
import { SlideRenderer } from "../render/SlideRenderer.js";

type Props = {
  template: Template;
  brand: BrandKit;
  format: Format;
  /** Seeded from the user's own most recent carousel when there is one. */
  previewText: string;
  height: number;
  selected?: boolean;
};

/**
 * A real slide, through the real renderer, in the same transform:scale wrapper the
 * filmstrip uses. Never a mock — a second preview path is exactly the drift the
 * single-renderer rule exists to prevent.
 */
export function TemplateCard({ template, brand, format, previewText, height, selected = false }: Props) {
  const nodes = useMemo(() => {
    const slides = splitToSlides(previewText, "balanced");
    const cover = slides[0];
    if (!cover) return [];
    return computeLayout(template, cover, brand, format, 1);
  }, [template, brand, format, previewText]);

  const scale = height / format.h;

  return (
    <div
      className={[
        "overflow-hidden rounded-lg border",
        selected ? "border-accent" : "border-hairline",
      ].join(" ")}
      style={{ width: format.w * scale, height }}
    >
      <div
        className="pointer-events-none origin-top-left"
        style={{ width: format.w, height: format.h, transform: `scale(${scale})` }}
      >
        <SlideRenderer nodes={nodes} format={format} />
      </div>
    </div>
  );
}
