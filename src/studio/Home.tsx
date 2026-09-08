/**
 * The app shell: a permanent left rail, and one view at a time beside it.
 *
 * The rail is the argument the product makes about itself. Projects sit at the top
 * because that is what people come for, but Pipeline and Insights are always visible
 * underneath, so the tool reads as somewhere you run a posting practice rather than
 * somewhere you export a file and leave.
 */
import {
  BarChart3,
  CalendarClock,
  Flame,
  KanbanSquare,
  LayoutGrid,
  Send,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Analytics } from "./Analytics.js";
import { Board } from "./Board.js";
import { demoPosts } from "./demo.js";
import { Empty } from "./Dash.js";
import { Posted, Scheduled } from "./Lists.js";
import type { Doc } from "./model.js";
import { Outliers } from "./Outliers.js";
import {
  isMeasured,
  listPosts,
  savePosts,
  upcoming,
  type Post,
} from "./pipeline.js";
import { PostSheet } from "./PostSheet.js";
import type { THEMES } from "./presets.js";
import { Projects } from "./Projects.js";
import { listDocs } from "./storage.js";
import { Upgrade } from "./Upgrade.js";

type View = "projects" | "board" | "scheduled" | "posted" | "analytics" | "outliers";

type NavItem = {
  id: View;
  label: string;
  icon: LucideIcon;
  count?: (ctx: { posts: Post[]; docs: number }) => number;
};

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Library",
    items: [{ id: "projects", label: "Projects", icon: LayoutGrid, count: (c) => c.docs }],
  },
  {
    section: "Pipeline",
    items: [
      { id: "board", label: "Board", icon: KanbanSquare, count: (c) => c.posts.length },
      {
        id: "scheduled",
        label: "Scheduled",
        icon: CalendarClock,
        count: (c) => upcoming(c.posts).length,
      },
      {
        id: "posted",
        label: "Posted",
        icon: Send,
        count: (c) => c.posts.filter((p) => p.stage === "posted").length,
      },
    ],
  },
  {
    section: "Insights",
    items: [
      { id: "analytics", label: "Analytics", icon: BarChart3 },
      { id: "outliers", label: "Outliers", icon: Flame },
    ],
  },
];

const TITLES: Record<View, { title: string; sub: string }> = {
  projects: { title: "Projects", sub: "Every carousel you have made, and two ways to start another." },
  board: { title: "Pipeline", sub: "Idea to posted. Drag a card to move it along." },
  scheduled: { title: "Scheduled", sub: "What is going out, and what has slipped past its slot." },
  posted: { title: "Posted", sub: "What went live. Add the numbers and the insight screens wake up." },
  analytics: { title: "Analytics", sub: "What happened, grouped by how it was built." },
  outliers: { title: "Outliers", sub: "What beat your own average, and what those posts had in common." },
};

export function Home({
  onOpen,
  onCompose,
  onBulk,
}: {
  onOpen: (doc: Doc) => void;
  onCompose: (theme: keyof typeof THEMES, framework?: string) => void;
  onBulk: () => void;
}) {
  const [view, setView] = useState<View>("projects");
  const [posts, setPosts] = useState<Post[]>(() => listPosts());
  const [editing, setEditing] = useState<Post | null>(null);
  const [pricing, setPricing] = useState(false);

  // Re-read on navigation: a project created in the studio must not leave a stale badge.
  const docCount = useMemo(() => listDocs().length, [view]);

  /** Every mutation goes through here, so nothing can change a post without saving it. */
  const commit = (next: Post[]) => {
    setPosts(next);
    savePosts(next);
  };

  const queue = (post: Post) => {
    commit([post, ...posts]);
    setEditing(post);
    setView("board");
  };

  const measuredCount = posts.filter(isMeasured).length;
  const ctx = { posts, docs: docCount };
  const boardLike = view === "board";

  return (
    <div className="flex h-full bg-base">
      {/* ── rail ── */}
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-hairline bg-surface-1">
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
          <span
            className="grid h-7 w-7 place-items-center rounded-xl text-[13px] font-semibold"
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          >
            F
          </span>
          <span className="text-title text-primary">FlashCC</span>
        </div>

        <nav className="scroll-quiet flex-1 overflow-y-auto px-2.5 pb-4">
          {NAV.map((group) => (
            <div key={group.section} className="mt-4 first:mt-1">
              <div className="px-2 pb-1.5 text-overline uppercase text-muted">{group.section}</div>
              {group.items.map((item) => {
                const active = view === item.id;
                const n = item.count?.(ctx);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setView(item.id)}
                    className={[
                      "flex h-8 w-full items-center gap-2 rounded-xl px-2",
                      active ? "bg-accent-wash text-accent" : "text-secondary hover:bg-white/[0.05] hover:text-primary",
                    ].join(" ")}
                  >
                    <item.icon size={14} strokeWidth={2} className="shrink-0" />
                    <span className="flex-1 text-left text-caption">{item.label}</span>
                    {n === undefined || n === 0 ? null : (
                      <span className="text-caption text-muted">{n}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* The sales surface. Honest about what the free tier is. */}
        <div className="shrink-0 border-t border-hairline p-3">
          <div className="rounded-2xl border border-hairline bg-surface-2 p-3">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} strokeWidth={2} className="text-accent" />
              <span className="text-overline uppercase text-tertiary">Free plan</span>
            </div>
            <p className="mt-1.5 text-caption leading-4 text-tertiary">
              Saved in this browser only. Pro syncs your work and keeps the history the insight
              screens run on.
            </p>
            <button
              type="button"
              onClick={() => setPricing(true)}
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              className="mt-2.5 flex h-8 w-full items-center justify-center rounded-xl text-body-strong hover:brightness-110"
            >
              See Pro
            </button>
          </div>
        </div>
      </aside>

      {/* ── view ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-6">
          <div className="min-w-0">
            <div className="truncate text-title text-primary">{TITLES[view].title}</div>
            <div className="truncate text-caption text-tertiary">{TITLES[view].sub}</div>
          </div>
          <div className="flex-1" />

          {view !== "projects" && posts.length === 0 ? (
            <button
              type="button"
              onClick={() => commit(demoPosts())}
              className="flex h-8 shrink-0 items-center rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent"
            >
              Load sample data
            </button>
          ) : null}

          {view === "analytics" || view === "outliers" ? (
            <span className="shrink-0 text-caption text-muted">
              {measuredCount} measured post{measuredCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </header>

        <main
          className={
            boardLike
              ? "min-h-0 flex-1 overflow-hidden p-6"
              : "scroll-quiet flex-1 overflow-y-auto p-6"
          }
        >
          <div className={boardLike ? "h-full" : "mx-auto max-w-[1100px] pb-10"}>
            {view === "projects" ? (
              <Projects onOpen={onOpen} onCompose={onCompose} onBulk={onBulk} onQueue={queue} />
            ) : null}

            {view === "board" ? (
              <Board posts={posts} onChange={commit} onOpen={setEditing} />
            ) : null}

            {view === "scheduled" ? (
              <Scheduled posts={posts} onChange={commit} onOpen={setEditing} />
            ) : null}

            {view === "posted" ? <Posted posts={posts} onOpen={setEditing} /> : null}

            {view === "analytics" ? (
              posts.length === 0 ? (
                <SampleGate onLoad={() => commit(demoPosts())} />
              ) : (
                <Analytics posts={posts} onOpen={setEditing} />
              )
            ) : null}

            {view === "outliers" ? (
              posts.length === 0 ? (
                <SampleGate onLoad={() => commit(demoPosts())} />
              ) : (
                <Outliers
                  posts={posts}
                  onOpen={setEditing}
                  onMakeAnother={(framework) => onCompose("ink", framework ?? undefined)}
                />
              )
            ) : null}
          </div>
        </main>
      </div>

      {editing ? (
        <PostSheet
          post={editing}
          onSave={(p) => commit(posts.map((x) => (x.id === p.id ? p : x)))}
          onDelete={(id) => commit(posts.filter((x) => x.id !== id))}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {pricing ? <Upgrade onClose={() => setPricing(false)} /> : null}
    </div>
  );
}

function SampleGate({ onLoad }: { onLoad: () => void }) {
  return (
    <Empty
      icon={BarChart3}
      title="Nothing to measure yet"
      body="These screens run on your own posting history. Load a sample account to see what they say once you have one, or start marking your carousels posted."
      action={
        <button
          type="button"
          onClick={onLoad}
          style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
          className="flex h-8 items-center rounded-xl px-3.5 text-body-strong hover:brightness-110"
        >
          Load sample data
        </button>
      }
    />
  );
}
