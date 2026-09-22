# Supabase setup

Fifteen minutes, once.

## 1. Create the project

[supabase.com/dashboard](https://supabase.com/dashboard) → **New project**. Pick a region near
you; everything else can stay default. The free tier is enough to build on.

## 2. Run the schema

**SQL Editor → New query**, paste the whole of `01-schema.sql`, run it.

The editor runs the whole script inside **one transaction**, so it is all or
nothing: a single error anywhere rolls back every table above it and leaves the
schema completely empty. That failure looks a lot like success if you do not read
the output, so check the result pane says *Success* before moving on — and if it
does not, the error text is the useful thing to keep.

It is idempotent, so you can re-run it after editing without dropping anything. **Do not run
`02-pro-gate.sql`** — that one turns the paywall on and belongs after Stripe exists.

Check it landed: **Table Editor** should show `profiles`, `docs` and `posts`, each with the green
**RLS enabled** badge. If any table says RLS is disabled, stop and work out why — that badge is
the only thing standing between one account and everyone else's carousels.

## 3. Turn on email sign-in

**Authentication → Providers → Email.** Enable it, and leave **Confirm email** on.

Magic links only, so **disable** password sign-in if it is on. There is no password field anywhere
in the app.

**Authentication → URL Configuration:** set **Site URL** to `http://localhost:5173` while
developing, and add your real domain to **Redirect URLs** before launch. The emailed link will not
work against an origin that is not listed here.

The built-in mailer is rate limited to a handful of emails an hour, which is fine for testing. Set
up a real SMTP provider (Resend, Postmark) before anyone else signs up.

## 4. Point the app at it

**Project Settings → API** gives you two values.

```
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then restart `npm run dev` — Vite reads
env files at boot, not on save.

The anon key is *supposed* to be public. It identifies the project and authorises nothing on its
own; the RLS policies decide who can read which row. The **service role** key is the opposite of
that: it bypasses every policy. It never goes in `.env` with a `VITE_` prefix, never in this
folder, and never in the browser.

## 5. Check it works

With no env vars set the app runs exactly as before, on localStorage. Once they are set, sign-in
becomes available and `syncAll()` has something to talk to.

The fastest end-to-end test: sign in, make a carousel, open the same URL in a private window, sign
in as the same address, and confirm it arrives. Then delete it in one window and sync the other —
it should stay deleted. That second half is the one that catches real bugs.

## Files

| File | When |
| --- | --- |
| `01-schema.sql` | Now. Tables, RLS, triggers, indexes. |
| `02-pro-gate.sql` | After Stripe. Makes the cloud pipeline Pro-only, enforced by Postgres. |

## Still to do

- **Stripe webhook** writes `profiles.plan`. It must use the service role key, because the browser
  deliberately cannot write that column.
- **Media in Storage.** Uploaded images currently live as base64 inside `docs.data`, so a carousel
  with photos is a multi-megabyte row that moves in full on every sync. Fine at one user,
  unpleasant at a hundred.
