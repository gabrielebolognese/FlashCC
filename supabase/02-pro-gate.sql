-- FlashCC, turn the paywall on
--
-- DO NOT RUN THIS YET. Run it when Stripe is wired and something is actually
-- setting profiles.plan, or every account including yours loses the pipeline.
--
-- What it does: makes the cloud copy of the pipeline a Pro feature in the
-- DATABASE rather than in the interface. A client-side check is a suggestion,
-- anyone can flip a boolean in devtools or POST to the REST endpoint directly.
-- After this, a free account's insert is refused by Postgres.
--
-- Free accounts keep working: everything still saves to localStorage, and the
-- app is built to run with no cloud at all. What they lose is the synced,
-- durable, multi-device copy, which is the thing being sold.
--
-- Carousels are deliberately NOT gated. Making them is the free tier, and a
-- paywall on the editor would just make this a worse Canva. The history is
-- what compounds, so the history is what costs money.

begin;

drop policy if exists posts_owner on public.posts;

create policy posts_read_own on public.posts
  for select using (auth.uid() = user_id);

-- Writes require a plan. Reads do not: a lapsed subscriber must still be able to
-- pull their own history back out, or cancelling would look like confiscation.
create policy posts_write_pro on public.posts
  for insert with check (auth.uid() = user_id and public.is_pro());

create policy posts_update_pro on public.posts
  for update using (auth.uid() = user_id and public.is_pro())
  with check (auth.uid() = user_id and public.is_pro());

create policy posts_delete_own on public.posts
  for delete using (auth.uid() = user_id);

commit;

-- To undo, restore the ungated policy:
--
--   drop policy if exists posts_read_own   on public.posts;
--   drop policy if exists posts_write_pro  on public.posts;
--   drop policy if exists posts_update_pro on public.posts;
--   drop policy if exists posts_delete_own on public.posts;
--   create policy posts_owner on public.posts
--     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
