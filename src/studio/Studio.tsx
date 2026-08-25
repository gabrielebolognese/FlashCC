import { ChevronLeft, ClipboardPaste, Download, Redo2, Undo2, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";
import { Canvas } from "./Canvas.js";
import { Filmstrip } from "./Filmstrip.js";
import { LayersPanel } from "./LayersPanel.js";
import { MediaPool } from "./MediaPool.js";
import { LayerView } from "./LayerView.js";
import type { Doc } from "./model.js";
import { Properties } from "./Properties.js";
import { buildSlides } from "./compositions.js";
import { THEMES } from "./presets.js";
import { Toolbar } from "./Toolbar.js";
import { useStudio } from "./useStudio.js";

export function Studio({ initial, onHome }: { initial: Doc; onHome: () => void }) {
  const studio = useStudio(initial);
  const { doc } = studio;
  const [naming, setNaming] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");

  const printRoot = document.getElementById("print-root");

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline bg-surface-1 px-3">
        <IconButton icon={ChevronLeft} label="Projects" onClick={onHome} />

        {naming ? (
          <input
            autoFocus
            value={doc.name}
            onChange={(e) => studio.setName(e.target.value)}
            onBlur={() => setNaming(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
              e.stopPropagation();
            }}
            className="h-7 rounded-sm border border-edge bg-surface-1 px-2 text-body text-primary outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="h-7 rounded-sm border border-transparent px-2 text-body text-secondary hover:border-hairline hover:text-primary"
          >
            {doc.name}
          </button>
        )}

        <div className="mx-1 h-4 w-px bg-hairline" />
        <IconButton icon={Undo2} label="Undo" onClick={studio.undo} />
        <IconButton icon={Redo2} label="Redo" onClick={studio.redo} />

        <div className="flex-1" />

        <span className="text-caption text-muted">
          {doc.slides.length} slide{doc.slides.length === 1 ? "" : "s"} · {doc.width}×{doc.height}
        </span>
        <button
          type="button"
          onClick={() => setPasteOpen(true)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <ClipboardPaste size={14} strokeWidth={2} />
          Paste post
        </button>
        <Button hero icon={Download} onClick={() => window.print()}>
          Export
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <Toolbar studio={studio} />
        <div className="flex w-[212px] shrink-0 flex-col border-r border-hairline bg-surface-1">
          <LayersPanel studio={studio} />
          <MediaPool studio={studio} />
        </div>
        <Canvas studio={studio} />
        <Properties studio={studio} />
      </div>

      <Filmstrip studio={studio} />

      {pasteOpen ? (
        <div className="absolute inset-0 z-modal grid place-items-center" style={{ background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-[560px] rounded-2xl border border-hairline bg-surface-2 shadow-modal">
            <header className="flex h-11 items-center gap-2 border-b border-hairline px-3">
              <span className="text-title text-primary">Paste a post</span>
              <div className="flex-1" />
              <IconButton icon={X} label="Close" onClick={() => setPasteOpen(false)} />
            </header>
            <div className="p-4">
              <p className="mb-2 text-caption text-tertiary">
                Each blank line becomes a slide. Everything it creates is a normal layer you can move.
              </p>
              <textarea
                autoFocus
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste here…"
                className="h-52 w-full resize-none rounded-md border border-edge bg-surface-1 p-3 font-mono text-[12px] leading-[20px] text-primary outline-none placeholder:text-muted focus:border-accent-dim"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-hairline bg-surface-1 p-3">
              <button
                type="button"
                onClick={() => setPasteOpen(false)}
                className="h-7 rounded-md px-2.5 text-body text-tertiary hover:text-primary"
              >
                Cancel
              </button>
              <Button
                hero
                onClick={() => {
                  if (pasted.trim()) {
                    const slides = buildSlides(
                      pasted.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean),
                      THEMES.ink!,
                    );
                    studio.replaceDoc({ ...doc, slides: [...doc.slides, ...slides] });
                  }
                  setPasted("");
                  setPasteOpen(false);
                }}
              >
                Add slides
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Export prints the same LayerView the canvas uses — one rendering path. */}
      {printRoot
        ? createPortal(
            <>
              <style>{`@page { size: ${doc.width}px ${doc.height}px; margin: 0; }`}</style>
              {doc.slides.map((s) => (
                <div
                  key={s.id}
                  style={{
                    position: "relative",
                    width: doc.width,
                    height: doc.height,
                    background: s.background,
                    breakAfter: "page",
                    overflow: "hidden",
                  }}
                >
                  {s.layers.map((l) => (
                    <LayerView key={l.id} layer={l} />
                  ))}
                </div>
              ))}
            </>,
            printRoot,
          )
        : null}
    </div>
  );
}
