/**
 * Backfilling metrics from a platform's own analytics export: LinkedIn's, and
 * since 28.4 Instagram's and TikTok's.
 *
 * Manual entry is what makes the insight screens honest and it is also the thing
 * that stops people using them after a month. This is the release valve: paste a
 * year of numbers in one go.
 *
 * ── The screen is mostly about what did NOT match ────────────────────────────
 *
 * Matching is three passes of descending confidence (`linkedin.ts`), and the
 * interesting part is never the rows that worked. An import that quietly places
 * 40 of 60 is worse than one that places 40 and shows you the other 20, because
 * the first leaves somebody believing their history is complete. So unmatched
 * rows get a row each and a dropdown, and nothing is written until somebody
 * presses the button.
 *
 * Deterministic and offline: this parses a file and edits local records. No key,
 * no account, no network.
 */
import { AlertTriangle, ArrowRight, Check, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Chip } from "./Dash.js";
import {
  applyMatches,
  FIELD_LABELS,
  HOW_LABEL,
  IMPORT_SOURCES,
  importSource,
  matchRows,
  parseAnalytics,
  SAMPLE_ANALYTICS,
  type Field,
  type ImportSource,
  type Match,
} from "./linkedin.js";
import type { Post } from "./pipeline.js";

const field =
  "h-8 w-full rounded-xl border border-hairline bg-surface-1 px-2.5 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim";

export function LinkedInImport({
  posts,
  onApply,
  onClose,
}: {
  posts: Post[];
  onApply: (next: Post[]) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  /** Which export this is (28.4). Matching only ever looks at posts on its platform. */
  const [from, setFrom] = useState<ImportSource>("linkedin");
  /** The person's corrections to how the columns were read, by column index. */
  const [overrides, setOverrides] = useState<Record<number, Field | null>>({});
  const origin = importSource(from);
  const onPlatform = useMemo(() => posts.filter((p) => p.platform === origin.platform), [posts, origin.platform]);
  /** Rows somebody placed by hand, keyed by the row's line number. */
  const [manual, setManual] = useState<Record<number, string>>({});
  const [done, setDone] = useState<{ changed: number; filled: number } | null>(null);

  const parsed = useMemo(() => parseAnalytics(source, from, overrides), [source, from, overrides]);
  const auto = useMemo(() => matchRows(parsed.rows, posts, origin.platform), [parsed.rows, posts, origin.platform]);

  const chosen: Match[] = useMemo(() => {
    const byHand: Match[] = auto.unmatched.flatMap((row) => {
      const postId = manual[row.line];
      return postId ? [{ row, postId, how: "title" as const }] : [];
    });
    return [...auto.matches, ...byHand];
  }, [auto, manual]);

  // A post already claimed cannot be offered again, or two rows would land on
  // one post and the second would silently win.
  const taken = new Set(chosen.map((m) => m.postId));

  const run = () => {
    const out = applyMatches(posts, chosen);
    onApply(out.posts);
    setDone({ changed: out.changed, filled: out.filled });
  };

  const read = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSource(String(reader.result));
      setManual({});
      setOverrides({});
      setDone(null);
    };
    reader.readAsText(file);
  };

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[680px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <span className="text-title text-primary">Import analytics</span>
          {parsed.rows.length > 0 ? <Chip>{parsed.rows.length} rows</Chip> : null}
          <div className="flex-1" />
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-primary"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </header>

        <div className="scroll-quiet flex-1 overflow-y-auto p-5">
          {done ? (
            <div className="rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <Check size={14} strokeWidth={2.4} className="shrink-0 text-success" />
                <span className="text-body text-primary">
                  {done.changed} post{done.changed === 1 ? "" : "s"} updated, {done.filled} numbers
                  filled in.
                </span>
              </div>
              {auto.unmatched.length > Object.keys(manual).length ? (
                <p className="mt-1.5 text-caption leading-4 text-tertiary">
                  {auto.unmatched.length - Object.keys(manual).length} row
                  {auto.unmatched.length - Object.keys(manual).length === 1 ? "" : "s"} were left
                  unplaced. Nothing about them was changed.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mb-3 flex gap-1.5" data-testid="import-source">
            {IMPORT_SOURCES.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={from === x.id}
                onClick={() => {
                  setFrom(x.id);
                  setOverrides({});
                  setManual({});
                  setDone(null);
                }}
                className={[
                  "flex h-7 items-center rounded-md border px-2.5 text-caption",
                  from === x.id ? "border-accent text-primary" : "border-hairline text-tertiary hover:border-accent-dim hover:text-primary",
                ].join(" ")}
              >
                {x.label}
              </button>
            ))}
          </div>

          {!source ? (
            <>
              <p className="text-body leading-5 text-tertiary">
                {origin.howTo} Drop the file here and the numbers land on your {origin.label} posts, and only those: the same
                carousel on another platform keeps its own numbers.
              </p>

              <input
                ref={input}
                type="file"
                accept=".csv,.tsv,.txt,text/csv"
                hidden
                onChange={(e) => {
                  read(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                  className="flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-body-strong hover:brightness-110"
                >
                  <Upload size={14} strokeWidth={2.4} />
                  Choose the file
                </button>
                {from === "linkedin" ? (
                  <button
                    type="button"
                    onClick={() => setSource(SAMPLE_ANALYTICS)}
                    className="text-caption text-tertiary hover:text-accent"
                  >
                    Or try a sample
                  </button>
                ) : null}
              </div>

              <label className="mt-4 block">
                <span className="text-overline uppercase text-tertiary">Or paste it</span>
                <textarea
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  rows={5}
                  spellCheck={false}
                  placeholder="Post URL,Post title,Impressions,Likes…"
                  className={`${field} mt-1.5 h-auto resize-y py-2 font-mono leading-4`}
                />
              </label>
            </>
          ) : null}

          {parsed.warnings.map((w) => (
            <p
              key={w}
              className="mt-3 flex items-start gap-2 rounded-xl border border-hairline bg-surface-1 px-3 py-2 text-caption leading-4 text-tertiary"
            >
              <AlertTriangle size={12} strokeWidth={2.2} className="mt-0.5 shrink-0 text-muted" />
              {w}
            </p>
          ))}

          {/*
            How every column was read, and the person's say over it (28.4). None of
            these exports could be checked against a current real file, so the
            reading is shown before anything is written, never applied silently.
          */}
          {source && parsed.columns.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-hairline bg-surface-1 p-3" data-testid="column-map">
              <span className="text-overline uppercase text-tertiary">How the columns were read</span>
              {origin.verified ? null : (
                <p className="mt-1 text-caption leading-4 text-muted">
                  {origin.label}&rsquo;s export changes without notice and these names could not be checked against a current file.
                  Check each one against yours; change any it got wrong. Nothing is written until you press Fill in.
                </p>
              )}
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {parsed.columns.map((c) => (
                  <label key={c.index} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-caption text-secondary">{c.header || `Column ${c.index + 1}`}</span>
                    <select
                      aria-label={`Column ${c.header}`}
                      value={c.field ?? ""}
                      onChange={(e) => setOverrides((o) => ({ ...o, [c.index]: (e.target.value || null) as Field | null }))}
                      className="h-7 w-[130px] shrink-0 rounded-lg border border-hairline bg-surface-2 px-1.5 text-caption text-primary outline-none"
                    >
                      <option value="">Ignore</option>
                      {(Object.keys(FIELD_LABELS) as Field[]).map((f) => (
                        <option key={f} value={f}>
                          {FIELD_LABELS[f]}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {auto.matches.length > 0 ? (
            <div className="mt-4">
              <span className="text-overline uppercase text-tertiary">
                Matched on their own ({auto.matches.length})
              </span>
              <div className="mt-2 flex flex-col gap-1.5">
                {auto.matches.map((m) => {
                  const post = posts.find((p) => p.id === m.postId);
                  return (
                    <div
                      key={m.row.line}
                      className="flex items-center gap-2 rounded-xl border border-hairline bg-surface-1 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-caption text-tertiary">
                        {m.row.title || m.row.url}
                      </span>
                      <ArrowRight size={12} strokeWidth={2} className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate text-caption text-secondary">
                        {post?.title ?? "-"}
                      </span>
                      <span className="shrink-0 text-caption text-muted">{HOW_LABEL[m.how]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* The part that matters. */}
          {auto.unmatched.length > 0 ? (
            <div className="mt-4">
              <span className="text-overline uppercase text-tertiary">
                Nothing claimed these ({auto.unmatched.length})
              </span>
              <p className="mt-1 text-caption leading-4 text-muted">
                Place them yourself, or leave them, anything left alone is not written anywhere.
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {auto.unmatched.map((row) => (
                  <div
                    key={row.line}
                    className="flex items-center gap-2 rounded-xl border border-hairline bg-surface-1 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-caption text-secondary">
                        {row.title || row.url || `Row ${row.line}`}
                      </div>
                      <div className="text-caption text-muted">
                        {row.postedAt ?? "no date"} ·{" "}
                        {row.metrics.impressions?.toLocaleString() ?? "-"} impressions
                      </div>
                    </div>
                    <select
                      value={manual[row.line] ?? ""}
                      onChange={(e) =>
                        setManual((m) => {
                          const next = { ...m };
                          if (e.target.value) next[row.line] = e.target.value;
                          else delete next[row.line];
                          return next;
                        })
                      }
                      className="h-7 w-[230px] shrink-0 rounded-lg border border-hairline bg-surface-2 px-2 text-caption text-primary outline-none"
                    >
                      <option value="">Leave it</option>
                      {onPlatform
                        .filter((p) => !taken.has(p.id) || manual[row.line] === p.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex h-16 shrink-0 items-center gap-2 border-t border-hairline px-5">
          <span className="flex-1 text-caption text-muted">
            Only the numbers your file carries are written. Anything you typed by hand that it is
            silent about is kept.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center rounded-xl border border-hairline px-3.5 text-body text-secondary hover:text-primary"
          >
            {done ? "Done" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={chosen.length === 0 || done !== null}
            onClick={run}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className={[
              "flex h-9 items-center gap-1.5 rounded-xl px-4 text-body-strong",
              chosen.length === 0 || done !== null
                ? "pointer-events-none opacity-50"
                : "hover:brightness-110",
            ].join(" ")}
          >
            <Check size={14} strokeWidth={2.4} />
            Fill in {chosen.length || ""}
          </button>
        </footer>
      </div>
    </>
  );
}
