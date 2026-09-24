-- FlashCC, brand voice
--
-- Run this in the Supabase SQL editor after 03-brands.sql. Safe to re-run, and
-- safe to run now: it adds one nullable column and the app works without it
-- (a brand simply has no voice until the column exists).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ONE COLUMN, FOR THE SAME REASON `theme` IS ONE COLUMN.
--
-- Nothing queries inside it. The browser reads it whole and hands it to a
-- prompt; the server reads it whole and writes it into a cached block. Three
-- flat columns, or a child table for samples, would be three more things to
-- migrate the first time a fourth field is wanted, and would buy an index
-- nobody would ever use.
--
-- What it holds:
--
--   {
--     "tone":    "Blunt, no throat-clearing.",
--     "samples": ["a post they wrote", "another one"],
--     "avoid":   ["leverage", "synergy"]
--   }
--
-- All three optional. A brand with none behaves exactly as brands did before
-- this existed, which is what stops it becoming a form somebody has to fill in
-- before the product works.
--
-- ── Why this is worth a migration at all ────────────────────────────────────
--
-- Every AI carousel tool in the research produces competent, generic copy, and
-- that is the complaint underneath most of them. Three posts somebody actually
-- wrote do more to fix it than any amount of prompt engineering, because a model
-- can match a pattern it can see and can only guess at a description. It is also
-- the one thing a competitor cannot copy, being the customer's own writing.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.brands add column if not exists voice jsonb;

-- An object or nothing. A bare string or an array here would reach the prompt
-- builder as something it does not expect, and the failure would look like the
-- model ignoring the voice rather than like bad data.
alter table public.brands drop constraint if exists brands_voice_is_object;
alter table public.brands add constraint brands_voice_is_object
  check (voice is null or jsonb_typeof(voice) = 'object');

-- No RLS change. `brands` already gates every verb on auth.uid() = user_id, and
-- a new column on a row-scoped policy is covered by it, which is the advantage
-- of gating on the row rather than per column.

-- ─────────────────────────────────────────────────────────────────────────────
-- To check it: give a brand a voice in the app, sync, and confirm Table Editor
-- shows the object on that row. Then draft the same brief under two brands with
-- different voices and read both. If they sound the same, the voice is not
-- reaching the prompt, and `server/prompts.test.ts` is where to look first.
-- ─────────────────────────────────────────────────────────────────────────────
