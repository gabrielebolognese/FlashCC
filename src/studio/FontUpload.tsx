import { AlertCircle, ExternalLink, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import {
  addCustomFont,
  FONT_ACCEPT,
  FONT_FORMATS,
  FONT_SOURCES,
  listCustomFonts,
  MAX_FONT_BYTES,
  MAX_FONTS,
  removeCustomFont,
  type CustomFont,
} from "./fonts.js";

/**
 * Upload a font, and — as importantly — say what a usable font file looks like and
 * where to get one. Most people have never downloaded a .woff2 and will otherwise
 * drop in a 3MB .ttf and hit the cap with no idea why.
 */
export function FontUpload({ onAdded }: { onAdded: (id: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fonts, setFonts] = useState<CustomFont[]>(() => listCustomFonts());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await addCustomFont(file);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFonts(listCustomFonts());
    onAdded(result.font.id);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fcc-lift mt-3 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border border-dashed border-hairline text-[15px] font-semibold text-secondary hover:border-accent-dim hover:bg-accent-wash hover:text-accent"
      >
        <Upload size={17} strokeWidth={2.2} />
        Upload your own font
      </button>

      {fonts.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {fonts.map((f) => (
            <span
              key={f.id}
              className="flex items-center gap-1.5 rounded-lg border border-hairline px-2 py-1 text-caption text-tertiary"
            >
              {f.label}
              <button
                type="button"
                aria-label={`Remove ${f.label}`}
                onClick={() => {
                  removeCustomFont(f.id);
                  setFonts(listCustomFonts());
                }}
                className="text-muted hover:text-danger"
              >
                <Trash2 size={11} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-modal grid place-items-center px-6"
          style={{ background: "rgba(0,0,0,.62)", backdropFilter: "blur(6px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="fcc-enter max-h-[86vh] w-full max-w-[520px] overflow-y-auto rounded-3xl border border-hairline bg-surface-2 p-6 shadow-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[19px] font-semibold leading-7 tracking-[-0.2px] text-primary">
                  Upload a font
                </div>
                <p className="mt-1 text-body leading-[20px] text-tertiary">
                  Up to {MAX_FONTS} fonts, {MAX_FONT_BYTES / 1024}KB each. It stays on this
                  machine and works offline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-tertiary hover:bg-white/[0.06] hover:text-primary"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            <input
              ref={input}
              type="file"
              accept={FONT_ACCEPT}
              hidden
              onChange={(e) => {
                void take(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              className="fcc-lift mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold shadow-overlay disabled:opacity-60"
            >
              <Upload size={17} strokeWidth={2.5} />
              {busy ? "Reading…" : "Choose a font file"}
            </button>

            {error ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-danger-dim bg-danger-wash p-3">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" strokeWidth={2} />
                <p className="text-caption leading-[17px] text-secondary">{error}</p>
              </div>
            ) : null}

            <Section title="Formats it takes">
              {FONT_FORMATS.map((f) => (
                <div key={f.ext} className="flex items-baseline gap-2.5 py-1">
                  <code className="w-[58px] shrink-0 font-mono text-caption text-accent">{f.ext}</code>
                  <span className="text-caption text-tertiary">{f.note}</span>
                </div>
              ))}
            </Section>

            <Section title="Where to get one">
              {FONT_SOURCES.map((s) => (
                <a
                  key={s.url}
                  href={`https://${s.url}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group flex items-baseline gap-2 py-1.5 hover:text-primary"
                >
                  <span className="text-caption font-semibold text-secondary group-hover:text-accent">
                    {s.name}
                  </span>
                  <ExternalLink size={11} className="shrink-0 self-center text-muted" />
                  <span className="min-w-0 truncate text-caption text-tertiary">{s.note}</span>
                </a>
              ))}
            </Section>

            <p className="mt-5 border-t border-hairline pt-4 text-caption leading-[17px] text-muted">
              Check the licence before you post with it. Most free fonts allow commercial
              use; a few are personal-use only, and that is on the download page rather
              than in the file.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-1.5 text-overline uppercase text-tertiary">{title}</div>
      {children}
    </section>
  );
}
