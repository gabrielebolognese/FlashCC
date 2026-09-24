/**
 * Paste a long thing, pick the moments, get carousels.
 *
 * Named `Repurpose` rather than `LongForm` because `longform.ts` sits beside it
 * and TypeScript refuses to hold both on a case-insensitive filesystem, the
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
 * factual, where it came from, how much material it has, how many slides it
 * would make, because those are things a person can actually judge.
 *
 * Everything here is deterministic. It runs with no API key, which matters more
 * than it sounds: the thing people distrust is a model choosing their material,
 * and a heading is a choice the author already made.
 */
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  FileText,
  Layers,
  Link2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { buildDocs } from "./bulk.js";
import { distilSource, isReadableFile, MIN_SOURCE_CHARS, SOURCE_TYPES, type DistilResult } from "./distil.js";
import { listBrands, contextVoice } from "./brand.js";
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

Cut on movement instead. A hand leaving frame, a head turning, a door closing,
those are the moments the eye is already travelling, so the cut disappears.

## Punch in on the second sentence

A talking head is one shape for as long as you leave it there. Punch in fifteen
percent on the second sentence of every answer and the shape changes without
anybody noticing why.

Do it too often and it reads as a nervous tic. Twice an answer is plenty.`;

export function Repurpose({
  onHome,
  onOpen,
  onBrief,
}: {
  onHome: () => void;
  onOpen: (doc: Doc) => void;
  /** An angle chosen from a distilled source, on its way to the framework picker. */
  onBrief: (brief: string, quotes: string[]) => void;
}) {
  const [source, setSource] = useState("");
  /**
   * Which of the two readings is running.
   *
   * `own` is the deterministic path: `longform.ts`, free, no key, no account,
   * rearranging words already approved. `raw` sends the source to a model to
   * work out what is in it. They are not variants of one feature, they answer
   * different questions, and the switch asks that question in plain words
   * because the technical distinction means nothing to anybody.
   */
  const [mode, setMode] = useState<"own" | "raw">("own");
  const [read2, setRead2] = useState<
    { at: "idle" } | { at: "loading" } | { at: "ready"; result: DistilResult } | { at: "failed"; error: string }
  >({ at: "idle" });
  const [dropping, setDropping] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
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
   * numbering is applied after, in the order the material ran in, which is the
   * order the author wrote it in, and the only order that can be right.
   */
  /* ── the raw reading ──────────────────────────────────────────── */

  const readRaw = () => {
    setRead2({ at: "loading" });
    distilSource(source, { voice: contextVoice(listBrands(), undefined) })
      .then((result) => setRead2({ at: "ready", result }))
      .catch((e: unknown) =>
        setRead2({ at: "failed", error: e instanceof Error ? e.message : "Could not read that" }),
      );
  };

  /**
   * The angles, or the button that asks for them.
   *
   * Declared here rather than as a sibling component because it reads half the
   * screen's state and passing all of it down would be a longer signature than
   * the component.
   */
  function RawPanel() {
    if (read2.at === "idle") {
      return (
        <div className="mt-6 rounded-2xl border border-hairline bg-surface-1 p-4">
          <p className="text-caption leading-4 text-muted">
            It will read the whole thing and come back with several carousels it could become,
            plus any line worth quoting word for word.
          </p>
          <button
            type="button"
            disabled={source.trim().length < MIN_SOURCE_CHARS}
            onClick={readRaw}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className="mt-3 flex h-9 items-center gap-2 rounded-xl px-4 text-body-strong disabled:pointer-events-none disabled:opacity-40"
          >
            <Sparkles size={14} strokeWidth={2.4} />
            Read it
          </button>
          {source.trim().length > 0 && source.trim().length < MIN_SOURCE_CHARS ? (
            <p className="mt-2 text-caption text-muted">
              Too short to be worth reading. Paste the whole thing, or write a brief instead.
            </p>
          ) : null}
        </div>
      );
    }

    if (read2.at === "loading") {
      return (
        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-hairline bg-surface-1 px-4 py-3">
          <RefreshCw size={14} strokeWidth={2} className="fcc-spin shrink-0 text-accent" />
          <span className="text-body text-secondary">Reading it through…</span>
        </div>
      );
    }

    if (read2.at === "failed") {
      return (
        <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-danger-dim bg-danger-wash p-3">
          <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-body leading-5 text-secondary">{read2.error}</p>
            <button
              type="button"
              onClick={readRaw}
              className="mt-2 h-7 rounded-lg border border-hairline px-2.5 text-caption text-secondary hover:text-primary"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    const { angles, brief, quotes, used, total, clipped } = read2.result;

    return (
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <span className="text-overline uppercase text-tertiary">Carousels in this</span>
          <Chip>{angles.length}</Chip>
          {quotes.length > 0 ? (
            <span className="text-caption text-muted">
              {quotes.length} quotable line{quotes.length === 1 ? "" : "s"} found
            </span>
          ) : null}
        </div>

        {/* Reading half a transcript and saying nothing is the worst available
            behaviour, so when it clips it says by how much. */}
        {clipped ? (
          <p className="mt-2 text-caption leading-4 text-muted">
            It read the first {used.toLocaleString()} of {total.toLocaleString()} characters. The
            rest was left out, so split it up if the end matters.
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-2">
          {angles.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onBrief(a.brief, quotes)}
              className="rounded-2xl border border-hairline bg-surface-1 p-3.5 text-left hover:border-accent-dim hover:bg-accent-wash"
            >
              <div className="text-body-strong text-primary">{a.title}</div>
              <div className="mt-1 text-caption leading-4 text-accent">{a.why}</div>
              <div className="mt-2 text-caption leading-[17px] text-tertiary">{a.brief}</div>
            </button>
          ))}

          {/* Choosing wrong here is expensive, so not choosing has to lead
              somewhere rather than stall. */}
          <button
            type="button"
            onClick={() => onBrief(brief, quotes)}
            className="fcc-lift flex items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline px-4 py-3 text-caption text-tertiary hover:border-accent-dim hover:bg-accent-wash"
          >
            None of these, let me write my own
          </button>
        </div>
      </div>
    );
  }

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
              <div className="mb-3 flex flex-col gap-1 rounded-2xl border border-hairline bg-surface-1 p-1">
                {(
                  [
                    ["own", "It is already written how I want it", "Rearranged, never rewritten. Free, and works with no account."],
                    ["raw", "It is raw, work out what is in it", "Reads it and offers several carousels it could become."],
                  ] as const
                ).map(([id, label, note]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setMode(id);
                      setRead2({ at: "idle" });
                    }}
                    className={[
                      "rounded-xl px-3 py-2 text-left",
                      mode === id ? "bg-accent-wash" : "hover:bg-white/[0.04]",
                    ].join(" ")}
                  >
                    <span className={mode === id ? "block text-body-strong text-accent" : "block text-body-strong text-secondary"}>
                      {label}
                    </span>
                    <span className="mt-0.5 block text-caption leading-4 text-muted">{note}</span>
                  </button>
                ))}
              </div>

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

              {/*
                Drop straight onto the box, because a transcript arrives as a
                file far more often than it arrives on a clipboard. Text only:
                `longform.ts` already knows what a subtitle file is and unwraps
                it, and PDF is deliberately out, it is a dependency and an
                afternoon, and a PDF can be select-all-copied into here today.
              */}
              <textarea
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setPicked(new Set());
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropping(true);
                }}
                onDragLeave={() => setDropping(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropping(false);
                  const file = e.dataTransfer.files[0];
                  if (!file) return;
                  if (!isReadableFile(file.name)) {
                    setDropError(`${file.name} is not a text file. Accepted: ${SOURCE_TYPES}`);
                    return;
                  }
                  setDropError(null);
                  void file.text().then((text) => {
                    setSource(text);
                    setPicked(new Set());
                    setRead2({ at: "idle" });
                  });
                }}
                rows={10}
                spellCheck={false}
                placeholder="Paste a blog post, a newsletter or a transcript, or drop a .txt, .md, .vtt or .srt file here."
                className={[
                  field,
                  "mt-2 resize-y leading-5",
                  dropping ? "border-accent" : "",
                ].join(" ")}
              />

              {dropError ? (
                <p className="mt-2 text-caption leading-4 text-danger">{dropError}</p>
              ) : null}

              {(mode === "own" ? read.warnings : []).map((w) => (
                <p
                  key={w}
                  className="mt-2 flex items-start gap-2 rounded-xl border border-hairline bg-surface-1 px-3 py-2 text-caption leading-4 text-tertiary"
                >
                  <AlertTriangle size={12} strokeWidth={2.2} className="mt-0.5 shrink-0 text-muted" />
                  {w}
                </p>
              ))}

              {mode === "raw" ? <RawPanel /> : null}

              {/* ── the candidates ── */}
              {mode === "own" && read.candidates.length > 0 ? (
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
            {/* Framework, theme, CTA and series all configure the deterministic
                build. In raw mode the framework is chosen on the next screen and
                nothing else here applies yet, so the column goes rather than
                sitting there disabled. */}
            <div className={mode === "own" ? "lg:sticky lg:top-0 lg:self-start" : "hidden"}>
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
              <span className="text-tertiary">short, expect a brief carousel</span>
            </>
          ) : null}
        </span>
      </span>
    </button>
  );
}
