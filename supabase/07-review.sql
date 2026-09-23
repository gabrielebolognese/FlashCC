-- FlashCC, review links and comments
--
-- Run this in the Supabase SQL editor after 01-schema.sql and 06-clients.sql.
-- Safe to re-run.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE ONE FEATURE WITH NO OFFLINE VERSION
--
-- A review link is a URL somebody else opens. There is no localStorage fallback
-- for that, which makes this the first thing in FlashCC that genuinely requires
-- the database to be live. Everything else degrades; this does not exist without
-- these tables.
--
-- ── Why RLS is not the boundary here ────────────────────────────────────────
--
-- A reviewer has no account, by design, that is the whole feature. So there is
-- no `auth.uid()` to write a policy against, and the obvious alternative (an
-- anon policy that trusts a token in the row) means letting the anon key read
-- the shares table to find out which token matches, which is the same as letting
-- it read every share.
--
-- So: RLS here allows the OWNER and nobody else, and the reviewer never talks to
-- PostgREST at all. `server/review.ts` holds the service role key, takes the
-- token, and returns only what that token entitles the caller to, which is a
-- boundary written once, in one file, that can be read end to end.
--
-- That is a deliberate departure from "the RLS policies are the boundary" and it
-- is the only place in this schema where it is true.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.shares (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                text not null,
  doc_id            text not null,
  -- The secret in the URL. Unique across every account, because it is the only
  -- thing identifying the row on the way in.
  token             text not null unique,
  title             text not null default '',
  -- The rendered slides, their public URLs, and the version fingerprint they
  -- were taken at. A share is a SNAPSHOT: the client approves what will be
  -- posted, not a canvas that may have moved since.
  snapshot          jsonb not null default '{}'::jsonb,
  brand_id          text,
  client_id         text,
  status            text not null default 'open'
                      check (status in ('open', 'approved', 'changes', 'revoked')),
  decision_note     text not null default '',
  decided_by        text,
  decided_at        timestamptz,
  -- Frozen at the moment of approval and never moved again. `snapshot.version`
  -- can advance when a share is re-captured; this cannot, and the gap between
  -- them is the warning the editor shows. "Three people approved the post. None
  -- of them approved the same version."
  approved_version  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz,
  primary key (user_id, id)
);

-- The lookup the review page makes, on every request, by token alone.
create index if not exists shares_token_idx on public.shares (token) where deleted_at is null;
create index if not exists shares_doc_idx on public.shares (user_id, doc_id);

drop trigger if exists shares_touch on public.shares;
create trigger shares_touch before insert or update on public.shares
  for each row execute function public.touch_server_updated_at();

create table if not exists public.comments (
  -- The owner of the share, not the author of the comment. A reviewer has no
  -- account, so this is the only user id there is, and it is what RLS gates on.
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                text not null,
  share_id          text not null,
  -- 0-based, or null for the deck as a whole.
  --
  -- The INDEX is authoritative rather than the slide id: a comment is against a
  -- snapshot, and re-laying a deck can change slide ids while the pictures the
  -- reviewer looked at keep their order. `slide_id` is kept beside it purely so
  -- the editor can jump to the right slide when it still exists.
  slide_index       int check (slide_index is null or slide_index >= 0),
  slide_id          text,
  scope             text not null default 'client' check (scope in ('internal', 'client')),
  author            text not null default '',
  body              text not null,
  resolved          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz,
  primary key (user_id, id)
);

create index if not exists comments_share_idx on public.comments (share_id, created_at)
  where deleted_at is null;

drop trigger if exists comments_touch on public.comments;
create trigger comments_touch before insert or update on public.comments
  for each row execute function public.touch_server_updated_at();

-- ── row level security ──────────────────────────────────────────────────────
-- Owner only, both tables. The reviewer's path goes through the service role in
-- server/review.ts and never touches these policies.

alter table public.shares enable row level security;
alter table public.comments enable row level security;

drop policy if exists shares_select on public.shares;
create policy shares_select on public.shares
  for select using ((select auth.uid()) = user_id);

drop policy if exists shares_insert on public.shares;
create policy shares_insert on public.shares
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists shares_update on public.shares;
create policy shares_update on public.shares
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists shares_delete on public.shares;
create policy shares_delete on public.shares
  for delete using ((select auth.uid()) = user_id);

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select using ((select auth.uid()) = user_id);

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete using ((select auth.uid()) = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- NO SEAT TABLE, AND THERE WILL NOT BE ONE.
--
-- Sprout charges $499/month per external approver and caps the account at three.
-- It is the loudest single complaint in the whole research corpus. Planable,
-- Gain and Ziflow all give reviewer seats away as an acquisition lever.
--
-- There is no reviewer record here, no invitation, and nothing counting them,
-- deliberately, a share link costs nothing and is capped by nothing. If a
-- future migration adds a seat count to this file, it is undoing the reason the
-- feature exists. See CLAUDE.md invariant 6.
-- ─────────────────────────────────────────────────────────────────────────────

-- To check it: create a share in the app, open its URL in a private window with
-- no session, and confirm the slides load and a comment posts. Then sign in as a
-- different account and try to select that row from `shares`, it must come back
-- empty.
