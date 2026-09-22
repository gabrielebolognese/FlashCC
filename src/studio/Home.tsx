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
  Building2,
  CalendarClock,
  Flame,
  Images,
  KanbanSquare,
  LayoutGrid,
  Palette,
  RefreshCw,
  Send,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { AccountCard } from "./AccountCard.js";
import { Analytics } from "./Analytics.js";
import { Brands } from "./Brands.js";
import { listAssets } from "./assets.js";
import { ClientAdmin, ClientSwitcher } from "./ClientAdmin.js";
import {
  ALL_CLIENTS,
  belongsTo,
  labelFor,
  listClients,
  loadSelectedClient,
  saveSelectedClient,
} from "./clients.js";
import { listBrands } from "./brand.js";
import { AssetLibrary } from "./AssetLibrary.js";
import { Board } from "./Board.js";
import { demoPosts } from "./demo.js";
import { Chip, Empty } from "./Dash.js";
import { LinkedInImport } from "./LinkedInImport.js";
import { Posted, Scheduled } from "./Lists.js";
import type { Doc } from "./model.js";
import { Outliers } from "./Outliers.js";
import {
  isMeasured,
  listPosts,
  removePost,
  savePosts,
  upcoming,
  type Post,
} from "./pipeline.js";
import { PostSheet } from "./PostSheet.js";
import type { THEMES } from "./presets.js";
import { Projects } from "./Projects.js";
import { SeriesDue } from "./SeriesDue.js";
import { SignIn } from "./SignIn.js";
import { listDocs, loadDoc } from "./storage.js";
import { useAccount } from "./useAccount.js";
import { Upgrade } from "./Upgrade.js";

type View =
  | "projects"
  | "clients"
  | "brands"
  | "library"
  | "board"
  | "scheduled"
  | "posted"
  | "analytics"
  | "outliers";

type NavItem = {
  id: View;
  label: string;
  icon: LucideIcon;
  count?: (ctx: { posts: Post[]; docs: number }) => number;
};

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Library",
    items: [
      { id: "projects", label: "Projects", icon: LayoutGrid, count: (c) => c.docs },
      { id: "clients", label: "Clients", icon: Building2, count: () => listClients().length },
      { id: "brands", label: "Brands", icon: Palette, count: () => listBrands().length },
      { id: "library", label: "Library", icon: Images, count: () => listAssets().length },
    ],
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
  clients: {
    title: "Clients",
    sub: "Who each carousel is for. Separate when you want it, all together when you do not.",
  },
  brands: { title: "Brands", sub: "Your colours, typefaces and logo, saved. Applied once, never live." },
  library: {
    title: "Library",
    sub: "Every image and face you have uploaded, kept. Stored once, used anywhere.",
  },
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
  onLongForm,
}: {
  onOpen: (doc: Doc) => void;
  onCompose: (theme: keyof typeof THEMES, framework?: string) => void;
  onBulk: () => void;
  onLongForm: () => void;
}) {
  const [view, setView] = useState<View>("projects");
  const [posts, setPosts] = useState<Post[]>(() => listPosts());
  const [editing, setEditing] = useState<Post | null>(null);
  const [pricing, setPricing] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [importing, setImporting] = useState(false);
  const [client, setClient] = useState<string>(() => loadSelectedClient());
  const clients = useMemo(() => listClients(), [view]);

  // Bumped on every local write. useAccount debounces a push off it, so a burst of
  // edits becomes one sync rather than one per keystroke.
  const [changes, setChanges] = useState(0);
  const account = useAccount(changes);

  // Re-read on navigation: a project created in the studio must not leave a stale badge.
  const docCount = useMemo(() => listDocs().length, [view]);

  /** Every mutation goes through here, so nothing can change a post without saving it. */
  const commit = (next: Post[]) => {
    setPosts(next);
    savePosts(next);
    setChanges((n) => n + 1);
  };

  const queue = (post: Post) => {
    commit([post, ...posts]);
    setEditing(post);
    setView("board");
  };

  /**
   * Every screen below the rail reads THIS rather than `posts`.
   *
   * One filter at the top rather than one per view: an analytics tab that
   * quietly ignored the client switcher would answer a question nobody asked,
   * and the failure would look like bad data rather than like a missing filter.
   */
  const visiblePosts = useMemo(() => posts.filter((p) => belongsTo(p, client)), [posts, client]);

  const measuredCount = visiblePosts.filter(isMeasured).length;
  const ctx = { posts: visiblePosts, docs: docCount };
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

        <ClientSwitcher
          clients={clients}
          selected={client}
          onSelect={(id) => {
            setClient(id);
            saveSelectedClient(id);
          }}
        />

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

        {/* Account, sync and the sales surface. */}
        <div className="shrink-0 border-t border-hairline p-3">
          <AccountCard
            account={account}
            onSignIn={() => setSigningIn(true)}
            onSeePro={() => setPricing(true)}
          />
        </div>
      </aside>

      {/* ── view ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-title text-primary">{TITLES[view].title}</span>
              {/*
                Named in the header as well as in the switcher, because a filtered
                view that does not say it is filtered is how somebody concludes
                their projects have vanished.
              */}
              {client !== ALL_CLIENTS && clients.length > 0 ? (
                <Chip>{labelFor(clients, client)}</Chip>
              ) : null}
            </div>
            <div className="truncate text-caption text-tertiary">{TITLES[view].sub}</div>
          </div>
          <div className="flex-1" />

          {view !== "projects" && view !== "clients" && posts.length === 0 ? (
            <button
              type="button"
              onClick={() => commit(demoPosts())}
              className="flex h-8 shrink-0 items-center rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent"
            >
              Load sample data
            </button>
          ) : null}

          {/*
            On the screens that run on numbers, beside the count of how many
            there are. Manual entry is what makes these honest; this is what
            stops it becoming the reason somebody leaves.
          */}
          {view === "posted" || view === "analytics" || view === "outliers" ? (
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent"
            >
              <Upload size={13} strokeWidth={2} />
              Import from LinkedIn
            </button>
          ) : null}

          {view === "analytics" || view === "outliers" ? (
            <span className="shrink-0 text-caption text-muted">
              {measuredCount} measured post{measuredCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </header>

        {account.activating ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-accent-dim bg-accent-wash px-6 py-2.5">
            <RefreshCw size={13} strokeWidth={2} className="fcc-spin shrink-0 text-accent" />
            <span className="text-body text-primary">
              Payment received. Turning your plan on — this takes a second.
            </span>
          </div>
        ) : null}

        <main
          className={
            boardLike
              ? "min-h-0 flex-1 overflow-hidden p-6"
              : "scroll-quiet flex-1 overflow-y-auto p-6"
          }
        >
          <div className={boardLike ? "h-full" : "mx-auto max-w-[1100px] pb-10"}>
            {/*
              Shown on the two screens somebody is already planning on, and
              nowhere else. A banner that follows you into the analytics tab is a
              banner people learn to look past — and the board is a fixed-height
              column layout that a banner would squeeze.
            */}
            {view === "projects" || view === "scheduled" ? (
              <SeriesDue
                posts={visiblePosts}
                onOpen={(docId) => {
                  const doc = loadDoc(docId);
                  if (doc) onOpen(doc);
                }}
              />
            ) : null}

            {view === "clients" ? <ClientAdmin plan={account.profile?.plan} /> : null}

            {view === "projects" ? (
              <Projects
                client={client}
                onOpen={onOpen}
                onCompose={onCompose}
                onBulk={onBulk}
                onLongForm={onLongForm}
                onQueue={queue}
              />
            ) : null}

            {view === "brands" ? <Brands plan={account.profile?.plan} /> : null}

            {view === "library" ? <AssetLibrary /> : null}

            {view === "board" ? (
              <Board posts={visiblePosts} onChange={commit} onOpen={setEditing} />
            ) : null}

            {view === "scheduled" ? (
              <Scheduled posts={visiblePosts} onChange={commit} onOpen={setEditing} />
            ) : null}

            {view === "posted" ? <Posted posts={visiblePosts} onOpen={setEditing} /> : null}

            {view === "analytics" ? (
              visiblePosts.length === 0 ? (
                <SampleGate onLoad={() => commit(demoPosts())} />
              ) : (
                <Analytics posts={visiblePosts} onOpen={setEditing} />
              )
            ) : null}

            {view === "outliers" ? (
              visiblePosts.length === 0 ? (
                <SampleGate onLoad={() => commit(demoPosts())} />
              ) : (
                <Outliers
                  posts={visiblePosts}
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
          // Through removePost, not a filter: it records the tombstone that carries
          // the deletion to the account's other devices.
          onDelete={(id) => setPosts(removePost(id))}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {pricing ? (
        <Upgrade
          plan={account.profile?.plan ?? "free"}
          signedIn={account.status === "signedIn"}
          manageable={account.manageable}
          onSignIn={() => setSigningIn(true)}
          onClose={() => setPricing(false)}
        />
      ) : null}

      {importing ? (
        <LinkedInImport
          posts={posts}
          onApply={(next) => commit(next)}
          onClose={() => setImporting(false)}
        />
      ) : null}

      {signingIn ? (
        <SignIn hasLocalWork={account.hasUnsyncedWork} onClose={() => setSigningIn(false)} />
      ) : null}
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
