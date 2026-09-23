/**
 * What happened, and what it had in common.
 *
 * The order is deliberate: totals, then the baseline, then the breakdowns. Totals are
 * the vanity numbers and they go first because that is what everyone looks at anyway;
 * the baseline sits directly under them because every number below it is a ratio
 * against that one, and a reader who has not seen it will misread everything after.
 */
import { BarChart3, Eye, Heart, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import {
  baselineOf,
  compact,
  DIMENSIONS,
  groupBy,
  isPercent,
  liftLabel,
  metricValueLabel,
  METRICS,
  MIN_GROUP,
  MIN_TOTAL,
  percent,
  totals,
  valueOf,
  type MetricKey,
} from "./insights.js";
import { Chip, Columns, Empty, LiftBar, NotEnough, SectionTitle, Segmented, Stat } from "./Dash.js";
import { isMeasured, shortDate, type Post } from "./pipeline.js";

export function Analytics({ posts, onOpen }: { posts: Post[]; onOpen: (p: Post) => void }) {
  const [metric, setMetric] = useState<MetricKey>("impressions");

  const live = useMemo(() => posts.filter(isMeasured), [posts]);
  const t = useMemo(() => totals(posts), [posts]);
  const base = useMemo(() => baselineOf(posts, metric), [posts, metric]);

  if (live.length === 0) {
    return (
      <Empty
        icon={BarChart3}
        title="No numbers yet"
        body="Mark a carousel posted and type its results in. Everything here is built from your own history, so it starts the moment you have one."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Reach" value={compact(t.impressions)} sub={`Across ${t.measured} posts`} icon={Eye} />
        <Stat label="Engagement" value={compact(t.engagements)} sub={percent(t.rate)} icon={Heart} />
        <Stat label="Follows" value={compact(t.follows)} sub="Credited to a post" icon={UserPlus} />
        <Stat
          label="Median reach"
          value={compact(baselineOf(posts, "impressions").value)}
          sub="Your baseline"
          icon={BarChart3}
          tone="accent"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          options={METRICS.map((m) => ({ id: m.key, label: m.label }))}
          value={metric}
          onChange={setMetric}
        />
        <span className="text-caption text-tertiary">
          {METRICS.find((m) => m.key === metric)?.hint}
        </span>
      </div>

      {base.ready ? null : <NotEnough have={live.length} need={MIN_TOTAL} what="Attribution" />}

      <Trend posts={live} metric={metric} onOpen={onOpen} />

      <div>
        <SectionTitle>What the numbers attribute to</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2">
          {DIMENSIONS.map((d) => (
            <Breakdown key={d.id} posts={live} dimensionId={d.id} metric={metric} ready={base.ready} />
          ))}
        </div>
      </div>

      <p className="text-caption text-muted">
        Groups of fewer than {MIN_GROUP} are shown but never used to draw a conclusion. Reach is
        the honest default; engagement rate is the one to watch when your reach swings.
      </p>
    </div>
  );
}

function Trend({
  posts,
  metric,
  onOpen,
}: {
  posts: Post[];
  metric: MetricKey;
  onOpen: (p: Post) => void;
}) {
  const base = baselineOf(posts, metric);

  const series = useMemo(() => {
    const ordered = [...posts]
      .filter(isMeasured)
      .sort((a, b) => (a.postedAt ?? "").localeCompare(b.postedAt ?? ""))
      .slice(-16);

    return ordered.map((p) => {
      // valueOf is the single reader for every metric; recomputing it here would let
      // the chart and the tables drift apart without anything failing.
      const value = valueOf(p, metric) ?? 0;
      return {
        post: p,
        key: p.id,
        value,
        label: `${p.title} · ${shortDate(p.postedAt)}`,
        strong: base.value > 0 && value / base.value >= 2,
      };
    });
  }, [posts, metric, base.value]);

  if (series.length === 0) return null;

  return (
    <div className="rounded-3xl border border-hairline bg-surface-1 p-4">
      <div className="flex items-center gap-2">
        <span className="text-overline uppercase text-tertiary">Last {series.length} posts</span>
        <div className="flex-1" />
        <span className="text-caption text-tertiary">
          Baseline {metricValueLabel(base.value, metric)}
        </span>
        <Chip tone="accent">Gold = outlier</Chip>
      </div>

      <div className="mt-4">
        <Columns
          data={series}
          format={(n) => (isPercent(metric) ? percent(n) : compact(n))}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {series
          .filter((s) => s.strong)
          .map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onOpen(s.post)}
              className="flex h-7 items-center rounded-lg border border-accent-dim bg-accent-wash px-2.5 text-caption text-accent"
            >
              {s.post.title}
            </button>
          ))}
      </div>
    </div>
  );
}

function Breakdown({
  posts,
  dimensionId,
  metric,
  ready,
}: {
  posts: Post[];
  dimensionId: string;
  metric: MetricKey;
  ready: boolean;
}) {
  const dimension = DIMENSIONS.find((d) => d.id === dimensionId);
  const groups = useMemo(
    () => (dimension ? groupBy(posts, dimension, metric) : []),
    [posts, dimension, metric],
  );

  if (!dimension || groups.length === 0) return null;

  const max = Math.max(...groups.map((g) => g.lift), 1.2);

  return (
    <div className="rounded-3xl border border-hairline bg-surface-1 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-overline uppercase text-tertiary">{dimension.label}</span>
        <div className="flex-1" />
        <span className="text-caption text-muted">vs your median</span>
      </div>

      <div className="flex flex-col gap-3">
        {groups.map((g) => {
          const thin = g.n < MIN_GROUP;
          return (
            <div key={g.value}>
              <div className="flex items-baseline gap-2">
                <span className={["truncate text-body", thin ? "text-tertiary" : "text-primary"].join(" ")}>
                  {g.value}
                </span>
                <span className="text-caption text-muted">
                  {g.n} post{g.n === 1 ? "" : "s"}
                </span>
                <div className="flex-1" />
                <span className="text-caption text-tertiary">
                  {metricValueLabel(g.median, metric)}
                </span>
                <span
                  className={[
                    "w-[52px] text-right text-body-strong",
                    thin || !ready ? "text-muted" : g.lift >= 1 ? "text-accent" : "text-secondary",
                  ].join(" ")}
                >
                  {thin || !ready ? "-" : liftLabel(g.lift)}
                </span>
              </div>
              <div className="mt-1.5">
                <LiftBar ratio={thin || !ready ? 0 : g.lift} max={max} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
