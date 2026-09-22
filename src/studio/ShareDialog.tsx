/**
 * The owner's half of review: make a link, watch what comes back, and be told
 * when an approval no longer matches the deck.
 *
 * ── The stale-approval warning is the reason this screen exists ──────────────
 *
 * "Three people approved the post. None of them approved the same version." A
 * share captures a snapshot; approving stamps that snapshot's fingerprint; and
 * if the deck has moved since, this says so — clearly, and without revoking
 * anything. Deciding on somebody's behalf that their approval is void is worse
 * than telling them it is old, because only they know whether the change
 * mattered.
 *
 * ── Two comment scopes, one feed ─────────────────────────────────────────────
 *
 * "The ability to show the feed to the clients externally so that they're able
 * to view only what's needed and not all our comments." Internal notes sit in
 * the same thread with a different mark, so the team reads one conversation, and
 * `server/review.ts` filters on the way out so a client reads a shorter one.
 * The filter is on the server rather than here because a leak in the other
 * direction is the single worst bug this product could ship.
 */
import {
  AlertTriangle,
  Check,
  Copy,
  Link2,
  Lock,
  MessageSquare,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { listBrands } from "./brand.js";
import { listClients } from "./clients.js";
import { Chip } from "./Dash.js";
import type { Doc } from "./model.js";
import { PLATFORMS, platformForSize } from "./platforms.js";
import {
  authorLabel,
  onSlide,
  stalenessOf,
  STATUS_LABEL,
  visibleTo,
  type Comment,
  type Share,
} from "./review.js";
import { sessionUserId } from "./session.js";
import {
  addInternalNote,
  createShare,
  listComments,
  listShares,
  recapture,
  revokeShare,
  reviewUrl,
  setResolved,
} from "./sharing.js";

type Phase = { at: "idle" } | { at: "working"; what: string } | { at: "failed"; error: string };

export function ShareDialog({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const userId = sessionUserId();
  const [shares, setShares] = useState<Share[]>([]);
  const [selected, setSelected] = useState<Share | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  const [noteSlide, setNoteSlide] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const brands = useMemo(() => listBrands(), []);
  const clients = useMemo(() => listClients(), []);
  const platform = useMemo(
    () => platformForSize(doc.width, doc.height) ?? PLATFORMS[0]!,
    [doc.width, doc.height],
  );

  // The brand a review page wears: the client's if the carousel has one, else
  // the first brand. An agency with one brand should never have to pick.
  const client = clients.find((c) => c.id === doc.clientId);
  const brandId = client?.brandId ?? brands[0]?.id;

  useEffect(() => {
    if (!userId) {
      setLoaded(true);
      return;
    }
    let alive = true;
    void listShares(doc.id, userId).then((rows) => {
      if (!alive) return;
      setShares(rows);
      setSelected(rows[0] ?? null);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [doc.id, userId]);

  useEffect(() => {
    if (!selected || !userId) {
      setComments([]);
      return;
    }
    let alive = true;
    void listComments(selected.id, userId).then((rows) => alive && setComments(rows));
    return () => {
      alive = false;
    };
  }, [selected, userId]);

  const staleness = selected ? stalenessOf(selected, doc) : { state: "none" as const };

  const create = async () => {
    if (!userId) return;
    setPhase({ at: "working", what: "Rendering the slides and hosting them…" });

    const result = await createShare(doc, {
      platform,
      userId,
      title: doc.name,
      ...(brandId ? { brandId } : {}),
      ...(doc.clientId ? { clientId: doc.clientId } : {}),
    });

    if (!result.ok) {
      setPhase({ at: "failed", error: result.error });
      return;
    }
    setShares((all) => [result.share, ...all]);
    setSelected(result.share);
    setPhase({ at: "idle" });
  };

  const refresh = async (share: Share) => {
    if (!userId) return;
    setPhase({ at: "working", what: "Re-rendering against the deck as it is now…" });
    const result = await recapture(share, doc, { platform, userId, ...(brandId ? { brandId } : {}) });
    if (!result.ok) {
      setPhase({ at: "failed", error: result.error });
      return;
    }
    setShares((all) => all.map((s) => (s.id === result.share.id ? result.share : s)));
    setSelected(result.share);
    setPhase({ at: "idle" });
  };

  const copy = (share: Share) => {
    void navigator.clipboard?.writeText(reviewUrl(share.token));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const postNote = async (scope: "internal" | "client") => {
    if (!selected || !userId || !note.trim()) return;
    const added = await addInternalNote(selected.id, userId, noteSlide, "You", note.trim(), scope);
    if (added) {
      setComments((all) => [...all, added]);
      setNote("");
    }
  };

  const busy = phase.at === "working";

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={busy ? undefined : onClose} />

      <div className="fixed left-1/2 top-1/2 z-modal flex max-h-[86vh] w-[640px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <span className="text-title text-primary">Send for review</span>
          {selected ? <Chip>{STATUS_LABEL[selected.status]}</Chip> : null}
          <div className="flex-1" />
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-primary disabled:opacity-40"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </header>

        <div className="scroll-quiet flex-1 overflow-y-auto p-5">
          {!userId ? (
            <div className="flex items-start gap-2.5 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
              <Lock size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-tertiary" />
              <div>
                <p className="text-body text-primary">A review link needs an account.</p>
                <p className="mt-1 text-caption leading-4 text-tertiary">
                  It is a URL somebody else opens, so there is no version of it that works only on
                  this machine — this is the one feature in FlashCC with no offline half.
                </p>
              </div>
            </div>
          ) : null}

          {/* ── the warning this screen exists for ── */}
          {staleness.state === "stale" ? (
            <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-danger-dim bg-danger-wash px-3.5 py-3">
              <AlertTriangle size={14} strokeWidth={2.2} className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0">
                <p className="text-body text-primary">
                  This was approved, but the carousel has changed since.
                </p>
                <p className="mt-1 text-caption leading-4 text-tertiary">
                  What they signed off is not what you would post now. Re-send it, or put the deck
                  back the way it was.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => selected && void refresh(selected)}
                  className="mt-2 flex h-7 items-center gap-1.5 rounded-lg border border-hairline bg-surface-1 px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent disabled:opacity-40"
                >
                  <RefreshCw size={12} strokeWidth={2} />
                  Re-send this version
                </button>
              </div>
            </div>
          ) : null}

          {staleness.state === "current" ? (
            <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
              <Check size={14} strokeWidth={2.4} className="shrink-0 text-success" />
              <span className="text-body text-secondary">
                Approved, and the deck still matches what they saw.
              </span>
            </div>
          ) : null}

          {/* ── the link ── */}
          {selected ? (
            <div className="rounded-2xl border border-hairline bg-surface-1 p-3.5">
              <div className="flex items-center gap-2">
                <Link2 size={13} strokeWidth={2} className="shrink-0 text-tertiary" />
                <code className="min-w-0 flex-1 truncate font-mono text-caption text-tertiary">
                  {reviewUrl(selected.token)}
                </code>
                <button
                  type="button"
                  onClick={() => copy(selected)}
                  className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent"
                >
                  {copied ? <Check size={12} strokeWidth={2.4} /> : <Copy size={12} strokeWidth={2} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <p className="mt-2 text-caption leading-4 text-muted">
                Anyone with this link can see the slides and comment. No account, no seat, no limit
                on how many people you send it to.
              </p>

              {selected.decidedAt ? (
                <p className="mt-2 text-caption leading-4 text-secondary">
                  {STATUS_LABEL[selected.status]} by {authorLabel(selected.decidedBy ?? "")}
                  {selected.decisionNote ? ` — "${selected.decisionNote}"` : ""}
                </p>
              ) : null}

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void refresh(selected)}
                  className="flex h-7 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-caption text-tertiary hover:border-accent-dim hover:text-accent disabled:opacity-40"
                >
                  <RefreshCw size={12} strokeWidth={2} />
                  Re-capture
                </button>
                <button
                  type="button"
                  disabled={busy || selected.status === "revoked"}
                  onClick={() => {
                    if (!userId) return;
                    void revokeShare(selected, userId).then((ok) => {
                      if (!ok) return;
                      const off: Share = { ...selected, status: "revoked" };
                      setShares((all) => all.map((s) => (s.id === off.id ? off : s)));
                      setSelected(off);
                    });
                  }}
                  className="flex h-7 items-center rounded-lg px-2.5 text-caption text-tertiary hover:text-danger disabled:opacity-40"
                >
                  Turn the link off
                </button>
              </div>
            </div>
          ) : loaded && userId ? (
            <p className="text-body leading-5 text-tertiary">
              A review link renders this carousel, hosts the slides, and gives you a URL your client
              can open without an account. They comment on a specific slide, then approve or ask for
              changes — and the approval is pinned to the version they saw.
            </p>
          ) : null}

          {/* ── the feed ── */}
          {selected ? (
            <div className="mt-5">
              <div className="flex items-center gap-2">
                <MessageSquare size={13} strokeWidth={2} className="text-tertiary" />
                <span className="text-overline uppercase text-tertiary">Conversation</span>
                <Chip>{visibleTo(comments, "owner").length}</Chip>
              </div>

              {comments.length === 0 ? (
                <p className="mt-2 text-caption leading-4 text-muted">
                  Nothing yet. Comments your client leaves appear here, beside any notes you add for
                  the team.
                </p>
              ) : (
                <div className="mt-2 flex flex-col gap-1.5">
                  {[null, ...doc.slides.map((_, i) => i)].map((slideIndex) => {
                    const thread = onSlide(comments, slideIndex);
                    if (thread.length === 0) return null;
                    return (
                      <div key={String(slideIndex)}>
                        <div className="mb-1 mt-1.5 text-caption text-muted">
                          {slideIndex === null ? "The deck overall" : `Slide ${slideIndex + 1}`}
                        </div>
                        {thread.map((c) => (
                          <Note
                            key={c.id}
                            comment={c}
                            onToggle={() => {
                              if (!userId) return;
                              void setResolved(c.id, userId, !c.resolved).then((ok) => {
                                if (!ok) return;
                                setComments((all) =>
                                  all.map((x) => (x.id === c.id ? { ...x, resolved: !x.resolved } : x)),
                                );
                              });
                            }}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── adding to it ── */}
              <div className="mt-3 rounded-2xl border border-hairline bg-surface-1 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-caption text-tertiary">About</span>
                  <select
                    value={noteSlide === null ? "all" : String(noteSlide)}
                    onChange={(e) =>
                      setNoteSlide(e.target.value === "all" ? null : Number(e.target.value))
                    }
                    className="h-7 rounded-lg border border-hairline bg-surface-2 px-2 text-caption text-primary outline-none"
                  >
                    <option value="all">the deck</option>
                    {doc.slides.map((_, i) => (
                      <option key={i} value={i}>
                        slide {i + 1}
                      </option>
                    ))}
                  </select>
                </div>

                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="A note for the team, or something to say to the client."
                  className="mt-2 h-auto w-full resize-y rounded-xl border border-hairline bg-surface-2 px-2.5 py-2 text-body leading-4 text-primary outline-none placeholder:text-muted focus:border-accent-dim"
                />

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!note.trim()}
                    onClick={() => void postNote("internal")}
                    title="Only your team sees this. The client never does."
                    className="flex h-7 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-caption text-tertiary hover:border-accent-dim hover:text-accent disabled:opacity-40"
                  >
                    <Lock size={11} strokeWidth={2} />
                    Internal note
                  </button>
                  <button
                    type="button"
                    disabled={!note.trim()}
                    onClick={() => void postNote("client")}
                    className="flex h-7 items-center rounded-lg border border-hairline px-2.5 text-caption text-tertiary hover:border-accent-dim hover:text-accent disabled:opacity-40"
                  >
                    Reply to the client
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── older links ── */}
          {shares.length > 1 ? (
            <div className="mt-5">
              <span className="text-overline uppercase text-tertiary">Every link for this carousel</span>
              <div className="mt-2 flex flex-col gap-1.5">
                {shares.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelected(s)}
                    className={[
                      "flex items-center gap-2 rounded-xl border px-3 py-2 text-left",
                      s.id === selected?.id
                        ? "border-accent-dim bg-accent-wash"
                        : "border-hairline bg-surface-1 hover:border-surface-5",
                    ].join(" ")}
                  >
                    <span className="min-w-0 flex-1 truncate text-caption text-secondary">
                      {new Date(s.createdAt).toLocaleString()}
                    </span>
                    <span className="shrink-0 text-caption text-muted">{STATUS_LABEL[s.status]}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {phase.at === "working" ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
              <RefreshCw size={13} strokeWidth={2} className="fcc-spin shrink-0 text-accent" />
              <span className="text-body text-secondary">{phase.what}</span>
            </div>
          ) : null}

          {phase.at === "failed" ? (
            <p className="mt-4 rounded-2xl border border-danger-dim bg-danger-wash px-3.5 py-3 text-body text-danger">
              {phase.error}
            </p>
          ) : null}
        </div>

        <footer className="flex h-16 shrink-0 items-center gap-2 border-t border-hairline px-5">
          <span className="flex-1 text-caption text-muted">
            Reviewers are free and unlimited. Always.
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex h-9 items-center rounded-xl border border-hairline px-3.5 text-body text-secondary hover:text-primary disabled:opacity-40"
          >
            Close
          </button>
          <button
            type="button"
            disabled={busy || !userId}
            onClick={() => void create()}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className={[
              "flex h-9 items-center gap-1.5 rounded-xl px-4 text-body-strong",
              busy || !userId ? "pointer-events-none opacity-50" : "hover:brightness-110",
            ].join(" ")}
          >
            <Link2 size={14} strokeWidth={2.4} />
            {shares.length === 0 ? "Make a review link" : "New link"}
          </button>
        </footer>
      </div>
    </>
  );
}

function Note({ comment, onToggle }: { comment: Comment; onToggle: () => void }) {
  const internal = comment.scope === "internal";
  return (
    <div
      className={[
        "group flex items-start gap-2 rounded-xl border px-3 py-2",
        internal ? "border-hairline bg-white/[0.02]" : "border-hairline bg-surface-1",
        comment.resolved ? "opacity-55" : "",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-caption font-semibold text-secondary">
            {authorLabel(comment.author)}
          </span>
          {internal ? (
            <span
              title="Only your team sees this"
              className="flex items-center gap-1 text-caption text-muted"
            >
              <Lock size={9} strokeWidth={2.2} />
              internal
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-caption leading-4 text-secondary">
          {comment.body}
        </p>
      </div>
      <button
        type="button"
        aria-label={comment.resolved ? "Mark as outstanding" : "Mark as done"}
        onClick={onToggle}
        className="mt-0.5 shrink-0 text-muted hover:text-accent"
      >
        <Check size={12} strokeWidth={2.4} />
      </button>
    </div>
  );
}
