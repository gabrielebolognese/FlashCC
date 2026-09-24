import { ChevronLeft, ClipboardPaste, Download, History, Redo2, Send, Shuffle, Sparkles, Undo2, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "../ui/Button.js";
import { IconButton } from "../ui/IconButton.js";
import { Canvas } from "./Canvas.js";
import { Filmstrip } from "./Filmstrip.js";
import { LayersPanel } from "./LayersPanel.js";
import { MediaPool } from "./MediaPool.js";
import { slidePaint } from "./paint.js";
import { LayerView } from "./LayerView.js";
import type { Doc, Layer } from "./model.js";
import { Properties } from "./Properties.js";
import { buildSlides } from "./compositions.js";
import { applyBrand, listBrands, stampLogo, themeOf, voiceOf } from "./brand.js";
import { logoResolver } from "./library.js";
import { BrandMenu } from "./BrandMenu.js";
import { ExportDialog } from "./ExportDialog.js";
import { HookPicker } from "./HookPicker.js";
import { HistoryPanel } from "./HistoryPanel.js";
import { sessionPlan } from "./session.js";
import { ShareDialog } from "./ShareDialog.js";
import { snapshot } from "./versions.js";
import { regenerate, restateSlide } from "./regenerate.js";
import { RewritePicker } from "./RewritePicker.js";
import { rebuildsOnRewrite, slideTextWith, slotAt } from "./rewrite.js";
import { deckTexts } from "./transcript.js";
import { STRUCTURES } from "./structures.js";
import { THEMES } from "./presets.js";
import { Toolbar } from "./Toolbar.js";
import { useStudio } from "./useStudio.js";

export function Studio({ initial, onHome }: { initial: Doc; onHome: () => void }) {
  const studio = useStudio(initial);
  const { doc, slide } = studio;
  const [naming, setNaming] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [relaid, setRelaid] = useState<number | null>(null);
  const [hooking, setHooking] = useState(false);
  /**
   * Which slide is being rewritten, or null. A number rather than a boolean,
   * because unlike the hook picker this can be opened on any slide.
   */
  const [rewriting, setRewriting] = useState<number | null>(null);
  /** A single text layer being rewritten from the Properties panel. */
  const [rewritingLayer, setRewritingLayer] = useState<Layer | null>(null);
  const [sharing, setSharing] = useState(false);
  const [history, setHistory] = useState(false);
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
          title="Lay the same words out again. Anything you changed by hand is kept."
          onClick={() => {
            const result = regenerate(doc, themeOf(doc, listBrands()));
            studio.replaceDoc(result.doc);
            setRelaid(result.kept);
          }}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <Shuffle size={14} strokeWidth={2} />
          Re-lay
        </button>
        {relaid === null ? null : (
          <span className="text-caption text-tertiary">
            {relaid > 0 ? `kept ${relaid} of your edits` : "re-laid"}
          </span>
        )}

        {/*
          Hooks get their own control rather than living inside Re-lay: people
          iterate on the first slide far more often than they re-lay the deck,
          and burying the thing that is done twenty times behind the thing that
          is done twice is how a tool acquires a reputation for being fiddly.
        */}
        <button
          type="button"
          title="Several ways to open the same carousel. Nothing else in the deck moves."
          onClick={() => setHooking(true)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <Sparkles size={14} strokeWidth={2} />
          Hooks
        </button>

        <BrandMenu
          brands={listBrands()}
          onApply={(brand) => {
            const result = applyBrand(doc, brand, undefined);
            // The logo goes on in the same commit, so applying a brand is one
            // undo rather than two, and so "it used my brand assets
            // automatically" is true without a second button to find.
            // Snapshot BEFORE the brand lands, not after: the version worth
            // keeping is the one that is about to stop existing.
            snapshot(doc, "brand", sessionPlan(), `Before ${brand.name}`);
            const stamped = stampLogo(result.doc, brand, logoResolver());
            studio.replaceDoc(stamped.doc);
            return { ...result, doc: stamped.doc };
          }}
        />
        <button
          type="button"
          onClick={() => setPasteOpen(true)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <ClipboardPaste size={14} strokeWidth={2} />
          Paste post
        </button>
        <button
          type="button"
          title="What this looked like when you exported it, sent it, or rebranded it."
          onClick={() => setHistory(true)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <History size={14} strokeWidth={2} />
          History
        </button>
        <button
          type="button"
          title="Send a link your client can open without an account."
          onClick={() => setSharing(true)}
          className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
        >
          <Send size={14} strokeWidth={2} />
          Review
        </button>
        <Button hero icon={Download} onClick={() => setExporting(true)}>
          Export
        </Button>
      </header>

      <Toolbar studio={studio} />

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[212px] shrink-0 flex-col border-r border-hairline bg-surface-1">
          <LayersPanel studio={studio} />
          <MediaPool studio={studio} />
        </div>
        <Canvas studio={studio} />
        <Properties studio={studio} onRewrite={(l) => setRewritingLayer(l)} />
      </div>

      <Filmstrip studio={studio} onRewrite={(i) => setRewriting(i)} />

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

      {exporting ? (
        <ExportDialog doc={doc} onAlt={studio.setSlideAlt} onClose={() => setExporting(false)} />
      ) : null}

      {sharing ? <ShareDialog doc={doc} onClose={() => setSharing(false)} /> : null}

      {history ? (
        <HistoryPanel
          doc={doc}
          onRestore={(next) => studio.replaceDoc(next)}
          onClose={() => setHistory(false)}
        />
      ) : null}

      {hooking ? (
        <HookPicker
          doc={doc}
          framework={STRUCTURES.find((f) => f.id === doc.framework)?.name}
          onPick={(text) => {
            // Back through the generator, not typed onto the layer: the box and
            // the font size were chosen for the old words.
            const result = restateSlide(doc, 0, text, themeOf(doc, listBrands()));
            studio.replaceDoc(result.doc);
            setHooking(false);
          }}
          onClose={() => setHooking(false)}
        />
      ) : null}

      {rewriting !== null ? (
        <RewritePicker
          title={`Rewrite slide ${rewriting + 1}`}
          text={deckTexts(doc)[rewriting] ?? ""}
          deck={deckTexts(doc)}
          slot={slotAt(rewriting, doc.slides.length, STRUCTURES.find((f) => f.id === doc.framework)?.slots)}
          voice={voiceOf(doc, listBrands())}
          /*
           * Run against a COPY to answer "what would this do" without doing it.
           * restateSlide is pure and returns a new document, so asking is free
           * and the answer is exact rather than an estimate from a character
           * count that does not know the font.
           */
          slidesAfter={(candidate) =>
            restateSlide(doc, rewriting, candidate, themeOf(doc, listBrands())).doc.slides.length
          }
          onPick={(text) => {
            // Back through the generator, never typed onto the layer: the box
            // and the font size were measured for the old words.
            const result = restateSlide(doc, rewriting, text, themeOf(doc, listBrands()));
            studio.replaceDoc(result.doc);
            setRewriting(null);
          }}
          onClose={() => setRewriting(null)}
        />
      ) : null}

      {rewritingLayer ? (
        <RewritePicker
          title="Other wordings"
          text={rewritingLayer.text ?? ""}
          deck={deckTexts(doc)}
          slot={slotAt(studio.index, doc.slides.length, STRUCTURES.find((f) => f.id === doc.framework)?.slots)}
          voice={voiceOf(doc, listBrands())}
          slidesAfter={
            rebuildsOnRewrite(rewritingLayer) && slide
              ? (candidate) =>
                  restateSlide(
                    doc,
                    studio.index,
                    slideTextWith(slide, rewritingLayer.id, candidate),
                    themeOf(doc, listBrands()),
                  ).doc.slides.length
              : undefined
          }
          onPick={(text) => {
            /*
             * Two paths, and which one runs is decided by who owns the box.
             *
             * A GENERATED layer has a box measured for the old words, so the
             * slide is rebuilt from its whole text with this one line swapped.
             * Swapping the slide's entire text for one line would delete the
             * other layer on a heading-plus-body composition, which is why
             * `slideTextWith` exists.
             *
             * A HAND-EDITED layer is written to directly. `restateSlide` keeps
             * hand-edited layers verbatim and rebuilds the rest, so running it
             * here would print the new words as a generated layer and keep the
             * old hand-placed one: the same line twice. And somebody who dragged
             * a box somewhere has already said where it goes.
             */
            if (slide && rebuildsOnRewrite(rewritingLayer)) {
              const whole = slideTextWith(slide, rewritingLayer.id, text);
              const result = restateSlide(doc, studio.index, whole, themeOf(doc, listBrands()));
              studio.replaceDoc(result.doc);
            } else {
              studio.updateLayers([rewritingLayer.id], { text });
            }
            setRewritingLayer(null);
          }}
          onClose={() => setRewritingLayer(null)}
        />
      ) : null}

      {/* Ctrl+P still works, and still prints the same LayerView the canvas uses. */}
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
                    ...slidePaint(s),
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
