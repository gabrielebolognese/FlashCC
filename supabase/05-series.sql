-- FlashCC — series
--
-- Run this in the Supabase SQL editor after 01-schema.sql. Safe to re-run, and
-- safe to run now: it only adds nullable columns, and the app works without it
-- (the series still travels inside `docs.data`, it just cannot be queried).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- A series is two fields, not a table.
--
-- Every screen that shows a carousel wants to know whether it is part 3 of 6,
-- and a join to answer that would be a round trip for a badge. There is also
-- nothing else a series row would hold: the name is taken from the lowest
-- numbered part, because a series whose part 1 was deleted should not lose its
-- name along with it.
--
-- The columns are a PROJECTION of what `docs.data` already carries, exactly like
-- `framework` and `style_id` beside them. The blob stays the truth. These exist
-- so the grid can group and badge without downloading every slide, and so the
-- "part 2 is due" check is one query rather than a scan.
--
-- On `posts`, the same two fields are a COPY rather than a projection, and that
-- difference is deliberate. A post is the record of what went out. Renumbering a
-- series afterwards — because part 3 was deleted — must not silently rewrite
-- what "part 2" meant on the day it was published.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.docs  add column if not exists series_id   text;
alter table public.docs  add column if not exists series_part int;
alter table public.posts add column if not exists series_id   text;
alter table public.posts add column if not exists series_part int;

-- A part number is 1-based and only means anything with a series beside it.
-- Written as a trigger-free check so an old row with neither stays valid.
alter table public.docs drop constraint if exists docs_series_part_positive;
alter table public.docs add constraint docs_series_part_positive
  check (series_part is null or series_part >= 1);

alter table public.posts drop constraint if exists posts_series_part_positive;
alter table public.posts add constraint posts_series_part_positive
  check (series_part is null or series_part >= 1);

-- Partial, because most carousels are not part of anything and there is no
-- reason to carry them in this index.
create index if not exists docs_series_idx
  on public.docs (user_id, series_id, series_part) where series_id is not null;

create index if not exists posts_series_idx
  on public.posts (user_id, series_id, series_part) where series_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- No RLS changes. Both tables already restrict every verb to `auth.uid() =
-- user_id`, and a new column on a table whose policies are row-scoped is covered
-- by them — which is the advantage of gating on the row rather than per column.
--
-- To check it: make three carousels a series in the app, sync, and confirm in
-- Table Editor that `docs` shows series_id repeated with series_part 1, 2, 3.
-- ─────────────────────────────────────────────────────────────────────────────
