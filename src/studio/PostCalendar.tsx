/**
 * The posting week, and the posting month.
 *
 * The queue in `Lists.tsx` answers "what is next". It cannot answer the two
 * questions people actually plan against, which are "what does my week look
 * like" and "where is the hole", because a list has no shape. A grid does: seven
 * columns make an empty Thursday visible without anybody counting, and six rows
 * make a month that tails off after the 12th visible at a glance.
 *
 * Every date decision this screen makes is in `calendar.ts`, tested, DOM-free.
 * What is here is the grid, the drag, and the two affordances that put something
 * into a day.
 */
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers,
  Plus,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  addDays,
  addMonths,
  atSameTimeOn,
  byDay,
  DAY_NAMES,
  mixOf,
  monthLabel,
  monthOf,
  nudgeFor,
  rhythmOf,
  slotOn,
  undated,
  weekLabel,
  weekOf,
  whenOf,
  type Day,
} from "./calendar.js";
import { Chip, Empty, Segmented } from "./Dash.js";
import {
  makePost,
  PLATFORMS,
  platformLabel,
  schedule,
  type Post,
} from "./pipeline.js";

type Mode = "week" | "month";

const shortPlatform = (p: Post): string =>
  PLATFORMS.find((x) => x.id === p.platform)?.short ?? p.platform;

const timeOf = (p: Post): string => {
  const iso = whenOf(p);
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

export function PostCalendar({
  posts,
  onChange,
  onOpen,
  onBulk,
}: {
  posts: Post[];
  onChange: (posts: Post[]) => void;
  onOpen: (p: Post) => void;
  onBulk: () => void;
}) {
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  // A new Date every render, which is correct: this screen is open across
  // midnight often enough that a today captured on mount would be wrong by
  // morning, and recomputing 42 day objects costs nothing.
  const today = new Date();

  const days: Day[] =
    mode === "week" ? weekOf(anchor, today) : monthOf(anchor, today).flat();

  const map = useMemo(() => byDay(posts), [posts]);
  const shelf = useMemo(() => undated(posts), [posts]);

  const rhythm = rhythmOf(days, map);
  const mix = mixOf(days, map);
  const nudge = nudgeFor(rhythm, mix);

  const step = (n: number) =>
    setAnchor((a) => (mode === "week" ? addDays(a, n * 7) : addMonths(a, n)));

  /**
   * A drop, which is a reschedule and nothing else.
   *
   * A posted post is refused rather than moved. Its date is the record of when
   * it went out, and letting a drag rewrite that would quietly change what every
   * insight on the other screens is computed from.
   */
  const moveTo = (id: string, key: string) => {
    const post = posts.find((p) => p.id === id);
    if (!post || post.stage === "posted") return;
    onChange(
      posts.map((p) => (p.id === id ? schedule(p, atSameTimeOn(p.scheduledFor, key)) : p)),
    );
  };

  const place = (post: Post, key: string) => {
    setPicking(null);
    onChange(posts.map((p) => (p.id === post.id ? schedule(p, slotOn(key)) : p)));
  };

  const addOn = (key: string) => {
    setPicking(null);
    const post = schedule(makePost({ title: "Untitled" }), slotOn(key));
    onChange([post, ...posts]);
    onOpen(post);
  };

  if (posts.length === 0) {
    return (
      <Empty
        icon={CalendarDays}
        title="Nothing on the calendar"
        body="Give a finished carousel a date and it appears here. A batch can fill a fortnight in one go, dated as it is made."
        action={
          <button
            type="button"
            onClick={onBulk}
            style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
            className="flex h-8 items-center gap-1.5 rounded-xl px-3.5 text-caption font-semibold"
          >
            <Layers size={13} strokeWidth={2.2} />
            Plan a batch
          </button>
        }
      />
    );
  }

  return (
    <div onClick={() => setPicking(null)}>
      {/* ── where you are, and what it adds up to ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Segmented<Mode>
          options={[
            { id: "week", label: "Week" },
            { id: "month", label: "Month" },
          ]}
          value={mode}
          onChange={setMode}
        />

        <div className="flex h-8 items-center gap-0.5 rounded-xl border border-hairline bg-surface-1 p-0.5">
          <button
            type="button"
            aria-label={mode === "week" ? "Previous week" : "Previous month"}
            onClick={() => step(-1)}
            className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:text-primary"
          >
            <ChevronLeft size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(new Date())}
            className="flex h-7 items-center rounded-lg px-2.5 text-caption text-tertiary hover:text-primary"
          >
            Today
          </button>
          <button
            type="button"
            aria-label={mode === "week" ? "Next week" : "Next month"}
            onClick={() => step(1)}
            className="grid h-7 w-7 place-items-center rounded-lg text-tertiary hover:text-primary"
          >
            <ChevronRight size={14} strokeWidth={2.2} />
          </button>
        </div>

        <span className="text-body-strong text-primary">
          {mode === "week" ? weekLabel(anchor) : monthLabel(anchor)}
        </span>

        <div className="flex-1" />

        <span className="text-caption text-muted">
          {rhythm.count} post{rhythm.count === 1 ? "" : "s"}
          {rhythm.platforms > 0
            ? ` · ${rhythm.platforms} platform${rhythm.platforms === 1 ? "" : "s"}`
            : ""}
        </span>

        <button
          type="button"
          onClick={onBulk}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent"
        >
          <Layers size={13} strokeWidth={2} />
          Fill it with a batch
        </button>
      </div>

      {/*
        One line, or none. See nudgeFor: a row of warnings under a calendar is
        read as decoration, and praise for an empty week teaches people to stop
        reading the line at all.
      */}
      {nudge ? (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-2.5">
          <span className="block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--brand-gold)" }} />
          <span className="text-body text-secondary">{nudge}</span>
        </div>
      ) : null}

      {/* ── the grid ── */}
      <div className="grid grid-cols-7 gap-2">
        {DAY_NAMES.map((name) => (
          <div key={name} className="px-1 pb-0.5 text-overline uppercase text-muted">
            {name}
          </div>
        ))}

        {days.map((day) => (
          <Cell
            key={day.key}
            day={day}
            mode={mode}
            posts={map.get(day.key) ?? []}
            active={over === day.key}
            dragId={dragId}
            picking={picking === day.key}
            shelf={shelf}
            onOver={() => setOver(day.key)}
            onLeave={() => setOver((k) => (k === day.key ? null : k))}
            onDrop={(id) => {
              setOver(null);
              moveTo(id, day.key);
            }}
            onPick={() => setPicking((k) => (k === day.key ? null : day.key))}
            onPlace={(p) => place(p, day.key)}
            onAdd={() => addOn(day.key)}
            onOpen={onOpen}
            onDragStart={setDragId}
            onDragEnd={() => {
              setDragId(null);
              setOver(null);
            }}
          />
        ))}
      </div>

      {/* ── what it is made of ── */}
      {mix.pillars.length > 0 || mix.objectives.length > 0 || mix.untagged > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-caption text-tertiary">Made of</span>
          {mix.pillars.slice(0, 6).map((p) => (
            <Chip key={p.name}>
              {p.name} {p.count}
            </Chip>
          ))}
          {mix.objectives.map((o) => (
            <Chip key={o.id} tone="accent">
              {o.label} {o.count}
            </Chip>
          ))}
          {mix.untagged > 0 ? (
            <span className="text-caption text-muted">
              {mix.untagged} with no pillar or objective
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ── the shelf ── */}
      {shelf.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-hairline bg-surface-1 p-3.5">
          <div className="flex items-center gap-2">
            <span className="text-overline uppercase text-tertiary">Not dated yet</span>
            <Chip>{shelf.length}</Chip>
            <div className="flex-1" />
            <span className="text-caption text-muted">Drag one onto a day</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {shelf.slice(0, 12).map((p) => (
              <button
                key={p.id}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", p.id);
                  setDragId(p.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOver(null);
                }}
                onClick={() => onOpen(p)}
                className={[
                  "flex h-8 max-w-[260px] cursor-grab items-center gap-1.5 rounded-xl border px-2.5 text-caption",
                  dragId === p.id
                    ? "border-accent-dim text-accent opacity-40"
                    : "border-hairline text-secondary hover:border-accent-dim hover:text-accent",
                ].join(" ")}
              >
                <span className="truncate">{p.title}</span>
                <span className="shrink-0 text-muted">{shortPlatform(p)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-caption leading-4 text-muted">
        Drag a post to move it to another day; the time of day travels with it. A post that has
        already gone out sits where it went and cannot be dragged, because that date is what every
        number on the insight screens is measured from.
      </p>
    </div>
  );
}

/* ── one square ───────────────────────────────────────────────────────── */

function Cell({
  day,
  mode,
  posts,
  active,
  dragId,
  picking,
  shelf,
  onOver,
  onLeave,
  onDrop,
  onPick,
  onPlace,
  onAdd,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  day: Day;
  mode: Mode;
  posts: Post[];
  active: boolean;
  dragId: string | null;
  picking: boolean;
  shelf: Post[];
  onOver: () => void;
  onLeave: () => void;
  onDrop: (id: string) => void;
  onPick: () => void;
  onPlace: (p: Post) => void;
  onAdd: () => void;
  onOpen: (p: Post) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const week = mode === "week";
  // A month square shows two and counts the rest. Three would fit and then a
  // busy Tuesday would set the height of every row in the grid.
  const shown = week ? posts : posts.slice(0, 2);
  const hidden = posts.length - shown.length;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!active) onOver();
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onLeave();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDrop(id);
      }}
      className={[
        "relative flex flex-col rounded-2xl border p-1.5",
        week ? "min-h-[210px]" : "min-h-[96px]",
        active
          ? "border-accent-dim bg-accent-wash"
          : day.inMonth || week
            ? "border-hairline bg-surface-1"
            : // Outside the month: still a real day, still a drop target, but it
              // must not compete with the month somebody is looking at.
              "border-hairline bg-transparent",
      ].join(" ")}
    >
      <div className="flex items-center gap-1 px-1 pb-1">
        {week ? (
          <span className="text-caption text-muted">
            {DAY_NAMES[(day.date.getDay() + 6) % 7]}
          </span>
        ) : null}
        <span
          className={[
            "grid h-5 min-w-[20px] place-items-center rounded-md px-1 text-caption font-semibold",
            day.isToday
              ? ""
              : day.inMonth || week
                ? "text-secondary"
                : "text-muted",
          ].join(" ")}
          style={
            day.isToday
              ? { background: "var(--brand-gold)", color: "var(--on-brand-gold)" }
              : undefined
          }
        >
          {day.date.getDate()}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Put something on this day"
          onClick={(e) => {
            e.stopPropagation();
            onPick();
          }}
          className="grid h-5 w-5 place-items-center rounded-md text-muted hover:bg-white/[0.06] hover:text-primary"
        >
          <Plus size={12} strokeWidth={2.2} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {shown.map((p) => (
          <PostChip
            key={p.id}
            post={p}
            week={week}
            dragging={dragId === p.id}
            onOpen={() => onOpen(p)}
            onDragStart={() => onDragStart(p.id)}
            onDragEnd={onDragEnd}
          />
        ))}
        {hidden > 0 ? (
          <span className="px-1 text-caption text-muted">{hidden} more</span>
        ) : null}
      </div>

      {picking ? (
        <Picker
          shelf={shelf}
          onPlace={onPlace}
          onAdd={onAdd}
          onClose={onPick}
        />
      ) : null}
    </div>
  );
}

/**
 * One post in a square.
 *
 * Three tones, and they are the three states somebody acts on differently: gone
 * out, due and late, due and fine. Nothing here transitions on colour, per the
 * house rule.
 */
function PostChip({
  post,
  week,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  post: Post;
  week: boolean;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const done = post.stage === "posted";
  const iso = whenOf(post);
  const late = !done && iso !== null && iso < new Date().toISOString();

  return (
    <button
      type="button"
      draggable={!done}
      onDragStart={(e) => {
        if (done) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", post.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={`${post.title} · ${platformLabel(post.platform)}${iso ? ` · ${timeOf(post)}` : ""}`}
      className={[
        "flex w-full flex-col items-start rounded-lg border px-1.5 py-1 text-left",
        done ? "cursor-pointer" : "cursor-grab",
        dragging
          ? "border-accent-dim opacity-40"
          : late
            ? "border-danger-dim bg-danger-wash"
            : done
              ? "border-hairline bg-surface-3"
              : "border-accent-dim bg-accent-wash",
      ].join(" ")}
    >
      <span
        className={[
          "w-full truncate text-caption",
          late ? "text-danger" : done ? "text-tertiary" : "text-accent",
        ].join(" ")}
      >
        {post.title}
      </span>
      {week ? (
        <span className="flex w-full items-center gap-1 truncate text-overline uppercase text-muted">
          {timeOf(post)} · {shortPlatform(post)}
          {done ? (
            <ExternalLink size={9} strokeWidth={2.4} className="shrink-0" />
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The path into a day that is not a drag.
 *
 * Drag is the fast way and the only way that is discoverable by accident, but it
 * is also the one that does not exist on a touch screen and is awkward on a
 * trackpad across six rows. This lists what is waiting for a date, so putting
 * something on Thursday is two clicks rather than a drag across the month.
 */
function Picker({
  shelf,
  onPlace,
  onAdd,
  onClose,
}: {
  shelf: Post[];
  onPlace: (p: Post) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute left-1 right-1 top-8 z-20 rounded-xl border border-hairline bg-surface-2 p-1.5 shadow-overlay"
      style={{ minWidth: 190 }}
    >
      <div className="flex items-center gap-1 px-1 pb-1">
        <span className="text-overline uppercase text-tertiary">Put here</span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid h-5 w-5 place-items-center rounded-md text-muted hover:text-primary"
        >
          <X size={11} strokeWidth={2.2} />
        </button>
      </div>

      <div className="scroll-quiet flex max-h-[150px] flex-col gap-0.5 overflow-y-auto">
        {shelf.length === 0 ? (
          <span className="px-1 py-1 text-caption leading-4 text-muted">
            Nothing is waiting for a date.
          </span>
        ) : (
          shelf.slice(0, 8).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPlace(p)}
              className="flex h-7 items-center gap-1.5 rounded-lg px-1.5 text-caption text-secondary hover:bg-white/[0.06] hover:text-primary"
            >
              <span className="min-w-0 flex-1 truncate text-left">{p.title}</span>
              <span className="shrink-0 text-muted">{shortPlatform(p)}</span>
            </button>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="mt-1 flex h-7 w-full items-center gap-1.5 rounded-lg border border-dashed border-hairline px-1.5 text-caption text-tertiary hover:border-accent-dim hover:text-accent"
      >
        <Plus size={11} strokeWidth={2.4} />
        New post on this day
      </button>
    </div>
  );
}
