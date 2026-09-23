-- FlashCC, brands
--
-- Run this in the Supabase SQL editor after 01-schema.sql. Safe to re-run.
--
-- Unlike 02-pro-gate.sql this one IS safe to run now: it adds a table nothing
-- else depends on, and the app works without it (brands stay on this machine
-- until the table exists).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- A brand is a named Theme. The same shape the generator already consumes, with
-- a name and an owner, which is why `theme` is jsonb rather than eight columns:
-- nothing queries inside it, the client reads it whole, and the flat columns
-- would only be a second copy to drift.
--
-- The tier limit is enforced HERE, not in the browser. This is the first thing
-- in the product that genuinely is Pro rather than advertised as Pro: a
-- client-side count is a suggestion anyone can edit, an INSERT policy is not.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.brands (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                text not null,
  name              text not null default 'Untitled brand',
  theme             jsonb not null,
  width             int  not null default 1080,
  height            int  not null default 1350,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz,
  primary key (user_id, id)
);

create index if not exists brands_sync_idx on public.brands (user_id, server_updated_at desc);
create index if not exists brands_live_idx on public.brands (user_id) where deleted_at is null;

-- Same trigger the other tables use: the sync clock belongs to the database,
-- because client clocks are wrong often enough to lose data.
drop trigger if exists brands_touch on public.brands;
create trigger brands_touch before insert or update on public.brands
  for each row execute function public.touch_server_updated_at();

-- ── how many a plan is worth ────────────────────────────────────────────────
-- The ladder the market has already proven: one free, a handful on the paid
-- tier, unlimited for agencies.

create or replace function public.brand_allowance()
returns int language sql stable security definer set search_path = '' as $$
  select case (select p.plan from public.profiles p where p.id = (select auth.uid()))
    when 'agency' then 1000000
    when 'pro'    then 3
    else 1
  end;
$$;

-- Soft-deleted brands do not count, so throwing one away frees its slot.
create or replace function public.brand_count()
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.brands b
  where b.user_id = (select auth.uid()) and b.deleted_at is null;
$$;

-- ── row level security ──────────────────────────────────────────────────────

alter table public.brands enable row level security;

drop policy if exists brands_select on public.brands;
create policy brands_select on public.brands
  for select using (auth.uid() = user_id);

/*
 * The limit lives on INSERT only, and that placement is deliberate.
 *
 * An upsert that lands on an existing row is an UPDATE, so editing a brand is
 * never refused, only creating a new one past the allowance is. And because
 * UPDATE is ungated, somebody who downgrades from Pro keeps the brands they
 * made: they simply cannot add another until they are back under the line.
 * Confiscating work on a downgrade is the behaviour this product is built
 * against.
 */
drop policy if exists brands_insert on public.brands;
create policy brands_insert on public.brands
  for insert with check (
    auth.uid() = user_id
    and public.brand_count() < public.brand_allowance()
  );

drop policy if exists brands_update on public.brands;
create policy brands_update on public.brands
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists brands_delete on public.brands;
create policy brands_delete on public.brands
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- To check it: sign in on a free account, make two brands. The second should be
-- refused by Postgres with "new row violates row-level security policy", not by
-- anything in the interface. If the interface refuses it first that is fine,
-- but turn the interface check off once and confirm the database still says no,
-- because that is the half that actually matters.
-- ─────────────────────────────────────────────────────────────────────────────
