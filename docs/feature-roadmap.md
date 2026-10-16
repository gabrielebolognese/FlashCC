# FlashCC feature roadmap

The plan of record. Worked through with `/next-batch`, one batch at a time.

Built from four parallel research passes in September 2026, speed pain points, batch workflows,
organisation at volume, and a seventeen-tool competitive audit. **Read the evidence caveats at the
bottom before treating any single quote as load-bearing.**

---

## The frame

**PostNitro is the competitor that matters.** At $20/mo it already ships every table-stakes
feature FlashCC lacks, PNG per slide, brand kits, client workspaces, approvals, saved templates,
native publishing, and it has no analytics, no frameworks, and a much lighter editor.

That gives a clean test for every item below:

> **Batches 1–5 remove reasons to choose PostNitro. Batches 6–8 are the reason to choose us.**

**And the finding that defines the opening:** of nine schedulers audited for bulk import, **not one
generates carousel slides.** Bulk universally means scheduling assets that already exist, every
one of them assumes the pixels are already made. Six of the nine cannot bulk-ship a LinkedIn
carousel at all, two of those denying it in writing (Buffer: *"Bulk upload currently supports text
and single-image posts only. Video and carousel posts are not supported."* SocialBee: *"Carousel
posts cannot be uploaded using CSV files."*).

The one place the full shape exists is PostNitro bolted into Publer as a third-party integration,
CSV bulk import plus AI topic-to-slides. **Treat Publer+PostNitro as the closest direct
competitor**, and note that someone has already validated the shape from the other end.

Three findings shape the order.

**Writing the slides is the biggest time sink, not designing them.** 30–60 minutes of a 45–120
minute carousel. Layout is second, visual design third. Most competitors optimise the third.
FlashCC's centre of gravity is already right, the roadmap defends it rather than chasing them.

**Structural attribution is genuinely unclaimed.** Zero of seventeen audited tools connect hook
shape, framework or slide count to outcome, and the analytics industry's own guides tell marketers
to do it *by hand*. But nobody asks a carousel tool for analytics either. So it does not win the
sale, it wins the renewal. It stays, and it sits behind the table-stakes work rather than in
front of it.

**Batching is smaller and far more perishable than the marketing implies, and designing for the
marketing number would be a mistake.** The real batch breaks at post three or four, *"you've
tried batching before, and it actually fell apart somewhere around the third post"*, *"they sit
down to make 12 reels and end up making 4"*, *"cap at 12-15. after that, energy drops and quality
follows."* Honest self-reported time is 3–4 hours per content day and 10–12 hours weekly; the
"30 posts in 30 minutes" figures are marketing, and even the creator who filmed one says on camera
*"cleanup is super important. And I'm not going to be one of those creators that goes online and
tells you you can just generate and it's 2 minutes and bye."*

Content also goes stale in about a week. *"We used to plan a month out, batch it all... and it
went nowhere."* *"Plan formats and lanes ahead, not finished posts."* A creator whose entire
business is teaching batching, on the record: *"I used to sort of teach and preach like, oh, batch
30 days ahead, I'm not batching 30 days ahead anymore... I am batching two to three posts, but
just the week before."*

**So: optimise for 8–15, design for the wall at post three or four, and treat a batch as a
re-orderable queue rather than a locked calendar.** Anything that advertises 30 must also make 8
feel finished.

**The bottleneck has a name, and it is the design step.** A r/smallbusiness poll literally offered
*"the actual design process (the 'Canva black hole')"* as an option. Two creators whose businesses
are content systems confess the same thing, *"I procrastinate a lot on creating the content. I
can create the plans... That's the piece that I find myself pushing down the to-do list."* And the
fix is stated twice, independently: *"the batching only works once the format is locked, cause
then you're just swapping the content into a template, not inventing a new thing weekly"* and
*"Locking 1 template and batching killed 80% of my decision fatigue."*

**Churn in this category is about billing, not features.** Loomly raised one customer's price 996%
with 30 days' notice. Sprout charges $499/month per external approver and caps it at three. Later
charged someone $180 four months after they cancelled. Contentdrips revokes access the instant you
cancel. Nobody has taken the opposite position, and it costs nothing to take.

---

## Batch 1, Ship a file people can actually post

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
slides.** A live bug report on another tool: *"LinkedIn carousel: PNG slides render blank, JPG
works."* PNGs convert to PDF and lose their content downstream. Closed `not_planned`, still open.
Instagram and TikTok are happy with either, so make the format part of the platform preset rather
than a global choice.

**Done when:** a 10-slide deck exports as `01.png … 10.png` at exact pixel dimensions, gradients
and custom fonts intact, in a zip, and the LinkedIn preset emits JPG.

### 1.2 Platform export presets

**What:** LinkedIn / Instagram / TikTok as named export targets, each carrying its own dimensions,
format, quality and file-size target.

**Why:** the constraints are non-obvious and getting them wrong is invisible until after posting.
LinkedIn rasterises every uploaded PDF to 1080px wide at JPEG ~80–85%, so "keep it vector" is folk
wisdom that does not survive the pipeline. What survives: design at exactly 1080×1350, sRGB not
CMYK, and land between 800KB and 2MB.

**Done when:** picking a platform sets everything, and the resulting file needs no adjustment.

### 1.3 Pre-export quality guard

**What:** a blocking check before export, body text under 18pt, headlines under 24pt, strokes
under 2px, anything intruding on a platform safe zone, file size outside 800KB–2MB, slide count
over the platform ceiling.

**Why:** this is currently solved by an entire genre of blog post. Slide-count ceilings are the
sharpest hidden trap: **Instagram's Graph API caps carousels at 10 while the app allows 20**, so a
20-slide deck cannot be published by any scheduler, ever, and the same API allows only **100
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
`{ ...doc, width, height }`, every layer keeps its pixel position. Switch 4:5 to 9:16 and content
strands in the top two-thirds with 570px of dead space. This is exactly what users describe as
*"the spacing never survives the resize."* Nothing has ever decided what it *should* do, so this
is an open question, not a violated rule.

**Recommend:** re-flow to the new artboard, re-run the composition pass with the same content, so
type re-ladders and text refits rather than proportionally squashing. That is the thing Canva's
Magic Resize cannot do and users complain about constantly.

**Done when:** every format switch produces a laid-out slide, and a test asserts nothing strands
outside the safe box.

### Built as

1.1–1.4 and 1.6 as written. **1.5 was reduced deliberately.**

The roadmap said "re-run the composition pass with the same content", which means
calling `buildSlides`, regenerating from text. That would have silently deleted
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

- `FORMATS` in `model.ts` is dead, never imported. `Properties.tsx` hardcodes its own inline
  copy. Delete one.
- `CLAUDE.md`'s "Canvas elements" section describes `overlays: Overlay[]` with fractional
  coordinates. **There is no `Overlay` type in the codebase.** It is a leftover from the
  architecture the Photoshop-model rewrite replaced, and it reads as a design decision that was
  made. Delete it.

---

## Batch 2, Find anything

**Status:** done
**Size:** small. Everything needed is already stored locally.
**Why here:** cheapest batch in the document and pure churn prevention. There is currently **no
search box anywhere in FlashCC**, less than any competitor, all of whom get complained about for
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
data already stored, not user tags.**

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
and Uploads too, *"now they live in three different places in my UI... there's no way to select
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
alternative, and a document carries its media as base64, so that would have made
search feel broken at exactly the volume where search starts to matter.

A one-time index rebuild backfills all of it from the stored documents, because a
search box that cannot find anything made before today reads as broken.

### 2.7 A used / published state on each carousel

**What:** mark a carousel as published, and filter on it.

**Why:** accidental repeat posting is real and the current fix is manual. A thread titled
*"Organizational strategy to avoid posting same images"*, *"there's no way to know if they've been
used unless I go look"*, solved by *"moving the images to a completed file once I post."* Also
*"Every once in a while we will accidentally deliver too many pieces of content because we lost
track in the mess"*, and *"the one thing worth keeping in a doc is which post went where and what
it did, because after a week you genuinely cannot remember and you end up either repeating
yourself or missing the one that popped."*

Cheap here, because `posts` already carries the stage.

---

## Batch 3, Brands

**Status:** done
**Size:** medium
**Why here:** brand-kit *count* is the proven monetisation ladder in this market (Canva: 1 free,
5 Pro, 100 Business at $25/user). Contentdrips gives one away on its free tier. And `Theme` is
already almost exactly the right shape, which makes this cheaper than it looks.

### 3.1 Brand as a saved object

**What:** promote `Theme` to a named, user-owned `Brand`, colours with roles, display and body
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
have made that copy invisible against its own block. The fix, skip the fallback whenever a layer
already wears one of the target theme's colours, is now guarded by its own test.

**Still thin until Batch 5.** Brand logos need Supabase Storage, so a brand is currently colours,
typefaces and a default format. Per-brand fonts are scoped but still capped at six in localStorage.

### 3.4 Brand switcher and tier limits

**Free 1 brand · Pro 3 · Agency unlimited.** Matches the proven ladder.

---

## Batch 4, Batch creation, done properly

**Status:** done
**Size:** large
**Why here:** this is the wedge. No tool in the market offers a human-writable batch format.
Contentdrips comes closest and its API turns out to be a **renderer, not a splitter**, the caller
supplies every slide's content, and its own blog-to-carousel tutorial routes the splitting through
ChatGPT in Make.com. Its CSV is one row per *field*, so a 10-slide carousel is 20+ rows. The hard
part is explicitly not theirs.

**The design constraint for this whole batch:** the loudest 1-star complaint in the category is
sameness, *"the carousel tools I tried all spit out the same 8-slide hook / 5 tips / CTA
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

**What:** split a slide, merge two slides, and move a break, **without rewording anything.**

**Why:** explicitly unmet, from a paying API customer of a competitor: *"We use preserve, because
our copy is client-approved and must not be reworded. That leaves us no way to express 'same
words, spread across more slides.'... both require us to guess the right slide count up front."*
That vendor's own engineer confirms there is *"no fully automatic card count determination."*

Related bug worth not repeating: a numbered list broken across a slide break restarts at 1.

**Done when:** a 6-slide deck becomes 9 with identical copy, and nothing re-wraps wrongly.

### 4.3 One row per slide, grouped by post

**What:** long-format *internally*, `post_id, slide_index, headline, body, …`, but **accept a
wide paste too, and normalise it.**

**Why accept wide:** the wide shape is what everybody has been trained on, and it is taught
verbatim, *"Each row in your table is going to become an entire carousel, and each column is one
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

**What:** one screen before export, empty fields, overflowing text, missing images, slide count
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

**What:** check every text layer in the batch, surface "7 of 240 slides overflow, here they are"
as a reviewable list, and offer **reflow or an extra slide** as the remedy.

**Why:** overflow is the #1 documented Bulk Create failure and its only fix there is re-running the
whole batch. But the obvious remedy is the trap: **shrink-to-fit is itself the complaint.**
*"Fixed card sizes shrink content instead of giving it more room... dense slides get scaled down
to fit rather than spread out, so text ends up small and cramped. Our worst example is a 25-slide
presentation... almost every slide is visibly squashed."* And bluntly, 1-star: *"it just crams
everything into the top 5th of each page and then blanks the rest."*

**This lands on code already shipped.** `fitToBox` in `text.ts` walks a 12-step ladder from
largest to smallest and takes the first size that fits, the overflow guarantee *is*
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
or serif theme was sized for one typeface and rendered in another, that is D1
in `reference.md`, and Terminal overflowed three slides in four. Second, and only
visible once D1 was fixed: the split pass measured each layer against **its own
box**, and when `fit` runs out of ladder the layer is built at the height it
needed. The box grows to match the overflow, so "does this fit its box" is
answered yes by a slide visibly hanging off the canvas. The artboard is the only
reference that cannot move.

**The shrink allowance needed a floor, not a step count.** "One or two steps"
assumed a short ladder; the generation ladders span 104→40 across twelve steps,
where two steps is 104→92 and would chop hooks constantly. It floors at 60% of
each composition's own top size instead, below that a slide stops reading as
designed and starts reading as crammed.

**The sameness constraint became a mechanism, not a note.** The composition cycle
now starts at an offset derived from the deck's own words, so two different
carousels get different rhythms and the same carousel twice gets the same one.
A test builds twenty decks from one framework and asserts they do not all come
out identical, which the first version of that test proved they did.

**4.6 was built as specified** despite the concern raised before starting. It is
genuinely useful in the editor, where "Re-lay" re-runs generation and keeps
anything you touched. `handEdited` is set in the two mutation funnels rather than
at call sites, and is never inferred from content, a layer deliberately restored
to its original colour would otherwise silently lose its protection.

**Also fixed in passing:** F1 from the reference (`Measure.family` was handed a
CSS stack where a FONTS id was expected, in two callers, so both measured as
sans) and D10 (bulk and sample decks never stamped `framework`, making them
invisible to the attribution this batch exists to feed).

### 4.8 Data-driven export naming

Canva already names files from a chosen column. Shipping without it is a visible regression.

---

## Batch 5, The asset library

**Status:** done
**Size:** large. The biggest engineering cost in this document, budget for it properly.
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

**There is no lingua franca, build per-tool dialects, not one generic CSV.** The three that
accept carousels disagree fundamentally, and two of them are exact opposites:

| Destination | Shape | Notes |
| --- | --- | --- |
| **Metricool** | One column per image, `Picture Url 1`..`10` | Explicitly warns *"Don't put all URLs in a single cell"*. Has a boolean `LinkedIn Images as Carousel` that **builds the LinkedIn PDF from image URLs for you**, the most directly competitive capability found anywhere. ~70 columns. |
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
two buckets with opposite postures, `media` private and signed per session,
`slides` public and written only by pressing Publish. Anything else either breaks
the CSV or makes every private upload world-readable.

**Moving pictures out of the document broke the export, silently.** The payload
posted to `server/render.ts` used to be self-contained: every image and every
uploaded face travelled as a data URL, so the headless Chromium needed nothing
from the network. Remote URLs would have made it fetch a customer's bucket
mid-screenshot with credentials it does not have, and a slow fetch is a slide
that ships with a hole in it. `inline.ts` fetches and re-inlines in the browser,
which already holds a session that can read those files, just before serialising,
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
never a design decision, it was localStorage arithmetic wearing a product's
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

## Batch 6, One asset becomes many

**Status:** done
**Size:** medium
**Why here:** the stated gap in every repurposing tool is that they are *"one-and-done"* when
*"the whole point is volume."*

### 6.1 Long-form ingest

**What:** paste a blog post, transcript or newsletter; get **candidate moments to choose from**,
then build carousels from the ones picked.

**Why the interaction is this way round:** across the whole corpus nobody complains that slides
look bad, they complain the machine picked the wrong material. The most-upvoted articulation:
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

**Upgraded from inference to evidenced, and the pain is not what I assumed.** I had this as a
numbering-consistency feature. The actual problem is **discovery**: *"My Part 4 has 1M views but
Part 1 has only 5K, because viewers can't find it."* *"It's tiresome for the audience to look for
other parts in the profile section... So they just scroll to the next video."*

The second problem is **momentum**: *"the last thing you want is for a piece of content to finally
go viral, but then by the time you make the part two in the series, it's like a month later and
there's just no momentum anymore."*

The third is that numbering lives in a doc and design lives elsewhere, and nothing reconciles them
*"scripts go into a single document, numbered 1-12."* People also ask out loud how to even
schedule one: *"Drop them all at once? One per day? Spread them out more?"*

**So a series should:** auto-number, generate a **cross-reference slide or caption pointing at the
other parts**, and prompt that "part 2 is due" while the momentum is still there.

### 6.3 Hook variants

Regenerate slide 1 only, several ways, pick one. People iterate on hooks constantly and currently
do it by hand.

### 6.4 Caption and first comment

**What:** derive the text post from slides 1–2, in the same screen.

**Why:** the workflow experienced creators already hand-roll, *"write the carousel first, then
pull the text post out of slides 1 and 2. You're forced to fix the hook."* Currently everyone
leaves for a second tool.

### 6.5 Plain-text transcript

**What:** a copyable text version of the whole deck for the caption or first comment.

**Why:** per-slide alt text is **impossible** on both platforms, LinkedIn's Documents API carries
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
write, so it went into `CLAUDE.md` as invariant 5 instead, a rule that lives
only in a roadmap is a rule the next feature quietly breaks.

**6.1's candidate detection is deterministic and runs with no API key.** That was
not in the plan and it is the most important decision in the batch. The thing
people distrust is a model choosing their material, "I have stopped trusting the
ranking and now I scrub the whole thing myself anyway", and a heading is a choice
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
on the index, the total and the seed, and returns the whole regeneration when the
rewrite is long enough to change the slide count.

**6.4 is deterministic on purpose.** The words are already approved; a model
rewriting them would be answering a question nobody asked. It is the rearrangement
experienced creators already hand-roll, slides 1 and 2 and the closer, with a
character count against the platform's real ceiling, because a caption is
truncated live rather than rejected and nothing says so.

**6.5 also fixed the published CSV.** `PublishedCarousel.caption` was the hook
alone, which reads as a truncated caption; it is now the same derived text post.

---

## Batch 7, Clients and approval

**Status:** done
**Size:** large
**Why here:** the agency tier already exists in `profiles.plan` and is empty. This fills it.

### 7.1 Client sits above the flat group string

> **Corrected while building.** This originally said a client *replaces* `group`. It does
> not: a group is a folder, somebody with one client still wants folders, and Batch 6
> forms a series out of a group's contents. A client owns; a group organises.

**What:** a Client owns brands, assets, projects and posts. Ship **both** per-client filter and
all-client roll-up, the evidence demands both: *"I can separate each one so that nothing gets
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

### 7.6 Approvers are free and unlimited, non-negotiable

Sprout charges **$499/month per external approver** and caps the account at three. It is the
loudest single complaint in the corpus. Planable, Gain and Ziflow all give reviewer seats away as
an acquisition lever. Campaign against the anti-pattern.

### Built as

All six, and one of them was a paragraph rather than a feature.

**7.1 does not replace the group string, and the roadmap was wrong to say it
would.** `group` is a folder, "March", "Launch", and somebody with one client
still wants folders; Batch 6 also forms a series out of a group's contents, so
removing it would have taken that with it. A client sits ABOVE the group: it owns
brands, assets, projects and posts, and the folder is a drawer inside. `ALL_CLIENTS`
is the default and the top entry in the switcher, not an escape hatch, because
the CoSchedule complaint is precisely about a tool that only does separation.

**Deleting a client does not delete their work.** Everything it owned becomes
unassigned. A cascading foreign key here would mean an agency losing a client
loses a year of carousels, with no undo, so `client_id` is a plain nullable
column on four tables and deliberately not an FK, and the confirmation says so
before anybody presses it.

**7.2 is the first thing in FlashCC with no offline half.** A review link is a
URL somebody else opens; there is no localStorage version of that. It is also the
only place where RLS is not the boundary: a reviewer has no `auth.uid()`, and an
anon policy that trusts a token in the row means letting the anon key read
`shares` to find the match, which is the same as letting it read every share. So
`server/review.ts` holds the service role key and is the boundary, written to be
read end to end, and `strip()` is an allow list rather than a delete list, so a
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
rewritten one, and it ignores ids and timestamps, so re-laying a deck to the
identical result does not invalidate an approval. A stale approval is reported,
never revoked: deciding for somebody that their sign-off is void is worse than
telling them it is old.

**7.3's filter lives on the server, not in the page.** A leak in that direction
is the single worst bug this product could ship, so `scope` is hard-coded to
`client` on the public insert route, a malformed body cannot mint an internal
note, and the reviewer's read never selects one.

**7.5 turned out to need a signing step nobody mentioned.** `brands.logos` holds
asset IDS, and those assets live in the private `media` bucket. The server signs
them with the service role at read time rather than at share time, so a link
opened in six weeks still shows a logo.

**7.6 was a paragraph.** There was nothing to build except not adding a seat cap.
It is now invariant 6 in `CLAUDE.md`, a comment at the foot of `07-review.sql`,
and `REVIEWER_PROMISE` on the pricing screen, because a commitment that lives
only in a roadmap is one the next paywall quietly breaks.

**Also:** a component may no longer share a name with a module beside it. This
cost time for the fifth time in this batch (`Review`/`review`, `Clients`/`clients`),
so the convention is written into `CLAUDE.md` with the four existing pairs named.

---

## Batch 8, Trust, and the long tail

**Status:** done
**Size:** small to medium

### 8.1 LinkedIn analytics CSV import

**What:** import LinkedIn's own post-analytics export to backfill metrics.

**Why:** manual metric entry is genuinely differentiated, nobody else has it, but it is also the
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
I treated that as a reason to deprioritise. The community layer does have the pain, it is just
never called "version history". It is called file chaos: *"my desktop used to be a graveyard of
Canva exports, CapCut drafts, random PNGs and 'final_final' files."* On the incumbent
specifically: *"I wanted to keep proper versioning but it seems I have to make copies of the file
to keep older versions."* And from an agency, which is the version that matters most: *"I'd also
like some safeties to ensure that approved images aren't confused with modified ones."*

That last one pairs directly with 7.4, approval stamped to a version, and is the strongest
argument for building this at all.

**Still true:** nobody names it as a buying reason, so build it and do not lead marketing with it.
Tier by retention, none free, 30 days Pro, unlimited Agency, which is Planable's proven ladder.

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
subscription active until the period it was paid for ends, so "you keep what
you paid for" has held since billing shipped. What was missing was that
`plan_renews_at` alone cannot distinguish "renews on the 3rd" from "ends on the
3rd", and the account card showed a renewal date either way. One boolean carried
through the webhook fixes it, and the four promises are now on the pricing screen
in the words somebody would use if they were telling you honestly.

**8.5 was nothing at all.** Grep found no credit, quota, usage or metering
concept anywhere in `src/` or `server/`. There was nothing to remove, so it
became invariant 7 and `UNMETERED_PROMISE` beside the reviewer one, because a
commitment that lives only in a roadmap is one the next paywall quietly breaks.
That is now the third time a roadmap item has turned out to be a rule rather than
a feature, after 6.6 and 7.6, and the pattern is worth naming: the cheapest
things in this document are the ones that cost nothing and nobody has taken.

**8.1's matching is the feature, and the unmatched rows are the screen.** Three
passes of descending confidence, URL, exact text, leading text within a date
window, each consuming what it claims, so a weaker rule can never overwrite a
stronger one. Anything unplaced is RETURNED and shown with a dropdown rather than
dropped: an import that quietly places 40 of 60 is worse than one that places 40
and tells you, because the first leaves somebody believing their history is
complete.

**Absent is not zero, and that took two guards.** `readNumber` returns null for a
blank rather than 0, because a fabricated zero goes straight into the median
every insight screen runs on. And `applyMatches` writes only the fields the file
carried, LinkedIn's export has no saves column, and zeroing a hand-entered saves
count because the file was silent would destroy exactly the data this feature
exists to protect.

**8.3 is local and does not sync, which is a scope call the roadmap did not
make.** The stated pain is losing your own earlier state on the machine you are
working on; syncing a snapshot of every export across devices would multiply the
largest records in the product for a need nobody described. That also means it
needed no migration and works today with no database, so this batch ships ONE
migration rather than the two flagged in the plan.

**The diff compares by position, not by slide id.** Re-laying a deck mints new
ids for every generated layer while the slides keep their order and their
content, so an id-based diff would report a whole deck as replaced every time
somebody pressed Re-lay. It shares `docVersion`'s rules, so the filmstrip and the
stale-approval warning can never disagree about whether anything happened.

**Restoring is itself snapshotted.** Going back should never be the one move you
cannot take back.

---

## Batch 9, Make the paywall real

**Status:** done
**Size:** medium
**Why here:** every feature the pricing screen sells is currently free, and five
server routes answer to anyone. Written after an audit against the live database
on 2026-09-23 rather than from the code alone, every claim below was verified.

### What the audit found

Probed with the publishable key against the real project:

| Object | State |
| --- | --- |
| `profiles`, `docs`, `posts` | live, and RLS correctly returns 0 rows to an anonymous caller |
| `brands`, `assets`, `clients`, `shares`, `comments` | **missing**, 03, 04, 06, 07 unrun |
| `docs.series_id`, `docs.client_id`, `posts.pillar`, `profiles.plan_ends_at_period_end` | **missing**, 05, 06, 08 unrun |

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

### 9.2 Close the open routes, but not all of them the same way

Five routes take no bearer token. They are not the same problem and must not get
the same answer:

| Route | Cost of abuse | Answer |
| --- | --- | --- |
| `/api/draft`, `/api/hooks` | **your Anthropic key, unmetered** | require a caller AND `is_pro` |
| `/api/slides`, `/api/document` | Playwright CPU, and publishing already needs an account to upload | require a caller |
| `/api/export` | Playwright CPU | **stays open**, see below |

**`/api/export` must not require an account.** "Make carousels and export them"
is the free product and it is documented to work with no key and no sign-in at
all. Requiring auth there would break the free tier to fix an abuse problem, so
export gets rate limiting and tighter size caps instead, the limiter already
written for the review endpoint, lifted somewhere both can use it.

**Done when:** an unauthenticated POST to `/api/draft` is refused, an
unauthenticated POST to `/api/export` still returns a file, and a free account's
draft request is refused by the server rather than by the interface.

### 9.3 Decide what Pro actually is, then enforce it server-side

The pricing screen currently promises eight things for Pro and five for Agency.
Each needs a real boundary or needs removing from the list, an advertised
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
and the client already has the shape for it, `useAccount` knows the plan and
`Upgrade` is one state away.

**Done when:** hitting a Pro feature on a free account opens the pricing panel
with a line saying what was being attempted.

### 9.5 Sign-out leaves version history behind

`forgetLocal` clears docs, posts, brands, clients, assets, tombstones and the
cursor. It does not clear `flashcc:v1:versions:<id>`, so signing out on a shared
machine leaves whole documents in localStorage for whoever signs in next. Small
blast radius, ten-minute fix, and it is the kind of thing that is embarrassing
rather than dangerous, which is exactly the kind that ships.

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

Four of the six. 9.1 and 9.6 are not mine to do, applying SQL and setting env
vars are yours, so what shipped is everything that makes them safe to do, plus
`npm run check:schema`, which probes the live project and names each unrun file.

**The five open routes did not all get the same answer, and the plan was right
that they should not.** `/api/draft` and `/api/hooks` spend money, so they need a
caller AND a plan. `/api/slides` and `/api/document` already needed an account to
upload their own output, so requiring one closes them for free. `/api/export`
**stays open**, because "make carousels and export them" is the free tier and
CLAUDE.md commits to it working with no key and no sign-in, breaking that to fix
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
the service role, so it would have answered false for everybody and the gate
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
   full width and a few hundred pixels tall, every framework's closing block,
   was reported as a mistake. Now judged per axis (this was D4).
3. **The message was wrong and the scope was wrong.** Instagram's box is a
   profile-grid CROP, not an interface overlay, and the grid only ever shows the
   cover, so warning about slide 7 described something that cannot happen.
   `Platform` gained `safeKind` and `safeScope`.

And a fourth thing no constant could fix: a deck reflowed to TikTok's 1080x1920
kept its 96px side margins and put every headline under an action rail that
covers the right 180px. `safearea.ts` pulls content clear of the destination's
chrome on a format change, uniform scale, not per-axis clamping, because
clamping each layer separately unaligns a composition that was aligned.

**180 deck/platform combinations now produce zero safe-zone warnings**, and a
test asserts it for every style and framework so it cannot regress.

---

## Batch 10, The AI pipeline

**Status:** done
**Size:** medium
**Why here:** every call goes to the most expensive model there is, on a plan
that promises not to meter anything, and nobody decided either of those.

### What is there today

Two routes, both `claude-opus-5`, both structured output through
`messages.parse()` with a zod format, both gated on Pro since Batch 9:

| Route | Job | max_tokens | Shape of the work |
| --- | --- | --- | --- |
| `/api/draft` | brief + framework to slide copy | 16,000 | genuine reasoning, about fifteen seconds |
| `/api/hooks` | deck to five opening lines | 4,000 | short generation, one line each |

And two facts that shape everything below: **not one token is counted
anywhere**, and `Brand` carries colours, typefaces and logos but nothing about
how anybody *sounds*.

### 10.1 A model per task, and cache the part that never changes

Five one-line rewrites is not a reasoning task. Drafting seven slides from a
brief is. One `MODEL` constant serving both is the easiest real money in this
document.

**Drafting moves to `claude-sonnet-5`. Hooks move to `claude-haiku-4-5`.** Each
route names its own, because the next route added will have its own answer too.

The system prompts are static and the framework slot lines come from a fixed set
of four, so both belong in a **cached prompt block**. At one user it saves
nothing; at a hundred it is most of the bill.

**Done when:** each route declares its own model, the system block is cached, and
a drafted carousel is visibly cheaper in the usage log than it is today.

**Worth doing before committing:** run the same brief through Sonnet and Opus and
read both. The recommendation is that Sonnet is enough for this job, and it is a
recommendation rather than a measurement.

### 10.2 Know what it costs, without metering anybody

**This is the constraint invariant 7 creates.** "Nothing here is metered" is a
real wedge and it should stay, but it means unit economics are a DESIGN problem
rather than an afterthought: an unmetered AI feature on a $29 plan has to be
cheap enough that heavy use is still profitable, because there is no meter to
stop it.

Three things, and none of them is a credit:

- **Log `usage` on every call.** Input tokens, output tokens, cached tokens,
  model, route, duration. To the console now, and structured enough to move into
  a table later.
- **An abuse ceiling per account.** The same `rateLimit` the export route
  already uses. A limiter stops one script; a credit system taxes ordinary use.
  They look similar and are opposites, and the comment on it should say so.
- **A ceiling on input.** A brief is currently unbounded, so a paste of a whole
  book is billed as a whole book.

**Done when:** one line per AI call in the log says what it cost, and a loop
hitting `/api/draft` is refused by the limiter rather than by the invoice.

### 10.3 Fail in a way that does not bill twice

Refusals are handled. Nothing else is.

- `overloaded_error` and Anthropic rate limits are not mapped and surface as
  "Drafting failed (500)".
- There is no timeout, so a hung request holds a browser tab forever.
- **Retry policy is the one with teeth.** A retry on a 5xx is correct. A retry
  on a refusal or a 400 is not, and a retry after the model has already answered
  charges twice for one draft. Retry exactly once, only on transport and 5xx.

**Done when:** every documented Anthropic failure has a sentence somebody can act
on, and no failure path can spend twice.

### 10.4 Brand voice

**The highest-value item here, and the cheapest to run.**

Every AI carousel tool produces competent, generic copy, and that is the
complaint underneath most of the research in this document. `Brand` is already
the right object: it is per client, it syncs, it is applied once.

`Brand.voice` gains three fields, all optional:

- **a tone line** in the user's own words
- **up to three of their own posts**, as the examples the model matches
- **words they never use**

Fed into `/api/draft` and `/api/hooks` inside the cached block, so it costs
almost nothing per call.

Examples beat adjectives. "Write like this" with three real posts attached does
more than any number of instructions about being punchy, and it is the one thing
a competitor cannot copy because it is the customer's own writing.

**Done when:** the same brief drafted under two different brands comes back
sounding like two different people.

### 10.5 Prove the prompts

A model's output cannot be unit tested. Everything around it can, and this
codebase already treats tests as design guards:

- **Prompt assembly as golden files.** The assembled system and user messages are
  deterministic given a framework and a brief, so a careless edit shows up in a
  diff instead of in somebody's carousel.
- **A small eval harness**, run by hand rather than in CI because it costs money:
  a handful of briefs through each framework, asserting structural properties
  only. Slide count matches the slots. Hook under 90 characters. No placeholder
  text. Nothing past the body limit. It cannot tell you the copy is good; it can
  tell you the copy is broken, which is the failure that actually ships.

**Done when:** `npm run eval:draft` exists, is not part of `npm test`, and says
plainly which framework failed which property.

### Explicitly out of scope

- **Streaming the draft.** The best-feeling option and real complexity against
  structured output, including what to do with a half-parsed response. Fifteen
  seconds behind an honest progress state is tolerable. Revisit once the rest is
  solid.
- **AI anywhere near layout.** Invariant 5. Not negotiable.
- **AI picking long-form candidates.** `longform.ts` is deterministic because the
  research is unambiguous that people distrust machine selection of their own
  material. Refining the copy of a moment somebody chose is a different question,
  and a later one.
- **AI captions and transcripts.** Those rearrange words already approved.
- **Credits, of any kind.** Invariant 7.

### What the build actually found

The key was set before this was built, so `scripts/eval-draft.mjs` ran against
real models rather than sitting there as an aspiration. Three things came out of
it that the plan above did not anticipate:

1. **Thin briefs made the model invent.** From "Cut on movement, not on the
   beat", the showcase framework produced a coffee brand, a 30-second reel and a
   product launch. Showcase asks for context and results that three words cannot
   supply, and the model filled the gap rather than leaving it. Fixed with a rule
   in `DRAFT_SYSTEM`: write something true and general, never invent a client, a
   number or a result.
2. **The models wrote em dashes.** Opus put them in four slides out of eight.
   `copy.test.ts` holds every source file to the house style and model output is
   not a source file, so nothing was holding it to anything. Fixed twice over: a
   prompt rule, and `plainText()` in `prompts.ts` applied to every slide and hook
   on the way out. The prompt is a preference; the function is the guarantee.
3. **Sonnet is enough.** Sixteen drafts, both models, four frameworks. Opus is
   richer on thin briefs, where it supplies craft detail the brief did not; Sonnet
   is tighter and about 20% faster. Neither is wrong and the gap does not justify
   the price, so 10.1 stands as written.

Also worth recording: the first version of the harness's fabrication check
flagged every educational draft for hooks like "3 cutting rules", which is a deck
counting its own slides. It now looks only for measurements, a currency amount, a
percentage, a multiplier, a unit of time, because nothing separates a listicle
count from an invented statistic by pattern and a check that is usually wrong is
one nobody reads.

### Still to run

`supabase/10-brand-voice.sql`. Brand voice works locally without it and will not
sync until it is applied.

---

## Batch 11, Rewrite anything, in place

**Status:** done
**Size:** large
**Why here:** drafting is one shot. You get eight slides and then you are alone
with them. Every other tool in this category lets somebody push on a line they
almost like, and the absence of that is the difference between a draft you edit
and a draft you delete. It is also the single most reached-for AI action in every
writing product that has one.

### What exists today

Two routes, both whole-deck. `/api/draft` takes a brief and returns a deck;
`/api/hooks` takes a deck and returns five openings for slide one. There is
nothing between them. A slide four that is nearly right has to be fixed by hand
or by redrafting the whole carousel, which throws away the seven slides that were
fine.

Two mechanisms already exist and this batch is mostly about connecting them:

- **`restateSlide(doc, index, text, theme, options, roles)`** in `regenerate.ts`
  already replaces one slide's words and rebuilds, returning `{ doc, replaced,
  kept }`. It exists because writing new text onto a layer whose box was measured
  for the old words is how type overflows. The hook picker already uses it.
- **`markEdited`** already tags a layer somebody has touched by hand, so a
  rebuild knows what not to clobber.

### 11.1 One route, several intents

A single `/api/rewrite`, not a route per verb. The difference between "shorter"
and "punchier" is one line of the prompt, and five routes that differ by one line
is five things to keep in step.

**The request:**

| Field | Type | Notes |
| --- | --- | --- |
| `text` | string | the line being rewritten, required, ceiling 2,000 chars |
| `intent` | enum | `shorter`, `punchier`, `simpler`, `angle`, `expand`, `free` |
| `instruction` | string? | only read when `intent` is `free`, ceiling 300 chars |
| `slot` | `{ id, label, note }`? | the job this slide does, so a CTA is rewritten as a CTA |
| `deck` | string[]? | the rest of the carousel, for context, ceiling 12,000 chars |
| `count` | number? | 2 to 5, default 3 |
| `voice` | Voice? | same shape as `/api/draft`, omitted when empty |

**The return:**

```
{ options: [ { text: string, note: string } ] }
```

`note` is two or three words naming what that option did, the same idea as
`angle` on a hook variant: "tighter", "names the cost", "plainer words". It is
what lets somebody choose on judgement rather than by reading three near
identical lines and guessing.

**Nothing is ranked and nothing is scored.** Invariant 7's cousin: the ranking
complaint in the research is not about credits, it is about a machine asserting
which of your sentences is better. Three options in the order the model wrote
them.

**Done when:** a POST with a line and an intent returns two to five options, each
with a note, and the deck's own vocabulary is visible in them.

### 11.2 What the user sees

**Entry point one, the canvas.** Select a text layer. The Properties panel grows
a **Rewrite** control under the text field: a 28px row of intent chips
(`Shorter`, `Punchier`, `Simpler`, `New angle`, `Longer`) and a free-text box
behind a "Tell it what to change" disclosure. Clicking a chip fires immediately;
there is no second confirm, because the result is a list to choose from and not a
change to the document.

**Entry point two, the filmstrip.** Right-click a slide, "Rewrite this slide".
Same panel, with `deck` populated from the other slides.

**The result is a popover, not a replacement.** Three cards, each showing the
proposed line and its note, with the current text pinned at the top under
"Now". Clicking a card applies it. Escape or clicking away discards all of them
and nothing has changed.

**Applying goes through `restateSlide`, never a direct layer write.** This is the
rule that keeps invariant 5 honest: the model returned words, and the layout is
recomputed from those words by `compositions.ts`. A slide whose text layer has
been hand-moved keeps its position, because `markEdited` already protects it, and
the panel says "kept your layout" when `kept > 0`.

**Undo is one step.** The apply is a single history entry labelled "Rewrite", so
Cmd+Z puts the old line back with its old layout.

### 11.3 The intents, and what each one actually asks for

Worth writing down, because "punchier" means nothing to a model without a
definition and everything about this feature is whether the options are
meaningfully different from each other:

| Intent | The instruction underneath it |
| --- | --- |
| `shorter` | same meaning, fewer words, never by deleting the specific detail |
| `punchier` | same claim, stronger verb, front-load the consequence |
| `simpler` | plainer vocabulary, shorter clauses, no jargon, same claim |
| `angle` | the same slide's job, approached from a different direction |
| `expand` | one more concrete beat, still inside the character ceiling |
| `free` | whatever the user typed, bounded by the rules that always apply |

The rules that always apply in every case: keep the slot's job, keep the
character ceiling for that slot, add no claim the deck does not already contain,
no em dashes, no hashtags, no emoji.

**`expand` has a trap and needs saying:** a slide told to grow will grow past its
box. The ceiling goes in the prompt AND `splitToFit` still runs on the way in, so
a long answer splits rather than overflows.

### 11.4 Model, cost and limits

`claude-haiku-4-5`. One line in, three short lines out, no reasoning to do. The
same argument that put hooks on Haiku applies more strongly here, because this is
the route people will press twenty times in a session.

`REWRITES_PER_HOUR = 300`, per account, keyed like the others. High because this
is meant to be pressed constantly and a limit anybody meets in normal use is a
credit system with a different name. It exists so one script cannot spend a month
of margin.

Cached system block, per-request everything else, same boundary as `prompts.ts`
already draws.

**Done when:** a rewrite round trip is under two seconds on an ordinary line,
and `logUsage` shows the cache being hit from the second call onward.

### 11.5 Multi-select, and the thing not to build

Selecting three slides and rewriting all of them is one request per slide, run in
parallel, not one request containing three slides. A single call would let the
model rewrite slide two in a way that only makes sense given its rewrite of slide
one, and then somebody accepts one and rejects the other and is left with a
non-sequitur.

**Not building: rewrite the whole deck at once.** That is `/api/draft` with extra
steps, and the whole point of this batch is the thing between a line and a deck.

**Done when:** rewriting a three-slide selection shows three independent option
sets and accepting one does not alter the other two.

### What this batch deliberately does not do

- **No layout suggestions.** Invariant 5. The route returns strings.
- **No automatic application.** Every option is a choice somebody makes.
- **No scoring, ranking or "best" badge.** See 11.1.
- **No streaming.** Three short lines arrive together; a token stream would add
  a loading state to a call that is already fast.

### What the build found

Four things, three of which changed the plan.

**1. A live bug in `/api/hooks`, unrelated to this batch.** The eval harness was
extended to cover rewriting and every call failed with
`400 This model does not support the effort parameter`. The hooks route has been
sending `effort: "medium"` to Haiku since Batch 10 moved it off Opus, which means
**hook variants have been broken on every call since then**. Nothing caught it
because the harness only ever exercised drafting. Both routes now send no
`effort`; it is a reasoning-model control and neither route reasons.

**2. Two of the three entry points in 11.2 did not exist as described.**

- "Under the text field" in Properties: there is no text field there. A layer's
  words are edited in place on the canvas through `editingId`. The control went
  to the top of the text block instead.
- "Right-click a slide" in the filmstrip: there is no context-menu primitive
  anywhere in this codebase, and adding one for a single item is a new
  interaction to teach. It went into the hover cluster beside Duplicate and
  Delete, which is the gesture people already use on those thumbnails.

**3. `slot` cannot be looked up the way 11.1 assumed.** Roles are deliberately
not stored at runtime, `model.ts` says so in its first paragraph, and
`doc.framework` is recorded for analytics rather than for layout. The only route
back to a slot is positional, so `slotAt` returns one **only while the slide
count still equals the structure's slot count** and otherwise returns nothing. A
CTA rewritten as a mid-deck point is worse than one rewritten with no slot at
all, which is the same rule `contextVoice` already applies to brand voice.

**4. Applying to one layer needed a split that the batch did not anticipate.**
`restateSlide` replaces a slide's *entire* copy, so handing it one layer's new
text would rebuild the slide from that line alone and delete the other one, which
a heading-plus-body composition has. Hence `slideTextWith`, which swaps one line
inside the slide's whole text in the same order `textsOf` reads it.

And **a hand-edited layer is written to directly**, which reads like a violation
of "never a direct layer write" and is the rule applied properly:
`restateSlide` keeps hand-edited layers verbatim *and* rebuilds from the text, so
running it on one would print the new words as a generated layer and keep the old
hand-placed one, the same line twice. Somebody who dragged a box has also already
said where it goes.

### 11.5 was not built, and should not be built as written

Multi-select rewrite is unsound in this architecture and the "done when" cannot
be satisfied honestly.

**Any apply invalidates the rest of the queue.** `restateSlide` rebuilds a slide,
which creates new layer ids, so a second queued layer on the same slide no longer
exists. And when a rewrite is long enough to split, the slide count changes and
every queued slide index after it shifts. So "accepting one does not alter the
other two" is exactly what cannot be promised: accepting one can invalidate what
the other two were pointing at.

There is also no multi-slide selection in the filmstrip to build it on. Adding
one means shift-click, range state and an interaction with the existing drag
reorder, which is a larger change than the feature it would serve.

The sound version resolves each target freshly from the live document after every
apply and abandons the rest when the deck's shape changes. That is worth doing if
anybody asks for it, and is not worth doing on the strength of a plan written
before the constraint was known.

### Also added, not in the plan

**`shortNote`.** A live run of the `angle` intent returned
"Names the sensory disconnect without using technical terms" as a note, where the
interface expects two or three words beside a character count. The prompt now
asks for at most four words and `shortNote` clamps to 32 characters at a word
boundary. Same split as `plainText`: the prompt is a preference, the function is
the guarantee.

**`npm run eval:draft -- --rewrite`.** Every intent against one line, printed for
a person to read, with the checks that can be automated: options distinct from
each other and from the original, every option carries a note, no two notes
identical, nothing over the ceiling. This is what found the `effort` bug.

---

## Batch 12, The caption, and the words around the deck

**Status:** done
**Size:** medium
**Why here:** `posts.caption` has existed since Batch 8 and is filled in by hand
every single time. The carousel is the hard part and the product does it; the
200 words that go under the carousel are the easy part and the product leaves
them blank. It is also the one place where a model has the whole deck to work
from and needs no new input at all.

### What exists today

`08-pipeline-fields.sql` added `caption` to `posts`. `PostSheet.tsx` shows it as
an empty textarea. Nothing writes it but a person. Alt text does not exist
anywhere, which is both an accessibility gap and, on LinkedIn, a ranking one.

### 12.1 The caption route

`/api/caption`.

**The request:**

| Field | Type | Notes |
| --- | --- | --- |
| `deck` | string[] | every slide's text in order, required, ceiling 12,000 |
| `platform` | enum | `linkedin`, `instagram`, `tiktok`, from `platforms.ts` |
| `framework` | string? | the structure's name, for tone |
| `cta` | string? | what the last slide asks for, so the caption does not contradict it |
| `voice` | Voice? | as everywhere else |
| `count` | number? | 1 to 3, default 2 |

**The return:**

```
{
  captions: [ { text: string, note: string, chars: number } ],
  hashtags: string[]
}
```

`chars` comes back from the server rather than being counted in the browser,
because the platform ceilings live in `platforms.ts` on both sides and one of
them will drift.

### 12.2 Per platform, and this is the whole reason it is not one prompt

A caption is not a caption. The three destinations want genuinely different
things and a single generic caption is worse than none:

| Platform | Ceiling | What the first line has to do | Hashtags |
| --- | --- | --- | --- |
| LinkedIn | 3,000, but **the first 210 characters are what shows before "see more"** | earn the click on "see more", never "Swipe to learn" | 3 to 5, at the end, not inline |
| Instagram | 2,200 | earn a stop, the deck is already visible | up to 10, own paragraph, never mid-sentence |
| TikTok | 2,200 | context for a video-first audience who may not swipe at all | 3 to 5, inline is acceptable here |

**The 210-character truncation is the load-bearing fact for LinkedIn** and the
one thing a generic caption writer always gets wrong. It goes in the prompt as a
hard rule and in the UI as a marker in the textarea.

### 12.3 What the user sees

In `PostSheet`, above the caption box: a quiet **Write caption** button with a
`Sparkles` glyph, disabled with a tooltip when the deck has no copy yet.

Pressing it replaces the button row with two option cards, each showing the
caption, its note, and a character count coloured against the platform ceiling.
The LinkedIn cards draw a hairline rule after character 210 with a small "see
more" label, so what gets truncated is visible before it is chosen rather than
after it is posted.

Choosing one writes it into the existing textarea, which stays fully editable.
It is a draft in a text box, not a managed field.

Hashtags land as a separate chip row under the box, each removable, with a
"copy all" affordance. They are not appended to the caption text automatically,
because half of people want them in a first comment instead and a caption that
silently contains them is one somebody has to unpick.

### 12.4 Alt text, in the same batch because it comes from the same place

`/api/alt`, or the same route with `mode: "alt"`. One string per slide,
describing what the slide SHOWS, not what it says.

**This matters and is not decoration.** A carousel exported as images is
invisible to a screen reader, and LinkedIn surfaces alt text. The deck's own
words are already the best possible source for it.

Ceiling 125 characters per slide, which is where most screen readers truncate.
The return is positional, one entry per slide, and the UI shows them in the
export dialog as an editable list with a "regenerate this one" affordance.

**Done when:** exporting a deck to Instagram or LinkedIn offers alt text for
every slide, and skipping it is one click rather than the default.

### 12.5 Model and limits

`claude-haiku-4-5` for alt text, which is description. `claude-sonnet-5` for
captions, which is writing that has to hold up next to the deck.

`CAPTIONS_PER_HOUR = 120`.

### What this batch deliberately does not do

- **No posting.** The roadmap already rejects LinkedIn auto-posting on evidence
  and nothing here changes that.
- **No hashtag research, volume or reach estimates.** That is the virality score
  again wearing a different hat.
- **No scheduling suggestions.** Best-time-to-post claims are the least
  defensible number in this category.

### What the build found

**1. "Nothing writes it but a person" was wrong.** `captionOf` in `transcript.ts`
already builds a caption deterministically, from slide 1, slide 2 and the
closer, clamped to the platform ceiling, and `PostSheet` already had a button
for it. This is the `longform.ts` situation arriving early: a deterministic path
exists, works, is free and needs no key, and the model path has to sit **beside**
it rather than replace it. Both buttons are on the screen, labelled for what they
actually do.

**2. `chars` was redundant and its stated reason was wrong.** The ceilings do not
live in `platforms.ts`, they live in `transcript.ts` as `CAPTION_LIMIT`, and only
on the client. The server had none. So the server now reports the ceiling and the
fold it enforced, the same pattern Batch 11 used for `limit`, and `captionFit`
stays for the user's own typing.

**3. Alt text had no stated destination, and the answer differs per platform.**
It cannot be embedded in a JPEG that any of these platforms reads, and none has
an API to push it to: a person types it into the upload form. What differs is
whether there is a form at all. Instagram and TikTok take per-image alt text and
export a zip, so it travels as `alt.txt` numbered to match the images. **LinkedIn
is a document post, one PDF, with no per-page alt field**, and the accessible
answer there is the transcript in the first comment, which `PostSheet` already
offered. The dialog says which applies rather than implying the export carries
it everywhere.

An older tooltip in `PostSheet` claimed per-slide alt text was impossible on
**both** platforms. That is right about LinkedIn and wrong about Instagram, and
it has been corrected. **Worth confirming against the current apps before
treating either half as settled.**

**4. Alt text needed nowhere new to live.** `docs.data` is a single `jsonb` blob,
so `Slide.alt` needs no migration and gets reordering, duplication, sync and
version history for free. A parallel array beside the deck would go out of step
the first time anybody dragged a thumbnail.

### The hashtag filter took three attempts, and the third is the right one

Generic hashtags are the fabrication problem in a different costume: words
asserted about somebody's post that the post does not contain. A caption writer
left alone returns #marketing, #contentcreation and #videoediting every time.

- **Exact substring** rejected `#editing` on a deck that says "edits".
- **Substring plus single-word stemming** still rejected `#cuttingonmovement`,
  and a live LinkedIn run came back with no hashtags at all.
- **Segmentation with a "one word of five letters" rule** accepted that one, and
  rejected `#cutonthebeat`, whose longest word is four letters and which is a
  real phrase from the deck. The length rule existed to stop a deck containing
  "the", "and" and "not" grounding `#theandnot`, and it could not separate the
  two cases because they look identical by length.

What works is **adjacency**: a tag is grounded when it closes up a run of
consecutive words from the deck, stemmed on the deck side. "cut on the beat" is
in the deck, "the and not" is not, and nothing has to be measured. A tag that
merges two separate phrases is dropped, which is correct, because the deck never
said it.

A live run now keeps `#cuttingonthebeat` and `#cutonmovement` and drops
`#videoediting`, `#editingtips`, `#filmediting`, `#videoproduction`,
`#invisiblecuts` and `#editingtricks`.

### Also found by the eval

**Alt text opened every entry with "Text saying".** Banned "Image of" and "Slide
showing" and got the same waste under a different phrase, five times, inside a
125 character budget. The rule is now that **for a slide which is only words, the
alt text IS those words**, given as they appear. Entries went from 40 to 89
characters down to 29 to 78, and stopped being repetitive.

`npm run eval:draft -- --caption` runs every platform and the alt route, prints
them with the LinkedIn fold drawn in, and checks what can be checked: over the
ceiling, a hashtag inside the caption text, an opening instruction to swipe,
every tag generic, a wrong number of alt entries, a wasted preamble.

---

## Batch 13, Bring your own source

**Status:** done
**Size:** large
**Why here:** the brief is the only way in. Everybody making carousels regularly
is making them FROM something: a newsletter, a transcript, a talk, a post that
did well last year. Today that means reading the thing and typing a summary,
which is the work the product is supposed to remove.

### What exists today, and what this must not break

`longform.ts` already ingests long text and is **completely deterministic**, on
purpose. `readLongForm`, `segments`, `sentences`, `toSlides`. It rearranges words
somebody already approved and introduces no drift.

**This batch does not replace it and must not.** The deterministic path is the
right answer when the source is already good prose in the user's own voice. The
new path is for when the source is raw: a transcript full of filler, an article
written by somebody else, a set of notes.

The two sit side by side and the interface has to make the choice obvious, which
is most of the design work here.

### 13.1 The distil route

`/api/distil`.

**The request:**

| Field | Type | Notes |
| --- | --- | --- |
| `source` | string | the raw text, ceiling 40,000 chars, higher than the brief ceiling on purpose |
| `kind` | enum? | `transcript`, `article`, `notes`, `post`, or absent for "work it out" |
| `structure` | Structure? | when the framework is already chosen |
| `voice` | Voice? | as everywhere |

**The return, and this is the interesting decision:**

```
{
  brief: string,
  angles: [ { title: string, brief: string, why: string } ],
  quotes: string[]
}
```

**It returns a brief, not slides.** A 40,000 word transcript contains five
carousels, not one, and a route that returns one deck has silently thrown four
away and made the choice on the user's behalf. So it comes back as `angles`: three
to five distinct carousels this source could become, each with a one-line title, a
brief that would produce it, and `why` naming what in the source supports it.

`quotes` is the source's own most quotable lines, verbatim, with no rewriting. It
exists because the single highest-value thing in a transcript is usually a
sentence the person already said, and a model that paraphrases it has destroyed
the only part that was already perfect.

### 13.2 What the user sees

A new entry on the start screen beside "Write a brief": **"Start from something
you have"**.

**Step one, the source.** A large paste box, plus drag-and-drop for `.txt`,
`.md`, `.vtt` and `.srt`. Subtitle formats are in because a transcript is the
most common raw source and it arrives as subtitles; stripping timestamps and
speaker labels from those is deterministic and belongs in `longform.ts` rather
than in a prompt.

**PDF is deliberately out of this batch.** Parsing it properly is a dependency
and a whole afternoon, and every PDF somebody has can be select-all-copied into
the paste box today. Revisit if anybody asks.

**Step two, the angles.** Three to five cards, each a title, the `why` line, and
the brief underneath in smaller type. Choosing one carries its brief into the
normal framework picker, which is the existing flow from there on.

A **"none of these, write my own"** escape hatch sits under them, pre-filled with
the plain `brief`. Choosing wrong here is expensive and not choosing must lead
somewhere.

**Step three, the quotes, which are not a step.** The quote list rides along into
the compose screen as a collapsible strip under the fields, each quote a click to
insert. It is a clipboard, not a decision, and it is the thing that makes the
feature feel like it read the source rather than skimmed it.

### 13.3 The split between this and `longform.ts`

The start screen asks one question, in plain words, because the technical
distinction is meaningless to a user:

| What they pick | What runs |
| --- | --- |
| "It is already written how I want it" | `longform.ts`, deterministic, no model, no key needed |
| "It is raw, work out what is in it" | `/api/distil` |

The first option stays available with no API key and on the free tier, because it
is not an AI feature and never was.

**Done when:** pasting a 6,000 word transcript returns at least three angles that
are genuinely about different things, and the quotes are present in the source
verbatim.

### 13.4 Model, cost and the ceiling

`claude-sonnet-5`. This is the most expensive route in the product: 40,000
characters in, every time, and no prefix to cache because the source is the
request.

That is worth stating plainly because it changes the limit. `DISTILS_PER_HOUR =
20`. Still not a credit, still invisible, but the ceiling is lower than the
others because one call here costs what thirty rewrites cost.

The 40,000 ceiling clips rather than refuses, and the UI says how much was used
when it clips, because silently reading half a transcript and saying nothing is
the worst available behaviour.

### 13.5 Verbatim quotes have to be verified, not trusted

A model asked for verbatim quotes will occasionally tidy one. A quote in
somebody's carousel attributed to a transcript that does not contain it is the
failure that actually hurts, and it is checkable for free: **every returned quote
is substring-matched against the source on the server, and anything that does not
match exactly is dropped before the response is sent.**

No repair, no fuzzy match, no "close enough". Dropped.

**Done when:** a test plants a near-miss quote in a model response and the route
returns without it.

### What this batch deliberately does not do

- **No URL fetching.** Somebody else's page is somebody else's content, fetching
  it server-side makes us the one requesting it, and the paste box covers the
  same ground with the user's own copy of the text. Revisit deliberately, not by
  drift.
- **No audio or video upload.** Transcription is a different product.
- **No "summarise this for me" general purpose box.** The output is carousel
  angles or it is nothing.

### The biggest thing here was a bug in the FREE path

13.2 said subtitle stripping "belongs in `longform.ts`". It was worse than
missing: `.srt` and `.vtt` were **actively mangled**, and by the deterministic
path that needs no key and no account. `TIMESTAMP` matches only the head of a
cue line, so a real SubRip file came out as

```
"1 ,000 --> 00:00:04,000 Cutting on the beat makes your edits feel mechanical."
```

sequence number, millisecond remainder and arrow included, and that went onto a
slide. Anybody who had pasted subtitles into Repurpose got that. Fixed with
`stripCues`, plus WebVTT's header, its `NOTE` blocks and its inline `<v Speaker>`
markup, plus collapsing the duplicate consecutive lines that rolling captions
produce and which otherwise triple the source.

**`shapeOf` had to decide before the cues were stripped**, which is the
non-obvious half. Afterwards there is nothing left to recognise a subtitle file
by: the timestamps that made it a transcript are exactly what was removed. Left
to the counting it came back "prose", and the prose path groups on blank lines,
which a stripped subtitle file has none of. An hour of speech then arrived as one
paragraph and one candidate.

### What else the plan got wrong

**`Repurpose.tsx` already WAS the "start from something you have" screen.**
13.2's "new entry on the start screen" has existed since Batch 6, with a paste
box and a candidate picker. So the raw path is a **mode inside Repurpose**, which
is a better answer than the plan's anyway: 13.3's "one question in plain words"
is right there above the box, and the two readings are visibly alternatives
rather than two doors on a menu.

**The caching claim in 13.4 was half wrong.** "No prefix to cache because the
source is the request" is true of the source and not of the system block, which
caches exactly as the other five routes do. The limit stands, because input
tokens dominate either way, but the reasoning in the file says the accurate
thing.

### Verifying quotes needed two things the plan did not mention

**`plainText` must not run on a quote.** It turns em dashes into commas
everywhere else in this codebase, and a quote it had cleaned would then fail its
own check against a source that does contain the dash. It is the one text in the
product whose entire value is being unaltered.

**Curly apostrophes would have rejected nearly everything.** A pasted source and
a model's output differ constantly on quote marks, dashes and whitespace without
either meaning anything different. `canonical` folds those and nothing else.
**That is not fuzzy matching**: every pair it folds is the same character wearing
a different code point. Anything still unmatched is dropped, as 13.5 says.

**Matched strictly, deduplicated loosely.** The same sentence returned twice,
once with a trailing full stop, passes the match both times and would show two
cards saying the same thing. The dedup key drops punctuation; the match key never
does.

### The live run

`npm run eval:draft -- --distil` on a multi-thread transcript returned **four
angles about genuinely different things** (why beat-cutting fails, the note that
halves revision rounds, retainer pricing, gear mattering least), and five quotes
of which five verified. A planted near-miss, one word changed from "snare" to
"drum", was dropped by the same function the route uses.

Worth noting honestly: the source was 1,651 characters rather than 13.3's 6,000
words, and every quote the model returned happened to be genuine, so the drop
path was exercised by the planted quote rather than by real output.

---

## Batch 14, A voice it works out for itself

**Status:** done
**Size:** medium
**Why here:** Batch 10 shipped brand voice and it works, but it asks somebody to
sit down and paste three posts into a form before they get anything. Almost
nobody will. Meanwhile the product is sitting on a folder of carousels that
person already wrote, which is a better sample than anything they would have
pasted.

### What exists today

`Brand.voice` is `{ tone?, samples?, avoid? }`, stored as one `jsonb` column, all
optional. `voiceOf` reads it from a deck's `styleId`, `contextVoice` infers it for
a deck that does not exist yet and refuses to guess between several brands.
`VoiceEditor` in `Brands.tsx` is three plain fields.

The machinery is right. The input is the problem.

### 14.1 Learn from what they already made

`/api/voice/learn`.

**The request:** `{ decks: string[][], existing?: Voice }`, where each entry is
one carousel's slide texts. Ceiling: 12 decks, 20,000 characters total.

**The return:**

```
{
  tone: string,
  avoid: string[],
  observed: [ { trait: string, evidence: string } ]
}
```

**`observed` is the part that matters.** A model that says "your tone is direct
and punchy" has told somebody nothing they can check. Each trait comes with a
line from their own decks that demonstrates it, so the whole thing is auditable
in ten seconds rather than accepted on faith.

**It does not return `samples`.** Samples stay the user's own choice, because
they are the highest-weight part of the prompt and picking three posts is a
judgement about which of your work represents you. A machine choosing those is
the machine deciding what you sound like.

### 14.2 What the user sees

In `Brands.tsx`, above the voice fields: **"Learn from my carousels"**, with a
count ("from your 14 saved carousels"). Disabled with an explanation below three
decks, because a voice derived from one carousel is a description of one
carousel.

Pressing it does not write anything. It opens a review panel:

- The proposed `tone`, in an editable field
- Each `observed` trait as a row: the trait, and the quoted evidence under it,
  with a checkbox
- The proposed `avoid` list as removable chips

**Nothing is applied until "Use this" is pressed**, and unchecking a trait
removes it from the tone that gets written. A voice somebody disagrees with is
worse than no voice, which is already the stated rule in `contextVoice`, and that
rule applies just as much to a voice we generated as to one we guessed at.

If a voice already exists, the panel shows the current value beside the proposed
one and "Use this" says "Replace". No silent overwrite.

### 14.3 The honest limits, stated in the UI

Two lines under the button, because both are true and both will otherwise be
discovered as disappointments:

- It reads carousels, which are short-form and structured. Somebody's newsletter
  voice is a different voice.
- It reads what they have saved here, which for a new account is whatever the AI
  drafted for them. **Learning your voice from a model's output is a loop**, and
  the button says so when most of the source decks were AI-drafted and unedited.

That last one needs a real signal, not a guess: `markEdited` already knows which
layers a person has touched. A deck with no hand edits is a deck the model wrote.

**Done when:** an account whose decks are all unedited AI drafts sees the warning,
and an account with hand-written decks does not.

### 14.4 Model and limits

`claude-sonnet-5`. Reading twelve decks and characterising a voice is a reasoning
task and the output is short.

`VOICE_LEARNS_PER_HOUR = 10`. Nobody needs to do this twice in an afternoon.

### What this batch deliberately does not do

- **No automatic application, ever.** See 14.2.
- **No voice scoring.** "Your carousel is 73% on-brand" is the virality score
  with a new label.
- **No cross-account learning.** One person's voice is derived from one person's
  decks, full stop.

### The plan was accurate, which has not happened before

Nothing in it was already built, stale or blocked. `handEditedCount` already
existed in `regenerate.ts`, so 14.3's signal needed no new plumbing.

### The decision the plan did not make: which decks

`Brands.tsx` edits one brand at a time, and `DocSummary.styleId` carries
`brand:<id>`, so a brand's own decks are identifiable. Learning Brand A's voice
from Brand B's decks would be straightforwardly wrong.

But strict filtering usually returns nothing: most people have one brand, and
everything made before that brand existed carries a stock style. So `pickDecks`
**prefers this brand's decks when there are at least three, and falls back to
everything otherwise, and the panel says which happened.** Silently reading the
wrong decks is the failure to avoid; silently reading none is the failure that
makes the button look broken.

### The AI-loop warning, and its honest limit

`mostlyDrafted` warns when **more than half** the source decks have zero hand
edits. Generous and simple on purpose: a threshold anybody can explain in one
line beats a cleverer one that cannot be reasoned about from the warning it
produces.

The limit, which the interface states rather than hides: `markEdited` fires on
CANVAS edits. Somebody who writes everything in the compose screen and never
touches a layer has no hand edits either, so this over-warns for them. Over is
the right direction for a warning about a feedback loop, and the line says so.

### Added, and not in the plan: the evidence is verified

14.1 says each trait comes with "a line from their own decks", and the whole
value is that it is auditable. **A model that paraphrases the evidence produces a
panel that LOOKS auditable and is not**, which is worse than one with no evidence
at all because it invites the trust it has not earned.

So every evidence line is checked against the decks, and a trait whose evidence
does not survive is **dropped as a pair**. A trait shown without its line is
precisely the unfalsifiable claim the feature exists to avoid, so losing the
evidence has to lose the trait.

This is the same job Batch 13's quotes needed, so `verbatimOnly` and `canonical`
moved out of `distil.ts` into `server/verbatim.ts` rather than being written
twice.

### What cannot be verified, and is therefore removable

**`avoid` is the one unverifiable field**, by definition: the words are absent
from the decks, so there is nothing to match against. A live run returned
"maybe, I think, could, just, really", which is a defensible reading of an
instructional voice and is still a claim nobody can check. The chips are
individually removable, which is the mitigation, and nothing about this list
reaches a prompt until somebody presses Use.

### The live run

`npm run eval:draft -- --voice` on four decks written in one deliberate voice
returned **six traits, all six with evidence that verified**, and none of them
the empty adjectives the prompt rules out:

| Trait | Its evidence |
| --- | --- |
| Opens with a blunt diagnostic naming the reader's problem | "Your edits feel mechanical. Here is why." |
| Clipped fragments with no main verb, one idea per line | "A hand leaving frame. A door closing." |
| A one or two word command as a standalone closing line | "Fix the cuts first." |

A planted near-miss, "shot" for "frame", was dropped with its trait.

---

## Batch 15, Checks before it reaches the canvas

**Status:** done
**Size:** medium
**Why here:** by the end of Batch 14 there are six routes that put model output
in front of a customer and exactly one thing checking any of it: a script
somebody runs by hand. `scripts/eval-draft.mjs` already found two real defects
before they shipped, which is the argument for running its checks where they
actually matter.

### What exists today

`eval-draft.mjs` checks structural properties and costs real money per run, so it
is deliberately outside `npm test`. It checks: slot count, empty slides, hook over
90, body over 220, placeholders, unknown slot ids, duplicate slides, dashes, and
measurements absent from the brief.

`plainText` in `prompts.ts` is the only check that runs on every response, and it
only strips punctuation.

### 15.1 The checks move to the server, and the cheap ones become guarantees

Three tiers, and the difference between them is the whole design:

| Tier | What happens | Examples |
| --- | --- | --- |
| **Repair** | fixed silently, always | em dashes, smart quotes, trailing whitespace, doubled spaces |
| **Retry** | one retry with the failure named in the prompt, then pass through with a flag | empty slide, placeholder text, hook over ceiling, duplicate adjacent slides |
| **Flag** | passed through, surfaced in the UI | a measurement absent from the brief, a claim the source does not contain |

**Why retry and not refuse:** a refused draft leaves somebody with nothing after
fifteen seconds of waiting, and the failure is usually a single slide. One retry
costs one call and fixes most of it.

**Why one retry and not three:** the retry policy in `anthropic.ts` already says
it, two layers of retry on a paid call is how one failure becomes four charges.

**Why flag and not block for fabrication:** because the check cannot be certain.
A number absent from the brief is usually invented and occasionally correct, and
a product that deletes a customer's correct number is worse than one that points
at it.

### 15.2 What the user sees

Nothing at all, in the common case. Repairs are silent and retries are invisible
inside a call that was already going to take a few seconds.

When something is flagged, the affected slide gets a small amber dot in the
filmstrip and, in the compose screen, a line under the field: "This number is not
in your brief. Check it." with the number highlighted.

**It is a note, not a modal, not a blocking dialog, and it never prevents
generation.** The finding is information the person can act on, and they know
things the brief does not contain.

Dismissing a flag is one click and it stays dismissed for that slide.

### 15.3 The same checks run in the test suite, for free

The properties become pure functions in a new `server/checks.ts`, which means
`checks.test.ts` can cover every rule with no API key and no cost. The paid eval
script then imports the same functions rather than keeping its own copy, which
closes the gap where the script's checks and the server's checks drift apart and
nobody notices.

**This is the actual win of the batch**: the checks stop being a thing somebody
remembers to run and become a thing that cannot be skipped, at no per-run cost.

**Done when:** `eval-draft.mjs` contains no check logic of its own, only calls
into `checks.ts`, and `checks.test.ts` covers every rule without a key.

### 15.4 A record of what was flagged

Not analytics on users. A rolling in-memory count per route of how often each
check fires, exposed on `/api/health` behind the same conditions as the rest of
it.

The reason is narrow and specific: **a prompt edit that makes fabrication twice
as likely is invisible today.** If the flag rate for "measurement not in brief"
doubles after a prompt change, that is worth seeing, and it costs nothing to
count.

In memory, not in the database, because it is an operational signal about the
prompts and not a fact about any customer.

### What this batch deliberately does not do

- **No quality score.** Every check is a defect that anybody would recognise as
  a defect. Nothing here judges whether the writing is good.
- **No blocking on a flag.** See 15.2.
- **No per-user record of what was flagged.** See 15.4.
- **No automated prompt tuning.** A loop that edits its own prompts against a
  metric is how a product drifts somewhere nobody chose.

### The filmstrip dot in 15.2 was not built, and should not be

A finding is derived FROM the brief, and the brief does not survive onto a `Doc`.
That leaves two ways to show a dot in the filmstrip and both are worse than not
showing one:

- **Store the findings on the Doc.** They then outlive the edit that fixes them.
  Correct the invented number and the dot still says it is invented. A warning
  that lies is worse than no warning, and this one would start lying seconds
  after being acted on.
- **Store the brief on the Doc** so findings can be recomputed. New permanent
  state, derived-data-adjacent, kept forever for something needed for ninety
  seconds.

**Compose is where the finding is both true and actionable.** The brief is in
scope, the text is editable in front of you, and the note is recomputed against
the field as it is typed, so fixing the number makes it disappear. That is the
whole of 15.2's value without the half that goes stale.

### The retry cap, which 15.1 half-spots

`callModel` already retries, for transport failures. A content retry wrapped
naively around it gives **two times two calls**, which is precisely what the
comment in `anthropic.ts` warns about: two layers of retry on a paid call is how
one failure becomes four charges.

`withContentRetry` calls `run` at most twice, whatever happens, and a test
asserts it. It also **keeps whichever answer is better rather than whichever came
second**, because a retry usually improves things and occasionally does not, and
there is no reason to prefer the later one when more is wrong with it.

Two smaller decisions worth recording:

- **Repair runs before checking**, so a ceiling is measured on the text that will
  actually ship rather than on one still carrying punctuation this product
  removes.
- **The previous answer travels with the retry note.** The note says "Item 4",
  and that means nothing to a model which cannot see what item 4 was.

### What reaches the browser, and what does not

Only the `flag` tier. A retry finding is about an answer that has already been
replaced or accepted, and telling somebody "slide 4 was empty" about a slide that
is no longer empty is noise.

### Two routes gained checks they were never going to get

15.1's table is about drafting, but `/api/distil` and `/api/voice/learn` had
nothing checking them at all. Rather than leave the script holding rules the
server does not run, both now have `checkDistil` and `checkVoice`, counted like
everything else. `checkVoice` includes the empty-adjective rule, so "direct and
punchy" is caught in production and not only on the days somebody runs the eval.

### What is left in the eval script, and why

15.3's "done when" is satisfied: every rule about a RESPONSE is imported. Three
things remain and each is a different kind of thing:

| Line | What it is |
| --- | --- |
| every hashtag generic | about the FILTER, not the answer. A fact about the prompt. |
| planted quote and planted trait survived | eval-only probes OF the verifier, not checks on a response. |
| traits whose evidence was not real | measures how often the model paraphrases. The route drops these, so production never sees them to count. |

---

## Batch 16, Bulk creation that is worth using

**Status:** done
**Size:** large
**Why here:** the current bulk create asks somebody to paste a carousel they have
already written, separated by `---`. That is a text importer wearing the name of
a feature. The thing anybody actually wants is to hand over a few ideas and get
a fortnight of carousels back, each on a different angle, scheduled.

### 16.1 Delete the one that is there, but not all of it

`BulkCreate.tsx` (274 lines) and `BatchReview.tsx`, which is reachable from
nowhere else, both go. `App.tsx` loses the `bulk` view.

**`bulk.ts` does not go**, and this is the thing to get right before deleting
anything. `buildDocs` is what `Repurpose` builds through, and `BulkBlock` is
`longform.ts`'s output type. Those two stay. What dies with the panel is the
paste-parsing half: `parseBulk`, `readBulk`, `SEPARATOR`, `SAMPLE_BULK`,
`countSlides`, `hookOf`, `payoffOf`, `setHook`, `setPayoff`, `BulkSource`.
`bulk.test.ts` trims to what survives.

**Done when:** `npm run build` passes with no reference to the paste separator
anywhere, and Repurpose still builds a carousel.

### 16.2 The run sheet, which is pure and therefore testable

The whole plan is decided before a single call is made: how many carousels, from
which idea, in which style. That is arithmetic, and it belongs in a pure module
where it can be proved rather than in a component where it can be watched.

`src/studio/run.ts`:

```
type Step = { n: number; idea: string; ideaIndex: number; styleId: string };
function planRun(ideas: string[], count: number, styleIds: string[]): Step[]
```

**Ideas cycle.** Nine carousels from three ideas is 1, 2, 3, 1, 2, 3, 1, 2, 3,
which is what somebody means by "alternate them all". Not three of idea one then
three of idea two: the point of cycling is that consecutive carousels are about
different things, so a run that stalls halfway still leaves a usable spread
rather than everything about one idea.

**Styles alternate independently.** One style means every carousel gets it. Two
means step one, step two, step one, and because the two cycles have different
lengths the pairing varies, which is the point.

**3 to 14.** Below three this is the ordinary single-carousel flow with extra
clicks. Above fourteen the run takes long enough that somebody walks away, and a
14-carousel run is already a fortnight of posting.

**Done when:** `planRun(["a","b","c"], 9, ["x"])` gives idea indexes
`0,1,2,0,1,2,0,1,2`, and with two styles the style ids alternate.

### 16.3 Search depth, and a roadmap decision being reversed deliberately

With "search depth" on, each carousel gets an angle researched from the live web
rather than invented from the idea alone.

**Batch 13 rejected URL fetching**, and the reason still stands: *"somebody
else's page is somebody else's content, fetching it server-side makes us the one
requesting it."* That rejection was about **us** running the fetch.

**Anthropic's `web_search` server tool is a different thing.** It runs on
Anthropic's infrastructure, on the existing `ANTHROPIC_API_KEY`: no second
vendor, no second key, no scraper of ours pointed at anybody's site, and results
arrive with citations attached. That is what makes this a deliberate revisit
rather than drift, and it is the only reason this part of the batch is
buildable at all.

Two facts that shape the design:

- The tool type is `web_search_20260209` on Sonnet 5 and the Opus 5 family. **No
  beta header.** Older models take the basic `web_search_20250305` variant.
- **A web search error returns HTTP 200**, with a `web_search_tool_result` block
  whose `content` is an error OBJECT where a success is an ARRAY. Branching on
  that before indexing is the difference between a handled failure and a crash
  inside a fourteen-step run.

`/api/angles`: `{ idea, count, voice? }` in, and out a list of
`{ title, angle, brief, sources: [{ title, url }] }`.

**Reddit and YouTube are not scraped.** Reddit blocked every research pass in
this project's own evidence caveats, and YouTube needs its own key and quota.
What the search tool finds on those sites, it finds; what it does not, it does
not, and the sources list says which.

**Search costs money per search, on top of tokens.** That has to be visible,
which is what 16.5 is for.

**Done when:** a run with search depth on produces carousels whose angles carry
at least one source URL each, and search failing on step 4 does not stop steps
5 to 14.

### 16.4 One at a time, and visibly

A stepped screen, not a spinner and a wait:

- Which step is running, out of how many
- A percentage, and it is real: steps finished over steps planned
- The idea and style this step is using
- Tokens used so far
- Each carousel appearing in a list as it finishes, **openable immediately**

**Sequential, not parallel**, and that is a decision rather than laziness.
Fourteen calls at once would be faster and would also make the progress
meaningless, make the token count arrive in one lump at the end, and turn one
failure into a half-finished set with no way to say which half. One at a time
means a run can be watched, stopped, and resumed from where it stopped.

**A failed step does not end the run.** It is marked, the run continues, and the
step can be retried on its own afterwards. Fourteen carousels lost to one 429 is
the failure mode this shape exists to avoid.

**Each carousel is saved as it completes**, so closing the tab halfway leaves
seven real carousels rather than nothing.

**Done when:** a 5-carousel run shows a moving percentage, lists each carousel as
it lands, and a deliberately failed step 3 leaves 4 usable carousels and a
retry.

### 16.5 Tokens used, stated honestly

`response.usage` already carries `input_tokens`, `output_tokens`,
`cache_creation_input_tokens` and `cache_read_input_tokens`, and `logUsage` in
`anthropic.ts` already reads them. They are logged server-side and never
reach the browser; this returns them per call and the run accumulates.

Two honesties the interface has to keep:

- **Tokens are not money.** Six models at four prices are in play across a run,
  and a token count converted to dollars by the browser would be a number this
  product cannot stand behind. It says tokens.
- **Web search bills separately**, per search, and is not in the token count. The
  interface says how many searches ran alongside the token total rather than
  quietly folding one into the other.

This is not metering. Invariant 7 stands: nothing counts down, nothing is
refused for being over, and the number is there because somebody running
fourteen carousels deserves to know what it cost, not to be limited by it.

**Done when:** the run shows a token total that grows per step and a search
count kept separate from it.

### 16.6 Scheduled, because a fortnight of carousels needs dates

`postFromDoc(doc, platform)` and `schedule(post, whenISO)` already exist, and
`makeSeries` already numbers a set in order. This is mostly wiring.

A cadence on the run sheet: start date, every N days, platform. Each finished
carousel becomes a `Post` at stage `scheduled`, dated, and numbered as a series
in run order, which is the order the ideas cycled in.

**Scheduling is optional and off by default.** A run that just makes fourteen
carousels is a legitimate use, and a product that silently fills somebody's
calendar has made a decision for them.

**Done when:** a scheduled 9-carousel run appears in the pipeline as 9 posts on
9 dates, and an unscheduled run creates no posts at all.

### What this batch deliberately does not do

- **No auto-posting.** Already rejected on evidence and unchanged by any of this.
- **No parallel generation.** See 16.4.
- **No scraping Reddit or YouTube ourselves.** See 16.3.
- **No dollar figure.** See 16.5.
- **No credits, no limits.** The 3 to 14 range is about how long somebody will
  watch a screen, not about rationing. Invariant 7.

### What the build found

**Research is per IDEA, not per carousel**, which the plan did not say and which
changes the cost by an order of magnitude. Three ideas is three searched calls
whatever the run length. Asking per carousel would cost fourteen searches and
still produce overlapping angles, because each call would have no idea what the
others had chosen. A live run on one idea took 39 seconds, ran 4 searches and
returned 34 sources.

**Without search, the do-not-repeat mechanism was a no-op that looked like it
worked.** `usedHooks` was being read from `steps`, which inside the run loop is
the closure from before the run started: every entry still "waiting", every hook
still absent. So it returned nothing on every step and three carousels from one
idea would have come back as three versions of one carousel, exactly the failure
the mechanism exists to prevent. The used hooks are now tracked in a local map,
which is the value that actually changes as the run goes.

**`bulk.ts` could not be deleted, as the plan said, and the reason is worth
keeping.** `buildDocs` is what `Repurpose` builds through and `BulkBlock` is
`longform.ts`'s output type. The paste-parsing half went: `parseBulk`,
`readBulk`, `SEPARATOR`, `SAMPLE_BULK`, `countSlides`, and the four
hook/payoff helpers. `BatchReview` was reachable from `BulkCreate` alone and
went with it.

**Posts are written in one go rather than appended.** The pipeline store is a
whole-list read and write, so adding nine posts one at a time would rewrite the
file nine times and lose anything another tab wrote in between.

### The web search decision, in practice

`web_search_20260209`, no beta header, on the key this product already holds. No
second vendor and no crawler of ours. What came back on "short-form video
editors undercharging" was three angles each grounded in a specific finding, with
34 real source URLs.

**The error shape is the thing to know.** A failed search returns HTTP 200 with
`content` as an error OBJECT where a success is an ARRAY. `sourcesFrom` branches
on that before indexing, and `angles.test.ts` covers it, because inside a
fourteen-step run the difference is a step that found nothing versus a crash
that ends the batch.

**Research failing does not end a run.** A search that fails on one idea leaves
that idea drafted from its own words, rather than stopping before a single
carousel exists.

## Batches 17 onward, how to read this

This is the second half of the plan of record: seventeen new batches, 17 to 33, that
pick up where Batch 16 stopped. Batches 1 to 16 are done and are not repeated here.
Every item below either builds on something they shipped or says plainly why it
cannot.

The format is the same as the first half, so `/next-batch` can keep working through
it unchanged:

- **Status, Size, Why here** at the top of each batch.
- Numbered items with **What**, **Why** and **Done when**.
- An **Invariant check** wherever an item comes near one of the seven rules in
  `CLAUDE.md`.
- **What this batch deliberately does not do** at the foot.
- A **Built as** section is left for whoever builds it, because every batch in the
  first half found something the plan got wrong, and this half will too.

**One difference in how this half was written.** The first sixteen batches were
planned against the code. This half was planned against the roadmap that describes
the code, not the code itself. Where an item depends on something the roadmap does
not settle (whether a calendar view exists, what `platforms.ts` currently lists, how
`compositions.ts` exposes its catalogue), it says so as an **Unknown** at the top of
the batch. Resolve those against the repo before starting, the same way Batch 9
started with an audit.

The request this half answers is three things at once: a product where the user can
**make anything a carousel needs** without leaving, **extreme time saving** on the
parts that actually cost time, and **many presets**. Those pull in different
directions, and the frame below is how they are reconciled.

---

## The frame for the second half

**Batches 1 to 16 removed the reasons to choose PostNitro. Batches 17 to 23 remove
the reasons to open Canva for a single slide. Batches 24 to 29 are the time saving
nobody else has. Batches 30 to 33 are the long tail.**

The first half's test still holds and gets one more clause. The competitor that
matters is still PostNitro, and as of October 2026 it turns a topic, pasted text or
a URL into carousels, supports more than thirteen languages, and ships a REST API
plus an embeddable SDK. FlashCC already answers most of that list on its own terms.
What it does not answer yet is the moment somebody needs a chart, a comparison
table, a photo with the background removed, or a slide that reads as one image
across three swipes, and leaves for Canva to make it. Every time that happens, the
batch at post three or four breaks a little earlier.

### The test every item in this half must pass

> **It removes a decision or a click from an 8 to 15 carousel session, or it makes
> something possible that currently forces leaving the app.** If it does neither, it
> is a menu item, and it does not go in.

### Many presets, few buttons

The product thesis is that fewer buttons is what makes FlashCC good. "Many presets"
sounds like the opposite, and done badly it is: a gallery of 300 layouts is Canva's
problem, and the first half already rejected template count on evidence ("too many
identical templates already exist").

The resolution is a rule about where presets live:

- **A preset is a default, not a menu.** It is chosen by the context it appears in
  (the slot, the framework, the platform, the brand) and shown as the one sensible
  answer, with alternatives one keystroke away rather than all on screen.
- **Cycling beats browsing.** "Next layout" on a selected slide walks the compatible
  options one at a time. Nobody scrolls a grid.
- **A preset must encode a decision a person would otherwise make by hand.** A hook
  formula, a CTA that matches the goal, a type ramp that already passes the legibility
  check. A preset that only offers another colour is not one.
- **Every preset runs once and leaves plain layers.** That is the existing invariant,
  and it is what keeps a large preset library from turning into a live template
  system.

### Marketed as a time saver, not as AI

FlashCC is sold as a time saver for the user's own creativity, not as an AI tool.
That shapes this half directly. **Every AI feature below has a deterministic half
that works with no key and no account**, the same way `longform.ts` sits beside
`/api/distil` and `captionOf` sits beside `/api/caption`. Where an item has no
sensible deterministic half, it says so, and it is gated on Pro like every other
route that spends money.

### Invariants carried forward

| Rule | What it means for this half | Where it bites hardest |
| --- | --- | --- |
| Presets run once, nothing is derived | Layouts, blocks, furniture, templates and translations all write plain layers and keep no binding | 18, 20, 23, 25, 29 |
| 5. AI writes words, never layout | No model chooses a block, an image, a colour or a position | 19, 21, 25, 29 |
| 6. Approvers are free and unlimited | Nothing in client work gains a seat price | 31 |
| 7. Nothing is metered | Video export and stock search get abuse ceilings, never credits | 21, 26 |
| Every route returns words | New routes return strings or structured words, never geometry | 19, 28, 29 |
| Nothing is ranked or scored | Remixing a winner sorts by the user's own numbers, never by a model's opinion | 28 |

### The pattern this half leans on: stamp and reseal

Several items here look like they need a live binding: page numbers that follow a
reorder, a footer on every slide, a template whose change reaches every deck made
from it. The first half already solved this shape twice, with `stampLogo` (Batch 5)
and the series reseal on delete (Batch 6). The answer is the same each time.

1. **Stamp:** a one-shot function writes ordinary layers, tagged with a stable role so
   a later pass can find them.
2. **Reseal:** a second one-shot function runs at an existing mutation funnel (reorder,
   insert, delete, format change) and rewrites only the stamped layers, never anything
   hand-edited.
3. **Idempotent:** running either twice produces the same document, and a test asserts
   it.

That is not derivation. Nothing is computed at render time and nothing reads from
anywhere but the document. It is the same funnel discipline `markEdited` already
follows, applied to more things.

---

## Batch 17, Every format people actually post to

**Status:** done
**Size:** small to medium. Mostly data, plus one real feature in 17.5.
**Why first:** the format list was set in Batch 1 and Instagram changed underneath
it. Since January 2025 the profile grid shows tall 3:4 tiles, and since May 2025
Instagram accepts 3:4 uploads (1080x1440) for single photos and carousels. FlashCC
exports 4:5, 1:1 and 9:16, so the most valuable Instagram size in 2026 is the one it
cannot make. Same damage-to-effort shape as Batch 1.

**Unknowns:** what `platforms.ts` lists today, and whether Batch 9's `MY = 140`
Instagram inset was computed for a square grid crop or a 3:4 one. If the former, the
inset is now wrong for every Instagram deck.

### 17.1 Instagram 3:4

**What:** a 1080x1440 format, added to the switcher, the Instagram platform preset,
`reflow.ts` and `safearea.ts`.

**Why:** a 3:4 upload is the only size the profile grid shows without a crop, and it
takes more vertical feed space than 4:5. A rival already ships 1080x1440 as a named
option. Size guides disagree on whether the feed itself displays 3:4 uncropped or
caps at 4:5, which is exactly why this needs checking on a real account rather than
trusting either.

**Landmine:** if 3:4 becomes the Instagram default, every existing 4:5 deck is
suddenly "the wrong size" in the pre-flight. It should not be. 4:5 stays valid and
silent; 3:4 is offered, not imposed.

**Done when:** a 4:5 deck switches to 3:4 through the existing reflow with zero
safe-zone warnings, and a 3:4 slide posted to a test account shows uncropped in both
the feed and the grid.

### 17.2 The rest of the platform list

**What:** presets for the destinations people cross-post the same carousel to. Each
row carries ratio, pixel size, item ceiling, preferred file type and a **last
verified** date.

| Destination | Shape | Item ceiling | Note |
| --- | --- | --- | --- |
| Instagram | 4:5 1080x1350, 3:4 1080x1440, 1:1 | 20 in app, 10 through the Graph API | already in Batch 1, ratio list grows |
| Threads | 4:5 1080x1350 | 20 in app since late 2024; schedulers report 10 through the API | same split as Instagram, so the pre-flight must say which one applies |
| LinkedIn | any ratio, as one PDF | 300 pages | unchanged; JPG rule from 1.1 stands |
| TikTok photo mode | 9:16 1080x1920 | 35 | unchanged |
| X | 4 images per post | 4 | see 17.3 |
| Pinterest | 2:3 1000x1500 | 2 to 5 per carousel (approximate, verify) | taller than anything else on this list |
| Bluesky | 4 images per post | 4 (approximate, verify) | behaves like X |
| Facebook | 4:5 or 1:1 multi-photo | verify | lowest priority, mostly reached through schedulers |

**Rule for the table:** a row with no verified date does not ship as a named preset.
Unverified numbers from size-guide blogs are how Batch 1's Instagram ceiling nearly
shipped wrong.

**Done when:** every shipped row has a verified date, and `npm run check:schema`'s
sibling, `check:platforms`, prints any row older than 180 days as a warning (not a
failing test, because a test that fails on the calendar is a test people learn to
ignore).

### 17.3 Decks that do not fit in one post

**What:** for destinations capped at 4 images (X, Bluesky), split a deck into a
numbered thread of posts, 4 slides each, and export one folder per post with the
post order in the file names.

**Why:** a 10-slide carousel on X today means the user splits it by hand and guesses
where the breaks go. The split is arithmetic plus one rule: never strand the CTA
slide alone in the last post. If the remainder is 1, move a slide back so the last
post has 2.

**Done when:** a 10-slide deck exports as posts of 4, 4 and 2, never 4, 4, 1, 1, and
the caption route can be asked for one short line per post.

### 17.4 Pinterest is a different shape, not a different size

**What:** 2:3 runs through the same reflow, but Pinterest carousels are short
(single digits) and each pin is discovered on its own. So the Pinterest preset also
proposes **which 5 slides** to keep, by structure only: the hook, the strongest
three body slides by the deck's own slot order, and the CTA.

**Invariant check:** "strongest" is positional, never a model's judgement. Nothing
is ranked. The user sees the five, can swap any of them, and the choice is theirs.

### 17.5 One deck, every destination, one export

**What:** pick several platforms in the export dialog and get one zip with a folder
per destination, each reflowed, safe-zoned and pre-flighted for that platform.

**Why:** the same carousel goes to Instagram, LinkedIn and TikTok in nearly every
workflow in the research, and today that is three format switches, three exports and
three chances to forget the JPG rule.

**The decision to make first:** are the variants documents, or only exports?
**Recommend exports first, documents on request.** A variant that becomes a document
drifts from its source the moment either is edited, which is correct (nothing is
derived) but invisible. So the default is render-only: reflow a copy in memory,
export it, throw the copy away. A **Keep as separate carousel** checkbox per
destination saves it as a real document with a `variantOf` field, used for
findability only and never for syncing.

**Show a contact sheet before writing the zip:** every slide of every destination in
one grid, with each destination's pre-flight result above its column. Reflow is good
and it is not perfect, and a 9:16 slide that reflowed badly should be caught here
rather than after posting.

**Done when:** one 4:5 deck exports to Instagram 3:4, LinkedIn and TikTok in a
single action, three folders, each passing its own pre-flight, with nothing new
saved unless asked.

### 17.6 Grid preview

**What:** an Instagram profile-grid preview showing this deck's cover beside the
covers of the user's last eight **published** FlashCC carousels, at the real tile
ratio.

**Why:** people judge a cover by how it sits next to the others, and today they find
out after posting. Batch 5 already keeps published slides at public URLs, so the
data is there and nothing new is fetched.

### What this batch deliberately does not do

- **No video formats.** That is Batch 26.
- **No posting to any of these.** Unchanged from the first half.
- **No unverified presets.** See 17.2.

### Built as

All six, and both Unknowns resolved against the repo before starting.

**Unknown 1, what `platforms.ts` listed:** LinkedIn, Instagram and TikTok, one size each. It now
holds eight rows in `CANDIDATES`, each with a `shapes` list, a `verified` date and its `sources`.
`PLATFORMS`, what the app offers, is the rows with a date.

**Unknown 2, the Instagram inset, and the plan was right to worry.** It was computed for the
square grid crop: 135px off the top and bottom of a 4:5 cover. The grid has shown 3:4 tiles since
January 2025, so that inset was wrong in both directions. It is now a ratio, `gridAspect: 3/4`,
and `gridCrop` works the box out from the board: a 4:5 cover loses about 34px off each side, a 1:1
cover 135px a side, and 3:4 nothing. `MX = 96` already clears the new crop, so no generated deck
changed.

**17.1 found something the plan did not know: 3:4 is app-only.** Every scheduler API guide checked
says the Instagram Graph API still rejects feed images taller than 4:5. So 3:4 ships as an
Instagram shape marked `api: false`, and the pre-flight says "post this one by hand"
(`app-only-shape`) rather than letting a scheduler bounce it. That is the `appMaxSlides` trap again,
on the other axis. The real-account half of 17.1's done-when (a 3:4 slide showing uncropped in the
feed and grid) cannot be run from here and is still owed.

**17.2, verified against each platform's own documentation on 16 October 2026,** not size-guide
blogs:

| Row | What the docs said | Versus the plan |
| --- | --- | --- |
| Threads | 2 to 20 items, **through the API too** | The plan expected Instagram's 20/10 split. There is none. |
| X | 4 photos a post, 5MB each | As planned |
| Bluesky | `embed.images` caps at 4, 2MB each | As planned. A newer `embed.gallery` lexicon allows 10 (soft), but 4 is what every client renders |
| Pinterest | 2 to 5 images, 1:1 or 2:3 | As planned, and now verified rather than approximate |
| Facebook | nothing official found | Stays in `CANDIDATES` with no date, so it does not ship |

`npm run check:platforms` (via `tsx`) prints the table, warns on any row older than 180 days and
names the unverified ones. It exits 0 every time, as the plan asked.

**17.3** is `postSizes`, `postGroups` and `packing.ts`'s `threadZip`. The rule held: 10 slides are
4, 4, 2 and 9 are 4, 3, 2, asserted for every count to 40. Each post gets a `caption.txt`. The
lines come from each post's first slide with no key (`postLines`), and `/api/caption` takes
`posts` and returns `lines`, read positionally and numbered by the server so a model cannot get
the numbering wrong. X and Bluesky joined `CAPTION_PLATFORMS` with thread-opening rules.

**17.4** is `pickSlides` and `togglePick`: hook, the next body slides in deck order, CTA. Swapping
is a click on the slide numbers, and the pick can never grow past five or drop below Pinterest's
two.

**17.5** went the way the plan recommended: exports first, documents on request. `variantFor`
builds each destination's copy in memory and the contact sheet shows every one with its
pre-flight above it. "Keep as carousel" saves through `keepAsCarousel` with `Doc.variantOf`, and
outside the source's series. One deviation worth knowing: **a deck already a destination's shape
is exported as drawn**, with no safe-area pass, because pulling hand-placed layers clear of the
chrome is the format switch's job on a change of size, not something to do silently at export.

**17.6** is `GridPreview.tsx`: the cover at the grid's 3:4 crop beside the last eight published
Instagram covers, from the public `slides` bucket when signed in and from local copies when not.

### Also added, not in the plan

**Scheduler CSVs stay on LinkedIn, Instagram and TikTok** (`SCHEDULABLE` in `schedulers.ts`). None
of the three dialects has a column for the new destinations: Metricool would have written a row
with every network `FALSE` and ContentStudio would have called it a video. The dialog says so and
the new destinations export as files.

**The safe-zone overlay lists only platforms with something to draw.** Threads, X, Bluesky and
Pinterest have no chrome, and an overlay toggle that shades nothing reads as broken.

---

## Batch 18, Layout tools that act once

**Status:** done
**Size:** medium
**Why here:** "Post-generation editing is the stated churn path" is the strongest
line in the first half's caveats, and the most common hand edit after generation is
moving things until they line up. Today that is done by eye, slide by slide. Every
item here is an editing tool that writes ordinary coordinates and then forgets it
ran.

**Unknowns:** whether the canvas already has snapping, multi-select within a slide,
grouping or a layers list. The Photoshop-model rewrite suggests a layers list
exists. Batch 11 confirmed there is **no multi-slide selection** in the filmstrip.

### 18.1 Smart guides and snapping

**What:** while dragging or resizing, snap to the artboard centre lines, the
composition's margins (`MX`, `MY`), the active platform's safe-zone edges, and the
edges and centres of other layers. Show equal-spacing markers when a layer sits
evenly between two others.

**Why:** it is the single editor behaviour every designer expects and every
non-designer benefits from without knowing its name. It also stops the most common
way a hand-edited slide fails the pre-flight: a layer nudged a few pixels into the
safe zone.

**Invariant check:** snapping is a property of the drag, not of the document.
Nothing about it is stored.

**Done when:** dragging a headline snaps to the safe-zone edge of the active
platform, and holding a modifier key disables all snapping for that drag.

### 18.2 Tidy

**What:** with several layers selected, one action each for align (six directions),
distribute (horizontal, vertical), equal gap, and match width. With nothing
selected, **Tidy slide** reads the layers top to bottom by their current position
and re-spaces them on the composition's own spacing scale.

**Why:** "the spacing never survives the resize" was the first half's diagnosis of
the format switcher. It is equally true of hand editing. Tidy is the button that
undoes ten minutes of nudging.

**Decision:** Tidy slide **never changes reading order** and never resizes text. It
moves boxes. If two layers overlap so that their order is ambiguous, it leaves both
where they are and says so, rather than guessing.

**Done when:** a slide with four uneven gaps becomes four equal gaps from the
spacing scale in one action, and undo restores the exact previous coordinates.

### 18.3 Match across slides

**What:** select a layer, then **Match on every slide**: every layer on the other
slides with the same stamped role (headline, body, number, furniture) takes this
layer's position, size and type size. Optional scope: this slide range only.

**Why:** the documented complaint about AI carousels is "text sizing shifted from
slide to slide with no clear logic". Generation already avoids most of that. Hand
edits reintroduce it, one slide at a time.

**Invariant check:** this is a one-shot copy of numbers, not a style link. Change
the headline on slide 1 afterwards and slide 2 does not follow. That is the point.

**Landmine:** a matched text layer can now overflow on a slide whose words are
longer. Run `fit` and the Batch 4 overflow check over every slide the action touched
and show "2 slides now overflow" with a link to each, rather than silently squashing
them.

**Done when:** matching slide 1's headline across a 9-slide deck leaves every
headline at the same y and size, and any slide that newly overflows is reported by
number.

### 18.4 A spacing scale per composition

**What:** each composition in `compositions.ts` declares the spacing steps it is
built from (for example 16, 24, 40, 64). Tidy and the equal-gap tool use those steps
rather than an arbitrary pixel average.

**Why:** equal gaps of 37px look accidental; equal gaps of 40px look designed. The
compositions already encode a rhythm implicitly. This makes it explicit so the tools
can respect it.

### 18.5 Multi-slide selection in the filmstrip

**What:** shift-click for a range, modifier-click to add or remove, with **delete,
duplicate, move, apply layout, match** acting on the set.

**Why it is in this batch and not in Batch 11:** Batch 11 correctly refused to build
it for rewriting, because each rewrite can invalidate the next. Structural actions
are different: delete, duplicate and move are well defined on a set, and match is
defined on a set by construction.

**Rules that keep it sound:**

- Selection is a set of **slide ids**, not indexes, so a reorder does not change what
  is selected.
- Drag reorder with a multi-selection moves the set as a block, keeping its internal
  order.
- Any action that changes the slide count clears the selection afterwards. Nobody
  should have to guess which slides are still selected after a split.
- Rewrite stays single-slide, for the reason Batch 11 gave.

**Done when:** selecting slides 3 to 6 and duplicating produces 3 to 6 again
directly after slide 6, in order, and the selection is cleared.

### 18.6 Group and lock

**What:** **group** is a `groupId` shared by several layers so they select and move
together. **Lock** is a flag that makes a layer unselectable on the canvas but still
editable from the layers list.

**Decision:** a group is **not a container layer**. A container would need its own
transform, nested coordinates, and a change to reflow, render and export. A shared
tag needs none of those. If somebody later needs rotation of a group as a unit, that
is when to revisit, not before.

**Why lock matters here specifically:** backgrounds. Every user who has tried to
select a headline on a full-bleed image and grabbed the image instead wants this,
and the stamped furniture in Batch 20 should be locked by default.

### What this batch deliberately does not do

- **No auto-layout frames.** A Figma-style frame that re-lays its children on every
  change is live derivation. Reflow (Batch 1), Tidy and Match cover the same need with
  one-shot actions.
- **No nested groups.** See 18.6.
- **No rulers with user guides.** Smart guides cover the need, and user guides are
  state that nobody asks to keep.

### Built as

All six. The Unknowns, resolved against the repo first: **snapping already existed** (artboard
edges and centre, and other layers, Alt to turn it off), **multi-select within a slide already
existed**, **`locked` already existed** with a toggle in the layers list, and there was **no
grouping and no multi-slide selection**. So 18.1 and 18.6 were extensions, not new systems.

**18.1** adds the compositions' margins (`marginLines`, proportional, the way reflow moves them)
and the active platform's safe-box edges as snap lines, equal-spacing markers (`spacingSnap`),
and snapping while resizing (`snapResize`, only the dragged edges). Checked in a real browser: a
headline dropped at y 84 on a LinkedIn deck lands at 80, the safe-zone edge, and with Alt held it
stays at 84.

**18.2** is `tidy.ts`: align six ways, distribute, equal gap, match width, and Tidy slide. Tidy
works in **rows**, not layers: things side by side stay side by side and text stays on its colour
block, which a layer-by-layer stack would have broken. Ambiguity is a **partial** overlap, neither
box containing the other; text sitting inside a block is containment, not ambiguity. The stack
keeps its vertical centre, because every composition centres it. One decision the plan did not
make: **Match width re-measures text** at the new width, the way reflow does, so a narrowed box
gets taller rather than overflowing.

**18.3, "same stamped role" turned out to mean the layer's name plus its kind.** Batch 11 found
roles are not stored, and that is still true. But the compositions stamp every layer with a name
(Title, Heading, Body, Number), and that name is the role in every way that matters here. A
separate `role` field would have brought back the semantic document the rewrite removed, so the
name is used and the kind guards it. A slide with no counterpart, or two, is skipped and named.
Overflow is reported by slide, with a link to each, and nothing is shrunk.

**18.4** gives every composition a `spacing` list read off its own build (the air under a rule,
the heading-to-body gap, `BAND_GAP`, `MX`), and stamps each built slide with
`Slide.composition` so Tidy knows whose steps to use. Hand-made slides get `DEFAULT_SPACING`.

**18.5** is `slideset.ts` plus a picked set in the filmstrip header: Duplicate, Re-lay, Delete,
Clear, and dragging a picked slide moves the set. "Apply layout" from the plan became **Re-lay
the picked slides** (`relaySlides`), since the only layout action that exists today is Re-lay;
it refuses, and says so, when the copy would split into more slides. "Match" on a set lives in
the properties panel, where Match is: with several slides picked it reads "Match on N picked
slides", which is the plan's "this slide range only". Checked in a browser: picking 2 to 4 and
duplicating puts the copies straight after 4 and clears the set.

**18.6** is `Layer.groupId` and `Cmd+G` / `Cmd+Shift+G`. The canvas selects the whole group; **the
layers list selects one member**, which is how to reach a layer inside a group, and the list
marks grouped and locked layers so the difference is visible. Duplicated groups get a group of
their own, or one click would select both copies.

### Also fixed, not in the plan

**Defect D13 from `docs/reference.md`:** the marquee selected locked layers, and once selected a
locked layer could be moved and deleted. The marquee and `Cmd+A` now skip them, which is what
18.6 needed lock to mean.

---

## Batch 19, The block library

**Status:** done
**Size:** large. Many small pieces, each with its own tests.
**Why here:** this is the batch that makes "create everything" true. Today a slide
is headline, body, shapes and images. Every carousel that needs a chart, a
comparison, a checklist with ticks or a code sample is built by hand from
rectangles, or built in another tool and imported as a flat picture that cannot be
edited or re-branded. A block is the missing middle: a preset for **content with a
shape**.

**Unknowns:** how `compositions.ts` exposes its catalogue, and whether a layer can
already carry a role tag beyond `handEdited`. Batch 11 found roles are not stored at
runtime; this batch needs one stamped field per block layer, the same shape as
`stampLogo`'s.

### 19.1 What a block is

A block is a pure function: **fields in, plain layers out**, sized to a box it is given.

```
type Block = {
  id: string;                 // "stat", "checklist", "chart.bar"
  fields: FieldSpec[];        // words and numbers only
  minBox: { w: number; h: number };
  build(fields, box, theme): Layer[];
};
```

- **Fields are words and numbers.** That is what lets a framework slot ask a model to
  fill one without breaking invariant 5.
- **Every emitted layer is stamped** `{ block: id, blockInstance: uuid, part: "label"
  }`, so a later pass can find the block again.
- **The block never measures itself into overflow.** It gets a box, runs the same
  `fit` ladder as everything else, and if the content cannot fit at the 60% floor from
  Batch 4, it reports overflow like any other text. No block shrinks to the floor
  silently.

**Invariant check:** a block runs once. Changing the theme afterwards restyles its
layers through the normal brand re-apply path, because they are ordinary layers.
Nothing reads the block definition at render time.

### 19.2 The library

| Block | Fields | The rule that matters |
| --- | --- | --- |
| Checklist | 3 to 7 items, tick or cross per item | numbering and ticks continue across a slide split (the 4.2 bug, not repeated) |
| Steps | 3 to 6 numbered steps, optional connector | steps never split mid-step; a split moves a whole step |
| Big number | value, label, optional source line | the number is checked by `checks.ts` against the brief, same flag tier as Batch 15 |
| Quote | text, attribution | a quote inserted from Batch 13's verified list carries a `verbatim` flag; editing its words clears the flag |
| Two columns | left label, right label, rows | presets: Do / Don't, Myth / Fact, Before / After, Us / Them, Old way / New way |
| Before and after | two images or two texts, divider | the divider can sit on a slide boundary (see Batch 23) |
| Timeline | 3 to 6 points, each a label and a short line | horizontal on wide boards, vertical on 9:16 |
| Table | up to 4 columns by 6 rows | over that, it proposes a split across slides rather than shrinking |
| Chart | pasted `label, value` lines | see 19.3 |
| Code | code, language | see 19.4 |
| Post card | text, optional image | uses the brand's own identity only (Batch 20), see 19.5 |
| Testimonial | words, name, role | never filled by a model, see 19.5 |
| Annotation | arrow, note, target point on an image | the arrow stays attached to the image region when the image is moved, because both are in one group (18.6) |
| Screen frame | image, frame style (phone, browser, plain card) | generic frames drawn from shapes, no manufacturer outlines or trademarks |
| Screenshot polish | image, padding, corner radius, shadow, backdrop | the most-requested look in tutorial carousels, one action |
| QR code | URL | generated locally, never below the size a phone can scan at feed scale, contrast checked |
| Icon grid | 3 to 6 icons with labels | icons from Batch 21 |
| Question | prompt, 2 to 4 options | for the "which one are you" slides; a closing-slide companion to the CTA |
| Section title | number, title | the "Part 2" divider inside long decks |

**That is nineteen blocks, and the list should stop there until somebody asks for
the twentieth.** Each one is a decision a person makes by hand today. A twentieth
that nobody asked for is a menu item.

### 19.3 Charts, done the boring way

**What:** bar, horizontal bar, line, donut and progress. Data comes from pasted
lines (`Q1, 40`), and the chart is drawn as ordinary shape and text layers, so it
exports through the existing Playwright path with no new renderer.

**Rules, all deterministic and all tested:**

- Bars start at zero. Always.
- At most 8 bars, 12 line points, 6 donut segments. Over that, the block says so
  rather than drawing an unreadable chart.
- Values are labelled directly on the marks. No legend unless there are two series.
- Colours come from the brand's roles, with the accent reserved for the one value the
  user marks as the point.
- No 3D, no gradients on marks, no pie charts with more than three slices disguised as
  donuts.

**Why so strict:** a carousel chart is read in under two seconds at phone size.
Every rule above is one that the first half's legibility evidence already implies.

**Invariant check:** the chart is a snapshot of the numbers pasted. There is no data
source and no refresh. Live data binding was rejected in the first half and stays
rejected.

**Done when:** pasting five lines produces a bar chart that passes the pre-flight at
1080x1350 and 1080x1920, and pasting a negative value draws a bar below a visible
zero line rather than breaking.

### 19.4 Code

**What:** a monospace block with syntax highlighting from a deterministic tokenizer
(no network), a line ceiling per format, and the brand's colours mapped onto a small
fixed set of token roles.

**Landmine:** code is the one text that must never be re-wrapped silently, because a
wrapped line can change meaning in Python or YAML. Over the line width, the block
reports overflow and offers a smaller step on the ladder or a split by lines. It
never soft-wraps.

### 19.5 Two blocks with an honesty rule

**Post card** looks like a social post: avatar, name, handle, text. It is filled
**only from the user's own identity** in the brand (Batch 20) and carries no
platform logo, no verified mark and no engagement numbers. A post card that can be
set to somebody else's name and handle is a fake screenshot generator, and that is
not a feature FlashCC ships.

**Testimonial** is never filled by a model. The draft prompt already forbids
inventing a client or a result (Batch 10's finding), and a testimonial is exactly
that. Framework slots can request a testimonial block; the model leaves it empty
with a placeholder that the pre-flight then catches, so it cannot ship blank by
accident.

### 19.6 Inserting a block

**What:** `/` on an empty canvas area, or the command palette (Batch 24), opens a
short filtered list. The block lands in the largest free rectangle on the slide that
meets its `minBox`, found deterministically. If there is no room, it proposes a new
slide after this one rather than overlapping.

**Done when:** inserting a checklist on a slide that already has a headline places
it under the headline, clear of the safe zone, with no overlap.

### 19.7 Blocks inside frameworks

**What:** a framework slot can name a block. A "results" slot asks for a big number;
a "compare" slot asks for two columns. The model fills the block's fields through
the existing structured output, words and numbers only, and `compositions.ts` places
the block.

**Invariant check:** this is the line invariant 5 draws, and it holds. **The
structure chose the block, not the model.** The model never sees a list of blocks
and never decides which one to use.

### 19.8 Editing a block after it is placed

**What:** selecting any stamped layer offers **Edit as block**, which reopens the
field form. Saving re-runs `build` and replaces only the untouched layers of that
instance, exactly the Batch 4.6 rule, so a hand-recoloured bar survives a data
change.

**Done when:** changing one value in a placed chart redraws the bars, keeps the
user's hand-moved title where they put it, and is one undo step.

### What this batch deliberately does not do

- **No user-authored block definitions.** Saved templates (Batch 25) cover reuse
  without a block authoring language.
- **No chart data from a spreadsheet link.** Paste is enough and keeps nothing live.
- **No AI choosing blocks.** See 19.7.
- **No fake screenshots of real platforms or people.** See 19.5.

### Built as

All eight items and all nineteen blocks, in `blocks.ts` (the library), `blockplace.ts` (placing
and rebuilding) and `BlockPicker.tsx` (the dialog).

**The Unknowns.** `compositions.ts` does not expose a catalogue: its compositions are private
constants, so the block library is its own module and compositions import from it, not the other
way round. And there was no role tag beyond `handEdited`, so this batch added the stamp the plan
asked for, `Layer.block = { block, instance, part }`, plus `Slide.blocks`, the record of each
instance's fields, box and parts.

**The painter needed one new shape.** Donut segments, arrow heads and a QR code's modules cannot be
drawn by rectangles, ellipses and text, so `LayerView` gained a `path` kind (an SVG path stretched
to the layer's box) and an optional soft `shadow`. Still one painter, still one render path to
export.

**19.1, two decisions the plan did not make.** Every block is **one group** (18.6), so it moves as
one thing and the layers list reaches a part. And block text never goes below **20pt**, whatever
the ladder's 60% floor says: TikTok's pre-flight floor is 20, and a block that fails the check the
product runs on it is not a preset. A test asserts no field of any block is a size, a colour or a
position.

**19.2.** All nineteen. The big number answers to the brief through `checks.ts`'s invented-measure
check, the same flag tier as Batch 15. The quote is marked `verbatim` only when its words are
exactly a verified quote, which needed something the plan did not have: **the verified quotes
never reached the editor**, they lived in Compose's screen state and died there. They now ride onto
the document as `Doc.quotes`, the Quote form lists them, and editing the words on the canvas clears
the mark. The icon grid uses the eighteen icons the app already had; Batch 21 brings the rest.

**19.3** as specified, with every rule tested: bars from zero, a negative value below a visible zero
line, labels on the marks, the accent only on the value marked as the point, and the limits per
kind. The done-when passes at 1080x1350 against LinkedIn and at 1080x1920 against TikTok.

**19.4, the code block needed a trick.** Highlighting means different colours inside one line, and
text layers have one colour (styled runs are 22.3). So the block draws **one text layer per token
role**, each holding the whole snippet with every other role's characters replaced by spaces.
Monospace keeps all of them on one character grid whatever the real font's advance is, so nothing
is positioned token by token and nothing can drift. A test asserts no two planes ever put a
character in the same place. Never soft-wrapped: the layers are made wider than the longest line,
and over the box's width the block reports it.

**19.5** as specified. The post card has no name or handle field at all; it reads the deck's own
identity from Batch 20. An empty testimonial says "Their words go here", which the pre-flight now
lists as placeholder copy.

**19.6.** `/` on the canvas and a toolbar button (the command palette is Batch 24). One refinement
found in the browser: on a cover whose headline sits low, the largest free space is ABOVE it, and
the first version put a checklist there. Space **under the headline** is now preferred whenever a
block fits there. No room changes nothing and offers a new slide; a list that overflows offers a
split across two slides, on whole items, numbering carried on.

**19.7, one slot today.** The Showcase and Story `result` slots ask for a big number. The draft
schema gained a required, usually empty `fields` array (an optional one gets filled about half the
time), `fieldsFor` keeps it only where the slot asked, and the fields travel **by slot id**
through Compose, since people add and edit slides there. Two columns waits for a slot that compares
things, which arrives with 25.1's frameworks. The block a slot asked for is marked `slot: true` and
Re-lay rebuilds it from its record; a block the user inserted is theirs and survives regeneration.
Known limit: revising a draft in the chat keeps the first draft's fields.

**19.8** as specified, with one refinement the group made necessary: moving the whole block moves
every part by the same amount, and that is a move of the BLOCK, so the offset most parts share is
found first and applied to the rebuild. Only a part that moved on its own, or was restyled or
retyped, keeps its hand edits.

### Also fixed, not in the plan

**Escape closed the block dialog only some of the time.** Its listener depended on the whole studio
object, the canvas's own Escape handler re-rendered the editor mid-event, and a listener replaced
during dispatch is skipped for that event. It now depends on the stable setter, with a comment
saying why.

---

## Batch 20, Deck furniture and author identity

**Status:** done
**Size:** medium
**Why here:** almost every LinkedIn and Instagram carousel in the research carries
the same furniture on every slide: who made it, which slide this is, and a nudge to
keep swiping. Today that is placed by hand on each slide and re-placed after every
reorder. It is the most repetitive edit in the product and it is entirely
mechanical.

**Unknowns:** none that block. `stampLogo` (Batch 5) is the template for everything
here.

### 20.1 Identity lives on the brand

**What:** `Brand.identity` gains `name`, `role`, `avatar` (an asset id, Batch 5),
`site`, and **a handle per platform**.

**Why per platform:** the same person is `@shortname` on Instagram and their full
name on LinkedIn. A single handle field means every multi-destination export (17.5)
is wrong on at least one of them.

**Invariant check:** this is data on the brand, applied once at stamp time like
colours. Nothing reads it at render.

### 20.2 The furniture kinds

| Piece | What it shows | Default rule |
| --- | --- | --- |
| Author chip | avatar, name, handle | large on the cover, small on body slides, absent on the CTA if the CTA block already shows identity |
| Counter | `3 / 10` or `3` | skips the cover by default, so a 10-slide deck reads 1 to 9 after it |
| Progress bar | a thin bar filling by position | never on the cover |
| Swipe cue | an arrow, optionally a word | every slide except the last, which is the only slide where it is a lie |
| Logo | the existing `stampLogo` mark | unchanged, now one piece of a set |
| Footer line | a URL or a short line | body slides only |

### 20.3 Placement respects the destination

**What:** each piece declares a preferred corner and is placed inside the active
platform's safe area from `safearea.ts`, never inside a chrome zone. On TikTok,
nothing goes in the right rail or the bottom band; on Instagram 3:4, nothing goes
where the grid tile crops.

**Landmine:** furniture and content compete for the same corners. If a corner is
occupied by content when furniture is stamped, the piece moves to its second
preference rather than overlapping, and if no corner is free it is skipped on that
slide and listed in the pre-flight. Furniture never pushes content.

### 20.4 Stamp, then reseal

This is the pattern from the frame, applied for real.

1. **Stamp** writes each piece as ordinary, **locked** layers (18.6), tagged `{
   furniture: "counter" }`.
2. **Reseal** runs at the existing mutation funnels: slide insert, delete, reorder,
   split, merge, format change, and export. It rewrites the text of counters, the width
   of progress bars and the presence of swipe cues, from the deck as it now stands.
3. **Moving a piece keeps its stamp.** Reseal updates the counter's number and leaves
   it where the user put it.
4. **Typing into a piece removes its stamp.** It becomes an ordinary text layer and
   reseal never touches it again. Somebody who typed "Swipe for the secret" into the
   swipe cue has said what they want.

**Done when:** reordering slide 7 to position 2 renumbers every counter, moves the
missing swipe cue to the new last slide, and a test asserts reseal run twice changes
nothing the second time.

### 20.5 Furniture per destination at export

**What:** in a multi-destination export (17.5), reseal runs on each reflowed copy
with that platform's handle and safe area. The Instagram folder says `@handle`; the
LinkedIn PDF says the full name.

**Done when:** one deck exported to Instagram and LinkedIn shows two different
handles, and neither copy's furniture sits inside its platform's chrome.

### 20.6 Six furniture sets

**What:** Minimal (counter only), Creator (author chip and swipe cue), Editorial
(footer line and counter), Corporate (logo, footer, counter), Bold (large progress
bar and chip), and None. Each brand stores which set it uses, so a new carousel
arrives already furnished.

**Why only six:** each set is a coherent decision about how loud the furniture is. A
seventh set would differ from one of these by a corner, and that is what the
per-piece placement controls are for.

### What this batch deliberately does not do

- **No forced "Made with FlashCC" mark on the free tier.** It is a common growth loop
  and it is the opposite of the honest billing promises from Batch 8. An opt-in credit
  line in the Footer piece is fine; a mandatory one is not.
- **No live binding of identity.** Changing your avatar does not reach published
  decks. Re-apply the brand (Batch 3.2) to update a document on purpose.

### Built as

All six, in `furniture.ts`, with the identity on the brand and a Furniture control in Properties.

**20.1.** `Brand.identity`: name, role, avatar (uploaded into the library as an asset), site, and a
handle for Instagram, LinkedIn, TikTok, X, Threads and Bluesky. On the deck it is a **snapshot**,
`Doc.furniture.identity`, so changing the brand does not reach a deck already made.

**20.2.** All six pieces. "Absent on the CTA if the CTA block already shows identity" became: absent
on the last slide when it carries a post card, the one block that shows identity.

**20.3** as specified, with one thing the plan did not mention: furniture text is **measured**, not
estimated. A box a few pixels short wraps a name onto two lines, which the pre-flight treats as
overflow and blocks. The chip is sized for the longest thing it may say on any platform, so a
per-destination reseal can swap the handle without wrapping. A piece with no free corner is left
off and the pre-flight warns (`furniture-skipped`); a chip stamped before anybody added a name says
"Your name", which the pre-flight lists as placeholder copy.

**20.4.** Reseal runs at slide insert, duplicate, delete, reorder (single and set), format change,
and any replaced document (re-lay, a rewrite that splits a slide, a restored version), and at
export. **Deliberately not on an ordinary layer edit**, so a piece somebody deleted is not put
straight back. Typing into a piece swaps its stamp for `furnitureOptOut` at the studio's two edit
funnels. The done-when is a test: after moving slide 7 to position 2, every counter is renumbered,
the old last slide picks up a swipe cue in its new place, the new last slide loses its cue, and a
second reseal returns the same document. Known limit: a chip that stays put keeps its size, so a slide
reordered onto the cover keeps the small chip until the set is stamped again.

**20.5** as specified, inside `variantFor`: the copy is resealed for its platform, and a reflowed
copy's pieces go back to corners in that platform's safe area. The done-when is a test.

**20.6.** Six sets, stored on the brand. New carousels made in a brand arrive furnished, and applying
a brand to a deck (from the studio or the projects grid) furnishes it too. A logo the brand had
already stamped is adopted as the logo piece rather than doubled. Bulk runs use the gallery styles,
not brands, so they arrive bare.

**Furniture is not what a slide says.** Transcripts, captions, alt text and regeneration all skip
it, or a caption would read "3 / 9" and the author's handle nine times.

---

## Batch 21, Imagery, icons and backgrounds

**Status:** done
**Size:** large. Stock search and background removal are each real work.
**Why here:** after blocks, pictures are the second reason somebody leaves for Canva
mid-session. A carousel that needs one icon per tip, a photo behind the cover, or a
product shot with the background cut out cannot be finished in FlashCC today without
an upload from somewhere else.

**Unknowns:** whether an image layer can already carry a focal point, and how large
the client bundle can grow before load time suffers.

### 21.1 Icons, bundled and recoloured

**What:** one or two permissively licensed icon sets (Lucide is ISC, Phosphor and
Tabler are MIT), searchable locally by name and tag, inserted as vector layers in
the brand's colour roles. The index loads on first open of the picker, not with the
app.

**Why:** "one icon per tip" is the most common decoration in educational carousels,
and an icon that does not match the brand colour is the most common thing people go
back to fix.

**Decision: one style per deck by default.** Mixing an outline set with a filled set
on the same carousel is the most visible amateur tell. The picker shows the deck's
current set first and the others behind a switch.

### 21.2 Stock photos through the providers' own APIs

**What:** search Unsplash and Pexels from a picker, with the search proxied through
the server so the keys never reach the browser. Chosen photos land in the asset
library (Batch 5) with their attribution stored beside them.

**Why this is not the Batch 13 rejection:** Batch 13 refused to fetch somebody
else's page. A stock API is an offer, from the owner, to license exactly this use.
That is the line, and it should be written into `CLAUDE.md` so the next feature does
not blur it.

**Landmine, before writing any code:** the two providers' terms differ on
hotlinking, on keeping a copy, on attribution, and on reporting a download. Read
each one's current API guidelines and build to the stricter. It is possible that one
of them does not allow copying the file into a private bucket, in which case the
asset stores a reference and `inline.ts` (Batch 5) fetches it at export time, which
it already knows how to do.

**Invariant check:** an abuse ceiling per account on search, keyed like the others.
Never a quota anybody meets in normal use.

**Done when:** searching "desk" returns photos, choosing one stores it with its
credit, and the credit appears in the caption's first comment suggestion (Batch 12)
when the provider asks for attribution.

### 21.3 Backgrounds that are generated, not downloaded

**What:** a small set of seeded generators drawn from brand colours: gradient mesh,
grain overlay, dot grid, line field, soft blobs, paper texture, geometric tiles. The
seed comes from the deck, the same way Batch 4 derives the composition offset from
the deck's words, so one carousel is consistent and two carousels differ.

**Why:** a plain background on every slide is the second half of the sameness
complaint. A photo on every slide is noise. A generated texture in the brand's own
colours is the cheap middle, and it costs no licence and no network.

**Landmine:** grain and noise compress badly. A grain overlay can push a LinkedIn
JPG past the 2MB ceiling from Batch 1.2. The generator needs a strength cap per
platform, and the pre-flight's file-size check is what proves it.

**Done when:** every generator renders identically in the editor and the Playwright
export, and no generator pushes a 10-slide LinkedIn deck over 2MB at default
strength.

### 21.4 Image tools that stay on the layer

| Tool | What it does | Why it is here |
| --- | --- | --- |
| Focal point | one point per image, set by a click | reflow and every crop keep the subject in frame, which `reflow.ts` currently cannot know |
| Shape mask | circle, rounded, arch, blob, slanted | the most common frame for a face or product |
| Filter presets | duotone in brand colours, mono, high contrast, soft blur | duotone in brand colours makes any stock photo look like it belongs |
| Text scrim | a gradient behind text over an image | the honest fix for unreadable text on photos, see Batch 30 |
| Replace image | swap the picture, keep crop, mask, filter and focal logic | the edit people make most often and currently redo from scratch |

**Invariant check:** each tool writes properties onto the image layer once. A filter
is a stored value rendered by CSS, not a pipeline that re-runs.

### 21.5 Background removal, on the device

**What:** cut a person or product out of a photo, in the browser, with no upload.

**Why on the device:** a customer's product photo should not travel to a third party
for a cut-out, and the free tier stays free because the compute is theirs.

**Landmine:** the most popular in-browser removal library is AGPL licensed, which is
incompatible with a closed commercial product. Check the licence of whatever model
and runtime is chosen before writing the first line. The first run also downloads
model weights in the tens of megabytes, so say so in the button the first time,
rather than showing a spinner that looks broken.

**Done when:** removing the background of a portrait produces a transparent cut-out
that exports with clean edges, and a second removal in the same session starts in
under three seconds.

### 21.6 A palette from an image

**What:** pick any image (a logo, a product, a photo) and get a proposed brand
palette: background, foreground, accent and muted roles, chosen so foreground on
background passes contrast (Batch 30). Deterministic colour quantisation in the
browser.

**Why:** it is the fastest possible way to a usable brand, and Batch 33's onboarding
depends on it.

### 21.7 A different picture for every carousel in a run

**What:** Batch 16's run sheet gains an optional image pool. Images cycle through
the run the same way ideas and styles do, so a 9-carousel run with 3 images gives
each carousel a different cover image in a predictable order.

**Why:** "I tried Canva bulk create but that only gives you one image. I want a
different image for each post" is verbatim evidence from the first half, and the run
sheet is already the place where cycling is decided.

**Done when:** `planRun` with three images and nine carousels assigns image indexes
`0,1,2,0,1,2,0,1,2`, in a pure test.

### What this batch deliberately does not do

- **No AI image generation.** It would be a second vendor, it pushes every customer
  towards the same look, the rights question is unsettled, and FlashCC is not marketed
  as an AI tool. Revisit only on direct demand.
- **No scraping images from links.** The Batch 13 rule stands. Stock APIs are the
  licensed route.
- **No animated stickers or GIFs.** Batch 26 is where motion lives.

### Built as

All seven. Every tool stores a value and CSS paints it; the heavy parts load on first use.

**Unknowns, answered.** An image layer could not carry a focal point; it now does
(`Layer.focal`, painted as `object-position`). The client bundle did not grow: the icon index
(about 470KB gzipped), the ONNX runtime (about 3.7MB gzipped) and the model (4.6MB) are all
dynamic imports reached only from the screen that uses them.

**21.1.** Tabler Icons 3.49 (MIT), 5,184 outline and 1,054 filled, indexed by `npm run build:icons`
into `src/render/iconsets/` and loaded on first open of the picker. An icon is an ordinary `path`
layer that carries its own path data, in the accent, with `scaleStroke` so an outline keeps its
designed weight at any size. One set, two styles: the picker opens on the deck's style
(`deckIconStyle`) with the other behind a switch. The old dozen-glyph dropdown is gone.

**21.2.** Both providers, built to Unsplash's terms because they are the stricter: hotlinked, never
copied (so the photo is a reference and `inline.ts` fetches it at export, as the plan foresaw), the
download endpoint pinged on use, and the credit linked with a referral tag. Keys stay on the server
(`/api/stock`, `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`); with neither set the picker says so. The
credit is stored beside the picture everywhere it goes, and the done-when is a test:
`firstCommentOf` ends with "Photo by NAME on Unsplash (link)", and the transcript is clamped instead
of the credit. Ceiling: 600 searches an hour per account. The line between this and Batch 13 is in
`CLAUDE.md`. One gap: the library entry is local, because the `assets` table needs a bucket path a
hotlink does not have (D29).

**21.3.** Seven generators in `backdrops.ts`, stored per slide as the generated SVG with the seed
and strength recorded beside it, seeded from the deck's words. The strength cap is real: noise
stops at 0.6 on LinkedIn. Measured through the Playwright export, a 10-slide LinkedIn PDF at the cap
is 1.30MB with grain and 0.72MB with paper, so no generator pushes it over 2MB at default strength
or at the top of the slider. The editor and the export render through the same Chromium, from the
same stored SVG.

**21.4.** Focal point (by a click, on layers and slide backgrounds), five masks as `clip-path`, four
filters as CSS (duotone in the brand's colours, painted with blend modes so it needs no SVG ids),
the text scrim as one gradient layer placed under the text, and Replace image, which swaps the
picture and its credit and keeps the rest. Replace exposed a real bug: `fillWithMedia` kept the old
`assetId` when the new picture had none, so `resolveDoc` would have put the old picture back on the
next open. It is fixed.

**21.5.** u2netp (Apache-2.0 weights, MIT ONNX export) on onnxruntime-web (MIT), both checked
before the first line, the AGPL library avoided. Served from our own origin. The button says the
first run downloads about 19MB; the session is kept for the visit. Measured: about 2.7s for a 600px
portrait, under 2s after that. Edges on an animal and a product are clean; a raised arm comes out
soft, which is the small model's limit (D28).

**21.6.** "From an image" in the brand editor: deterministic median cut, plus a vivid-hue pass so a
small bright accent is not averaged into its neighbours, and a proposal that passes contrast (fg and
muted 4.5:1, accent 3:1) before it is offered. Tested on five kinds of picture.

**21.7.** `planRun` takes the pool size; the done-when is a test (`0,1,2,0,1,2,0,1,2`). The Look
step picks pictures from the library in cycling order, and each one goes behind its carousel's
cover only, with its credit.

---

## Batch 22, Typography and emphasis

**Status:** done
**Size:** large, because 22.3 changes the text model.
**Why here:** a carousel is mostly type. The first half made type fit; it never made
type expressive. The single most common hand edit on generated slides, after
alignment, is colouring one word in the headline. Today that means splitting a text
layer in two and placing the halves by eye.

**Unknowns:** whether a text layer can hold styled runs today. If it cannot, 22.3 is
the biggest change to `model.ts` since the Photoshop-model rewrite, and it should be
scoped before anything else in the batch.

### 22.1 Type ramps as presets

**What:** three ramps, each a ratio between steps: **Tight** (1.2), **Editorial**
(1.333) and **Loud** (1.5). A ramp sets the headline, subhead, body and caption
sizes for a style, and every step sits above the pre-flight floors from Batch 1.3
(body 18pt, headline 24pt).

**Why:** a ramp is the decision that makes a deck look designed rather than typed.
The compositions already imply one; this makes it a choice a brand can make once.

**Invariant check:** the ramp sets the **top** of the `fit` ladder for each role.
The ladder and its 60% floor from Batch 4 are unchanged.

### 22.2 A curated pairing library

**What:** about two dozen display and body pairs, all open-licensed fonts, each
tested to render the same in the editor and in Playwright, grouped by voice:
editorial, technical, friendly, luxury, brutal, handwritten.

**Landmine, and it is the whole reason this is a batch item and not a list:** Batch
4 found that measuring with one typeface and rendering with another overflowed three
slides in four (D1), and that `Measure.family` was being handed a CSS stack where a
FONTS id was expected (F1). **Every pair added must register its metrics in**
`FONTS`, and a test must build a deck in every pair and assert zero overflow. A
pairing that only exists in CSS is D1 coming back.

**Done when:** every pair in the library passes a generated-deck overflow test at
every format, and adding a pair without metrics fails the build.

### 22.3 Emphasis inside a line

**What:** three marks inside any text: `*word*` for accent colour, `**word**` for
weight, `==word==` for a highlighter stroke. They are typed in the compose screen,
in outline mode (Batch 24) and on the canvas, and rendered as styled runs.

**Why:** "colour the one word that matters" is the most common emphasis in every
carousel style in the research, and it is currently impossible without breaking a
layer apart.

**The invariant 5 question, answered:** can the model write the marks? **Yes, with a
ceiling of one marked span per slide.** Emphasis is part of what a sentence means,
not where it sits, so it is words. The model never chooses colour, weight or size;
it chooses which word matters, and the style decides how that looks. `plainText`
keeps the three marks and strips anything else that looks like markup.

**Landmine:** measurement. A bold run is wider than a regular run, so `fit` must
measure runs, not strings. If styled runs land without that, every emphasised
headline overflows by a few characters and Batch 4's guarantee quietly breaks.

**Done when:** a headline with one accented word renders identically in editor and
export, measures within a pixel of its rendered width, and a slide with two
model-written marks keeps the first and drops the second.

### 22.4 Text effects

| Effect | Notes |
| --- | --- |
| Highlighter | a rough stroke behind the run; the `==` mark |
| Scribble underline | a hand-drawn underline under one run |
| Label box | text on a solid box, the short-video caption look; padding counts in measurement |
| Outline | stroked text, never below the 2px stroke floor from 1.3 |
| Soft shadow | for text over photos; the scrim (21.4) is preferred, shadow is the fallback |
| Gradient text | already shipped; moves into this list so all effects share one picker |

**Rule:** at most one effect per text layer. Two effects on one line is the second
most visible amateur tell after mixed icon styles.

### 22.5 Scripts other than Latin

**What:** font fallbacks for Cyrillic, Greek, CJK, Arabic and Hebrew, right-to-left
layout for the last two, and line breaking that does not assume spaces between
words.

**Why now:** Batch 29 (translation) is impossible without it, and a creator who
writes in Japanese cannot use FlashCC today at all.

**Landmine:** `sentences()` from Batch 6 and the wrapping in `text.ts` both assume
spaces and Latin punctuation. CJK needs a break opportunity between almost any two
characters, and RTL needs alignment mirrored in every composition. Treat each script
as its own test suite.

### 22.6 Emoji that survive the server

**What:** ensure the Playwright server has a colour emoji font installed and that
the editor and export use the same one.

**Why:** headless Chromium on a Linux server commonly has no colour emoji font, so
an emoji that looks fine in the editor exports as an empty box. This is a one-line
fix in the server image and an embarrassing bug if it ships first.

**Done when:** a slide with five common emoji exports pixel-identical to the editor
preview, and a test renders one on the server in CI.

### What this batch deliberately does not do

- **No arbitrary rich text.** Three marks, not a toolbar with underline, strike,
  superscript and twelve colours. Fewer buttons.
- **No variable-font axis sliders.** Weight steps from the pair are enough.
- **No font uploads beyond Batch 5.** The asset path already handles them.

### Built as

All six. 22.3's unknown is answered: a text layer held no runs, and it still does not. The marks
are characters in the stored text, so the text model did not change shape; what changed is that
`text.ts` measures runs and `LayerView` paints them.

**22.1.** Tight 1.2, Editorial 1.333 and Loud 1.5 in `ramps.ts`, on `Theme.ramp`, chosen in the
brand and style editors. A ramp sets the top of each role's ladder only; the 60% floor is
unchanged and every step sits on or above 18 (body) and 24 (headline). No ramp keeps each
layout's own sizes, so no existing style changed.

**22.2.** 24 pairs in six voices from 38 OFL families, shipped with the app through fontsource,
registered as unicode-range subsets so a deck downloads only what it draws. The landmine is
handled at the root: `npm run build:fonts` measures every face from its own woff2 (advances per
weight, kerning and two-letter ligatures through fontkit's shaper), a pair is typed with the
measured ids so a face without metrics does not compile, and `pairs.test.ts` builds hard decks in
every pair, at every format and under every ramp, with zero overflow. Measured in Chromium against
the DOM, a 96px headline lands within a pixel in six faces of seven; Caveat measures 0.5% long
because of its contextual alternates (D30). The work also found reflow measuring a CSS stack (F1
again) and replaced the four copies of the layer measure with one.

**22.3** as specified. The done-when holds: a Playfair headline with one accented word renders with
0 differing pixels between the editor's faces and the server export, measures within a pixel of
its rendered width and wraps where Chromium wraps; `slideCopy` keeps the first of two
model-written marks and unwraps the second. Found on the way: a shared global regex made the
first mark of a line print its asterisks after `hasMarks` had looked at it.

**22.4** as specified, one effect per layer enforced by `withEffect`. The mark colour must differ
from the words as well as read on the ground, because the plain Dark style's accent is the same
white as its text and marked words came out invisible.

**22.5.** Bundled fallbacks for Cyrillic, Greek, Arabic, Hebrew and CJK in every stack; CJK breaks
between characters with kinsoku; `sentences()` and the split points know CJK and Arabic
punctuation; RTL aligns to its start through `dir="auto"` and mirrors the composition. One test
suite per script.

**22.6** as specified, with a different font than planned. Fontsource's Noto Color Emoji is
OpenType-SVG, which Chrome does not draw, so it exported blank; Twemoji as a COLR font draws in
every engine. Not a server image change: the export carries the emoji face like any other, so a
server with no emoji font renders them. Five common emoji export pixel-identical to the editor,
and `server/emoji.test.ts` renders them through `render.ts`. It also found that the render waited
on `document.fonts.ready` before layout had requested a face, so a slide could screenshot blank
text during the face's block period; fixed.

---

## Batch 23, Panoramic carousels

**Status:** done
**Size:** medium to large
**Why here:** the seamless carousel, where a line, a photo or a shape runs across
the slide edge so the swipe feels like one continuous image, is one of the most
recognisable Instagram carousel looks, and it is the hardest one to make by hand. It
needs pixel-exact offsets on every slide, and one reorder ruins it. That is
precisely the kind of work a tool should take away.

**Unknowns:** whether the canvas can show more than one slide at a time, and how the
Playwright export currently screenshots (per slide, or one page sliced).

### 23.1 Strip view

**What:** a toggle that shows every slide side by side with no gap, at the same
scale, as one long canvas. Any layer can be dragged across a slide edge.

**Why:** the seam is invisible in single-slide editing. It is the only view in which
a spanning design can be judged.

### 23.2 A spanning layer is several ordinary layers

**What:** when a layer is dropped across an edge, it is committed as **one plain
layer per slide it touches**, each at the correct offset (the piece on the
right-hand slide sits at `x - W`), all sharing a `spanId`. Each slide clips its own
piece naturally.

**Invariant check:** this is the whole design, and it is why the feature is possible
at all. Nothing is computed at render time; each slide holds real layers and renders
alone. `spanId` behaves like `groupId` (18.6) across slides: in strip view the
pieces select and move together, and in single-slide view each is an ordinary layer.

**Done when:** a circle dropped across the edge of slides 2 and 3 becomes two
layers, the slides render with the circle meeting exactly at the edge, and moving it
in strip view moves both pieces.

### 23.3 Continuous backgrounds and photos

**What:** one image or one generated background (21.3) covering the whole strip, `N
x W` wide, split into pieces per slide. The focal point (21.4) applies to the strip,
not to each slide.

**Also: Panorama from one image.** Drop a wide photo, choose how many slides, and
get it split across a new deck. It is the single most common reason photographers
want a carousel tool, and it is about forty lines of code on top of 23.2.

### 23.4 Bridge presets

**What:** a handful of designs whose entire point is the seam: a line that leads
from one slide into the next, a large number split across two slides, an arrow that
starts on the hook and lands on slide 2, a shape that peeks in from the right edge
as a swipe cue.

**Why:** the peek on the right edge of the cover is the most effective swipe cue
there is, because it shows the next slide exists rather than telling the reader to
swipe. It replaces the swipe-cue furniture (Batch 20) on decks that use it.

### 23.5 The four ways a seam breaks, and what to do about each

| What breaks it | What happens |
| --- | --- |
| A format switch | reflow must treat span pieces as one: rebuild the full-width layer, reflow it on the strip, split it again. Reflowing each piece alone breaks every seam |
| A reorder that separates two pieces | warn, and offer **Unspan**: the pieces become independent layers and keep their position. Never silently stretch a span across slides that are no longer neighbours |
| Inserting a slide inside a span | same as above; the span is broken by construction |
| Export anti-aliasing | screenshotting slides one by one leaves a faint 1px seam at shapes that cross the edge. Render the strip **once**, at full width, and slice it, so both sides of every seam come from the same pixels |

**Landmine:** the last row is invisible in the editor and obvious on a phone. It
needs a pixel test: render a spanning shape, slice, and assert the two edge columns
match.

**Done when:** a seamless 5-slide deck survives a 4:5 to 3:4 format switch with
every seam intact, and its export passes the edge-column pixel test.

### 23.6 The cover still has to work alone

**What:** the pre-flight gains one check for spanning decks: the cover must read on
its own, because the profile grid and most feed impressions show nothing else. A
cover whose headline is cut by the right edge is flagged.

### What this batch deliberately does not do

- **No spans across non-adjacent slides.** By definition there is no seam there.
- **No automatic seam design.** The model writes words; a bridge is a layout choice
  the user makes (invariant 5).

### Built as

All six. Both unknowns are answered. The canvas showed one slide and did not clip at the
artboard, so strip view is a second canvas (`StripCanvas.tsx`) rather than a mode of the first,
painting each slide in its own clipped box through `LayerView`. The export screenshotted slide by
slide and built the PDF from those pages; it now renders each run of linked slides as one strip
and slices it.

**23.1** as specified, toggled from the toolbar. Selecting, dragging, deleting and restyling act on
the whole design; X, Y, W and H typed into the inspector move or resize it along the strip, so no
edit made there can open a seam.

**23.2** as specified, in `spans.ts`, pure and DOM-free. The done-when is a test: a circle dropped
across slides 2 and 3 becomes two layers whose strip positions agree to the pixel, and a strip
move moves both. A drag keeps the dragged id alive whatever the span becomes, so the selection
follows it off its own slide.

**23.3** as specified. `stripBackground`, `stripTexture` (the 21.3 textures drawn once at strip size)
and `panoramaDeck` (2 to 10 slides from one picture). The focal point belongs to the strip and
rides on every piece. Found on the way: Tailwind's preflight caps an `<img>` at its parent's width,
so a picture wider than the slide was cut to one slide in the editor and drawn whole in the export.
`LayerView` sets `maxWidth: none`.

**23.4.** Peek, Lead line, Arrow and Split number, plain layers in the theme's colours carrying a
`bridge` stamp. A peek on the cover stands the swipe-cue furniture down.

**23.5.** Reflow treats each span as one layer on the strip and splits it again; the done-when
holds as a test (a 5-slide seamless deck, 4:5 to 3:4, every seam intact, and square and back).
Reorders and inserts are reported as `apart`, lone moves as `offset`, with Unspan offered in a
banner and a `span-broken` pre-flight warning; nothing is repaired silently. The landmine got its
pixel test, and an honest result: an unrotated shape across a seam, rounded and gradient-filled,
slices pixel-identical to the same shape drawn unbroken. A rotated one differs by up to 26 levels
on its anti-aliased edge, and so does rendering slide by slide: Chromium rasterises rotated
content inside a clipped box differently whatever does the clipping. Not visible at phone scale;
recorded as D33 and pinned at 32 in the test. Strips wider than 16,000px are cut into strips that
fit.

**23.6.** `cover-cut`: in a spanning deck, cover text that is a span piece or runs past either edge
is flagged. Shapes are not, because a shape across the cover's edge is the peek.

Verified in the browser: bridges and a mesh texture across a 4-slide deck, a dragged arrow, a 3:4
switch with no broken seam, a panorama deck from an uploaded picture, the banner after a lone
move, and LinkedIn PDFs whose pages join without a visible seam.

---

## Batch 24, Outline mode and keyboard speed

**Status:** next
**Size:** medium
**Why here:** the first half's central finding was that **writing the slides is the
biggest time sink**, 30 to 60 minutes of a 45 to 120 minute carousel. Every writing
feature so far happens inside a form or on a slide. Nobody writes well one text box
at a time. This batch gives the writing a place of its own, and then makes
everything else reachable without the mouse.

**Unknowns:** which shortcuts already exist, and whether there is a global key
handler or one per panel.

### 24.1 Outline mode

**What:** a view of the whole deck as one plain text document. Each slide is a line
starting with `#` (its headline) followed by its body lines. A new `#` line is a new
slide. Emphasis marks from 22.3 work here. Blocks (Batch 19) appear as one labelled
line each, editable in place.

```
# Your edits feel mechanical. Here is why.
# You cut on the beat
The beat is the most predictable moment in the track.
Predictable cuts read as *mechanical*.
# Cut on movement instead
A hand leaving frame. A door closing.
```

**Why:** this is how people already draft carousels, in a notes app, before pasting
slide by slide. Outline mode removes the paste and keeps the draft live.

**How edits land:** on a pause in typing (about 800ms) or on leaving the view, each
changed slide goes through `restateSlide`, by position, exactly as Batch 11 applies
a rewrite. Hand-edited layers are kept, the composition re-lays the rest, and the
whole session is **one undo step** labelled "Outline".

**This is not the paste importer coming back.** Batch 16 deliberately deleted `---`
parsing because a text importer is not a feature. Outline mode is not an import; it
is a second view of the same document, and it never creates a document on its own.

**Landmine:** slot mapping. Batch 11 found the only route back to a slot is
positional and only valid while the slide count matches the structure. Adding a `#`
line in the middle changes the count, so after that edit the deck is treated as
free-form for slot purposes, and the outline says so in its margin.

**Done when:** rewriting three slides and adding a fourth in outline mode and
switching back shows the new copy laid out, every hand-moved layer where it was, and
one undo restores all of it.

### 24.2 Command palette

**What:** `Cmd+K` opens a filtered list of every action in the product: insert a
block, apply a brand, change format, export to a destination, run Tidy, open
outline, jump to a project. Recent actions first.

**Why:** it is the answer to "many presets, few buttons". Hundreds of presets can
exist without a single extra button, because the palette is where they are found.

**Done when:** every action reachable from a button is also reachable from the
palette, enforced by a test that walks the action registry.

### 24.3 The keyboard map

| Key | Action |
| --- | --- |
| `N` | new slide after this one |
| `D` | duplicate slide |
| `Cmd+Shift+Up/Down` | move slide |
| `/` | insert a block (19.6) |
| `L` | next layout for this slide (25.2) |
| `R` | rewrite the selected text (Batch 11) |
| `T` | Tidy (18.2) |
| `M` | match on every slide (18.3) |
| `O` | outline mode |
| `G` / `Shift+G` | group / ungroup |
| `Arrows` / `Shift+Arrows` | nudge 1px / 10px |
| `Cmd+E` | export with the last-used destination |
| `?` | this table, as an overlay |

**Rule:** single-letter keys never fire while a text field has focus. That is the
bug every editor with letter shortcuts ships once.

### 24.4 Find and replace, across the deck and across projects

**What:** one-shot replace in this deck, or across every project matching the
current filters. A preview lists every match with its slide before anything changes.

**Why across projects:** a product renamed, a price changed, a handle changed. For
an agency with forty carousels per client, that is currently forty documents opened
by hand.

**Rules:**

- Snapshot every touched document first (Batch 8.3), so the whole replace can be
  undone document by document.
- A match inside a **verbatim** quote (Batch 13 and 19.2) is shown but unticked by
  default, because changing a quote makes it no longer a quote.
- Replaced text goes through the overflow check, and newly overflowing slides are
  listed.

**Done when:** replacing a product name across 12 filtered projects changes every
match, snapshots each document first, and reports any slide that now overflows.

### 24.5 Type a slide into existence

**What:** a `+` at the end of the filmstrip that takes a line of text. Enter creates
a slide with that line as its headline, laid out by the next composition in the
cycle.

**Why:** it is the outline mode gesture for somebody who stays in the visual editor.

### What this batch deliberately does not do

- **No custom key bindings.** One map, learnable, printed on `?`.
- **No markdown import as a document.** See 24.1.
- **No vim mode.** Somebody will ask; the answer is outline mode.

---

## Batch 25, The preset system

**Status:** queued
**Size:** large, mostly content and tests rather than new machinery.
**Why here:** this is where "many presets" is delivered, and it comes after Batches
19 to 24 on purpose. A preset is only as good as the pieces it can assemble: a
framework that wants a chart needs the chart block, a template that wants a seam
needs strip view, and a library of hundreds of presets needs the command palette to
be findable without a gallery.

**Unknowns:** the names and slot definitions of the four existing frameworks, and
how many compositions `compositions.ts` holds per content shape.

### 25.1 Sixteen frameworks, not four

**What:** keep the four that exist and add twelve, each defined as a slot sequence
with a **slide-count range**, which slots may repeat, which slots ask for a block
(19.7), and two or three section rhythms.

| Framework | Slot shape | Slides | Block slots |
| --- | --- | --- | --- |
| Mistakes and fixes | hook, (mistake, fix) repeated, CTA | 6 to 12 | two columns |
| Myth versus fact | hook, (myth, fact) repeated, CTA | 5 to 10 | two columns |
| Step by step | hook, steps, result, CTA | 5 to 10 | steps |
| Before and after | before, turning point, after, how, CTA | 5 to 7 | before and after |
| Case study | context, problem, approach, result, lesson, CTA | 6 to 8 | big number, testimonial |
| Story | setup, tension, turn, lesson, CTA | 5 to 8 | none |
| Comparison | hook, criteria repeated, verdict, CTA | 5 to 9 | two columns, table |
| Named model | name, parts repeated, how to apply, CTA | 5 to 9 | icon grid |
| Checklist | hook, checklist, save CTA | 3 to 5 | checklist |
| FAQ | hook, questions repeated, CTA | 5 to 10 | none |
| Tool stack | hook, tools repeated, CTA | 5 to 10 | screen frame |
| Hot take | claim, the common belief, evidence, nuance, comment CTA | 5 to 7 | big number |
| Lessons learned | hook, lessons repeated, CTA | 6 to 12 | none |
| Data breakdown | headline number, context, chart, implication, CTA | 5 to 7 | big number, chart |
| Quote set | hook, quotes repeated, source, CTA | 5 to 10 | quote |
| Question | hook, options, reveal, CTA | 4 to 6 | question |

**The sameness constraint is the design constraint for this whole table.** The first
half's loudest one-star complaint was "the same 8-slide hook / 5 tips / CTA layout".
Sixteen frameworks help; varying the slide count and rhythm **within** each
framework is what actually fixes it. Each framework ships with Batch 4's test:
twenty decks from different briefs do not all come out the same shape.

**Honesty rule:** Case study and Data breakdown are the two frameworks most likely
to make the model invent a result. The Batch 10 rule (never invent a client, a
number or a result) applies, and both frameworks leave their result slots **empty
with a placeholder** when the brief contains no result, rather than writing a
plausible one. The pre-flight catches the placeholder.

**Done when:** every framework drafts from three test briefs through the eval
harness with zero structural failures, and the sameness test passes per framework.

### 25.2 Layouts you cycle, not browse

**What:** `L` on a slide (or the arrows beside it in the filmstrip) steps to the
next composition compatible with **what is on this slide**: text only, text and
image, a given block. The words stay, hand-edited layers stay, and the order is
fixed so pressing `L` three times and `Shift+L` three times returns to the start.

**Also, deck-wide: Shuffle rhythm** re-runs the deck's composition cycle from a
different offset (the Batch 4 seed), for when the whole deck looks too regular.

**Why:** this is the frame's rule made concrete. Somebody judging layouts wants to
see each one in place, on their own words, one at a time. A thumbnail grid of empty
layouts is the Canva template wall in miniature.

**Target size of the catalogue:** at least six compositions per common content shape
(headline only, headline and body, headline and image, each block). Fewer than that
and cycling repeats too fast; many more and nobody reaches the later ones.

**Done when:** cycling a headline-and-body slide shows at least six distinct
layouts, none overflowing, all inside the safe zone of the active platform.

### 25.3 Hook formulas

**What:** about thirty hook patterns as fill-in-the-blank templates, for example
`Stop [doing the common thing].`, `[Number] [things] nobody tells you about
[topic].`, `I [did X] for [time]. Here is what happened.`, `You are not bad at [X].
You are [doing Y].`

**Two ways to use one:**

- **By hand, no AI:** pick a formula and fill the blanks on the cover. This is the
  deterministic half, and it serves Batch 4.1's finding that people should write the
  hook themselves.
- **As a hint:** pass the chosen pattern to `/api/hooks`, which then writes its
  variants in that shape.

**Invariant check:** nothing is ranked. The formulas are listed by kind (curiosity,
contrarian, result, list, story), never by a claimed performance number. A "top
converting hooks" label would be the virality score again.

### 25.4 Calls to action by goal

**What:** a CTA library keyed by what the post is for: follow, save, share, comment
with a keyword, DM a keyword, link in bio, newsletter, book a call, and "part 2
tomorrow" (which pairs with series, Batch 6.2). Wording varies per platform
(LinkedIn says repost, Instagram says share).

**Why:** the CTA slide is the one the caption route already reads (`cta` in Batch
12.1), so choosing it from a library means the caption and the closing slide agree
by construction.

### 25.5 Saved templates

**What:** **Save as template** captures a deck's structure: slide count, composition
per position, block placements, brand, furniture set and spans. It does not keep the
words, unless the user ticks "keep as example text". Templates belong to a client
(Batch 7) and appear in the command palette and on the start screen.

**Why:** the first half's "Explicitly not building" table says it plainly: saved
user templates yes, a bigger template library no. "Locking 1 template and batching
killed 80% of my decision fatigue" is the evidence.

**Invariant check:** applying a template runs once. Editing a template later does
**not** reach the decks made from it. **Re-apply template** on a document is the
explicit, one-shot way to do that, by position, keeping words and hand edits,
exactly like re-applying a brand (Batch 3.2).

**Done when:** a template saved from a 7-slide deck produces, from a new brief, a
7-slide deck with the same composition per position, and changing the template
afterwards leaves that deck untouched.

### 25.6 Style packs

**What:** a style pack bundles every visual preset into one choice: palette roles,
font pair (22.2), type ramp (22.1), background generator (21.3), furniture set
(20.6) and icon style (21.1). Ship packs grouped by kind of creator: education, SaaS
and product, agency, finance, fitness, food, coaching, personal brand.

**Landmine:** the test matrix. Batch 9 already asserts zero safe-zone warnings
across 180 deck and platform combinations. Sixteen frameworks times a dozen packs
times six destinations is well over a thousand. Run a fixed sample on every commit
and the full matrix nightly, so the suite stays fast and nothing ships untested.

### 25.7 Starter kits

**What:** for each creator kind, one kit: a pack, three frameworks that suit it, a
default hook kind and a default CTA. A kit is what Batch 33's onboarding offers. It
is a preset of presets and it runs once.

### What this batch deliberately does not do

- **No template marketplace or community gallery.** Template count was rejected on
  evidence in the first half, and a marketplace is template count with a payout
  problem.
- **No performance claims on any preset.** Nothing is ranked.
- **No live template inheritance.** See 25.5.

---

## Batch 26, Motion export

**Status:** queued
**Size:** large. The first server job in FlashCC that cannot answer inside one request.
**Why here:** the same carousel is routinely re-posted as a short video for Reels,
TikTok, Shorts and LinkedIn video, because video formats reach people who never see
a carousel. Today that means exporting slides, opening a video editor, placing them
on a timeline, and guessing durations. The slides already exist and the timing is
arithmetic.

**Unknowns:** whether the server host allows long-running jobs and a bundled
`ffmpeg` binary.

**Scope decision, recorded:** FlashCC is a standalone product and does not depend on
the FlashFX engine. This batch is built inside FlashCC's own server with Playwright
and `ffmpeg`, and stays deliberately small. Anything that needs a real motion
timeline belongs in a video editor, not here.

### 26.1 Slideshow video

**What:** render each slide as an image (the existing path), then compose an MP4 at
30fps with one transition preset per deck: **Cut**, **Push** (slides move left, like
a swipe), **Fade** or **Zoom**.

**Duration per slide, deterministic:** a floor of 2 seconds, plus reading time at
about 3.5 words per second, capped at 6 seconds. The cover gets an extra half
second; the CTA slide holds 1 second longer. Every number is adjustable per slide in
a small timing strip, and the total runtime is always shown.

**Why arithmetic and not a model:** reading time is the one thing about a slide that
can be computed exactly, and a model guessing durations would be AI near layout
(invariant 5) for no gain.

**Done when:** a 9-slide deck exports as an MP4 whose per-slide durations match the
formula within one frame, playable on a phone.

### 26.2 The shape of the video

| Destination | Video shape | How a 4:5 deck gets there |
| --- | --- | --- |
| Reels, TikTok, Shorts | 9:16 1080x1920 | reflow to 9:16 first (Batch 1.5 and 9), shown in the 17.5 contact sheet |
| LinkedIn video | 4:5 or 1:1 | as the deck is |
| X video | 16:9 or 1:1 | reflow, or letterbox on the brand background |

**Decision: reflow, never letterbox by default.** A 4:5 slide floating in a 9:16
frame wastes a third of the screen and puts the bottom of the content under TikTok's
caption band. Letterboxing stays available as an explicit option for decks that
reflow badly.

### 26.3 Entrance animations, a short list

**What:** per role, not per layer: headline **rises**, body **fades in**, numbers
**count up**, list items **arrive in order**, accent word **highlights** (the 22.3
mark, drawn on). One choice per deck, plus None.

**How it renders:** each frame is a Playwright screenshot with the page's animations
seeked to an exact time, so the output is deterministic and identical on every run.
No real-time capture, which drops frames under load.

**Landmine, cost:** 30fps for 40 seconds is 1,200 screenshots. That is the most
expensive thing FlashCC can be asked to do. Render only the frames where something
is moving, and reuse the still frame for the rest of each slide's hold. For a
typical deck that is under a fifth of the total.

**Done when:** an animated 9-slide export renders twice to byte-identical files, and
a slide with no animation costs one screenshot, not ninety.

### 26.4 Sound

**What:** **silent by default**, with an optional track the user uploads.

**Why:** trending audio is added inside Instagram and TikTok, and a video exported
with music cannot have it swapped there. A built-in music library would be a
licensing liability in exchange for something the platforms already do better.

### 26.5 A job, not a request

**What:** video export becomes a queued job with a progress state, a result URL in
the `slides` bucket (Batch 5), and a notification inside the app when it finishes.
The URL slots into the scheduler CSV (Batch 5.5) as a video post.

**Invariant check:** an abuse ceiling per account on concurrent and hourly renders,
keyed like the others. **Slideshow video without animation is free**, because it is
cheap and it is the same export the free tier already has in another shape.
**Animated export is Pro**, because 26.3 is real compute. Neither is metered by
credits.

**Landmine:** the first half noted the rate limiter is in-process and resets on
deploy. A render queue in the same process loses every job in flight on deploy.
Either finish jobs before shutdown or store them durably, and say which in the code.

**Done when:** a render that is interrupted by a deploy either completes after it or
is reported as failed with a one-click retry, never silently lost.

### What this batch deliberately does not do

- **No timeline editor.** One transition, one animation choice, per-slide durations.
  Anything more is a video editor.
- **No music library.** See 26.4.
- **No burned-in subtitles.** The slides are already text.
- **No dependency on the FlashFX engine.** See the scope decision above.

---

## Batch 27, Idea bank, lanes and the weekly session

**Status:** queued
**Size:** medium
**Why here:** the first half's batching evidence says three things about planning,
and none of them is "give people more ideas". Content goes stale in about a week.
Experienced creators now "plan formats and lanes ahead, not finished posts". And the
idea is not the bottleneck: "the wall is everything AFTER the idea". So this batch
plans **formats**, captures ideas people already have, and puts its effort into the
last mile.

**Unknowns:** whether the pipeline already has a calendar or week view, or only
stages. `posts` has dates since Batch 16.6.

### 27.1 The idea bank

**What:** a list of one-line ideas, each with optional notes, a pillar (Batch 8.4),
a client (Batch 7), and where it came from. Adding one is a single keystroke
anywhere in the app, and captures arrive from the phone (Batch 32) and the browser
extension (Batch 31).

**Decision: the bank is never filled by a model.** The first half's evidence
explicitly struck "running out of ideas" as a pain point, and an idea generator
would be the product spending money on the one step nobody struggles with.

**Done when:** capturing an idea takes one shortcut and one line, and the bank
filters by pillar and client with no tags typed.

### 27.2 Lanes

**What:** a lane is a recurring slot in the week with its format already decided:
**weekday, platform, framework, template or style pack, pillar**. For example:
Monday, LinkedIn, Myth versus fact, editorial pack, pillar "Editing".

**Why:** this is "plan formats and lanes ahead" turned into an object. Once the
format is locked, "you're just swapping the content into a template, not inventing a
new thing weekly". That sentence is the strongest evidence in the first half's
batching section, and lanes are its direct implementation.

### 27.3 Make next week

**What:** one action that looks at next week's lanes, lists them as empty slots, and
lets the user drop an idea from the bank into each. Then it runs **Batch 16's run
sheet**, with one change: each step takes its framework, template and platform
**from its lane** rather than from the cycling style list. Finished carousels are
scheduled on their lane's date (Batch 16.6).

**Designed for the wall, not for the marketing number:**

- The default is the next seven days, not thirty. The first half's evidence on
  staleness is unambiguous.
- The queue is reorderable while it runs and can stop at any point, keeping what is
  done.
- Pairing an idea to a lane is the user's choice. If they skip it, the slot stays
  empty; the session never picks an idea for them.

**Done when:** a week with five lanes and five ideas produces five drafted
carousels, each in its lane's framework and template, each scheduled on its lane's
day, and stopping after the third leaves three finished carousels and two empty
slots.

### 27.4 The finishing pass

**What:** after a session, a queue that walks each new carousel through the steps
that turn a draft into a post, one carousel at a time: **hook** (Batch 4.1),
**payoff**, **caption** (Batch 12), **alt text**, **pre-flight**, **schedule**. Each
step is one screen with one decision, and each carousel shows how many steps it has
left.

**Why:** the batch breaks at post three or four. It breaks because finishing is a
dozen small decisions spread over several screens, and by the fourth carousel the
energy for them is gone. The finishing pass puts the same decisions in the same
order every time, so the fifth carousel costs less attention than the first rather
than more.

**Done when:** a finished carousel needs no screen other than the finishing pass
between draft and scheduled.

### 27.5 A week view

**What:** if the pipeline has no calendar yet, a week view: lanes as labelled empty
slots, scheduled posts filling them, drag to move a post to another day, and drafts
older than seven days marked as possibly stale.

**Why the stale mark is a mark and not a block:** a draft that is a week old is
often fine. The mark is information, the same tier as Batch 15's flags.

### What this batch deliberately does not do

- **No idea generator.** See 27.1.
- **No best-time-to-post suggestions.** Rejected in Batch 12 as the least defensible
  number in this category.
- **No month-ahead batching as the default.** The evidence says it fails.
- **No silent calendar filling.** Every scheduled post comes from a choice the user
  made.

---

## Batch 28, Remix what worked

**Status:** queued
**Size:** medium
**Why here:** structural attribution was the first half's unclaimed ground (zero of
seventeen tools connect hook shape, framework or slide count to outcome) and the
reason it said attribution "wins the renewal". The insight screens show what worked.
Nothing yet turns that into the next carousel. That gap is the difference between a
report somebody reads once and a loop they come back for.

**Unknowns:** exactly which dimensions the current insight screens group by, and
whether metrics exist for platforms other than LinkedIn.

### 28.1 Make another like this

**What:** on any post with metrics, one action creates a new carousel with **the
same structure**: framework, slide count, composition per position, blocks,
furniture and style. The words come from a new brief or an idea from the bank (Batch
27), drafted through the normal route.

**Why:** "what worked" is almost always a shape, not a sentence. Copying the shape
and writing new words is what experienced creators do by hand when something lands.

**Invariant check:** the structural copy is deterministic and needs no key, the same
split as `longform.ts` beside `/api/distil`. Only the words use the model, and only
if the user asks it to draft.

**Done when:** remixing a 7-slide post with a stat block in slot 4 produces a new
7-slide draft with a stat block in slot 4, in the same style, with none of the
original's words.

### 28.2 Worth posting again

**What:** a view of posts older than a chosen age (default 4 months) sorted by **the
metric the user picks** (saves, shares, impressions), with **Repost as new** on
each. Reposting creates a variant with a fresh cover (Batch 6.3 hook variants are
one click away) and runs a staleness check on the copy.

**The staleness check, deterministic:** flag explicit years, relative dates ("this
week", "last month"), prices and version numbers, and any line containing a number
the user may want to update. Flags, never edits.

**Invariant check:** sorting a table by a column the user chose is not ranking. The
rule from the first half is about a machine asserting which of somebody's sentences
is better. Here the user's own audience already said so, in numbers the user
brought.

### 28.3 Posted in one place only

**What:** a filter for posts that did well on one platform and were never published
on another. Combined with the multi-destination export (17.5), turning a LinkedIn
post into its Instagram version is one filter and one export.

**Why:** cross-posting what already worked is the cheapest content anybody can make,
and it is invisible until somebody goes looking.

### 28.4 More analytics sources, same matching

**What:** extend Batch 8.1's three-pass matcher (URL, exact text, leading text in a
date window) to the exports other platforms provide, starting with whichever of
Instagram's and TikTok's own exports carries per-post rows today.

**Landmine:** verify each export's current columns before writing a parser. These
change without notice, and Batch 8.1's rule holds: absent is not zero, and an
unmatched row is shown, never dropped.

### 28.5 Attribution by the new dimensions

**What:** the insight screens gain the dimensions this half adds: block used (19),
furniture set (20), hook kind (25.3), panoramic or not (23), video or carousel (26).

**Honesty rules for every chart on those screens:**

- Show the sample size beside every median.
- Show nothing for a group with fewer than five posts. A median of two posts is an
  anecdote with a chart around it.
- No significance language, no "winning" badge, no prediction. The screen says what
  happened, in the user's own numbers.

### What this batch deliberately does not do

- **No performance prediction.** "This carousel will do well" is the virality score.
- **No recommendations of what to post.** The user reads their own numbers and decides.
- **No automatic reposting.**

---

## Batch 29, One deck, several languages

**Status:** queued
**Size:** medium, once Batch 22.5 has made other scripts render.
**Why here:** PostNitro advertises more than thirteen languages. For a creator or an
agency working in more than one market, translating a finished carousel today means
retyping every slide and then fixing every slide that the longer language
overflowed. The model is good at the first half of that and the existing layout
machinery already does the second.

**Unknowns:** none beyond 22.5, which is a hard dependency. Do not start this batch
until a Japanese and an Arabic deck render correctly.

### 29.1 The translate route

`/api/translate`.

| Field | Type | Notes |
| --- | --- | --- |
| `deck` | string[] | every slide's text, required, ceiling 12,000 chars |
| `target` | language code | required |
| `voice` | Voice? | the brand's voice, plus samples in the target language when the brand has them |
| `glossary` | `{ term, rendering? }[]?` | see 29.3 |

Returns one string per slide, positional, the same shape every other route returns.
**Words only**, invariant 5.

**What is never translated:** names, handles, URLs, code blocks, numbers, and
anything in the glossary marked as fixed. These are masked before the call and
restored after, so the model never sees them as text it could change.

**Quotes:** a quote with the `verbatim` flag (Batch 13, 19.2) is no longer verbatim
once translated. It is translated, labelled as a translation, and loses the flag.
The original stays available in one click.

### 29.2 Longer languages get more room, not smaller type

**What:** each translated slide goes through `restateSlide` and `splitToFit`, so a
German slide that runs a third longer becomes two slides at readable size rather
than one cramped one. That is Batch 4.5's rule applied to a new source of overflow.

**The interface says what changed:** "8 slides became 9 in German, slide 4 was
split". A translated deck that silently changes length is a surprise at posting
time.

**Done when:** an English deck translated to German, Japanese and Arabic lays out in
all three with zero overflow and zero safe-zone warnings, and reports any
slide-count change.

### 29.3 A glossary per brand

**What:** terms that are never translated (the product name, a coined phrase) and
terms with a fixed rendering in a given language. Stored on the brand beside voice
(Batch 10.4), applied by masking.

**Why:** the most common translation complaint in any localisation workflow is a
brand term rendered differently on every slide. A glossary is how translation
agencies have always solved it.

### 29.4 Checks, on the Batch 15 tiers

| Tier | Check |
| --- | --- |
| Repair | restore masked terms, house punctuation |
| Retry | a slide left untranslated, a placeholder, a glossary term missing, a slide over its ceiling |
| Flag | **a number that differs from the source**, which is the translation failure that actually hurts |

The number check is deterministic: every number in the source slide must appear in
the translated slide, in the target language's numeral system. Anything else is
flagged on that slide, never silently corrected.

### 29.5 A language set, not a pile of copies

**What:** each translation is its own document with `variantOf` pointing at the
source (the 17.5 pattern), and the set exports together with a folder per language.
Caption (Batch 12) and alt text are generated per language from the translated
slides, not translated from the English caption, so they match what the slides say.

**Invariant check:** editing the English deck does not update the German one.
**Re-translate** on a variant is the explicit, one-shot way, and it keeps the
variant's hand edits like every other re-run.

### 29.6 No deterministic half, said plainly

Every other AI feature in this half has a free path that needs no key. Translation
does not have a sensible one, and inventing a weak dictionary-based one would be
worse than nothing. Translation is Pro, gated the Batch 9 way, with an abuse ceiling
and no credits.

### What this batch deliberately does not do

- **No automatic language detection of the audience.** The user picks the target.
- **No translation of the FlashCC interface itself.** That is a separate project with
  its own scope.
- **No machine-translated testimonials passed off as originals.** A translated
  testimonial is labelled as translated, like a quote.

---

## Batch 30, Legibility and accessibility

**Status:** queued
**Size:** small to medium
**Why here:** the pre-flight from Batch 1.3 checks sizes, strokes, safe zones, file
size and slide count. It does not check whether the text can actually be **seen**.
This half adds photos behind text (21), effects (22.4) and brand palettes derived
from images (21.6), and every one of those can produce a slide that passes every
current check and is unreadable on a phone.

**Unknowns:** whether the pre-flight runs on the client, the server or both.

### 30.1 Contrast, including over photos

**What:** a contrast check for every text layer: 4.5 to 1 for body, 3 to 1 for large
headlines, the WCAG thresholds. For text over a flat colour it is arithmetic. For
text over an image or a generated background, sample the rendered pixels **behind
the text box** and test against the worst region, not the average.

**Why the worst region:** a white headline over a photo that is mostly dark but has
a bright sky behind two letters passes on average and fails where it matters.

**Three one-click fixes, offered in this order:**

1. Add a text scrim (21.4) behind the layer.
2. Swap to the nearest brand colour role that passes.
3. Move the layer to the part of the image that passes, if one exists inside the safe
   area.

**Done when:** white text over a photo with a bright patch behind it is flagged, and
each fix makes the same check pass.

### 30.2 See it at the size it will be seen

**What:** a **phone preview** toggle that shows the slide at real feed size (a
1080px slide is displayed at roughly 360 to 430 CSS pixels wide on a phone), and a
**grid preview** of the cover at profile-tile size.

**Plus one check:** the smallest text on each slide, measured at feed scale. The
18pt floor from Batch 1.3 is a proxy for this; measuring the real displayed size is
the thing itself, and it catches the cases the proxy misses, like a 9:16 deck viewed
in a 4:5 crop.

**Done when:** the cover's headline is readable in the grid preview at tile size, or
the pre-flight says it is not.

### 30.3 Colour vision

**What:** a preview toggle for the three common colour-vision deficiencies, and one
check: any slide where meaning is carried by colour alone (a red versus green
comparison with no labels, two chart series with no direct labels).

**Why this is cheap:** charts (19.3) already label marks directly, and two-column
blocks (19.2) already carry text labels. The check mostly confirms the blocks did
their job and catches hand-made slides that did not.

### 30.4 Density

**What:** a word ceiling per slide per format, flagged on the Batch 15 flag tier. A
body slide over about 40 words at 4:5, or over about 30 at 9:16 where the safe area
is smaller.

**Invariant check:** this is a defect check, not a quality score. Forty words on a
slide is a slide nobody reads at swipe speed, whatever the words are. It never
blocks.

### 30.5 Motion safety

**What:** for animated export (26.3), refuse any combination that flashes more than
three times a second, and offer a reduced-motion variant of every animation preset
(fade only, no movement).

### What this batch deliberately does not do

- **No readability score.** Every check is a defect anybody would recognise as a defect.
- **No blocking export on a flag.** The user can know something the check does not,
  the same reasoning as Batch 15.

---

## Batch 31, Integrations and the public API

**Status:** queued
**Size:** large, split into independent items that can ship one at a time.
**Why here:** Batch 5.5 made FlashCC "the missing first half of the bulk pipeline"
through a CSV. A CSV is the right first step and still a manual one: export, open
the scheduler, import, check. The research's own wording was that the pain is "copy
paste the image url into csv and then reupload". This batch removes the remaining
copy and paste, and opens the pipeline to people who build their own.

**Unknowns:** which schedulers expose a public API that can create a multi-image or
document draft today, and on which of their plans. **Verify each one before
committing to it.** The first half's research could not confirm per-tool bulk
mechanics for several of them.

### 31.1 Push to a scheduler as a draft

**What:** for each scheduler with an official API that accepts carousels, a
connection the user authorises once, and a **Send as drafts** action that creates
one draft per carousel, with hosted slide URLs, caption, alt text where supported,
and the scheduled date from Batch 16.6 or 27.3.

**Decision: drafts, never published posts.** The scheduler stays the thing that
publishes. This keeps FlashCC on the right side of its own "no auto-posting"
rejection, and it means a mistake costs a deleted draft rather than a public post.

**Order of work:** start with whichever of Publer and Metricool verifies first,
because they are the two the first half named as the best integration targets, and
keep the CSV path for everything else. One dialect per tool, never a generic
adapter, the same rule as Batch 5.5.

**Done when:** a week's run (27.3) appears in the connected scheduler as drafts on
the right dates, with nothing published, and a failure on one carousel names that
carousel and leaves the others sent (the Batch 4.4 atomic-failure rule).

### 31.2 Webhooks

**What:** outgoing events, signed, retried with backoff: **carousel published**
(Batch 5), **run finished** (16), **review approved** or **changes requested** (7),
**export ready** (26). Each carries ids and URLs, never document contents.

**Why:** Zapier and Make users can then wire FlashCC into anything without FlashCC
building each connection. It is the cheapest integration surface there is.

### 31.3 The public API

**What:** personal API keys on the Agency tier, and three endpoints to start:

| Endpoint | Does |
| --- | --- |
| `POST /v1/render` | a document in, slide images or a PDF out, per platform preset |
| `POST /v1/decks` | words in (one string per slide, or long-form text), a laid-out document out, using a template or framework |
| `POST /v1/runs` | a list of ideas and a run sheet in (Batch 16), carousels out, with progress through a webhook |

**Why this is different from the competitor APIs the first half audited:**
Contentdrips' API turned out to be "a renderer, not a splitter", leaving the caller
to supply every slide. `/v1/decks` is the splitter. That was the hard part then and
it is FlashCC's to offer now.

**Invariant check, the hard one:** invariant 7 says nothing is metered. An API is
where that promise is most expensive, because a script can call it all day. So the
API inherits the same per-key abuse ceilings as the app, set high enough that no
ordinary integration meets them, and the documentation says plainly that a need
beyond them is a conversation, not an invoice. **No per-call pricing, ever.**

**Done when:** the three endpoints are documented with runnable examples, every
request is attributed to a key, and a key over its ceiling gets a 429 with the reset
time rather than a bill.

### 31.4 A browser extension that only takes what the user selects

**What:** select text on any page, right-click, **Send to FlashCC** as an idea
(Batch 27) or as a source for distil (Batch 13). The user's own LinkedIn post, a
paragraph from their newsletter, a note in their docs.

**Why this is consistent with Batch 13's rejection of URL fetching:** Batch 13
refused to make FlashCC the one requesting somebody else's page. Here the user's
browser already has the page, the user chooses the words, and only those words are
sent. Nothing is fetched by FlashCC's server.

### 31.5 Imports from where drafts already live

**What:** a CSV of ideas into the idea bank (from Notion, Airtable or a sheet,
exported by the user), and a Markdown or plain-text file into distil or outline mode
(24.1). File upload first; OAuth connections to those tools only if file upload
proves to be the friction.

### 31.6 Editable exports for other tools

**What:** **PowerPoint** export with real text boxes (for corporate users who must
hand a deck to somebody in Office), and **SVG per slide** (for designers who finish
elsewhere).

**Landmine:** fidelity. Text effects (22.4), styled runs (22.3) and spans (23) do
not all survive into PowerPoint. The export lists what it had to flatten into
images, by slide, before writing the file, rather than producing something that
looks broken on open.

### What this batch deliberately does not do

- **No embed SDK or white-label editor for other platforms.** That is PostNitro's
  distribution channel and it conflicts with the first half's white-label rejection.
- **No direct publishing to any social network.** Drafts in a scheduler only.
- **No metered API.** See 31.3.

---

## Batch 32, Phone, capture and offline

**Status:** queued
**Size:** medium
**Why here:** Instagram and TikTok carousels are posted from a phone, almost always.
Every export FlashCC makes for those platforms currently ends on a desktop, and then
the files have to reach the phone somehow, by cloud folder, email or messaging app.
That last hop is invisible in every workflow diagram and costs a few minutes per
post, every post.

**Unknowns:** how the current layout behaves under 400px wide, and whether the app
is already installable.

### 32.1 Save straight to the phone's photos

**What:** on a phone, export ends in the system share sheet with the slide images
attached (the Web Share API with files), so **Save to Photos** puts them in the
camera roll in slide order, ready to select in Instagram or TikTok.

**Why it matters more than it looks:** posting natively from the phone is also how
people add trending audio and in-app text, which no scheduler can do. FlashCC's job
ends at "the right images, in order, on the device".

**Landmine:** file order. Some photo pickers sort by creation time, so images saved
in the same second can appear out of order. Space their timestamps, and test on both
major phone platforms before claiming it works.

**Done when:** a 10-slide export on a phone lands in the camera roll and appears in
the platform's picker in slide order.

### 32.2 What the phone is for

**What:** an installable web app whose phone layout covers **review, text edits,
reorder, layout cycling (`L`), caption, the finishing pass (27.4), approvals (Batch 7)
and export**. Not free-form dragging.

**Why that scope:** precise layout on a 6-inch screen is miserable, and the first
half's research located the time sink in writing and finishing, not in positioning.
Everything on that list is a tap or a text field.

### 32.3 Capture into the idea bank

**What:** share any text, link or image from another app into FlashCC's idea bank.

**Landmine:** an installed web app can register as a share target on Android, but
iOS Safari has not supported that for web apps. Verify current support before
promising it. The fallback on iOS is a personal capture address (an email that files
whatever is sent to it as an idea) or a system shortcut that calls the public API
(31.3) with the user's key.

**Done when:** sharing a link and a sentence from another app on Android files both
as ideas in under five seconds, and iOS has a working path that is documented on the
capture screen.

### 32.4 Offline, honestly

**What:** editing, outline mode, layout cycling, the deterministic caption and
export to images already work from local storage. Make that visible: a quiet offline
indicator, and every AI action disabled with a one-line reason rather than failing
after a spinner.

**Why:** the product is local-first already. Saying so, at the moment it matters, is
free.

### What this batch deliberately does not do

- **No native apps.** An installable web app covers the scope in 32.2.
- **No voice notes transcribed into ideas.** Transcription is a different product, as
  Batch 13 said. The phone keyboard's own dictation already does this.
- **No full canvas editing on phones.** See 32.2.

---

## Batch 33, The first carousel in sixty seconds

**Status:** queued
**Size:** small, because it is assembly. Every piece exists by this point.
**Why last:** onboarding built early shows off features that are still changing.
Built last, it is a short path through the best of everything above, and it is what
turns a visitor who would have opened Canva into somebody who exported a branded
carousel before deciding anything.

### 33.1 Four screens

1. **What do you make?** Eight creator kinds, one tap. Picks a starter kit (25.7).
2. **Your look.** Drop a logo or any photo and get a palette (21.6), or keep the kit's
   default. Name and handle (20.1), each optional.
3. **Your idea.** One sentence, or paste something you already wrote.
4. **Your carousel.** Laid out, branded, furnished, ready to export or to edit.

**Nothing is asked that has a sensible default.** Platform defaults from the creator
kind, framework from the kit, format from the platform.

### 33.2 Two paths through screen 3, and the free one is not worse

- **With a plan:** the idea goes to `/api/draft` in the kit's framework and voice.
- **With no key and no account:** the deck opens in **outline mode** (24.1) with the
  framework's slots as headings to write under, the hook pre-filled from a hook
  formula (25.3) using the idea's own words. Typing five lines produces a laid-out
  carousel.

**Why the free path matters this much:** FlashCC is sold as a time saver for the
user's own creativity, not as an AI tool. A first run that only impresses when a
model writes the copy would contradict the positioning in the first minute.

### 33.3 Empty states that teach one key each

Every empty screen (no projects, no ideas, no brands, no lanes) shows the single
action that fills it and its shortcut, and nothing else. The command palette (24.2)
is mentioned once, on the first empty canvas, and never again.

### 33.4 Measured with people, not telemetry

**Done when:** in moderated sessions with five people who have never seen FlashCC,
at least four export a branded carousel in under sixty seconds from landing, on the
free path. Measured by watching, because the first half's position on analytics
(operational signals yes, behaviour tracking of users no) applies here too.

### What this batch deliberately does not do

- **No product tour overlay.** Empty states and the palette replace it.
- **No signup before the first export.** "Make carousels and export them" is the free
  tier with no sign-in, as Batch 9 committed.
- **No sample deck about somebody else's topic.** The first carousel is about the
  user's own idea, or it teaches nothing.

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

## Explicitly not building, additions

The first half's table stands unchanged. These rows join it, each rejected on
evidence or on an invariant, not on effort.

| | Why not |
| --- | --- |
| **AI image generation** | a second vendor, a push toward one look for every customer, unsettled rights, and a product that is not marketed as AI. Stock APIs (21.2) and generated textures (21.3) cover the need |
| **A template marketplace or community gallery** | template count with a payout problem. Saved user templates (25.5) are the evidenced version |
| **Live components, master slides, auto-layout frames** | live derivation. Stamp and reseal (Batch 20), Match (18.3) and Re-apply template (25.5) do the same jobs as one-shot actions |
| **Real-time co-editing** | the volume reality check in Batch 7 (solo operators at 3 to 5 clients) does not justify a sync engine rewrite. Review links and approvals already cover collaboration |
| **An embed SDK or white-label editor** | PostNitro's channel, and a cousin of the white-label dashboards rejected in the first half |
| **A music library** | licensing liability, and the platforms add audio better in-app (26.4) |
| **An idea generator or trend feed** | the first half struck "running out of ideas" from the evidence. Ideas are not the bottleneck |
| **Performance prediction, best time to post, "top converting" badges** | the virality score in three costumes. Nothing is ranked |
| **Post cards set to other people's names, or fake platform screenshots** | a fake screenshot generator. Post cards use the user's own identity only (19.5) |
| **Model-written testimonials or results** | the Batch 10 fabrication rule. The slot stays empty and the pre-flight catches it |
| **A mandatory free-tier watermark** | contradicts the honest billing promises of Batch 8 |
| **Per-call API pricing** | invariant 7 |
| **Native phone apps** | an installable web app covers the evidenced scope (32.2) |
| **Server-side fetching of pages people link** | Batch 13's rule, restated: licensed stock APIs and the user's own selection are the only routes in |

---

## Evidence caveats, read before treating any quote as load-bearing

**Reddit was hard-blocked for every research pass.** Direct fetch, `r.jina.ai`, `old.reddit`, the
JSON API and search proxies all 403'd. One pass reached it through the PullPush Pushshift
replacement; the others fell back to Capterra, GetApp, SoftwareAdvice and Trustpilot. **Those
populations are more price-sensitive and more vocal than Reddit**, which likely biases the "churn
is all about price" finding upward.

**G2 and TrustRadius 403'd on nearly every fetch**, the richest B2B "cons" corpus was
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
changelogs, raw CSV template files, the GitHub REST API and a redlib Reddit mirror, roughly 250
fetches, after the direct routes were blocked. It also skews Trustpilot/GetApp/AppSumo, because
G2, Capterra-direct and TrustRadius were CAPTCHA-blocked throughout, and it flags its own
unresolved items (Hypefury row limits, a Publer "50 images per cell" claim, a SocialBee 300-vs-1,000
row conflict).

**The first addendum corrected itself on two points.**
It had overcredited a competitor's API by reading its marketing rather than its tutorial, and had
recommended shrink-to-fit before the community layer showed shrink-to-fit is the complaint. Where
the addendum conflicted with the first report, the addendum won, it had the Reddit evidence the
first pass lacked.

**Do not treat "presets run once, nothing is derived" as a differentiator.** A competitor shipped
an AI design agent in March 2026 doing the same LLM-to-JSON-to-editable-layers thing. It is still
the right architecture, it is the structural answer to fixed-box-then-squeeze, but it is table
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
*"How do you organize client content?"*, both located and confirmed live, neither readable.

---

## Evidence for this half, and its caveats

**This half rests on the first half's research corpus plus a small number of fresh
platform checks made on 16 October 2026. It did not run a new research sweep.** Read
every item's "Why" with that in mind.

**Fresh checks, all secondary sources, verify on a real account before shipping:**

- Instagram supports 3:4 (1080x1440) uploads for photos and carousels, and moved the
  profile grid to tall 3:4 tiles in January 2025. Size guides disagree on whether the
  feed itself shows 3:4 uncropped or caps at 4:5. ([Lindsey
  Gamble](https://www.lindseygamble.com/blog/instagram-now-supports-34-aspect-ratio-for-photos-and-carousel-posts),
  [DreamPixelForge](https://www.dreampixelforge.com/blog/instagram-post-size),
  [SocialPilot](https://www.socialpilot.co/es/instagram-marketing/instagram-reel-dimensions))
- Threads raised its carousel ceiling to 20 items in late 2024; at least one scheduler
  documents 10 through the API. ([Social Media
  Today](https://www.socialmediatoday.com/news/threads-users-now-add-up-20-photos-videos/727452/),
  [PostFast API guide](https://postfa.st/api-guides/threads/carousels))
- PostNitro offers a 3:4 1080x1440 size, more than thirteen languages,
  article-to-carousel, and a REST API with an embed SDK. ([PostNitro
  docs](https://postnitro.ai/docs/how-to/set-carousel-size), [PostNitro
  blog](https://postnitro.ai/blog/post/top-features-in-ai-instagram-carousel-tools-postnitro-guide),
  [GTM Directory](https://thegtmdirectory.com/tools/postnitro))

**Pinterest, Bluesky, X and Facebook figures in 17.2 are from memory and marked
approximate.** They do not ship until verified, by the table's own rule.

**Strongest evidence in this half,** carried directly from first-half quotes:
outline mode (24, writing is the biggest time sink), lanes and the finishing pass
(27, "plan formats and lanes ahead", the wall at post three or four), saved
templates (25.5, "Locking 1 template and batching killed 80% of my decision
fatigue"), and a different image per post (21.7, verbatim).

**Least evidenced, and the first candidates for a research pass:**

| Batch | What it rests on |
| --- | --- |
| 23, panoramic carousels | how common the format is, not a complaint about making it |
| 26, motion export | an observed cross-posting habit, no quote about the friction |
| 29, translation | competitor feature parity, no user quote |
| 32.1, save to the phone | reasoning about where posting happens |
| 19, the exact block list | the shapes in the frameworks; no count of which blocks people build by hand most |

**The unlock for that pass is the one the first half named:** `api.pullpush.io` for
raw Reddit JSON. Worth searching for seamless or panoramic carousel how-tos,
carousel to Reels workflows, and translated carousel complaints before committing to
23, 26 or 29.

---

## Where this stands

Eight batches built the product. A ninth made it sellable, a tenth made the AI
deliberate rather than accidental, and Batches 11 to 15 are the AI features that
Batch 10's pipeline was the prerequisite for. What the first eight turned out to
be, in one line each:

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
| 9 | Make the paywall real | An audit first, and five routes that needed different answers |
| 10 | The AI pipeline | A model per task, and two defects the eval found before customers did |

**Three roadmap items turned out to be rules rather than features**, 6.6, 7.6
and 8.5, and all three are now invariants in `CLAUDE.md` with the copy that
states them. They were also three of the cheapest things in this document, which
is worth remembering when the next one is written.

**What is not built is listed below and was rejected on evidence**, not on
effort. That list is the other half of the plan and should be re-read before
anything is added to it.

### The AI batches, 11 to 15

Batch 10 built the pipeline: prompts that can be tested, a model per task, a
cache boundary, brand voice, and an eval harness. It added no feature anybody
would notice. These five are what it was for.

| | The gap it closes |
| --- | --- |
| 11 | Drafting is one shot. Nothing sits between a line and a whole deck. |
| 12 | `posts.caption` has been an empty textarea since Batch 8. |
| 13 | The brief is the only way in, and everybody is working from something. |
| 14 | Voice works, but asks for three pasted posts before it does anything. |
| 15 | Six routes putting words in front of customers, one hand-run script checking any of it. |

All five are built. What they turned out to be, in one line each:

| | Turned out to be |
| --- | --- |
| 11 | Plus a live bug: `/api/hooks` had been broken on every call since Batch 10 |
| 12 | Plus a hashtag filter that took three attempts to get right |
| 13 | Plus a worse bug: `.srt` and `.vtt` were mangled by the FREE path |
| 14 | Plus evidence verification the plan did not ask for |
| 15 | The checks stop being a thing somebody remembers to run |

**The eval harness earned itself four times.** It found the `effort` parameter
breaking hook variants, the alt text preamble, the LinkedIn hashtag famine, and
the fabricated showcase brief in Batch 10. Every one of those would have reached
a customer, and none of them would have been found by reading the code.

**Batch 15 is the answer to that.** Every rule it kept finding things with now
runs on every response, is covered without a key, and cannot be skipped.

Two rules run through all five and are worth stating once rather than five times:
**every route returns words**, never a size, a position or a composition, because
invariant 5 is the only thing standing between this and the layout complaints
that define the category. And **nothing is ranked, scored or graded**, because
the ranking complaint in the research corpus is not about cost, it is about a
machine asserting which of your sentences is better.

**Batches 1 to 20 are done.** Batches 21 to 33 are the rest of the second half
of the plan and are not built yet. The suggested build order is at the end of
this document.

The other open work is `docs/reference.md`
§29, the defect list, which is deliberately not a roadmap item and should not be
folded into one, and the two migrations that wait on billing: `02-pro-gate.sql`
and `09-gates.sql`.

---

## Suggested order and where this stands

**Batches 17 to 20 are built. The rest of 17 to 33 is not.** The numbering groups them by theme; the build
order below is by damage-to-effort and dependency, the same logic that put export
first in the first half.

**Do today, before any batch:** 22.6, the server emoji font. It is one line in the
server image and every emoji in every export is broken until it lands.

1. **Batch 17, formats.** Small, and 3:4 is the most valuable Instagram size FlashCC
   cannot make.
2. **Batch 24, outline mode and the palette.** Attacks the biggest time sink directly,
   and the palette is where every later preset lives.
3. **Batch 18, layout tools.** Lock (18.6) is a prerequisite for furniture.
4. **Batch 20, furniture and identity.** The most repetitive edit in the product, gone.
5. **Batch 19, blocks.** The core of "create everything".
6. **Batch 21, imagery,** shipped together with **30.1, contrast over photos**, because
   photos behind text without that check produce unreadable slides on day one.
7. **Batch 22, typography.** Scope 22.3's text model change first; it is the riskiest
   change in this half.
8. **Batch 25, presets.** Needs 19 to 24 to have anything to assemble.
9. **Batch 27, lanes and the finishing pass.** The batching evidence's direct answer.
10. **The rest of Batch 30, legibility.**
11. **Batch 28, remix.**
12. **Batch 23, panoramic.** After a research pass, per the caveats.
13. **Batch 32, phone.**
14. **Batch 26, motion.** After a research pass.
15. **Batch 29, translation.** Hard dependency on 22.5.
16. **Batch 31, integrations and API.** Each item can ship alone; 31.1 can move earlier
    the day one scheduler's API verifies.
17. **Batch 33, onboarding.** Last on purpose.

| | The gap it closes |
| --- | --- |
| 17 | the 2026 Instagram size, and every other destination, in one export |
| 18 | hand alignment, slide by slide |
| 19 | charts, tables, checklists and code built from rectangles |
| 20 | the same furniture placed by hand on every slide |
| 21 | leaving for an icon, a photo or a cut-out |
| 22 | one coloured word needing two text layers |
| 23 | seamless carousels that one reorder ruins |
| 24 | writing one text box at a time |
| 25 | four frameworks and no saved templates |
| 26 | rebuilding the carousel as a video by hand |
| 27 | planning finished posts instead of formats, and the wall at post four |
| 28 | insights that never become the next carousel |
| 29 | retyping a deck in another language |
| 30 | slides that pass every check and still cannot be read |
| 31 | the copy and paste between FlashCC and the scheduler |
| 32 | the hop from desktop export to the phone |
| 33 | a first run that shows features instead of the user's own carousel |

**Two rules run through all seventeen,** the same two that ran through Batches 11 to
15: **every route returns words**, and **nothing is ranked**. And one rule this half
adds: **every preset is a decision a person would otherwise make by hand**, chosen
by context and cycled rather than browsed. That is how a product with hundreds of
presets keeps fewer buttons than the one it replaces.
