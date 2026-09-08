/**
 * The pipeline board: idea → drafting → ready → scheduled → posted.
 *
 * A column per stage, and dragging a card between them is the whole interaction.
 * Everything else on this screen is a read-out of the same records, so this is the
 * one place a post's stage actually changes by hand.
 */
import { AlertCircle, Plus } from "lucide-react";
import { useState } from "react";

import { Chip } from "./Dash.js";
import {
  makePost,
  markPosted,
  moveTo,
  overdue,
  platformLabel,
  shortDate,
  STAGES,
  type Post,
  type Stage,
} from "./pipeline.js";
import { STRUCTURES } from "./structures.js";

const frameworkName = (id: string | null): string | null =>
  id ? (STRUCTURES.find((s) => s.id === id)?.name.split(" ")[0] ?? id) : null;

function Card({
  post,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  post: Post;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const late = post.stage === "scheduled" && post.scheduledFor !== null && post.scheduledFor < new Date().toISOString();

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag without payload, even an unused one.
        e.dataTransfer.setData("text/plain", post.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={[
        "cursor-grab rounded-2xl border bg-surface-2 p-3 text-left active:cursor-grabbing",
        dragging ? "border-accent-dim opacity-40" : "border-hairline hover:border-surface-5",
      ].join(" ")}
    >
      <div className="truncate text-body-strong text-primary">{post.title}</div>

      {post.hook.trim() ? (
        <div className="mt-1 line-clamp-2 text-caption leading-4 text-tertiary">{post.hook}</div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        {frameworkName(post.framework) ? <Chip>{frameworkName(post.framework)}</Chip> : null}
        {post.slideCount > 0 ? <Chip>{post.slideCount} slides</Chip> : null}
        {post.stage === "scheduled" ? (
          <Chip tone={late ? "danger" : "accent"}>{shortDate(post.scheduledFor)}</Chip>
        ) : null}
        {post.stage === "posted" ? <Chip tone="success">{shortDate(post.postedAt)}</Chip> : null}
      </div>

      <div className="mt-2 text-caption text-muted">{platformLabel(post.platform)}</div>
    </div>
  );
}

export function Board({
  posts,
  onChange,
  onOpen,
}: {
  posts: Post[];
  onChange: (posts: Post[]) => void;
  onOpen: (post: Post) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);

  const late = overdue(posts);

  const drop = (stage: Stage) => {
    const post = posts.find((p) => p.id === dragId);
    setDragId(null);
    setOver(null);
    if (!post || post.stage === stage) return;
    onChange(posts.map((p) => (p.id === post.id ? moveTo(p, stage) : p)));
  };

  const add = (stage: Stage) => {
    const post = makePost({ title: "Untitled", stage });
    onChange([post, ...posts]);
    onOpen(post);
  };

  return (
    <div className="flex h-full flex-col">
      {late.length > 0 ? (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-danger-dim bg-danger-wash px-3.5 py-2.5">
          <AlertCircle size={14} strokeWidth={2} className="shrink-0 text-danger" />
          <span className="text-body text-primary">
            {late.length} scheduled post{late.length === 1 ? "" : "s"} went past its slot.
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => onChange(
                posts.map((p) => (late.some((l) => l.id === p.id) ? markPosted(p) : p)),
              )}
            className="flex h-7 shrink-0 items-center rounded-lg border border-hairline px-2.5 text-caption text-secondary hover:text-primary"
          >
            Mark them posted
          </button>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-5 gap-3">
        {STAGES.map((stage) => {
          const items = posts.filter((p) => p.stage === stage.id);
          const active = over === stage.id;

          return (
            <section
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== stage.id) setOver(stage.id);
              }}
              onDragLeave={(e) => {
                // Only clear when the pointer actually left the column, not a child.
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(stage.id);
              }}
              className={[
                "flex min-h-0 flex-col rounded-3xl border p-2.5",
                active ? "border-accent-dim bg-accent-wash" : "border-hairline bg-surface-1",
              ].join(" ")}
            >
              <div className="mb-2 flex items-center gap-1.5 px-1">
                <span className="text-overline uppercase text-tertiary">{stage.label}</span>
                <span className="text-caption text-muted">{items.length}</span>
                <div className="flex-1" />
                <button
                  type="button"
                  aria-label={`Add to ${stage.label}`}
                  title={`Add to ${stage.label}`}
                  onClick={() => add(stage.id)}
                  className="grid h-6 w-6 place-items-center rounded-lg text-tertiary hover:bg-white/[0.06] hover:text-primary"
                >
                  <Plus size={13} strokeWidth={2} />
                </button>
              </div>

              <div className="scroll-quiet flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-1">
                {items.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-hairline px-2 py-6 text-center text-caption leading-4 text-muted">
                    {stage.hint}
                  </div>
                ) : (
                  items.map((p) => (
                    <Card
                      key={p.id}
                      post={p}
                      dragging={dragId === p.id}
                      onOpen={() => onOpen(p)}
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-3 shrink-0 text-caption text-muted">
        Drag a card to move it. A post entering Posted gets today's date; dragging one back out
        clears it again, so nothing counts toward your numbers unless it is genuinely live.
      </p>
    </div>
  );
}

export const boardCounts = (posts: Post[]): Record<Stage, number> => {
  const out = { idea: 0, drafting: 0, ready: 0, scheduled: 0, posted: 0 };
  for (const p of posts) out[p.stage] += 1;
  return out;
};
