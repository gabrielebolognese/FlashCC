/**
 * Revisit (28.2, 28.3): what already worked, brought back.
 *
 * Worth posting again: posts older than an age the person picks, by a metric
 * the person picks, each with Repost as new. Posted in one place: posts that
 * did well on one platform and never went out on another, each with the
 * other platforms' versions one click away.
 *
 * The column is the person's choice and the numbers are their audience's. No
 * badge, no "best", no prediction of how a repost will do.
 */
import { History, Repeat2, Send } from "lucide-react";
import { useMemo, useState } from "react";

import { Chip, Empty, Segmented } from "./Dash.js";
import { compact } from "./insights.js";
import type { Doc } from "./model.js";
import { platformLabel, shortDate, type Platform, type Post } from "./pipeline.js";
import { AGES, DEFAULT_AGE_MONTHS, onePlaceOnly, RESURFACE_METRICS, worthAgain, type ResurfaceMetric } from "./resurface.js";
import type { StudioOpen } from "./Studio.js";
import { loadDoc } from "./storage.js";

type Tab = "again" | "elsewhere";

export function Revisit({
  posts,
  onOpen,
  onRepost,
}: {
  /** Already filtered by the rail's client. */
  posts: Post[];
  onOpen: (doc: Doc, open?: StudioOpen) => void;
  onRepost: (post: Post) => void;
}) {
  const [tab, setTab] = useState<Tab>("again");
  const [metric, setMetric] = useState<ResurfaceMetric>("saves");
  const [months, setMonths] = useState(DEFAULT_AGE_MONTHS);
  const again = useMemo(() => worthAgain(posts, metric, months), [posts, metric, months]);
  const elsewhere = useMemo(() => onePlaceOnly(posts), [posts]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<Tab>
          options={[
            { id: "again", label: "Worth posting again" },
            { id: "elsewhere", label: "Posted in one place" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "again" ? (
          <>
            <label className="flex items-center gap-1.5 text-caption text-tertiary">
              Older than
              <select
                aria-label="Older than"
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className="h-7 rounded-md border border-edge bg-surface-1 px-1.5 text-body text-primary"
              >
                {AGES.map((a) => (
                  <option key={a.months} value={a.months}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-caption text-tertiary">
              Sorted by
              <select
                aria-label="Sorted by"
                value={metric}
                onChange={(e) => setMetric(e.target.value as ResurfaceMetric)}
                className="h-7 rounded-md border border-edge bg-surface-1 px-1.5 text-body text-primary"
              >
                {RESURFACE_METRICS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>

      {tab === "again" ? (
        again.length === 0 ? (
          <Empty
            icon={History}
            title="Nothing that old with numbers yet"
            body="Posts you marked posted, with results, show here once they are older than the age you chose."
          />
        ) : (
          <ol className="flex flex-col gap-1.5" data-testid="worth-again">
            {again.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-1 px-3 py-2">
                <span className="w-16 shrink-0 text-right text-body-strong text-primary">{compact(p.metrics![metric])}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-primary">{p.title}</span>
                  <span className="block text-caption text-muted">
                    {platformLabel(p.platform)} · posted {shortDate(p.postedAt)}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={!p.docId || !loadDoc(p.docId)}
                  onClick={() => onRepost(p)}
                  className="flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent disabled:opacity-40"
                >
                  <Repeat2 size={13} strokeWidth={2} />
                  Repost as new
                </button>
              </li>
            ))}
          </ol>
        )
      ) : elsewhere.length === 0 ? (
        <Empty
          icon={Send}
          title="Nothing posted in one place only"
          body="A post that did well against your own baseline, and whose carousel never went out on another platform, shows here. It needs at least five posts with results first."
        />
      ) : (
        <ol className="flex flex-col gap-1.5" data-testid="one-place">
          {elsewhere.map(({ post, band, missing }) => {
            const doc = post.docId ? loadDoc(post.docId) : null;
            return (
              <li key={post.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-hairline bg-surface-1 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-primary">{post.title}</span>
                  <span className="block text-caption text-muted">
                    {platformLabel(post.platform)} · {compact(post.metrics!.impressions)} reach · {band === "outlier" ? "2x your median or more" : "above your median"}
                  </span>
                </span>
                <Chip>Not on {missing.map((m) => platformLabel(m as Platform)).join(", ")}</Chip>
                {missing.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!doc}
                    onClick={() => doc && onOpen(doc, { exportFor: m })}
                    className="flex h-7 items-center rounded-md border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent disabled:opacity-40"
                  >
                    Export for {platformLabel(m as Platform)}
                  </button>
                ))}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
