import { Download, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import type { FlashCCDocument } from "../doc/types.js";
import type { Format } from "../render/layout/node.js";
import { elementsToNodes } from "../render/materialize.js";
import { SlideRenderer } from "../render/SlideRenderer.js";
import { IconButton } from "../ui/IconButton.js";

type Props = {
  doc: FlashCCDocument;
  format: Format;
  onClose: () => void;
};

/**
 * Interim export. It prints the SAME component tree the preview uses, at scale 1, through
 * the browser's own renderer — so there is no second rendering path and no drift. The
 * server-side Playwright pipeline (architecture.md D4) replaces this and adds the PNG
 * sequence; it is the piece still to build.
 */
export function ExportSheet({ doc, format, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const printRoot = document.getElementById("print-root");

  return (
    <>
      <div className="absolute inset-0 z-overlay" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 z-modal flex h-full w-[300px] flex-col border-l border-hairline shadow-modal"
        style={{ background: "linear-gradient(180deg, var(--surface-2), var(--surface-1))" }}
      >
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-3">
          <span className="text-title text-primary">Export</span>
          <div className="flex-1" />
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>

        <div className="flex-1 p-3">
          <div className="text-caption text-tertiary">
            {doc.slides.length} slide{doc.slides.length === 1 ? "" : "s"} · {format.w}×{format.h}
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            disabled={doc.slides.length === 0}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className="mt-3 flex h-7 w-full items-center justify-center gap-1.5 rounded-md text-body-strong hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
          >
            <Download size={14} strokeWidth={2.5} />
            Export PDF
          </button>

          <p className="mt-3 text-caption leading-[16px] text-muted">
            Opens the print dialog — choose “Save as PDF”, and set margins to None. Each slide
            is one page at exact dimensions.
          </p>

          <p className="mt-4 border-t border-hairline pt-3 text-caption leading-[16px] text-muted">
            PNG sequence needs the headless-browser pipeline, which is not built yet.
          </p>
        </div>
      </aside>

      {printRoot
        ? createPortal(
            <>
              <style>{`@page { size: ${format.w}px ${format.h}px; margin: 0; }`}</style>
              {doc.slides.map((slide, i) => (
                <div key={slide.id} style={{ breakAfter: "page", width: format.w, height: format.h }}>
                  <SlideRenderer
                    nodes={elementsToNodes(slide.elements ?? [], format, slide.background ?? doc.brandKit.palette.background)}
                    format={format}
                  />
                </div>
              ))}
            </>,
            printRoot,
          )
        : null}
    </>
  );
}
