import { FolderPlus, Layers, Sparkles, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { buildSlides, type BuildOptions } from "./compositions.js";
import { buildDocs, countSlides, parseBulk, SAMPLE_BULK, SEPARATOR } from "./bulk.js";
import type { Doc } from "./model.js";
import { SlidePreview } from "./SlidePreview.js";
import { DEFAULT_STRUCTURE, STRUCTURES, type Structure } from "./structures.js";
import { DEFAULT_STYLE, type Style } from "./styles.js";

const LOAD_MS = 1400;

export function BulkCreate({
  styles,
  build,
  onDone,
  onCancel,
}: {
  styles: Style[];
  build: BuildOptions;
  onDone: (docs: Doc[]) => void;
  onCancel: () => void;
}) {
  const [source, setSource] = useState("");
  const [group, setGroup] = useState("");
  const [structure, setStructure] = useState<Structure>(DEFAULT_STRUCTURE);
  const [style, setStyle] = useState<Style>(styles[0] ?? DEFAULT_STYLE);
  const [creating, setCreating] = useState<Doc[] | null>(null);

  const blocks = useMemo(() => parseBulk(source), [source]);
  const slides = countSlides(blocks);

  const preview = useMemo(() => {
    const first = blocks[0];
    if (!first) return undefined;
    return buildSlides(first.texts.slice(0, 1), style.theme, ["hook"], build)[0];
  }, [blocks, style, build]);

  useEffect(() => {
    if (!creating) return;
    const t = window.setTimeout(() => onDone(creating), LOAD_MS);
    return () => window.clearTimeout(t);
  }, [creating, onDone]);

  if (creating) return <Creating count={creating.length} accent={style.theme.accent} />;

  const go = () =>
    setCreating(buildDocs(blocks, structure, style.theme, build, group.trim() || undefined));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-surface-1 px-5">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          className="grid h-8 w-8 place-items-center rounded-xl text-tertiary hover:bg-white/[0.06] hover:text-primary"
        >
          <X size={16} strokeWidth={2} />
        </button>
        <div>
          <div className="text-title text-primary">Bulk create</div>
          <div className="text-caption text-muted">
            {blocks.length === 0
              ? `Separate each carousel with ${SEPARATOR}`
              : `${blocks.length} carousel${blocks.length === 1 ? "" : "s"} · ${slides} slides`}
          </div>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          disabled={blocks.length === 0}
          onClick={go}
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          className="fcc-lift flex h-9 items-center gap-2 rounded-xl px-4 text-body-strong shadow-overlay disabled:pointer-events-none disabled:opacity-40"
        >
          <Sparkles size={15} strokeWidth={2.5} />
          Create {blocks.length || ""} carousel{blocks.length === 1 ? "" : "s"}
        </button>
      </header>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 py-8 lg:flex-row">
          {/* the paste */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-overline uppercase text-tertiary">Your posts</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setSource(SAMPLE_BULK)}
                className="h-7 rounded-lg px-2 text-caption text-muted hover:bg-white/[0.04] hover:text-primary"
              >
                Paste an example
              </button>
            </div>

            <textarea
              autoFocus
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={`Paste all your posts here.\n\nBlank line = new slide.\n${SEPARATOR}\nThree dashes = new carousel.`}
              className="min-h-[420px] w-full flex-1 resize-none rounded-2xl border border-hairline bg-surface-1 p-4 font-mono text-[13px] leading-[21px] text-primary outline-none placeholder:text-muted focus:border-accent-dim"
            />

            {blocks.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {blocks.map((b, i) => (
                  <span
                    key={i}
                    className="max-w-[220px] truncate rounded-lg border border-hairline px-2 py-1 text-caption text-tertiary"
                    title={b.title}
                  >
                    {i + 1}. {b.title}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* the settings, applied to all of them */}
          <div className="w-full shrink-0 lg:w-[320px]">
            <Field label="Group">
              <div className="flex h-10 items-center gap-2 rounded-xl border border-hairline bg-surface-1 px-3">
                <FolderPlus size={15} strokeWidth={2} className="shrink-0 text-muted" />
                <input
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  placeholder="Optional, e.g. March batch"
                  className="min-w-0 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-muted"
                />
              </div>
            </Field>

            <Field label="Framework">
              <div className="grid grid-cols-2 gap-1.5">
                {STRUCTURES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStructure(s)}
                    className={[
                      "rounded-xl border px-2.5 py-2 text-left text-caption",
                      s.id === structure.id
                        ? "border-accent-dim bg-accent-wash text-accent"
                        : "border-hairline text-tertiary hover:text-primary",
                    ].join(" ")}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Style">
              <div className="flex flex-wrap gap-1.5">
                {styles.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.name}
                    onClick={() => setStyle(s)}
                    className={[
                      "grid h-9 w-9 place-items-center rounded-xl border-2",
                      s.id === style.id ? "border-accent" : "border-hairline hover:border-surface-5",
                    ].join(" ")}
                    style={{ background: s.theme.bg }}
                  >
                    <span
                      className="block h-2.5 w-2.5 rounded-full"
                      style={{ background: s.theme.accent }}
                    />
                  </button>
                ))}
              </div>
            </Field>

            {preview ? (
              <Field label="First slide">
                <SlidePreview
                  slide={preview}
                  className="rounded-2xl border border-hairline shadow-overlay"
                />
              </Field>
            ) : (
              <p className="mt-3 text-caption leading-[17px] text-muted">
                Everything here applies to every carousel in the batch. You can change any
                of it afterwards, one project at a time.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Creating({ count, accent }: { count: number; accent: string }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / LOAD_MS);
      setPct(t * 100);
      if (t >= 1) window.clearInterval(id);
    }, 40);
    return () => window.clearInterval(id);
  }, []);

  const done = Math.min(count, Math.max(1, Math.round((pct / 100) * count)));

  return (
    <div className="relative grid h-full place-items-center overflow-hidden bg-base">
      <div className="fcc-aurora" />
      <div className="fcc-enter relative w-[420px] px-6">
        <div className="mb-1 flex items-center gap-2.5">
          <Wand2 size={20} strokeWidth={2.2} style={{ color: accent }} />
          <span className="text-[22px] font-semibold leading-8 tracking-[-0.3px] text-primary">
            Building {count} carousel{count === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mb-5 flex items-center gap-1.5 text-body text-tertiary">
          <Layers size={14} strokeWidth={2} />
          {done} of {count} laid out
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: "var(--brand-gold)", boxShadow: `0 0 12px ${accent}99` }}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-overline uppercase text-tertiary">{label}</div>
      {children}
    </div>
  );
}
