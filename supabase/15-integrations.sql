-- FlashCC, integrations and the public API (Batch 31)
--
-- Run this in the Supabase SQL editor after 14-glossary.sql. Safe to re-run.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Three tables, all written and read ONLY by the server with the secret key.
-- RLS is on and there are no policies, so the browser's publishable key and a
-- signed-in session can see none of them: every secret below is shown to the
-- person once, in the answer that made it, and never again.
--
--   webhooks                 a receiver URL, its signing secret, its events
--   api_keys                 a personal API key, stored as its SHA-256 only
--   scheduler_connections    a scheduler's API key, sealed with CONNECTIONS_KEY
--
-- Nothing here counts anything. There is no usage column, no call counter, no
-- quota, no seat: the API's ceilings are abuse limits held in the server's
-- memory (invariant 7), and a webhook delivery log lives in the server's
-- outbox file, not in a table somebody could start billing from.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.webhooks (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  url         text not null check (url like 'https://%'),
  -- whsec_..., used to sign each delivery (HMAC-SHA256 over "t.body").
  secret      text not null,
  events      text[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists webhooks_user on public.webhooks (user_id);

create table if not exists public.api_keys (
  id            text primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null default '',
  -- The first characters, to tell keys apart in a list. Not enough to use.
  prefix        text not null,
  -- SHA-256 of the whole key, hex. The key itself is never stored.
  hash          text not null unique,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index if not exists api_keys_user on public.api_keys (user_id);

create table if not exists public.scheduler_connections (
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- One dialect per tool (Batch 5.5): only Publer is verified today.
  tool          text not null check (tool in ('publer')),
  -- AES-256-GCM under the server's CONNECTIONS_KEY; useless without it.
  secret        text not null,
  workspace_id  text not null,
  accounts      jsonb not null default '[]'::jsonb check (jsonb_typeof(accounts) = 'array'),
  created_at    timestamptz not null default now(),
  primary key (user_id, tool)
);

alter table public.webhooks enable row level security;
alter table public.api_keys enable row level security;
alter table public.scheduler_connections enable row level security;

-- Deliberately no policies. The service role bypasses RLS; nobody else gets a row.
