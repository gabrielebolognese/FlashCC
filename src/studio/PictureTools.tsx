/**
 * The image panel (21.4): focal point, shape mask, filter, replace, and the
 * text scrim. Each control writes one property onto the layer, once.
 */
import { Crosshair, Replace } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { listBrands, themeOf } from "./brand.js";
import { CutoutButton } from "./CutoutButton.js";
import { duotoneOf, FILTERS, focalFromClick, MASKS, withScrim } from "./imagetools.js";
import type { ImageFilter, ImageMask, Layer } from "./model.js";
import type { Studio } from "./useStudio.js";

const chip = (on: boolean) =>
  [
    "h-7 rounded-md border px-1.5 text-caption",
    on ? "border-accent text-accent" : "border-hairline text-tertiary hover:text-primary",
  ].join(" ");

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 text-caption text-tertiary">{label}</div>
      {children}
    </div>
  );
}

export function PictureTools({ studio, layer }: { studio: Studio; layer: Layer }) {
  const [replacing, setReplacing] = useState(false);
  const theme = useMemo(() => themeOf(studio.doc, listBrands()), [studio.doc]);
  const set = (patch: Partial<Layer>) => studio.updateLayers([layer.id], patch);
  const focal = layer.focal ?? { x: 0.5, y: 0.5 };

  const setMask = (mask: ImageMask | undefined) => set({ mask });
  const setFilter = (kind: ImageFilter["kind"] | undefined) =>
    set({ filter: !kind ? undefined : kind === "duotone" ? duotoneOf(theme) : { kind } });

  return (
    <>
      <Row label="Focal point">
        <div className="relative cursor-crosshair overflow-hidden rounded-md border border-hairline">
          <img
            src={layer.src}
            alt=""
            draggable={false}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              set({ focal: focalFromClick({ x: e.clientX, y: e.clientY }, r) });
            }}
            className="block h-auto w-full"
          />
          <span
            className="pointer-events-none absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-black/40 text-white"
            style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
          >
            <Crosshair size={10} strokeWidth={2.5} />
          </span>
        </div>
        <p className="mt-1 text-caption leading-4 text-muted">Click the subject. Every crop keeps it in frame.</p>
      </Row>

      <Row label="Shape">
        <div className="grid grid-cols-3 gap-1">
          <button type="button" onClick={() => setMask(undefined)} className={chip(!layer.mask)}>
            None
          </button>
          {MASKS.map((m) => (
            <button key={m.id} type="button" onClick={() => setMask(m.id)} className={chip(layer.mask === m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Filter">
        <select
          aria-label="Filter"
          value={layer.filter?.kind ?? ""}
          onChange={(e) => setFilter((e.target.value || undefined) as ImageFilter["kind"] | undefined)}
          className="h-7 w-full rounded-md border border-hairline bg-surface-1 px-1.5 text-caption text-primary outline-none"
        >
          <option value="">None</option>
          {FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
              {f.id === "duotone" ? " (brand colours)" : ""}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Picture">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setReplacing((v) => !v)}
            className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-hairline text-caption text-secondary hover:border-accent-dim hover:text-accent"
          >
            <Replace size={13} strokeWidth={2} />
            Replace image
          </button>
          <CutoutButton studio={studio} layer={layer} />
        </div>
        {replacing ? (
          studio.doc.media.length === 0 ? (
            <p className="mt-1.5 text-caption leading-4 text-muted">Add a picture to Media first, then pick it here.</p>
          ) : (
            <div className="mt-1.5 grid grid-cols-4 gap-1">
              {studio.doc.media.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.name}
                  onClick={() => {
                    studio.fillWithMedia(layer.id, m);
                    setReplacing(false);
                  }}
                  className={[
                    "h-10 overflow-hidden rounded-md border-2",
                    m.src === layer.src ? "border-accent" : "border-hairline hover:border-surface-5",
                  ].join(" ")}
                >
                  <img src={m.src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )
        ) : null}
        <p className="mt-1 text-caption leading-4 text-muted">Keeps the frame, shape, filter and focal point.</p>
      </Row>
    </>
  );
}

/**
 * Offered on a text layer when the slide has a picture to be unreadable
 * against. Places one gradient layer directly underneath the words.
 */
export function TextScrimField({ studio, layer }: { studio: Studio; layer: Layer }) {
  const { slide, doc, index } = studio;
  if (!slide) return null;
  const overPicture = Boolean(slide.image?.src) || slide.layers.some((l) => l.kind === "image" && l.src);
  if (!overPicture) return null;
  return (
    <Row label="Over a picture">
      <button
        type="button"
        onClick={() => {
          const layers = withScrim(slide.layers, layer.id, { w: doc.width, h: doc.height });
          if (!layers) return;
          studio.replaceDoc({ ...doc, slides: doc.slides.map((s, i) => (i === index ? { ...s, layers } : s)) });
        }}
        className="flex h-7 w-full items-center justify-center rounded-md border border-hairline text-caption text-secondary hover:border-accent-dim hover:text-accent"
      >
        Add a scrim behind this text
      </button>
    </Row>
  );
}
