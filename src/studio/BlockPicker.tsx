/**
 * Choosing a block, filling it in, and putting it on the slide (19.6, 19.8).
 *
 * One dialog for both jobs. Inserting starts at a short filtered list, because
 * nineteen is few enough to read and too many to scroll a grid of; editing
 * starts at the form, already filled with what the block was built from.
 *
 * The preview is the slide itself with the block on it, painted by LayerView
 * like everything else, so what is shown is exactly what will be placed. What
 * does not fit is said under it, by part, before anything is committed.
 */
import { LayoutGrid, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { blockById, searchBlocks, withDefaults, type Block, type Fields } from "./blocks.js";
import { insertBlock, insertSplit, rebuildBlock } from "./blockplace.js";
import { identityOf, listBrands, themeOf } from "./brand.js";
import { uid } from "./model.js";
import { platformById, platformForSize } from "./platforms.js";
import { SlidePreview } from "./SlidePreview.js";
import type { Studio } from "./useStudio.js";

export function BlockPicker({ studio }: { studio: Studio }) {
  const { doc, index, slide, picker } = studio;
  const editing = picker?.mode === "edit" ? picker.instance : null;
  const record = editing ? slide?.blocks?.find((b) => b.instance === editing) : undefined;

  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Block | null>(() => (record ? (blockById(record.block) ?? null) : null));
  const [fields, setFields] = useState<Fields>(() => record?.fields ?? {});

  const brands = useMemo(() => listBrands(), []);
  const theme = useMemo(() => themeOf(doc, brands), [doc, brands]);
  const identity = useMemo(() => identityOf(doc, brands), [doc, brands]);
  const platform = studio.safePlatform ? platformById(studio.safePlatform) : platformForSize(doc.width, doc.height);
  // A picture already selected is what a frame or a polish starts from.
  const src = studio.selected.length === 1 && studio.selected[0]!.kind === "image" ? studio.selected[0]!.src : undefined;
  const ctx = { theme, identity, ...(src ? { src } : {}), ...(doc.quotes?.length ? { quotes: doc.quotes } : {}) };

  const close = () => studio.setPicker(null);

  // Escape closes it from anywhere in the dialog, not only from the search box.
  //
  // Keyed on the STABLE setter, not on `studio`: the canvas handles Escape as
  // well, its state change re-renders the editor during the same key event,
  // and a listener re-subscribed mid-dispatch is skipped for that event. With
  // `studio` as the dependency, Escape only closed the dialog every other time.
  const setPicker = studio.setPicker;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicker(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPicker]);

  /** The result of placing it here, worked out live for the preview. */
  const trial = useMemo(() => {
    if (!chosen) return null;
    const full = withDefaults(chosen, fields);
    if (editing && slide) {
      const r = rebuildBlock(slide, editing, full, { ...ctx, board: { w: doc.width, h: doc.height } });
      return r ? { kind: "edit" as const, slide: r.slide, built: r.built } : null;
    }
    let n = 0;
    const here = insertBlock(doc, index, chosen.id, full, ctx, "here", () => `preview${(n += 1)}`, platform);
    return { kind: "insert" as const, here };
    // ctx is rebuilt every render from these same parts, so they are the deps.
  }, [chosen, fields, editing, slide, doc, index, theme, identity, src, platform]);

  const commit = (where: "here" | "new" | "split") => {
    if (!chosen) return;
    const full = withDefaults(chosen, fields);
    if (editing && slide) {
      const r = rebuildBlock(slide, editing, full, { ...ctx, board: { w: doc.width, h: doc.height } });
      if (r) studio.replaceDoc({ ...doc, slides: doc.slides.map((s, i) => (i === index ? r.slide : s)) });
      close();
      return;
    }
    const make = () => uid("blk");
    const r =
      where === "split"
        ? insertSplit(doc, index, chosen.id, full, 2, ctx, make, platform)
        : insertBlock(doc, index, chosen.id, full, ctx, where, make, platform);
    if (!r.ok) return;
    studio.replaceDoc(r.doc);
    studio.setSlideIndex(r.index);
    studio.setSelection(r.layerIds);
    close();
  };

  const preview =
    trial?.kind === "edit"
      ? trial.slide
      : trial?.kind === "insert" && trial.here.ok
        ? trial.here.doc.slides[index]
        : slide;
  const built = trial?.kind === "edit" ? trial.built : trial?.kind === "insert" && trial.here.ok ? trial.here.built : null;
  const noRoom = trial?.kind === "insert" && !trial.here.ok;
  const canSplit = Boolean(chosen?.split) && Boolean(built && built.overflow.length > 0);

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={close} />
      <div className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[760px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <LayoutGrid size={15} className="text-tertiary" />
          <span className="text-title text-primary">
            {editing ? `Edit ${chosen?.label ?? "block"}` : chosen ? chosen.label : "Insert a block"}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-primary"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </header>

        {!chosen ? (
          <div className="scroll-quiet flex-1 overflow-y-auto p-4">
            <label className="flex h-8 items-center gap-2 rounded-xl border border-hairline bg-surface-1 px-3">
              <Search size={13} className="text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  const first = searchBlocks(query)[0];
                  if (e.key === "Enter" && first) {
                    setChosen(first);
                    setFields({});
                  }
                  if (e.key === "Escape") close();
                }}
                placeholder="Chart, checklist, quote…"
                className="h-7 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-muted"
              />
            </label>
            <ul className="mt-2 grid grid-cols-2 gap-1">
              {searchBlocks(query).map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setChosen(b);
                      setFields({});
                    }}
                    className="flex w-full flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-white/[0.05]"
                  >
                    <span className="text-body-strong text-primary">{b.label}</span>
                    <span className="text-caption text-muted">{b.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="scroll-quiet flex min-h-0 flex-1 gap-4 overflow-y-auto p-4">
            <div className="flex w-[300px] shrink-0 flex-col gap-3">
              {chosen.fields.map((f) => {
                const value = fields[f.key] ?? chosen.defaults[f.key] ?? "";
                const set = (v: string) => setFields((all) => ({ ...all, [f.key]: v }));
                return (
                  <label key={f.key} className="flex flex-col gap-1">
                    <span className="text-caption text-tertiary">{f.label}</span>
                    {f.kind === "choice" ? (
                      <select
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className="h-7 rounded-md border border-hairline bg-surface-1 px-1.5 text-caption text-primary outline-none"
                      >
                        {(f.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : f.kind === "lines" ? (
                      <textarea
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        placeholder={f.placeholder}
                        rows={Math.min(8, Math.max(3, value.split("\n").length + 1))}
                        className={[
                          "rounded-md border border-hairline bg-surface-1 px-2 py-1.5 text-caption text-primary outline-none focus:border-accent-dim",
                          chosen.id === "code" ? "font-mono" : "",
                        ].join(" ")}
                      />
                    ) : (
                      <input
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        placeholder={f.placeholder}
                        className="h-7 rounded-md border border-hairline bg-surface-1 px-2 text-caption text-primary outline-none focus:border-accent-dim"
                      />
                    )}
                    {f.hint ? <span className="text-caption leading-4 text-muted">{f.hint}</span> : null}
                    {chosen.id === "quote" && f.key === "text" && doc.quotes?.length ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-caption text-muted">From your source, word for word:</span>
                        {doc.quotes.slice(0, 6).map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => set(q)}
                            className={[
                              "rounded-md border px-2 py-1 text-left text-caption leading-4",
                              value.trim() === q ? "border-accent text-accent" : "border-hairline text-secondary hover:text-primary",
                            ].join(" ")}
                          >
                            {q}
                          </button>
                        ))}
                        <span className="text-caption leading-4 text-muted">
                          {doc.quotes.includes(value.trim())
                            ? "Verbatim. Changing any word removes the mark."
                            : "Not one of the verified quotes, so not marked verbatim."}
                        </span>
                      </div>
                    ) : null}
                  </label>
                );
              })}
            </div>

            <div className="min-w-0 flex-1">
              <SlidePreview slide={preview} w={doc.width} h={doc.height} className="rounded-xl border border-hairline" />
              {noRoom ? (
                <p className="mt-2 text-caption leading-4 text-secondary">
                  There is no room on this slide without covering something. It can go on a new slide right
                  after this one instead.
                </p>
              ) : null}
              {built && built.overflow.length > 0 ? (
                <p className="mt-2 text-caption leading-4 text-danger">
                  Does not fit: {built.overflow.join(", ")}. Shorten it{canSplit ? ", or split it across two slides" : ""}.
                  It is not shrunk below a size people can read.
                </p>
              ) : null}
              {built?.notes.map((n) => (
                <p key={n} className="mt-1.5 text-caption leading-4 text-tertiary">
                  {n}
                </p>
              ))}
            </div>
          </div>
        )}

        <footer className="flex h-16 shrink-0 items-center gap-2 border-t border-hairline px-5">
          {chosen && !editing ? (
            <button
              type="button"
              onClick={() => setChosen(null)}
              className="flex h-9 items-center rounded-xl px-3 text-body text-tertiary hover:text-primary"
            >
              All blocks
            </button>
          ) : null}
          <span className="flex-1 text-caption text-muted">
            {editing
              ? "Parts you moved or restyled by hand stay as they are."
              : "Ordinary layers, grouped. Nothing about them is live."}
          </span>
          {chosen && !editing && canSplit ? (
            <button
              type="button"
              onClick={() => commit("split")}
              className="flex h-9 items-center rounded-xl border border-hairline px-3.5 text-body text-secondary hover:text-primary"
            >
              Split across two slides
            </button>
          ) : null}
          {chosen && !editing ? (
            <button
              type="button"
              onClick={() => commit("new")}
              className="flex h-9 items-center rounded-xl border border-hairline px-3.5 text-body text-secondary hover:text-primary"
            >
              On a new slide
            </button>
          ) : null}
          {chosen ? (
            <button
              type="button"
              disabled={!editing && noRoom}
              onClick={() => commit("here")}
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              className="flex h-9 items-center rounded-xl px-4 text-body-strong hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
            >
              {editing ? "Update block" : "Place on this slide"}
            </button>
          ) : null}
        </footer>
      </div>
    </>
  );
}
