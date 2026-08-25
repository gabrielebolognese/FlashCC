import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { ACCEPT, formatBytes, importFiles, MAX_POOL, poolBytes } from "./media.js";
import type { Studio } from "./useStudio.js";

export const MEDIA_DRAG_TYPE = "application/x-flashcc-media";

/**
 * The pool. Upload once, drag onto any placeholder on any slide. Items are shared
 * across the whole project, which is why they live on the document rather than a slide.
 */
export function MediaPool({ studio }: { studio: Studio }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const media = studio.doc.media;
  const full = media.length >= MAX_POOL;

  async function take(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const room = Math.max(0, MAX_POOL - media.length);
      studio.addMedia(await importFiles(Array.from(files).slice(0, room)));
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

        <button
          type="button"
          disabled={busy || full}
          onClick={() => input.current?.click()}
          className="mb-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline text-caption text-tertiary hover:border-accent-dim hover:text-accent disabled:opacity-40"
        >
          <ImagePlus size={14} strokeWidth={2} />
          {busy ? "Adding…" : full ? `Pool full (${MAX_POOL})` : "Add images"}
        </button>

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
