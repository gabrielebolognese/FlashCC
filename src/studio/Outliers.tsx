/**
 * The posts that beat your own average, and what they had in common.
 *
 * This is the screen the whole pipeline exists to feed. Everywhere else reports; this
 * one is supposed to change what you make next, which is why every finding ends in
 * something you can start rather than a number you can admire.
 */
import { Flame, Sparkles, TrendingDown, Zap } from "lucide-react";
import { useMemo, useState } from "react";

import {
  baselineOf,
  confidenceNote,
  findings,
  liftLabel,
  metricValueLabel,
  METRICS,
  MIN_TOTAL,
  OUTLIER_AT,
  percent,
  score,
  whatOutliersShare,
  type MetricKey,
} from "./insights.js";
import { Chip, Empty, NotEnough, SectionTitle, Segmented } from "./Dash.js";
import { isMeasured, platformLabel, shortDate, type Post } from "./pipeline.js";
import { STRUCTURES } from "./structures.js";

export function Outliers({
  posts,
  onOpen,
  onMakeAnother,
}: {
  posts: Post[];
  onOpen: (p: Post) => void;
  onMakeAnother: (framework: string | null) => void;
}) {
  const [metric, setMetric] = useState<MetricKey>("impressions");

  const live = useMemo(() => posts.filter(isMeasured), [posts]);
  const base = useMemo(() => baselineOf(posts, metric), [posts, metric]);
  const scored = useMemo(() => score(posts, metric, base), [posts, metric, base]);
  const shared = useMemo(() => whatOutliersShare(posts, metric, base), [posts, metric, base]);
  const top = scored.filter((s) => s.band === "outlier");
  const weak = scored.filter((s) => s.band === "weak");
  const leads = useMemo(() => findings(posts, metric).slice(0, 4), [posts, metric]);

  if (live.length === 0) {
    return (
      <Empty
        icon={Flame}
        title="No outliers yet"
        body="An outlier is a post that beat your own median by 2x or more. Add results to a few published carousels and the ones that ran away with it will surface here."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          options={METRICS.map((m) => ({ id: m.key, label: m.label }))}
          value={metric}
          onChange={setMetric}
        />
        <div className="flex-1" />
        <span className="text-caption text-tertiary">
          Baseline {metricValueLabel(base.value, metric)} · median of your last {base.n}
        </span>
      </div>

      {base.ready ? null : <NotEnough have={live.length} need={MIN_TOTAL} what="Outlier detection" />}

      {/* The headline findings, phrased as instructions rather than statistics. */}
      {leads.length > 0 ? (
        <div className="rounded-3xl border border-accent-dim bg-accent-wash p-4">
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} strokeWidth={2} className="text-accent" />
            <span className="text-overline uppercase text-accent">Do more of this</span>
          </div>

          <div className="mt-3 grid gap-2.5 md:grid-cols-2">
            {leads.map((f) => (
              <div
                key={`${f.dimension}-${f.value}`}
                className="rounded-2xl border border-hairline bg-surface-1 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-body-strong text-primary">{f.value}</span>
                  <div className="flex-1" />
                  <span
                    className={[
                      "text-body-strong",
                      f.direction === "up" ? "text-accent" : "text-secondary",
                    ].join(" ")}
                  >
                    {liftLabel(f.lift)}
                  </span>
                </div>
                <div className="mt-1 text-caption text-tertiary">
                  {f.dimensionLabel} · {f.n} posts · {f.note}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-caption text-secondary">
            Each of these compares one group against the median of everything you have posted.
            Nothing appears here on fewer than three posts.
          </p>
        </div>
      ) : null}

      {/* ── the winners ── */}
      <div>
        <SectionTitle count={top.length}>
          Outliers · {OUTLIER_AT}x your median or better
        </SectionTitle>

        {top.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-hairline px-4 py-8 text-center">
            <p className="text-body text-tertiary">
              Nothing has cleared {OUTLIER_AT}x yet. That is not a failure, it just means your
              posts are landing in a consistent band.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {top.map((s) => {
              const framework = STRUCTURES.find((x) => x.id === s.post.framework);
              return (
                <div
                  key={s.post.id}
                  className="flex items-center gap-3 rounded-2xl border border-accent-dim bg-surface-1 px-3.5 py-3"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-wash text-accent">
                    <Flame size={16} strokeWidth={2} />
                  </span>

                  <button
                    type="button"
                    onClick={() => onOpen(s.post)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-body-strong text-primary">{s.post.title}</div>
                    <div className="truncate text-caption text-tertiary">{s.post.hook}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {framework ? <Chip>{framework.name}</Chip> : null}
                      <Chip>{s.post.slideCount} slides</Chip>
                      <Chip>{platformLabel(s.post.platform)}</Chip>
                      <Chip>{shortDate(s.post.postedAt)}</Chip>
                    </div>
                  </button>

                  <div className="shrink-0 text-right">
                    <div className="text-[19px] font-semibold leading-6 tracking-[-0.3px] text-accent">
                      {liftLabel(s.ratio)}
                    </div>
                    <div className="text-caption text-tertiary">
                      {metricValueLabel(s.value, metric)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onMakeAnother(s.post.framework)}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent"
                  >
                    <Zap size={12} strokeWidth={2.2} />
                    Make another
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── the pattern ── */}
      {shared.length > 0 ? (
        <div>
          <SectionTitle>What your outliers share</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {shared.map((s) => (
              <div
                key={`${s.dimensionLabel}-${s.value}`}
                className="rounded-2xl border border-hairline bg-surface-1 p-4"
              >
                <div className="text-overline uppercase text-tertiary">{s.dimensionLabel}</div>
                <div className="mt-1.5 text-[15px] font-semibold leading-5 text-primary">
                  {s.value}
                </div>
                <div className="mt-2 text-caption text-secondary">
                  {s.inOutliers} of your {s.ofOutliers} outliers, against {percent(s.rest, 0)} of
                  everything else.
                </div>
                <div className="mt-1 text-caption text-muted">{confidenceNote(s.inOutliers)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── the other end ── */}
      {weak.length > 0 ? (
        <div>
          <SectionTitle count={weak.length}>Underperformed</SectionTitle>
          <div className="flex flex-col gap-2">
            {weak.map((s) => (
              <button
                key={s.post.id}
                type="button"
                onClick={() => onOpen(s.post)}
                className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-2.5 text-left hover:border-surface-5"
              >
                <TrendingDown size={14} strokeWidth={2} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-body text-secondary">
                  {s.post.title}
                </span>
                <span className="shrink-0 text-caption text-tertiary">
                  {metricValueLabel(s.value, metric)}
                </span>
                <span className="w-[52px] shrink-0 text-right text-body-strong text-muted">
                  {liftLabel(s.ratio)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-caption text-muted">
        Ratios are against the median of your last {base.n} measured posts, not against other
        accounts. A 3x here means three times your own normal, which is the only comparison that
        can tell you what to do next.
      </p>
    </div>
  );
}

/** Kept beside the screen it serves: the one-line summary the sidebar badge needs. */
export const outlierCount = (posts: Post[], metric: MetricKey = "impressions"): number =>
  score(posts, metric).filter((s) => s.band === "outlier").length;
