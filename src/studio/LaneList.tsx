/**
 * Lanes (27.2): the week's recurring slots, each with its format decided.
 *
 * Five fields and a time. Everything a lane names is something the app
 * already has (a framework, a style, a pack or a saved template, a pillar),
 * so a lane is a choice among existing things, never a new thing to design.
 */
import { Plus, Rows3, Trash2 } from "lucide-react";

import { ALL_CLIENTS, UNASSIGNED } from "./clients.js";
import { Empty } from "./Dash.js";
import { pillarsOf } from "./ideas.js";
import { makeLane, WEEKDAYS, type Lane, type Look } from "./lanes.js";
import { PACKS } from "./packs.js";
import { PLATFORMS, type Platform, type Post } from "./pipeline.js";
import { STRUCTURES } from "./structures.js";
import { STYLES } from "./styles.js";
import { listTemplates } from "./templates.js";

const field = "h-7 rounded-md border border-edge bg-surface-2 px-1.5 text-body text-primary outline-none focus:border-accent-dim";

const lookValue = (l: Look): string => `${l.kind}:${l.id}`;
const lookFrom = (v: string): Look => {
  const at = v.indexOf(":");
  return { kind: v.slice(0, at) as Look["kind"], id: v.slice(at + 1) };
};

/** A look's name, for labels anywhere. */
export function lookName(look: Look): string | undefined {
  if (look.kind === "pack") return PACKS.find((p) => p.id === look.id)?.name;
  if (look.kind === "template") return listTemplates().find((t) => t.id === look.id)?.name;
  return STYLES.find((s) => s.id === look.id)?.name;
}

export const frameworkName = (id: string): string | undefined => STRUCTURES.find((s) => s.id === id)?.name;

export function LaneList({
  lanes,
  posts,
  client,
  onChange,
  onRemove,
}: {
  /** Already filtered by the rail's client. */
  lanes: Lane[];
  posts: Post[];
  client: string;
  onChange: (lane: Lane) => void;
  onRemove: (id: string) => void;
}) {
  const clientId = client === ALL_CLIENTS || client === UNASSIGNED ? undefined : client;
  const templates = listTemplates(clientId ?? null);
  const pillars = pillarsOf(posts, lanes);
  const sorted = [...lanes].sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));

  const add = () => {
    const used = new Set(lanes.map((l) => l.weekday));
    const weekday = [1, 2, 3, 4, 5, 6, 7].find((d) => !used.has(d)) ?? 1;
    onChange(
      makeLane({
        weekday,
        framework: STRUCTURES[0]!.id,
        look: { kind: "style", id: STYLES[0]!.id },
        ...(clientId ? { clientId } : {}),
      }),
    );
  };

  return (
    <div>
      <p className="mb-3 max-w-[720px] text-caption leading-5 text-tertiary">
        A lane is a slot in your week with its format already decided: the day, the platform, the framework, the look and the
        pillar. Next week becomes swapping an idea into each one rather than inventing seven things.
      </p>
      {sorted.length === 0 ? (
        <Empty
          icon={Rows3}
          title="No lanes yet"
          body="Monday, LinkedIn, Myth versus fact, your editorial pack, pillar Editing. Add one for each day you post."
          action={
            <button
              type="button"
              onClick={add}
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              className="flex h-8 items-center gap-1.5 rounded-xl px-3.5 text-caption font-semibold"
            >
              <Plus size={13} strokeWidth={2.2} />
              Add a lane
            </button>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {sorted.map((lane) => (
              <li key={lane.id} data-testid="lane" className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-hairline bg-surface-1 px-3 py-2">
                <select aria-label="Day" value={lane.weekday} onChange={(e) => onChange({ ...lane, weekday: Number(e.target.value) })} className={field}>
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i + 1}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Time"
                  type="time"
                  value={lane.time}
                  onChange={(e) => e.target.value && onChange({ ...lane, time: e.target.value })}
                  className={`${field} w-[92px]`}
                />
                <select aria-label="Platform" value={lane.platform} onChange={(e) => onChange({ ...lane, platform: e.target.value as Platform })} className={field}>
                  {PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <select aria-label="Framework" value={lane.framework} onChange={(e) => onChange({ ...lane, framework: e.target.value })} className={`${field} max-w-[200px]`}>
                  {STRUCTURES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select aria-label="Look" value={lookValue(lane.look)} onChange={(e) => onChange({ ...lane, look: lookFrom(e.target.value) })} className={`${field} max-w-[200px]`}>
                  <optgroup label="Styles">
                    {STYLES.map((s) => (
                      <option key={s.id} value={`style:${s.id}`}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Style packs">
                    {PACKS.map((p) => (
                      <option key={p.id} value={`pack:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                  {templates.length ? (
                    <optgroup label="Your templates">
                      {templates.map((t) => (
                        <option key={t.id} value={`template:${t.id}`}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
                <input
                  aria-label="Pillar"
                  list="lane-pillars"
                  placeholder="Pillar"
                  value={lane.pillar}
                  onChange={(e) => onChange({ ...lane, pillar: e.target.value })}
                  className={`${field} w-[140px] placeholder:text-muted`}
                />
                <span className="flex-1" />
                <button
                  type="button"
                  aria-label="Delete lane"
                  onClick={() => onRemove(lane.id)}
                  className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-primary"
                >
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={add}
            className="mt-3 flex h-8 items-center gap-1.5 rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent"
          >
            <Plus size={13} strokeWidth={2} />
            Add a lane
          </button>
        </>
      )}
      <datalist id="lane-pillars">
        {pillars.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  );
}
