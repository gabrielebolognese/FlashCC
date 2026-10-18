/**
 * Repost as new (28.2): the carousel again, as a new deck, after a look at
 * what time may have changed in it.
 *
 * The staleness check flags lines and never edits them: whether "2025" or
 * "$29/mo" is still true is the person's call. The copy opens on the hook
 * variants (Batch 6.3), because a fresh cover is what makes a repost new.
 */
import { Repeat2, X } from "lucide-react";
import { useMemo } from "react";

import { Chip } from "./Dash.js";
import { uid, type Doc } from "./model.js";
import type { Post } from "./pipeline.js";
import { repostDoc, repostPost, STALE_LABELS, stalenessFlags } from "./resurface.js";
import { loadDoc, saveDoc } from "./storage.js";
import { deckTexts } from "./transcript.js";

export function RepostDialog({
  post,
  onMade,
  onClose,
}: {
  post: Post;
  onMade: (doc: Doc, post: Post) => void;
  onClose: () => void;
}) {
  const source = useMemo(() => (post.docId ? loadDoc(post.docId) : null), [post.docId]);
  const flags = useMemo(() => (source ? stalenessFlags(deckTexts(source)) : []), [source]);

  const make = () => {
    if (!source) return;
    const doc = repostDoc(source, uid("d"));
    saveDoc(doc);
    onMade(doc, repostPost(post, doc));
  };

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Repost as new"
        className="fixed left-1/2 top-1/2 z-modal flex max-h-[80vh] w-[600px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-5">
          <Repeat2 size={14} strokeWidth={2} className="text-tertiary" />
          <span className="flex-1 truncate text-title text-primary">Repost &ldquo;{post.title}&rdquo; as new</span>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:text-primary">
            <X size={14} strokeWidth={2} />
          </button>
        </header>
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-5">
          {!source ? (
            <p className="text-caption text-muted">This post&rsquo;s carousel is not on this device.</p>
          ) : flags.length === 0 ? (
            <p className="text-body text-secondary" data-testid="stale-none">
              Nothing in the copy looks dated: no years, relative dates, prices, versions or other numbers.
            </p>
          ) : (
            <>
              <p className="mb-3 text-caption leading-5 text-tertiary">
                Lines time may have changed. Nothing is edited here: check them in the copy.
              </p>
              <ul className="flex flex-col gap-1.5" data-testid="stale-flags">
                {flags.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-xl border border-hairline bg-surface-1 px-3 py-2">
                    <span className="w-14 shrink-0 text-caption text-tertiary">Slide {f.slide}</span>
                    <span className="min-w-0 flex-1 text-body text-primary">{f.line}</span>
                    {f.kinds.map((k) => (
                      <Chip key={k}>{STALE_LABELS[k]}</Chip>
                    ))}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-hairline p-3">
          <span className="flex-1 text-caption text-muted">A new carousel; the original and its numbers stay as they are.</span>
          <button
            type="button"
            disabled={!source}
            onClick={make}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className="flex h-8 items-center rounded-xl px-3.5 text-caption font-semibold disabled:opacity-50"
          >
            Make the copy, open its cover
          </button>
        </div>
      </div>
    </>
  );
}
