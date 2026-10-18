/**
 * The idea bank (27.1): every one-line idea, filtered by pillar and by the
 * client chosen in the rail, with nothing typed to tag it.
 *
 * Never filled by a model. The empty state says how to put one in, which is
 * the Q key on any screen.
 */
import { Lightbulb, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { ALL_CLIENTS, UNASSIGNED, clientById, listClients } from "./clients.js";
import { Chip, Empty } from "./Dash.js";
import { filterIdeas, ideasOf, makeIdea, NO_PILLAR, pillarsOf, sourceLabel } from "./ideas.js";
import type { Lane } from "./lanes.js";
import { shortDate, type Post } from "./pipeline.js";

export function IdeaBank({
  posts,
  lanes,
  client,
  onUpdate,
  onRemove,
}: {
  /** Already filtered by the rail's client. */
  posts: Post[];
  lanes: Lane[];
  client: string;
  onUpdate: (fn: (all: Post[]) => Post[]) => void;
  onRemove: (id: string) => void;
}) {
  const [pillar, setPillar] = useState("");
  const [line, setLine] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const bank = useMemo(() => ideasOf(posts), [posts]);
  const pillars = useMemo(() => pillarsOf(bank, lanes), [bank, lanes]);
  const shown = filterIdeas(bank, { pillar, client });
  const clients = listClients();
  const clientId = client === ALL_CLIENTS || client === UNASSIGNED ? undefined : client;

  const add = () => {
    const idea = makeIdea(line, { pillar: pillar === NO_PILLAR ? "" : pillar, clientId, source: "capture" });
    if (!idea) return;
    onUpdate((all) => [idea, ...all]);
    setLine("");
  };

  const patch = (id: string, fields: Partial<Post>) =>
    onUpdate((all) => all.map((p) => (p.id === id ? { ...p, ...fields, updatedAt: new Date().toISOString() } : p)));

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-2xl border border-hairline bg-surface-1 px-3">
        <Lightbulb size={14} strokeWidth={2} className="shrink-0 text-tertiary" />
        <input
          aria-label="New idea"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="An idea, one line. Q does this from any screen."
          className="h-10 min-w-0 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-muted"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5" data-testid="pillar-filter">
        {[{ id: "", label: `All ${bank.length}` }, ...pillars.map((p) => ({ id: p, label: p })), { id: NO_PILLAR, label: "No pillar" }].map((f) => (
          <button
            key={f.id || "all"}
            type="button"
            aria-pressed={pillar === f.id}
            onClick={() => setPillar(f.id)}
            className={[
              "flex h-7 items-center rounded-md border px-2 text-caption",
              pillar === f.id ? "border-accent text-primary" : "border-hairline text-tertiary hover:border-accent-dim hover:text-primary",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {bank.length === 0 ? (
        <Empty
          icon={Lightbulb}
          title="No ideas yet"
          body="Press Q on any screen, type one line, press Enter. The bank is yours: nothing here is ever generated for you."
        />
      ) : shown.length === 0 ? (
        <p className="text-caption text-muted">Nothing under this pillar for this client.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shown.map((p) => (
            <li key={p.id} className="rounded-2xl border border-hairline bg-surface-1" data-testid="idea">
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => setOpen((x) => (x === p.id ? null : p.id))} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-body text-primary">{p.title}</span>
                  {p.notes ? <span className="block truncate text-caption text-muted">{p.notes}</span> : null}
                </button>
                {p.pillar ? <Chip>{p.pillar}</Chip> : null}
                {p.clientId ? <Chip>{clientById(clients, p.clientId)?.name ?? "Client"}</Chip> : null}
                <span className="shrink-0 text-caption text-muted">
                  {sourceLabel(p.source)} · {shortDate(p.createdAt)}
                </span>
                <button
                  type="button"
                  aria-label={`Delete ${p.title}`}
                  onClick={() => onRemove(p.id)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:text-primary"
                >
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              </div>
              {open === p.id ? (
                <div className="flex flex-col gap-2 border-t border-hairline px-3 py-2">
                  <input
                    aria-label="Idea title"
                    value={p.title}
                    onChange={(e) => patch(p.id, { title: e.target.value })}
                    className="h-8 rounded-md border border-edge bg-surface-2 px-2 text-body text-primary outline-none focus:border-accent-dim"
                  />
                  <textarea
                    aria-label="Notes"
                    value={p.notes}
                    onChange={(e) => patch(p.id, { notes: e.target.value })}
                    placeholder="Notes, a link, the angle you had in mind"
                    className="h-20 resize-none rounded-md border border-edge bg-surface-2 p-2 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim"
                  />
                  <label className="flex items-center gap-2 text-caption text-tertiary">
                    Pillar
                    <input
                      aria-label="Pillar"
                      list="idea-pillars"
                      value={p.pillar}
                      onChange={(e) => patch(p.id, { pillar: e.target.value })}
                      className="h-7 w-48 rounded-md border border-edge bg-surface-2 px-2 text-body text-primary outline-none focus:border-accent-dim"
                    />
                  </label>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <datalist id="idea-pillars">
        {pillars.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  );
}
