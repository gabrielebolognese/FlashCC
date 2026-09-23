/**
 * One post, opened up. Stage, slot, link, caption and the numbers.
 *
 * Metric entry is manual and that is on purpose for now: it costs a minute a post and
 * it proves whether the loop is worth automating before anyone builds an OAuth
 * integration for it. The fields are laid out in the order the platforms show them so
 * it can be done by copying straight down the page.
 */
import { Check, Copy, ExternalLink, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Chip } from "./Dash.js";
import { listPosts } from "./pipeline.js";
import { collectSeries, seriesCaption, seriesTitle } from "./series.js";
import { listDocs, loadDoc } from "./storage.js";
import { captionFit, captionOf, firstCommentOf } from "./transcript.js";
import {
  EMPTY_METRICS,
  METRIC_FIELDS,
  OBJECTIVES,
  PLATFORMS,
  STAGES,
  engagementRate,
  engagements,
  fromLocalInput,
  toLocalInput,
  type Metrics,
  type Objective,
  type Platform,
  type Post,
  type Stage,
} from "./pipeline.js";
import { percent } from "./insights.js";

const field =
  "h-8 w-full rounded-xl border border-hairline bg-surface-1 px-2.5 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim";

/** A blank line between two blocks of caption text. */
const BREAK = "\n\n";

function SmallButton({
  icon: Icon,
  label,
  onClick,
  title,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-7 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-caption text-tertiary hover:border-accent-dim hover:text-accent"
    >
      <Icon size={12} strokeWidth={2} />
      {label}
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-overline uppercase text-tertiary">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1 block text-caption text-muted">{hint}</span> : null}
    </label>
  );
}

export function PostSheet({
  post,
  onSave,
  onDelete,
  onClose,
}: {
  post: Post;
  onSave: (p: Post) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Post>(post);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  /**
   * The carousel this publishes, loaded once.
   *
   * Everything below derives from the DECK rather than from the post, because
   * the deck is what goes out. A caption pulled from a stale copy of the words
   * would describe a carousel nobody published.
   */
  const doc = useMemo(() => (draft.docId ? loadDoc(draft.docId) : null), [draft.docId]);

  const series = useMemo(() => {
    if (!draft.series) return null;
    const views = collectSeries(listDocs(), [draft]);
    return views.find((v) => v.id === draft.series?.id) ?? null;
  }, [draft]);

  const fit = captionFit(draft.caption, draft.platform);

  /**
   * Suggestions, not a controlled list.
   *
   * A pillar is somebody's own vocabulary, so the field stays free text, but
   * offering what they have already used is what stops "Education", "education"
   * and "Educational" becoming three buckets in the attribution table.
   */
  const known = useMemo(() => {
    const pillars = new Set<string>();
    const campaigns = new Set<string>();
    for (const post of listPosts()) {
      if (post.pillar.trim()) pillars.add(post.pillar.trim());
      if (post.campaign.trim()) campaigns.add(post.campaign.trim());
    }
    return { pillars: [...pillars].sort(), campaigns: [...campaigns].sort() };
  }, []);

  const copy = (what: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 1600);
  };

  const set = (patch: Partial<Post>) => setDraft((d) => ({ ...d, ...patch }));
  const metrics: Metrics = draft.metrics ?? EMPTY_METRICS;

  const setMetric = (key: keyof Metrics, raw: string) => {
    const n = Math.max(0, Math.round(Number(raw) || 0));
    set({ metrics: { ...metrics, [key]: n } });
  };

  const save = () => {
    onSave({ ...draft, updatedAt: new Date().toISOString() });
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/50" onClick={onClose} />

      <aside className="fixed right-0 top-0 z-modal flex h-full w-[440px] max-w-full flex-col border-l border-hairline bg-surface-2 shadow-modal">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-4">
          <span className="text-title text-primary">Post</span>
          <Chip tone={draft.stage === "posted" ? "success" : "plain"}>
            {STAGES.find((s) => s.id === draft.stage)?.label ?? draft.stage}
          </Chip>
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

        <div className="scroll-quiet flex-1 space-y-4 overflow-y-auto p-4">
          <Row label="Title">
            <input
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
              className={field}
              placeholder="What is this post"
            />
          </Row>

          <Row label="Hook" hint="The first line on slide one. Analytics groups by its shape.">
            <textarea
              value={draft.hook}
              onChange={(e) => set({ hook: e.target.value })}
              rows={2}
              className={`${field} h-auto resize-none py-2 leading-4`}
              placeholder="Why do your edits feel slow?"
            />
          </Row>

          <div className="grid grid-cols-2 gap-3">
            <Row label="Platform">
              <select
                value={draft.platform}
                onChange={(e) => set({ platform: e.target.value as Platform })}
                className={field}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Stage">
              <select
                value={draft.stage}
                onChange={(e) => {
                  const stage = e.target.value as Stage;
                  set({
                    stage,
                    postedAt:
                      stage === "posted"
                        ? (draft.postedAt ?? draft.scheduledFor ?? new Date().toISOString())
                        : null,
                  });
                }}
                className={field}
              >
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Row>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Row label="Scheduled for">
              <input
                type="datetime-local"
                value={toLocalInput(draft.scheduledFor)}
                onChange={(e) => set({ scheduledFor: fromLocalInput(e.target.value) })}
                className={field}
              />
            </Row>
            <Row label="Posted at">
              <input
                type="datetime-local"
                value={toLocalInput(draft.postedAt)}
                onChange={(e) => set({ postedAt: fromLocalInput(e.target.value) })}
                className={field}
                disabled={draft.stage !== "posted"}
              />
            </Row>
          </div>

          <Row label="Link">
            <div className="flex gap-1.5">
              <input
                value={draft.url ?? ""}
                onChange={(e) => set({ url: e.target.value || null })}
                className={field}
                placeholder="https://"
              />
              {draft.url ? (
                <a
                  href={draft.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="Open the live post"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-hairline text-tertiary hover:text-primary"
                >
                  <ExternalLink size={13} strokeWidth={2} />
                </a>
              ) : null}
            </div>
          </Row>

          <Row label="Caption">
            <textarea
              value={draft.caption}
              onChange={(e) => set({ caption: e.target.value })}
              rows={4}
              className={`${field} h-auto resize-y py-2 leading-4`}
              placeholder="The text that goes around the carousel."
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {/*
                The workflow experienced creators already hand-roll: write the
                carousel first, then pull the text post out of slides 1 and 2.
                Deterministic, because those words are already approved, a model
                rewriting them here would be answering a question nobody asked.
              */}
              {doc ? (
                <>
                  <SmallButton
                    icon={Sparkles}
                    label="Pull from the deck"
                    onClick={() => set({ caption: captionOf(doc, { platform: draft.platform }) })}
                  />
                  <SmallButton
                    icon={copied === "transcript" ? Check : Copy}
                    label={copied === "transcript" ? "Copied" : "Copy transcript"}
                    title="The whole deck as plain text, for the first comment. Per-slide alt text is impossible on both platforms, so this is the only fix there is."
                    onClick={() =>
                      copy("transcript", firstCommentOf(doc, { platform: draft.platform }))
                    }
                  />
                </>
              ) : (
                <span className="text-caption text-muted">
                  Link this post to a carousel and the caption can be pulled from it.
                </span>
              )}
              <div className="flex-1" />
              <span className={fit.over ? "text-caption text-danger" : "text-caption text-muted"}>
                {fit.used} / {fit.limit}
              </span>
            </div>
            {fit.over ? (
              <p className="mt-1 text-caption leading-4 text-danger">
                Over the limit for {draft.platform}. It will be cut off live rather than rejected,
                which is worse, because nothing will say so.
              </p>
            ) : null}
          </Row>

          {/*
            The evidenced pain is discovery: "My Part 4 has 1M views but Part 1
            has only 5K, because viewers can't find it." Neither platform lets a
            carousel link to another post, so a list in the caption is the only
            surface left.
          */}
          {series && draft.series ? (
            <div className="rounded-2xl border border-hairline bg-surface-1 p-3">
              <div className="flex items-center gap-2">
                <span className="text-overline uppercase text-tertiary">Series</span>
                <Chip>
                  {draft.series.part} of {series.parts.length}
                </Chip>
                <div className="flex-1" />
                <span className="text-caption text-muted">{series.posted} live</span>
              </div>

              <p className="mt-2 text-body text-secondary">
                {seriesTitle(series.name, draft.series.part, series.parts.length)}
              </p>

              <pre className="scroll-quiet mt-2 max-h-[132px] overflow-auto whitespace-pre-wrap rounded-xl border border-hairline bg-surface-2 p-2.5 font-mono text-caption leading-4 text-tertiary">
                {seriesCaption(series, { current: draft.series.part })}
              </pre>

              <div className="mt-2 flex items-center gap-1.5">
                <SmallButton
                  icon={copied === "series" ? Check : Copy}
                  label={copied === "series" ? "Copied" : "Copy the list"}
                  onClick={() =>
                    copy("series", seriesCaption(series, { current: draft.series?.part }))
                  }
                />
                <SmallButton
                  icon={Sparkles}
                  label="Add it to the caption"
                  onClick={() =>
                    set({
                      caption: [
                        draft.caption.trim(),
                        seriesCaption(series, { current: draft.series?.part }),
                      ]
                        .filter(Boolean)
                        .join(BREAK),
                    })
                  }
                />
              </div>

              <p className="mt-2 text-caption leading-4 text-muted">
                Parts already live carry their real link. Paste this into every part and somebody
                who lands on part four can find part one.
              </p>
            </div>
          ) : null}

          {/*
            The five fields every Notion and Airtable content calendar has and
            `posts` did not. Grouped under one heading rather than scattered
            through the sheet: they are planning metadata, and somebody filling
            them in is doing one job, not five.
          */}
          <div className="rounded-2xl border border-hairline bg-surface-1 p-3">
            <span className="text-overline uppercase text-tertiary">Planning</span>

            <div className="mt-2 grid grid-cols-2 gap-2.5">
              <label className="block">
                <span className="text-caption text-tertiary">Pillar</span>
                <input
                  list="fcc-pillars"
                  value={draft.pillar}
                  onChange={(e) => set({ pillar: e.target.value })}
                  placeholder="Education, Behind the scenes…"
                  className={`${field} mt-1`}
                />
                <datalist id="fcc-pillars">
                  {known.pillars.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </label>

              <label className="block">
                <span className="text-caption text-tertiary">Campaign</span>
                <input
                  list="fcc-campaigns"
                  value={draft.campaign}
                  onChange={(e) => set({ campaign: e.target.value })}
                  placeholder="A launch, a season"
                  className={`${field} mt-1`}
                />
                <datalist id="fcc-campaigns">
                  {known.campaigns.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </label>

              <label className="block">
                <span className="text-caption text-tertiary">Objective</span>
                <select
                  value={draft.objective ?? ""}
                  onChange={(e) => set({ objective: (e.target.value || null) as Objective | null })}
                  className={`${field} mt-1`}
                >
                  <option value="">Not set</option>
                  {OBJECTIVES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-caption text-tertiary">Reviewer</span>
                <input
                  value={draft.reviewer}
                  onChange={(e) => set({ reviewer: e.target.value })}
                  placeholder="Who signs it off"
                  className={`${field} mt-1`}
                />
              </label>
            </div>

            <label className="mt-2.5 block">
              <span className="text-caption text-tertiary">Approval notes</span>
              <textarea
                value={draft.approvalNotes}
                onChange={(e) => set({ approvalNotes: e.target.value })}
                rows={2}
                className={`${field} mt-1 h-auto resize-y py-2 leading-4`}
                placeholder="What they said when they signed it off."
              />
            </label>

            <p className="mt-2 text-caption leading-4 text-muted">
              Pillar and objective are grouped by the insight screens. Campaign and reviewer are
              proper nouns, so they are recorded but never attributed, one bucket per post is a
              list, not a finding.
            </p>
          </div>

          <Row label="Notes">
            <textarea
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={2}
              className={`${field} h-auto resize-y py-2 leading-4`}
              placeholder="Anything worth remembering next time."
            />
          </Row>

          {/* Numbers only make sense once it is live. */}
          {draft.stage === "posted" ? (
            <div className="rounded-2xl border border-hairline bg-surface-1 p-3">
              <div className="flex items-center gap-2">
                <span className="text-overline uppercase text-tertiary">Results</span>
                <div className="flex-1" />
                <span className="text-caption text-tertiary">
                  {engagements(metrics)} engagements · {percent(engagementRate(metrics))}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {METRIC_FIELDS.map((f) => (
                  <label key={f.key} className="block">
                    <span className="text-caption text-secondary">{f.label}</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={String(metrics[f.key])}
                      onChange={(e) => setMetric(f.key, e.target.value)}
                      className={`${field} mt-1`}
                    />
                  </label>
                ))}
              </div>

              <p className="mt-2.5 text-caption text-muted">
                Reach is the one that matters: every comparison on the insight screens is a ratio
                against it, so a post without it is left out rather than counted as zero.
              </p>
            </div>
          ) : null}
        </div>

        <footer className="flex h-14 shrink-0 items-center gap-2 border-t border-hairline px-4">
          {confirmDelete ? (
            <>
              <span className="text-caption text-secondary">Delete this post?</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex h-8 items-center rounded-xl border border-hairline px-3 text-body text-secondary hover:text-primary"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(draft.id);
                  onClose();
                }}
                className="flex h-8 items-center rounded-xl border border-danger-dim bg-danger-wash px-3 text-body-strong text-danger"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                aria-label="Delete this post"
                onClick={() => setConfirmDelete(true)}
                className="grid h-8 w-8 place-items-center rounded-xl text-tertiary hover:bg-white/[0.06] hover:text-danger"
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 items-center rounded-xl border border-hairline px-3 text-body text-secondary hover:text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
                className="flex h-8 items-center rounded-xl px-3.5 text-body-strong hover:brightness-110"
              >
                Save
              </button>
            </>
          )}
        </footer>
      </aside>
    </>
  );
}
