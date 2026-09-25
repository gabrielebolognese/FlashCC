/**
 * `.env`, loaded before anything else reads it.
 *
 * ── Why this is a module and not four lines in `index.ts` ────────────────────
 *
 * It WAS four lines in `index.ts`, below the imports, and that is a bug rather
 * than a style choice. ES modules evaluate every import fully before the
 * importing module's own body runs, so `supabase.ts` read
 * `process.env.SUPABASE_URL` and `paddle.ts` read `process.env.PADDLE_API_KEY`
 * while the environment was still empty. Their module-level constants were
 * `undefined` for the life of the process.
 *
 * The symptom was confusing, which is why it survived: `/api/health` reported
 * `draft: true` because `draftConfigured()` is a FUNCTION and reads the
 * environment when called, while `secretKey` reported false and every
 * authenticated route answered "Supabase is not configured on the server" with
 * both values plainly sitting in `.env`.
 *
 * Importing this first works because ES module evaluation is depth-first in
 * declaration order: whatever `import "./env.js"` pulls in runs before the
 * imports written after it.
 *
 * **So this import must stay first in `index.ts`, and any new module that reads
 * `process.env` at module level depends on it.** The alternative, and the reason
 * this is a real fix rather than a papering-over, is that reading the
 * environment lazily inside a function would work too but would mean every
 * config value is re-read on every request forever to solve a problem that
 * happens once at startup.
 */
try {
  process.loadEnvFile();
} catch {
  /* No .env. The ambient environment is the whole story, which is correct in
     production where values arrive from the host rather than from a file. */
}

export {};
