/**
 * The slide panel's Texture control (21.3).
 *
 * A texture is applied to every slide at once, because consistency across the
 * swipe is the point of it; a single slide can still be cleared on its own.
 * Each change regenerates and stores the SVG once, see backdrops.ts.
 */
import { useMemo } from "react";

import { applyTexture, DEFAULT_STRENGTH, strengthCap, TEXTURES } from "./backdrops.js";
import { listBrands, themeOf } from "./brand.js";
import type { TextureKind } from "./model.js";
import { platformById, platformForSize } from "./platforms.js";
import type { Studio } from "./useStudio.js";

export function TextureField({ studio }: { studio: Studio }) {
  const { doc, slide, index } = studio;
  const theme = useMemo(() => themeOf(doc, listBrands()), [doc]);
  const platform = studio.safePlatform ? platformById(studio.safePlatform) : platformForSize(doc.width, doc.height);
  const current = slide?.texture;
  const kind = current?.kind ?? null;
  const strength = current?.strength ?? DEFAULT_STRENGTH;
  const cap = kind ? strengthCap(kind, platform) : 1;

  const apply = (k: TextureKind | null, s: number, coalesce?: string) =>
    studio.replaceDoc(applyTexture(doc, k, s, theme, platform), coalesce);

  return (
    <div className="mb-2.5">
      <div className="mb-1 text-caption text-tertiary">Texture</div>
      <select
        aria-label="Texture"
        value={kind ?? ""}
        onChange={(e) => apply((e.target.value || null) as TextureKind | null, strength)}
        className="h-7 w-full rounded-md border border-hairline bg-surface-1 px-1.5 text-caption text-primary outline-none"
      >
        <option value="">None</option>
        {TEXTURES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      {kind ? (
        <>
          <input
            type="range"
            aria-label="Texture strength"
            min={0}
            max={100}
            value={Math.round(Math.min(strength, cap) * 100)}
            onChange={(e) => apply(kind, Math.min(cap, Number(e.target.value) / 100), "texture")}
            className="mt-1.5 w-full accent-[color:var(--accent)]"
          />
          <div className="flex items-center justify-between text-caption leading-4 text-muted">
            <span>
              {cap < 1 && platform
                ? `Up to ${Math.round(cap * 100)}% on ${platform.label}: noise costs file size.`
                : "On every slide, in your brand's colours."}
            </span>
          </div>
          <button
            type="button"
            onClick={() => studio.replaceDoc(applyTexture(doc, null, 0, theme, platform, index))}
            className="mt-1 h-7 text-caption text-tertiary hover:text-primary"
          >
            Remove from this slide
          </button>
        </>
      ) : null}
    </div>
  );
}
