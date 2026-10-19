/**
 * Outline mode (24.1): the deck as one plain text document, in place of the
 * canvas.
 *
 * Edits land on a pause in typing (800ms) or on leaving the view. Each time,
 * the whole outline is applied to the deck as it was when the view opened, so
 * applying is the same answer however many pauses there were, and the session
 * is committed under one coalescing key: ONE undo step, named "Outline".
 */
import { MAX_FILE_BYTES, outlineFromText, TEXT_FILES } from "./fileimport.js";
import { useEffect, useMemo, useRef, useState } from "react";

import { identityOf, listBrands, themeOf } from "./brand.js";
import { uid, type Doc } from "./model.js";
import { applyOutline, parseOutline, toOutline, type OutlineResult } from "./outline.js";
import { platformById, platformForSize } from "./platforms.js";
import { STRUCTURES } from "./structures.js";
import type { Studio } from "./useStudio.js";

/** How long a pause in typing has to be before the slides follow. */
export const OUTLINE_PAUSE_MS = 800;

export function OutlineView({ studio }: { studio: Studio }) {
  const { doc } = studio;
  const session = useMemo(() => uid("outline"), []);
  /** The deck as it was when the view opened (or when something else last changed it). */
  const base = useRef<Doc>(doc);
  /** The deck this view last committed, to tell its own changes from anybody else's. */
  const mine = useRef<Doc>(doc);
  /** Set while this view's own commit is on its way back (the studio reseals it, so it is a new object). */
  const expecting = useRef(false);
  const [text, setText] = useState(() => toOutline(doc));
  const [result, setResult] = useState<OutlineResult | null>(null);
  const pending = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // Something other than this view changed the deck (Undo in the header, most
  // likely): start again from what is there now.
  useEffect(() => {
    if (expecting.current) {
      expecting.current = false;
      mine.current = doc;
      return;
    }
    if (doc === mine.current) return;
    base.current = doc;
    mine.current = doc;
    pending.current = null;
    window.clearTimeout(timer.current);
    setText(toOutline(doc));
    setResult(null);
  }, [doc]);

  const studioRef = useRef(studio);
  studioRef.current = studio;

  const apply = (value: string) => {
    pending.current = null;
    const s = studioRef.current;
    const brands = listBrands();
    const from = base.current;
    const theme = themeOf(from, brands);
    const identity = identityOf(from, brands);
    const platform = s.safePlatform ? platformById(s.safePlatform) : platformForSize(from.width, from.height);
    const ctx = { theme, ...(identity ? { identity } : {}), ...(from.quotes?.length ? { quotes: from.quotes } : {}) };
    const r = applyOutline(from, value, theme, ctx, () => uid("blk"), platform);
    setResult(r);
    if (r.doc === from && mine.current === from) return;
    expecting.current = true;
    s.replaceDoc(r.doc, session, "Outline");
  };

  const onChange = (value: string) => {
    setText(value);
    pending.current = value;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => apply(value), OUTLINE_PAUSE_MS);
  };

  // Leaving the view applies whatever is still waiting.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current !== null) apply(pending.current);
    },
    // Runs once, on leaving; `apply` reads everything through refs.
    [],
  );

  const slides = parseOutline(text).length;
  const slots = STRUCTURES.find((f) => f.id === doc.framework)?.slots;
  const freeForm = slots !== undefined && slides !== slots.length;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <textarea
          aria-label="Outline"
          autoFocus
          spellCheck
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            if (pending.current !== null) {
              window.clearTimeout(timer.current);
              apply(pending.current);
            }
          }}
          className="scroll-quiet min-h-0 flex-1 resize-none bg-base px-10 py-8 font-mono text-[14px] leading-[24px] text-primary outline-none placeholder:text-muted"
          placeholder={"# Your headline\nThe body under it.\n# The next slide"}
        />
      </div>

      <aside className="w-[240px] shrink-0 overflow-y-auto border-l border-hairline bg-surface-1 px-4 py-4 text-caption leading-5 text-tertiary">
        <p className="text-body-strong text-secondary">
          {slides} slide{slides === 1 ? "" : "s"}
        </p>
        <p className="mt-2">
          A line starting with <code className="text-secondary"># </code> is a headline and starts a slide. The lines under it
          are its body. <code className="text-secondary">*accent*</code>, <code className="text-secondary">**bold**</code> and{" "}
          <code className="text-secondary">==highlight==</code> work here too.
        </p>
        <p className="mt-2">
          A block is one line: <code className="text-secondary">[Label] field: value | field: value</code>. Edit it in place.
        </p>
        <p className="mt-2">Slides follow a moment after you stop typing. Anything you moved by hand stays where it is. One Undo takes the whole session back.</p>

        {/* A Markdown or text file as an outline (31.5): headings become slides. */}
        <label className="mt-3 flex h-7 w-fit cursor-pointer items-center rounded-md border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent">
          Open a file
          <input
            type="file"
            accept={TEXT_FILES}
            aria-label="Open a text or Markdown file as the outline"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || file.size > MAX_FILE_BYTES) return;
              void file.text().then((t) => {
                const next = outlineFromText(t);
                setText(next);
                onChange(next);
              });
            }}
          />
        </label>
        <p className="mt-1">Replaces the outline; its headings become slides. One Undo takes it back.</p>

        {freeForm ? (
          <p className="mt-3 rounded-md border border-hairline bg-surface-2 p-2 text-secondary">
            The deck has {slides} slides and its framework has {slots!.length} slots, so rewrites treat it as free-form from
            here on: no slot guidance.
          </p>
        ) : null}

        {result && result.overflow.length > 0 ? (
          <p className="mt-3 rounded-md border border-hairline bg-danger-wash p-2 text-secondary">
            {result.overflow.length === 1 ? `Slide ${result.overflow[0]} does` : `Slides ${result.overflow.join(", ")} do`} not fit.
            Give the words another slide with a new <code># </code> line rather than shrinking them.
          </p>
        ) : null}

        {result?.notes.map((n) => (
          <p key={n} className="mt-3 rounded-md border border-hairline bg-surface-2 p-2 text-secondary">
            {n}
          </p>
        ))}

        {result && result.changed.length > 0 ? (
          <p className="mt-3 text-muted">
            Laid out again: slide{result.changed.length === 1 ? "" : "s"} {result.changed.join(", ")}.
          </p>
        ) : null}
      </aside>
    </div>
  );
}
