/**
 * Searching Unsplash and Pexels from inside the editor (21.2).
 *
 * Each result shows its photographer and its source, linked, which is what
 * the providers' guidelines ask of any app that shows their photos. Choosing
 * one puts it in the project's pool and on this device's library shelf with
 * its credit beside it, and tells the provider it was used.
 */
import { Check, Image as ImageIcon, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { listAssets, upsertAsset } from "./assets.js";
import {
  markUsed,
  searchStock,
  STOCK_LABEL,
  stockAsset,
  stockMedia,
  stockProviders,
  type StockPhoto,
  type StockProvider,
} from "./stock.js";
import type { Studio } from "./useStudio.js";

export function StockPicker({ studio, onClose }: { studio: Studio; onClose: () => void }) {
  const [providers, setProviders] = useState<StockProvider[] | null>(null);
  const [provider, setProvider] = useState<StockProvider>("unsplash");
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<StockPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    void stockProviders().then((p) => {
      setProviders(p);
      if (p[0]) setProvider(p[0]);
    });
  }, []);

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

  const run = async (from: number, using = provider) => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await searchStock(using, query, from);
      setPhotos((all) => (from === 1 ? r.photos : [...all, ...r.photos]));
      setPage(r.page);
      setMore(r.more);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  const choose = (photo: StockPhoto) => {
    if (picked.has(photo.id)) return;
    studio.addMedia([stockMedia(photo)]);
    if (!listAssets().some((a) => a.key === photo.id)) upsertAsset(stockAsset(photo));
    markUsed(photo);
    setPicked((s) => new Set(s).add(photo.id));
  };

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-modal flex max-h-[84vh] w-[720px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <ImageIcon size={15} className="text-tertiary" />
          <span className="text-title text-primary">Stock photos</span>
          <div className="flex-1" />
          {(providers ?? []).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={provider === p}
              onClick={() => {
                setProvider(p);
                setPhotos([]);
                void run(1, p);
              }}
              className={[
                "h-7 rounded-lg px-2.5 text-caption",
                provider === p ? "bg-accent-wash text-accent" : "text-tertiary hover:text-primary",
              ].join(" ")}
            >
              {STOCK_LABEL[p]}
            </button>
          ))}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-primary"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </header>

        {providers && providers.length === 0 ? (
          <p className="p-5 text-body leading-5 text-secondary">
            Stock search needs an Unsplash or Pexels key on the server (UNSPLASH_ACCESS_KEY or PEXELS_API_KEY in
            .env). Both are free. Until then, upload your own pictures with Add.
          </p>
        ) : (
          <div className="scroll-quiet flex-1 overflow-y-auto p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(1);
              }}
              className="flex h-8 items-center gap-2 rounded-xl border border-hairline bg-surface-1 px-3"
            >
              <Search size={13} className="text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${STOCK_LABEL[provider]}, e.g. desk`}
                className="h-7 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-muted"
              />
            </form>

            {error ? <p className="mt-3 text-caption leading-4 text-danger">{error}</p> : null}

            <div className="mt-3 grid grid-cols-4 gap-2">
              {photos.map((p) => (
                <figure key={p.id} className="flex flex-col gap-1">
                  <button
                    type="button"
                    title={p.alt || "Add to this project"}
                    onClick={() => choose(p)}
                    style={{ background: p.colour }}
                    className="relative aspect-[4/5] overflow-hidden rounded-lg border border-hairline hover:border-accent-dim"
                  >
                    <img src={p.thumb} alt={p.alt} loading="lazy" className="h-full w-full object-cover" />
                    {picked.has(p.id) ? (
                      <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-md bg-black/70 text-accent">
                        <Check size={12} strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </button>
                  <figcaption className="truncate text-[11px] leading-4 text-muted">
                    <a href={p.credit.url} target="_blank" rel="noreferrer" className="hover:text-primary">
                      {p.credit.name}
                    </a>{" "}
                    on{" "}
                    <a href={p.credit.page} target="_blank" rel="noreferrer" className="hover:text-primary">
                      {STOCK_LABEL[p.provider]}
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>

            {more ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(page + 1)}
                className="mx-auto mt-3 flex h-7 items-center rounded-lg border border-hairline px-3 text-caption text-secondary hover:text-primary disabled:opacity-50"
              >
                {busy ? "Loading…" : "More"}
              </button>
            ) : busy ? (
              <p className="mt-3 text-center text-caption text-muted">Searching…</p>
            ) : null}
          </div>
        )}

        <footer className="flex h-12 shrink-0 items-center border-t border-hairline px-5 text-caption leading-4 text-muted">
          Chosen photos go in this project's media with their credit, and the credit is added to the first
          comment when they are on a slide.
        </footer>
      </div>
    </>
  );
}
