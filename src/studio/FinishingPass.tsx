/**
 * The finishing pass (27.4): one carousel at a time, one decision per screen,
 * always hook, payoff, caption, alt text, pre-flight, schedule.
 *
 * The left column is the queue with what each carousel has left; the right is
 * the one decision in front of you. Nothing here needs another screen unless
 * the pre-flight finds something that blocks the upload, and then the way out
 * is named: open it in the editor.
 */
import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { listBrands, themeOf } from "./brand.js";
import { ctaLines, type CtaGoal } from "./ctas.js";
import { Chip, Empty } from "./Dash.js";
import {
  altsFor,
  FINISH_STEPS,
  finishingQueue,
  hookText,
  loadProgress,
  markDone,
  nextStep,
  payoffText,
  saveProgress,
  stepsLeft,
  type FinishStep,
  type Progress,
} from "./finishing.js";
import { reseal } from "./furniture.js";
import type { Doc } from "./model.js";
import { fromLocalInput, hookOf, schedule, toLocalInput, type Post } from "./pipeline.js";
import { CANDIDATES, type PlatformId } from "./platforms.js";
import { preflight } from "./preflight.js";
import { restateMany, slideCopy } from "./regenerate.js";
import { SlidePreview } from "./SlidePreview.js";
import { loadDoc, saveDoc } from "./storage.js";
import { captionOf } from "./transcript.js";

const PAYOFF_GOALS: CtaGoal[] = ["follow", "save", "comment", "share"];

const button = "flex h-8 items-center rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent";
const hero = "flex h-8 items-center rounded-xl px-3.5 text-caption font-semibold";

/** New words on one slide, through the same path as the outline and a rewrite. */
function restateOne(doc: Doc, index: number, text: string): Doc {
  const plan = doc.slides.map((s, i) => ({ from: i, text: i === index ? text : slideCopy(s), changed: i === index && text.trim() !== slideCopy(s).trim() }));
  if (!plan.some((p) => p.changed)) return doc;
  return reseal(restateMany(doc, plan, themeOf(doc, listBrands())).doc);
}

export function FinishingPass({
  posts,
  onUpdate,
  onOpen,
}: {
  /** Already filtered by the rail's client. */
  posts: Post[];
  onUpdate: (fn: (all: Post[]) => Post[]) => void;
  onOpen: (doc: Doc) => void;
}) {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  // The queue as it was when the pass opened, so a carousel just scheduled
  // stays in the list with a tick rather than vanishing from under the cursor.
  const [ids] = useState(() => finishingQueue(posts).map((p) => p.id));
  const queue = ids.map((id) => posts.find((p) => p.id === id)).filter((p): p is Post => Boolean(p));
  const [picked, setPicked] = useState<string | null>(null);
  const current = queue.find((p) => p.id === picked) ?? queue.find((p) => stepsLeft(p, progress).length > 0) ?? null;

  const tick = (post: Post, step: FinishStep) => {
    const next = markDone(progress, post.id, step);
    setProgress(next);
    saveProgress(next);
  };

  if (queue.length === 0) {
    return (
      <Empty
        icon={CheckCircle2}
        title="Nothing to finish"
        body="Carousels made by a weekly session, or anything in Drafting, come here to be finished: hook, payoff, caption, alt text, pre-flight, schedule."
      />
    );
  }

  return (
    <div className="flex gap-5">
      <ol className="flex w-[260px] shrink-0 flex-col gap-1.5" data-testid="finish-queue">
        {queue.map((p) => {
          const left = stepsLeft(p, progress).length;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setPicked(p.id)}
                className={[
                  "flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left",
                  current?.id === p.id ? "border-accent-dim bg-accent-wash" : "border-hairline bg-surface-1 hover:border-accent-dim",
                ].join(" ")}
              >
                <span className="min-w-0 flex-1 truncate text-body text-primary">{p.title}</span>
                <span className="shrink-0 text-caption text-muted" data-testid="steps-left">
                  {left === 0 ? "Done" : `${left} left`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="min-w-0 flex-1">
        {current ? (
          <Finisher key={current.id} post={current} progress={progress} onTick={tick} onUpdate={onUpdate} onOpen={onOpen} />
        ) : (
          <Empty icon={CheckCircle2} title="All finished" body="Every carousel in this pass is scheduled." />
        )}
      </div>
    </div>
  );
}

function Finisher({
  post,
  progress,
  onTick,
  onUpdate,
  onOpen,
}: {
  post: Post;
  progress: Progress;
  onTick: (post: Post, step: FinishStep) => void;
  onUpdate: (fn: (all: Post[]) => Post[]) => void;
  onOpen: (doc: Doc) => void;
}) {
  const [doc, setDoc] = useState<Doc | null>(() => (post.docId ? loadDoc(post.docId) : null));
  const step = nextStep(post, progress);
  const at = step ? FINISH_STEPS.findIndex((s) => s.id === step) : FINISH_STEPS.length;
  const platform = CANDIDATES.find((p) => p.id === post.platform) ?? null;

  if (!doc) return <p className="text-caption text-muted">This carousel is no longer on this device.</p>;

  const keep = (edited: Doc) => {
    // Stamped here as well as by saveDoc, so the copy on screen carries the same
    // time as the stored one (the pre-flight step is keyed on it).
    const next = { ...edited, updatedAt: new Date().toISOString() };
    saveDoc(next);
    setDoc(next);
    onUpdate((all) => all.map((p) => (p.id === post.id ? { ...p, title: next.name, hook: hookOf(next), slideCount: next.slides.length, updatedAt: new Date().toISOString() } : p)));
  };
  const patchPost = (fields: Partial<Post>) =>
    onUpdate((all) => all.map((p) => (p.id === post.id ? { ...p, ...fields, updatedAt: new Date().toISOString() } : p)));

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5" data-testid="finish-steps">
        {FINISH_STEPS.map((s, i) => (
          <Chip key={s.id} tone={i === at ? "accent" : i < at ? "success" : "plain"}>
            {i < at ? "✓ " : ""}
            {s.label}
          </Chip>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={() => onOpen(doc)} className={button}>
          <ExternalLink size={13} strokeWidth={2} className="mr-1.5" />
          Open in the editor
        </button>
      </div>
      {step === null ? (
        <p className="text-body text-secondary">Scheduled. Nothing left to decide for this one.</p>
      ) : (
        <>
          <h3 className="mb-3 text-title text-primary" data-testid="finish-question">
            {FINISH_STEPS[at]!.question}
          </h3>
          {step === "hook" || step === "payoff" ? (
            <WordsStep
              key={step}
              doc={doc}
              index={step === "hook" ? 0 : doc.slides.length - 1}
              initial={step === "hook" ? hookText(doc) : payoffText(doc)}
              suggestions={step === "payoff" ? PAYOFF_GOALS.flatMap((g) => ctaLines(g, (post.platform as PlatformId) ?? "linkedin")).filter((l) => !/\[[^\]]+\]/.test(l)).slice(0, 4) : []}
              onDone={(text) => {
                keep(restateOne(doc, step === "hook" ? 0 : doc.slides.length - 1, text));
                onTick(post, step);
              }}
            />
          ) : step === "caption" ? (
            <CaptionStep
              initial={post.caption.trim() || captionOf(doc, { platform: post.platform })}
              onDone={(caption) => {
                patchPost({ caption });
                onTick(post, "caption");
              }}
            />
          ) : step === "alt" ? (
            <AltStep
              doc={doc}
              onDone={(alts) => {
                keep({ ...doc, slides: doc.slides.map((s, i) => ({ ...s, alt: alts[i]?.trim() ? alts[i] : undefined })) });
                onTick(post, "alt");
              }}
            />
          ) : step === "preflight" ? (
            <PreflightStep
              key={doc.updatedAt}
              doc={doc}
              findings={platform ? preflight(doc, platform) : []}
              onWords={(edits) => keep(edits.reduce((d, e) => restateOne(d, e.index, e.text), doc))}
              onOpen={() => onOpen(doc)}
              onDone={() => onTick(post, "preflight")}
            />
          ) : (
            <ScheduleStep
              initial={post.scheduledFor}
              onDone={(iso) => {
                onUpdate((all) => all.map((p) => (p.id === post.id ? schedule(p, iso) : p)));
                onTick(post, "schedule");
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function WordsStep({
  doc,
  index,
  initial,
  suggestions,
  onDone,
}: {
  doc: Doc;
  index: number;
  initial: string;
  suggestions: string[];
  onDone: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  const preview = useMemo(() => restateOne(doc, index, text), [doc, index, text]);
  return (
    <div className="flex gap-4">
      <SlidePreview slide={preview.slides[index]} w={doc.width} h={doc.height} className="w-[260px] shrink-0 overflow-hidden rounded-xl border border-hairline" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <textarea
          aria-label="Slide words"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-36 resize-none rounded-xl border border-edge bg-surface-1 p-3 text-body text-primary outline-none focus:border-accent-dim"
        />
        <p className="text-caption text-muted">One line per line on the slide. The first line is the headline. *Accent*, **bold** and ==highlight== work as everywhere.</p>
        {suggestions.length ? (
          <div className="flex flex-wrap gap-1.5">
            <Sparkles size={13} strokeWidth={2} className="mt-1.5 text-muted" />
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setText(s)} className="flex h-7 items-center rounded-md border border-hairline px-2 text-caption text-tertiary hover:border-accent-dim hover:text-primary">
                {s}
              </button>
            ))}
          </div>
        ) : null}
        <div>
          <button type="button" onClick={() => onDone(text)} style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }} className={hero}>
            {text.trim() === initial.trim() ? "Keep it" : "Use this"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CaptionStep({ initial, onDone }: { initial: string; onDone: (caption: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label="Caption"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-48 resize-none rounded-xl border border-edge bg-surface-1 p-3 text-body text-primary outline-none focus:border-accent-dim"
      />
      <p className="text-caption text-muted">Built from slides one and two and the closer: the words you already approved, rearranged as a text post.</p>
      <div>
        <button type="button" onClick={() => onDone(text)} style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }} className={hero}>
          Use this caption
        </button>
      </div>
    </div>
  );
}

function AltStep({ doc, onDone }: { doc: Doc; onDone: (alts: string[]) => void }) {
  const [alts, setAlts] = useState(() => altsFor(doc));
  return (
    <div className="flex flex-col gap-2">
      {doc.slides.map((s, i) => (
        <label key={s.id} className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-caption text-tertiary">{i + 1}</span>
          <input
            aria-label={`Alt text ${i + 1}`}
            value={alts[i] ?? ""}
            onChange={(e) => setAlts((a) => a.map((x, k) => (k === i ? e.target.value : x)))}
            className="h-8 min-w-0 flex-1 rounded-md border border-edge bg-surface-1 px-2 text-body text-primary outline-none focus:border-accent-dim"
          />
        </label>
      ))}
      <div>
        <button type="button" onClick={() => onDone(alts)} style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }} className={hero}>
          These describe it
        </button>
      </div>
    </div>
  );
}

/** Findings that are about the words on a slide, and so can be fixed by writing them here. */
const WORDS = new Set(["placeholder-text", "weak-hook"]);

function PreflightStep({
  doc,
  findings,
  onWords,
  onOpen,
  onDone,
}: {
  doc: Doc;
  findings: ReturnType<typeof preflight>;
  onWords: (edits: { index: number; text: string }[]) => void;
  onOpen: () => void;
  onDone: () => void;
}) {
  const blocking = findings.filter((f) => f.severity === "block");
  // A slide still carrying example words is fixed here, in words; only what
  // needs the canvas (overflow, size, a seam) sends somebody to the editor.
  // Furniture is not the slide's words: "Your name" on the author chip is fixed
  // by a brand's identity, not by typing here.
  const onCopy = (f: (typeof findings)[number]): boolean => {
    const layer = f.slide ? doc.slides[f.slide - 1]?.layers.find((l) => l.id === f.layerId) : undefined;
    return !layer?.furniture;
  };
  const wordy = [...new Set(findings.filter((f) => WORDS.has(f.code) && f.slide && onCopy(f)).map((f) => f.slide! - 1))];
  const [drafts, setDrafts] = useState<Record<number, string>>(() => Object.fromEntries(wordy.map((i) => [i, doc.slides[i] ? slideCopy(doc.slides[i]!) : ""])));
  const needsEditor = blocking.some((f) => !WORDS.has(f.code) || !onCopy(f));
  return (
    <div className="flex flex-col gap-2">
      {findings.length === 0 ? <p className="text-body text-secondary">Nothing the destination would refuse or crop.</p> : null}
      <ul className="flex flex-col gap-1" data-testid="preflight-findings">
        {findings.map((f, i) => (
          <li key={i} className="flex gap-2 text-body">
            <Chip tone={f.severity === "block" ? "danger" : "plain"}>{f.severity === "block" ? "Blocks" : "Check"}</Chip>
            <span className="text-secondary">
              {f.slide ? `Slide ${f.slide}: ` : ""}
              {f.message}
            </span>
          </li>
        ))}
      </ul>
      {wordy.length ? (
        <div className="flex flex-col gap-2" data-testid="preflight-words">
          {wordy.map((i) => (
            <label key={i} className="flex gap-2">
              <span className="w-14 shrink-0 pt-1.5 text-caption text-tertiary">Slide {i + 1}</span>
              <textarea
                aria-label={`Words on slide ${i + 1}`}
                value={drafts[i] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [i]: e.target.value }))}
                className="h-20 min-w-0 flex-1 resize-none rounded-xl border border-edge bg-surface-1 p-2 text-body text-primary outline-none focus:border-accent-dim"
              />
            </label>
          ))}
          <div>
            <button type="button" onClick={() => onWords(wordy.map((i) => ({ index: i, text: drafts[i] ?? "" })))} className={button}>
              Save these words and check again
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex gap-2">
        {needsEditor ? (
          <button type="button" onClick={onOpen} style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }} className={hero}>
            Fix it in the editor
          </button>
        ) : blocking.length ? null : (
          <button type="button" onClick={onDone} style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }} className={hero}>
            {findings.length ? "Fine as it is" : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}

function ScheduleStep({ initial, onDone }: { initial: string | null; onDone: (iso: string) => void }) {
  const [value, setValue] = useState(() => toLocalInput(initial));
  const iso = fromLocalInput(value);
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label="When"
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 rounded-md border border-edge bg-surface-1 px-2 text-body text-primary outline-none focus:border-accent-dim"
      />
      <button type="button" disabled={!iso} onClick={() => iso && onDone(iso)} style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }} className={hero}>
        Schedule it
      </button>
      <span className="text-caption text-muted">Its lane&rsquo;s slot, unless you move it.</span>
    </div>
  );
}
