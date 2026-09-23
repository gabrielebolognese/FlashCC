/**
 * The pass between pasting a batch and generating it.
 *
 * Two jobs, and both are answers to documented failures.
 *
 * THE HOOK AND THE PAYOFF are editable here and nowhere else in the flow,
 * because they are the two slides an operator should write themselves. Measured,
 * not theorised, someone scaling from two to ten carousels a week watched saves
 * and shares fall and fixed it exactly this way: "AI is great for volume and the
 * boring middle, weak at the two slides that decide whether anyone cares."
 *
 * WHAT WAS UNDERSTOOD is shown before anything is generated, because the
 * mis-mapping failure is silent. On camera, from someone using the incumbent:
 * "the episode title landed on the guest name, the guest name landed on the
 * title of the podcast and the notes landed as the title." A small coloured dot
 * per field is the state of the art, and the documented consequence is "47 of 50
 * designs retain placeholder text" found at review.
 *
 * Problems are listed per carousel and never block the rest. A batch that stalls
 * entirely because item nine is malformed is the other bug class this category
 * has: "if a single post in a queue has a problem then the whole queue will
 * stall", with "no indication which post within the category has the problem."
 */
import { AlertTriangle, ArrowLeft, Check, Sparkles } from "lucide-react";
import { useMemo } from "react";

import { hookOf, payoffOf, setHook, setPayoff, type BulkBlock, type BulkSource } from "./bulk.js";
import { Chip } from "./Dash.js";
import { platformById } from "./platforms.js";

export type ItemProblem = { index: number; severity: "block" | "warn"; message: string };

/**
 * Everything checkable before a single slide is built.
 *
 * Deliberately not `preflight.ts`: that one measures laid-out layers against a
 * platform, and none of this has been laid out yet. These are the input-shaped
 * problems, the ones that are cheap to fix here and expensive to find later.
 */
export function checkBatch(blocks: BulkBlock[]): ItemProblem[] {
  const out: ItemProblem[] = [];
  const ceiling = platformById("instagram").maxSlides;

  const hooks = new Map<string, number[]>();
  blocks.forEach((b, i) => {
    const h = hookOf(b).trim().toLowerCase();
    if (h) hooks.set(h, [...(hooks.get(h) ?? []), i]);
  });

  blocks.forEach((block, index) => {
    if (block.texts.length === 0) {
      out.push({ index, severity: "block", message: "No slides in this one." });
      return;
    }
    if (block.texts.some((t) => t.trim() === "")) {
      out.push({ index, severity: "warn", message: "Has an empty slide." });
    }
    if (block.texts.length === 1) {
      out.push({
        index,
        severity: "warn",
        message: "Only one slide. If this was meant to be a whole carousel, the columns may not be named Slide 1, Slide 2 and so on.",
      });
    }
    if (block.texts.length > ceiling) {
      out.push({
        index,
        severity: "warn",
        message: `${block.texts.length} slides. Instagram's API publishes ${ceiling}, so no scheduler can post this one.`,
      });
    }

    const dupes = hooks.get(hookOf(block).trim().toLowerCase());
    if (dupes && dupes.length > 1 && dupes[0] === index) {
      out.push({
        index,
        severity: "warn",
        message: `${dupes.length} carousels open with the same line.`,
      });
    }
  });

  return out;
}

const field =
  "w-full rounded-xl border border-hairline bg-surface-1 px-2.5 py-1.5 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim";

export function BatchReview({
  source,
  blocks,
  onChange,
  onBack,
  onCreate,
}: {
  source: BulkSource;
  blocks: BulkBlock[];
  onChange: (blocks: BulkBlock[]) => void;
  onBack: () => void;
  onCreate: () => void;
}) {
  const problems = useMemo(() => checkBatch(blocks), [blocks]);
  const blocking = problems.filter((p) => p.severity === "block");
  const slides = blocks.reduce((n, b) => n + b.texts.length, 0);

  const edit = (i: number, next: BulkBlock) =>
    onChange(blocks.map((b, n) => (n === i ? next : b)));

  const shapeLabel =
    source.shape === "long"
      ? "One row per slide"
      : source.shape === "wide"
        ? "One row per carousel"
        : "Plain text";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-surface-1 px-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid h-8 w-8 place-items-center rounded-xl text-tertiary hover:bg-white/[0.06] hover:text-primary"
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <div>
          <div className="text-title text-primary">Check the batch</div>
          <div className="text-caption text-muted">
            {blocks.length} carousel{blocks.length === 1 ? "" : "s"} · {slides} slides
          </div>
        </div>
        <div className="flex-1" />
        <Chip>{shapeLabel}</Chip>
        <button
          type="button"
          disabled={blocking.length > 0 || blocks.length === 0}
          onClick={onCreate}
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          className={[
            "flex h-9 items-center gap-1.5 rounded-xl px-4 text-body-strong",
            blocking.length > 0 || blocks.length === 0
              ? "pointer-events-none opacity-50"
              : "hover:brightness-110",
          ].join(" ")}
        >
          <Sparkles size={14} strokeWidth={2.4} />
          Create {blocks.length}
        </button>
      </header>

      <div className="scroll-quiet flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-[900px]">
          {/* What was read, before anything is built on it. */}
          {source.headers.length > 0 ? (
            <div className="mb-4 rounded-2xl border border-hairline bg-surface-1 p-3.5">
              <span className="text-overline uppercase text-tertiary">Columns read</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {source.headers.map((h) => (
                  <Chip key={h}>{h}</Chip>
                ))}
              </div>
              {source.warnings.length > 0 ? (
                <ul className="mt-2.5 space-y-1">
                  {source.warnings.map((w) => (
                    <li key={w} className="text-caption leading-4 text-tertiary">
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <p className="mb-4 text-body text-tertiary">
            Slide one and the last slide are the two that decide whether anyone reads the rest.
            Write those yourself; the middle is what the batch is for.
          </p>

          <div className="flex flex-col gap-3">
            {blocks.map((block, i) => {
              const mine = problems.filter((p) => p.index === i);
              const bad = mine.some((p) => p.severity === "block");

              return (
                <div
                  key={i}
                  className={[
                    "rounded-3xl border p-4",
                    bad ? "border-danger-dim bg-danger-wash" : "border-hairline bg-surface-1",
                  ].join(" ")}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-body-strong text-primary">{block.title}</span>
                    <Chip>{block.texts.length} slides</Chip>
                    <div className="flex-1" />
                    {mine.length === 0 ? (
                      <Check size={13} strokeWidth={2.4} className="text-success" />
                    ) : null}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="text-overline uppercase text-tertiary">The hook</span>
                      <textarea
                        rows={2}
                        value={hookOf(block)}
                        onChange={(e) => edit(i, setHook(block, e.target.value))}
                        className={`${field} mt-1.5 resize-none leading-4`}
                        placeholder="The line that earns the swipe"
                      />
                    </label>

                    <label className="block">
                      <span className="text-overline uppercase text-tertiary">The payoff</span>
                      <textarea
                        rows={2}
                        value={payoffOf(block)}
                        onChange={(e) => edit(i, setPayoff(block, e.target.value))}
                        disabled={block.texts.length < 2}
                        className={`${field} mt-1.5 resize-none leading-4 disabled:opacity-50`}
                        placeholder="The last thing they read"
                      />
                    </label>
                  </div>

                  {block.texts.length > 2 ? (
                    <p className="mt-2 text-caption text-muted">
                      {block.texts.length - 2} slide{block.texts.length - 2 === 1 ? "" : "s"} in
                      between, generated from what you pasted.
                    </p>
                  ) : null}

                  {mine.length > 0 ? (
                    <ul className="mt-2.5 space-y-1">
                      {mine.map((p, n) => (
                        <li key={n} className="flex items-start gap-1.5">
                          <AlertTriangle
                            size={11}
                            strokeWidth={2.2}
                            className={[
                              "mt-0.5 shrink-0",
                              p.severity === "block" ? "text-danger" : "text-tertiary",
                            ].join(" ")}
                          />
                          <span className="text-caption leading-4 text-secondary">{p.message}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
