/**
 * Five thousand icons, searched locally, inserted in the brand's colour (21.1).
 *
 * One style per deck by default: the picker opens on the style the deck
 * already uses, because mixing an outline set with a filled set on one
 * carousel is the most visible amateur tell. The other style is a switch away,
 * not hidden, and not side by side.
 */
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { freeRect, placementArea } from "./blockplace.js";
import { listBrands, themeOf } from "./brand.js";
import {
  deckIconStyle,
  iconLayer,
  loadIcons,
  searchIcons,
  STYLE_LABEL,
  type IconIndex,
  type IconStyle,
} from "./iconsets.js";
import { platformById, platformForSize } from "./platforms.js";
import type { Studio } from "./useStudio.js";

/** How big an icon lands. Big enough to read as a picture, not a bullet. */
const SIZE = 160;

export function IconPicker({ studio, onClose }: { studio: Studio; onClose: () => void }) {
  const { doc, slide } = studio;
  const deckStyle = deckIconStyle(doc);
  const [style, setStyle] = useState<IconStyle>(deckStyle ?? "outline");
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<IconIndex | null>(null);
  const theme = useMemo(() => themeOf(doc, listBrands()), [doc]);

  useEffect(() => {
    let live = true;
    setIndex(null);
    void loadIcons(style).then((i) => live && setIndex(i));
    return () => {
      live = false;
    };
  }, [style]);

  // Escape closes it from anywhere. Subscribed ONCE, reading the latest
  // `onClose` through a ref: the parent passes a new arrow every render, and
  // the canvas re-renders on the same Escape, so a listener keyed on it is
  // re-subscribed mid-dispatch and skipped (the BlockPicker bug, Batch 19).
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => (index ? searchIcons(query, index, 160) : []), [index, query]);

  const insert = (name: string) => {
    if (!index || !slide) return;
    const d = index.icons[name];
    if (!d) return;
    const board = { w: doc.width, h: doc.height };
    const platform = studio.safePlatform ? platformById(studio.safePlatform) : platformForSize(doc.width, doc.height);
    // Somewhere free under the headline when there is somewhere, else centred.
    const free = freeRect(slide, board, placementArea(board, platform), { w: SIZE, h: SIZE });
    const at = free ? { x: free.x, y: free.y, size: SIZE } : { x: (doc.width - SIZE) / 2, y: (doc.height - SIZE) / 2, size: SIZE };
    studio.addLayer(iconLayer(name, d, style, at, theme.accent));
    onClose();
  };

  const other: IconStyle = style === "outline" ? "filled" : "outline";

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-modal flex max-h-[80vh] w-[640px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <span className="text-title text-primary">Icons</span>
          <span className="text-caption text-muted">{STYLE_LABEL[style]}</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setStyle(other)}
            title={deckStyle && other !== deckStyle ? "This deck already uses the other style" : undefined}
            className="flex h-7 items-center rounded-lg border border-hairline px-2.5 text-caption text-tertiary hover:text-primary"
          >
            Show {STYLE_LABEL[other].toLowerCase()}
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-primary"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </header>
        <div className="p-4 pb-2">
          <label className="flex h-8 items-center gap-2 rounded-xl border border-hairline bg-surface-1 px-3">
            <Search size={13} className="text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) insert(results[0]);
              }}
              placeholder="camera, growth, check, heart…"
              className="h-7 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-muted"
            />
          </label>
          {deckStyle && style !== deckStyle ? (
            <p className="mt-2 text-caption leading-4 text-tertiary">
              This deck already uses {STYLE_LABEL[deckStyle].toLowerCase()} icons. Mixing the two reads as
              unfinished.
            </p>
          ) : null}
        </div>
        <div className="scroll-quiet min-h-[200px] flex-1 overflow-y-auto px-4 pb-4">
          {!index ? (
            <p className="py-8 text-center text-caption text-muted">Loading icons…</p>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-caption text-muted">Nothing called that. Try a plainer word.</p>
          ) : (
            <div className="grid grid-cols-10 gap-1">
              {results.map((name) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => insert(name)}
                  className="grid aspect-square place-items-center rounded-lg text-secondary hover:bg-white/[0.06] hover:text-primary"
                >
                  <svg
                    width={22}
                    height={22}
                    viewBox="0 0 24 24"
                    fill={style === "filled" ? "currentColor" : "none"}
                    stroke={style === "outline" ? "currentColor" : "none"}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={index.icons[name]} />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
        <footer className="border-t border-hairline px-5 py-2.5 text-caption text-muted">
          Tabler Icons, MIT licence. Each lands as an ordinary layer in your accent colour.
        </footer>
      </div>
    </>
  );
}
