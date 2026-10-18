/**
 * Make another like this (28.1): the shape of a post that worked, with new
 * words from a brief or an idea in the bank.
 *
 * The structure is copied without a key, every time. The words are drafted
 * through the normal route only when the person ticks "Draft the words" and
 * the server can; otherwise the new deck carries placeholders where the
 * words go, and the person writes them.
 */
import { Shuffle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { alignToSlots, draftSlides } from "./ai.js";
import { contextVoice, listBrands, themeOf } from "./brand.js";
import { blockById } from "./blocks.js";
import { ideasOf } from "./ideas.js";
import type { Doc } from "./model.js";
import { listPosts, type Post } from "./pipeline.js";
import { CANDIDATES } from "./platforms.js";
import { restateSlide } from "./regenerate.js";
import { remixDeck, remixPost, remixStructure } from "./remix.js";
import { nameFromHook } from "./search.js";
import { loadDoc, saveDoc } from "./storage.js";
import { structureById } from "./structures.js";

export function RemixDialog({
  post,
  onMade,
  onClose,
}: {
  post: Post;
  /** The new deck and its post, already saved; the caller opens the deck. */
  onMade: (doc: Doc, post: Post) => void;
  onClose: () => void;
}) {
  const source = useMemo(() => (post.docId ? loadDoc(post.docId) : null), [post.docId]);
  const ideas = useMemo(() => ideasOf(listPosts()), []);
  const [from, setFrom] = useState<"brief" | "idea">(ideas.length ? "idea" : "brief");
  const [brief, setBrief] = useState("");
  const [ideaId, setIdeaId] = useState(ideas[0]?.id ?? "");
  const [server, setServer] = useState<boolean | null>(null);
  const [draft, setDraft] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : {}))
      .then((b: { draft?: boolean }) => live && setServer(Boolean(b.draft)))
      .catch(() => live && setServer(false));
    return () => {
      live = false;
    };
  }, []);

  const idea = ideas.find((i) => i.id === ideaId);
  const words = from === "idea" ? (idea ? (idea.notes.trim() ? `${idea.title}\n\n${idea.notes.trim()}` : idea.title) : "") : brief.trim();
  const drafting = draft && server === true;
  const blocks = source ? [...new Set(source.slides.flatMap((s, i) => (s.blocks ?? []).map((b) => `${blockById(b.block)?.label ?? b.block} on slide ${i + 1}`)))] : [];

  async function make() {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      let texts: string[] | undefined;
      const structure = remixStructure(source);
      if (drafting && structure) {
        const drafted = await draftSlides(words, structure, AbortSignal.timeout(90_000), contextVoice(listBrands(), source.clientId));
        texts = alignToSlots(drafted.slides, structure);
      }
      const name = nameFromHook(texts?.[0] ?? (from === "idea" ? idea?.title ?? "" : words.split("\n")[0] ?? "")) || "Untitled remix";
      let doc = remixDeck(source, {
        theme: themeOf(source, listBrands()),
        texts,
        name,
        platform: CANDIDATES.find((p) => p.id === post.platform) ?? null,
      });
      // Not drafting: the idea or the brief's first line goes on the cover, and
      // the template's placeholders hold the rest for the person to write.
      if (!texts) doc = restateSlide(doc, 0, words.split("\n")[0]!, themeOf(doc, listBrands())).doc;
      saveDoc(doc);
      onMade(doc, remixPost(post, doc, from === "idea" ? idea : undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Make another like this"
        className="fixed left-1/2 top-1/2 z-modal flex w-[600px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-hairline bg-surface-2 shadow-modal"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
      >
        <header className="flex h-14 items-center gap-2 border-b border-hairline px-5">
          <Shuffle size={14} strokeWidth={2} className="text-tertiary" />
          <span className="flex-1 text-title text-primary">Make another like this</span>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:text-primary">
            <X size={14} strokeWidth={2} />
          </button>
        </header>
        <div className="flex flex-col gap-3 p-5">
          {source ? (
            <p className="text-caption leading-5 text-tertiary" data-testid="remix-shape">
              The shape of <span className="text-secondary">{post.title}</span>: {structureById(source.framework)?.name ?? "its framework"},{" "}
              {source.slides.length} slides, the same layout at each position
              {blocks.length ? `, ${blocks.join(", ")}` : ""}
              {source.furniture?.set && source.furniture.set !== "none" ? `, ${source.furniture.set} furniture` : ""}, the same style. None of its words.
            </p>
          ) : (
            <p className="text-caption text-muted">This post&rsquo;s carousel is not on this device, so there is no shape to copy.</p>
          )}
          <div className="flex gap-2">
            {(["idea", "brief"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={from === k}
                onClick={() => setFrom(k)}
                disabled={k === "idea" && ideas.length === 0}
                className={[
                  "flex h-7 items-center rounded-md border px-2.5 text-body disabled:opacity-40",
                  from === k ? "border-accent text-primary" : "border-hairline text-secondary hover:border-accent-dim",
                ].join(" ")}
              >
                {k === "idea" ? `An idea from the bank${ideas.length ? "" : " (empty)"}` : "A new brief"}
              </button>
            ))}
          </div>
          {from === "idea" ? (
            <select
              aria-label="Idea"
              value={ideaId}
              onChange={(e) => setIdeaId(e.target.value)}
              className="h-8 rounded-md border border-edge bg-surface-1 px-2 text-body text-primary outline-none focus:border-accent-dim"
            >
              {ideas.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
          ) : (
            <textarea
              aria-label="Brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="What this one is about. The first line goes on the cover if nothing drafts it."
              className="h-28 resize-none rounded-xl border border-edge bg-surface-1 p-3 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim"
            />
          )}
          <label className="flex items-center gap-2 text-caption text-secondary">
            <input type="checkbox" checked={drafting} disabled={server !== true} onChange={(e) => setDraft(e.target.checked)} />
            Draft the words
            <span className="text-muted">
              {server === false ? "(no drafting on this server: you write them, the shape is ready)" : "(only the words; the shape never goes to the model)"}
            </span>
          </label>
          {error ? <p className="text-caption text-danger">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-hairline p-3">
          <button
            type="button"
            disabled={!source || busy || !words}
            onClick={() => void make()}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className="flex h-8 items-center rounded-xl px-3.5 text-caption font-semibold disabled:opacity-50"
          >
            {busy ? "Making it" : "Make it"}
          </button>
        </div>
      </div>
    </>
  );
}
