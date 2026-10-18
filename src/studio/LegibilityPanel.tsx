/**
 * Legibility (Batch 30): can the words be seen, at the size and by the eyes
 * that will see them?
 *
 * Contrast first, because it is the one with fixes: each finding offers, in
 * order, a scrim, the nearest of the deck's colour roles that passes, and a
 * move to where the picture passes, each worked out from the rendered pixels
 * and checked again once applied. Then the slide at phone size, the cover at
 * profile-tile size, the canvas seen with each colour-vision deficiency, and
 * the slides too dense to read at swipe speed.
 *
 * Nothing here is a score and nothing blocks an export.
 */
import { Eye, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { listBrands, themeOf } from "./brand.js";
import { scanContrast } from "./contrastscan.js";
import type { Grid } from "./contrastgrid.js";
import { Chip, Segmented } from "./Dash.js";
import { Cropped } from "./GridPreview.js";
import {
  applyRole,
  colourOnly,
  coverAtTile,
  denseSlides,
  feedScale,
  FEED_MIN_PX,
  FEED_WIDTH,
  flatContrast,
  GRID_PLATFORMS,
  moveFix,
  pixelContrast,
  roleFix,
  scrimFix,
  slidesNeedingPixels,
  smallOnPhone,
  TILE,
  TILE_MIN_PX,
  VISIONS,
  type ContrastIssue,
  type Vision,
} from "./legibility.js";
import type { Doc } from "./model.js";
import { platformById, platformForSize, PLATFORMS, safeBox, type PlatformId } from "./platforms.js";
import { SlidePreview } from "./SlidePreview.js";
import type { Studio } from "./useStudio.js";
import { VisionFilters, visionFilter } from "./VisionFilters.js";

const fmt = (n: number): string => (Math.round(n * 10) / 10).toString();

type Scan = { state: "idle" | "working" | "done" | "failed"; grids: (Grid | null)[]; error?: string | undefined };

export function LegibilityPanel({ studio, onClose }: { studio: Studio; onClose: () => void }) {
  const { doc } = studio;
  const [platformId, setPlatformId] = useState<PlatformId>(
    () => studio.safePlatform ?? ((platformForSize(doc.width, doc.height)?.id as PlatformId | undefined) ?? "instagram"),
  );
  const platform = platformById(platformId);
  const scale = feedScale(doc, platform);
  const theme = themeOf(doc, listBrands());
  const roles = [
    { name: "Text", hex: theme.fg },
    { name: "Background", hex: theme.bg },
    { name: "Accent", hex: theme.accent },
    { name: "Muted", hex: theme.muted },
  ];

  const [scan, setScan] = useState<Scan>({ state: "idle", grids: [] });
  const [phoneAt, setPhoneAt] = useState(studio.index);

  // The pixels behind the words, for the slides that need them, every time the deck changes.
  const needs = slidesNeedingPixels(doc).length > 0;
  useEffect(() => {
    if (!needs) {
      setScan({ state: "done", grids: [] });
      return;
    }
    const ctl = new AbortController();
    setScan((s) => ({ ...s, state: "working" }));
    const t = window.setTimeout(() => {
      scanContrast(doc, ctl.signal)
        .then((grids) => setScan({ state: "done", grids }))
        .catch((e: unknown) => {
          if (!ctl.signal.aborted) setScan({ state: "failed", grids: [], error: e instanceof Error ? e.message : "The check did not run" });
        });
    }, 250);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [doc, needs]);

  const issues: ContrastIssue[] = useMemo(
    () => [...flatContrast(doc, scale), ...pixelContrast(doc, scan.grids, scale)].sort((a, b) => a.slide - b.slide),
    [doc, scale, scan.grids],
  );
  const small = useMemo(() => smallOnPhone(doc, platform), [doc, platform]);
  const cover = coverAtTile(doc);
  const colour = useMemo(() => colourOnly(doc), [doc]);
  const dense = useMemo(() => denseSlides(doc), [doc]);
  const phoneSlide = doc.slides[Math.min(phoneAt, doc.slides.length - 1)];

  const apply = (next: Doc | null, label: string) => {
    if (next) studio.replaceDoc(next, undefined, label);
  };

  const goTo = (i: number) => {
    studio.setSlideIndex(i);
    setPhoneAt(i);
  };

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Legibility"
        className="fixed left-1/2 top-1/2 z-modal flex max-h-[88vh] w-[880px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
      >
        <VisionFilters />
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <Eye size={14} strokeWidth={2} className="text-tertiary" />
          <span className="flex-1 text-title text-primary">Legibility</span>
          <label className="flex items-center gap-1.5 text-caption text-tertiary">
            Judged for
            <select
              aria-label="Judged for"
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value as PlatformId)}
              className="h-7 rounded-md border border-edge bg-surface-1 px-1.5 text-body text-primary"
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            on a {FEED_WIDTH}px phone
          </label>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:text-primary">
            <X size={14} strokeWidth={2} />
          </button>
        </header>

        <div className="scroll-quiet flex min-h-0 flex-1 gap-5 overflow-y-auto p-5">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <section>
              <h3 className="text-overline uppercase text-tertiary">Text against what is behind it</h3>
              <p className="mt-1 text-caption leading-4 text-muted">
                4.5:1 for body text, 3:1 for large, at the size a phone shows it. Over a picture, the worst spot behind the letters counts, not the average.
                {scan.state === "working" ? " Checking the pictures…" : ""}
                {scan.state === "failed" ? ` ${scan.error}` : ""}
              </p>
              {issues.length === 0 ? (
                <p className="mt-2 text-body text-secondary" data-testid="contrast-clear">
                  {scan.state === "working" ? "Nothing yet on the flat slides." : "Every line reads against what is behind it."}
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2" data-testid="contrast-issues">
                  {issues.map((c) => {
                    const slide = doc.slides[c.slide]!;
                    const layer = slide.layers.find((l) => l.id === c.layerId)!;
                    const grid = scan.grids[c.slide] ?? null;
                    const scrim = !c.flat && grid ? scrimFix(doc, c.slide, c.layerId, grid, scale) : null;
                    const role = roleFix(slide, layer, grid, roles.map((r) => r.hex), scale);
                    const roleName = roles.find((r) => r.hex.toLowerCase() === role)?.name;
                    const moved = !c.flat && grid ? moveFix(doc, c.slide, c.layerId, grid, safeBox(platform, doc.width, doc.height), scale) : null;
                    return (
                      <li key={`${c.slide}-${c.layerId}`} className="rounded-xl border border-hairline bg-surface-1 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => goTo(c.slide)} className="text-caption text-tertiary hover:text-primary">
                            Slide {c.slide + 1}
                          </button>
                          <span className="min-w-0 flex-1 truncate text-body text-primary">&ldquo;{c.name}&rdquo;</span>
                          <Chip tone="danger">
                            {fmt(c.ratio)}:1, needs {c.need}:1
                          </Chip>
                          <span className="text-caption text-muted">{c.flat ? "flat colour" : "over a picture"}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {scrim ? (
                            <button type="button" onClick={() => apply(scrim, "Scrim behind text")} className="flex h-7 items-center rounded-md border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent">
                              Add a scrim behind it
                            </button>
                          ) : null}
                          {role ? (
                            <button
                              type="button"
                              onClick={() => apply(applyRole(doc, c.slide, c.layerId, role), "Text colour")}
                              className="flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent"
                            >
                              <span className="h-3 w-3 rounded-full border border-hairline" style={{ background: role }} />
                              Use the {roleName?.toLowerCase() ?? ""} colour
                            </button>
                          ) : null}
                          {moved ? (
                            <button type="button" onClick={() => apply(moved, "Move to where it reads")} className="flex h-7 items-center rounded-md border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent">
                              Move it to where it reads
                            </button>
                          ) : null}
                          {!scrim && !role && !moved ? <span className="text-caption text-muted">No one-click fix. Change the colour or what is behind it.</span> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-overline uppercase text-tertiary">At the size it is seen</h3>
              {small.length === 0 ? (
                <p className="mt-1 text-body text-secondary">No copy under {FEED_MIN_PX}px on a phone.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1" data-testid="small-text">
                  {small.map((s) => (
                    <li key={s.slide} className="text-caption text-secondary">
                      <button type="button" onClick={() => goTo(s.slide)} className="text-tertiary hover:text-primary">
                        Slide {s.slide + 1}
                      </button>
                      : &ldquo;{s.name}&rdquo; shows at about {fmt(s.px)}px.
                    </li>
                  ))}
                </ul>
              )}
              {GRID_PLATFORMS.has(platform.id) && cover ? (
                <p className="mt-1 text-caption text-secondary" data-testid="tile-verdict">
                  The cover&rsquo;s headline is about {fmt(cover.px)}px in the profile grid
                  {cover.px < TILE_MIN_PX ? `: under ${TILE_MIN_PX}px, it does not read as a headline there.` : ", which reads."}
                </p>
              ) : null}
            </section>

            <section>
              <h3 className="text-overline uppercase text-tertiary">Colour vision</h3>
              <div className="mt-2">
                <Segmented<Vision | "none">
                  options={[{ id: "none", label: "Typical" }, ...VISIONS.map((v) => ({ id: v.id, label: v.label }))]}
                  value={studio.vision ?? "none"}
                  onChange={(v) => studio.setVision(v === "none" ? null : v)}
                />
              </div>
              <p className="mt-1.5 text-caption leading-4 text-muted">
                {studio.vision ? `${VISIONS.find((v) => v.id === studio.vision)!.note}. The canvas shows it too, until you set it back.` : "Shows the canvas and the phone preview as someone with each kind sees them."}
              </p>
              {colour.length ? (
                <ul className="mt-1 flex flex-col gap-1" data-testid="colour-only">
                  {colour.map((c) => (
                    <li key={c.slide} className="text-caption text-secondary">
                      Slide {c.slide + 1}: &ldquo;{c.a}&rdquo; and &ldquo;{c.b}&rdquo; differ only by colour. Label them.
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-body text-secondary">No slide carries its meaning by colour alone.</p>
              )}
            </section>

            <section>
              <h3 className="text-overline uppercase text-tertiary">Density</h3>
              {dense.length ? (
                <ul className="mt-1 flex flex-col gap-1" data-testid="dense">
                  {dense.map((d) => (
                    <li key={d.slide} className="text-caption text-secondary">
                      Slide {d.slide + 1}: {d.words} words, over about {d.ceiling} for this shape. Give it another slide.
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-body text-secondary">Every slide reads at swipe speed.</p>
              )}
            </section>
          </div>

          <aside className="flex w-[380px] shrink-0 flex-col items-center gap-4">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="flex-1 text-caption text-tertiary">On a phone, {FEED_WIDTH}px wide</span>
                <button type="button" aria-label="Previous slide" disabled={phoneAt <= 0} onClick={() => setPhoneAt((i) => i - 1)} className="h-7 rounded-md px-2 text-caption text-secondary disabled:opacity-30">
                  ‹
                </button>
                <span className="text-caption text-muted">
                  {Math.min(phoneAt, doc.slides.length - 1) + 1} / {doc.slides.length}
                </span>
                <button type="button" aria-label="Next slide" disabled={phoneAt >= doc.slides.length - 1} onClick={() => setPhoneAt((i) => i + 1)} className="h-7 rounded-md px-2 text-caption text-secondary disabled:opacity-30">
                  ›
                </button>
              </div>
              <div className="rounded-[28px] border-4 border-black bg-black p-0" data-testid="phone-preview" style={{ width: FEED_WIDTH * scale * (doc.width / FEED_WIDTH) + 8 }}>
                <div style={{ width: doc.width * scale, filter: visionFilter(studio.vision) }} className="overflow-hidden rounded-[24px]">
                  <SlidePreview slide={phoneSlide} w={doc.width} h={doc.height} />
                </div>
              </div>
            </div>
            {GRID_PLATFORMS.has(platform.id) ? (
              <div>
                <span className="mb-1.5 block text-caption text-tertiary">
                  In the profile grid, {TILE.w}px tiles
                </span>
                <div className="grid grid-cols-3 gap-0.5" style={{ width: TILE.w * 3 + 4, filter: visionFilter(studio.vision) }} data-testid="tile-preview">
                  <div className="outline outline-2 outline-accent">
                    <Cropped slide={doc.slides[0]} w={doc.width} h={doc.height} />
                  </div>
                  <div className="aspect-[3/4] bg-surface-1" />
                  <div className="aspect-[3/4] bg-surface-1" />
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}
