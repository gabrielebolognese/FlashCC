-- FlashCC, lanes and the idea bank (Batch 27)
--
-- Run this in the Supabase SQL editor after 01-schema.sql. Safe to re-run.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- The idea bank is not a table. An idea is a post in the `idea` stage, which
-- the pipeline has had since Batch 3: it already carries a title, notes, a
-- pillar and a client, it already syncs, and it already sits in the board's
-- first column. Turning it into a carousel is the same record moving along,
-- not a copy into another table that then has to be kept in step.
--
-- So `posts` gains two columns: where an idea came from, and which lane a post
-- fills. `lanes` is new: a recurring slot in the week with its format decided.
--
-- Both posts columns are written by every sync from Batch 27 on, so this file
-- is required before a Batch 27 client syncs, like 08-pipeline-fields.sql was.
-- The lanes table is optional in the same way clients are: until it exists,
-- lanes stay on the machine that made them.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.posts add column if not exists source  text not null default '';
alter table public.posts add column if not exists lane_id text;

-- Not a foreign key, for the reason posts.doc_id has none: deleting a lane must
-- not touch a single post, and the composite reference would be Postgres 15+.
create index if not exists posts_lane_idx on public.posts (user_id, lane_id)
  where lane_id is not null and deleted_at is null;

create table if not exists public.lanes (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                text not null,
  name              text not null default '',
  -- ISO weekday: 1 is Monday, 7 is Sunday.
  weekday           int  not null check (weekday between 1 and 7),
  -- Local wall-clock time, "HH:MM". A lane is "Mondays at nine" wherever the
  -- person is, not an instant.
  at_time           text not null default '09:00' check (at_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  platform          text not null default 'linkedin',
  framework         text not null,
  -- { kind: "style" | "pack" | "template", id }
  look              jsonb not null,
  pillar            text not null default '',
  client_id         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz,
  primary key (user_id, id)
);

create index if not exists lanes_sync_idx on public.lanes (user_id, server_updated_at desc);

drop trigger if exists lanes_touch on public.lanes;
create trigger lanes_touch before insert or update on public.lanes
  for each row execute function public.touch_server_updated_at();

alter table public.lanes enable row level security;

-- No allowance and no count, on purpose: a lane is a plan, and plans are not
-- metered (invariant 7).
drop policy if exists lanes_select on public.lanes;
create policy lanes_select on public.lanes
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists lanes_insert on public.lanes;
create policy lanes_insert on public.lanes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists lanes_update on public.lanes;
create policy lanes_update on public.lanes
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists lanes_delete on public.lanes;
create policy lanes_delete on public.lanes
  for delete to authenticated using (user_id = (select auth.uid()));
