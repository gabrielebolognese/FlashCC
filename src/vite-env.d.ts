/// <reference types="vite/client" />

/**
 * Only the publishable key belongs in here.
 *
 * Anything prefixed VITE_ is inlined into the bundle and is readable by anyone who
 * opens devtools. That is correct for the Supabase publishable key — it is
 * public by design and grants nothing on its own, because row level security is what decides
 * who can read which row. It is emphatically NOT correct for the Anthropic key or
 * a Supabase secret / service role key: both bypass every check there is, and both stay on
 * the server.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  /** New-style key (sb_publishable_…). Preferred. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Legacy JWT anon key. Still accepted. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
