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
  CalendarDays,
  Flame,
  Images,
  Plug,
  CalendarRange,
  CheckCircle2,
  KanbanSquare,
  LayoutGrid,
  Lightbulb,
  Rows3,
  Palette,
  Repeat2,
  Send,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AccountCard } from "./AccountCard.js";
import { Analytics } from "./Analytics.js";
import { Brands } from "./Brands.js";
import { listAssets } from "./assets.js";
import { ClientAdmin, ClientSwitcher } from "./ClientAdmin.js";
import {
  ALL_CLIENTS,
  UNASSIGNED,
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
import { PostCalendar } from "./PostCalendar.js";
import { FinishingPass } from "./FinishingPass.js";
import { finishingQueue, loadProgress, stepsLeft } from "./finishing.js";
import { IdeaBank } from "./IdeaBank.js";
import { ideasOf, onIdeasChanged } from "./ideas.js";
import { LaneList } from "./LaneList.js";
import { listLanes, removeLane, upsertLane, type Lane } from "./lanes.js";
import { WeekSession } from "./WeekSession.js";
import { RemixDialog } from "./RemixDialog.js";
import { RepostDialog } from "./RepostDialog.js";
import { Revisit } from "./Revisit.js";
import { IntegrationSettings } from "./IntegrationSettings.js";
import { PostSheet } from "./PostSheet.js";
import type { THEMES } from "./presets.js";
import { Projects } from "./Projects.js";
import type { StudioOpen } from "./Studio.js";
import { SeriesDue } from "./SeriesDue.js";
import { SignIn } from "./SignIn.js";
import { listDocs, loadDoc } from "./storage.js";
import { useAccount } from "./useAccount.js";
import { Upgrade } from "./Upgrade.js";

type View =
  | "projects"
  | "ideas"
  | "lanes"
  | "week"
  | "finish"
  | "clients"
  | "brands"
  | "library"
  | "board"
  | "calendar"
  | "scheduled"
  | "posted"
  | "analytics"
  | "outliers"
  | "revisit"
  | "integrations";

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
      { id: "integrations", label: "Integrations", icon: Plug },
    ],
  },
  {
    // Batch 27: formats and lanes planned ahead, ideas captured, the last mile finished.
    section: "Plan",
    items: [
      { id: "ideas", label: "Ideas", icon: Lightbulb, count: (c) => ideasOf(c.posts).length },
      { id: "lanes", label: "Lanes", icon: Rows3 },
      { id: "week", label: "Make next week", icon: CalendarRange },
      {
        id: "finish",
        label: "Finish",
        icon: CheckCircle2,
        count: (c) => {
          const progress = loadProgress();
          return finishingQueue(c.posts).filter((p) => stepsLeft(p, progress).length > 0).length;
        },
      },
    ],
  },
  {
    section: "Pipeline",
    items: [
      { id: "board", label: "Board", icon: KanbanSquare, count: (c) => c.posts.length },
      { id: "calendar", label: "Calendar", icon: CalendarDays },
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
      { id: "revisit", label: "Revisit", icon: Repeat2 },
    ],
  },
];

const TITLES: Record<View, { title: string; sub: string }> = {
  projects: { title: "Projects", sub: "Every carousel you have made, and two ways to start another." },
  ideas: { title: "Ideas", sub: "Every idea you have had, one line each. Q captures one from any screen." },
  lanes: { title: "Lanes", sub: "The slots in your week, each with its format already decided." },
  week: { title: "Make next week", sub: "Next week's lanes as empty slots. Drop an idea into the ones you want made." },
  finish: { title: "Finish", sub: "Hook, payoff, caption, alt text, pre-flight, schedule. One carousel at a time." },
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
  calendar: {
    title: "Calendar",
    sub: "Your week and your month, with the holes in them. Drag a post to move it.",
  },
  scheduled: { title: "Scheduled", sub: "What is going out, and what has slipped past its slot." },
  posted: { title: "Posted", sub: "What went live. Add the numbers and the insight screens wake up." },
  analytics: { title: "Analytics", sub: "What happened, grouped by how it was built." },
  outliers: { title: "Outliers", sub: "What beat your own average, and what those posts had in common." },
  revisit: { title: "Revisit", sub: "What already worked: worth posting again, and posted in one place only." },
  integrations: { title: "Integrations", sub: "Drafts into your scheduler, webhooks for everything else, and API keys." },
};

export function Home({
  onOpen,
  onCompose,
  onBulk,
  onLongForm,
  initialView,
}: {
  onOpen: (doc: Doc, open?: StudioOpen) => void;
  onCompose: (theme: keyof typeof THEMES, framework?: string) => void;
  onBulk: () => void;
  onLongForm: () => void;
  /**
   * Which screen to open on. Only used when something outside the shell has a
   * reason to choose, which today is a finished batch handing over to the
   * calendar it just filled. An initial value, not a controlled one: the rail
   * owns the view from the first click onward.
   */
  initialView?: View | undefined;
}) {
  const [view, setView] = useState<View>(initialView ?? "projects");
  const [posts, setPosts] = useState<Post[]>(() => listPosts());
  const [editing, setEditing] = useState<Post | null>(null);
  /** Make another like this (28.1) and Repost as new (28.2): the post they start from. */
  const [remixing, setRemixing] = useState<Post | null>(null);
  const [reposting, setReposting] = useState<Post | null>(null);
  const [pricing, setPricing] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [importing, setImporting] = useState(false);
  const [client, setClient] = useState<string>(() => loadSelectedClient());
  const [lanes, setLanes] = useState<Lane[]>(() => listLanes());
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

  /**
   * For the planning screens, which write from async work (a session landing
   * carousels one by one): the update is applied to what is stored NOW, never
   * to the list this render captured, so a carousel landing mid-run cannot
   * overwrite the one that landed before it.
   */
  const update = (fn: (all: Post[]) => Post[]) => commit(fn(listPosts()));

  // An idea captured with Q while this screen is open lands in the store; read it back.
  useEffect(() => onIdeasChanged(() => setPosts(listPosts())), []);

  const lanesChanged = (next: Lane[]) => {
    setLanes(next);
    setChanges((n) => n + 1);
  };
  const visibleLanes = useMemo(() => lanes.filter((l) => belongsTo(l, client)), [lanes, client]);

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
          {view === "posted" || view === "analytics" || view === "outliers" || view === "revisit" ? (
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent"
            >
              <Upload size={13} strokeWidth={2} />
              Import analytics
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
            {/*
              Shown on the two screens somebody is already planning on, and
              nowhere else. A banner that follows you into the analytics tab is a
              banner people learn to look past, and the board is a fixed-height
              column layout that a banner would squeeze.
            */}
            {view === "projects" || view === "scheduled" || view === "calendar" ? (
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

            {view === "ideas" ? (
              <IdeaBank
                posts={visiblePosts}
                lanes={visibleLanes}
                client={client}
                onUpdate={update}
                onRemove={(id) => {
                  setPosts(removePost(id));
                  setChanges((n) => n + 1);
                }}
              />
            ) : null}

            {view === "lanes" ? (
              <LaneList
                lanes={visibleLanes}
                posts={visiblePosts}
                client={client}
                onChange={(l) => lanesChanged(upsertLane(l))}
                onRemove={(id) => lanesChanged(removeLane(id))}
              />
            ) : null}

            {view === "week" ? (
              <WeekSession
                posts={visiblePosts}
                lanes={visibleLanes}
                clientId={client === ALL_CLIENTS || client === UNASSIGNED ? undefined : client}
                onUpdate={update}
                onLanes={() => setView("lanes")}
                onFinish={() => setView("finish")}
              />
            ) : null}

            {view === "finish" ? <FinishingPass posts={visiblePosts} onUpdate={update} onOpen={onOpen} /> : null}

            {view === "brands" ? <Brands plan={account.profile?.plan} /> : null}

            {view === "library" ? <AssetLibrary /> : null}

            {view === "integrations" ? <IntegrationSettings /> : null}

            {view === "board" ? (
              <Board posts={visiblePosts} onChange={commit} onOpen={setEditing} />
            ) : null}

            {view === "calendar" ? (
              <PostCalendar
                posts={visiblePosts}
                lanes={visibleLanes}
                onChange={commit}
                onOpen={setEditing}
                onBulk={onBulk}
              />
            ) : null}

            {view === "scheduled" ? (
              <Scheduled posts={visiblePosts} onChange={commit} onOpen={setEditing} />
            ) : null}

            {view === "posted" ? <Posted posts={visiblePosts} onOpen={setEditing} /> : null}

            {view === "revisit" ? <Revisit posts={visiblePosts} onOpen={onOpen} onRepost={setReposting} /> : null}

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
                <Outliers posts={visiblePosts} onOpen={setEditing} onMakeAnother={setRemixing} />
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
          onRemix={(p) => {
            setEditing(null);
            setRemixing(p);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {remixing ? (
        <RemixDialog
          post={remixing}
          onMade={(doc, post) => {
            // An idea from the bank is the same record moving along; a brief is a new post.
            update((all) => (all.some((p) => p.id === post.id) ? all.map((p) => (p.id === post.id ? post : p)) : [post, ...all]));
            setRemixing(null);
            onOpen(doc);
          }}
          onClose={() => setRemixing(null)}
        />
      ) : null}

      {reposting ? (
        <RepostDialog
          post={reposting}
          onMade={(doc, post) => {
            update((all) => [post, ...all]);
            setReposting(null);
            onOpen(doc, { hooks: true });
          }}
          onClose={() => setReposting(null)}
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
