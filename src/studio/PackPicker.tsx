/**
 * Style packs (25.6), by kind of creator. Picking one applies it to the deck
 * once: colours and faces by role, the texture, the furniture, the icon style.
 */
import { X } from "lucide-react";

import { IconButton } from "../ui/IconButton.js";
import { CREATOR_KINDS, PACKS, type StylePack } from "./packs.js";
import { pairById } from "./pairs.js";
import { RAMPS } from "./ramps.js";

export function PackPicker({ current, onPick, onClose }: { current?: string | undefined; onPick: (p: StylePack) => void; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Style packs"
        className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[760px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <span className="flex-1 text-title text-primary">Style packs</span>
          <IconButton icon={X} label="Close" control onClick={onClose} />
        </header>
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-5">
          <p className="mb-4 text-caption text-muted">
            Colours, a font pair, a type ramp, a background, furniture and an icon style, as one choice. Applied once: a layer you
            recoloured by hand keeps its colour.
          </p>
          {CREATOR_KINDS.map((k) => {
            const packs = PACKS.filter((p) => p.creator === k.id);
            return (
              <section key={k.id} className="mb-4">
                <h3 className="mb-2 text-caption uppercase tracking-[0.4px] text-tertiary">{k.label}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {packs.map((p) => {
                    const pair = pairById(p.pair);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        data-control
                        aria-pressed={current === p.id}
                        onClick={() => onPick(p)}
                        className={[
                          "flex items-center gap-3 rounded-2xl border p-3 text-left",
                          current === p.id ? "border-accent" : "border-hairline hover:border-accent-dim",
                        ].join(" ")}
                      >
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ background: p.colours.bg }}>
                          <span className="text-[18px] font-bold" style={{ color: p.colours.fg }}>
                            A<span style={{ color: p.colours.accent }}>a</span>
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-body-strong text-primary">{p.name}</span>
                          <span className="block truncate text-caption text-muted">{p.note}</span>
                          <span className="block truncate text-caption text-tertiary">
                            {pair?.name ?? p.pair} · {RAMPS.find((r) => r.id === p.ramp)?.label} · {p.texture ? p.texture.kind : "flat"} · {p.furniture}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
