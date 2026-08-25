import { PenLine, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { LayerView } from "./LayerView.js";
import type { Doc } from "./model.js";
import { buildDoc, PRESETS, THEMES } from "./presets.js";
import { deleteDoc, listDocs, loadDoc, saveDoc, type DocSummary } from "./storage.js";

const CARD_H = 186;

export function Start({
  onOpen,
  onCompose,
}: {
  onOpen: (doc: Doc) => void;
  onCompose: (theme: keyof typeof THEMES) => void;
}) {
  const [docs, setDocs] = useState<DocSummary[]>(() => listDocs());
  const [theme, setTheme] = useState<keyof typeof THEMES>("ink");

  function create(presetId: string) {
    const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0]!;
    const doc = buildDoc(preset, theme, preset.id === "blank" ? "Untitled" : preset.name);
    saveDoc(doc);
    onOpen(doc);
  }

  return (
    <div className="h-full overflow-y-auto bg-base">
      <header className="sticky top-0 z-overlay flex h-14 items-center gap-2.5 border-b border-hairline bg-surface-1/95 px-5 backdrop-blur">
        <span
          className="grid h-7 w-7 place-items-center rounded-xl text-[13px] font-semibold"
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
        >
          F
        </span>
        <span className="text-title text-primary">FlashCC</span>
        <div className="flex-1" />
        <span className="text-caption text-muted">
          {docs.length === 0 ? "No projects yet" : `${docs.length} project${docs.length === 1 ? "" : "s"}`}
        </span>
      </header>

      <main className="mx-auto max-w-[1060px] px-6 pb-16 pt-10">
        <h1 className="text-[30px] font-semibold leading-[36px] tracking-[-0.6px] text-primary">
          Make a carousel
        </h1>
        <p className="mt-1.5 text-body text-tertiary">
          Write it first, then arrange it. Every element stays yours to move.
        </p>

        {/* the primary path */}
        <button
          type="button"
          onClick={() => onCompose(theme)}
          className="group mt-6 flex w-full items-center gap-4 rounded-3xl border border-hairline bg-gradient-to-b from-surface-2 to-surface-1 p-5 text-left shadow-overlay transition-[border-color,transform] duration-micro ease-out hover:-translate-y-px hover:border-accent-dim"
        >
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          >
            <PenLine size={20} strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold leading-5 text-primary">
              Write your slides
            </span>
            <span className="mt-0.5 block text-body text-tertiary">
              One box per slide, up to 35. Paste a whole post and it splits itself.
            </span>
          </span>
          <span className="shrink-0 rounded-xl border border-hairline px-3 py-1.5 text-caption text-secondary group-hover:border-accent-dim group-hover:text-accent">
            Start
          </span>
        </button>

        {/* theme + presets */}
        <div className="mt-9 flex items-center gap-3">
          <span className="text-overline uppercase text-tertiary">Start from a layout</span>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((id) => (
              <button
                key={id}
                type="button"
                title={id}
                onClick={() => setTheme(id)}
                className={[
                  "grid h-7 w-7 place-items-center rounded-xl border-2",
                  theme === id ? "border-accent" : "border-hairline hover:border-surface-5",
                ].join(" ")}
                style={{ background: THEMES[id]!.bg }}
              >
                <span className="block h-2 w-2 rounded-full" style={{ background: THEMES[id]!.accent }} />
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-4">
          {PRESETS.map((p) => {
            const doc = buildDoc(p, theme, p.name);
            const first = doc.slides[0];
            const scale = CARD_H / doc.height;
            return (
              <button key={p.id} type="button" onClick={() => create(p.id)} className="group text-left">
                <div
                  className="overflow-hidden rounded-2xl border border-hairline transition-[border-color,transform] duration-micro ease-out group-hover:-translate-y-px group-hover:border-accent-dim"
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
                <div className="mt-2 text-body-strong text-secondary group-hover:text-primary">{p.name}</div>
                <div className="text-caption text-muted">{p.description}</div>
              </button>
            );
          })}
        </div>

        {docs.length > 0 ? (
          <section className="mt-12">
            <div className="mb-3 text-overline uppercase text-tertiary">Your projects</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
              {docs.map((d) => (
                <div key={d.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      const full = loadDoc(d.id);
                      if (full) onOpen(full);
                    }}
                    className="w-full overflow-hidden rounded-2xl border border-hairline bg-surface-1 text-left transition-[border-color,transform] duration-micro ease-out hover:-translate-y-px hover:border-accent-dim"
                  >
                    <div className="h-[140px]" style={{ background: d.background }} />
                    <div className="p-3">
                      <div className="truncate text-body-strong text-primary">{d.name}</div>
                      <div className="mt-0.5 text-caption text-tertiary">
                        {d.slideCount} slide{d.slideCount === 1 ? "" : "s"} · {d.width}×{d.height}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete project"
                    onClick={() => {
                      deleteDoc(d.id);
                      setDocs(listDocs());
                    }}
                    className="absolute right-2 top-2 hidden h-7 w-7 place-items-center rounded-xl bg-black/50 text-white/70 backdrop-blur hover:text-danger group-hover:grid"
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <button
          type="button"
          onClick={() => create("blank")}
          className="mt-10 flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-body text-tertiary hover:bg-white/[0.04] hover:text-primary"
        >
          <Plus size={14} strokeWidth={2} />
          Blank canvas
        </button>
      </main>
    </div>
  );
}
