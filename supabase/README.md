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
the output, so check the result pane says *Success* before moving on, and if it
does not, the error text is the useful thing to keep.

It is idempotent, so you can re-run it after editing without dropping anything. **Do not run
`02-pro-gate.sql`**, that one turns the paywall on and belongs after billing exists.

Check it landed: **Table Editor** should show `profiles`, `docs` and `posts`, each with the green
**RLS enabled** badge. If any table says RLS is disabled, stop and work out why, that badge is
the only thing standing between one account and everyone else's carousels.

## 3. Turn on email sign-in

**Authentication → Providers → Email.** Enable it, and leave **Confirm email** on.

No passwords, so **disable** password sign-in if it is on. There is no password field anywhere in
the app.

### 3a. Put the code in the email, REQUIRED

The app asks for a **six-digit code** first and offers the link as a fallback. Supabase's default
template only contains the link, so **without this step no code ever arrives** and the sign-in
screen waits for something that was never sent.

**Authentication → Emails → Magic Link.** Add `{{ .Token }}` to the template, for example:

```html
<h2>Your sign-in code</h2>
<p style="font-size:28px;letter-spacing:6px;"><b>{{ .Token }}</b></p>
<p>Or <a href="{{ .ConfirmationURL }}">click here</a>, in the same browser you started in.</p>
```

Why the code leads, rather than the link:

- **Mail scanners eat magic links.** Outlook Safe Links, Defender and Proofpoint fetch every URL in
  an incoming message to check it, and that fetch REDEEMS a one-time link. The recipient clicks and
  is told it has already been used. It is invisible from this side and it is one of the commonest
  ways this kind of auth fails.
- **PKCE links are single-browser.** The app uses the PKCE flow, so the verifier lives in the
  browser that asked. That is what makes a stolen link worthless, and it also means a link opened
  on a phone cannot finish a sign-in begun on a laptop. A code has neither problem.

### 3b. The Site URL has to match the port you are actually on

**Authentication → URL Configuration.** Set **Site URL** to the origin you develop on, and add
every other one to **Redirect URLs**.

This bites more often than anything else here, because `npm run dev` **falls forward** when 5173 is
taken, so the app can be on 5174, 5175 or 5176 while the dashboard still says 5173, and the link
silently refuses to come back. Add them all:

```
http://localhost:5173
http://localhost:5174
http://localhost:5175
http://localhost:5176
```

Check the address bar for the port you are really on before blaming anything else.

### 3c. "Email rate limit exceeded"

That is Supabase's built-in mailer, which sends **a handful of messages an hour** across the whole
project. It is not about the address and it is not something the person signing in can fix.

Fine for the first few tests, and **not** fine for anybody else, set up SMTP before a second
person ever tries. **Project Settings → Authentication → SMTP Settings.** Resend is free for 3,000
a month and takes about ten minutes; Postmark and SendGrid work the same way.

Until that is done, expect to be locked out for an hour after a few attempts, and note that every
"send another" press spends one.

## 4. Point the app at it

**Project Settings → API** gives you two values.

```
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then restart `npm run dev`, Vite reads
env files at boot, not on save.

The anon key is *supposed* to be public. It identifies the project and authorises nothing on its
own; the RLS policies decide who can read which row. The **service role** key is the opposite of
that: it bypasses every policy. It never goes in `.env` with a `VITE_` prefix, never in this
folder, and never in the browser.

## 5. Check it works

With no env vars set the app runs exactly as before, on localStorage. Once they are set, sign-in
becomes available and `syncAll()` has something to talk to.

The fastest end-to-end test: sign in, make a carousel, open the same URL in a private window, sign
in as the same address, and confirm it arrives. Then delete it in one window and sync the other,
it should stay deleted. That second half is the one that catches real bugs.

## Files

| File | When |
| --- | --- |
| `01-schema.sql` | Now. Tables, RLS, triggers, indexes. |
| `02-pro-gate.sql` | After billing. Makes the cloud pipeline Pro-only, enforced by Postgres. |
| `03-brands.sql` | Now. The brands table, and the tier limit as an INSERT policy. |
| `04-storage.sql` | Now. Two buckets, the `assets` library table, and `brands.logos`. |
| `05-series.sql` | Now. Two nullable columns on `docs` and `posts`, so a series can be queried. |
| `06-clients.sql` | Now. The `clients` table, the tier limit, and `client_id` on four tables. |
| `07-review.sql` | Now. Review links and comments. **Required**, review has no offline half. |
| `08-pipeline-fields.sql` | Now. Five planning fields on `posts`, and one billing boolean. |
| `09-gates.sql` | **After billing**, with `02-pro-gate.sql`. Review links become Pro. |
| `10-brand-voice.sql` | Now. One `jsonb` column on `brands`, holding how a brand sounds. |
| `11-lemon-billing.sql` | Now. Renames the two `stripe_` columns on `profiles` to `billing_`. |

Run `npm run check:schema` at any point: it probes the live project with the
publishable key and names every migration that has not been applied.

## 6. The asset library (`04-storage.sql`)

Same drill: **SQL Editor → New query**, paste the whole file, run it.

It creates **two** buckets and they are deliberately different:

- **`media`** is private. Uploads, logos and font files, readable only through a signed URL that
  the owner's own session mints.
- **`slides`** is public. Rendered carousel slides, published so a scheduler can fetch them,
  which every bulk CSV importer requires and none of them provides. A signed URL cannot do that
  job, because the scheduler fetches days later with no credentials. Nothing lands in that bucket
  unless somebody presses Publish.

Check it landed: **Storage** should list both buckets, `slides` with the **Public** badge and
`media` without it. **Table Editor** should show `assets` with RLS enabled.

If the policy statements fail with a permissions error, create the two buckets by hand in
**Storage → New bucket** (`media` private, `slides` public) and then add the policies through
**Storage → Policies**, using the same conditions as the file. The app works without any of it,
the library just stays on one machine.

## Still to do

- **The billing webhook** writes `profiles.plan`. It must use the secret key, because the browser
  deliberately cannot write that column.
