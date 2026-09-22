/**
 * Apply a saved brand to the carousel that is already open.
 *
 * It reports what it did rather than claiming success, because it cannot
 * honestly claim success: re-colouring an existing deck is inference. A layer
 * wearing a colour the old theme explains follows the rebrand exactly; a layer
 * wearing something hand-picked is left alone on purpose. Saying "14 of 16"
 * tells the user which situation they are in without making them hunt for it.
 *
 * Undo covers the whole thing in one step, which is the other half of being
 * allowed to guess at all.
 */
import { Check, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ApplyResult, Brand } from "./brand.js";

export function BrandMenu({
  brands,
  onApply,
}: {
  brands: Brand[];
  onApply: (brand: Brand) => ApplyResult;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ name: string; changed: number; skipped: number } | null>(
    null,
  );
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  // The confirmation is transient: it is feedback, not state worth keeping.
  useEffect(() => {
    if (!result) return;
    const t = window.setTimeout(() => setResult(null), 4000);
    return () => window.clearTimeout(t);
  }, [result]);

  if (brands.length === 0) return null;

  return (
    <div ref={wrap} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-body text-secondary hover:bg-surface-3 hover:text-primary"
      >
        <Palette size={14} strokeWidth={2} />
        Brand
      </button>

      {result ? (
        <span className="ml-2 flex items-center gap-1 text-caption text-tertiary">
          <Check size={12} strokeWidth={2.4} className="text-success" />
          {result.name}: {result.changed} recoloured
          {result.skipped > 0 ? `, ${result.skipped} left alone` : ""}
        </span>
      ) : null}

      {open ? (
        <div
          className="absolute right-0 top-9 z-overlay w-[260px] rounded-2xl border border-hairline p-1.5 shadow-overlay"
          style={{ background: "rgba(26,42,66,.95)", backdropFilter: "blur(20px)" }}
        >
          {brands.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                const out = onApply(b);
                setResult({ name: b.name, changed: out.changed, skipped: out.skipped });
                setOpen(false);
              }}
              className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-caption text-secondary hover:bg-white/[0.06] hover:text-primary"
            >
              <span className="flex shrink-0 gap-0.5">
                {([b.theme.bg, b.theme.fg, b.theme.accent] as const).map((c, i) => (
                  <span
                    key={i}
                    className="h-3.5 w-3.5 rounded-sm border border-hairline"
                    style={{ background: c }}
                  />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{b.name}</span>
            </button>
          ))}

          <p className="px-2 pb-1 pt-1.5 text-caption leading-4 text-muted">
            Colours a layer wore from the old palette follow along. Anything you picked by hand is
            left as it is. One undo puts it back.
          </p>
        </div>
      ) : null}
    </div>
  );
}
