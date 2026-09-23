-- FlashCC, turn the remaining gates on
--
-- RUN THIS LAST, and only once Stripe is wired and something is actually setting
-- `profiles.plan`. Before that, every account is 'free' and this takes review
-- links away from you as well as from everybody else.
--
-- Run 02-pro-gate.sql at the same time. They are separate files because they
-- were written at different times, not because they belong to different moments.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE GATES ARE HERE AND NOT IN THE INTERFACE
--
-- A client-side check is a suggestion. Anyone can flip a boolean in devtools or
-- POST straight to /rest/v1/shares with the publishable key, which is in the
-- bundle by design. If the only thing standing between a free account and a
-- paid feature is a React conditional, the feature is free.
--
-- So the rule for this product is: **every paid boundary is either a Postgres
-- policy or a check in server/.** The interface's job is to explain the
-- boundary before the database refuses, never to be the boundary.
--
-- What is gated where, after this file:
--
--   posts (cloud pipeline)  02-pro-gate.sql     INSERT/UPDATE require is_pro()
--   brands, count           03-brands.sql       INSERT policy, allowance by plan
--   clients, count          06-clients.sql      INSERT policy, allowance by plan
--   shares (review links)   THIS FILE           INSERT requires is_pro()
--   AI drafting, hooks      server/draft.ts     requirePro() -> 402
--   numbered image export   server/export.ts    requirePro() -> 402
--
-- And what is deliberately NOT gated, because it is the free product:
--
--   the editor, every framework, every style, localStorage, document sync,
--   PDF export, and being a reviewer on somebody else's link, see invariant 6.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── review links are Pro ────────────────────────────────────────────────────
-- Creating one is gated. Everything else about an existing share is not: a
-- lapsed subscriber must still be able to read the comments their client left
-- and turn the link off, or cancelling would look like confiscation and the
-- client would be left commenting into a void.

drop policy if exists shares_insert on public.shares;
create policy shares_insert on public.shares
  for insert with check ((select auth.uid()) = user_id and public.is_pro());

-- Unchanged, and restated so this file reads as the whole truth about `shares`
-- rather than as a diff somebody has to reconstruct.
drop policy if exists shares_select on public.shares;
create policy shares_select on public.shares
  for select using ((select auth.uid()) = user_id);

drop policy if exists shares_update on public.shares;
create policy shares_update on public.shares
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists shares_delete on public.shares;
create policy shares_delete on public.shares
  for delete using ((select auth.uid()) = user_id);

-- Comments are NOT gated on plan, in either direction. A reviewer writes through
-- the service role and has no account at all (invariant 6), and the owner's own
-- notes on a share they already have are not a separate purchase.

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- To undo:
--
--   drop policy if exists shares_insert on public.shares;
--   create policy shares_insert on public.shares
--     for insert with check ((select auth.uid()) = user_id);
--
-- To check it: on a free account, try to create a review link. Postgres must
-- refuse with "new row violates row-level security policy", not the interface.
-- Turn the interface check off once and confirm the database still says no,
-- because that is the half that actually holds.
-- ─────────────────────────────────────────────────────────────────────────────
