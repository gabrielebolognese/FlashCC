/**
 * Strip view (23.1): every slide side by side with no gap, at one scale, as
 * one long canvas. The only view in which a design that runs across an edge
 * can be judged, and the one where it is made: drag any layer over a slide
 * edge and it is committed as one plain layer per slide it touches (spans.ts).
 *
 * Each slide is drawn clipped, exactly as it will export, so a seam looks here
 * the way it will look on a phone. The dashed lines between slides are this
 * view's own chrome and never reach the document.
 */
import { GalleryHorizontal, Unlink } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from "react";

import { TEXTURES } from "./backdrops.js";
import { listBrands, themeOf } from "./brand.js";
import { contains, rectOf } from "./geometry.js";
import { LayerView } from "./LayerView.js";
import { uid, type Doc, type Layer, type TextureKind } from "./model.js";
import { slidePaint } from "./paint.js";
import { addBridge, BRIDGES, panoramaDeck, stripBackground, stripTexture, type BridgeKind } from "./panorama.js";
import { platformById, platformForSize } from "./platforms.js";
import { brokenSpans, family, findLayer, moveAcross, unspan } from "./spans.js";
import type { Studio } from "./useStudio.js";

const ids = { span: () => uid("span"), layer: () => uid("l") };

type Drag = { id: string; from: { x: number; y: number }; start: Doc; moved: boolean };

export function StripCanvas({ studio, onOpenDoc }: { studio: Studio; onOpenDoc?: ((doc: Doc) => void) | undefined }) {
  const { doc, index } = studio;
  const W = doc.width;
  const H = doc.height;
  const n = doc.slides.length;

  const host = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(600);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<Doc | null>(null);
  const [panoCount, setPanoCount] = useState(3);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Tall enough to see type, short enough to see several slides at once.
  const scale = Math.max(0.12, Math.min(0.5, (height - 120) / H));
  const shown = draft ?? doc;
  const theme = useMemo(() => themeOf(doc, listBrands()), [doc]);
  const platform = studio.safePlatform ? platformById(studio.safePlatform) : platformForSize(W, H);

  const selectedId = studio.selection.length === 1 ? studio.selection[0]! : null;
  const selected = selectedId ? family(shown, selectedId) : [];
  const spanned = selected.length > 1 ? selected[0]!.layer.spanId : undefined;
  const broken = brokenSpans(doc);

  /** Pointer to strip coordinates, in artboard pixels. */
  const toStrip = (e: { clientX: number; clientY: number }) => {
    const r = board.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  /** Topmost visible layer under a strip point, on the slide the point is over. */
  const hit = (p: { x: number; y: number }): { slide: number; layer: Layer } | null => {
    const slide = Math.floor(p.x / W);
    const s = doc.slides[slide];
    if (!s) return null;
    const lx = p.x - slide * W;
    const layer = [...s.layers].reverse().find((l) => l.visible && contains(rectOf(l), lx, p.y));
    return layer ? { slide, layer } : null;
  };

  const onDown = (e: RPE<HTMLDivElement>) => {
    const p = toStrip(e);
    const found = hit(p);
    if (!found) {
      studio.setSelection([]);
      const slide = Math.floor(p.x / W);
      if (slide >= 0 && slide < n) studio.setSlideIndex(slide);
      return;
    }
    studio.setSlideIndex(found.slide);
    studio.setSelection([found.layer.id]);
    if (found.layer.locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: found.layer.id, from: p, start: doc, moved: false });
  };

  const onMove = (e: RPE<HTMLDivElement>) => {
    if (!drag) return;
    const p = toStrip(e);
    const dx = Math.round(p.x - drag.from.x);
    const dy = Math.round(p.y - drag.from.y);
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    if (!drag.moved) setDrag({ ...drag, moved: true });
    setDraft(moveAcross(drag.start, drag.id, dx, dy, ids));
  };

  const onUp = () => {
    if (drag?.moved && draft) {
      studio.replaceDoc(draft);
      // The dragged id survives every move (spans.ts), so it stays selected,
      // on whichever slide holds it now.
      const where = findLayer(draft, drag.id);
      if (where) studio.setSlideIndex(where.slide);
    }
    setDrag(null);
    setDraft(null);
  };

  // Delete removes the whole design, every piece; Escape lets go.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected.length > 0) {
        e.preventDefault();
        const gone = new Set(selected.map((p) => p.layer.id));
        studio.replaceDoc({ ...doc, slides: doc.slides.map((s) => ({ ...s, layers: s.layers.filter((l) => !gone.has(l.id)) })) });
        studio.setSelection([]);
      }
      if (e.key === "Escape") studio.setSelection([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, selected, studio]);

  const bridge = (kind: BridgeKind) => {
    const from = Math.min(index, n - 2);
    studio.replaceDoc(addBridge(doc, kind, from, theme));
  };

  const pictures = doc.media;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-sunken">
      <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-hairline px-3 text-caption">
        <GalleryHorizontal size={14} className="shrink-0 text-tertiary" />
        <span className="shrink-0 text-secondary">Strip</span>
        <span className="mx-1 h-5 w-px shrink-0 bg-hairline" />

        <span className="shrink-0 text-tertiary">Bridge after slide {Math.min(index, n - 2) + 1}</span>
        {BRIDGES.map((b) => (
          <button
            key={b.id}
            type="button"
            title={b.hint}
            disabled={n < 2}
            onClick={() => bridge(b.id)}
            className="h-7 shrink-0 rounded-md border border-hairline px-2 text-tertiary hover:text-primary disabled:opacity-40"
          >
            {b.label}
          </button>
        ))}

        <span className="mx-1 h-5 w-px shrink-0 bg-hairline" />
        <select
          aria-label="Strip texture"
          value=""
          onChange={(e) => {
            if (e.target.value) studio.replaceDoc(stripTexture(doc, e.target.value as TextureKind, 0.5, theme, platform));
          }}
          className="h-7 shrink-0 rounded-md border border-hairline bg-surface-1 px-1.5 text-primary outline-none"
        >
          <option value="">Texture across…</option>
          {TEXTURES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Picture across"
          value=""
          disabled={pictures.length === 0}
          onChange={(e) => {
            const m = pictures.find((x) => x.id === e.target.value);
            if (m) studio.replaceDoc(stripBackground(doc, { src: m.src, name: m.name, assetId: m.assetId, credit: m.credit }));
          }}
          className="h-7 shrink-0 rounded-md border border-hairline bg-surface-1 px-1.5 text-primary outline-none disabled:opacity-40"
        >
          <option value="">{pictures.length ? "Picture across…" : "Picture across (add one to Media)"}</option>
          {pictures.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        {onOpenDoc ? (
          <>
            <span className="mx-1 h-5 w-px shrink-0 bg-hairline" />
            <select
              aria-label="Panorama"
              value=""
              disabled={pictures.length === 0}
              onChange={(e) => {
                const m = pictures.find((x) => x.id === e.target.value);
                if (!m) return;
                onOpenDoc({
                  ...panoramaDeck({ src: m.src, name: m.name, assetId: m.assetId, credit: m.credit }, panoCount, theme, { w: W, h: H }),
                  ...(doc.styleId ? { styleId: doc.styleId } : {}),
                });
              }}
              className="h-7 shrink-0 rounded-md border border-hairline bg-surface-1 px-1.5 text-primary outline-none disabled:opacity-40"
            >
              <option value="">New panorama deck from…</option>
              {pictures.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Panorama slides"
              value={panoCount}
              onChange={(e) => setPanoCount(Number(e.target.value))}
              className="h-7 shrink-0 rounded-md border border-hairline bg-surface-1 px-1.5 text-primary outline-none"
            >
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => (
                <option key={k} value={k}>
                  {k} slides
                </option>
              ))}
            </select>
          </>
        ) : null}

        <div className="flex-1" />
        {spanned ? (
          <button
            type="button"
            onClick={() => studio.replaceDoc(unspan(doc, spanned))}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-hairline px-2 text-tertiary hover:text-primary"
          >
            <Unlink size={13} />
            Unspan
          </button>
        ) : null}
      </div>

      {broken.length > 0 ? (
        <div className="flex shrink-0 flex-col gap-1 border-b border-hairline bg-danger-wash px-3 py-2 text-caption text-secondary">
          {broken.map((b) => (
            <div key={b.spanId} className="flex items-center gap-2">
              <span className="flex-1">{brokenLine(b.reason, b.slides)}</span>
              <button
                type="button"
                onClick={() => studio.replaceDoc(unspan(doc, b.spanId))}
                className="h-7 rounded-md border border-hairline px-2 text-primary"
              >
                Unspan
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div ref={host} className="scroll-quiet relative min-h-0 flex-1 overflow-auto">
        <div className="relative px-10 pb-6 pt-10" style={{ width: n * W * scale + 80 }}>
          <div
            ref={board}
            className="relative shadow-slide"
            style={{ width: n * W * scale, height: H * scale, cursor: drag?.moved ? "grabbing" : "default" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {shown.slides.map((s, i) => (
              <div
                key={s.id}
                className="absolute top-0 overflow-hidden"
                style={{ left: i * W * scale, width: W * scale, height: H * scale, ...slidePaint(s) }}
              >
                <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
                  {s.layers.map((l) => (
                    <LayerView key={l.id} layer={l} />
                  ))}
                </div>
              </div>
            ))}

            {/* This view's chrome: slide numbers, the seams, the selection. */}
            {shown.slides.map((s, i) => (
              <span
                key={`n-${s.id}`}
                className={["pointer-events-none absolute -top-6 text-caption", i === index ? "text-accent" : "text-muted"].join(" ")}
                style={{ left: i * W * scale }}
              >
                {i + 1}
              </span>
            ))}
            {shown.slides.slice(1).map((s, i) => (
              <div
                key={`e-${s.id}`}
                className="pointer-events-none absolute top-0 border-l border-dashed border-white/[0.35]"
                style={{ left: (i + 1) * W * scale, height: H * scale }}
              />
            ))}
            {selected.map((p) => (
              <div
                key={`sel-${p.layer.id}`}
                className="pointer-events-none absolute border border-accent"
                style={{
                  left: (p.slide * W + p.layer.x) * scale,
                  top: p.layer.y * scale,
                  width: p.layer.w * scale,
                  height: p.layer.h * scale,
                  // A piece's outline is clipped to its own slide, as the piece is.
                  clipPath: `inset(0 ${Math.max(0, (p.slide * W + p.layer.x + p.layer.w - (p.slide + 1) * W) * scale)}px 0 ${Math.max(0, (p.slide * W - (p.slide * W + p.layer.x)) * scale)}px)`,
                }}
              />
            ))}
          </div>
          <p className="mt-3 text-caption text-muted">
            Drag anything over an edge: each slide keeps its own piece, and the pieces move together here.
            {spanned ? ` Selected: one design on ${selected.length} slides.` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function brokenLine(reason: "apart" | "offset" | "missing", slides: number[]): string {
  const list = slides.map((s) => s + 1).join(", ");
  if (reason === "apart") return `A design across slides ${list} is no longer on neighbouring slides, so its seam is gone.`;
  if (reason === "offset") return `The pieces of a design across slides ${list} were moved apart, so they no longer meet at the edge.`;
  return `A design across slides ${list} reaches a slide that has no piece of it.`;
}
