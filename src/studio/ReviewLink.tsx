/**
 * The review page. No account, no app chrome, no FlashCC.
 *
 * Named `ReviewLink` rather than `Review` because `review.ts` sits beside it and
 * TypeScript refuses to hold both on a case-insensitive filesystem. Fourth time
 * in this codebase, see the convention note in CLAUDE.md.
 *
 * This is the only screen in the product a stranger sees, and the only one that
 * is not painted in the app's own colours, it wears the agency's brand instead
 * (7.5), because the client is reviewing their agency's work and a third party's
 * logo across the top of it is somebody else's advertisement in the middle of a
 * business relationship. Gain charges $199 a month for this. It is one theme and
 * one image.
 *
 * ── Comments attach to a slide, which is the whole trick ─────────────────────
 *
 * Every other proofing tool needs an x/y annotation engine because it is
 * reviewing arbitrary artwork. A carousel is an ordered list of pictures, so a
 * comment is (slide, text) and the UI is a filmstrip with a count on it. Gain's
 * own users are asking for exactly this: "you just can leave a comment, not a
 * 'post it' over the content."
 *
 * ── What is deliberately absent ──────────────────────────────────────────────
 *
 * No sign-up prompt, no "powered by", no seat, no invitation, no account
 * creation at any point. A reviewer is free and unlimited, see CLAUDE.md
 * invariant 6, and a page that nags them to make an account is that promise
 * being broken quietly.
 */
import { AlertCircle, Check, ChevronLeft, ChevronRight, MessageSquare, Send } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  authorLabel,
  commentCounts,
  onSlide,
  validateComment,
  type Comment,
  type Share,
} from "./review.js";
import { fetchReview, postComment, postDecision, type ReviewPage } from "./sharing.js";

/** Remembered so a reviewer types their name once, not once per comment. */
const NAME_KEY = "flashcc:v1:reviewer-name";

const readName = (): string => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

type Phase =
  | { at: "loading" }
  | { at: "ready"; page: ReviewPage }
  | { at: "failed"; error: string };

/**
 * The page's own palette, from the agency's brand when there is one.
 *
 * Falls back to a neutral light scheme rather than to FlashCC's dark chrome: an
 * unbranded review page should look like a document, not like somebody else's
 * product with the logo taken off.
 */
function paletteOf(brand: ReviewPage["brand"]): Record<string, string> {
  const theme = brand?.theme ?? {};
  return {
    bg: theme.bg ?? "#f6f6f4",
    fg: theme.fg ?? "#15181d",
    accent: theme.accent ?? "#2f6df0",
    muted: theme.muted ?? "#6b7280",
  };
}

export function ReviewLink({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ at: "loading" });
  const [index, setIndex] = useState(0);
  const [name, setName] = useState(readName);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchReview(token)
      .then((page) => alive && setPhase({ at: "ready", page }))
      .catch((error: unknown) =>
        alive &&
        setPhase({
          at: "failed",
          error: error instanceof Error ? error.message : "That link is not available.",
        }),
      );
    return () => {
      alive = false;
    };
  }, [token]);

  const page = phase.at === "ready" ? phase.page : null;
  const palette = useMemo(() => paletteOf(page?.brand ?? null), [page]);
  const counts = useMemo(() => commentCounts(page?.comments ?? []), [page]);

  const urls = page?.share.snapshot.urls ?? [];
  const slide = urls[index];
  const thread = onSlide(page?.comments ?? [], index);

  const remember = (value: string) => {
    setName(value);
    try {
      localStorage.setItem(NAME_KEY, value);
    } catch {
      /* A refused write costs one retyped name. */
    }
  };

  const send = async () => {
    if (!page) return;
    const problemText = validateComment(
      { slideIndex: index, author: name, body: draft },
      page.comments.length,
    );
    if (problemText) {
      setProblem(problemText);
      return;
    }

    setBusy(true);
    setProblem(null);
    try {
      const { comment } = await postComment(token, index, name, draft);
      setPhase({ at: "ready", page: { ...page, comments: [...page.comments, comment] } });
      setDraft("");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not send.");
    } finally {
      setBusy(false);
    }
  };

  const answer = async (decision: "approved" | "changes") => {
    if (!page) return;
    setBusy(true);
    setProblem(null);
    try {
      const out = await postDecision(token, decision, name, note);
      setPhase({
        at: "ready",
        page: {
          ...page,
          share: {
            ...page.share,
            status: out.status,
            decidedAt: out.decidedAt,
            decidedBy: authorLabel(name),
            decisionNote: note,
          },
        },
      });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That did not send.");
    } finally {
      setBusy(false);
    }
  };

  const style: CSSProperties = {
    background: palette.bg,
    color: palette.fg,
    minHeight: "100%",
  };

  if (phase.at === "loading") {
    return (
      <div style={style} className="grid place-items-center p-10">
        <span style={{ color: palette.muted }} className="text-[15px]">
          Loading…
        </span>
      </div>
    );
  }

  if (phase.at === "failed") {
    return (
      <div style={style} className="grid place-items-center p-10">
        <div className="max-w-[420px] text-center">
          <AlertCircle size={22} strokeWidth={2} style={{ color: palette.muted }} className="mx-auto" />
          <p className="mt-3 text-[17px] font-semibold">{phase.error}</p>
          <p className="mt-1.5 text-[14px] leading-5" style={{ color: palette.muted }}>
            Ask whoever sent it for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  const decided = page!.share.status === "approved" || page!.share.status === "changes";
  const logo = page?.brand?.logos?.light ?? page?.brand?.logos?.mark;

  return (
    <div style={style}>
      <div className="mx-auto max-w-[1080px] px-5 pb-20 pt-8">
        {/* ── the agency's masthead, not ours ── */}
        <header className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt={page?.brand?.name ?? ""} className="h-8 max-w-[160px] object-contain" />
          ) : page?.brand?.name ? (
            <span className="text-[15px] font-semibold">{page.brand.name}</span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[20px] font-semibold leading-7">{page!.share.title}</h1>
            <p className="text-[13px]" style={{ color: palette.muted }}>
              {urls.length} slide{urls.length === 1 ? "" : "s"} for review
            </p>
          </div>
          <StatusPill status={page!.share.status} palette={palette} />
        </header>

        {/* ── the slide ── */}
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div
              className="relative overflow-hidden rounded-2xl"
              style={{ border: `1px solid ${palette.muted}33` }}
            >
              {slide ? (
                <img
                  src={slide}
                  alt={page!.share.snapshot.alts[index] ?? `Slide ${index + 1}`}
                  className="block w-full"
                />
              ) : (
                <div className="grid aspect-[4/5] place-items-center text-[14px]" style={{ color: palette.muted }}>
                  Nothing to show for this slide.
                </div>
              )}

              {urls.length > 1 ? (
                <>
                  <Arrow
                    side="left"
                    palette={palette}
                    disabled={index === 0}
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  />
                  <Arrow
                    side="right"
                    palette={palette}
                    disabled={index >= urls.length - 1}
                    onClick={() => setIndex((i) => Math.min(urls.length - 1, i + 1))}
                  />
                </>
              ) : null}
            </div>

            {/* ── the filmstrip, with a count where somebody has said something ── */}
            <div className="scroll-quiet mt-3 flex gap-2 overflow-x-auto pb-1">
              {urls.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setIndex(i)}
                  className="relative shrink-0 overflow-hidden rounded-lg"
                  style={{
                    width: 56,
                    outline: i === index ? `2px solid ${palette.accent}` : "none",
                    border: `1px solid ${palette.muted}33`,
                  }}
                >
                  <img src={url} alt="" className="block w-full" />
                  {counts.get(i) ? (
                    <span
                      className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold"
                      style={{ background: palette.accent, color: palette.bg }}
                    >
                      {counts.get(i)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {/* ── the thread for this slide ── */}
          <aside>
            <div className="flex items-center gap-2">
              <MessageSquare size={14} strokeWidth={2} style={{ color: palette.muted }} />
              <span className="text-[13px] font-semibold">Slide {index + 1}</span>
              <span className="text-[13px]" style={{ color: palette.muted }}>
                {thread.length === 0 ? "no comments yet" : `${thread.length} comment${thread.length === 1 ? "" : "s"}`}
              </span>
            </div>

            <div className="mt-2 flex flex-col gap-2">
              {thread.map((c) => (
                <Bubble key={c.id} comment={c} palette={palette} />
              ))}
            </div>

            <div className="mt-3">
              <input
                value={name}
                onChange={(e) => remember(e.target.value)}
                placeholder="Your name (optional)"
                className="w-full rounded-xl px-3 py-2 text-[14px] outline-none"
                style={{ background: `${palette.fg}0a`, border: `1px solid ${palette.muted}33`, color: palette.fg }}
              />
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder={`Anything about slide ${index + 1}?`}
                className="mt-2 w-full resize-y rounded-xl px-3 py-2 text-[14px] leading-5 outline-none"
                style={{ background: `${palette.fg}0a`, border: `1px solid ${palette.muted}33`, color: palette.fg }}
              />
              <button
                type="button"
                disabled={busy || !draft.trim()}
                onClick={() => void send()}
                className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold disabled:opacity-50"
                style={{ background: palette.accent, color: palette.bg }}
              >
                <Send size={14} strokeWidth={2.4} />
                {busy ? "Sending…" : "Comment on this slide"}
              </button>
            </div>
          </aside>
        </div>

        {/* ── the answer ── */}
        <div
          className="mt-8 rounded-2xl p-5"
          style={{ background: `${palette.fg}08`, border: `1px solid ${palette.muted}33` }}
        >
          {decided ? (
            <div className="flex items-start gap-2.5">
              <Check size={16} strokeWidth={2.4} style={{ color: palette.accent }} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">
                  {page!.share.status === "approved" ? "Approved" : "Changes requested"}
                  {page!.share.decidedBy ? ` by ${page!.share.decidedBy}` : ""}
                </p>
                {page!.share.decisionNote ? (
                  <p className="mt-1 text-[14px] leading-5" style={{ color: palette.muted }}>
                    {page!.share.decisionNote}
                  </p>
                ) : null}
                <p className="mt-2 text-[13px]" style={{ color: palette.muted }}>
                  Changed your mind? Answer again below and the latest one stands.
                </p>
                <Answer palette={palette} busy={busy} note={note} setNote={setNote} onAnswer={answer} compact />
              </div>
            </div>
          ) : (
            <>
              <p className="text-[15px] font-semibold">Ready to sign this off?</p>
              <p className="mt-1 text-[14px] leading-5" style={{ color: palette.muted }}>
                Approving records this exact version. If it changes afterwards, whoever sent it will
                be told the approval no longer matches.
              </p>
              <Answer palette={palette} busy={busy} note={note} setNote={setNote} onAnswer={answer} />
            </>
          )}

          {problem ? (
            <p className="mt-3 text-[13px]" style={{ color: "#c0392b" }}>
              {problem}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────────── */

type Palette = Record<string, string>;

function Answer({
  palette,
  busy,
  note,
  setNote,
  onAnswer,
  compact = false,
}: {
  palette: Palette;
  busy: boolean;
  note: string;
  setNote: (v: string) => void;
  onAnswer: (d: "approved" | "changes") => Promise<void>;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mt-3" : "mt-3"}>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Anything to add? (optional)"
        className="w-full resize-y rounded-xl px-3 py-2 text-[14px] leading-5 outline-none"
        style={{ background: `${palette.fg}0a`, border: `1px solid ${palette.muted}33`, color: palette.fg }}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAnswer("approved")}
          className="flex h-10 items-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold disabled:opacity-50"
          style={{ background: palette.accent, color: palette.bg }}
        >
          <Check size={15} strokeWidth={2.4} />
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAnswer("changes")}
          className="flex h-10 items-center rounded-xl px-4 text-[14px] font-semibold disabled:opacity-50"
          style={{ border: `1px solid ${palette.muted}55`, color: palette.fg }}
        >
          Request changes
        </button>
      </div>
    </div>
  );
}

function StatusPill({ status, palette }: { status: Share["status"]; palette: Palette }) {
  const label =
    status === "approved" ? "Approved" : status === "changes" ? "Changes requested" : "Awaiting review";
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{
        background: status === "approved" ? palette.accent : `${palette.fg}12`,
        color: status === "approved" ? palette.bg : palette.muted,
      }}
    >
      {label}
    </span>
  );
}

function Bubble({ comment, palette }: { comment: Comment; palette: Palette }) {
  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{ background: `${palette.fg}0a`, opacity: comment.resolved ? 0.55 : 1 }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold">{authorLabel(comment.author)}</span>
        {comment.resolved ? (
          <span className="text-[12px]" style={{ color: palette.muted }}>
            done
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-5">{comment.body}</p>
    </div>
  );
}

function Arrow({
  side,
  palette,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  palette: Palette;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Previous slide" : "Next slide"}
      disabled={disabled}
      onClick={onClick}
      className="absolute top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full disabled:opacity-0"
      style={{
        [side]: 10,
        background: `${palette.bg}e0`,
        color: palette.fg,
        border: `1px solid ${palette.muted}33`,
      }}
    >
      <Icon size={16} strokeWidth={2.2} />
    </button>
  );
}
