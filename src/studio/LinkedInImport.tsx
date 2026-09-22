/**
 * Backfilling metrics from LinkedIn's own analytics export.
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
  HOW_LABEL,
  matchRows,
  parseAnalytics,
  SAMPLE_ANALYTICS,
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
  /** Rows somebody placed by hand, keyed by the row's line number. */
  const [manual, setManual] = useState<Record<number, string>>({});
  const [done, setDone] = useState<{ changed: number; filled: number } | null>(null);

  const parsed = useMemo(() => parseAnalytics(source), [source]);
  const auto = useMemo(() => matchRows(parsed.rows, posts), [parsed.rows, posts]);

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
      setDone(null);
    };
    reader.readAsText(file);
  };

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[680px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <span className="text-title text-primary">Import from LinkedIn</span>
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

          {!source ? (
            <>
              <p className="text-body leading-5 text-tertiary">
                In LinkedIn, go to your profile, open <b>Analytics</b>, then <b>Post impressions</b>,
                and use <b>Export</b>. Drop the file here and the numbers land on the posts they
                belong to.
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
                <button
                  type="button"
                  onClick={() => setSource(SAMPLE_ANALYTICS)}
                  className="text-caption text-tertiary hover:text-accent"
                >
                  Or try a sample
                </button>
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

          {/* What it understood, so a changed export is visible rather than silent. */}
          {source && parsed.ignored.length > 0 ? (
            <p className="mt-3 text-caption leading-4 text-muted">
              Columns it did not recognise and ignored: {parsed.ignored.join(", ")}. If a number you
              expected is missing, that is where it went.
            </p>
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
                        {post?.title ?? "—"}
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
                Place them yourself, or leave them — anything left alone is not written anywhere.
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
                        {row.metrics.impressions?.toLocaleString() ?? "—"} impressions
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
                      {posts
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
