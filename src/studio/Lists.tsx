/**
 * The two flat views over the same records: what is coming, and what already went.
 *
 * The board is for moving work along; these are for the two jobs that actually happen
 * on a weekday, checking what goes out today, and typing last week's numbers in.
 */
import { CalendarClock, Check, ExternalLink, Send, TrendingUp } from "lucide-react";

import {
  baselineOf,
  bandOf,
  compact,
  liftLabel,
  percent,
  type MetricKey,
} from "./insights.js";
import { Chip, Empty, SectionTitle } from "./Dash.js";
import {
  engagementRate,
  engagements,
  isMeasured,
  markPosted,
  platformLabel,
  published,
  shortDate,
  shortDateTime,
  upcoming,
  type Post,
} from "./pipeline.js";

const REACH: MetricKey = "impressions";

function Row({
  post,
  children,
  onOpen,
}: {
  post: Post;
  children: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      className="flex cursor-pointer items-center gap-3 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3 hover:border-surface-5"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-strong text-primary">{post.title}</div>
        {post.hook.trim() ? (
          <div className="mt-0.5 truncate text-caption text-tertiary">{post.hook}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/* ── scheduled ────────────────────────────────────────────────────────── */

export function Scheduled({
  posts,
  onChange,
  onOpen,
}: {
  posts: Post[];
  onChange: (posts: Post[]) => void;
  onOpen: (p: Post) => void;
}) {
  const queue = upcoming(posts);
  const now = new Date().toISOString();

  if (queue.length === 0) {
    return (
      <Empty
        icon={CalendarClock}
        title="Nothing scheduled"
        body="Give a finished carousel a date and it will queue up here, with the ones that have slipped past their slot pinned to the top."
      />
    );
  }

  return (
    <>
      <SectionTitle count={queue.length}>The queue</SectionTitle>

      <div className="flex flex-col gap-2">
        {queue.map((p) => {
          const late = p.scheduledFor !== null && p.scheduledFor < now;
          return (
            <Row key={p.id} post={p} onOpen={() => onOpen(p)}>
              <Chip>{platformLabel(p.platform)}</Chip>
              <Chip tone={late ? "danger" : "accent"}>
                {late ? "Overdue · " : ""}
                {shortDateTime(p.scheduledFor)}
              </Chip>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(posts.map((x) => (x.id === p.id ? markPosted(x) : x)));
                }}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent"
              >
                <Check size={12} strokeWidth={2.2} />
                Mark posted
              </button>
            </Row>
          );
        })}
      </div>

      <p className="mt-4 text-caption text-muted">
        Publishing straight from here needs platform access that has to be applied for, so for now
        a slot is a reminder and posting stays a manual step.
      </p>
    </>
  );
}

/* ── posted ───────────────────────────────────────────────────────────── */

export function Posted({
  posts,
  onOpen,
}: {
  posts: Post[];
  onOpen: (p: Post) => void;
}) {
  const live = published(posts);
  const base = baselineOf(posts, REACH);
  const pending = live.filter((p) => !isMeasured(p));

  if (live.length === 0) {
    return (
      <Empty
        icon={Send}
        title="Nothing posted yet"
        body="Once a carousel goes live, mark it posted and add its numbers. That is what every insight on the next two screens is built from."
      />
    );
  }

  return (
    <>
      {pending.length > 0 ? (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-accent-dim bg-accent-wash px-3.5 py-2.5">
          <TrendingUp size={14} strokeWidth={2} className="shrink-0 text-accent" />
          <span className="text-body text-primary">
            {pending.length} post{pending.length === 1 ? " is" : "s are"} live without numbers.
            They stay out of your baseline until you add them.
          </span>
        </div>
      ) : null}

      <SectionTitle count={live.length}>Published</SectionTitle>

      <div className="flex flex-col gap-2">
        {live.map((p) => {
          const m = p.metrics;
          const measured = isMeasured(p);
          const ratio = measured && base.value > 0 ? (m?.impressions ?? 0) / base.value : 0;
          const band = bandOf(ratio);

          return (
            <Row key={p.id} post={p} onOpen={() => onOpen(p)}>
              {measured && m ? (
                <>
                  <div className="hidden w-[86px] shrink-0 text-right md:block">
                    <div className="text-body-strong text-primary">{compact(m.impressions)}</div>
                    <div className="text-caption text-muted">reach</div>
                  </div>
                  <div className="hidden w-[86px] shrink-0 text-right lg:block">
                    <div className="text-body-strong text-primary">{compact(engagements(m))}</div>
                    <div className="text-caption text-muted">{percent(engagementRate(m))}</div>
                  </div>
                  {base.ready ? (
                    <Chip tone={band === "outlier" ? "accent" : band === "weak" ? "danger" : "plain"}>
                      {liftLabel(ratio)}
                    </Chip>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(p);
                  }}
                  className="flex h-7 shrink-0 items-center rounded-lg border border-accent-dim bg-accent-wash px-2.5 text-caption text-accent"
                >
                  Add numbers
                </button>
              )}

              <Chip>{shortDate(p.postedAt)}</Chip>

              {p.url ? (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="Open the live post"
                  onClick={(e) => e.stopPropagation()}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-tertiary hover:text-primary"
                >
                  <ExternalLink size={13} strokeWidth={2} />
                </a>
              ) : (
                <span className="w-7 shrink-0" />
              )}
            </Row>
          );
        })}
      </div>
    </>
  );
}
