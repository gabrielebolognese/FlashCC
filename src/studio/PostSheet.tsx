/**
 * One post, opened up. Stage, slot, link, caption and the numbers.
 *
 * Metric entry is manual and that is on purpose for now: it costs a minute a post and
 * it proves whether the loop is worth automating before anyone builds an OAuth
 * integration for it. The fields are laid out in the order the platforms show them so
 * it can be done by copying straight down the page.
 */
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  PenLine,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Chip } from "./Dash.js";
import { listPosts } from "./pipeline.js";
import { collectSeries, seriesCaption, seriesTitle } from "./series.js";
import { listDocs, loadDoc } from "./storage.js";
import { captionFit, captionOf, deckTexts, firstCommentOf } from "./transcript.js";
import { isCaptionPlatform, writeCaption, type CaptionResult } from "./caption.js";
import { listBrands, voiceOf } from "./brand.js";
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


/**
 * The written captions, as a list to choose from.
 *
 * Inline rather than a modal: the thing you are comparing them against is the
 * textarea directly above, and a dialog would cover it.
 *
 * **The fold marker is the point of this panel.** On LinkedIn only the first 210
 * characters show before "see more", so a caption is really two things: the part
 * that has to earn the expand, and the part nobody reads unless it did. Showing
 * where that line falls before the caption is chosen is the difference between
 * knowing and finding out after posting.
 */
function CaptionOptions({
  state,
  onPick,
  onClose,
  onCopyTags,
  copiedTags,
}: {
  state: { at: "loading" } | { at: "ready"; result: CaptionResult } | { at: "failed"; error: string };
  onPick: (text: string) => void;
  onClose: () => void;
  onCopyTags: (tags: string[]) => void;
  copiedTags: boolean;
}) {
  if (state.at === "loading") {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-hairline bg-surface-2 px-3 py-2.5">
        <RefreshCw size={13} strokeWidth={2} className="fcc-spin shrink-0 text-accent" />
        <span className="text-caption text-secondary">Reading the deck…</span>
      </div>
    );
  }

  if (state.at === "failed") {
    return (
      <div className="mt-2 flex items-start gap-2 rounded-xl border border-danger-dim bg-danger-wash p-2.5">
        <AlertCircle size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-danger" />
        <p className="flex-1 text-caption leading-4 text-secondary">{state.error}</p>
        <button type="button" onClick={onClose} className="text-caption text-tertiary hover:text-primary">
          Close
        </button>
      </div>
    );
  }

  const { captions, hashtags, limit, fold } = state.result;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {captions.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(c.text)}
          className="rounded-xl border border-hairline bg-surface-2 p-2.5 text-left hover:border-accent-dim hover:bg-accent-wash"
        >
          <div className="whitespace-pre-wrap text-caption leading-[17px] text-primary">
            {fold && c.text.length > fold ? (
              <>
                {c.text.slice(0, fold)}
                <span className="mx-1 rounded border border-accent-dim px-1 text-[10px] uppercase tracking-[0.4px] text-accent">
                  see more
                </span>
                <span className="text-tertiary">{c.text.slice(fold)}</span>
              </>
            ) : (
              c.text
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-caption text-accent">{c.note}</span>
            <span className={c.chars > limit ? "text-caption text-danger" : "text-caption text-muted"}>
              {c.chars} / {limit}
            </span>
          </div>
        </button>
      ))}

      {hashtags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {/*
            Never appended to the caption automatically. Half of people put tags
            in a first comment instead, and a caption that silently contains
            them is one somebody has to unpick.
          */}
          {hashtags.map((t) => (
            <span key={t} className="rounded-md border border-hairline px-1.5 py-0.5 text-caption text-tertiary">
              #{t}
            </span>
          ))}
          <SmallButton
            icon={copiedTags ? Check : Copy}
            label={copiedTags ? "Copied" : "Copy tags"}
            onClick={() => onCopyTags(hashtags)}
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <span className="text-caption text-muted">Not ranked. Pick the one that sounds like you.</span>
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="text-caption text-tertiary hover:text-primary">
          Close
        </button>
      </div>
    </div>
  );
}

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
  /** The AI caption panel: null when closed, so opening costs one model call. */
  const [written, setWritten] = useState<
    { at: "loading" } | { at: "ready"; result: CaptionResult } | { at: "failed"; error: string } | null
  >(null);

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
  // What the deck actually asks for, so a written caption does not contradict
  // the closing slide.
  const lastSlide = doc ? deckTexts(doc).filter((t) => t.trim()).slice(-1)[0] : undefined;
  // Narrowed once, here, rather than inside a callback where the guard on the
  // surrounding JSX cannot reach. `x` has a 280 character ceiling and no
  // carousel, so it is not one of the three the caption prompt knows.
  const captionPlatform = isCaptionPlatform(draft.platform) ? draft.platform : null;

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
                    title="Slides 1 and 2 and the closer, rearranged. No model, no key, and the words are already yours."
                    onClick={() => set({ caption: captionOf(doc, { platform: draft.platform }) })}
                  />
                  {/*
                    Beside the deterministic one, never instead of it. Pulling
                    from the deck rearranges copy that is already approved and
                    costs nothing; this writes something new. They answer
                    different questions and the screen has to show both.
                  */}
                  {captionPlatform ? (
                    <SmallButton
                      icon={PenLine}
                      label="Write one"
                      title={`A caption written for ${draft.platform}, from the whole deck.`}
                      onClick={() => {
                        setWritten({ at: "loading" });
                        writeCaption({
                          deck: deckTexts(doc),
                          platform: captionPlatform,
                          ...(lastSlide ? { cta: lastSlide } : {}),
                          voice: voiceOf(doc, listBrands()),
                        })
                          .then((result) => setWritten({ at: "ready", result }))
                          .catch((e: unknown) =>
                            setWritten({
                              at: "failed",
                              error: e instanceof Error ? e.message : "Could not write a caption",
                            }),
                          );
                      }}
                    />
                  ) : null}
                  <SmallButton
                    icon={copied === "transcript" ? Check : Copy}
                    label={copied === "transcript" ? "Copied" : "Copy transcript"}
                    title="The whole deck as plain text, for the first comment. On LinkedIn a document post is one PDF with no per-page alt field, so this is the accessible answer there. Instagram and TikTok take per-image alt text, which the export dialog writes."
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

            {written ? (
              <CaptionOptions
                state={written}
                onPick={(text) => {
                  set({ caption: text });
                  setWritten(null);
                }}
                onClose={() => setWritten(null)}
                onCopyTags={(tags) => copy("tags", tags.map((t) => `#${t}`).join(" "))}
                copiedTags={copied === "tags"}
              />
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
