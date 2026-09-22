/**
 * Clients: the switcher in the rail, and the screen that manages them.
 *
 * `ClientAdmin` rather than `Clients` because `clients.ts` is beside it — see
 * the naming note in CLAUDE.md.
 *
 * ── The switcher has "All clients" as a first-class option ───────────────────
 *
 * Not as an escape hatch you find when the filter is in your way — as the
 * default and the top entry. The evidence asks for both halves at once:
 *
 *   "I can separate each one so that nothing gets mixed"       (Gain, praise)
 *   "it was a downside to have to toggle back and forth between clients
 *    instead of seeing everything under one view"              (CoSchedule, complaint)
 *
 * A tool that only does the first is the thing the second complaint is about.
 *
 * ── Deleting a client does not delete their work ─────────────────────────────
 *
 * Everything it owned becomes unassigned. An agency losing a client should lose
 * a label, not a year of carousels, and there is no undo that covers the
 * alternative. The confirmation says so out loud rather than leaving somebody to
 * find out.
 */
import { Building2, Check, Plus, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { listBrands } from "./brand.js";
import {
  ALL_CLIENTS,
  activeClients,
  canAddClient,
  clientLimit,
  colourFor,
  countsByClient,
  labelFor,
  listClients,
  makeClient,
  removeClient,
  UNASSIGNED,
  upsertClient,
  type Client,
} from "./clients.js";
import type { Plan } from "./cloud.js";
import { Empty } from "./Dash.js";
import { listDocs } from "./storage.js";

const field =
  "h-8 w-full rounded-xl border border-hairline bg-surface-1 px-2.5 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim";

/* ── the rail switcher ────────────────────────────────────────────────────── */

export function ClientSwitcher({
  clients,
  selected,
  onSelect,
}: {
  clients: readonly Client[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const live = activeClients(clients);
  const counts = useMemo(() => countsByClient(listDocs()), [open]);

  // With nothing to switch between there is nothing to switch. The screen is
  // still reachable from the rail; this control just does not appear.
  if (live.length === 0) return null;

  const current = live.find((c) => c.id === selected);
  const dot = selected === ALL_CLIENTS ? null : (current?.colour ?? "#888888");

  return (
    <div className="relative px-2.5 pb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center gap-2 rounded-xl border border-hairline bg-surface-2 px-2 text-left hover:border-accent-dim"
      >
        {dot ? (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
        ) : (
          <Users size={13} strokeWidth={2} className="shrink-0 text-tertiary" />
        )}
        <span className="min-w-0 flex-1 truncate text-caption text-primary">
          {labelFor(clients, selected)}
        </span>
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-overlay" onClick={() => setOpen(false)} />
          <div className="absolute left-2.5 right-2.5 z-modal mt-1 rounded-xl border border-hairline bg-surface-3 p-1 shadow-modal">
            <Option
              label="All clients"
              hint="Everything, in one view"
              active={selected === ALL_CLIENTS}
              onClick={() => {
                onSelect(ALL_CLIENTS);
                setOpen(false);
              }}
            />
            {live.map((c) => (
              <Option
                key={c.id}
                label={c.name}
                colour={c.colour}
                count={counts.get(c.id)}
                active={selected === c.id}
                onClick={() => {
                  onSelect(c.id);
                  setOpen(false);
                }}
              />
            ))}
            <Option
              label="Unassigned"
              count={counts.get(UNASSIGNED)}
              active={selected === UNASSIGNED}
              onClick={() => {
                onSelect(UNASSIGNED);
                setOpen(false);
              }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function Option({
  label,
  hint,
  colour,
  count,
  active,
  onClick,
}: {
  label: string;
  hint?: string;
  colour?: string;
  count?: number | undefined;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left",
        active ? "bg-accent-wash text-accent" : "text-secondary hover:bg-white/[0.05] hover:text-primary",
      ].join(" ")}
    >
      {colour ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colour }} /> : null}
      <span className="min-w-0 flex-1 truncate text-caption">{label}</span>
      {hint ? <span className="shrink-0 text-caption text-muted">{hint}</span> : null}
      {count ? <span className="shrink-0 text-caption text-muted">{count}</span> : null}
    </button>
  );
}

/* ── the screen ───────────────────────────────────────────────────────────── */

export function ClientAdmin({ plan }: { plan: Plan | undefined }) {
  const [clients, setClients] = useState<Client[]>(() => listClients());
  const [confirming, setConfirming] = useState<string | null>(null);

  const brands = useMemo(() => listBrands(), []);
  const counts = useMemo(() => countsByClient(listDocs()), [clients]);

  const limit = clientLimit(plan);
  const room = canAddClient(clients.length, plan);

  const set = (client: Client, patch: Partial<Client>) =>
    setClients(upsertClient({ ...client, ...patch, updatedAt: new Date().toISOString() }));

  const create = () => setClients(upsertClient(makeClient(`Client ${clients.length + 1}`, clients.length)));

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-caption text-tertiary">
          {clients.length} of {limit === Infinity ? "unlimited" : limit}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={create}
          disabled={!room}
          title={room ? undefined : `Your plan includes ${limit}`}
          style={room ? { background: "var(--brand-gold)", color: "var(--on-brand-gold)" } : undefined}
          className={[
            "flex h-8 items-center gap-1.5 rounded-xl px-3.5 text-body-strong",
            room ? "hover:brightness-110" : "pointer-events-none border border-hairline text-muted opacity-60",
          ].join(" ")}
        >
          <Plus size={14} strokeWidth={2.4} />
          New client
        </button>
      </div>

      {!room ? (
        <p className="mb-4 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-2.5 text-body text-tertiary">
          Your plan includes {limit} client{limit === 1 ? "" : "s"}. Pro includes five, Agency as
          many as you like.
        </p>
      ) : null}

      {clients.length === 0 ? (
        <Empty
          icon={Building2}
          title="No clients yet"
          body="A client owns their own brands, assets, carousels and posts. Make one and the rail gains a switcher — with an all-clients view that never goes away."
          action={
            <button
              type="button"
              onClick={create}
              style={{ background: "var(--brand-gold)", color: "var(--on-brand-gold)" }}
              className="flex h-8 items-center rounded-xl px-3.5 text-body-strong hover:brightness-110"
            >
              Make one
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {clients.map((c, i) => (
            <div key={c.id} className="rounded-2xl border border-hairline bg-surface-1 p-3.5">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  aria-label="Change colour"
                  title="Change colour"
                  onClick={() => set(c, { colour: colourFor(i + 1 + Math.floor(Math.random() * 6)) })}
                  className="h-7 w-7 shrink-0 rounded-lg border border-hairline"
                  style={{ background: c.colour }}
                />
                <input
                  value={c.name}
                  onChange={(e) => set(c, { name: e.target.value })}
                  className={`${field} flex-1`}
                  placeholder="A client's name"
                />
                <span className="shrink-0 text-caption text-muted">
                  {counts.get(c.id) ?? 0} project{(counts.get(c.id) ?? 0) === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  <span className="text-caption text-tertiary">Review pages wear</span>
                  <select
                    value={c.brandId ?? ""}
                    onChange={(e) => set(c, { brandId: e.target.value || undefined })}
                    className="h-7 rounded-lg border border-hairline bg-surface-2 px-2 text-caption text-primary outline-none"
                  >
                    <option value="">nothing</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={Boolean(c.archived)}
                    onChange={(e) => set(c, { archived: e.target.checked || undefined })}
                    className="h-3.5 w-3.5 accent-[var(--brand-gold)]"
                  />
                  <span className="text-caption text-tertiary">Archived</span>
                </label>

                <div className="flex-1" />

                {confirming === c.id ? (
                  <>
                    <span className="text-caption text-secondary">
                      Their {counts.get(c.id) ?? 0} project
                      {(counts.get(c.id) ?? 0) === 1 ? "" : "s"} stay, unassigned. Delete the client?
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="flex h-7 items-center rounded-lg border border-hairline px-2.5 text-caption text-secondary hover:text-primary"
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setClients(removeClient(c.id));
                        setConfirming(null);
                      }}
                      className="flex h-7 items-center rounded-lg border border-danger-dim bg-danger-wash px-2.5 text-caption text-danger"
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(c.id)}
                    className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-caption text-tertiary hover:bg-white/[0.04] hover:text-danger"
                  >
                    <Trash2 size={12} strokeWidth={2} />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-5 flex items-start gap-2 text-caption leading-4 text-muted">
        <Check size={12} strokeWidth={2.4} className="mt-0.5 shrink-0 text-success" />
        Review links are free however many clients you have, and free however many people you send
        each one to. That will not change.
      </p>
    </>
  );
}
