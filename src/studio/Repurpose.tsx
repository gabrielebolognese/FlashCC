/**
 * Paste a long thing, pick the moments, get carousels.
 *
 * Named `Repurpose` rather than `LongForm` because `longform.ts` sits beside it
 * and TypeScript refuses to hold both on a case-insensitive filesystem — the
 * third time this codebase has walked into that, after `Analytics`/`insights`
 * and `Library`/`library`.
 *
 * The interaction is deliberately in two steps, and the order is the whole
 * design. Across the research corpus nobody complains that the slides look bad;
 * they complain that the machine picked the wrong material:
 *
 *   "its virality score and my audience disagree, constantly... I have stopped
 *    trusting the ranking and now I scrub the whole thing myself anyway, which
 *    defeats the point of paying... Looking specifically for: I choose the
 *    moment, it does the work."
 *
 * So: candidates, then a choice, then the work. Nothing is scored, nothing is
 * pre-ticked and nothing is called recommended. What each candidate shows is
 * factual — where it came from, how much material it has, how many slides it
 * would make — because those are things a person can actually judge.
 *
 * Everything here is deterministic. It runs with no API key, which matters more
 * than it sounds: the thing people distrust is a model choosing their material,
 * and a heading is a choice the author already made.
 */
import { AlertTriangle, ArrowLeft, ChevronRight, FileText, Layers, Link2 } from "lucide-react";
import { useMemo, useState } from "react";

import { buildDocs } from "./bulk.js";
import { Chip, Empty } from "./Dash.js";
import { preview, readLongForm, slideEstimate, toBlocks, type Candidate } from "./longform.js";
import type { Doc } from "./model.js";
import { THEMES } from "./presets.js";
import { makeSeries, type SeriesMember } from "./series.js";
import { saveDoc } from "./storage.js";
import { STRUCTURES, type Structure } from "./structures.js";

const field =
  "w-full rounded-xl border border-hairline bg-surface-1 px-3 py-2.5 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim";

const SAMPLE = `## Cut on movement, not on the beat

Every cut lands on the beat and the edit still feels flat. The reason is that
attention resets when the frame changes, not when the snare hits.

Cut on movement instead. A hand leaving frame, a head turning, a door closing —
those are the moments the eye is already travelling, so the cut disappears.

## Punch in on the second sentence

A talking head is one shape for as long as you leave it there. Punch in fifteen
percent on the second sentence of every answer and the shape changes without
anybody noticing why.

Do it too often and it reads as a nervous tic. Twice an answer is plenty.`;

export function Repurpose({ onHome, onOpen }: { onHome: () => void; onOpen: (doc: Doc) => void }) {
  const [source, setSource] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [structure, setStructure] = useState<Structure>(() => STRUCTURES[0]!);
  const [theme, setTheme] = useState<keyof typeof THEMES>("ink");
  const [cta, setCta] = useState("");
  const [asSeries, setAsSeries] = useState(true);
  const [group, setGroup] = useState("");

  const read = useMemo(() => readLongForm(source), [source]);
  const chosen = read.candidates.filter((c) => picked.has(c.id));

  const toggle = (id: string) =>
    setPicked((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const slides = chosen.reduce((n, c) => n + slideEstimate(c, { cta }), 0);

  /**
   * Built through `buildDocs`, unchanged.
   *
   * The long-form path produces the same `BulkBlock[]` bulk create already
   * consumes, so there is one generation path rather than two that drift. Series
   * numbering is applied after, in the order the material ran in — which is the
   * order the author wrote it in, and the only order that can be right.
   */
  const build = () => {
    if (chosen.length === 0) return;

    const blocks = toBlocks(chosen, cta.trim() ? { cta: cta.trim() } : {});
    const docs = buildDocs(
      blocks,
      structure,
      THEMES[theme]!,
      {},
      group.trim() || undefined,
      undefined,
    );

    const numbered: Doc[] =
      asSeries && docs.length > 1
        ? makeSeries<SeriesMember>(docs.map((d) => ({ id: d.id, name: d.name }))).map((m, i) => ({
            ...docs[i]!,
            ...(m.series ? { series: m.series } : {}),
          }))
        : docs;

    for (const doc of numbered) saveDoc(doc);
    const first = numbered[0];
    if (first) onOpen(first);
  };

  return (
    <div className="flex h-full flex-col bg-base">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-6">
        <button
          type="button"
          onClick={onHome}
          className="flex h-8 items-center gap-1.5 rounded-xl px-2 text-caption text-tertiary hover:bg-white/[0.05] hover:text-primary"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Projects
        </button>
        <div className="min-w-0">
          <div className="truncate text-title text-primary">One asset, several carousels</div>
          <div className="truncate text-caption text-tertiary">
            Paste a post, a newsletter or a transcript. You pick the moments; it does the work.
          </div>
        </div>
      </header>

      <main className="scroll-quiet flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[1100px] pb-16">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            {/* ── the paste ── */}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-overline uppercase text-tertiary">What you wrote</span>
                {source ? <Chip>{shapeLabel(read.shape)}</Chip> : null}
                <div className="flex-1" />
                {source ? null : (
                  <button
                    type="button"
                    onClick={() => setSource(SAMPLE)}
                    className="text-caption text-tertiary hover:text-accent"
                  >
                    Use a sample
                  </button>
                )}
              </div>

              <textarea
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setPicked(new Set());
                }}
                rows={10}
                spellCheck={false}
                placeholder="Paste a blog post, a newsletter, or a transcript. Headings are followed when there are any."
                className={`${field} mt-2 resize-y leading-5`}
              />

              {read.warnings.map((w) => (
                <p
                  key={w}
                  className="mt-2 flex items-start gap-2 rounded-xl border border-hairline bg-surface-1 px-3 py-2 text-caption leading-4 text-tertiary"
                >
                  <AlertTriangle size={12} strokeWidth={2.2} className="mt-0.5 shrink-0 text-muted" />
                  {w}
                </p>
              ))}

              {/* ── the candidates ── */}
              {read.candidates.length > 0 ? (
                <div className="mt-6">
                  <div className="flex items-center gap-2">
                    <span className="text-overline uppercase text-tertiary">
                      Moments you could use
                    </span>
                    <Chip>{read.candidates.length} found</Chip>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() =>
                        setPicked(
                          picked.size === read.candidates.length
                            ? new Set()
                            : new Set(read.candidates.map((c) => c.id)),
                        )
                      }
                      className="text-caption text-tertiary hover:text-accent"
                    >
                      {picked.size === read.candidates.length ? "Clear" : "Take all"}
                    </button>
                  </div>

                  <p className="mt-1.5 text-caption leading-4 text-muted">
                    Nothing is ranked. You know which of these is worth a carousel.
                  </p>

                  <div className="mt-2.5 flex flex-col gap-2">
                    {read.candidates.map((c) => (
                      <CandidateRow
                        key={c.id}
                        candidate={c}
                        picked={picked.has(c.id)}
                        slides={slideEstimate(c, { cta })}
                        onToggle={() => toggle(c.id)}
                      />
                    ))}
                  </div>
                </div>
              ) : source.trim() ? null : (
                <div className="mt-6">
                  <Empty
                    icon={FileText}
                    title="Nothing pasted yet"
                    body="Headings become sections, and each section becomes one carousel. With no headings it is cut into even stretches, always at the end of a sentence."
                  />
                </div>
              )}
            </div>

            {/* ── the settings ── */}
            <div className="lg:sticky lg:top-0 lg:self-start">
              <span className="text-overline uppercase text-tertiary">How to build them</span>

              <label className="mt-2 block">
                <span className="text-caption text-tertiary">Framework</span>
                <select
                  value={structure.id}
                  onChange={(e) =>
                    setStructure(STRUCTURES.find((x) => x.id === e.target.value) ?? STRUCTURES[0]!)
                  }
                  className={`${field} mt-1 h-9 py-0`}
                >
                  {STRUCTURES.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-3">
                <span className="text-caption text-tertiary">Style</span>
                <div className="mt-1 flex items-center gap-1.5">
                  {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      title={id}
                      aria-label={`Theme: ${id}`}
                      onClick={() => setTheme(id)}
                      className={[
                        "grid h-7 w-7 place-items-center rounded-xl border-2",
                        theme === id ? "border-accent" : "border-hairline hover:border-surface-5",
                      ].join(" ")}
                      style={{ background: THEMES[id]!.bg }}
                    >
                      <span
                        className="block h-2 w-2 rounded-full"
                        style={{ background: THEMES[id]!.accent }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <label className="mt-3 block">
                <span className="text-caption text-tertiary">Closing slide</span>
                <input
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  placeholder="Save this for your next edit."
                  className={`${field} mt-1 h-9 py-0`}
                />
                <span className="mt-1 block text-caption leading-4 text-muted">
                  The same ask on every one, which is how anybody working in batches does it. Left
                  blank, there is no closing slide.
                </span>
              </label>

              <label className="mt-3 block">
                <span className="text-caption text-tertiary">Folder</span>
                <input
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  placeholder="Optional"
                  className={`${field} mt-1 h-9 py-0`}
                />
              </label>

              <label className="mt-3 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={asSeries}
                  onChange={(e) => setAsSeries(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--brand-gold)]"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-body text-secondary">
                    <Link2 size={12} strokeWidth={2} className="text-tertiary" />
                    Number them as a series
                  </span>
                  <span className="mt-0.5 block text-caption leading-4 text-muted">
                    Each part then carries a list of the others in its caption, so somebody who
                    lands on part four can find part one.
                  </span>
                </span>
              </label>

              <div className="mt-5 rounded-2xl border border-hairline bg-surface-1 p-3">
                <div className="text-body-strong text-primary">
                  {chosen.length === 0
                    ? "Nothing picked yet"
                    : `${chosen.length} carousel${chosen.length === 1 ? "" : "s"}, ${slides} slides`}
                </div>
                <button
                  type="button"
                  disabled={chosen.length === 0}
                  onClick={build}
                  style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                  className={[
                    "mt-2.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-body-strong",
                    chosen.length === 0 ? "pointer-events-none opacity-50" : "hover:brightness-110",
                  ].join(" ")}
                >
                  <Layers size={14} strokeWidth={2.4} />
                  Build {chosen.length || ""}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const shapeLabel = (shape: string): string =>
  shape === "markdown" ? "Read as an article" : shape === "transcript" ? "Read as a transcript" : "Read as prose";

function CandidateRow({
  candidate,
  picked,
  slides,
  onToggle,
}: {
  candidate: Candidate;
  picked: boolean;
  slides: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        "flex items-start gap-3 rounded-2xl border p-3 text-left",
        picked ? "border-accent-dim bg-accent-wash" : "border-hairline bg-surface-1 hover:border-surface-5",
      ].join(" ")}
    >
      <span
        className={[
          "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border",
          picked ? "border-accent bg-accent" : "border-hairline",
        ].join(" ")}
      >
        {picked ? <ChevronRight size={10} strokeWidth={3} className="text-base" /> : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-strong text-primary">{candidate.title}</span>
        <span className="mt-0.5 block text-caption leading-4 text-tertiary">
          {preview(candidate)}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2 text-caption text-muted">
          <span>{candidate.reason}</span>
          <span>·</span>
          <span>{slides} slides</span>
          {candidate.thin ? (
            <>
              <span>·</span>
              <span className="text-tertiary">short — expect a brief carousel</span>
            </>
          ) : null}
        </span>
      </span>
    </button>
  );
}
