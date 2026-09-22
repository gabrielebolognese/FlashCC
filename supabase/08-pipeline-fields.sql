-- FlashCC — pipeline fields, and honest billing
--
-- Run this in the Supabase SQL editor after 01-schema.sql. Safe to re-run, and
-- safe to run now: every line adds a nullable column with a default, and the app
-- works without it (the fields read as empty and the account card shows a
-- renewal date rather than an ending).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE FIVE FIELDS EVERY CONTENT CALENDAR HAS
--
-- Every Notion and Airtable content calendar in the research carries pillar,
-- campaign, objective, reviewer and approval notes. `posts` carried none of
-- them.
--
-- Four are free text, because a pillar is somebody's own vocabulary and an enum
-- would either be wrong for most people or grow until it is a text field with
-- extra steps. `objective` is the exception and is constrained, because it is
-- the one the insight screens GROUP BY — and an open set there turns every typo
-- into its own bucket, which is how an attribution table stops meaning anything.
--
-- Columns rather than a jsonb bag, unlike `docs.data`: these are exactly what
-- somebody filters and groups on, and a blob cannot be indexed usefully for
-- that. It is the same reasoning that made `posts` columnar in the first place.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.posts add column if not exists pillar         text not null default '';
alter table public.posts add column if not exists campaign       text not null default '';
alter table public.posts add column if not exists objective      text;
alter table public.posts add column if not exists reviewer       text not null default '';
alter table public.posts add column if not exists approval_notes text not null default '';

alter table public.posts drop constraint if exists posts_objective_known;
alter table public.posts add constraint posts_objective_known
  check (objective is null or objective in ('awareness', 'engagement', 'authority', 'conversion'));

-- Partial, because most posts will not carry a pillar and there is no reason to
-- index the ones that do not. Grouping by pillar is the whole point of storing
-- it, so it is the one that gets an index.
create index if not exists posts_pillar_idx on public.posts (user_id, pillar)
  where pillar <> '';
create index if not exists posts_campaign_idx on public.posts (user_id, campaign)
  where campaign <> '';

-- ─────────────────────────────────────────────────────────────────────────────
-- HONEST BILLING: ONE BOOLEAN
--
-- FlashCC already behaves correctly here. `ENTITLED` in server/billing.ts treats
-- `active` as entitled, and Stripe keeps a cancelled subscription active until
-- the period it was paid for ends — so "you keep what you paid for" has been
-- true since billing shipped.
--
-- What was missing was the app being able to SAY so. `plan_renews_at` alone
-- cannot distinguish "renews on the 3rd" from "ends on the 3rd", and showing a
-- renewal date for something about to stop is precisely the surprise this
-- feature exists to prevent — Taplio's "they were charging me over 60€ per
-- month" with "no emails, no reminders", Later charging $180 four months after a
-- cancellation.
--
-- Written only by the Stripe webhook through the service role. The browser
-- cannot set it, for the same reason it cannot set `plan`.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists plan_ends_at_period_end boolean not null default false;

-- The column-level grant from 01-schema.sql already restricts what the browser
-- may write to `profiles`, and a column added afterwards is not in that grant —
-- so this is read-only to the client by default, which is what it should be.
-- Re-stated rather than assumed, because "it was already safe" is how a schema
-- acquires a hole.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- To check it: set a post's objective to something not in the list and confirm
-- Postgres refuses it. Then cancel a subscription in the Stripe portal and
-- confirm the account card changes from "Renews" to "Ends" WITHOUT the plan
-- dropping — access runs to the end of the period, which is the promise.
-- ─────────────────────────────────────────────────────────────────────────────
