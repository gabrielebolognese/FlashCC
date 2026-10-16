/**
 * Find and replace (24.4), in this deck or across every project in view.
 *
 * Nothing changes until "Replace": the list underneath is every match, with
 * its slide, ticked or not, and a quote or a furniture piece starts unticked
 * (see `findreplace.ts`). After it, the dialog says what changed, names every
 * slide whose words no longer fit, and offers the way back.
 */
import { Replace, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";
import { findAcross, replaceInDoc, type Match, type Overflowing } from "./findreplace.js";
import type { Doc } from "./model.js";

export type Replaced = { before: Doc; after: Doc };

export function ReplaceDialog({
  docs,
  scope,
  onReplace,
  onUndo,
  onOpenSlide,
  onClose,
  undoNote,
}: {
  docs: readonly Doc[];
  /** "deck" is the open document; "projects" is every project the filters show. */
  scope: "deck" | "projects";
  /** Saves the changed documents, snapshotting each first. */
  onReplace: (changed: Replaced[]) => void;
  /** Puts documents back as they were; absent when the editor's own Undo does it. */
  onUndo?: ((docs: Doc[]) => void) | undefined;
  /** Jumps to a slide, for an overflow the user wants to look at. */
  onOpenSlide?: ((docId: string, slide: number) => void) | undefined;
  onClose: () => void;
  /** What the way back is, said once the replace has run. */
  undoNote: string;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCase] = useState(false);
  const [wholeWord, setWhole] = useState(false);
  /** Overrides of a match's default tick, by key. */
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<{ replaced: number; changed: Replaced[]; overflow: Overflowing[] } | null>(null);

  const matches = useMemo(() => findAcross(docs, query, { caseSensitive, wholeWord }), [docs, query, caseSensitive, wholeWord]);
  const isTicked = (m: Match) => ticks[m.key] ?? m.ticked;
  const tickedCount = matches.filter(isTicked).length;
  const docCount = new Set(matches.map((m) => m.docId)).size;

  const replace = () => {
    const keys = new Set(matches.filter(isTicked).map((m) => m.key));
    const changed: Replaced[] = [];
    const overflow: Overflowing[] = [];
    let replaced = 0;
    for (const d of docs) {
      const r = replaceInDoc(d, matches, replacement, keys);
      if (r.replaced === 0) continue;
      changed.push({ before: d, after: r.doc });
      overflow.push(...r.overflow);
      replaced += r.replaced;
    }
    if (changed.length > 0) onReplace(changed);
    setDone({ replaced, changed, overflow });
  };

  const grouped = useMemo(() => {
    const out = new Map<string, Match[]>();
    for (const m of matches) out.set(m.docId, [...(out.get(m.docId) ?? []), m]);
    return [...out.entries()];
  }, [matches]);

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Find and replace"
        className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[680px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-hairline bg-surface-2 shadow-modal"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
      >
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-4">
          <Replace size={15} className="text-tertiary" />
          <span className="flex-1 text-title text-primary">
            {scope === "deck" ? "Find and replace in this deck" : `Find and replace in ${docs.length} project${docs.length === 1 ? "" : "s"}`}
          </span>
          <IconButton icon={X} label="Close" control onClick={onClose} />
        </header>

        {done ? (
          <div className="flex flex-col gap-3 p-4 text-body text-secondary">
            <p>
              {done.replaced === 0
                ? "Nothing was replaced."
                : `Replaced ${done.replaced} time${done.replaced === 1 ? "" : "s"} in ${done.changed.length} ${scope === "deck" ? "deck" : `project${done.changed.length === 1 ? "" : "s"}`}.`}{" "}
              {done.replaced > 0 ? undoNote : ""}
            </p>
            {done.overflow.length > 0 ? (
              <div className="rounded-md border border-hairline bg-danger-wash p-3 text-caption">
                <p className="mb-1 text-secondary">These no longer fit their box. Give the words more room or another slide:</p>
                <ul>
                  {done.overflow.map((o, i) => (
                    <li key={i}>
                      {onOpenSlide ? (
                        <button type="button" data-control className="underline" onClick={() => onOpenSlide(o.docId, o.slide)}>
                          {scope === "projects" ? `${o.docName}, ` : ""}slide {o.slide + 1}, &ldquo;{o.layerName}&rdquo;
                        </button>
                      ) : (
                        <span>
                          {scope === "projects" ? `${o.docName}, ` : ""}slide {o.slide + 1}, &ldquo;{o.layerName}&rdquo;
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {onUndo && done.changed.length > 0 ? (
              <div className="max-h-[40vh] overflow-y-auto rounded-md border border-hairline">
                {done.changed.map((c) => (
                  <div key={c.before.id} className="flex h-9 items-center gap-2 border-b border-hairline px-3 last:border-0">
                    <span className="flex-1 truncate text-caption text-secondary">{c.before.name}</span>
                    <button
                      type="button"
                      data-control
                      onClick={() => {
                        onUndo([c.before]);
                        setDone({ ...done, changed: done.changed.filter((x) => x !== c) });
                      }}
                      className="h-7 rounded-md border border-hairline px-2 text-caption text-tertiary hover:text-primary"
                    >
                      Undo this one
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              {onUndo && done.changed.length > 1 ? (
                <Button
                  control
                  onClick={() => {
                    onUndo(done.changed.map((c) => c.before));
                    setDone({ ...done, changed: [] });
                  }}
                >
                  Undo all
                </Button>
              ) : null}
              <Button hero control onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-hairline p-4">
              <input
                autoFocus
                aria-label="Find"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find"
                className="h-8 rounded-md border border-edge bg-surface-1 px-2 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim"
              />
              <input
                aria-label="Replace with"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="Replace with"
                className="h-8 rounded-md border border-edge bg-surface-1 px-2 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim"
              />
              <div className="col-span-2 flex items-center gap-4 text-caption text-tertiary">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={caseSensitive} onChange={(e) => setCase(e.target.checked)} />
                  Match case
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={wholeWord} onChange={(e) => setWhole(e.target.checked)} />
                  Whole words
                </label>
                <span className="flex-1 text-right">
                  {query
                    ? `${matches.length} match${matches.length === 1 ? "" : "es"}${scope === "projects" ? ` in ${docCount} project${docCount === 1 ? "" : "s"}` : ""}`
                    : ""}
                </span>
              </div>
            </div>

            <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
              {grouped.map(([docId, ms]) => (
                <div key={docId}>
                  {scope === "projects" ? (
                    <div className="sticky top-0 bg-surface-3 px-4 py-1 text-caption text-secondary">{ms[0]!.docName}</div>
                  ) : null}
                  {ms.map((m) => (
                    <label key={m.key} className="flex min-h-8 items-start gap-2 border-b border-hairline px-4 py-1.5 text-caption">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={isTicked(m)}
                        onChange={(e) => setTicks({ ...ticks, [m.key]: e.target.checked })}
                      />
                      <span className="w-14 shrink-0 text-muted">Slide {m.slide + 1}</span>
                      <span className="min-w-0 flex-1 text-tertiary">
                        {m.before ? "…" : ""}
                        {m.before}
                        <mark className="rounded-sm bg-accent-wash px-0.5 text-accent">{m.found}</mark>
                        {m.after}
                        {m.after ? "…" : ""}
                        {m.verbatim ? (
                          <span className="ml-2 text-muted">verbatim quote: replacing it means it is no longer word for word</span>
                        ) : null}
                        {m.furniture ? <span className="ml-2 text-muted">from the brand: change it there</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
              {query && matches.length === 0 ? <p className="px-4 py-6 text-center text-caption text-muted">No matches.</p> : null}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline p-3">
              <span className="flex-1 text-caption text-muted">
                {scope === "projects" ? "Every project is saved in your history first, then changed." : "One Undo takes it back."}
              </span>
              <Button hero control disabled={tickedCount === 0} onClick={replace}>
                {tickedCount === 0 ? "Replace" : `Replace ${tickedCount}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
