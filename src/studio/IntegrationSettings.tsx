/**
 * Integrations (Batch 31): a scheduler to send drafts to, webhooks for
 * anything else, and API keys for people who build their own.
 *
 * Every secret here is shown once, in the answer that made it, and kept only
 * on the server. Nothing on this screen counts calls or shows a quota; the
 * API's ceilings are stated as the abuse limits they are.
 */
import { Copy, KeyRound, Link2, Plug, Trash2, Webhook } from "lucide-react";
import { useEffect, useState } from "react";

import { Chip } from "./Dash.js";
import {
  addWebhook,
  connectPubler,
  createKey,
  disconnectPubler,
  EVENT_LABELS,
  listKeys,
  listWebhooks,
  readConnections,
  removeWebhook,
  revokeKey,
  testWebhook,
  type ApiKey,
  type Delivery,
  type PublerConnection,
  type Webhook as Hook,
} from "./integrations.js";
import { hasCloudSession } from "./session.js";

const field = "h-8 rounded-md border border-edge bg-surface-1 px-2 text-body text-primary outline-none placeholder:text-muted focus:border-accent-dim";
const quiet = "flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-caption text-secondary hover:border-accent-dim hover:text-accent disabled:opacity-40";

/** A secret, shown once, with a copy button and the warning that it will not be shown again. */
function Once({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 rounded-xl border border-accent-dim bg-accent-wash p-2.5" data-testid="secret-once">
      <div className="text-caption text-secondary">{label}: copy it now, it is not shown again.</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-body text-primary">{value}</code>
        <button type="button" className={quiet} onClick={() => void navigator.clipboard?.writeText(value)}>
          <Copy size={13} strokeWidth={2} />
          Copy
        </button>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, sub, children }: { icon: typeof Plug; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-hairline bg-surface-1 p-5">
      <div className="flex items-center gap-2">
        <Icon size={15} strokeWidth={2} className="text-tertiary" />
        <h2 className="text-title text-primary">{title}</h2>
      </div>
      <p className="mt-1 text-caption leading-4 text-muted">{sub}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function IntegrationSettings() {
  const signedIn = hasCloudSession();
  const [error, setError] = useState<string | null>(null);

  const [publer, setPubler] = useState<PublerConnection | null>(null);
  const [publerKey, setPublerKey] = useState("");

  const [events, setEvents] = useState<string[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<string[]>(["review.approved", "review.changes_requested"]);
  const [hookSecret, setHookSecret] = useState<string | null>(null);

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [keyName, setKeyName] = useState("");
  const [keySecret, setKeySecret] = useState<string | null>(null);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "That did not work");

  const refresh = () => {
    if (!signedIn) return;
    readConnections().then((c) => setPubler(c.publer)).catch(fail);
    listWebhooks()
      .then((w) => {
        setEvents(w.events);
        setHooks(w.webhooks);
        setDeliveries(w.deliveries);
      })
      .catch(fail);
    listKeys()
      .then((k) => {
        setKeys(k.keys);
        setLimits(k.limits);
      })
      .catch(fail);
  };
  useEffect(refresh, [signedIn]);

  if (!signedIn) {
    return <p className="text-body text-secondary">Integrations need an account: a scheduler connection, webhooks and API keys all belong to one.</p>;
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      {error ? <p className="text-caption text-danger">{error}</p> : null}

      <Section icon={Plug} title="Publer" sub="Send carousels as drafts, one per carousel, on their dates. Publer stays the thing that publishes; nothing here posts anything. Needs a Publer Business or Enterprise plan for its API key.">
        {publer ? (
          <div data-testid="publer-connected">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="success">Connected</Chip>
              <span className="text-caption text-muted">Workspace {publer.workspaceId}</span>
              {publer.accounts.map((a) => (
                <Chip key={a.id}>
                  {a.network}: {a.name}
                </Chip>
              ))}
            </div>
            <button type="button" className={`${quiet} mt-2`} onClick={() => disconnectPubler().then(() => setPubler(null)).catch(fail)}>
              Disconnect
            </button>
            <p className="mt-2 text-caption text-muted">Send from Publish for scheduling: choose &ldquo;Drafts in Publer&rdquo;.</p>
          </div>
        ) : (
          <div className="flex gap-2">
            <input aria-label="Publer API key" type="password" value={publerKey} onChange={(e) => setPublerKey(e.target.value)} placeholder="Publer API key" className={`${field} flex-1`} />
            <button
              type="button"
              disabled={!publerKey.trim()}
              className={quiet}
              onClick={() =>
                connectPubler(publerKey.trim())
                  .then((c) => {
                    setPubler(c.publer);
                    setPublerKey("");
                  })
                  .catch(fail)
              }
            >
              Connect
            </button>
          </div>
        )}
      </Section>

      <Section icon={Webhook} title="Webhooks" sub="A signed POST to your URL when something happens, with ids and links, never the carousel's words. Retried with backoff for about fifteen hours. For Zapier, Make, or your own receiver.">
        <ul className="flex flex-col gap-1.5" data-testid="webhooks">
          {hooks.map((h) => (
            <li key={h.id} className="flex items-center gap-2 rounded-xl border border-hairline px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-primary">{h.url}</span>
                <span className="block text-caption text-muted">{h.events.join(", ")}</span>
              </span>
              <button type="button" className={quiet} onClick={() => testWebhook(h.id).then(refresh).catch(fail)}>
                Send a ping
              </button>
              <button type="button" aria-label="Remove webhook" className={quiet} onClick={() => removeWebhook(h.id).then(refresh).catch(fail)}>
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input aria-label="Webhook URL" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://hooks.zapier.com/..." className={`${field} flex-1`} />
          <button
            type="button"
            disabled={!hookUrl.trim() || hookEvents.length === 0}
            className={quiet}
            onClick={() =>
              addWebhook(hookUrl.trim(), hookEvents)
                .then((r) => {
                  setHookSecret(r.secret);
                  setHookUrl("");
                  refresh();
                })
                .catch(fail)
            }
          >
            <Link2 size={13} strokeWidth={2} />
            Add
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          {events.map((e) => (
            <label key={e} className="flex items-center gap-2 text-caption text-secondary">
              <input type="checkbox" checked={hookEvents.includes(e)} onChange={(ev) => setHookEvents((all) => (ev.target.checked ? [...all, e] : all.filter((x) => x !== e)))} />
              <code className="text-primary">{e}</code>
              <span className="text-muted">{EVENT_LABELS[e] ?? ""}</span>
            </label>
          ))}
        </div>
        {hookSecret ? <Once label="Signing secret" value={hookSecret} /> : null}
        {deliveries.length ? (
          <div className="mt-3">
            <span className="text-overline uppercase text-tertiary">Recent deliveries</span>
            <ul className="mt-1 flex flex-col gap-0.5" data-testid="deliveries">
              {deliveries.slice(0, 10).map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-caption">
                  <Chip tone={d.state === "delivered" ? "success" : d.state === "failed" ? "danger" : "plain"}>{d.state}</Chip>
                  <code className="text-secondary">{d.event}</code>
                  <span className="text-muted">
                    {d.attempts} attempt{d.attempts === 1 ? "" : "s"}
                    {d.lastStatus ? `, last ${d.lastStatus}` : ""}
                    {d.lastError && d.state !== "delivered" ? `, ${d.lastError}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section
        icon={KeyRound}
        title="API keys"
        sub={`The public API, on Agency: /v1/decks, /v1/render, /v1/runs. Every request is attributed to its key. Ceilings stop scripts, not people: ${Object.values(limits).join(", ") || "set per key"}. Over one, the answer is a 429 with the reset time, never a bill. No call is priced.`}
      >
        <ul className="flex flex-col gap-1.5" data-testid="api-keys">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-2 rounded-xl border border-hairline px-3 py-2">
              <code className="text-body text-primary">{k.prefix}…</code>
              <span className="min-w-0 flex-1 truncate text-caption text-secondary">{k.name}</span>
              <span className="text-caption text-muted">{k.revokedAt ? "revoked" : k.lastUsedAt ? `last used ${k.lastUsedAt.slice(0, 10)}` : "never used"}</span>
              {k.revokedAt ? null : (
                <button type="button" className={quiet} onClick={() => revokeKey(k.id).then(refresh).catch(fail)}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input aria-label="Key name" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="What it is for" className={`${field} flex-1`} />
          <button
            type="button"
            className={quiet}
            onClick={() =>
              createKey(keyName)
                .then((r) => {
                  setKeySecret(r.secret);
                  setKeyName("");
                  refresh();
                })
                .catch(fail)
            }
          >
            New key
          </button>
        </div>
        {keySecret ? <Once label="API key" value={keySecret} /> : null}
      </Section>
    </div>
  );
}
