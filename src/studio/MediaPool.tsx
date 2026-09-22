import { ImagePlus, Library as LibraryIcon, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { assetToMedia, filterAssets, listAssets, type Asset } from "./assets.js";
import { importImages, urlFor } from "./library.js";
import { ACCEPT, formatBytes, MAX_POOL, poolBytes } from "./media.js";
import type { Studio } from "./useStudio.js";

export const MEDIA_DRAG_TYPE = "application/x-flashcc-media";

/**
 * The pool. Upload once, drag onto any placeholder on any slide.
 *
 * Items are shared across the whole project, which is why they live on the
 * document — but the FILE no longer does. Since the asset library, an upload
 * goes into the account's library and the pool holds a reference to it, so the
 * same logo dropped into twenty carousels is one object rather than twenty
 * copies. "From library" is the other half of that: a picture you uploaded last
 * month is two clicks away instead of a trip to your downloads folder.
 */
export function MediaPool({ studio }: { studio: Studio }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);

  const media = studio.doc.media;
  const full = media.length >= MAX_POOL;

  // Re-read when the drawer opens: an upload made elsewhere in this session has
  // to show up without a reload.
  const shelf = useMemo(() => {
    if (!browsing) return [];
    const inPool = new Set(media.map((m) => m.assetId ?? m.id));
    return filterAssets(listAssets(), { kind: "image" }).filter((a) => !inPool.has(a.id));
  }, [browsing, media]);

  const add = (assets: readonly Asset[]) => {
    const room = Math.max(0, MAX_POOL - media.length);
    const items = assets
      .slice(0, room)
      .flatMap((a) => {
        const url = urlFor(a);
        return url ? [assetToMedia(a, url)] : [];
      });
    if (items.length > 0) studio.addMedia(items);
  };

  async function take(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importImages(Array.from(files));
      add(result.assets);
      setError(result.error ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-hairline">
      <div className="flex h-9 shrink-0 items-center justify-between px-3">
        <span className="text-overline uppercase text-tertiary">Media</span>
        <span className="text-caption text-muted">
          {media.length > 0 ? formatBytes(poolBytes(media)) : ""}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files);
        }}
        className={[
          "scroll-quiet min-h-0 flex-1 overflow-y-auto p-2",
          over ? "bg-accent-wash" : "",
        ].join(" ")}
      >
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            void take(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="mb-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={busy || full}
            onClick={() => input.current?.click()}
            className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline text-caption text-tertiary hover:border-accent-dim hover:text-accent disabled:opacity-40"
          >
            <ImagePlus size={14} strokeWidth={2} />
            {busy ? "Adding…" : full ? "Pool full" : "Add"}
          </button>
          <button
            type="button"
            disabled={full}
            onClick={() => setBrowsing((b) => !b)}
            className={[
              "flex h-9 items-center justify-center gap-1.5 rounded-xl border text-caption disabled:opacity-40",
              browsing
                ? "border-accent-dim bg-accent-wash text-accent"
                : "border-hairline text-tertiary hover:border-accent-dim hover:text-accent",
            ].join(" ")}
          >
            <LibraryIcon size={14} strokeWidth={2} />
            Library
          </button>
        </div>

        {error ? (
          <p className="mb-2 rounded-xl border border-danger-dim bg-danger-wash px-2.5 py-2 text-caption leading-4 text-secondary">
            {error}
          </p>
        ) : null}

        {browsing ? (
          shelf.length === 0 ? (
            <p className="mb-2 px-1 text-caption leading-[16px] text-muted">
              Nothing in your library that is not already here. Anything you upload is kept.
            </p>
          ) : (
            <div className="mb-3 grid grid-cols-3 gap-1.5 border-b border-hairline pb-3">
              {shelf.map((a) => {
                const url = urlFor(a);
                return (
                  <button
                    key={a.id}
                    type="button"
                    title={a.name}
                    onClick={() => add([a])}
                    className="aspect-square overflow-hidden rounded-lg border border-hairline hover:border-accent-dim"
                  >
                    {url ? (
                      <img src={url} alt={a.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-caption text-muted">
                        …
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )
        ) : null}

        {media.length === 0 ? (
          <p className="px-1 text-caption leading-[16px] text-muted">
            Drop files here, then drag one onto a dotted placeholder on the slide.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {media.map((m) => (
              <div key={m.id} className="group relative">
                <img
                  src={m.src}
                  alt={m.name}
                  title={m.name}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(MEDIA_DRAG_TYPE, m.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="aspect-square w-full cursor-grab rounded-lg border border-hairline object-cover active:cursor-grabbing"
                />
                <button
                  type="button"
                  aria-label={`Remove ${m.name}`}
                  onClick={() => studio.removeMedia(m.id)}
                  className="absolute right-1 top-1 hidden h-5 w-5 place-items-center rounded-md bg-black/70 text-white/80 hover:text-danger group-hover:grid"
                >
                  <Trash2 size={10} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
