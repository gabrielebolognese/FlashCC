-- FlashCC — the asset library
--
-- Run this in the Supabase SQL editor after 01-schema.sql and 03-brands.sql.
-- Safe to re-run. Safe to run now: it adds storage and a table nothing else
-- depends on, and the app works without it (assets stay on this machine until
-- the buckets exist).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- TWO BUCKETS, AND THE REASON THERE ARE TWO
--
--   media   PRIVATE. Uploads, logos and font files. Read through a signed URL
--           that the owner's session mints, and by nobody else.
--
--   slides  PUBLIC. Rendered carousel slides, published so a scheduler can
--           fetch them.
--
-- That difference is not an oversight in the second one. Eight of the nine bulk
-- schedulers require a publicly-hosted image URL in their CSV import and not one
-- of them provides the hosting, which is the gap this feature exists to fill. A
-- signed URL cannot fill it: the scheduler fetches the picture days later, with
-- no credentials, long after any signature has expired. So published slides are
-- public by design — and nothing lands in that bucket unless someone presses
-- Publish, which is the point at which "anyone with the link" is exactly what
-- was asked for.
--
-- Paths are `<user id>/<kind>/<id>.<ext>`. The first segment is the owner, and
-- that is the access rule rather than a convention: every policy below compares
-- `storage.foldername(name)[1]` against `auth.uid()`. Change the layout in
-- assets.ts and these stop matching.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('slides', 'slides', true)
on conflict (id) do update set public = excluded.public;

-- ── who may touch what ──────────────────────────────────────────────────────
-- Four verbs, spelled out rather than folded into one `for all`, because an
-- UPDATE policy needs both `using` and `with check` and a combined one hides
-- that from the next reader.

drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects
  for select to authenticated using (
    bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists media_write on storage.objects;
create policy media_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists media_replace on storage.objects;
create policy media_replace on storage.objects
  for update to authenticated using (
    bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Published slides: the world reads them (that is what publishing means), the
-- owner is still the only one who can put them there or take them down.

drop policy if exists slides_read on storage.objects;
create policy slides_read on storage.objects
  for select using (bucket_id = 'slides');

drop policy if exists slides_write on storage.objects;
create policy slides_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'slides' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists slides_replace on storage.objects;
create policy slides_replace on storage.objects
  for update to authenticated using (
    bucket_id = 'slides' and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'slides' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists slides_delete on storage.objects;
create policy slides_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'slides' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- THE INDEX
--
-- A bucket can be listed, so a table of what is in it looks redundant. It is
-- not: a name, a folder, the brand a logo belongs to and the family a font
-- registered under are all things the bucket has no place to put, and listing a
-- bucket to find out what you own is a round trip per screen. This is the
-- library; the bucket is only where the bytes sit.
--
-- One table for images AND fonts, discriminated by `kind`. They differ in three
-- nullable columns and agree on everything else — owner, path, size, folder,
-- soft delete, sync clock — so two tables would be two of every policy, two
-- triggers and two branches in the sync for no gain.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.assets (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                text not null,
  kind              text not null default 'image' check (kind in ('image', 'font')),
  name              text not null default '',
  -- Object path inside the `media` bucket. Empty is not allowed: a row with no
  -- bytes behind it is a ghost in the library.
  path              text not null check (path <> ''),
  mime              text not null default '',
  -- A fingerprint of the bytes. The same logo found inlined in twenty old
  -- documents becomes one object, and re-running the migration finds it again.
  content_key       text,
  width             int,
  height            int,
  bytes             bigint not null default 0,
  -- fonts only: the namespaced family the FontFace was registered under.
  family            text,
  -- Logos and brand-scoped faces. Deliberately NOT a foreign key: deleting a
  -- brand should orphan its logo into the library, not delete the file.
  brand_id          text,
  role              text check (role in ('light', 'dark', 'mark')),
  folder            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz,
  primary key (user_id, id)
);

create index if not exists assets_sync_idx on public.assets (user_id, server_updated_at desc);
create index if not exists assets_live_idx on public.assets (user_id) where deleted_at is null;
create index if not exists assets_brand_idx on public.assets (user_id, brand_id) where brand_id is not null;
create index if not exists assets_key_idx on public.assets (user_id, content_key) where content_key is not null;

drop trigger if exists assets_touch on public.assets;
create trigger assets_touch before insert or update on public.assets
  for each row execute function public.touch_server_updated_at();

alter table public.assets enable row level security;

drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets
  for select using ((select auth.uid()) = user_id);

drop policy if exists assets_insert on public.assets;
create policy assets_insert on public.assets
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists assets_update on public.assets;
create policy assets_update on public.assets
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists assets_delete on public.assets;
create policy assets_delete on public.assets
  for delete using ((select auth.uid()) = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- BRAND LOGOS
--
-- Three asset ids on the brand, not three copies of a file. `{"light": "a_x",
-- "dark": "a_y", "mark": "a_z"}` — jsonb for the same reason `theme` is jsonb:
-- nothing queries inside it and three columns would only be three things to
-- migrate the next time a variant is added.
--
-- Pointing at the library rather than embedding is what makes "a shared logo is
-- stored once" true: five brands in an agency account can all point at the same
-- object.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.brands add column if not exists logos jsonb not null default '{}'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- To check it: sign in, upload an image in the Library, and confirm in Storage →
-- media that the object sits under your user id. Then sign in as somebody else
-- and try to read that path — it must come back empty, not forbidden-looking-but-
-- readable. Publish a carousel and confirm the URL in the CSV opens in a private
-- window with no session at all; if it does not, no scheduler will ever fetch it.
-- ─────────────────────────────────────────────────────────────────────────────
