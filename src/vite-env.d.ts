/// <reference types="vite/client" />

/**
 * Only the anon key belongs in here.
 *
 * Anything prefixed VITE_ is inlined into the bundle and is readable by anyone who
 * opens devtools. That is correct for the Supabase anon key — it is public by
 * design and grants nothing on its own, because row level security is what decides
 * who can read which row. It is emphatically NOT correct for the Anthropic key or
 * a Supabase service role key: both bypass every check there is, and both stay on
 * the server.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
