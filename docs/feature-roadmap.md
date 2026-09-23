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

**And the finding that defines the opening:** of nine schedulers audited for bulk import, **not one
generates carousel slides.** Bulk universally means scheduling assets that already exist — every
one of them assumes the pixels are already made. Six of the nine cannot bulk-ship a LinkedIn
carousel at all, two of those denying it in writing (Buffer: *"Bulk upload currently supports text
and single-image posts only. Video and carousel posts are not supported."* SocialBee: *"Carousel
posts cannot be uploaded using CSV files."*).

The one place the full shape exists is PostNitro bolted into Publer as a third-party integration —
CSV bulk import plus AI topic-to-slides. **Treat Publer+PostNitro as the closest direct
competitor**, and note that someone has already validated the shape from the other end.

Three findings shape the order.

**Writing the slides is the biggest time sink, not designing them.** 30–60 minutes of a 45–120
minute carousel. Layout is second, visual design third. Most competitors optimise the third.
FlashCC's centre of gravity is already right — the roadmap defends it rather than chasing them.

**Structural attribution is genuinely unclaimed.** Zero of seventeen audited tools connect hook
shape, framework or slide count to outcome, and the analytics industry's own guides tell marketers
to do it *by hand*. But nobody asks a carousel tool for analytics either. So it does not win the
sale — it wins the renewal. It stays, and it sits behind the table-stakes work rather than in
front of it.

**Batching is smaller and far more perishable than the marketing implies, and designing for the
marketing number would be a mistake.** The real batch breaks at post three or four — *"you've
tried batching before, and it actually fell apart somewhere around the third post"*, *"they sit
down to make 12 reels and end up making 4"*, *"cap at 12-15. after that, energy drops and quality
follows."* Honest self-reported time is 3–4 hours per content day and 10–12 hours weekly; the
"30 posts in 30 minutes" figures are marketing, and even the creator who filmed one says on camera
*"cleanup is super important. And I'm not going to be one of those creators that goes online and
tells you you can just generate and it's 2 minutes and bye."*

Content also goes stale in about a week. *"We used to plan a month out, batch it all... and it
went nowhere."* *"Plan formats and lanes ahead, not finished posts."* A creator whose entire
business is teaching batching, on the record: *"I used to sort of teach and preach like, oh, batch
30 days ahead — I'm not batching 30 days ahead anymore... I am batching two to three posts, but
just the week before."*

**So: optimise for 8–15, design for the wall at post three or four, and treat a batch as a
re-orderable queue rather than a locked calendar.** Anything that advertises 30 must also make 8
feel finished.

**The bottleneck has a name, and it is the design step.** A r/smallbusiness poll literally offered
*"the actual design process (the 'Canva black hole')"* as an option. Two creators whose businesses
are content systems confess the same thing — *"I procrastinate a lot on creating the content. I
can create the plans... That's the piece that I find myself pushing down the to-do list."* And the
fix is stated twice, independently: *"the batching only works once the format is locked, cause
then you're just swapping the content into a template, not inventing a new thing weekly"* and
*"Locking 1 template and batching killed 80% of my decision fatigue."*

**Churn in this category is about billing, not features.** Loomly raised one customer's price 996%
with 30 days' notice. Sprout charges $499/month per external approver and caps it at three. Later
charged someone $180 four months after they cancelled. Contentdrips revokes access the instant you
cancel. Nobody has taken the opposite position, and it costs nothing to take.

---

## Batch 1 — Ship a file people can actually post

**Status:** done
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

**Landmine, worth knowing before writing the encoder:** emit **JPG, not PNG, for LinkedIn-bound
slides.** A live bug report on another tool: *"LinkedIn carousel: PNG slides render blank — JPG
works."* PNGs convert to PDF and lose their content downstream. Closed `not_planned`, still open.
Instagram and TikTok are happy with either, so make the format part of the platform preset rather
than a global choice.

**Done when:** a 10-slide deck exports as `01.png … 10.png` at exact pixel dimensions, gradients
and custom fonts intact, in a zip — and the LinkedIn preset emits JPG.

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
sharpest hidden trap: **Instagram's Graph API caps carousels at 10 while the app allows 20**, so a
20-slide deck cannot be published by any scheduler, ever — and the same API allows only **100
published posts per rolling 24 hours per account**, which is a real constraint on "batch 30
posts". LinkedIn takes 300 pages. TikTok 35.

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

### Built as

1.1–1.4 and 1.6 as written. **1.5 was reduced deliberately.**

The roadmap said "re-run the composition pass with the same content", which means
calling `buildSlides` — regenerating from text. That would have silently deleted
every hand-drawn shape, every moved block and every placed image: a worse bug than
the stranded-layers one it fixes. `compositions.ts` also hardcodes `W`/`H`/`M` as
module constants across 19 usages with 27 tests pinned to them, so making it
size-aware is its own batch.

What shipped instead (`reflow.ts`) re-lays the layers that are actually there:
horizontal follows the board, vertical position follows the board, vertical size
does not stretch, and text keeps its point size and is re-wrapped and re-measured
against the new column. Backgrounds re-cover, shapes scale uniformly so circles
stay circles, and ids survive so selection and undo still line up.

Threading dimensions through `compositions.ts` remains worth doing and is not
scheduled.

### 1.6 Two pieces of rot found while checking

- `FORMATS` in `model.ts` is dead — never imported. `Properties.tsx` hardcodes its own inline
  copy. Delete one.
- `CLAUDE.md`'s "Canvas elements" section describes `overlays: Overlay[]` with fractional
  coordinates. **There is no `Overlay` type in the codebase.** It is a leftover from the
  architecture the Photoshop-model rewrite replaced, and it reads as a design decision that was
  made. Delete it.

---

## Batch 2 — Find anything

**Status:** done
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

### 2.6 Show me everything unnamed or unfiled

**What:** a view that surfaces exactly the documents with no real name and no group.

**Why:** a direct inversion of the single worst thing about the incumbent. *"Is there an easy way
to see everything not given a clear name? An option to show designs NOT associated with any
folder?"* *"I have copies on copies... Because of my copies I get overwhelmed when I see my
homepage."* *"I had like 40 different designs over the last 10 years, and I can't find any of
them."* And on filing being actively broken there: moving an asset to a folder leaves it in Recent
and Uploads too — *"now they live in three different places in my UI... there's no way to select
multiple items at once."*

### Built as

All seven as written, with two corrections to the plan.

**No migration was needed.** The plan said archive required an `archived` column
on `docs` and a `03-archive.sql`. It does not: `Doc.archived` lives inside the
`data` jsonb blob that already round-trips through sync, and nothing queries it
server-side. A column would only have been worth it for server-side filtering,
which does not exist.

**`DocSummary` could not do this alone.** It carried no slide text, no framework
and no style, so 2.1 and 2.3 had nothing to read. The summary now carries a
flattened lowercase `search` blob written at save time, plus `framework`,
`styleId` and `archived`. Parsing every document on every keystroke was the
alternative, and a document carries its media as base64 — so that would have made
search feel broken at exactly the volume where search starts to matter.

A one-time index rebuild backfills all of it from the stored documents, because a
search box that cannot find anything made before today reads as broken.

### 2.7 A used / published state on each carousel

**What:** mark a carousel as published, and filter on it.

**Why:** accidental repeat posting is real and the current fix is manual. A thread titled
*"Organizational strategy to avoid posting same images"* — *"there's no way to know if they've been
used unless I go look"*, solved by *"moving the images to a completed file once I post."* Also
*"Every once in a while we will accidentally deliver too many pieces of content because we lost
track in the mess"*, and *"the one thing worth keeping in a doc is which post went where and what
it did, because after a week you genuinely cannot remember and you end up either repeating
yourself or missing the one that popped."*

Cheap here, because `posts` already carries the stage.

---

## Batch 3 — Brands

**Status:** done
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

### Built as

All four, with two things the plan did not anticipate.

**The tier limit went into Postgres, not the client.** A client-side count is a suggestion anyone
can edit, and `reference.md` §29 already records that every other tier claim in the product is
aspirational because nothing reads `plan`. `03-brands.sql` puts the allowance in an INSERT policy
using the existing `is_pro()`. It sits on INSERT only, so editing is never refused and a downgrade
does not confiscate brands somebody already made.

**An idempotence test caught a real bug in the remap.** The CTA block prints `theme.bg` on
`theme.accent`, and the name-based fallback saw a layer called `Text`, reached for `fg`, and would
have made that copy invisible against its own block. The fix — skip the fallback whenever a layer
already wears one of the target theme's colours — is now guarded by its own test.

**Still thin until Batch 5.** Brand logos need Supabase Storage, so a brand is currently colours,
typefaces and a default format. Per-brand fonts are scoped but still capped at six in localStorage.

### 3.4 Brand switcher and tier limits

**Free 1 brand · Pro 3 · Agency unlimited.** Matches the proven ladder.

---

## Batch 4 — Batch creation, done properly

**Status:** done
**Size:** large
**Why here:** this is the wedge. No tool in the market offers a human-writable batch format.
Contentdrips comes closest and its API turns out to be a **renderer, not a splitter** — the caller
supplies every slide's content, and its own blog-to-carousel tutorial routes the splitting through
ChatGPT in Make.com. Its CSV is one row per *field*, so a 10-slide carousel is 20+ rows. The hard
part is explicitly not theirs.

**The design constraint for this whole batch:** the loudest 1-star complaint in the category is
sameness — *"the carousel tools I tried all spit out the same 8-slide hook / 5 tips / CTA
layout."* Note the shape of that: it is **precisely what four frameworks become if applied
mechanically at batch scale.** Vary slide count and section rhythm *within* a framework, not just
the words. This is the single biggest risk in the document to FlashCC specifically.

### 4.1 The human writes the hook and the payoff; AI fills the middle

**What:** make slide 1 and slide N the cheapest things to override, and never let a batch
operation silently overwrite them.

**Why:** this is an operator's measured fix, not a theory. Scaling 2 to 10 carousels a week:
*"for the first few weeks engagement per post actually dropped. Reach was flat but saves and
shares fell... the AI carousels were smooth and forgettable. Same structure every time, safe
openers, no real point of view. What fixed it: I write slide one (the hook) and the final slide
(the payoff) myself. AI fills the middle slides... AI is great for volume and the boring middle,
weak at the two slides that decide whether anyone cares."*

Corroborated: *"a bad first slide kills the whole thing no matter how good the rest is."*

**Done when:** in a batch of 20, editing the hook and payoff of each is a first-class pass that
survives regeneration.

### 4.2 Same words, more slides

**What:** split a slide, merge two slides, and move a break — **without rewording anything.**

**Why:** explicitly unmet, from a paying API customer of a competitor: *"We use preserve, because
our copy is client-approved and must not be reworded. That leaves us no way to express 'same
words, spread across more slides.'... both require us to guess the right slide count up front."*
That vendor's own engineer confirms there is *"no fully automatic card count determination."*

Related bug worth not repeating: a numbered list broken across a slide break restarts at 1.

**Done when:** a 6-slide deck becomes 9 with identical copy, and nothing re-wraps wrongly.

### 4.3 One row per slide, grouped by post

**What:** long-format *internally* — `post_id, slide_index, headline, body, …` — but **accept a
wide paste too, and normalise it.**

**Why accept wide:** the wide shape is what everybody has been trained on, and it is taught
verbatim — *"Each row in your table is going to become an entire carousel, and each column is one
text or image placeholder in your design"*, *"please put all the carousels in a table with one
column per slide."* It is a learned workaround rather than a preference, but assuming long format
is self-evidently right would be wrong: it is not what anyone has been shown. Meet people where
they are on input, keep the good model inside.

**Why:** Canva's model forces one row to be one whole carousel, which forces **fixed slide count
per batch** (a 6-slide idea in a 10-slide template leaves blanks to delete by hand in every
output), a spreadsheet 30 columns wide that no human can write in draft order, and ~20 manual
connect-data operations before anything generates.

Long format gives variable slide count for free, in a sheet people can actually write.

**Done when:** one CSV produces carousels of 6, 9 and 12 slides in a single batch.

### 4.4 Batch pre-flight

**What:** one screen before export — empty fields, overflowing text, missing images, slide count
over the platform ceiling, duplicate hooks.

**Why:** Canva's only signal for an unbound field is a small coloured dot, and the documented
consequence is *"47 of 50 designs retain placeholder text"* discovered at review.

**The mis-mapping failure is documented on camera**, which is what this check exists for: *"the
episode title landed on the guest name, the guest name landed on the title of the podcast and the
notes landed as the title."* And a fresh hole in Canva's version, verbatim: *"I tried Canva bulk
create but that only gives you one image. I want a different image for each post."*

**Also check the destination tool, not just the platform.** Row caps across schedulers run from 10
to 1,000 with no discernible logic, and export format matters per destination (see 1.1).

**And design against opaque atomic failure**, which is a whole bug class across every scheduler
audited. Buffer, 2-star: *"Buffer will start posting, will glitch and fail to upload one of the
nine photos, and then my 3X3 grid is messed up. I have to go in and delete the photos (and any
interaction they have generated) and repost."* SocialBee: *"If a single post in a queue has a
problem then the whole queue will stall"* with *"no indication which post within the category has
the problem."* A batch that fails must say which item and leave the rest alone.

### 4.5 Text that does not fit gets another slide

**What:** check every text layer in the batch, surface "7 of 240 slides overflow — here they are"
as a reviewable list, and offer **reflow or an extra slide** as the remedy.

**Why:** overflow is the #1 documented Bulk Create failure and its only fix there is re-running the
whole batch. But the obvious remedy is the trap: **shrink-to-fit is itself the complaint.**
*"Fixed card sizes shrink content instead of giving it more room... dense slides get scaled down
to fit rather than spread out, so text ends up small and cramped. Our worst example is a 25-slide
presentation... almost every slide is visibly squashed."* And bluntly, 1-star: *"it just crams
everything into the top 5th of each page and then blanks the rest."*

**This lands on code already shipped.** `fitToBox` in `text.ts` walks a 12-step ladder from
largest to smallest and takes the first size that fits — the overflow guarantee *is*
shrink-to-fit. It has a floor so it never goes microscopic, but the remedy is still smaller type
rather than another slide. The measurement work stays and is good; the remedy changes.

**Recommend:** shrink one or two steps at most, then split. Never squash to the floor silently.

**Done when:** a slide with too much copy becomes two slides at readable size rather than one
cramped slide, and a test pins the boundary.

### 4.6 Re-run without losing hand edits

**What:** stable ids per generated layer plus a `handEdited` flag; re-running replaces only
untouched layers.

**Invariant check:** keep the batch job as a record **outside** the document. The merge output
stays plain layers and a re-run is a new one-shot job that happens to skip dirty layers. Do not
introduce live bindings.

### 4.7 Batch restyle after generation

**What:** change palette, font or style across 30 already-generated carousels in one action.

**Why:** Bulk Create varies content only, never design, and its outputs are 30 independent files
with no shared handle. A brand tweak means 30 manual edits.

### Built as

All eight, plus two defects the work exposed.

**4.5 turned out to be unimplementable as written, twice over.** First, `fit()`
measured with the default sans metric and `applyFonts` ran afterwards, so a mono
or serif theme was sized for one typeface and rendered in another — that is D1
in `reference.md`, and Terminal overflowed three slides in four. Second, and only
visible once D1 was fixed: the split pass measured each layer against **its own
box**, and when `fit` runs out of ladder the layer is built at the height it
needed. The box grows to match the overflow, so "does this fit its box" is
answered yes by a slide visibly hanging off the canvas. The artboard is the only
reference that cannot move.

**The shrink allowance needed a floor, not a step count.** "One or two steps"
assumed a short ladder; the generation ladders span 104→40 across twelve steps,
where two steps is 104→92 and would chop hooks constantly. It floors at 60% of
each composition's own top size instead — below that a slide stops reading as
designed and starts reading as crammed.

**The sameness constraint became a mechanism, not a note.** The composition cycle
now starts at an offset derived from the deck's own words, so two different
carousels get different rhythms and the same carousel twice gets the same one.
A test builds twenty decks from one framework and asserts they do not all come
out identical — which the first version of that test proved they did.

**4.6 was built as specified** despite the concern raised before starting. It is
genuinely useful in the editor, where "Re-lay" re-runs generation and keeps
anything you touched. `handEdited` is set in the two mutation funnels rather than
at call sites, and is never inferred from content — a layer deliberately restored
to its original colour would otherwise silently lose its protection.

**Also fixed in passing:** F1 from the reference (`Measure.family` was handed a
CSS stack where a FONTS id was expected, in two callers, so both measured as
sans) and D10 (bulk and sample decks never stamped `framework`, making them
invisible to the attribution this batch exists to feed).

### 4.8 Data-driven export naming

Canva already names files from a chosen column. Shipping without it is a visible regression.

---

## Batch 5 — The asset library

**Status:** done
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

### 5.5 Host the rendered slides and emit a scheduler-shaped CSV

**What:** after export, keep the rendered slides at public URLs and emit a CSV row per carousel
with those URLs already filled in, shaped for the destination tool.

**Why this is the cheapest real win in the document:** **eight of nine schedulers require
publicly-hosted image URLs for CSV import, and not one of them provides the hosting.** That gap is
the single most-cited friction in the whole corpus. A Publer 3-star review, titled *"Good for bulk
scheduling but a lot of work needs to be done"*, describes the workaround in full: *"no ability to
sort, and export data of media library - which would be super useful when you need hundreds of
links to download pictures before uploading them via CSV. I needed to find a way around this issue
and upload everything to WordPress and then use a plugin to export file names and links... I'd
need to manually copy-paste all links."* The whole thesis in one line from r/socialmedia: *"copy
paste the image url into csv and then reupload to scheduling tool for bulk scheduling."*

FlashCC already renders the slides. Hosting them and emitting the row turns it from a design tool
you then wrestle into a scheduler, into the missing first half of the bulk pipeline.

**There is no lingua franca — build per-tool dialects, not one generic CSV.** The three that
accept carousels disagree fundamentally, and two of them are exact opposites:

| Destination | Shape | Notes |
| --- | --- | --- |
| **Metricool** | One column per image, `Picture Url 1`..`10` | Explicitly warns *"Don't put all URLs in a single cell"*. Has a boolean `LinkedIn Images as Carousel` that **builds the LinkedIn PDF from image URLs for you** — the most directly competitive capability found anywhere. ~70 columns. |
| **Publer** | Comma-separated URLs in one cell | 12 columns, 500 rows. `Post subtype` accepts PDF, so it also ingests a finished document. Per-slide alt text separated by `\|\|`. $5/mo. |
| **ContentStudio** | Newline-separated URLs in one cell | 9 columns, 500 rows. `Post Type` takes a literal `Instagram Carousel` / `LinkedIn Carousel` enum. |

**Emit per-slide alt text too.** Only Metricool and Publer accept it, and it covers both
accessibility and the two best integration targets in one field.

**Worth noting for later:** per-slide *captions* on Instagram carousels are shipped by nobody.
Later states plainly that *"Carousel posts scheduled through Later use a single caption for the
entire post."* ContentStudio has it as an open upvoted request observing that native carousels with
per-image captions *"achieve significantly greater reach and engagement rates."*

**Done when:** exporting a batch produces hosted slides plus a Metricool-shaped CSV that imports
without a single manual edit.

### Built as

All five, plus two things the batch turned out to require that the plan did not
mention.

**The roadmap said "signed URL" for 5.1 and "public URLs" for 5.5, and those are
not the same bucket.** A signed URL expires; the scheduler fetches the picture
days later with no credentials, so it cannot host a published slide. So there are
two buckets with opposite postures — `media` private and signed per session,
`slides` public and written only by pressing Publish. Anything else either breaks
the CSV or makes every private upload world-readable.

**Moving pictures out of the document broke the export, silently.** The payload
posted to `server/render.ts` used to be self-contained: every image and every
uploaded face travelled as a data URL, so the headless Chromium needed nothing
from the network. Remote URLs would have made it fetch a customer's bucket
mid-screenshot with credentials it does not have, and a slow fetch is a slide
that ships with a hole in it. `inline.ts` fetches and re-inlines in the browser —
which already holds a session that can read those files — just before serialising,
so the server's contract is unchanged.

**`media.ts` was reporting every file a third too large.** `bytes: src.length`
measures a base64 STRING, not the bytes it encodes. Every size shown and every
quota decision made from it was wrong; `dataUrlBytes` decodes properly.

**The migration is a pure function, on purpose.** Losing somebody's pictures is
the one failure here that cannot be apologised for, so `hoistInlineAssets` ADDS a
reference and leaves `src` alone; the bytes only stop being inline once an upload
has come back ok and `putDoc` dehydrates. A run that dies halfway leaves the
document exactly as it was, and the next run finds the same pictures again.
Content-fingerprinted, so one logo across twenty carousels becomes one object.

**Fonts became assets rather than getting a bigger cap.** `MAX_FONTS = 6` was
never a design decision — it was localStorage arithmetic wearing a product's
clothes. A font is now an `Asset` with `kind: "font"`, the ceiling is the plan,
and the old localStorage key migrates itself on first run.

**5.2 delivers the unclaimed line.** No competitor has review evidence of "I
scheduled a post and it used my brand assets automatically", and `stampLogo`
makes it true: applying a brand places the mark in the same commit, picking the
light or dark variant from the luminance of the slide it lands on. It runs once
and leaves an ordinary image layer, so it does not touch "nothing is derived".

**Batch publishing is scoped to the project filters** rather than to a new
selection mode. The filtered set already means "this week's batch", so
`Publish the 12 shown` needed no new concept.

Not done: `Alt Text N` for Metricool and the exact Publer/ContentStudio header
spellings are gathered in one table in `schedulers.ts` and should be checked
against each tool's current template before launch. These importers ignore
unknown columns rather than rejecting the file, so a stale name costs one empty
field, not a failed import.

---

## Batch 6 — One asset becomes many

**Status:** done
**Size:** medium
**Why here:** the stated gap in every repurposing tool is that they are *"one-and-done"* when
*"the whole point is volume."*

### 6.1 Long-form ingest

**What:** paste a blog post, transcript or newsletter; get **candidate moments to choose from**,
then build carousels from the ones picked.

**Why the interaction is this way round:** across the whole corpus nobody complains that slides
look bad — they complain the machine picked the wrong material. The most-upvoted articulation:
*"its virality score and my audience disagree, constantly... I have stopped trusting the ranking
and now I scrub the whole thing myself anyway, which defeats the point of paying... Looking
specifically for: I choose the moment, it does the work."* Same failure in text: *"The Quotes,
Hooks & Timestamps pick up in the middle of a sentence so it does not make any sense. My time
would be better spent just writing the sentences myself."*

So do not auto-segment and present a finished series. **Present candidates, let the human choose,
then do the work.** The mapping heuristic still holds once chosen: each H2 becomes one or two
slides, 5–10 slides per carousel. Nothing found does one-asset-to-N-posts as a first-class
operation.

### 6.2 Series as an object

**Upgraded from inference to evidenced — and the pain is not what I assumed.** I had this as a
numbering-consistency feature. The actual problem is **discovery**: *"My Part 4 has 1M views but
Part 1 has only 5K — because viewers can't find it."* *"It's tiresome for the audience to look for
other parts in the profile section... So they just scroll to the next video."*

The second problem is **momentum**: *"the last thing you want is for a piece of content to finally
go viral, but then by the time you make the part two in the series, it's like a month later and
there's just no momentum anymore."*

The third is that numbering lives in a doc and design lives elsewhere, and nothing reconciles them
— *"scripts go into a single document, numbered 1-12."* People also ask out loud how to even
schedule one: *"Drop them all at once? One per day? Spread them out more?"*

**So a series should:** auto-number, generate a **cross-reference slide or caption pointing at the
other parts**, and prompt that "part 2 is due" while the momentum is still there.

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

### Built as

All six, and the sixth turned out to be free.

**6.6 was already the architecture.** Every route returns words and nothing else;
`compositions.ts` makes every visual decision from them. There was no code to
write, so it went into `CLAUDE.md` as invariant 5 instead — a rule that lives
only in a roadmap is a rule the next feature quietly breaks.

**6.1's candidate detection is deterministic and runs with no API key.** That was
not in the plan and it is the most important decision in the batch. The thing
people distrust is a model choosing their material — "I have stopped trusting the
ranking and now I scrub the whole thing myself anyway" — and a heading is a choice
the author already made. `longform.ts` follows headings where there are any and
falls back to even stretches cut at sentence ends, labelled as exactly that.
Nothing is scored, nothing is pre-ticked, nothing is called recommended.

**Every cut lands on a sentence boundary, and there is a test for each way that
goes wrong.** "The Quotes, Hooks & Timestamps pick up in the middle of a sentence
so it does not make any sense" is the single most-cited failure of the competing
tools, so `sentences()` knows about abbreviations, initials and numbered list
markers, and the slide packer never cuts anywhere else.

**6.2 grew a fourth job the roadmap did not list: reseal.** Deleting part 3 of six
leaves 1,2,4,5,6, and a caption reading "Part 4 of 5" beside a list that stops at
5 reads as carelessness. `deleteDoc` renumbers the survivors, so it happens
however the carousel was removed rather than only on the screen that remembered
to ask.

**The momentum prompt is a banner, not a notification, and says so.** There is no
background job in this product and no permission to send anything. Promising a
reminder that arrives while the app is closed would be a promise it cannot keep.
Three rules keep it from becoming wallpaper: an unstarted series is not losing
momentum, an already-scheduled next part is a decision rather than a lapse, and
nothing shows until the gap is genuinely open.

**6.3 lays slide 1 out again rather than typing over the layer.** The box and the
font size were chosen for the old words; writing longer text into them is how
"some text ending up too small to read" arrives by a different door. `restateSlide`
rebuilds the whole deck and takes one slide, because composition selection depends
on the index, the total and the seed — and returns the whole regeneration when the
rewrite is long enough to change the slide count.

**6.4 is deterministic on purpose.** The words are already approved; a model
rewriting them would be answering a question nobody asked. It is the rearrangement
experienced creators already hand-roll — slides 1 and 2 and the closer — with a
character count against the platform's real ceiling, because a caption is
truncated live rather than rejected and nothing says so.

**6.5 also fixed the published CSV.** `PublishedCarousel.caption` was the hook
alone, which reads as a truncated caption; it is now the same derived text post.

---

## Batch 7 — Clients and approval

**Status:** done
**Size:** large
**Why here:** the agency tier already exists in `profiles.plan` and is empty. This fills it.

### 7.1 Client sits above the flat group string

> **Corrected while building.** This originally said a client *replaces* `group`. It does
> not: a group is a folder, somebody with one client still wants folders, and Batch 6
> forms a series out of a group's contents. A client owns; a group organises.

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

### Built as

All six, and one of them was a paragraph rather than a feature.

**7.1 does not replace the group string, and the roadmap was wrong to say it
would.** `group` is a folder — "March", "Launch" — and somebody with one client
still wants folders; Batch 6 also forms a series out of a group's contents, so
removing it would have taken that with it. A client sits ABOVE the group: it owns
brands, assets, projects and posts, and the folder is a drawer inside. `ALL_CLIENTS`
is the default and the top entry in the switcher, not an escape hatch, because
the CoSchedule complaint is precisely about a tool that only does separation.

**Deleting a client does not delete their work.** Everything it owned becomes
unassigned. A cascading foreign key here would mean an agency losing a client
loses a year of carousels, with no undo — so `client_id` is a plain nullable
column on four tables and deliberately not an FK, and the confirmation says so
before anybody presses it.

**7.2 is the first thing in FlashCC with no offline half.** A review link is a
URL somebody else opens; there is no localStorage version of that. It is also the
only place where RLS is not the boundary: a reviewer has no `auth.uid()`, and an
anon policy that trusts a token in the row means letting the anon key read
`shares` to find the match, which is the same as letting it read every share. So
`server/review.ts` holds the service role key and is the boundary, written to be
read end to end — and `strip()` is an allow list rather than a delete list, so a
column added next year is absent by default instead of leaking by default.

**A share is a SNAPSHOT of rendered slides, not a window onto the editor.** Three
reasons, and only the third was in the plan: a logged-out reviewer cannot read
the private `media` bucket or the owner's uploaded fonts; the client should
approve what will be POSTED rather than a canvas that may have moved; and it
makes 7.4 nearly free. Creating a share publishes through the Batch 5 path and
records the public URLs.

**7.4 is `docVersion` and one stored string.** The fingerprint covers geometry
and colour as well as words, because "safeties to ensure that approved images
aren't confused with modified ones" is about a nudged headline as much as a
rewritten one — and it ignores ids and timestamps, so re-laying a deck to the
identical result does not invalidate an approval. A stale approval is reported,
never revoked: deciding for somebody that their sign-off is void is worse than
telling them it is old.

**7.3's filter lives on the server, not in the page.** A leak in that direction
is the single worst bug this product could ship, so `scope` is hard-coded to
`client` on the public insert route — a malformed body cannot mint an internal
note — and the reviewer's read never selects one.

**7.5 turned out to need a signing step nobody mentioned.** `brands.logos` holds
asset IDS, and those assets live in the private `media` bucket. The server signs
them with the service role at read time rather than at share time, so a link
opened in six weeks still shows a logo.

**7.6 was a paragraph.** There was nothing to build except not adding a seat cap.
It is now invariant 6 in `CLAUDE.md`, a comment at the foot of `07-review.sql`,
and `REVIEWER_PROMISE` on the pricing screen — because a commitment that lives
only in a roadmap is one the next paywall quietly breaks.

**Also:** a component may no longer share a name with a module beside it. This
cost time for the fifth time in this batch (`Review`/`review`, `Clients`/`clients`),
so the convention is written into `CLAUDE.md` with the four existing pairs named.

---

## Batch 8 — Trust, and the long tail

**Status:** done
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

**This call partially reverses.** The earlier passes found no complaints about version history and
I treated that as a reason to deprioritise. The community layer does have the pain — it is just
never called "version history". It is called file chaos: *"my desktop used to be a graveyard of
Canva exports, CapCut drafts, random PNGs and 'final_final' files."* On the incumbent
specifically: *"I wanted to keep proper versioning but it seems I have to make copies of the file
to keep older versions."* And from an agency, which is the version that matters most: *"I'd also
like some safeties to ensure that approved images aren't confused with modified ones."*

That last one pairs directly with 7.4 — approval stamped to a version — and is the strongest
argument for building this at all.

**Still true:** nobody names it as a buying reason, so build it and do not lead marketing with it.
Tier by retention — none free, 30 days Pro, unlimited Agency — which is Planable's proven ladder.

### 8.4 Pipeline fields the market converges on

Content pillar, campaign, objective, reviewer, approval notes. Every Notion and Airtable content
calendar has these; `posts` does not.

### 8.5 Flat, unmetered pricing

No credit rationing. *"A rationing system, not a content tool"* is how users describe the
alternative.

### Built as

All five, and two of them were paragraphs.

**8.2 was already true and nobody was being told.** `ENTITLED` in
`server/billing.ts` treats `active` as entitled, and Stripe keeps a cancelled
subscription active until the period it was paid for ends — so "you keep what
you paid for" has held since billing shipped. What was missing was that
`plan_renews_at` alone cannot distinguish "renews on the 3rd" from "ends on the
3rd", and the account card showed a renewal date either way. One boolean carried
through the webhook fixes it, and the four promises are now on the pricing screen
in the words somebody would use if they were telling you honestly.

**8.5 was nothing at all.** Grep found no credit, quota, usage or metering
concept anywhere in `src/` or `server/`. There was nothing to remove, so it
became invariant 7 and `UNMETERED_PROMISE` beside the reviewer one — because a
commitment that lives only in a roadmap is one the next paywall quietly breaks.
That is now the third time a roadmap item has turned out to be a rule rather than
a feature, after 6.6 and 7.6, and the pattern is worth naming: the cheapest
things in this document are the ones that cost nothing and nobody has taken.

**8.1's matching is the feature, and the unmatched rows are the screen.** Three
passes of descending confidence — URL, exact text, leading text within a date
window — each consuming what it claims, so a weaker rule can never overwrite a
stronger one. Anything unplaced is RETURNED and shown with a dropdown rather than
dropped: an import that quietly places 40 of 60 is worse than one that places 40
and tells you, because the first leaves somebody believing their history is
complete.

**Absent is not zero, and that took two guards.** `readNumber` returns null for a
blank rather than 0, because a fabricated zero goes straight into the median
every insight screen runs on. And `applyMatches` writes only the fields the file
carried — LinkedIn's export has no saves column, and zeroing a hand-entered saves
count because the file was silent would destroy exactly the data this feature
exists to protect.

**8.3 is local and does not sync, which is a scope call the roadmap did not
make.** The stated pain is losing your own earlier state on the machine you are
working on; syncing a snapshot of every export across devices would multiply the
largest records in the product for a need nobody described. That also means it
needed no migration and works today with no database — so this batch ships ONE
migration rather than the two flagged in the plan.

**The diff compares by position, not by slide id.** Re-laying a deck mints new
ids for every generated layer while the slides keep their order and their
content, so an id-based diff would report a whole deck as replaced every time
somebody pressed Re-lay. It shares `docVersion`'s rules, so the filmstrip and the
stale-approval warning can never disagree about whether anything happened.

**Restoring is itself snapshotted.** Going back should never be the one move you
cannot take back.

---

## Batch 9 — Make the paywall real

**Status:** done
**Size:** medium
**Why here:** every feature the pricing screen sells is currently free, and five
server routes answer to anyone. Written after an audit against the live database
on 2026-09-23 rather than from the code alone — every claim below was verified.

### What the audit found

Probed with the publishable key against the real project:

| Object | State |
| --- | --- |
| `profiles`, `docs`, `posts` | live, and RLS correctly returns 0 rows to an anonymous caller |
| `brands`, `assets`, `clients`, `shares`, `comments` | **missing** — 03, 04, 06, 07 unrun |
| `docs.series_id`, `docs.client_id`, `posts.pillar`, `profiles.plan_ends_at_period_end` | **missing** — 05, 06, 08 unrun |

And in the code: **`isPro` is exported from `auth.ts` and used in zero places.**
Nothing anywhere gates on plan except the label on the account card. Somebody who
pays today receives precisely what they already had.

### 9.1 Run 03 through 08

Not code, but it is the prerequisite for everything else and belongs in the plan
of record. Six migrations exist and none has been applied, so Batches 3, 5, 6, 7
and half of 8 are local-only in production and review links cannot function at
all. The tier limits on brands and clients are, right now, client-side
suggestions that anyone can edit in devtools.

**Done when:** all eight tables exist and a second account can be shown to read
none of the first account's rows.

### 9.2 Close the open routes — but not all of them the same way

Five routes take no bearer token. They are not the same problem and must not get
the same answer:

| Route | Cost of abuse | Answer |
| --- | --- | --- |
| `/api/draft`, `/api/hooks` | **your Anthropic key, unmetered** | require a caller AND `is_pro` |
| `/api/slides`, `/api/document` | Playwright CPU, and publishing already needs an account to upload | require a caller |
| `/api/export` | Playwright CPU | **stays open** — see below |

**`/api/export` must not require an account.** "Make carousels and export them"
is the free product and it is documented to work with no key and no sign-in at
all. Requiring auth there would break the free tier to fix an abuse problem, so
export gets rate limiting and tighter size caps instead — the limiter already
written for the review endpoint, lifted somewhere both can use it.

**Done when:** an unauthenticated POST to `/api/draft` is refused, an
unauthenticated POST to `/api/export` still returns a file, and a free account's
draft request is refused by the server rather than by the interface.

### 9.3 Decide what Pro actually is, then enforce it server-side

The pricing screen currently promises eight things for Pro and five for Agency.
Each needs a real boundary or needs removing from the list — an advertised
feature with no gate is a promise to the customer that the product does not keep
in either direction.

The boundary already exists for two of them and is unrun: `02-pro-gate.sql`
gates `posts` writes, and the brand and client limits are INSERT policies in
03 and 06. Those are the model. What is missing is everywhere else.

**The free tier stays generous and local.** Nothing here gates the editor, and
nothing gates localStorage. The split this product sells on is the one it already
has: making a carousel is free, and the durable synced history that compounds is
what costs money. Gating the canvas would just make this a worse Canva.

**Done when:** every line on the pricing screen is either enforced in Postgres or
on the server, or gone from the screen.

### 9.4 Refuse in a way somebody can act on

A gate that returns a raw 403 to `ai.ts` surfaces as "Drafting failed (403)".
Every gated call needs to come back as an upgrade prompt rather than an error,
and the client already has the shape for it — `useAccount` knows the plan and
`Upgrade` is one state away.

**Done when:** hitting a Pro feature on a free account opens the pricing panel
with a line saying what was being attempted.

### 9.5 Sign-out leaves version history behind

`forgetLocal` clears docs, posts, brands, clients, assets, tombstones and the
cursor. It does not clear `flashcc:v1:versions:<id>`, so signing out on a shared
machine leaves whole documents in localStorage for whoever signs in next. Small
blast radius, ten-minute fix, and it is the kind of thing that is embarrassing
rather than dangerous — which is exactly the kind that ships.

### 9.6 The things Stripe needs that are not code

`PUBLIC_SITE_URL` still defaults to `http://localhost:5173`, and a webhook needs
a public HTTPS endpoint. `ANTHROPIC_API_KEY` is currently empty, so drafting is
dead regardless of any gate. None of this is a code change and all of it blocks
taking money.

### Explicitly out of scope for this batch

- **Per-IP distributed rate limiting.** The in-process limiter resets on deploy
  and will not survive a second node. That is a real limit and the wrong thing to
  solve before there is a second node.
- **Incremental sync.** The full pull downloads every row every time. Fine at one
  person's volume; revisit when somebody has a library big enough to notice.
- **Anything from `docs/reference.md` §29.** The defect list is separate work and
  mixing it in would make this batch impossible to judge.

### Built as

Four of the six. 9.1 and 9.6 are not mine to do — applying SQL and setting env
vars are yours — so what shipped is everything that makes them safe to do, plus
`npm run check:schema`, which probes the live project and names each unrun file.

**The five open routes did not all get the same answer, and the plan was right
that they should not.** `/api/draft` and `/api/hooks` spend money, so they need a
caller AND a plan. `/api/slides` and `/api/document` already needed an account to
upload their own output, so requiring one closes them for free. `/api/export`
**stays open**, because "make carousels and export them" is the free tier and
CLAUDE.md commits to it working with no key and no sign-in — breaking that to fix
an abuse problem would be fixing the wrong thing. It gets a rate limit instead,
and the paid half is enforced only on the numbered-image path, with an OPTIONAL
bearer token: absent means PDF, present is checked.

**402, not 403.** Payment Required is the one status that means exactly this, and
the difference is the whole of 9.4: the client opens the pricing panel on a 402
and shows an error on a 403. The panel is mounted at `App` level rather than in
`Home`, because three of the five gated calls happen in the studio or a dialog
above it and `App` swaps screens rather than nesting them.

**`is_pro()` cannot be called from the server, and finding that out early
mattered.** It is `security definer` and reads `auth.uid()`, which is null for
the service role — so it would have answered false for everybody and the gate
would have looked like it worked while refusing paying customers. The server
reads `profiles.plan` through `readBilling` instead.

**The rate limiter moved into `http.ts` and is keyed differently per route.**
Export counts per address; review counts per SHARE TOKEN, because a review link
is deliberately sent to a roomful of people who may all be behind one office NAT
and one reviewer's enthusiasm must not lock out their colleagues.

### And a bug the audit did not find

Reported mid-batch, and worth recording here because it is the same shape of
problem: **every generated carousel failed the pre-flight this product runs on
it.** "Image reaches into the area Instagram covers with its own interface", on
every slide of every deck. Three separate faults:

1. **`M = 96` was smaller than Instagram's 135px inset.** One margin constant
   served both axes, so clearing the top and bottom crop would have made every
   slide needlessly narrow. Split into `MX = 96` and `MY = 140`.
2. **The full-bleed exemption tested both axes at once.** A band spanning the
   full width and a few hundred pixels tall — every framework's closing block —
   was reported as a mistake. Now judged per axis (this was D4).
3. **The message was wrong and the scope was wrong.** Instagram's box is a
   profile-grid CROP, not an interface overlay, and the grid only ever shows the
   cover — so warning about slide 7 described something that cannot happen.
   `Platform` gained `safeKind` and `safeScope`.

And a fourth thing no constant could fix: a deck reflowed to TikTok's 1080x1920
kept its 96px side margins and put every headline under an action rail that
covers the right 180px. `safearea.ts` pulls content clear of the destination's
chrome on a format change — uniform scale, not per-axis clamping, because
clamping each layer separately unaligns a composition that was aligned.

**180 deck/platform combinations now produce zero safe-zone warnings**, and a
test asserts it for every style and framework so it cannot regress.

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

**All three research sweeps are now in.** The last one reached Reddit through the Arctic Shift
archive API (~865 verbatim rows) and Wayback CDX for older threads, plus 19 workflow video
transcripts. **Its own authenticity warning is worth honouring:** many 2026-dated Reddit comments
read as AI-assisted or softly promotional, so the Wayback-sourced older threads, the long
first-person process posts and the on-camera transcripts carry the most weight.

**It also struck one claimed pain point.** "Running out of ideas mid-session" came from a vendor
marketing blog and the primary evidence says the opposite, emphatically: *"the idea was never the
bottleneck. every small biz owner has 50 posts worth of material in their head... the wall is
everything AFTER the idea... it's not a motivation problem, it's a production-friction problem."*
Nothing in this document rests on it.

**Thinnest remaining theme:** brand drift across a large batch. It shows up as a generic
"everything looks same-y" rather than specific accounts, and scheduler feature-request boards are
where those probably live. Twitter/X was inaccessible throughout.

**One research pass corrected itself twice after filing**, and both sets of corrections are folded
in above. The second addendum closed the per-tool bulk question by going at vendor help centres,
changelogs, raw CSV template files, the GitHub REST API and a redlib Reddit mirror — roughly 250
fetches — after the direct routes were blocked. It also skews Trustpilot/GetApp/AppSumo, because
G2, Capterra-direct and TrustRadius were CAPTCHA-blocked throughout, and it flags its own
unresolved items (Hypefury row limits, a Publer "50 images per cell" claim, a SocialBee 300-vs-1,000
row conflict).

**The first addendum corrected itself on two points.**
It had overcredited a competitor's API by reading its marketing rather than its tutorial, and had
recommended shrink-to-fit before the community layer showed shrink-to-fit is the complaint. Where
the addendum conflicted with the first report, the addendum won — it had the Reddit evidence the
first pass lacked.

**Do not treat "presets run once, nothing is derived" as a differentiator.** A competitor shipped
an AI design agent in March 2026 doing the same LLM-to-JSON-to-editable-layers thing. It is still
the right architecture — it is the structural answer to fixed-box-then-squeeze — but it is table
stakes. Differentiate on split quality and on control over slide count and break points.

**Post-generation editing is the stated churn path**, verbatim from a $90/mo customer: *"The
initial design you get is not bad, but it is impossible to make changes. The AI agent simply does
not listen."* And: *"it blows my mind that every time the AI messes up it recommends using Canva
instead. So I guess that is what I will do."*

**Least-evidenced item in this document:** 6.2, series as an object. It follows logically from 6.1
but rests on inference.

**The unlock for any follow-up research:** `api.pullpush.io` returns raw Reddit JSON with full
comment bodies and permalinks. Direct fetch, `r.jina.ai` and every search proxy are hard-blocked;
that endpoint is not.

**Worth closing later:** a browser-driven Reddit session would reach the r/Design thread
*"Designers, how do you deal with 'Can we go back to version 2?'"* and r/SocialMediaManagers
*"How do you organize client content?"* — both located and confirmed live, neither readable.

---

## Where this stands

Eight batches built the product. A ninth, added after an audit on 2026-09-23,
makes it sellable — see Batch 9 above. What the eight turned out to be, in one
line each:

| | Was | Turned out to be |
| --- | --- | --- |
| 1 | Export a file people can post | Also the pre-flight nobody else does |
| 2 | Find anything | Auto-derived facets, because tags rot |
| 3 | Brands | A named Theme, and the first thing genuinely Pro |
| 4 | Batch creation | Plus two defects it exposed in generation |
| 5 | The asset library | Two buckets with opposite postures, and an inlining step |
| 6 | One asset becomes many | Candidates you choose from, never a ranking |
| 7 | Clients and approval | A review link, and the only place RLS is not the boundary |
| 8 | Trust, and the long tail | Two features and three promises |

**Three roadmap items turned out to be rules rather than features** — 6.6, 7.6
and 8.5 — and all three are now invariants in `CLAUDE.md` with the copy that
states them. They were also three of the cheapest things in this document, which
is worth remembering when the next one is written.

**What is not built is listed below and was rejected on evidence**, not on
effort. That list is the other half of the plan and should be re-read before
anything is added to it.

The open work is Batch 9, and `docs/reference.md` §29 — the defect list, which is
deliberately not a roadmap item and should not be folded into one.
