# FlashCC feature roadmap

The plan of record. Worked through with `/next-batch`, one batch at a time.

Built from four parallel research passes in September 2026 — speed pain points, batch workflows,
organisation at volume, and a seventeen-tool competitive audit. **Read the evidence caveats at the
bottom before treating any single quote as load-bearing.**

---

## The frame

**PostNitro is the competitor that matters.** At $20/mo it already ships every table-stakes
feature FlashCC lacks — PNG per slide, brand kits, client workspaces, approvals, saved templates,
native publishing — and it has no analytics, no frameworks, and a much lighter editor.

That gives a clean test for every item below:

> **Batches 1–5 remove reasons to choose PostNitro. Batches 6–8 are the reason to choose us.**

Three findings shape the order.

**Writing the slides is the biggest time sink, not designing them.** 30–60 minutes of a 45–120
minute carousel. Layout is second, visual design third. Most competitors optimise the third.
FlashCC's centre of gravity is already right — the roadmap defends it rather than chasing them.

**Structural attribution is genuinely unclaimed.** Zero of seventeen audited tools connect hook
shape, framework or slide count to outcome, and the analytics industry's own guides tell marketers
to do it *by hand*. But nobody asks a carousel tool for analytics either. So it does not win the
sale — it wins the renewal. It stays, and it sits behind the table-stakes work rather than in
front of it.

**Churn in this category is about billing, not features.** Loomly raised one customer's price 996%
with 30 days' notice. Sprout charges $499/month per external approver and caps it at three. Later
charged someone $180 four months after they cancelled. Contentdrips revokes access the instant you
cancel. Nobody has taken the opposite position, and it costs nothing to take.

---

## Batch 1 — Ship a file people can actually post

**Status:** next
**Size:** large. The rendering path is a real decision, the rest is small.
**Why first:** export is PDF-only, so FlashCC is accidentally LinkedIn-only. Half the target
audience literally cannot ship. A $9/mo competitor does PNG. This is the highest
damage-to-effort item in the document.

### 1.1 PNG sequence export

**What:** one image per slide at exactly 1080×1350 / 1080×1080 / 1080×1920, sRGB, delivered as a
numbered zip in slide order.

**Why:** Instagram and TikTok take images, not PDFs. Every carousel-native competitor ships this,
including one at $9/mo. A rival tool's review captures the failure exactly: *"No PNG output... so
you build a beautiful IG carousel and then can't actually post it anywhere without manually
screenshotting."*

**Decision to make first:** client-side canvas rendering or server-side Playwright. Playwright is
the documented intent in `CLAUDE.md` and is the only path that renders `background-clip: text`
gradients and uploaded fonts correctly. Client-side avoids a server round trip but html-to-canvas
converters are unreliable on exactly those two features, which FlashCC uses heavily. **Recommend
Playwright**, and note it also fixes PDF quality.

**Done when:** a 10-slide deck exports as `01.png … 10.png` at exact pixel dimensions, gradients
and custom fonts intact, in a zip.

### 1.2 Platform export presets

**What:** LinkedIn / Instagram / TikTok as named export targets, each carrying its own dimensions,
format, quality and file-size target.

**Why:** the constraints are non-obvious and getting them wrong is invisible until after posting.
LinkedIn rasterises every uploaded PDF to 1080px wide at JPEG ~80–85%, so "keep it vector" is folk
wisdom that does not survive the pipeline. What survives: design at exactly 1080×1350, sRGB not
CMYK, and land between 800KB and 2MB.

**Done when:** picking a platform sets everything, and the resulting file needs no adjustment.

### 1.3 Pre-export quality guard

**What:** a blocking check before export — body text under 18pt, headlines under 24pt, strokes
under 2px, anything intruding on a platform safe zone, file size outside 800KB–2MB, slide count
over the platform ceiling.

**Why:** this is currently solved by an entire genre of blog post. Slide-count ceilings are the
sharpest hidden trap: **Instagram's API caps carousels at 10 while the app allows 20**, so a
20-slide deck cannot be published by any scheduler, ever. LinkedIn takes 300. TikTok 35.

**Done when:** the guard catches a deliberately bad deck and names each problem against its slide.

### 1.4 Safe-zone overlays in the canvas

**What:** a toggleable overlay per platform showing what the UI covers. LinkedIn: ~50–80px top and
bottom, 30–40px sides. TikTok: ~400–500px bottom band, ~150–200px right rail.

**Why:** **nobody ships this in-editor.** The state of the art is a standalone safe-zone checker
web page and a manual overlay layer people build by hand in Canva. One competitor's beta testers
reported exactly this bug: *"Navigation elements were obscuring important content."*

**Done when:** the overlay renders over the canvas, is per-format, and never exports.

### 1.5 Fix the format switcher

**What:** decide what changing format does, then make it do that.

**Why:** `Properties.tsx` ships three format buttons wired to `setFormat`, which does
`{ ...doc, width, height }` — every layer keeps its pixel position. Switch 4:5 to 9:16 and content
strands in the top two-thirds with 570px of dead space. This is exactly what users describe as
*"the spacing never survives the resize."* Nothing has ever decided what it *should* do, so this
is an open question, not a violated rule.

**Recommend:** re-flow to the new artboard — re-run the composition pass with the same content, so
type re-ladders and text refits rather than proportionally squashing. That is the thing Canva's
Magic Resize cannot do and users complain about constantly.

**Done when:** every format switch produces a laid-out slide, and a test asserts nothing strands
outside the safe box.

### 1.6 Two pieces of rot found while checking

- `FORMATS` in `model.ts` is dead — never imported. `Properties.tsx` hardcodes its own inline
  copy. Delete one.
- `CLAUDE.md`'s "Canvas elements" section describes `overlays: Overlay[]` with fractional
  coordinates. **There is no `Overlay` type in the codebase.** It is a leftover from the
  architecture the Photoshop-model rewrite replaced, and it reads as a design decision that was
  made. Delete it.

---

## Batch 2 — Find anything

**Status:** queued
**Size:** small. Everything needed is already stored locally.
**Why here:** cheapest batch in the document and pure churn prevention. There is currently **no
search box anywhere in FlashCC** — less than any competitor, all of whom get complained about for
it anyway.

### 2.1 Search across projects

**What:** full-text over document name *and every text layer*, since FlashCC already stores all of
it. Live filter on the Projects grid.

**Why:** *"There is no search function, this would be a useful function to look for old posts"*
(Gain). *"The media center is a mess to find your content in"* (Later). *"Organizing projects
inside the platform can become cluttered and chaotic as teams scale"* (Canva).

**Done when:** typing a phrase that appears on slide 7 of a carousel from two months ago finds it.

### 2.2 Auto-name documents at creation

**What:** name the doc from slide 1's hook, which is already extracted for `posts.hook`.

**Why:** the "Untitled Design" plague is what every practitioner cleanup guide exists to fix.
Canva's Bulk Create already auto-names from a data column, so this is table stakes, not a
differentiator. **Highest pain-removed-to-effort ratio in the entire document.**

**Done when:** no carousel is ever called "Untitled" unless the user insists.

### 2.3 Facet filters

**What:** filter by framework, style, format, date, and later client. **Derived automatically from
data already stored — not user tags.**

**Why:** tagging reliably fails, and not from laziness: vocabulary drift (one DAM vendor's example
is "blazer" vs "sportscoat" for the same asset) plus dedicated maintenance time small teams do not
have. A practitioner guide names the trap exactly: relying on search alone *"might not work well
for teams or people doing client-based work, unless everyone can agree on (and remember) a naming
convention."*

**Done when:** every filter is populated from existing fields with no user input.

### 2.4 Archive instead of delete

**What:** an archived flag plus a filter, composing with the existing tombstone model.

**Why:** every practitioner organisation guide ends at "move it to an Archive folder." Deleting is
currently the only option, and it is irreversible across devices by design.

### 2.5 Inline rename

**What:** rename from the project card without opening the editor.

---

## Batch 3 — Brands

**Status:** queued
**Size:** medium
**Why here:** brand-kit *count* is the proven monetisation ladder in this market (Canva: 1 free,
5 Pro, 100 Business at $25/user). Contentdrips gives one away on its free tier. And `Theme` is
already almost exactly the right shape, which makes this cheaper than it looks.

### 3.1 Brand as a saved object

**What:** promote `Theme` to a named, user-owned `Brand` — colours with roles, display and body
font, default format. Stored in Supabase, synced.

**Why:** today every carousel re-picks colours from scratch. `Theme { bg, fg, accent, muted,
displayFont, bodyFont, bgGradient }` is already the shape; it just is not saveable or named.

**Invariant check:** this does **not** break "presets run once, nothing is derived." A Brand is
applied once and leaves plain layers, exactly as a Style does today. Do not introduce live
binding.

### 3.2 Re-apply a brand to an existing carousel

**What:** apply a brand to a document that already exists, not just at generation.

**Why:** *"Master Brand Kit first: Set your brand colours, fonts, and logo. This alone fixes 60%
of inconsistency issues."* The pain is consistency after the fact, not the first application.

### 3.3 Per-brand fonts

**What:** uploaded faces scoped to a brand rather than global.

**Why:** `fonts.ts` has `MAX_FONTS = 6` in localStorage, global and uncloudy. That is a hard
ceiling for anyone with more than a couple of clients. Full fix needs Batch 5; scope them here.

### 3.4 Brand switcher and tier limits

**Free 1 brand · Pro 3 · Agency unlimited.** Matches the proven ladder.

---

## Batch 4 — Batch creation, done properly

**Status:** queued
**Size:** large
**Why here:** this is the wedge. The data model that makes variable-length carousels possible
exists in this market **only behind a developer API at $39+/mo** (Contentdrips). No UI tool
exposes it.

### 4.1 One row per slide, grouped by post

**What:** long-format import — `post_id, slide_index, headline, body, …` — instead of Canva's wide
format.

**Why:** Canva's model forces one row to be one whole carousel, which forces **fixed slide count
per batch** (a 6-slide idea in a 10-slide template leaves blanks to delete by hand in every
output), a spreadsheet 30 columns wide that no human can write in draft order, and ~20 manual
connect-data operations before anything generates.

Long format gives variable slide count for free, in a sheet people can actually write.

**Done when:** one CSV produces carousels of 6, 9 and 12 slides in a single batch.

### 4.2 Batch pre-flight

**What:** one screen before export — empty fields, overflowing text, missing images, slide count
over the platform ceiling, duplicate hooks.

**Why:** Canva's only signal for an unbound field is a small coloured dot, and the documented
consequence is *"47 of 50 designs retain placeholder text"* discovered at review.

### 4.3 Text fit guaranteed across the whole batch

**What:** check every text layer in the batch and surface "7 of 240 slides overflow — here they
are" as a reviewable list.

**Why:** overflow is the **#1 documented Bulk Create failure**, and its only fix is editing the
master and re-running the entire batch, which discards every manual edit. FlashCC can do better
because `text.ts` already counts real wrapped lines and `geometry.ts` is pure and tested.

### 4.4 Re-run without losing hand edits

**What:** stable ids per generated layer plus a `handEdited` flag; re-running replaces only
untouched layers.

**Invariant check:** keep the batch job as a record **outside** the document. The merge output
stays plain layers and a re-run is a new one-shot job that happens to skip dirty layers. Do not
introduce live bindings.

### 4.5 Batch restyle after generation

**What:** change palette, font or style across 30 already-generated carousels in one action.

**Why:** Bulk Create varies content only, never design, and its outputs are 30 independent files
with no shared handle. A brand tweak means 30 manual edits.

### 4.6 Data-driven export naming

Canva already names files from a chosen column. Shipping without it is a visible regression.

---

## Batch 5 — The asset library

**Status:** queued
**Size:** large. The biggest engineering cost in this document — budget for it properly.
**Why here:** it blocks brand logos, and the current model is actively wrong at scale.

### 5.1 Media moves to Supabase Storage

**What:** `MediaItem` becomes a reference with a signed URL instead of a base64 data URL inside
`docs.data`.

**Why:** today a logo is re-uploaded into every document's 24-item pool, and every sync moves the
whole multi-megabyte row. Self-contained documents were the right call at the start and are the
wrong call now.

**Done when:** existing base64 documents migrate without loss, and a shared logo is stored once.

### 5.2 Brand logos

Light, dark and mark variants on the Brand object. Depends on 5.1.

### 5.3 Fonts to the cloud

Lift `MAX_FONTS = 6` out of localStorage.

### 5.4 A media library that persists

**Why:** *"I wish the Media Library for my clients would retain the images I upload"* (Sendible).
*"I wish there was a way to organize media files"* (Loomly). *"Doesn't currently offer the ability
to... add your own logo within the platform"* (ContentStudio). **No competitor has review evidence
of "I scheduled a post and it used my brand assets automatically."** That connection is unclaimed.

---

## Batch 6 — One asset becomes many

**Status:** queued
**Size:** medium
**Why here:** the stated gap in every repurposing tool is that they are *"one-and-done"* when
*"the whole point is volume."*

### 6.1 Long-form ingest

**What:** paste a blog post, transcript or newsletter; get a proposed **series** of carousels.

**Why:** the mapping heuristic that recurs is each H2 section becoming one or two slides, hitting
5–10 slides per carousel. Nothing found does one-asset-to-N-posts as a first-class operation.

### 6.2 Series as an object

**What:** a series owns N posts, auto-numbers them ("3/10"), shares a cover treatment, tracks what
is drafted, exported and published.

**Caveat, stated honestly:** this is the **least-evidenced item in the document.** It follows
logically from 6.1 and from consistency complaints, but the research reached no first-hand
accounts of people running numbered series. Build it small, or cut it.

### 6.3 Hook variants

Regenerate slide 1 only, several ways, pick one. People iterate on hooks constantly and currently
do it by hand.

### 6.4 Caption and first comment

**What:** derive the text post from slides 1–2, in the same screen.

**Why:** the workflow experienced creators already hand-roll — *"write the carousel first, then
pull the text post out of slides 1 and 2. You're forced to fix the hook."* Currently everyone
leaves for a second tool.

### 6.5 Plain-text transcript

**What:** a copyable text version of the whole deck for the caption or first comment.

**Why:** per-slide alt text is **impossible** on both platforms — LinkedIn's Documents API carries
only a `title` field, and Meta's API excludes `alt_text` from carousel children. An accessibility
audit found LinkedIn *"will acknowledge the presence of a graphic but fail to provide the
corresponding alt text."* A transcript is the only available fix and **nobody ships it.**

### 6.6 AI writes text, never layout

**Rule, not a feature.** Every documented complaint about AI carousels is about layout, type scale,
emphasis and colour: *"Text sizing shifted from slide to slide with no clear logic."* *"Some text
ending up too small to read."* People value AI for splitting prose into headline-length beats and
reject it for visual decisions. Keep layout deterministic.

---

## Batch 7 — Clients and approval

**Status:** queued
**Size:** large
**Why here:** the agency tier already exists in `profiles.plan` and is empty. This fills it.

### 7.1 Client replaces the flat group string

**What:** a Client owns brands, assets, projects and posts. Ship **both** per-client filter and
all-client roll-up — the evidence demands both: *"I can separate each one so that nothing gets
mixed"* (Gain, praise) alongside *"it was a downside to have to toggle back and forth between
clients instead of seeing everything under one view"* (CoSchedule, complaint).

**Volume reality check:** solo operators cluster at 3–5 clients, small agencies at 15–50 profiles.
Nobody in the sample was a solo operator with double digits. Do not design for 30 brands.

### 7.2 No-login review link

**What:** a tokenised read-only URL. The client opens the carousel, comments **on a specific
slide**, then approves or requests changes.

**FlashCC's structural advantage:** a carousel already has a slide index, so comments attach to
`slideId`. Every proofing tool that does this needs a whole x/y annotation engine. Gain's own users
are asking for exactly this: *"you just can leave a comment, not a 'post it' over the content."*

### 7.3 Two comment scopes

Internal and client-visible. *"The ability to show the feed to the clients externally so that
they're able to view only what's needed and not all our comments"* (Planable).

### 7.4 Approval state stamped to a version

**Why:** *"Three people approved the post. None of them approved the same version."*

### 7.5 White-label the review page

Agency logo and colour on the share page. Gain gates this at $199; trivially cheap here.

### 7.6 Approvers are free and unlimited — non-negotiable

Sprout charges **$499/month per external approver** and caps the account at three. It is the
loudest single complaint in the corpus. Planable, Gain and Ziflow all give reviewer seats away as
an acquisition lever. Campaign against the anti-pattern.

---

## Batch 8 — Trust, and the long tail

**Status:** queued
**Size:** small to medium

### 8.1 LinkedIn analytics CSV import

**What:** import LinkedIn's own post-analytics export to backfill metrics.

**Why:** manual metric entry is genuinely differentiated — nobody else has it — but it is also the
churn risk. AuthoredUp's LinkedIn-archive backfill is one of the most-praised features in the
entire audit and the only comparable thing in the market. This de-risks the loop.

### 8.2 Honest billing, said out loud

**What:** self-serve cancellation, access until the end of the period you paid for, no surprise
renewals, price changes announced properly. On the pricing page, in plain words.

**Why:** the loudest trust failures in the category, all verbatim: Loomly *"raised my yearly price
by 996%... it feels predatory and unkind to small businesses like mine."* Taplio, 53% one-star,
*"they were charging me over 60€ per month"* after a trial with *"no emails, no reminders."*
Contentdrips revoking access on cancel. Later charging $180 four months post-cancellation. A rival
already uses "no credit limits" as its wedge. **Costs nothing. Nobody has taken it.**

### 8.3 Document version history

**What:** auto-snapshot on approve, export and brand-apply. Slide-level restore. A filmstrip diff,
not a general undo history.

**Negative evidence, respected:** **nobody complains about version history** and nobody names it as
a buying reason. Complaints route instead through "can't find my old design." Build the small
version, do not lead marketing with it. Tier by retention — none free, 30 days Pro, unlimited
Agency — which is Planable's proven ladder.

### 8.4 Pipeline fields the market converges on

Content pillar, campaign, objective, reviewer, approval notes. Every Notion and Airtable content
calendar has these; `posts` does not.

### 8.5 Flat, unmetered pricing

No credit rationing. *"A rationing system, not a content tool"* is how users describe the
alternative.

---

## Explicitly not building

Each of these was considered and rejected on evidence.

| | Why not |
| --- | --- |
| **LinkedIn auto-posting** | No official API for attaching a PDF to a document post. The only working method is extracting the user's session cookie via a browser extension. Account risk for your users, permanent maintenance liability. Export a correct file fast instead. |
| **Per-slide dwell time / swipe-through analytics** | LinkedIn's API does not expose it. One competitor claims it; claiming it would put us in the same bucket. |
| **White-label dashboards** | "Contact sales" everywhere it exists at all, and Buffer refuses it at every tier. That is evidence demand is thinner than agency marketing implies. |
| **Template count** | We lose to Canva's 1,255+ LinkedIn carousel templates, and the actual complaint is that too many identical templates already exist. Saved *user* templates, yes. A bigger library, no. |
| **Per-seat, per-client or per-approver pricing** | The dominant churn cause in the entire corpus. |
| **User tagging as the primary findability tool** | Fails on vocabulary drift and maintenance time. Auto-derived facets are strictly better. |
| **Live data binding / auto-refreshing templates** | Breaks "presets run once, nothing is derived" for a need creators do not have. Canva's own version is Salesforce-only. |
| **Template locking** | Zero user complaints found. Vendor-sold, not user-demanded. Revisit after 7.2 ships and non-designers actually open files. |
| **A general-purpose DAM** | Dash, Air and Stockpress already do it. Keep the asset library narrow. |
| **Multi-stage approval chains** | *"The structure that makes it great for compliance makes it heavy for a five-person agency."* |
| **Engagement automation / auto-DM** | The account-ban narrative attaches to exactly this. A competitor markets "no automation risk" as a feature. |
| **Chasing Beacons, Typefully or Postdrips** | Beacons is link-in-bio with a payout scandal, Typefully has no LinkedIn carousel support at all, Postdrips cannot make a carousel. They share our search results, not our customers. |

---

## Evidence caveats — read before treating any quote as load-bearing

**Reddit was hard-blocked for every research pass.** Direct fetch, `r.jina.ai`, `old.reddit`, the
JSON API and search proxies all 403'd. One pass reached it through the PullPush Pushshift
replacement; the others fell back to Capterra, GetApp, SoftwareAdvice and Trustpilot. **Those
populations are more price-sensitive and more vocal than Reddit**, which likely biases the "churn
is all about price" finding upward.

**G2 and TrustRadius 403'd on nearly every fetch** — the richest B2B "cons" corpus was
inaccessible.

**The shared 200-call WebSearch budget was exhausted early**, shared across all four passes and
their own sub-agents. The per-tool bulk mechanics for Later, Buffer, Hypefury, Metricool, Publer,
AuthoredUp and Taplio were not verified, including the open question of whether *any* scheduler's
CSV import supports multi-image carousel posts.

**This category's review layer is largely affiliate content farms.** A dozen sites publish
near-identical "best 10 carousel makers" posts, usually ranking themselves first. Pricing
cross-checks consistently across them; their stated "cons" are competitor marketing and were
discounted.

**Two findings are negative evidence and were respected rather than overridden:** nobody complains
about version history, and nobody complains about template locking. Both are vendor-sold rather
than user-demanded.

**Canva brand-kit counts conflict between sources** (Free 1 / Pro 5 / Business 100 from direct
fetch, versus Pro 100 / Teams 1,000 from a search summary). Verify before using in positioning.

**Least-evidenced item in this document:** 6.2, series as an object. It follows logically from 6.1
but rests on inference.

**Worth closing later:** a browser-driven Reddit session would reach the r/Design thread
*"Designers, how do you deal with 'Can we go back to version 2?'"* and r/SocialMediaManagers
*"How do you organize client content?"* — both located and confirmed live, neither readable.
