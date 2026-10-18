-- FlashCC, a translation glossary per brand (Batch 29)
--
-- Run this in the Supabase SQL editor after 10-brand-voice.sql. Safe to re-run.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Terms a translation never touches (the product name, a coined phrase), and
-- terms with a fixed rendering in a given language. Stored on the brand beside
-- its voice, read whole by the browser and sent with a translation, where the
-- server masks every term before the model sees a word.
--
--   [
--     { "term": "FlashCC" },
--     { "term": "Swipe file", "renderings": { "de": "Ideensammlung" } }
--   ]
--
-- One jsonb column for the reason `voice` is one: nothing queries inside it.
--
-- A brand that never had a glossary sends no glossary key, so a Batch 29
-- client syncs on a project that has not run this yet until somebody types a
-- term. After that the brand's sync fails until it is run (D58).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.brands add column if not exists glossary jsonb;

-- A list or nothing, for the reason 10-brand-voice.sql gives for its object.
alter table public.brands drop constraint if exists brands_glossary_is_array;
alter table public.brands add constraint brands_glossary_is_array
  check (glossary is null or jsonb_typeof(glossary) = 'array');

-- No RLS change: `brands` gates every verb on auth.uid() = user_id already.
