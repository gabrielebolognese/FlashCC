/**
 * The library screen.
 *
 * Named `AssetLibrary` rather than `Library` because `library.ts` already exists
 * beside it, and on a case-insensitive filesystem TypeScript refuses to hold
 * both — the same trap `Analytics.tsx` and `insights.ts` hit.
 *
 * The complaint this answers is remarkably consistent across the whole market:
 * *"I wish the Media Library for my clients would retain the images I upload"*
 * (Sendible), *"I wish there was a way to organize media files"* (Loomly),
 * *"doesn't currently offer the ability to add your own logo within the
 * platform"* (ContentStudio). Retention and folders. That is the entire ask, and
 * it has gone unanswered long enough to be the reason people leave.
 *
 * So the screen is deliberately plain: upload, one folder per picture, search,
 * delete. No tags, no collections, no nesting. A second organising axis is the
 * kind of thing that feels generous while it is being built and that nobody
 * files anything into afterwards.
 */
import { FolderOpen, ImagePlus, Search, Trash2, Type, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  filterAssets,
  foldersOf,
  folderOf,
  libraryBytes,
  listAssets,
  UNFILED,
  type Asset,
  type AssetKind,
} from "./assets.js";
import { Empty } from "./Dash.js";
import { listBrands } from "./brand.js";
import { importImages, removeLibraryAsset, renameAsset, urlFor } from "./library.js";
import { ACCEPT, formatBytes } from "./media.js";
import { hasCloudSession } from "./session.js";

const field =
  "h-8 w-full rounded-xl border border-hairline bg-surface-1 px-2.5 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim";

/** Which brands point at this file, so deleting it is an informed decision. */
function usedByBrands(id: string): string[] {
  return listBrands()
    .filter((b) => Object.values(b.logos ?? {}).includes(id))
    .map((b) => b.name);
}

export function AssetLibrary() {
  const input = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<Asset[]>(() => listAssets());
  const [kind, setKind] = useState<AssetKind>("image");
  const [folder, setFolder] = useState<string | undefined>(undefined);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const cloud = hasCloudSession();
  const ofKind = useMemo(() => assets.filter((a) => a.kind === kind), [assets, kind]);
  const folders = useMemo(() => foldersOf(ofKind), [ofKind]);
  const shown = useMemo(
    () => filterAssets(ofKind, { ...(folder ? { folder } : {}), ...(text ? { text } : {}) }),
    [ofKind, folder, text],
  );
  const current = shown.find((a) => a.id === selected) ?? null;

  async function take(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importImages(Array.from(files), folder ? { folder } : {});
      setAssets(listAssets());
      setError(result.error ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
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
      className={over ? "rounded-2xl outline outline-1 outline-accent-dim" : ""}
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

      {/* ── controls ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex h-8 items-center rounded-xl border border-hairline bg-surface-1 p-0.5">
          {(["image", "font"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setFolder(undefined);
                setSelected(null);
              }}
              className={[
                "flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-caption",
                kind === k ? "bg-accent-wash text-accent" : "text-tertiary hover:text-primary",
              ].join(" ")}
            >
              {k === "image" ? <ImagePlus size={13} strokeWidth={2} /> : <Type size={13} strokeWidth={2} />}
              {k === "image" ? "Images" : "Fonts"}
            </button>
          ))}
        </div>

        <label className="relative flex h-8 w-[220px] items-center">
          <Search size={13} strokeWidth={2} className="absolute left-2.5 text-muted" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search by name or folder"
            className={`${field} pl-7`}
          />
        </label>

        <div className="flex-1" />

        <span className="text-caption text-muted">
          {ofKind.length} file{ofKind.length === 1 ? "" : "s"} · {formatBytes(libraryBytes(ofKind))}
        </span>

        {kind === "image" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className="flex h-8 items-center gap-1.5 rounded-xl px-3.5 text-body-strong hover:brightness-110 disabled:opacity-60"
          >
            <ImagePlus size={14} strokeWidth={2.4} />
            {busy ? "Uploading…" : "Upload"}
          </button>
        ) : null}
      </div>

      {!cloud ? (
        <p className="mb-4 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-2.5 text-body leading-5 text-tertiary">
          Signed out, your library lives in this browser and has room for a few megabytes. Sign in
          and every file moves to your account — once, not once per carousel — and follows you to
          every device.
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-2xl border border-danger-dim bg-danger-wash px-3.5 py-2.5 text-body text-danger">
          {error}
        </p>
      ) : null}

      {folders.length > 1 || folder ? (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFolder(undefined)}
            className={[
              "flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-caption",
              folder === undefined
                ? "border-accent-dim bg-accent-wash text-accent"
                : "border-hairline text-tertiary hover:text-primary",
            ].join(" ")}
          >
            All
          </button>
          {folders.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFolder(f)}
              className={[
                "flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-caption",
                folder === f
                  ? "border-accent-dim bg-accent-wash text-accent"
                  : "border-hairline text-tertiary hover:text-primary",
              ].join(" ")}
            >
              <FolderOpen size={12} strokeWidth={2} />
              {f}
            </button>
          ))}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <Empty
          icon={kind === "image" ? ImagePlus : Type}
          title={kind === "image" ? "Nothing in the library yet" : "No uploaded fonts"}
          body={
            kind === "image"
              ? "Upload a logo, a headshot, a product shot. It is kept, so the next carousel starts with it already here instead of in your downloads folder."
              : "Fonts you upload anywhere in the app are kept here. Add one from the style picker or a brand."
          }
          action={
            kind === "image" ? (
              <button
                type="button"
                onClick={() => input.current?.click()}
                style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                className="flex h-8 items-center rounded-xl px-3.5 text-body-strong hover:brightness-110"
              >
                Upload one
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {shown.map((a) => (
            <Tile key={a.id} asset={a} onOpen={() => setSelected(a.id)} />
          ))}
        </div>
      )}

      {current ? (
        <Details
          asset={current}
          onClose={() => setSelected(null)}
          onChange={(patch) => setAssets(renameAsset(current.id, patch))}
          onDelete={() => {
            void removeLibraryAsset(current.id).then(setAssets);
            setSelected(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Tile({ asset, onOpen }: { asset: Asset; onOpen: () => void }) {
  const url = urlFor(asset);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="overflow-hidden rounded-2xl border border-hairline bg-surface-1 text-left hover:border-accent-dim"
    >
      <div className="grid aspect-square place-items-center bg-surface-2">
        {asset.kind === "font" ? (
          <span
            className="text-[26px] text-primary"
            style={asset.family ? { fontFamily: `"${asset.family}", sans-serif` } : undefined}
          >
            Aa
          </span>
        ) : url ? (
          <img src={url} alt={asset.name} className="h-full w-full object-contain" />
        ) : (
          <span className="text-caption text-muted">Not available offline</span>
        )}
      </div>
      <div className="p-2.5">
        <div className="truncate text-body text-primary">{asset.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
          <span>{formatBytes(asset.bytes)}</span>
          {asset.w && asset.h ? (
            <span>
              · {asset.w}×{asset.h}
            </span>
          ) : null}
          {asset.path === "" ? <span className="text-tertiary">· on this device</span> : null}
        </div>
      </div>
    </button>
  );
}

function Details({
  asset,
  onClose,
  onChange,
  onDelete,
}: {
  asset: Asset;
  onClose: () => void;
  onChange: (patch: Partial<Pick<Asset, "name" | "folder">>) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const url = urlFor(asset);
  const brands = usedByBrands(asset.id);

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <span className="truncate text-title text-primary">{asset.name}</span>
          <div className="flex-1" />
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-primary"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </header>

        <div className="scroll-quiet flex-1 overflow-y-auto p-5">
          <div className="grid aspect-video place-items-center overflow-hidden rounded-2xl border border-hairline bg-surface-1">
            {asset.kind === "font" ? (
              <span
                className="text-[34px] text-primary"
                style={asset.family ? { fontFamily: `"${asset.family}", sans-serif` } : undefined}
              >
                Handgloves
              </span>
            ) : url ? (
              <img src={url} alt={asset.name} className="h-full w-full object-contain" />
            ) : (
              <span className="text-body text-muted">Not available offline</span>
            )}
          </div>

          <label className="mt-4 block">
            <span className="text-overline uppercase text-tertiary">Name</span>
            <input
              value={asset.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className={`${field} mt-1.5`}
            />
          </label>

          <label className="mt-3 block">
            <span className="text-overline uppercase text-tertiary">Folder</span>
            <input
              value={asset.folder ?? ""}
              onChange={(e) => onChange({ folder: e.target.value || undefined })}
              placeholder={UNFILED}
              className={`${field} mt-1.5`}
            />
            <span className="mt-1.5 block text-caption text-muted">
              One word is enough. It is currently in {folderOf(asset)}.
            </span>
          </label>

          {brands.length > 0 ? (
            <p className="mt-4 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-2.5 text-caption leading-4 text-tertiary">
              Used as a logo by {brands.join(", ")}. Deleting it leaves those brands without one;
              carousels you already made keep the copy that is in them.
            </p>
          ) : null}
        </div>

        <footer className="flex h-16 shrink-0 items-center gap-2 border-t border-hairline px-5">
          {confirming ? (
            <>
              <span className="flex-1 text-caption text-secondary">
                Delete this file for good?
              </span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex h-9 items-center rounded-xl border border-hairline px-3.5 text-body text-secondary hover:text-primary"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex h-9 items-center rounded-xl border border-danger-dim bg-danger-wash px-3.5 text-body-strong text-danger"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-body text-tertiary hover:bg-white/[0.04] hover:text-danger"
              >
                <Trash2 size={14} strokeWidth={2} />
                Delete
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                className="flex h-9 items-center rounded-xl px-4 text-body-strong hover:brightness-110"
              >
                Done
              </button>
            </>
          )}
        </footer>
      </div>
    </>
  );
}
