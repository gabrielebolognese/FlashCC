-- FlashCC — clients
--
-- Run this in the Supabase SQL editor after 01-schema.sql. Safe to re-run, and
-- safe to run now: everything it adds is either a new table or a nullable
-- column, and the app works without it (clients stay on this machine).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- A client owns brands, assets, projects and posts. This is what goes into the
-- agency tier, which has existed in `profiles.plan` since billing shipped and
-- has had nothing in it.
--
-- `client_id` is a NULLABLE column on four tables and deliberately NOT a foreign
-- key. Deleting a client must not delete a year of carousels — the work becomes
-- unassigned, which is recoverable, and an agency losing a client should lose a
-- label rather than their archive. A cascading FK is exactly the behaviour this
-- product is built against, and `on delete set null` would need a composite
-- reference that is Postgres 15+ only (the same reason `posts.doc_id` has none).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.clients (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                text not null,
  name              text not null default 'Untitled client',
  colour            text not null default '#888888',
  -- The brand a review page wears. Not an FK, for the reason above.
  brand_id          text,
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz,
  primary key (user_id, id)
);

create index if not exists clients_sync_idx on public.clients (user_id, server_updated_at desc);
create index if not exists clients_live_idx on public.clients (user_id)
  where deleted_at is null and archived = false;

drop trigger if exists clients_touch on public.clients;
create trigger clients_touch before insert or update on public.clients
  for each row execute function public.touch_server_updated_at();

-- ── how many a plan is worth ────────────────────────────────────────────────
-- The same ladder brands use. Free is one because the feature has to be visible
-- to be wanted, not because one client is useful; five covers the solo operator
-- the research actually found; unlimited is what an agency is paying for.

create or replace function public.client_allowance()
returns int language sql stable security definer set search_path = '' as $$
  select case (select p.plan from public.profiles p where p.id = (select auth.uid()))
    when 'agency' then 1000000
    when 'pro'    then 5
    else 1
  end;
$$;

create or replace function public.client_count()
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.clients c
  where c.user_id = (select auth.uid()) and c.deleted_at is null;
$$;

alter table public.clients enable row level security;

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select using ((select auth.uid()) = user_id);

-- The limit is on INSERT only, so editing is never refused and somebody who
-- downgrades keeps the clients they have. They simply cannot add another until
-- they are back under the line. Confiscating work on a downgrade is the
-- behaviour this product is built against.
drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert with check (
    (select auth.uid()) = user_id
    and public.client_count() < public.client_allowance()
  );

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
  for delete using ((select auth.uid()) = user_id);

-- ── who owns what ───────────────────────────────────────────────────────────
-- A projection of what the blob already carries on `docs`, and an ordinary
-- column everywhere else. Partial indexes, because most work is unassigned and
-- there is no reason to carry it.

alter table public.docs   add column if not exists client_id text;
alter table public.posts  add column if not exists client_id text;
alter table public.brands add column if not exists client_id text;

-- `assets` arrives with 04-storage.sql. Guarded so this file runs either way,
-- rather than failing the whole transaction on a table that is not there yet.
do $$
begin
  if to_regclass('public.assets') is not null then
    execute 'alter table public.assets add column if not exists client_id text';
    execute 'create index if not exists assets_client_idx on public.assets (user_id, client_id) where client_id is not null';
  end if;
end $$;

create index if not exists docs_client_idx on public.docs (user_id, client_id) where client_id is not null;
create index if not exists posts_client_idx on public.posts (user_id, client_id) where client_id is not null;
create index if not exists brands_client_idx on public.brands (user_id, client_id) where client_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- To check it: sign in on a free account and make two clients. The second must
-- be refused by Postgres with "new row violates row-level security policy", not
-- by anything in the interface. Then delete a client that owns a project and
-- confirm the project is still there, unassigned.
-- ─────────────────────────────────────────────────────────────────────────────
