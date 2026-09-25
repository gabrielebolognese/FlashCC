-- FlashCC, billing columns that do not name a vendor
--
-- Run this in the Supabase SQL editor after 01-schema.sql. Safe to re-run.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS EXISTS
--
-- The billing provider changed from Stripe, and two columns were named after it.
-- The obvious fix is to rename them after whoever is taking the money this week,
-- which would leave the project in exactly the position that made this migration
-- necessary in the first place.
--
-- So they become `billing_customer_id` and `billing_subscription_id`. A provider
-- is a detail of how money arrives; the fact that somebody has an account with
-- whoever takes the money is not. The provider has since changed again, from
-- Lemon Squeezy to Paddle, and nothing in here had to move. That is the argument
-- for the naming, made twice.
--
-- ── What this does NOT touch ────────────────────────────────────────────────
--
-- The column-level grants in 01-schema.sql name only `display_name`, so the
-- paywall is untouched by this. Worth stating because getting that wrong is how
-- `plan` becomes writable from a browser console, and a rename is exactly the
-- kind of change where somebody reissues a GRANT without reading it.
--
-- Postgres carries column privileges across a rename automatically. They are
-- attached to the column, not to its name.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'stripe_customer_id'
  ) then
    alter table public.profiles rename column stripe_customer_id to billing_customer_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'stripe_subscription_id'
  ) then
    alter table public.profiles rename column stripe_subscription_id to billing_subscription_id;
  end if;
end $$;

-- For a database created after this migration landed, where the rename above
-- found nothing to do.
alter table public.profiles add column if not exists billing_customer_id text;
alter table public.profiles add column if not exists billing_subscription_id text;

comment on column public.profiles.billing_customer_id is
  'The payment provider''s id for this person. A Paddle ctm_ id today.';
comment on column public.profiles.billing_subscription_id is
  'Their current subscription at the provider, or null when they have none.';

-- ─────────────────────────────────────────────────────────────────────────────
-- To check it: Table Editor, profiles, confirm the two columns are there under
-- the new names and that no `stripe_` column remains. Then sign in and confirm
-- the account screen still loads, it selects these columns by name.
-- ─────────────────────────────────────────────────────────────────────────────
