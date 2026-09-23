-- FlashCC, initial schema
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- It is idempotent: running it twice is safe.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Four decisions worth understanding before you change anything here.
--
-- 1. IDENTITY IS THE CLIENT'S. The app already mints ids offline (`d_lq3f2`,
--    `p_lq3f9`) and creates records before anyone has signed in. So the primary
--    key is (user_id, id) rather than a server uuid: no id remapping on sync, and
--    ids only have to be unique per person, so two users minting the same string
--    never collide.
--
-- 2. TWO TIMESTAMPS, NOT ONE. `updated_at` is the CLIENT's own updatedAt and is
--    what last-write-wins compares. `server_updated_at` is set by a trigger and
--    is what "give me everything that changed since my last pull" uses. Collapsing
--    them breaks sync in a way that looks fine until two devices disagree: pushing
--    a row would bump its clock, so the server would always look newer than the
--    laptop that just sent it, and the laptop's next pull would overwrite itself.
--
-- 3. DELETES ARE TOMBSTONES. `deleted_at` is set instead of removing the row, and
--    clients filter it out. Without this, deleting a project on your laptop and
--    then syncing your phone resurrects it, the phone still has the row, the
--    server has no record that it ever went, and the merge dutifully puts it back.
--    Deletion is just another edit, so LWW settles it like any other conflict.
--
-- 4. THE PLAN IS NOT USER-WRITABLE. `profiles.plan` has its INSERT and UPDATE
--    privileges narrowed to a column list that excludes it, so a signed-in user
--    can set their display name but can neither edit their way to Pro nor create
--    themselves there on first sign-in. Only the service role (your Stripe
--    webhook) can write it. RLS alone would NOT do this, an owner policy on the
--    row lets them write every column in it.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per auth user, created by the client on first sign-in. See the note
-- further down about why this is not a trigger on auth.users.

create table if not exists public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  email                  text,
  display_name           text,
  plan                   text not null default 'free',
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan_renews_at         timestamptz,
  created_at             timestamptz not null default now(),
  server_updated_at      timestamptz not null default now(),
  constraint profiles_plan_known check (plan in ('free', 'pro', 'agency'))
);

comment on column public.profiles.plan is
  'Writable only by the service role. See the revoke below, do not grant it back.';

-- ── docs (carousels) ────────────────────────────────────────────────────────
-- `data` holds the whole Doc. The flat columns beside it are exactly the fields
-- DocSummary already needs, so the project grid can be drawn without pulling
-- every slide, layer and image down the wire.

create table if not exists public.docs (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                text not null,
  name              text not null default 'Untitled',
  width             int  not null default 1080,
  height            int  not null default 1350,
  slide_count       int  not null default 0,
  background        text,
  doc_group         text,
  framework         text,
  style_id          text,
  data              jsonb not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz,
  primary key (user_id, id)
);

-- ── posts (publications) ────────────────────────────────────────────────────
-- Columns, not a blob: these are what analytics groups and filters by, and a
-- jsonb blob cannot be indexed usefully for that. The structural fields are
-- copied off the doc at creation and deliberately never re-derived, the doc
-- keeps being edited, and the version that earned the numbers is the one that
-- went out.

create table if not exists public.posts (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                text not null,
  doc_id            text,
  title             text not null default 'Untitled',
  stage             text not null default 'idea',
  platform          text not null default 'linkedin',

  framework         text,
  slide_count       int  not null default 0,
  hook              text not null default '',
  style_id          text,

  scheduled_for     timestamptz,
  posted_at         timestamptz,
  url               text,
  caption           text not null default '',
  notes             text not null default '',
  metrics           jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz,

  primary key (user_id, id),

  -- doc_id is a soft reference, with no foreign key behind it on purpose. A
  -- composite FK would need ON DELETE SET NULL (doc_id), which is Postgres 15+
  -- only, and it makes deleting an account order-sensitive because both tables
  -- cascade from auth.users at once. RLS already stops anyone reading a carousel
  -- that is not theirs, and detachDoc() nulls these when a project is thrown
  -- away, so the constraint was buying very little for that much fragility.

  constraint posts_stage_known check (stage in ('idea', 'drafting', 'ready', 'scheduled', 'posted')),
  constraint posts_platform_known check (platform in ('linkedin', 'instagram', 'tiktok', 'x'))
);

-- ── indexes ─────────────────────────────────────────────────────────────────

create index if not exists docs_sync_idx  on public.docs  (user_id, server_updated_at desc);
create index if not exists posts_sync_idx on public.posts (user_id, server_updated_at desc);
create index if not exists posts_stage_idx on public.posts (user_id, stage) where deleted_at is null;
create index if not exists posts_doc_idx on public.posts (user_id, doc_id) where doc_id is not null;
create index if not exists posts_measured_idx on public.posts (user_id, posted_at desc)
  where deleted_at is null and posted_at is not null;

-- ── server clock ────────────────────────────────────────────────────────────
-- Stamped by the database, never by the client, because client clocks are wrong
-- often enough to lose data if you page through them.

create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at = now();
  return new;
end $$;

drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.touch_server_updated_at();

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before insert or update on public.posts
  for each row execute function public.touch_server_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.touch_server_updated_at();

-- ── profiles are made by the client ────────────────────────────────────────
-- Deliberately NOT a trigger on auth.users. Supabase has tightened ownership of
-- that table, so `create trigger ... on auth.users` now fails on many projects
-- with "must be owner of relation users", and because the SQL editor runs the
-- whole script in one transaction, that single error silently rolls back every
-- table above it. Nothing here needs privileged DDL; auth.ts creates the row on
-- first sign-in instead.

-- ── row level security ──────────────────────────────────────────────────────
-- This is the whole security boundary. The anon key in the browser is public by
-- design and grants nothing on its own; these policies are what stop one account
-- reading another. `using` gates what a statement may see and delete, `with
-- check` gates what it may leave behind, both are needed, or a user could
-- update their own row into someone else's user_id.

alter table public.profiles enable row level security;
alter table public.docs     enable row level security;
alter table public.posts    enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Only ever your own row, and only the row whose id is your user id.
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists docs_owner on public.docs;
create policy docs_owner on public.docs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists posts_owner on public.posts;
create policy posts_owner on public.posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The billing columns.
--
-- RLS cannot express "this row but not that column", so the restriction is a
-- privilege rather than a policy. Note the shape carefully: Supabase grants the
-- authenticated role UPDATE on the whole table by default, and in Postgres a
-- column-level REVOKE does NOTHING while a table-wide grant stands. The only way
-- to narrow it is to drop the table-level privilege and grant back the one column
-- that is safe.
--
-- Get this wrong and the paywall is decorative: any signed-in user can PATCH
-- /rest/v1/profiles with {"plan":"pro"} from the browser console and the database
-- will accept it.
revoke update on public.profiles from authenticated, anon;
grant  update (display_name) on public.profiles to authenticated;

-- Same reasoning for INSERT, and it matters more here: without it a user simply
-- creates their own row with plan = 'pro' on first sign-in and never pays. The
-- column list is what they may set; plan is not in it, so it takes its default.
revoke insert on public.profiles from authenticated, anon;
grant  insert (id, email, display_name) on public.profiles to authenticated;

-- Deleting a profile is nobody's business. No RLS policy allows it, and RLS
-- denies whatever it does not explicitly permit.

-- ── plan lookup ─────────────────────────────────────────────────────────────
-- Used by 02-pro-gate.sql once billing is live, and safe to have sitting here
-- until then.

-- Takes no argument on purpose: asking about the CALLER means there is no way to
-- pass someone else's id in and learn what they pay. The subselect around
-- auth.uid() is the documented trick for making the planner evaluate it once for
-- the statement rather than once per row.
create or replace function public.is_pro()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.plan in ('pro', 'agency')
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- KNOWN LIMIT, worth fixing before real customers arrive:
--
-- Doc.media holds uploaded images as base64 data URLs inside `data`, so a
-- carousel with a handful of photos is a multi-megabyte row that has to move in
-- full on every sync. Moving media to Supabase Storage and keeping only object
-- paths in the JSON is the fix. It is not urgent at one user; it is unpleasant
-- at a hundred.
-- ─────────────────────────────────────────────────────────────────────────────
