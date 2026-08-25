import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { IconButton } from "../ui/IconButton.js";
import { LayerView } from "./LayerView.js";
import type { Doc } from "./model.js";
import { buildDoc, PRESETS, THEMES } from "./presets.js";
import { deleteDoc, listDocs, loadDoc, saveDoc, type DocSummary } from "./storage.js";

const CARD_H = 168;

export function Start({ onOpen }: { onOpen: (doc: Doc) => void }) {
  const [docs, setDocs] = useState<DocSummary[]>(() => listDocs());
  const [theme, setTheme] = useState<keyof typeof THEMES>("ink");

  function create(presetId: string) {
    const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0]!;
    const doc = buildDoc(preset, theme, preset.name === "Blank" ? "Untitled" : preset.name);
    saveDoc(doc);
    onOpen(doc);
  }

  return (
    <div className="h-full overflow-y-auto bg-base">
      <header className="flex h-11 items-center gap-2 border-b border-hairline bg-surface-1 px-3">
        <span
          className="grid h-5 w-5 place-items-center rounded-sm text-[11px] font-semibold"
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
        >
          F
        </span>
        <span className="text-body-strong text-primary">FlashCC</span>
        <div className="flex-1" />
        <span className="text-caption text-muted">{docs.length === 0 ? "no projects" : `${docs.length} projects`}</span>
      </header>

      <main className="mx-auto max-w-[1000px] px-6 py-8">
        <h1 className="text-display text-primary">Start a carousel</h1>
        <p className="mt-1 text-body text-tertiary">
          Everything is a layer you can drag, resize and restyle. Presets just give you a head start.
        </p>

        <div className="mt-5 flex items-center gap-2">
          <span className="text-caption text-tertiary">Theme</span>
          {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              title={id}
              className={[
                "h-7 w-7 rounded-md border",
                theme === id ? "border-accent" : "border-hairline",
              ].join(" ")}
              style={{ background: THEMES[id]!.bg }}
            >
              <span className="mx-auto block h-2 w-2 rounded-full" style={{ background: THEMES[id]!.accent }} />
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {PRESETS.map((p) => {
            const doc = buildDoc(p, theme, p.name);
            const first = doc.slides[0];
            const scale = CARD_H / doc.height;
            return (
              <button key={p.id} type="button" onClick={() => create(p.id)} className="group text-left">
                <div
                  className="overflow-hidden rounded-lg border border-hairline group-hover:border-accent"
                  style={{ width: doc.width * scale, height: CARD_H, background: first?.background }}
                >
                  <div
                    className="pointer-events-none relative origin-top-left"
                    style={{ width: doc.width, height: doc.height, transform: `scale(${scale})` }}
                  >
                    {first?.layers.map((l) => (
                      <LayerView key={l.id} layer={l} />
                    ))}
                  </div>
                </div>
                <div className="mt-1.5 text-body-strong text-secondary group-hover:text-primary">{p.name}</div>
                <div className="text-caption text-muted">{p.description}</div>
              </button>
            );
          })}
        </div>

        {docs.length > 0 ? (
          <section className="mt-10">
            <div className="mb-2 text-overline uppercase text-tertiary">Your projects</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
              {docs.map((d) => (
                <div key={d.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      const full = loadDoc(d.id);
                      if (full) onOpen(full);
                    }}
                    className="w-full overflow-hidden rounded-lg border border-hairline bg-surface-1 text-left hover:border-surface-5"
                  >
                    <div className="h-[132px]" style={{ background: d.background }} />
                    <div className="p-2.5">
                      <div className="truncate text-body-strong text-primary">{d.name}</div>
                      <div className="mt-0.5 text-caption text-tertiary">
                        {d.slideCount} slide{d.slideCount === 1 ? "" : "s"} · {d.width}×{d.height}
                      </div>
                    </div>
                  </button>
                  <div className="absolute right-1 top-1 hidden group-hover:block">
                    <IconButton
                      icon={Trash2}
                      label="Delete"
                      danger
                      onClick={() => {
                        deleteDoc(d.id);
                        setDocs(listDocs());
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <button
          type="button"
          onClick={() => create("blank")}
          className="mt-8 flex h-7 items-center gap-1.5 rounded-md px-2 text-body text-tertiary hover:bg-white/[0.04] hover:text-primary"
        >
          <Plus size={14} strokeWidth={2} />
          Blank canvas
        </button>
      </main>
    </div>
  );
}
