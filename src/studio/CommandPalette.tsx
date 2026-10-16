/**
 * The command palette (24.2): ⌘K, a filtered list of every action in the
 * editor. It is the answer to "many presets, few buttons": a block, a brand,
 * a format, a destination or a project is found here by name rather than
 * given a button.
 *
 * Recent actions first. An action that cannot run right now (Group with one
 * layer selected) is listed, dimmed, with the reason, rather than hidden: a
 * palette that silently lacks the thing somebody typed teaches them it does
 * not exist.
 */
import { Command, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { rankItems, recentActions, rememberAction, type PaletteItem } from "./actions.js";

export type PaletteEntry = PaletteItem & { run: () => void };

/** How many entries the list draws: enough to scroll, few enough to stay instant. */
const SHOWN = 60;

export function CommandPalette({ items, onClose }: { items: readonly PaletteEntry[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const recent = useMemo(() => recentActions(), []);
  const ranked = useMemo(() => rankItems(items, query, recent).slice(0, SHOWN), [items, query, recent]);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => setAt(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-row="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const run = (item: PaletteEntry | undefined) => {
    if (!item || item.unavailable) return;
    rememberAction(item.id);
    onClose();
    item.run();
  };

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Command palette"
        className="fixed left-1/2 top-[12vh] z-modal flex max-h-[70vh] w-[600px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-2 shadow-modal"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-4">
          <Search size={15} className="text-tertiary" />
          <input
            autoFocus
            aria-label="Search actions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setAt((v) => Math.min(ranked.length - 1, v + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setAt((v) => Math.max(0, v - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(ranked[at]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
              e.stopPropagation();
            }}
            placeholder="Insert a block, apply a brand, change format, export…"
            className="h-full flex-1 bg-transparent text-body text-primary outline-none placeholder:text-muted"
          />
          <span className="flex items-center gap-0.5 text-caption text-muted">
            <Command size={11} />K
          </span>
        </div>
        <div ref={list} className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-1.5">
          {ranked.length === 0 ? (
            <p className="px-3 py-6 text-center text-caption text-muted">Nothing by that name.</p>
          ) : (
            ranked.map((item, i) => (
              <button
                key={item.id}
                type="button"
                data-row={i}
                data-control
                onMouseMove={() => setAt(i)}
                onClick={() => run(item)}
                className={[
                  "flex min-h-8 w-full items-center gap-3 rounded-lg px-3 py-1 text-left",
                  i === at ? "bg-white/[0.06]" : "",
                  item.unavailable ? "opacity-50" : "",
                ].join(" ")}
              >
                <span className="w-16 shrink-0 text-caption text-muted">{item.group}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-primary">{item.label}</span>
                  {item.unavailable && i === at ? (
                    <span className="block truncate text-caption text-muted">{item.unavailable}</span>
                  ) : null}
                </span>
                {recent.includes(item.id) && !query ? <span className="text-caption text-muted">recent</span> : null}
                {item.keys ? <kbd className="font-mono text-caption text-tertiary">{item.keys}</kbd> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
