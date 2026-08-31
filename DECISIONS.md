# Decisions & Current State

How to use this file: rewrite **Current state** each session so it's always
short and true. Append to **Decisions** — never edit or delete past entries.
Move things out of **Open questions** into Decisions once settled. Add to
**Rejected** whenever something is ruled out, always with the reason.

---



## Current state

*Last updated: 2026-08-31*

**Collection is unattended and has run every day since 20 August.** No
missing dates, every run `success`, `channels_processed` 40 throughout.
Daily counts run 94–134; the two `weekly` runs wrote 1,370 and 1,301.

**The schedule has drifted badly since 27 August and the cause is not in
this repo.** Runs 22–26 August landed 45–75 minutes after the 06:17 UTC
cron, which is the documented scheduler jitter. The four runs since have
landed 5h42m to 12h31m late. Every one is marked `Scheduled` on GitHub, so
manual dispatches are not masking a dead schedule; `git log` shows
`collect.yml` untouched since Step 9, so the cron was not edited. That
leaves GitHub's own scheduler, which publishes no status and left no trace
of the 27 August drop either.

Nothing has been lost — every date has a row, and a snapshot taken later in
the day differs only in holding a few more hours of views. The exposure is
midnight UTC. A run delayed past it writes to the next calendar date, and on
a Monday `collect.py` would then derive `daily` and skip the 90-day sweep
and the avatar upload for that week. All three failure checks would pass and
Healthchecks would ping, so nothing would report it. The closest approach so
far was 28 August, 5h12m short.

Healthchecks cannot see this. It measures from the last ping rather than
against a clock, so each late run resets the timer to its own hour and the
deadline walks forward with the drift.

**Today's 31 August run had not appeared as of 10:30 UTC.** It is a Monday,
so it should derive `weekly` and write ~1,300 rows. A Monday row at ~100
would mean the run executed and derived `daily`; check 3 compares against
the last successful run of the same weekday *and mode*, so it would take the
wrong reference and pass.

**Front end.** `frontend/README.md` replaced with a reader's guide covering
the stack, the two routes, URL-as-state, the three silent failure modes in
the view query, and the `vercel.json` rewrite. `frontend/.env.example` gained
a comment block excluding the secret key. The root README's Status section
corrected — it still said the project was not deployed — and the live URL
added.

**Next steps:** See `NEXT_STEPS.md`.
---

## Decisions

**2026-08-31 — The live URL is published in the README; discoverable through
the repo, deliberately.**
The 2026-08-28 deployment decision reasoned about a link sent directly in an
application, and chose `robots.txt` on the grounds that the site should work
when sent and not be discoverable by anyone not sent it. Putting the URL in
the root README changes that. GitHub is indexed and the repo is public, so
the link is now reachable by anyone who finds the repository — a wider
posture than that entry assumed, reached by adding a line rather than by
deciding anything.

Accepted on the same argument the original decision made. A portfolio piece
nobody can click is doing less work than one they can, and the repository is
itself the artefact being shown — someone who finds it and follows the link
is exactly the reader this is for. The audience that could plausibly arrive
this way is small and is the intended one.

`robots.txt` stays. It still keeps the site itself out of search results,
which is where an unindexed demo differs most from a published product. What
it no longer does is limit who can find the URL, since the URL now sits in an
indexed file. Stated rather than left implicit: after this change
`robots.txt` narrows the site's own discoverability and nothing else.

**2026-08-31 — `frontend/.env.example` documented rather than created; the
NEXT_STEPS item's stated cause was wrong.**
The item said Vercel offered `SUPABASE_SECRET_KEY` during import because it
found only the root `.env.example`, and prescribed creating one in
`frontend/`. Checking before writing the commit message showed the file was
already there — committed on 2026-08-21 with the scaffold, holding the
correct two `VITE_` variables. So Vercel read the root file *despite* the
frontend one existing, which means its import scan reads the repository root
regardless of the configured root directory.

The prescribed fix could therefore never have worked, and creating a file
that already existed would have closed the item while leaving the behaviour
unchanged. Nothing was at risk either way: the offered boxes were empty and
the names carry no `VITE_` prefix, so no value could have reached the
browser.

What was actually added is a comment block naming the secret key as
excluded, above the two variables. Real but different value — a comment is
read by a person setting the project up, and says why an absence is
deliberate rather than an oversight. It does not stop Vercel offering the
wrong variable on a future import.

Recorded because the item is now deleted from NEXT_STEPS, so without this
entry the false premise would be the only surviving account. Third instance
of the pattern this file already names — the Vercel SPA rewrite and the
avatar 429 were both conclusions whose stated reasoning had gone untested.
First time it was caught before acting rather than after: the check cost one
`git log` and the alternative was a commit message asserting a fix that had
not occurred.

**2026-08-28 — Deployed to a public URL, with `robots.txt` disallowing all
crawlers.**
The API Terms review on 2026-08-27 accepted three conflicts — aggregation
across 40 independent channels, retention beyond 30 days, and the Outlier
Score as a derived metric — on the grounds that this is a prototype
demonstrated rather than published. A live URL is a different posture from
screen-sharing in an interview, so the reasoning is revisited here rather
than assumed to carry over.

Three options were weighed. Not deploying at all keeps the surface smallest
and leaves the GitHub repo as the artefact, which is already substantial.
Password protection removes public access entirely but puts friction in
front of a recruiter opening a link from an application. Deploying with
`noindex` sits between them: the link works when sent, and the site is not
discoverable by anyone not sent it.

Chose the third. A live URL is what makes an application concrete, and a
portfolio piece nobody can click is doing less work than one they can.
`robots.txt` costs one file and keeps the site out of search results, which
is where an unindexed demo differs most from a published product.

Stated plainly rather than dressed up: `robots.txt` is a request, not access
control. Anyone with the URL can open the site, and a crawler that ignores
the file will index it anyway. It narrows discoverability, not access, and
that is the whole of what it does.

Host is Vercel. All three candidates — Vercel, Netlify, Cloudflare Pages —
are free at this scale and deploy on `git push`, so the decision turned on
the one requirement that could break the site: every route must rewrite to
`index.html`, or a direct link to `/category/teams` returns 404. Vercel
handles that for a Vite SPA without configuration, where the other two need
a `_redirects` file. Choosing the option that removes a failure mode rather
than the one that asks me to configure it correctly.
*Annotated 2026-08-28 — the premise was wrong. Vercel does not rewrite
SPA routes for a Vite project without configuration. A direct request
to `/category/teams` on the first deploy returned 404, and the fix was
`frontend/vercel.json` with a single rewrite of `/(.*)` to
`/index.html` — the same shape of file Netlify and Cloudflare were
marked down for needing. The decision stands, since the host is
deployed and working and there is no reason to move, but it now rests
on nothing that distinguished it from the other two.

Worth keeping as method rather than as trivia. The conclusion was
tested and the reasoning was not: had `/category/teams` been reached by
clicking "Show more" it would have worked, because React Router never
asks the server for anything. Only a fresh URL entry sends a real
request for a path with no file behind it — which is precisely the case
of a recruiter opening a link from an application. A decision's stated
reason is itself a claim, and this is the second time in this file that
checking the actual signal beat reasoning from the design.

Incidental confirmation from the same test: `robots.txt` still serves as
text despite the rewrite matching every path, because Vercel checks for
a real file before rewriting. Had it not, the file would have returned
homepage HTML and been silently inert.*

**2026-08-27 — `count: 'exact'` measured after materialising; the exact row
count stays.**
Left open when the materialised view landed — the count was never
re-measured, and the `pageSize + 1` has-more fallback was parked on the
assumption it might still be needed. Measured now, against 12,438 rows with
both arms live: 0.875 ms, an index-only scan on
`scoring_view_value_idx` with zero heap fetches, against `anon`'s 3-second
budget.

"Page X of Y" stays. The fallback stays parked and is now recorded as
unnecessary rather than pending. Worth noting the plan rather than only the
number: the count is answered entirely from the index, on the leading
`(is_short, "window")` columns, which is the index shape the 2026-08-23
decision chose deliberately and the reason `category` was left out of it.

**2026-08-27 — "BikeTube" dropped; the product is named plainly and set in
a neutral mark.**
The name was a pun on the inner tube, with a yellow wordmark and a tagline
beside it. Replaced by "CYCLING CONTENT TRACKER" alone — one element, caps,
neutral weight, no accent colour, identical at every breakpoint.

The reason is about audience rather than taste. This is shown to companies
as a work sample, and a demo carrying its own branding competes visually
with the brand of whoever is looking at it. A plain descriptive mark gets
out of the way and lets the product be the thing on screen. The name also
stopped doing any work once it was clear nobody would ever use this
conversationally.

Retires a standing item outright rather than deferring it: YouTube's brand
guidelines ask that third-party names not incorporate "Tube", which was
parked as a pre-publication concern. There is now nothing to review.

Two knock-on effects. Yellow is freed up — it already meant "this category
is selected" on the category page's button row, and a colour meaning two
things on one product is worse than a duller wordmark. And the caps are set
in CSS with `uppercase` while the JSX carries sentence case, so the rendered
text and the readable source stay separate and a future casing change is a
class rather than a retyped string.

Considered keeping a second descriptive line beneath — "YouTube performance
in cycling and triathlon" — since the header is the only place the product
explains itself, there being no page heading above the sections. Declined in
favour of the single element, which is the more consistent reading of the
neutrality argument.

**2026-08-28 — Avatars stored in Supabase Storage, written on weekly and
backfill runs only.**
Built for a different reason than the one NEXT_STEPS recorded, which is
worth stating rather than smoothing over. That item said to build a storage
bucket only if the 429s recurred on a page a visitor loaded once. They did
not. What recurred was the same development-traffic pattern that produced
the original measurement, and rebuilding on a second observation identical
to the first would not have been responding to new evidence.

The actual reasons are different and did not need the 429 at all.
Deployment is close, and a deployed site hotlinking a third-party CDN has a
dependency it does not control — one that has already demonstrated it will
rate-limit. And it settles the thumbnail half of the YouTube Terms
question, which had been parked since the review on 2026-08-27. Recorded
this way because the trigger and the justification came apart, and the
justification is the honest one.

Weekly rather than every run, reversing the 2026-08-23 decision. That
decision moved the write to every run so a newly added channel would not
wait until Monday for an avatar. Downloading and uploading 40 images daily
is real work for data that changes rarely, and the wait is now accepted
explicitly: a new channel has no avatar until the next weekly run, and the
cards already render without one. `collect_channel()` still returns the
avatar URL on every run — it comes from an API response already being
fetched — and only the write-back is gated.

Failure keeps the existing value. A failed download, a non-200, or a failed
upload skips that channel without calling `.update()`. A stale avatar beats
a broken image, and beats overwriting a working URL with nothing. The block
stays before the three failure checks for the same reason it always did:
the metrics are the product and the avatar is decoration, so they should
not share a failure path.

Two things from building it. The installed `storage3` version takes
`"upsert": "true"` as a *string* in `file_options`, because the flag becomes
an HTTP header rather than a Python argument — a Python `True` looks correct
and fails at runtime. Reading the installed package's source rather than
assuming the signature is what caught it. And the first real run had one
channel fail on a connection reset mid-collection, so 39 of 40 uploaded and
Unibet Rose Rockets kept its YouTube URL. That is the failure path working:
one transient network error, one channel skipped, no aborted run and no
cleared value. Second connection reset this project has logged, after the
one video in `fix_shorts_classification.py`.

The bucket is infrastructure that lives outside the repo. It is not in
`schema.sql` because Storage buckets are not SQL objects, so a rebuild from
this repo needs it created by hand — noted in the README, because without it
uploads fail quietly and the site comes up with no avatars and no error.

**2026-08-27 — The dead man's switch fired for real; the grace period stays
at 4 hours.**
The scheduled run did not happen. Not a failure — an absence: no `job_runs`
row at all, because the workflow never started and so never reached the code
that records its own failures. This is the one failure mode `job_runs`
structurally cannot capture, and the exact case the 2026-08-15 monitoring
decision was written for. Healthchecks went amber at 07:14 UTC and red at
11:14, which is how it surfaced.

Cause is unverifiable by design. GitHub leaves no trace of a dropped
scheduled run — no entry, no log, no notification. The near-certain
explanation is documented best-effort scheduling under load, consistent with
every run so far landing 45–90 minutes late. The alternatives do not fit:
the 60-day inactivity rule needs sixty days without commits and there was a
push today, and public repos have unlimited Actions minutes.

Recovered by manual dispatch: run 11, `mode = 'daily'` correctly derived
from the date, 40 channels, 105 rows, all three checks passed. Nothing was
lost. The 8-day window meant the next run would have re-collected everything
anyway, and the only real exposure was day-7 precision for videos published
20 August — which is what the day-8 buffer exists for.

Widening the Healthchecks grace period was considered and rejected. It would
not make the job more likely to run; it would only delay the report that it
had not. The 4 hours exists to absorb GitHub's start-time jitter, not to
tolerate a missing day, and widening it converts a caught failure into a
later-caught one. The 2026-08-19 reasoning — enough slack for a late start,
not enough for a lost day to pass unnoticed — stands unchanged.

A second cron entry a few hours after the first was also considered and
parked rather than rejected. The job is idempotent — `video_snapshots`
upserts on `(video_id, snapshot_date)` — so a duplicate run is a harmless
no-op and a dropped first run would be covered by the second. Cost is one
line and a doubled quota spend still under 1% of the daily allowance. Not
built on one occurrence in eight days: a retry added to a pipeline that has
failed once is a guess, and the same discipline that measured the timeout
and the 429 before acting applies here. Revisit if it recurs within a
fortnight.

Worth keeping as method, and as an interview answer. The switch was built on
the argument that error handling cannot catch the job never running. That
argument was theoretical for twelve days and is now demonstrated. A
monitoring system that has never fired is indistinguishable from one that
does not work.

**2026-08-27 — YouTube API Terms reviewed; three conflicts found, accepted
for a prototype that stays off a public URL.**
Closes the standing NEXT_STEPS item. Everything collected here is
Non-Authorized Data — an API key, public videos, no user credentials — which
is the category the strictest rules apply to.

The thumbnail question was already closed and the review confirmed it:
thumbnails link back to the video on YouTube, which is what the terms ask.

Three conflicts, in ascending order of how much they matter.

*Aggregation.* API Data may only be aggregated across channels under a
single content owner. This product aggregates 40 independent channels by
design; that is the concept, not an implementation detail.

*Retention.* Non-Authorized statistics must be deleted or refreshed within
30 days. `video_snapshots` only grows, deliberately — and refreshing is not
available as a remedy, because the API holds no history and a day-7 reading
cannot be re-fetched later. The property that makes this data worth
collecting is the property the rule restricts.

*Derived metrics.* The one nobody had flagged, and the one that matters.
Clients must not use API Data to create derived metrics, and the policy's
own example names a score factoring in views and likes. That is the Outlier
Score, described almost exactly — the headline feature and the thing the
locked scoring spec was built around.

A sanctioned path exists as of June 2026: an API Compliance Audit with the
Analytics & Reporting use case, which permits custom scores and extended
statistical storage for accepted applicants. Not pursued now. The prototype
stays local, demoed by screen share rather than a public link, which removes
the user-facing requirements (privacy policy, Terms link, branding
attribution) entirely. Retention and derived metrics still bind regardless
of audience — accepted knowingly. Realistic exposure is quota reduction on
an API project using ~120 of 10,000 daily units.

The audit becomes the right move the moment this is adopted internally by a
company, because that is a commercial entity using it operationally and
there would be a named use case to put on the form. Recorded in full rather
than summarised as "reviewed, fine", because finding your own headline
feature in a policy's prohibited examples is worth being able to describe.

**2026-08-27 — Avatar images 429 rather than fail; measured before building
anything.**
Avatars vanished from most cards. Two diagnoses were reached and both were
wrong. The first was an extension: the network panel showed
`ERR_BLOCKED_BY_CLIENT`, and the DOM carried Bitdefender's
`bis_skin_checked` attributes on every element. Incognito killed that
theory — extensions are off there and the avatars were still missing. The
second was referrer policy, on the reasoning that a URL loading in a direct
tab but failing from the page differs by the `Referer` header. Reading the
actual response headers killed that one too:
`Access-Control-Allow-Origin: *`, so Google is explicitly happy to serve
cross-origin.

The real answer was in the status code nobody had read yet: **429 Too Many
Requests**, with `Content-Type: text/html` — an error page, not an image.
Rate limiting, per IP, caused by days of reloading the same site during
development. The one avatar that did render came from disk cache.

Measured rather than assumed: 20 minutes with the site closed, then a cold
incognito load of the homepage. All 40 avatars returned. No action.

Two things worth keeping. The proposed fix was one image per channel rather
than one per video — sound-sounding and already true, since the browser
deduplicates identical `src` values and a page of 20 Trek cards makes one
request. The saving being reached for was already there. And two plausible
causes were diagnosed from the same screenshot before anyone read the status
code, which is the third time in this file that reading the actual signal
beat reasoning from the symptom. Storing the images remains the right fix
if this ever recurs on a page a visitor loaded once — it is also the answer
to the parked YouTube Terms thumbnail question — but a 429 you caused
yourself does not justify a storage bucket.

**2026-08-27 — `window` stays at `90d` now the 7-day arm exists, reversing
the expiry note on the 2026-08-21 default.**
That entry set `90d` as a temporary default and dated its own reversal: back
to `7d` once the arm was live, since trending is the more interesting view
for a marketer. The arm is live and the default stays.

The original reason is gone — the 7-day window no longer returns four empty
categories. A second one replaced it. The 7-day pool covers only
publications since collection began, so sections run thin (2 videos in
triathlete Shorts against 3 card slots) and baselines are thin by
construction, putting a Provisional badge on nearly every card. A landing
page of sparse sections and orange badges is a poor first impression however
honest it is, and this is a portfolio piece whose first impression is the
product.

Dated rather than permanent, for the same reason the original was: revisit
once the pool reaches its rolling equilibrium at ~30 days of publications
and baselines start clearing 10 reference videos. The note about a temporary
default quietly becoming permanent applies to this entry exactly as it
applied to the one it supersedes.

**2026-08-27 — The 7-day arm added; two places where matching the 90-day arm
would have been wrong.**
Built after four preconditions were checked rather than assumed: the first
real Monday run succeeded, 124 day-7 readings existed across 27 channels and
all eight category/format sections, the Shorts HEAD check was still
classifying correctly, and day-7 coverage was 100% complete for every
publication date in range.

The arm is a second `union all` block inside `scoring_view_live`, same 16-
candidate pooling and same column list. Three substantive differences, two
of which look like copy-paste omissions unless the reasoning is stated.

*No 30-day floor on the baseline.* The 90-day arm floors at 30 days because
its lifetime proxy has not finished accumulating on a young video. A day-7
reading is frozen when taken, so it is equally valid regardless of the
video's age today. This is the 2026-08-19 decision resolved per window,
arriving in code for the first time.

*Two separate 30-day rules, and the placement of the second is load-bearing.*
Which videos appear in the list is a 30-day recency rule on the day-7
reading, applied on the final SELECT. Which videos form a baseline is every
day-7 reading within 24 months, no recency limit. Filtering in the numerator
instead would collapse both into one and compute every median from whichever
handful of videos reached day 7 this month — no error, plausible number, a
channel in decline compared only against its own decline.

The part worth keeping is that this could not be caught by testing. Every
day-7 reading in the database is currently inside 30 days, so both
placements return byte-identical rows today. It would first diverge in
mid-September, by which point nobody is reading this SQL. Reading the code
was the only check available, which is the opposite of this project's usual
method — run it rather than read it — and the exception is worth naming: the
rule holds when a bug produces different output, not when it produces the
same output on today's data.

*Title and thumbnail come from the latest snapshot, not the day-7 one.* The
numbers are deliberately frozen; the display fields are not. Considered
reading both from the day-7 row, which is simpler and already joined. The
deciding argument was not that the thumbnail would go stale against YouTube
but that the same video would show a different thumbnail depending on the
window filter — the one place the two arms would visibly disagree about the
same video, and it would read as a bug.

Two findings from applying it. The file's `drop view if exists
scoring_view_live` at line 1 now fails, because the materialised view
depends on it — a pre-existing fault the edit exposed rather than caused,
harmless because it fails loudly. Fixed by dropping the dependent object
first. And `percentile_cont` returns `double precision` rather than
`numeric`, so `outlier_score` is a float on both arms; irrelevant for
ranking and display, but it makes `round(x, 2)` an error without a cast.

Verified after: 372 rows over 124 videos, exactly 3 per video; maximum pool
size 15 and never 16, which is the off-by-one the 2026-08-21 entry describes
as invisible in the output shown to be absent; 17 rows with a null score,
all channels with one day-7 video in that format, where self-exclusion
correctly leaves nothing.

**2026-08-23 — `avatar_url` written on every run, not only on Mondays.**
The 2026-08-17 decision that added the column left the write unscheduled.
Monday was the obvious home, alongside the 90-day sweep — avatars are
current-state data and refreshing them weekly is ample.

Every run instead, for a reason that has nothing to do with freshness: a
newly added channel would otherwise have no avatar until the following
Monday, and the gap is visible on every card that channel appears on. The
cost of the alternative is one extra field read per channel per run against
data already being fetched.

Three implementation points worth recording. The write uses `.update()
.eq()` rather than an upsert, because the NOT NULL constraints on the other
`channels` columns make a partial upsert fail — an upsert supplies every
column or none. Channels whose API response carries no thumbnail are
skipped rather than written as null, so a missing avatar is an absence
rather than a recorded fact. And the step sits *before* the three failure
checks, so a failure fetching an avatar cannot affect whether the run's core
metrics are published — the metrics are the product, the avatar is
decoration, and they should not share a failure path.

**2026-08-23 — Search added, and the dividing rule turns out to be structural
rather than a one-off.**
A case-insensitive substring match on the title, carried in the URL as `q`,
debounced, active on both routes. `.ilike('title', '%q%')` and nothing more.

Where it sits is the part worth recording. The 2026-08-21 channel-exclusion
entry drew a line between filters that answer *how do we measure* — window,
metric, comparison, format — and filters that answer *what is relevant to me*.
That line was drawn to justify one control. Search is unambiguously the second
kind: "show me Ironman content" is a relevance question, not a measurement one.
So the rule now carries three controls and has stopped being a justification
for a single decision — it is the actual structure of the filter bar. A rule
that holds for a second case it was not written for is worth more than the
case it was written for.

It also solved the layout problem it might have created. A search input needs
width, and a full-width row below the rule gives it width at every breakpoint
without competing with four dropdowns already tight at 375px.

The ceiling is recorded deliberately rather than glossed, because knowing it is
the more useful thing. Substring matching finds "gravel" inside "gravelbike"
but has no synonyms ("bike" will not find "bicycle"), no typo tolerance, no
relevance ranking — results stay in outlier-score order — and no knowledge of
the sport, so it cannot know Unbound is a gravel race or Kona an Ironman one.
Postgres full-text search would add stemming and ranking and still not know
that; semantic search over embeddings would, and is weeks of work.

Substring is the right level here partly for a reason specific to this dataset:
YouTube titles are keyword-stuffed by design, because creators optimise them
for search. Literal matching works better on titles than it would on prose, and
most gravel videos do contain the word.

Descriptions are not searched because they are not collected — the 2026-08-16
decision declined them on the grounds that only the parked "why did it work"
layer would use them. Worth noting the consequence found while deciding this:
adding them later would only cover videos inside the collection window, so a
2024 video from the backfill would never get one. That makes descriptions a
worse "add later" candidate than they appear, though it does not change the
decision.

Two implementation notes. A local input buffer holds what is being typed
between keystrokes and the debounced URL commit — a deliberate, scoped
exception to filters-live-in-the-URL, since the canonical value is still `q`
and the buffer holds only what is in flight. And the debounced commits use
`replace` rather than `push`, because a pause mid-word would otherwise write a
history entry and the back button would step through fragments of a word.
Clearing uses `push`, being a deliberate action.

**2026-08-23 — The filter bar collapses to dropdowns below laptop; wording
stays identical across breakpoints.**
Eleven buttons across four groups do not fit a phone. Below laptop each of the
four measurement filters becomes a single dropdown showing its current value,
four across in one row, each keeping the small uppercase label it has on
desktop.

The labels were the decision, not the dropdowns. Stripped of "COMPARISON",
the word "Absolute" is a word with no context to a first-time visitor — the
value alone reads as a fragment. Keeping the caption costs vertical space and
buys comprehension, which on a page a recruiter may open cold is the better
trade.

Option wording stays byte-identical to desktop: "90-day window", not "90d".
Shortening only on mobile was offered when the labels crowded at 375px and
declined — one vocabulary is one thing to explain in an interview, and a
prototype that is slightly tight is better than a prototype that says two
different things depending on the device. The crowding was fixed with equal
column widths and a shared label height instead, which is where the fault
actually was: four buttons each sized to their own text made the row ragged,
and the ragged row was what made the labels collide.

Desktop keeps the visible-options rows. Two layouts rather than one was
considered a cost and accepted: seeing all three metrics at once is genuinely
better when there is room, and the desktop version was already built and
working.

The implementation constraint that mattered is one piece of state holding which
panel is open, not one boolean per dropdown. Five panels — four filters plus
Channels — able to be open simultaneously is where this would have broken.

Alongside it, the category page's "<< Back to home" becomes a house icon below
laptop. It was the longest item in that row and the only one that is not a
category, so shrinking it both freed the space that got the four category pills
onto two lines and separated navigation from filtering visually as well as
functionally.

**2026-08-23 — The homepage built; card counts split by format and breakpoint,
and one grid bug found twice.**
Four sections, four parallel queries, each rendering and failing on its own so
one slow or broken section cannot blank the page. Each section owns its fetch
rather than the page gathering all four — parallelism by construction rather
than by a Promise.all that would have to be kept parallel deliberately.

Two things were carried over rather than reinvented. The homepage reads its
section order from the same `CATEGORIES` list the category page's button row
uses, so the two orderings cannot drift. And `getCategoryVideos` gained an
optional page-size override rather than `getPageSize()` gaining a second
meaning: the format/page-size relationship stays single-sourced in the helper,
and "3 regardless of format" is a caller's need expressed at the call site. The
same override suppresses `count: 'exact'`, since four sections each counting
the whole view for a number the homepage never displays is four full executions
per page load.

Card counts ended up format- and breakpoint-dependent: long-form 1/3/3/3,
Shorts 3/3/5/5 across mobile/tablet/laptop/wide. Long-form stacks on mobile
because a 16:9 thumbnail at a third of a 375px screen is ~110px wide — too
small to read a title against — while a portrait Short at the same width is
still legible. The same reasoning that split page size 20/24 on the category
page, arriving again from a different direction: the two formats have different
shapes and a single number cannot serve both. Shorts fetch 5 and hide the last
two below laptop in CSS, so the row count is never read from the viewport in
JavaScript and there is no screen-size state to keep in sync.

The instructive part was the overlap bug, because it was diagnosed wrong first.
Cards spilled across each other on narrow screens; the first fix treated it as
spacing and did not hold. The tell was in the numbering: the broken sections
started at #2. The #1 card was not in its own grid cell at all — it was
painting over its neighbours and past the container's edge, while sections
whose #1 had a shorter title rendered correctly.

That is the 2026-08-21 Shorts grid fault exactly: a card wider than its track
overflows, and later grid items paint over earlier ones. Same cause, opposite
origin — that one was a hardcoded `w-56` fighting a narrower cell, this one a
grid item refusing to shrink below its content's intrinsic width. Both are the
card and its container disagreeing about who decides the width.

Worth recording that the earlier entry's lesson was available and still missed
on the first pass. "Three symptoms in one component are usually one cause" was
written down in this file, and the first response was still to add spacing where
the symptom appeared. Reading the computed width against the track width — two
minutes in DevTools — is what found it. The general form: when a layout looks
like a spacing problem, check whether an element is the size it thinks it is
before adjusting the space around it.

Section containers were added because the four categories ran together and the
Show more button floated between two sections with no visible owner. Bordered
container per section with a centred header bar, the button inside it. A bright
fill was proposed and declined: yellow already means "selected category" on the
category page's button row, and a colour meaning two different things on one
product is worse than a duller separator. Structure and border do the work
instead.

**2026-08-23 — Provisional badge changed from muted grey to orange, reversing
the 2026-08-21 styling.**
The original reasoning was that the badge is a caveat rather than a warning and
must not compete with the Outlier Score badge opposite it. That reasoning still
holds and is not withdrawn. It simply lost to an observation from looking at
real thumbnails: grey on a bright image is unreadable, and a caveat nobody can
read is not a quieter caveat, it is an absent one.

Orange is deliberately a warning colour and that is a cost, accepted. The badge
is kept visually lighter than the score badge so the ranking still wins the
eye — the constraint the original decision was protecting survives even though
its implementation did not.

Same pattern as the channel exclusion filter reversal two days earlier: a
defensible design argument overturned by a single concrete example from looking
at the actual product rather than at the reasoning.

**2026-08-23 — Scoring moved to a materialised view; the live-view decision's
own escape clause fired.**
The category page was extended to accept a selection of categories rather than
one, which turned `.eq('category', x)` into `.in('category', [...])`. Two
categories timed out. Four categories timed out on the row fetch alone, with no
count involved: 3,072–3,376 ms against `anon`'s 3-second budget.

The first reading was that the exact count was at fault, since it forces the
full baseline computation with no LIMIT to bound it. That was true but not the
cause. `anon` carries `statement_timeout = 3s` and one category was already
taking ~1.8 s — 60% of the budget, entirely lineair in category count. The cliff
was simply much closer than anyone had measured. `authenticated` carries 8 s,
which is why nothing looked wrong when queries were tested by hand in the SQL
editor: the two roles were never compared.

So this was not a bug introduced by the category selector. It was an existing
condition the selector made visible, and `video_snapshots` grows daily, so it
was arriving regardless.

Raising the timeout was rejected. The worst observed run was 3,376 ms; a 3.5 s
limit leaves 124 ms of headroom against a measured 300 ms run-to-run spread, so
the page would work roughly half the time with no pattern — worse than failing
consistently, because it never reproduces on demand. And 3.4 s is a bad page
whether or not it fits: a recruiter clicking the link waits three and a half
seconds at a blank screen. Raising the limit does not make the page faster, it
removes the only signal that it is slow.

This is the clause the 2026-08-19 live-view decision wrote for itself: measure
it once real data exists, and switch only if it is actually slow. On 2026-08-21
that clause was tested and correctly *not* triggered — the cause was the query,
the LATERAL fix took it from 4,503,624 to 6,187, and the live view stood. This
time the query has already been optimised 730× and is still over budget, and a
live view structurally cannot be indexed on its own output. The lever is gone;
the remaining one is storage.

Two objects rather than one. `scoring_view_live` holds the query, byte-identical
to what it was — same CTEs, same precomputed pools, same `security_invoker =
true`, same absence of ORDER BY, only the name changed. `scoring_view` is a
materialised `select * from scoring_view_live` and takes the old name, so
nothing in `frontend/` changes: no query string, no column name, no contract.
The scoring logic still lives in exactly one place; the materialised view is a
stored copy of its output, not a second implementation that could drift. The
rename also *is* the rollback — nothing was deleted at any point.

The indexes are where the speed actually comes from, and the thing the live view
could never have. A unique index on `(video_id, "window", metric)`, which both
enforces the shape the view is built to guarantee and is what `REFRESH
CONCURRENTLY` requires. Then one index per sort column, `(is_short, "window",
metric, value desc nulls last)` and the same on `outlier_score`, with nulls-last
written into the index definition so it matches what the front end actually
asks for — a DESC index defaults to NULLS FIRST, and without the match Postgres
falls back to sorting on top of the index rather than reading rows out in final
order.

`category` is deliberately not an index column. With four possible values it
barely narrows anything, and leaving it out lets Postgres apply
`.in('category', [...])` as a filter while walking an index already in sort
order — so a merged multi-category selection is still one ordered scan rather
than a scan followed by a sort. The feature that broke this is the feature the
index shape is designed around.

Measured after: four categories, long-form, Relative — the case that timed out —
is instant. `select count(*)` returns 11,970 immediately, which is the query
that could not finish at all. All four filter combinations verified in the
browser rather than assumed, since Shorts and Relative exercise different
indexes from the long-form Absolute default.

The staleness objection is answered by machinery that did not exist on
2026-08-19. `collect.py` calls `refresh_scoring_view()` after its three failure
checks pass and before the Healthchecks ping. A run that failed its checks
cannot publish its data; a failed refresh writes `status = 'failed'` with an
`error_message` naming it and suppresses the ping. A broken refresh is exactly
as loud as a broken collection run, because it travels the same path. The
original objection was correct on the facts and is now obsolete on the
circumstances — worth separating, because the reasoning was never wrong.

Two things accepted openly. `refresh_scoring_view()` is SECURITY DEFINER,
necessarily: refreshing requires ownership, and `service_role` does not own the
view. This is the deliberate version of the object rejected on 2026-08-21 —
one function, one fixed statement, `search_path` pinned, EXECUTE revoked from
PUBLIC and granted to `service_role` alone. The distinction that decision drew
is exactly this one: a definer object is a hole when it is unintentional and a
controlled gateway when it is designed as the only way in.

And RLS does not apply to materialised views, which cannot be
`security_invoker` — they read the underlying tables as their owner. It exposes
nothing new, since `anon` already holds SELECT on all three tables directly and
all of it is public YouTube data. But it is a genuine deviation from the
two-layer model rather than a technicality, and it needs re-examining if any
table this view reads ever holds something `anon` should not reach directly.

Not yet verified: the refresh call inside `collect.py` has never run. The first
scheduled run to exercise it is tomorrow, 24 August — which is also the first
real Monday for the `weekly` path, so that run tests two untried paths at once.

Worth keeping as method. The measurement that mattered was not of the failing
query but of `pg_roles`: two roles with different timeouts is why a slow query
looked fine when tested by hand and failed in the browser. And the instinct on
seeing a timeout — raise the limit — would have converted a loud failure into a
quiet one on a page that was genuinely too slow. Same shape as the 2026-08-21
timeout, where reaching for the materialised fallback would have preserved a
query doing 6,000× more work than it needed to. The answer differs; reading the
cause before reaching for the limit is what both have in common.

**2026-08-21 — The Shorts grid bug was one fixed width, not three layout
faults.**
Three symptoms: no gap between cards, the duration badge clipped mid-text,
and the Provisional badge cut off by the neighbouring card. They looked like
separate spacing and overflow problems and were one cause.

`VideoCard` carried a hardcoded `w-56` (224px) on its outer element,
untethered to the grid track it actually occupies. That happened to
approximate long-form's track width at 4 and 5 columns, so long-form looked
correct. Shorts runs 3/4/6/6 columns, where a track is ~147px at six across
and ~104px on mobile — so the card rendered at 224px regardless and spilled
past its own cell. A block element with an explicit width does not shrink
into a narrower grid cell.

That single overflow produced all three symptoms. It consumed the gap
visually, so `gap-4` appeared broken while being entirely correct. And later
grid items paint over earlier ones, so the next column's card covered whatever
sat near the overflowing card's right edge — the duration badge at the bottom,
the Provisional badge at the top. "Clipped" and "cut off by the neighbour"
were the same overlap at two corners.

Fix was `w-56` → `w-full`, letting the card take the width its cell gives it
and deriving height from the existing aspect-ratio classes. Nothing else
changed; the spacing resolved on its own once the card stopped fighting its
own grid cell.

Worth keeping as method: three symptoms in one component are usually one
cause, and the instinct to fix each where it appears — add gap, shrink the
badge, clip the image — would have papered over a card that was still the
wrong width, and left the bug waiting for the next breakpoint or column
count.

**2026-08-21 — Channel exclusion filter added, reversing the park earlier the
same day.**
Parked hours earlier with the argument that the product already solves this:
the Relative toggle exists precisely so large channels don't dominate, so
seeing GCN and Red Bull Bike at the top under Absolute was the system working
as designed.

That argument was wrong, and the counter-example killed it. Red Bull Bike
tops the Shorts list under Relative too — and correctly, because those videos
genuinely outperform that channel's own normal. The score is right. The
problem is that Red Bull Bike's content is BMX and downhill, a specific niche
most cycling brands don't operate in, and Malachi Cashmore's is absurdist
humour that many brands would not want to be compared against. Neither is a
scoring failure. Both are a relevance failure, and no measurement filter can
express relevance.

This is the distinction worth carrying: window, metric, comparison and format
all answer *how do we measure*. Exclusion answers *what matters to me*. Those
are different questions, which is why the control sits on its own row rather
than becoming a fifth measurement group.

It is also a better interview answer than the park would have been. "The score
says this BMX video did extremely well. For a road brand that is still noise,
so the user can switch the channel off" is marketing thinking, which is one of
the three things this project exists to demonstrate.

Recorded with the reversal intact rather than rewritten, because the reasoning
turning around mid-session is the useful part. The original park was a
defensible call on the evidence available; a single concrete example from
someone who knows the sector overturned it. Same pattern as the duration
heuristic: the domain observation beat the argument from design.

Cost was low and stays low: one WHERE clause, one URL param, no change to the
scoring view or the schema. Excluding a channel changes no other video's
score, because baselines are per channel — that independence is a consequence
of scoring relative to a channel's own median, not a coincidence.

**2026-08-21 — Exclusions in the URL, not inclusions; all channels on by
default.**
The param carries only the channels switched off. A bare URL therefore stays
short, since a user typically removes a handful rather than selecting a few,
and an absent param unambiguously means "everything".

Excluded channels are shown as removable chips beside the control rather than
being folded into a count. Without them a filtered list is indistinguishable
from a short list, and a user who forgets they are filtering reads missing
data as a bug. The chips make the state visible where the consequence appears.

**2026-08-21 — Page size is 24 for Shorts and 20 for long-form.**
Shorts are portrait, so more fit per row at the same width. 24 divides
cleanly into every breakpoint's column count — 6, 6, 4, 3 — while 20 leaves a
ragged last row on most of them.

The consequence is that a page number means something different per format:
page 2 is #21–40 on long-form and #25–48 on Shorts. Two things follow. The
page size must live in one helper used by both `.range()` and the rank
offset — if those diverge, videos are silently skipped or repeated between
pages and the list looks entirely plausible. And the existing page-reset rule
gets harder: page 5 of Shorts can reach further than page 5 of long-form
exists, so a filter change that kept the page number could land on nothing.
That rule was already built into the filter bar, which is why this is not a
bug.

**2026-08-21 — The Outlier Score is a badge on the thumbnail, not a fourth
statistic.**
Top-left of the thumbnail, shown only under Relative, formatted `15.9×`.
Considered placing it in the row of views/likes/comments beneath the title,
which is marginally simpler to build. Rejected on three grounds.

It is the product's differentiator, and sitting fourth in a row of counts
makes it read as another count rather than as a judgement about the video. It
is the only value that appears and disappears with a filter, so a row of four
numbers would jump on every comparison toggle while a badge has its own layer.
And it demos better: `15.9×` on a thumbnail is legible at a glance to someone
watching over your shoulder; the same number in a statistics row needs
explaining.

A null score shows no badge at all. Displaying `0.0×` was suggested and
rejected: null means no valid baseline exists, which is not a score of zero,
and `0.0×` on a video with 40,000 views reads as a broken product. The
Provisional badge on the opposite corner covers the case, so the card still
communicates something — the same reasoning that makes `nullsFirst: false`
a hard requirement.

`preview.png` does not show the score because it was drawn under Absolute,
where the question does not arise.

**2026-08-21 — Tailwind v4, installed via the Vite plugin rather than the v3
PostCSS route.**
v4 uses a Vite plugin and a CSS-first config — one `@import "tailwindcss"` —
with no `tailwind.config.js` and no `postcss.config.js`. Most material online
still describes v3, so the installation route had to be specified rather than
left to a search.

Verified rather than assumed: a production build was run and the emitted CSS
checked for the specific utility classes in use, not merely for the absence of
an error. An install that silently compiles nothing produces a page that looks
exactly like an unstyled one.

Base colours left at Tailwind's stock `neutral-950` / `neutral-100` rather
than hand-matched to preview.png's faintly violet near-black. Judging a
background on an empty page is guessing; it reads correctly now there is
content on it, and it is one class to change later.

**2026-08-21 — Front end is a static SPA: Vite + React + React Router, no
server.**
Three options were weighed. A static SPA reading Supabase directly from the
browser; Next.js with server-side rendering; and vanilla HTML/CSS/JS.

Next.js is the stronger line on a CV and would remove the brief empty state
before data arrives. Declined because the cost lands in exactly the wrong
place for this builder. The App Router turns on the server/client component
boundary, and the filter bar is interactive while the data fetch wants to be
server-side — so the hardest concept in the framework would be met on the
headline feature, in week one, by someone whose React experience is a course
project. That is time spent learning a framework rather than building the
product, and the user sees no difference.

The CV argument is also weaker than it looks. Being able to say "a SPA,
because there is nothing to render on a server for read-only public data, and
Next.js would have cost me concepts the user never sees" is a better interview
answer than having reached for the default.

Vanilla was listed for completeness and rejected immediately: it means
hand-building routing and re-rendering, which is the work React already does
and which this builder already knows.

No server is needed because nothing is private. The publishable key is
designed to ship in a browser, and anon holds SELECT on three tables of public
YouTube data collected from a public API. A server would add a deployment
surface and protect nothing.

Accepted cost: a short empty state on first load, and no SEO. Both are
irrelevant for a portfolio piece whose link is sent directly. The view returns
a full read in 357 ms; twenty rows behind a WHERE and a LIMIT are far quicker,
and a skeleton grid covers it.

**2026-08-21 — Filter state lives in the URL, not in React state.**
Four filters, 24 combinations, two routes, and a requirement that the state
survives navigation in both directions.

React state via Context was the obvious route and is what the builder's course
taught. Rejected because the URL then never changes, and three things break
with it: a refresh drops every filter back to its defaults, the back button
either skips filter changes or behaves unpredictably, and no link can carry a
state to someone else. The first of those is the worst — a prospective
employer reloading the page and finding their filters gone reads as a bug.

With the URL as the source of truth, the requirement stops being a feature.
There is nothing to preserve across a route change, because the state *is* the
address and the link behind "Show more" carries it. Refresh, the back button
and shareable links all arrive as consequences rather than as three separate
problems.

Reinforcing reason: page number belongs in the URL regardless — page 2 of a
category needs an address — so keeping the filters anywhere else would split
one piece of state across two mechanisms.

Cost is one new hook, `useSearchParams`, which reads almost exactly like
`useState`.

Defaults are exported once from `frontend/src/lib/filters.js` and resolved
through a single helper, so a missing param and a changed default are both
handled in one place. That constraint paid for itself within the hour: moving
the `window` default from 7d to 90d was a one-word edit.

**2026-08-21 — "Show more" navigates to a category page rather than expanding
in place.**
The category page repeats the ranking from #1, so the three videos already
seen on the homepage appear again at the top. Considered starting the list at
#4 to avoid showing them twice, and rejected: the homepage is gone by then, so
nothing is on screen twice, and page 1 being literally "the top 20" keeps the
page boundaries clean at 20, 40, 60 rather than 23, 43, 63.

The filter bar is present and fully active on the category page, so a user can
re-rank without going back. `page` must reset to 1 on any filter change — page
3 of long-form may not exist under Shorts, and the result would be an empty
grid that looks like missing data.

**2026-08-21 — The URL path carries the raw category value, not a prettier
slug.**
`/category/triathletes`, not `/category/professional-triathletes`. A
translation layer between URL and database is a second place to maintain and
fails silently on a rename. The CHECK constraint on `channels.category`
already makes those four values a closed set, so the URL uses that set
directly.

**2026-08-21 — Tailwind CSS over hand-written CSS.**
Both reach the same result and the builder already knows CSS from the course —
float, flexbox, grid, media queries. Chose Tailwind for two reasons specific
to this project.

The design already exists as `preview.png`, so the work is reproducing a
reference rather than inventing one, and utility classes keep structure and
styling in one file while doing that. And the layout repeats heavily — four
identical category sections, one filter bar across two routes, a single dark
scheme — so consistency of spacing and colour has to hold across many
components. Tailwind's scales enforce that; hand-written CSS leaves it to
discipline, and a tidy grid with consistent spacing is exactly what reads as
"finished" on a portfolio piece.

A component library (shadcn/ui, MUI) was rejected: the four things being built
— filter bar, video card, category section, pagination — are specific enough
that the library would be fought rather than used, and the result would look
generic.

Honest cost, recorded rather than glossed: time in Tailwind is time not spent
sharpening hand-written CSS, which is the more durable skill. Accepted as a
learning trade, not a technical one.

**2026-08-21 — `window` defaults to 90d until the 7-day arm exists.**
A bare URL under a 7d default opens on four empty categories, which reads as a
broken site rather than as an empty window. Not a performance decision — an
empty result is not slow, it is empty.

Temporary and dated: revert to 7d once the 7-day arm of the scoring view is
live, since the trending view is the more interesting default for a marketer
and the 90-day list is deliberately the static all-time one. Recorded here
because a temporary default with no expiry note is how it quietly becomes
permanent.

**2026-08-21 — Front-end scaffold and data layer verified against real
behaviour before anything was styled.**
Two steps, each checked in the browser rather than assumed from the code.

The scaffold was tested with throwaway toggle buttons and the address bar in
view: each toggle changed one param and left the rest, refresh held the state,
the browser back button stepped back one filter change, and params survived
the round trip to the homepage and back. That closed the "filters remembered
across pages" requirement before a single row of data was on screen.

The data layer was tested the same way, and the load-bearing check was the one
expected to return nothing: switching `window` to 7d must yield zero rows. A
7d query returning data would have meant the window filter was being ignored
while everything still looked right. Toggling comparison had to reorder the
list, proving the sort genuinely moves between `outlier_score` and `value`
rather than coinciding.

Method rather than finding, and consistent with the four collection-script
bugs that only running the code exposed: the checks worth designing are the
ones whose correct answer is an absence.

**2026-08-21 — The Shorts/long-form baseline split verified in SQL, not taken
on trust.**
Confirmed that `is_short` appears in the baseline partition alongside
`channel_id`, `window` and `metric`, so a Short is scored against the median
of that channel's Shorts and a long-form video against long-form. Documented
in three places already, but a missing partition key would have produced
plausible numbers for every channel with no error and no visible symptom —
the same failure shape as the fifteen-versus-sixteen off-by-one.

Visible in the data as corroboration: `baseline_video_count` sits at 15 on
most rows and drops to 7 with `is_provisional = true` on a channel thin in one
format only, which a merged pool could not produce.


**2026-08-21 — anon gets SELECT on the three tables the scoring view reads,
not a definer view over sealed tables.**
The 2026-08-16 two-layer design always ended here: a SELECT grant plus a
SELECT policy for anon when the front end arrived. What was not anticipated is
that `security_invoker = true` makes the view check the querying role's
permissions on the underlying tables, so granting on the view alone returns
empty results with no error.

The alternative was to set scoring_view to security definer so it could read
the tables on anon's behalf while they stayed sealed — genuinely narrower,
since anon would then reach exactly the columns the view exposes and nothing
else. Rejected for two reasons. It would mean disabling one of the two layers
at the first moment they were tested, having spent yesterday fixing exactly
that setting on `videos_readable`. And it would leave the two views needing
opposite settings for opposite reasons, which is a subtle rule to carry into
every future view.

Worth recording that the distinction is real rather than a contradiction: a
definer view is a hole when it is unintentional — a convenience object quietly
bypassing security nobody considered — and a standard tool when it is
deliberate, a controlled gateway designed as the only way in. `videos_readable`
was the first; the rejected option was the second. Choosing against it is a
judgement about which rule is easier to hold, not about which is safer in
principle.

Accepted consequence: anyone holding the publishable key, which ships in the
browser, can query videos, channels and video_snapshots directly rather than
only through the view. All of it is public YouTube data collected from a public
API. `job_runs` stays sealed — the view never reads it, and it is the one table
holding our own operational data.

Verified from anon's own point of view rather than assumed: `set local role
anon` then counting scoring_view returns 11,907 rows, and counting job_runs
returns 42501 permission denied. The two failure modes are the ones the
2026-08-16 decision named — a missing grant errors, an RLS block returns empty.

**2026-08-21 — Baseline pools precomputed per group, not per row; the live
view stands.**
The first scoring view timed out entirely on `select * from scoring_view`.
`EXPLAIN` put the LATERAL join at cost 4,503,624 against ~700 for everything
else: because the `metrics` CTE is referenced twice it is materialised without
indexes, so the LATERAL had nothing to look up by and re-scanned and re-sorted
all ~11,900 rows once per output row — 11,838 times.

Rewritten to compute each channel/format/metric baseline pool once, up front,
as two parallel arrays. The LATERAL still runs per row but now unnests at most
16 values. 4,503,624 → 6,187 and a full read in 357 ms, a ~730× reduction.

The crux is taking **16** candidates per pool rather than 15. The spec is the
last 15 videos excluding the video being scored, and self-exclusion can
displace the ranking by at most one place — so 16 is exactly enough to
reconstruct any video's correct pool without knowing in advance which video
will be scored against it. Drop yourself if present, take the first 15 of what
remains. 15 would leave 14 for any video inside its own pool.

This closes the "measure it and only switch if it is actually slow" clause of
the 2026-08-19 live-view decision. It was slow; the cause was the query, not
the choice of a live view, and fixing the query kept the decision intact. Worth
keeping as method: the instinct on seeing a timeout is to reach for the
materialised fallback, and reading the plan first showed the fallback would
have preserved a query doing 6,000× more work than it needed to.

**2026-08-21 — An ORDER BY inside the view is not a guardrail; nulls-last moves
to the front-end contract.**
The view originally ended `order by outlier_score desc nulls last`, on the
reasoning that a video with no valid baseline must never rank #1 on a card
with no score printed on it. That ordering is discarded the moment a consuming
query sorts for itself — which the front end must, since it switches between
absolute (`value`) and relative (`outlier_score`). So the protection only held
for a bare `select *`, the one query the product will never run, while still
costing a sort of ~12,000 rows on every read.

Removed. The requirement is now part of the front-end contract instead:
Postgres sorts NULLS FIRST on a DESC sort, so every relative ranking must
specify nulls-last explicitly —
`.order('outlier_score', { ascending: false, nullsFirst: false })` in
supabase-js. Recorded here because it is invisible until it is wrong, and when
it is wrong it looks like a ranking bug rather than a sort-order one.

**2026-08-21 — The Outlier Score is displayed as a multiple: `75×`.**
Scores range far wider than the design anticipated — p50 1.04, p95 7.21, top
of the distribution around 75. That is not a broken denominator. It is a
median correctly describing channels whose view counts are heavily
right-skewed: Soudal Quick-Step's routine output sits at 2–5K views and an
Evenepoel recovery documentary took 300K. A mean would have hidden this; the
median is the reason it shows.

Displaying the number with an explicit `×` satisfies the locked ban on
percentages more directly than a bare `75.41` does. The 2026-08-15 rule exists
because "180% of normal" invites reading a ratio as a share of something
rather than a multiple of a median. `75×` cannot be misread that way.

The large multiples are also the product working rather than a defect to
soften. A score of 75 says the channel's audience responded to that video in a
way it does not to the channel's normal output — subject, thumbnail, title, or
timing. Surfacing that is the premise. A tool that only ever showed 1.2s would
have nothing to say.

**2026-08-21 — Red Bull Bike's thin long-form baseline: cause identified, no
action.**
Manual inspection of the channel showed roughly 18 long-form videos published
inside the baseline window against the 6 the view computes from. Four
candidate causes were considered; the two that hold are the backfill's depth
in *time* rather than in count, and collaboration videos.

At Red Bull's ~9:1 Shorts ratio, 100 uploads-playlist items reaches back only
a few months of long-form. Trek, at better than 2:1, reaches back to
2024-08-15 — almost exactly the 24-month baseline ceiling. So the same depth
figure produces completely different temporal coverage depending on a
channel's format mix. The backfill-depth question was argued on video counts
and never on how far back in time the walk reached; this is that blind spot
surfacing.

Collaboration videos are the second cause and are structural rather than
fixable: a video co-owned with another channel appears on Red Bull's channel
page but sits in the partner's uploads playlist, so the API never shows it to
us at all.

Misclassification was excluded — the HEAD check is verified and every other
channel's figures are consistent. The 30-day floor accounts for some of the
gap but not most of it.

No action. Daily collection closes the gap as new long-form uploads accumulate,
and the Provisional label is doing exactly its job in the meantime. Revisit
only if it is still thin in a month.

*Annotation to 2026-08-19, "The 90-day window is not capped by publication
date."* The park is cheaper than it looked. `published_at` is already a column
on the scoring view, so a publication-date cap is a `WHERE` clause the front
end adds per request — no view change, nothing behind the front-end contract
moves. It should therefore stay out of the view: hardcoding 24 months there
would turn a user-facing toggle into a fixed constant and make the parked
feature harder to build, not easier.

**2026-08-20 — Backfill depth stays at 100; the shortfall was misclassification,
not depth.**
Closes the question parked on 2026-08-19. After the correction run reclassified
376 rows, the three channels below the 10-video long-form threshold became two,
and both are cases depth cannot fix. Decathlon went 6 → 10, Red Bull Bike 8 → 11,
Canyon 13 → 16. The apparent depth problem was almost entirely a Shorts
heuristic wrongly filing short regular videos as Shorts — exactly the channels
whose profile caused it.

Raising to 130 was considered and declined. At Malachi Cashmore's observed ratio
it would add ~2.7 long-form videos, so it would probably move one channel across
the line and definitely not the other: Matt Hauser has 9 videos in total. That is
a global parameter changed to shift one channel over a threshold, on a channel
that posts regularly and will cross it unaided within weeks. The Provisional
label clearing itself channel by channel is the designed behaviour, not a gap
being tolerated — and having a live example of it doing so is worth more in an
interview than a uniformly green board.

Secondary reason: a second backfill writes ~1,200 snapshot rows dated today on
channels that already have one from two days ago, giving those channels a denser
early history than the rest for no analytical reason.

**2026-08-20 — `videos_readable` view, and views default to security definer.**
A convenience view joining `videos` to `channels` so the channel name is readable
without the opaque `UC...` id. Nothing is stored: the name lives once on
`channels` and is joined at read time.

The reason this is a decision and not a footnote is what was found on inspecting
it. A Postgres view runs with the permissions of its **owner** by default, not
the querying role. Created through the Supabase SQL editor it is owned by
`postgres`, so it reads the underlying tables as `postgres` — straight past the
RLS seal on all four. The 2026-08-16 two-layer access design would have been
defeated by a convenience object the moment `anon` was granted SELECT on it,
which is precisely what the front end will do.

Nothing was exposed: `anon` and `authenticated` held only `REFERENCES`, `TRIGGER`
and `TRUNCATE`, none of which mean anything on a view, and no `SELECT`. Recreated
with `security_invoker = true` so it checks the querying role's own permissions,
and the leftover grants revoked. Mirrored into `schema.sql` with the reasoning in
a comment.

Two things worth carrying forward. The Supabase project setting that stops new
*tables* being exposed did not cover a view created by hand, so "auto-expose is
off" is not a guarantee that covers every object type. And the scoring view must
be created with `security_invoker = true` from the start — it is the object the
front end will actually read, so the same default would be a real hole rather
than a latent one.

**2026-08-20 — `HEALTHCHECKS_URL` set in GitHub Secrets only, never in local
`.env`.**
The ping is meant to assert "the scheduled job ran", not "the script ran
somewhere". If a laptop had the URL, a manual `--mode daily` test would ping
Healthchecks and reset the timer — silencing an alarm about the scheduled run
having failed, at exactly the moment the alarm was doing its job. The script
treats the variable as optional and logs the skip explicitly, so the same code
pings from Actions and stays quiet locally, with the environment making the
decision rather than a flag someone has to remember.

**2026-08-19 — Duration heuristic rejected as the sole Shorts test; HEAD check
promoted to required.**
The 2026-08-16 decision started with duration <= 180 seconds and left the HEAD
check as a fallback "if needed". It is needed. Manual inspection of Red Bull Bike
and Decathlon found regular videos — not Shorts — sitting under three minutes,
and on Decathlon roughly one in four of those is under 60 seconds. There is
therefore no duration floor that separates the two: a video of 45 seconds may be
either. The "~95% accurate" figure in the brief does not hold for brand channels
that publish short product videos as ordinary uploads, which is a large part of
this dataset.

This is not a cosmetic mislabel. `is_short` splits every baseline, so a regular
video wrongly filed as a Short is measured against the wrong median and pollutes
both. It also invalidates the long-form counts that the backfill-depth question
was being argued from — Decathlon's 6, Red Bull's 8 and Malachi Cashmore's 9 were
all computed from a classification now known to be wrong, so that question is
parked until the data is corrected rather than settled on bad figures.

The HEAD check itself was verified before being relied on, using twelve videos of
known status — six real Shorts and six regular videos under 180 seconds, drawn
from both problem channels. Result via curl: 200 for a Short, 303 with a
`Location` header pointing at `/watch?v=` for a regular video. Exactly as
documented, and the endpoint is sound.

The same twelve requests from Python returned 302 for every video, Shorts and
non-Shorts alike — zero discriminating power. The endpoint is therefore fine and
the fault is in what the Python request sends versus what curl sends. Diagnosis
in progress; `scripts/test_shorts_check.py` is the harness and stays in the repo
as the record of it.

Worth recording as method rather than as a finding: testing the check against
twelve known videos cost a minute and revealed that a naive implementation would
have produced 3,000 confidently wrong answers. Running it blind across the whole
table would have looked like it worked.

Consequences. Prevention belongs in `collect.py`: every video under 180 seconds
gets a HEAD check before `is_short` is written, ~120 requests on a daily run.
Correction is a separate one-off script over the ~3,000 rows already marked as
Shorts — kept out of `collect.py` deliberately, because unlike backfill it shares
almost none of the collection logic, and the 2026-08-19 one-script decision
turned on shared logic rather than on file count.

*Resolved 2026-08-19 — the cause was the opposite of what was assumed.* YouTube
routes requests to `/shorts/{id}` through a regional GDPR consent redirect, and
eligibility is decided by the User-Agent alone. Non-browser clients — curl's
default, and `requests`' default — are sent straight to the real answer.
Anything browser-like, including the realistic Chrome string the test script was
sending on the reasoning that it would be treated more normally, is funnelled
into the consent redirect and returns 302 for every video regardless of Shorts
status. The fix is to send no custom User-Agent at all. Verified 12/12 against
the known set.

Worth keeping as method rather than as trivia: the instinct to look like a
browser was not just useless here, it was the entire fault, and it produced a
result that looked like a working script returning a consistent answer. The
twelve-video harness cost a minute and is the only reason it was caught before
3,000 rows were confidently mislabelled.

Measured impact, once wired in. On new videos, `collect.py` reclassifies 42 of
90 checked per daily run — the heuristic was wrong on nearly half of everything
under 180 seconds. On the existing table, a dry run over all 1,982 rows marked
as Shorts found 375 to correct, about one in five. The reclassifications cluster
by channel rather than spreading evenly, which is consistent with the cause:
brand channels publishing short regular videos, not a uniform error rate.

Two operational findings from the same work. `collect.py` crashed on a video
with no `contentDetails.duration` field at all — distinct from `P0D`, which is a
duration in an unreadable shape; both now take the same skip path, since neither
can be classified. And the Supabase client caps an unpaginated select at 1,000
rows, so the correction script's first dry run silently checked 1,000 of 1,982
and would have reported success having fixed half the data. Fixed there with
`.range()` paging. The same unpaginated pattern exists in `collect.py`'s read of
the `channels` table and is deliberately left alone — 40 rows against a cap of
1,000 — but it is recorded here because it would fail silently rather than
loudly if the channel list ever grew.

Consequence for the backfill-depth question: it stays parked. Decathlon, Red
Bull Bike and Malachi Cashmore were the three channels below the threshold, and
all three are exactly the profile this fix corrects. Their corrected counts have
to be read before any depth change is considered.

**2026-08-19 — Backfill depth raised from ~30 to 100 videos per channel.**
Measured rather than assumed. The first full run over all 40 channels wrote
1,959 videos, and grouping those by format showed the Shorts/long-form split is
far more lopsided than the original ~30 figure allowed for: Decathlon CMA CMG
Team is 46 Shorts to 4 long-form, Red Bull Bike 45 to 5, Scott Sports 44 to 6,
Canyon 43 to 7. At roughly one long-form video in twelve, a 30-video backfill
would have yielded 2–3 long-form reference videos for a brand channel — against
a minimum of 10. The headline feature would have been Provisional on long-form
for most of the brands category on day one, which is the exact failure the
2026-08-17 backfill decision was written to prevent, reappearing through the
format split rather than through publish dates.

100 was chosen over 50 or 60 because it clears the middle of the distribution
outright — Cube 10, GCN 13, Nero 14, GTN 15, Merida 16 long-form in 50 videos
all comfortably exceed the threshold at 100 — and brings the worst cases within
sight without pretending to fix them. Cost is not the constraint it might look
like: 100 videos is ~4 quota units per channel, ~160 for the whole backfill,
against 10,000 a day, and it runs exactly once. Storage goes from ~1,200 rows to
~4,000, immaterial against 500 MB.

Two consequences accepted. Backfill now needs pagination, since 100 videos is
two pages of 50 — but the 90-day Monday window needs pagination regardless (a
single page reaches back only ~2.5 months on a channel posting at Canyon's rate),
so this is not extra machinery. And it does not rescue thin channels: Matt Hauser
has 9 videos in total and 0 Shorts, so no depth figure helps him. That is
correctly the Provisional label's job, not the backfill's.

Rejected alternative: varying the depth per channel based on its observed Shorts
ratio. Better on paper, but it turns a loop with a counter into an adaptive
algorithm, in the one code path that runs a single time. Supersedes the "~30
videos" figure in the 2026-08-17 backfill decision; the reasoning there stands
unchanged.

**2026-08-19 — Scoring runs in a live view, not a materialised one.**
Both options present the identical interface to the front end — `SELECT
outlier_score, is_provisional` — so this is reversible in minutes and was not
worth deciding on a guess. Chose live because a materialised view fails
silently: if the scheduled `REFRESH` breaks, the page serves stale scores with
no error and no visible difference, which is exactly the failure mode the dead
man's switch and `job_runs` exist to eliminate everywhere else. A live view
cannot be stale. The known cost is that every page load recomputes ~160 medians
(40 channels × 2 formats × 2 windows) over data that only changes once a day,
which is provably wasted work — but at prototype volume and prototype traffic it
is wasted work measured in milliseconds. Supabase's free tier does not force the
choice: storage is negligible either way, and the shared-CPU argument that
favours materialised only bites under concurrent load a portfolio demo will not
see. The intended path is to measure the query once real snapshots exist and
switch only if it is actually slow — which is also the better thing to be able
to describe, since profiling a query and moving it is a stronger answer than
having pre-optimised on instinct. Closes the open question of the same name.

**2026-08-19 — Failure threshold defined as three checks, two of them
history-free.**
Closes the open question. The row-count comparison the open question centred on
turned out to be the weakest of the three available checks, and the two stronger
ones need no history at all.

*Check 1 — completeness.* `channels_processed` must equal the number of channel
rows the script read at the start. Deliberately not `< 40`: the channel list is
data, not code, so a hardcoded 40 would silently stop catching a dropped channel
the moment a 41st is added.

*Check 2 — internal consistency.* `snapshots_written` must equal the number of
videos found inside the window. This compares the run against itself, so it
catches a partial write — a failed batch, a dropped connection, a swallowed
upsert error — without needing to know whether tonight's figure is normal.
Weekday-independent and correct on the first run.

*Check 3 — volume.* `snapshots_written` below 50% of the last successful run of
the same weekday and the same mode is a failure. This is the only check needing
history, and it exists to catch the one thing the other two miss: a fetch that
succeeds but under-returns, where an empty playlist comes back with no error and
everything looks internally consistent. 50% is deliberately loose — the 8-day
window makes consecutive runs overlap heavily, so counts are far more stable
than 40 irregular uploaders would suggest, and a threshold that never false-fires
is worth more than a tight one that trains you to ignore it. Comparing against
the last *successful* run means the reference was itself within tolerance, so the
baseline cannot drift downward one run at a time.

Any failed check writes `status = 'failed'` and an `error_message` naming the
check and both numbers, and suppresses the Healthchecks ping — the missing ping
is what actually reaches a human. Healthchecks grace period set to 28 hours: four
hours of slack for a late start or a retry, without letting a fully missed day
pass unnoticed. On the first run of any weekday there is no reference, so check 3
is skipped and the skip is logged rather than passed silently.

Required `job_runs.mode` (`daily` | `weekly` | `backfill`, CHECK-constrained) to
make check 3 workable: without it the ~1,200-row backfill becomes the reference
for the next run on that weekday and fails it correctly by the rule and wrongly
in fact, as would every manual `--mode weekly` test. The column stores the
*resolved* window rather than the argument passed, since a scheduled run passes
nothing and derives its mode from the date — the log should record what the run
did, not what it was asked.

**2026-08-19 — Daily collection with a tiered window, replacing weekly.**
Weekly collection cannot produce a day-7 reading. A video published the day
after a run gets measured at 14 days; one published the day before at 8 days.
YouTube view curves are heavily front-loaded, so those figures are not
comparable — two identically-performing videos could differ by roughly 20% in
relative score purely from their publication weekday. The spec's claim that
every video is "measured with the same yardstick" was therefore false as
written, and the distortion landed squarely on the headline feature. Daily runs
cut worst-case measurement error from 6 days to under 1. Cost is negligible:
~43 quota units a day against 10,000, and Actions minutes are unlimited on a
public repo. The window is tiered rather than flat — 8 days by default, 90 on
Mondays — because a flat 90-day daily window would write ~2,800 rows a week
instead of ~1,400, most of it re-recording day-60 videos that have stopped
moving. Day 8 rather than 7 is a buffer: if the day-7 run fails, the day-8
reading still salvages the score, and there is no second chance because the API
holds no history. Supersedes "Weekly collection for the prototype" (2026-08-15)
and "Videos scored at ~7 days of age, with a 7-day measurement lag"
(2026-08-15).

**2026-08-19 — Keep-alive workflow removed.**
It existed solely because weekly collection sat exactly on Supabase's 7-day
inactivity pause boundary. Daily runs touch the database every day, so the
boundary condition is gone and the workflow has no remaining purpose. One fewer
moving part, one fewer thing to explain. Supersedes "Keep-alive workflow to
prevent free-tier pausing" (2026-08-16). The dead man's switch remains, and
still covers Actions disabling scheduled workflows after 60 days of repo
inactivity.

**2026-08-19 — One version, two age-matched windows, replacing the v1/v2 split.**
The prototype ships a single scoring model with a user-facing toggle: a 7-day
window (a video's day-7 figure against the median day-7 figure of that
channel's other videos) and a 90-day window (the same at ~90 days). Both sides
of each ratio are measured at the same age, which removes the scale mismatch
the earlier design accepted.

The stronger reason is one the per-channel switchover would have created. v1 and
v2 scores sit on scales differing by roughly 3× — v1 compares 7-day views
against lifetime accumulation, v2 compares like against like. Switching channels
individually as their data matured meant that at any given moment some channels
would be on one scale and some on the other. Since the headline feature ranks
videos *across* channels within a category, the top-3 list would have silently
become "which channels have been tracked longest" — a ranking artefact
masquerading as insight, and an invisible one. Age-matching both windows from
day one makes it structurally impossible. Supersedes "v1 → v2 transition is per
channel and data-driven" (2026-08-17).

**2026-08-19 — The 90-day window uses lifetime views as a proxy until real
snapshots exist.**
Real 90-day figures do not exist until three months after collection begins, so
until then the 90-day window reads the backfill's lifetime totals. For
*relative* scoring this is sound: the proxy appears in numerator and denominator
and largely cancels. For *absolute* scoring it means the list ranks lifetime
totals, so older videos rank higher — accepted, because the 90-day view is
deliberately the static "best of all time" list rather than a trending one. The
swap to real snapshots is a change inside a database view, invisible to the
front end.

**2026-08-19 — The 90-day window is not capped by publication date.**
Considered capping to 6, 12 or 24 months to remove the age skew in absolute
rankings. Declined for the prototype: the 90-day list is meant to be static and
a 2019 video is legitimately in scope for "best of all time". A publication-date
filter is a good future feature and a good thing to be able to describe in an
interview, but building it now is UI work in service of a distortion that is
easier to explain than to fix. Parked, not overlooked.

**2026-08-19 — The 7-day pool is 30 days wide.**
A given week's 7-day ranking draws on every video that reached day 7 in the last
30 days, not just the last 7. Two reasons. A day-7 reading is frozen the moment
it is taken, so widening the pool adds depth rather than churn — a strong video
persists near the top for four weeks instead of one, which makes the page "what
has been trending this month" rather than "this week". And on demo day only
videos published *since collection started* have a day-7 row at all; a 7-day
pool would show a single week of them, with a thin "show more" list behind it.
An empty expansion is a worse impression than a leaderboard that turns over
slowly. One constant in one query, trivially changed if the page ever feels
stale.

**2026-08-19 — One collection script with a `--mode` argument; window defaults
from the date.**
Closes the open question on backfill implementation. Backfill and collection
share roughly 90% of their logic — read channels, walk the uploads playlist,
batch video details by 50, insert to `videos`, upsert to `video_snapshots`, log
to `job_runs`. Only the window differs. Two scripts would mean two places to fix
every bug and one dead file in the repo after a single use. A boolean
`--backfill` flag was the earlier candidate but cannot express three states now
that daily and Monday behaviour differ. With no argument the script derives its
window from today's date, so the scheduled workflow passes nothing and cannot be
scheduled into the wrong mode; `--mode weekly` exists so the 90-day path can be
tested without waiting for a Monday.

**2026-08-19 — Front end reads `outlier_score` and `is_provisional`; baseline
logic lives in a database view.**
The front end never computes a baseline and never knows which proxy is in force.
Changing the proxy, the pool width or the provisional threshold is then a SQL
change with no front-end work. This is the thing that actually makes the
prototype safe to build now rather than after three months of data — not the
choice of threshold, which was the original worry. Also means the demo can be
finished in weeks and the remaining time spent on applications rather than
rebuilding.

**2026-08-19 — Provisional evaluated per channel, per format, per window.**
A baseline is provisional below 10 reference videos, assessed independently for
each combination. A channel can be provisional on Shorts but not long-form, or
on 7-day but not 90-day. Expect it on most channels' 7-day scores early on,
since a day-7 reading only exists for videos published after collection began.
It clears channel by channel with no release. Confirms rather than changes the
2026-08-17 decision that the label is permanent furniture: the format split
means a channel posting long-form weekly and Shorts occasionally may stay
provisional on Shorts indefinitely.

**2026-08-19 — Format filter promoted to an explicit UI control.**
Shorts vs long-form was already in the locked feature list but was missing from
the first layout sketch. It is not optional: the two sit on entirely different
view scales, so without the split Shorts dominate every absolute ranking and the
comparison stops meaning anything. Four filters total — window, metric,
comparison, format — giving 24 valid combinations.

**2026-08-19 — Relative scoring extended to likes and comments.**
The locked spec defines the Outlier Score on views only; the filter grid
requires the same treatment for likes and comments. Mechanically identical.
Known weakness: comment medians are small, so a channel whose median is 8
comments hitting 30 scores 3.75 on what is mostly noise. Accepted rather than
special-cased — a floor or a confidence weighting is complexity a prototype does
not need, and the effect is easy to explain. `likes` and `comments` remain
nullable, so queries use `COALESCE(x, 0)` and a null median counts as no valid
baseline.

**2026-08-19 — Age measured by date subtraction; run hour pinned to a fixed UTC
time.**
`published_at` is a timestamptz and `snapshot_date` is a date, so a video
published at 23:00 and snapshotted at 06:00 seven days later is really 6.3 days
old. Storing snapshot timestamps and interpolating would remove that error but
is real complexity for a rounding error — and daily collection has already cut
the dominant error from 6 days to under 1. Consequence worth recording: the run
hour is now effectively a constant. Moving it later would make every video
appear marginally older and shift scores against the existing record, so a
change should be logged here rather than made casually.

**2026-08-19 — The 30-day baseline floor applies to the 90-day window only.**
Under the 7-day window the floor is redundant: a video must already be 7+ days
old to have a day-7 reading, and that reading is frozen and comparable
regardless of the video's current age. Under the 90-day window it still binds,
because the lifetime proxy means a 14-day-old video has not finished
accumulating and would drag the median down. This is the same reasoning as the
2026-08-17 entry, now resolved per window rather than per version.

**2026-08-17 — One-time backfill before the first weekly run.**
The 90-day collection window cannot feed a baseline that needs 15 videos aged
30 days to 24 months. At launch only 8–9 videos would qualify for a weekly
uploader and 2–3 for a monthly one, both under the minimum of 10 — the Outlier
Score would be uncomputable for every channel on the first run. It would
self-heal as the rolling window fed new videos in, but "several months before
the headline feature works" is a bad position for a portfolio piece and an
avoidable one. Backfill walks each channel's uploads playlist back ~30 videos
and writes one snapshot each dated today. ~25 quota units, no schema change,
reuses the collection script's own fetch-and-insert logic. Legitimate under the
locked spec rather than a bend of it: the spec asks for lifetime totals of
mature videos, and a snapshot taken today of a video published 14 months ago is
exactly that.

**2026-08-17 — 90-day window kept, and is not the baseline window.**
Questioned whether it should widen to 24 months so the baseline could be built
from ongoing collection. Rejected — see Rejected. The 90-day window governs
which videos are *re-measured* weekly, because videos in their first 90 days
are still moving and weekly re-measurement is what builds the growth curves.
The baseline is a separate concern, solved by the backfill above.

**2026-08-17 — 30-day floor kept for v1, and why it disappears in v2.**
Considered lowering to 7 days on the reasoning that a two-week-old video
already has its 7-day datapoint. True, but only under v2. The v1 baseline is
made of *lifetime* views, and a 14-day-old video hasn't finished accumulating
lifetime views, so it drags the median down and inflates every score on that
channel. Under v2 the floor genuinely becomes unnecessary, because 7-day
figures are comparable regardless of a video's current age. Same fact, opposite
conclusion depending on which model is in force — worth remembering when v2
lands, because the floor should then be revisited rather than carried over out
of habit.

**2026-08-17 — v1 → v2 transition is per channel and data-driven.**
Not a release. Each channel switches to the age-matched baseline once the
snapshot table holds 10 of its videos measured at ~7 days, which the weekly job
produces as a by-product. Until then the front end shows a Provisional Score
label. The label is permanent product furniture, not a temporary patch: any
channel added later starts thin too.

**2026-08-17 — Provisional Score label rather than hiding thin baselines.**
A baseline resting on 4 videos is worth showing with a caveat rather than
suppressing. Wording: "Provisional Score — baseline drawn from a limited number
of reference videos." States the condition and what it means for the reader
without apologising for it.

**2026-08-17 — Schema audited against UI requirements before building the job.**
An uncollected field is unrecoverable for videos already published — the same
asymmetry as the missing-history problem — so the check had to happen before
the first run, not after. Every field the prototype results view needs is
already covered: absolute ranking from `video_snapshots`, Outlier Score
computed from the same, filters from `videos.is_short` and `channels.category`,
display from stored title and thumbnail, estimated watch time and formatted
duration computed from `duration_seconds`. The "does this value change?" rule
used to design the tables had already done the work. Detailed UI design
deferred: the front-end stack is undecided, there is no real data to design
against, and every week without collection is permanently lost.

**2026-08-17 — `channels.avatar_url` added.**
Channel avatar shown alongside each video in the results view. Stored on
`channels` rather than per snapshot: 40 rows, changes rarely, and it is
channel-level rather than video-level data. Not urgent in the way snapshots
are — avatars are current-state and fetchable any day — but the column costs
nothing to add now and avoids a migration later.

**2026-08-16 — Supabase free tier, EU region.**
The 500 MB cap is irrelevant at ~400 rows/week and nothing here is
latency-sensitive, so region is convenience rather than architecture. Two known
costs. Free projects pause after 7 days of inactivity — addressed by the
keep-alive workflow below. And the free tier has no backup retention: a paused
project keeps its data, so pausing is recoverable, but deletion is not and
snapshot history cannot be re-collected. Worth a periodic export once the table
holds real history; nothing to lose yet.

**2026-08-16 — Keep-alive workflow to prevent free-tier pausing.**
The collection job runs weekly and Supabase pauses after 7 days of inactivity,
so the only thing touching the database sits exactly on the pause boundary. A
paused project fails the next run, the dead man's switch fires, and a week of
irrecoverable snapshots is lost before anyone restores it. A second GitHub
Actions workflow doing one trivial read every 2–3 days removes the boundary
condition for about fifteen minutes of work. Same principle as the n8n
decision: the irrecoverable job must not depend on infrastructure that can
lapse. Note that Actions disables scheduled workflows after 60 days of repo
inactivity, which would silence the keep-alive too — the dead man's switch
remains the backstop for that.

**2026-08-16 — Access control in two explicit layers: grants and RLS.**
Project created with "Automatically expose new tables" off, so no role holds
any privilege on a new table until granted. `schema.sql` grants SELECT, INSERT,
UPDATE on all four tables to `service_role` and nothing to `anon` or
`authenticated`. RLS is enabled on all four with no policies as an independent
second layer, so loosening a grant later cannot by itself expose rows. The two
fail differently and that distinction matters when debugging: a missing grant
returns error 42501 "permission denied for table"; an RLS block returns an
empty result set with no error. Supabase is making explicit grants the default
for all projects, so starting here means nothing breaks under us later.

**2026-08-16 — Supabase new-format API keys; secret key for the collection job.**
Supabase has replaced the legacy `anon` and `service_role` JWTs with
`sb_publishable_...` and `sb_secret_...`, and new projects no longer issue the
legacy pair. The job runs on machines we control and must write, so it uses the
secret key. Stored as `SUPABASE_SECRET_KEY` rather than `SUPABASE_SERVICE_KEY`
so the variable name matches the key it holds — it gets copied into GitHub
Secrets and the Python client, and renaming across three places later is
avoidable churn.

**2026-08-16 — `job_runs.id` is an identity column, not `bigserial`.**
`bigserial` silently creates a separate sequence object, and sequence
privileges are granted separately from table privileges. With auto-expose off,
`service_role` could hold INSERT on the table and still fail with "permission
denied for sequence job_runs_id_seq" — an error naming an object that appears
nowhere in the schema file, thrown by the first write of the job, inside the
very table built to record failures. An identity column's sequence is owned by
the table, so the INSERT grant covers it. Removes the hidden dependency rather
than papering over it with an extra grant.

**2026-08-16 — `likes` and `comments` nullable; `views` not.**
The YouTube API omits `likeCount` when a creator hides likes and `commentCount`
when comments are disabled — common on brand product launches, which is
squarely in this dataset. NOT NULL would kill the run. Writing 0 instead would
be worse: it records a disabled feature as an absence of engagement and drags
down every engagement-rate average silently. NULL is the honest value, and
Postgres arithmetic propagates it, so such videos drop out of an engagement
ranking rather than appearing artificially poor.

**2026-08-16 — CHECK constraints on `channels.category` and `job_runs.status`.**
The 40 channel rows are inserted by hand. A typo like 'brand' for 'brands'
raises no error — the channel simply never appears in any category query, and
the gap surfaces weeks later as a thin top-3 list. A CHECK constraint converts
a silent data-quality bug into an immediate insert failure. Same reasoning
applied to `status`, though the risk is lower there since only code writes it.

**2026-08-16 — Shorts detection by duration first; HEAD check only if needed.**
Duration ≤ 3 minutes is ~95% accurate and free. The HEAD request to
`youtube.com/shorts/{video_id}` closes the gap but is unofficial and adds one
request per video. Starting with duration. `is_short` is stored on the video
row, so a later correction is an update to one column rather than a change to
every query.

**2026-08-16 — YouTube access via a restricted API key, not OAuth.**
OAuth answers "which user is this and what have they consented to" and is
required only for private channel data. Everything the platform reads — views,
likes, comments, titles, thumbnails on public videos — is public, so an API key
is sufficient and OAuth would add a consent screen and Google verification for
no gain. Key is restricted to YouTube Data API v3 only, so a leak cannot be used
against any other API later enabled in the project. Application restrictions
left at None deliberately: GitHub Actions runners get a fresh IP each run, so IP
allow-listing would mean allow-listing most of Azure without meaningfully
narrowing access. Protection therefore rests on the API restriction plus `.env`
discipline.

**2026-08-16 — Dedicated Google Cloud project (`youtube-cycling-app`).**
Quota is tracked per project. Keeping this separate from the existing n8n course
project means an experiment there can never consume the collection job's quota.

**2026-08-15 — `job_runs` defined as a fourth table, separate from the
analytical model.**
Referenced in the collection requirements and the monitoring decision but never
given a schema — caught before implementation. Kept deliberately minimal: enough
to answer "did last week's run actually work, and did it write the expected
number of rows?" It doesn't join to the other three tables because it describes
executions, not content.

**2026-08-15 — Snapshot job built in code on GitHub Actions, not in n8n.**
n8n was the faster route and matches existing skills, but the instance runs on
RepoCloud against a prepaid balance. If that balance empties the container stops:
the workflow doesn't fail, it simply never runs, so no error fires and no alert
is possible. Weeks of collection could be lost silently — and snapshot data
cannot be recovered retroactively. GitHub Actions costs nothing and has no
balance to deplete. Principle: put the irrecoverable job on infrastructure that
cannot silently lapse. Accepted trade-offs: slower to first run, log-based
debugging, and Actions disabling scheduled workflows after 60 days of repo
inactivity (mitigated by the dead man's switch).

**2026-08-15 — n8n retained for the weekly digest email.**
Genuine fit for the tool, still demonstrates the automation skill the portfolio
needs, and a missed send costs nothing irrecoverable.

**2026-08-15 — Monitoring via Healthchecks.io dead man's switch.**
Error handling inside the job only catches failures that occur while it runs. It
cannot catch the job never running at all, which is the failure mode that costs
data. The switch inverts this: the job reports success, and an external service
alerts when the report stops arriving. Free tier covers it. Adding a `job_runs`
table alongside, to catch partial failures where a run "succeeds" but processes
far fewer videos than expected.

**2026-08-15 — Snapshot job runs manually before being scheduled.**
Collection starts on day one rather than waiting for the Actions setup to be
right.

**2026-08-15 — Three tables, split by what changes: `channels`, `videos`,
`video_snapshots`.**
The original field list was a single flat row per snapshot. Split because
`published_at` and `duration` never change, and repeating them ~400 times a week
means a correction would have to be applied across thousands of rows instead of
one. `videos` holds immutable facts; `video_snapshots` holds only the numbers
that grow. Composite PK on `(video_id, snapshot_date)` so a re-run on the same
day overwrites instead of duplicating.

**2026-08-15 — Added `published_at`, `duration_seconds`, `channel_id`,
`is_short` to the schema.**
The brief's original field list omitted these, and all four are load-bearing:
`published_at` drives the 90-day window, view velocity and the 7-day measurement
lag; `duration_seconds` drives the Shorts heuristic and estimated watch time;
`channel_id` is required to group by channel and category; `is_short` is stored
rather than recomputed. Caught before the first row was written — backfilling
`published_at` after a month of collection would have meant re-fetching
everything.

**2026-08-15 — YouTube, not Instagram or TikTok.**
It's the only one of the three with a genuinely open public API.

**2026-08-15 — Portfolio prototype, not a product.**
Built to demonstrate marketing thinking, ability to build with Claude Code, and
ability to use automations and databases. Consequence: demo value beats
technical completeness in every trade-off.

**2026-08-15 — Watch time dropped from the concept.**
See Rejected.

**2026-08-15 — Scope fixed at 40 channels in 4 categories of 10.**
Brands, professional triathletes, professional cycling teams, influencers.
Only channels uploading at least once per month, so baselines stay usable.

**2026-08-15 — Weekly collection for the prototype.**
Daily is possible later. Weekly is enough to prove the concept and keeps quota
usage negligible.

**2026-08-15 — Snapshot job runs before the front end exists.**
The Data API returns only a point-in-time snapshot; there's no way to ask what a
video's views were last week. Historical data exists only if we start recording
now. ~400 rows/week, trivial in storage and quota terms. After ~3 months this
produces real 7-day growth curves for this niche — data that cannot be bought
back retroactively.

**2026-08-15 — Title and thumbnail captured on every snapshot run, not once.**
Creators change both after publishing. Recording the changes is itself a signal
worth having for a marketing audience, and it avoids re-fetching later.

**2026-08-15 — Baseline = median views of the last 15 videos, 30 days to 24
months old.**
Median rather than mean, because one viral video would otherwise permanently
distort a channel's baseline. The 30-day floor exists because videos younger
than that haven't finished accumulating views — including them drags the median
down and inflates every score for that channel. Minimum 10 videos for validity;
the once-a-month selection rule means this should rarely bind.

**2026-08-15 — Separate baselines for Shorts and long-form.**
Their view counts sit on completely different scales; one shared baseline would
make the comparison meaningless.

**2026-08-15 — Videos scored at ~7 days of age, with a 7-day measurement lag.**
Each weekly run ranks videos published 8–14 days earlier, so every video is
measured with the same yardstick.

**2026-08-15 — Headline metric presented as "Outlier Score", never a percentage.**
The baseline uses lifetime totals of mature videos while the scored video is only
7 days old, so most scores land below 1.0. That's fine for ranking, but shown as
"180% of normal" it invites the wrong reading.
*Annotated 2026-08-19 — the rule stands, the reasoning does not. "Most scores
land below 1.0" was true while the baseline used lifetime totals against a
7-day numerator. Both windows are now age-matched, so scores cluster near 1.0
and a percentage would read closer to the truth than it used to. It is still
banned, now for the original objection alone: a ratio shown as a percentage
invites "180% of normal" to be read as a share of something rather than a
multiple of a median.*

**2026-08-15 — Channel list stored as table rows, not in code.**
Adding a channel should be a new row, not a code change.

**2026-08-15 — No user accounts. Public and read-only.**
Nothing in the prototype needs identity, and auth is pure scope cost.

---


## Open questions


- **When the 90-day window swaps from the lifetime proxy to real snapshots.**
  Data starts existing three months in, but coverage will be partial for a long
  time — only videos published after collection began ever reach a real day-90
  reading. A per-channel switchover would reintroduce exactly the cross-channel
  scale problem the two-window design was built to avoid. Likely answer: swap
  everything at once, once coverage is broad enough. Not urgent, but should be
  decided before the data arrives rather than after.
- **Comparability inside the 90-day relative score.** A 4-month-old video's
  lifetime views are compared against a median that may include 5-year-old
  videos. The proxy cancels less cleanly here than in the 7-day case — both
  sides use lifetime totals, but not at the same age. This is the weakest joint
  in the model. Honest to explain, and the parked publication-date filter is the
  fix if it ever needs one.
- **Static hosting provider.** Stack is decided; the host is not. Vercel,
  Netlify and Cloudflare Pages are all free at this scale and all deploy on
  `git push`. One requirement decides nothing between them but must be
  configured on whichever is chosen: every route has to rewrite to
  `index.html`, or a direct link to `/category/teams` returns 404. Nothing
  else depends on this, so it can wait until there is something worth
  deploying.
- **YouTube API Terms — data retention.** The thumbnail half of this question
  is closed: thumbnails link to the video on YouTube in a new tab, which is
  what the terms ask for. What remains is how long API-derived data may be
  stored, which matters before a public URL and does not constrain the front
  end. `video_snapshots` only grows, so if a retention limit binds it binds on
  the oldest rows — worth knowing before the table has a year of history in
  it.

## Rejected — and why


**n8n for the snapshot job.**
See the 2026-08-15 decision. Not rejected on capability — rejected because the
hosting model can lapse silently, and this is the one job where a silent lapse
is unrecoverable.

**Watch time as a metric.**
Watch time, retention, CTR and demographics all sit behind the YouTube Analytics
API, which requires OAuth consent from the channel owner. Impossible to obtain
for channels we don't own — for anyone, not just us. Replaced by views,
engagement rate, and view velocity. *Estimated* watch time (views × duration) is
kept as a secondary metric, always labelled as an estimate.

**Instagram and TikTok.**
No comparably open public API.

**`search.list` for fetching videos.**
Costs 100 quota units per call. Fetching the uploads playlist then video details
costs ~1 unit per 50 items instead.

**Transcript summaries in the prototype.**
The official captions endpoint only works for channels we own. The open-source
`youtube-transcript-api` works locally but gets IP-blocked from cloud servers
(AWS/GCP/Azure), so it needs either a local runner or a paid hosted transcript
API. Parked for later — and when picked up, it should be fetched on demand when
a user clicks, never for every video.

**Age-matched baselines (v2 scoring).**
Comparing 7-day views against the median *7-day views* of a channel's past
videos would remove the scale mismatch entirely. Impossible at launch because
the historical snapshots don't exist yet. Becomes possible once the snapshot
table holds several months of data. Worth being able to explain in an interview.
*Superseded 2026-08-19 — no longer rejected. Age-matching is now the design for
both windows from day one. See the decision of that date.*

**OAuth for YouTube access.**
Only needed for private data belonging to a channel owner. The platform reads
public videos exclusively. Rejected as overhead, not as unavailable.

**Supabase Pro to remove the inactivity pause.**
$25/month solves the pausing problem outright, but a keep-alive workflow solves
it for free and no other free-tier limit is in sight at this volume. No demo
value in paying.
*Still rejected 2026-08-19, and now for free — daily collection removes the
pause boundary without needing a keep-alive workflow at all.*

**Twice-weekly collection as a pause workaround.**
Would keep the project awake as a side effect, but changes what "this week's
snapshot" means and complicates the 8–14 day scoring window for no analytical
gain at prototype scale. Scope creep.
*Superseded 2026-08-19 — moot. Collection is daily, which removes the pause
boundary as a side effect and eliminates the scoring-window objection entirely.*

**`IF NOT EXISTS` on the CREATE TABLE statements in `schema.sql`.**
Would make the script safe to re-run, but silently. A schema file that no-ops
is how you come to believe a change was applied when it wasn't. Re-running
should fail loudly.

**Widening the collection window from 90 days to 24 months.**
Would keep every baseline video freshly re-measured on each run, removing the
need for a backfill. Costs ~4,000 rows a week instead of ~400, most of them
re-measuring mature videos whose numbers barely move. More data, no more
insight. The backfill achieves the same result once, for ~25 quota units.

**Building the v2 age-matched baseline now.**
Proposed independently during design and correct as a destination, but it
requires 7-day figures that only exist if collected at the time — the API
cannot report them retroactively. At first run there would be zero comparison
videos, and ~10 weeks before a weekly uploader reached 10. The headline feature
would show a limited-data warning on every channel for months. v1 pairs a
collectable numerator with a backfillable denominator, which is precisely why
it works on day one.
*Superseded 2026-08-19 — the objection was correct on the facts and wrong on the
conclusion. Day-7 figures genuinely do not exist retroactively, so early
baselines really are thin. But the Provisional Score label already handles
thinness, and the demo timeline means weeks of data will have accumulated before
the prototype is shown. The cost of the alternative — channels on scales
differing by 3× — was worse than the cost of visible limited-data warnings.*

**A dedicated warning state for baselines spanning more than 24 months.**
The backfill collects videos older than 24 months anyway, so the data exists as
a fallback. But the channel selection rule requires monthly uploads — a channel
that cannot produce 10 videos in 24 months violates the rule and does not
belong in the list. Building a conditional in the baseline query plus a second
UI state to handle a case the inclusion criteria already exclude is scope
creep.

**Storing video description and tags.**
Available from the API and irreversible in a narrow sense, since creators edit
them. Only the parked "why did it work" layer would use them. Declined
knowingly rather than overlooked: collecting fields on the chance a parked
feature is revived is how a prototype bloats.

**Two separate scripts for backfill and collection.**
Easier to reason about in isolation, but duplicates the fetch-and-insert logic
that both need, leaving two places to fix every bug and a dead file in the repo
after one use. A `--mode` argument on one script costs a few lines and keeps the
logic single-sourced.

**Capping the 90-day window by publication date.**
A 6-month / 1-year / 2-year / all-time filter would remove the age skew that
makes older videos rank higher in absolute 90-day lists. Correct as a fix and
worth describing in an interview, but the 90-day view is deliberately the
static all-time list, and this is UI work in service of a distortion that is
cheaper to explain than to build around.

**Storing a computed 7-day score as a column.**
Rejected on the same principle that kept immutable facts out of
`video_snapshots`. A stored score would silently mean different things for rows
written before and after any change to the baseline, the pool or the proxy —
and the proxy is known to be changing. The score is derived at read time from
`published_at` and `snapshot_date`, so changing how it is computed cannot
corrupt what was already recorded.

**Lowering the provisional threshold below 10 reference videos.**
Considered as a way to show fuller data sooner on the demo timeline. Declined:
it trades a locked constraint for noisier baselines, and it was solving the
wrong problem. The rework worry it was meant to address is handled instead by
the front-end contract — `outlier_score` plus `is_provisional`, with baseline
logic behind a view — which makes the threshold changeable in SQL at any time.

**Raising backfill depth from 100 to 130 videos per channel.**
Considered to lift the last channels over the 10-video long-form threshold. The
quota cost is genuinely nil — ~200 units, once. Declined because the arithmetic
does not deliver: at Malachi Cashmore's observed ratio, 30 more videos add ~2.7
long-form, so it probably moves one channel and definitely not Matt Hauser, who
has 9 videos in total. Changing a global parameter to shift one channel across a
line it will cross unaided within weeks is the wrong trade, and the Provisional
label clearing itself is the designed behaviour rather than a defect being
tolerated. Also writes ~1,200 snapshot rows dated today on channels that already
have one, giving them a denser early history than the rest for no analytical
reason. See the 2026-08-20 decision.

**Putting `HEALTHCHECKS_URL` in the local `.env` as well as GitHub Secrets.**
The obvious default, and wrong. A manual `--mode daily` test from a laptop would
ping Healthchecks and reset the 28-hour timer — silencing an alarm about the
scheduled run having failed, at the exact moment the alarm was earning its keep.
The ping must assert "the scheduled job ran", not "the script ran somewhere".
Secrets-only, with the script treating the variable as optional and logging the
skip, means the environment decides and nobody has to remember a flag.

**A materialised view, when the live scoring view timed out.**
The obvious response to `select * from scoring_view` failing to finish, and
the fallback the 2026-08-19 decision explicitly kept in reserve. Rejected
because reading the plan first showed the problem was not the live/materialised
choice at all: the LATERAL was re-scanning and re-sorting the whole ~11,900-row
`metrics` CTE once per output row, costing 4,503,624 against ~700 for the rest
of the query. Materialising would have preserved a query doing roughly 6,000×
more work than necessary and paid for it with the stale-data failure mode the
original decision was written to avoid. Precomputing the baseline pools brought
a full read to 357 ms and left the live view intact. The fallback remains
available and is now much less likely to be needed. See the 2026-08-21 decision.
*Superseded 2026-08-23 — no longer rejected. The reasoning above stands
entirely: materialising then would have preserved a query doing 6,000× more
work than necessary. The query was fixed instead, and has now been measured
again at 3.0–3.4s against anon's 3s budget with nothing left to win inside it.
Same fallback, reached for a different reason and after the cheaper lever was
exhausted. See the 2026-08-23 decision.*

**Fifteen candidates per precomputed baseline pool.**
The natural figure, since the spec says the last 15 videos — and wrong. A video
inside its own channel/format pool is removed by the self-exclusion rule, which
would leave 14, one short, and quietly narrow the baseline for exactly those
videos most likely to be scored. Sixteen is the correct number: self-exclusion
can displace the ranking by at most one place, so 16 candidates reconstruct the
correct 15-video pool for every video, including those never in the pool at all.
Recorded because 15 is what the spec says and the off-by-one is invisible in the
output — the median would simply have been computed from a slightly different
set, with no error and no signal that anything was wrong.

**Next.js for the front end.**
Stronger on a CV, removes the empty state before data arrives, and gives SEO
that this project has no use for. Rejected on where the cost lands: the App
Router turns on the server/client component boundary, and this project's
filter bar is interactive while its data fetch wants to be server-side — so
the framework's hardest concept would be met on the headline feature, in week
one, by someone whose React experience is a course project. Time spent
learning a framework rather than building the product, for a difference the
user never sees. Not rejected as a technology; rejected as a thing to learn
right now. See the 2026-08-21 decision.

**Vanilla HTML/CSS/JS for the front end.**
Would mean hand-building routing and re-rendering on filter changes — exactly
the work React removes, in a project whose builder already knows React.
Listed for completeness during the stack decision rather than seriously
considered.

**React state via Context for the filters.**
The route the builder's course teaches, and wrong here. The URL never changes,
so a refresh drops every filter to its defaults, the back button skips filter
changes, and no link can carry a state to someone else. The refresh case is
the damaging one: an employer reloading the page and finding their filters
gone reads as a bug. Also splits state across two mechanisms, since the page
number belongs in the URL regardless.

**A component library (shadcn/ui, MUI) for the front end.**
Four components are being built — filter bar, video card, category section,
pagination — and each is specific enough that the library would be overridden
rather than used. The result looks generic and the time goes into learning the
library's conventions instead of the design. Tailwind gives the consistency
benefit without the component opinions.

**Starting the category list at #4 to avoid repeating the homepage's top 3.**
Considered because the three videos shown on the homepage appear again at the
top of the category page. Rejected: "Show more" navigates away, so the
homepage is no longer on screen and nothing is duplicated in front of the
user. Starting at #4 would also push every page boundary off a round number —
#4–23, #24–43 — for no gain.

**A prettier slug in the category URL.**
`/category/professional-triathletes` reads better than
`/category/triathletes`, but it needs a mapping between URL and database value
maintained in two places, which fails silently the moment a category is
renamed. The CHECK constraint on `channels.category` already makes the four
values a closed set.

**Placing the channel filter as a fifth group in the filter bar row.**
More compact, and keeps the bar on one line. Rejected because the control
would then have to carry its whole state in its own label — "38 of 40" — so
the user could never see *which* channels are off without opening the menu.
It would also imply the filter is another measurement control, which it is
not. Its own row beneath a dividing rule, with removable chips, says what
it actually is.

**Showing `0.0×` when `outlier_score` is null.**
Suggested so the badge never silently disappears. Rejected: null means no
valid baseline exists, which is a different statement from a score of zero,
and `0.0×` on a video with 40,000 views reads as a defect in the product
rather than as an absence of data. The Provisional badge on the opposite
corner already communicates the case.

**Building the homepage category sections inside the channel-filter task.**
The filter's spec said the homepage must respect exclusions, but the homepage
renders no video data yet — it is four links. Claude Code flagged the
contradiction rather than guessing, and the plumbing-only route was taken:
`exclude` flows through the resolver and the query, and the sections will pick
it up for free when they are built. Building both at once would have meant not
knowing which half a failure came from.

**Raising anon's statement_timeout from 3s to 3.5s.**
The obvious response to a query measured at 3.0–3.4s, and the wrong one on the
numbers it was proposed from. The worst observed run was 3,376ms, so 3.5s
leaves 124ms of headroom against a measured 300ms run-to-run spread — the page
would work about half the time, unpredictably, which is worse to live with than
consistent failure because it never reproduces when you go looking. And
`video_snapshots` grows daily, so the limit would need moving again within
weeks. The deeper objection is that 3.4s is a bad page whether or not it fits
inside the budget: raising the ceiling does not make it faster, it removes the
only signal that it is slow. Rejected in favour of removing the work rather
than widening the space it runs in.

**Dropping the exact row count in favour of a `pageSize + 1` has-more check.**
Genuinely attractive and nearly built. `count: 'exact'` is a second full
execution of the view on every page load, so removing it would have roughly
halved the database work everywhere, not merely unblocked the multi-category
case — and "Page 3 of 8" is worth little on a ranked list nobody reads from the
bottom. Overtaken rather than refuted: measurement showed four categories
exceeded the budget on the row fetch alone, with no count involved, so this
would not have been sufficient on its own. Materialising made the count fast
enough that the question may not arise at all. Still the right first move if
page load ever becomes the constraint again; whether `count: 'exact'` is now
comfortably fast is unmeasured and sits in NEXT_STEPS.

**A bright fill on the homepage section headers.**
Proposed as yellow, matching the mockup. Declined because yellow already means
"this category is selected" on the category page's button row, and the Outlier
Score badge is purple — a third loud colour would make the page shout, and
worse, yellow would mean two different things depending on where it appeared.
The sections needed separating, which was the real observation; a bordered
container with a subtly raised header bar does that through structure. Colour
was not the thing doing the work.

**Icons or emoji in the homepage section headings.**
Two bike emoji per heading across four headings reads as decoration rather than
design, and the filter bar is due its own icons from `preview.png` — the page
would end up carrying two unrelated icon vocabularies for no gain.

**Flex-wrap for the homepage card rows.**
The first attempt, chosen on the reasoning that a row of at most three cards
does not need the category page's responsive grid. It does not work: VideoCard
is `w-full`, and a flex item with no basis takes the full row, so three cards
stacked at full width instead of sitting side by side. Replaced with the same
grid classes the category page uses, which also means a future breakpoint
change cannot fix one page and silently break the other. Recorded because the
reasoning was sound and the outcome still wrong — "three items don't need a
grid" ignored that the grid was also what assigned each card its width.

**Postgres full-text search, and semantic search, for the search bar.**
Full-text would add word stemming and relevance ranking over the substring
match actually built — "gravel" would properly find "gravelling", and results
could be ordered by match quality rather than staying in outlier-score order.
It needs its own column and its own index, and it still would not know that
Unbound is a gravel race. Semantic search over embeddings would know that, and
is weeks of work plus a model and a vector column.

Substring matching is the right level for a prototype, and the reason is
specific to this dataset rather than general: YouTube titles are keyword-
stuffed because creators optimise them for search, so literal matching works
far better on titles than it would on prose. The ceiling is worth being able to
describe — "it is substring matching, which is honest about what it does;
semantic search would find Unbound and Traka without the word gravel" is a
better interview answer than having built something more elaborate that still
could not do that.

**Shortening the filter labels on mobile.**
Offered when "COMPARISON" and "CONTENT TYPE" crowded each other at 375px:
"WINDOW" and "TYPE" would fit comfortably. Declined because it trades away one
vocabulary across all screen sizes for a fit problem that turned out to have a
different cause — the four columns were each sized to their own text, and equal
widths plus a shared label height fixed it without changing a word. Recorded
because the obvious fix was to the symptom and the actual fault was one layer
underneath it, which is the third time that pattern has appeared in this file.

**Storing avatar images in a Supabase storage bucket.**
Proposed when avatars stopped rendering, on the reasoning that serving them
from our own host removes the dependency on Google's CDN entirely.
Genuinely attractive — it is also the answer to the parked YouTube Terms
question on thumbnail handling, and "I host the avatars rather than
hotlinking Google's CDN" is a better interview answer than the alternative.
Rejected because the measurement removed the problem: the failures were HTTP
429s caused by days of development reloading, and a cold incognito load
after a 20-minute pause returned all 40. A storage bucket, a fetch-and-
upload step in `collect.py`, and refresh logic for when a channel changes
its avatar is a session's work against a fault that does not affect anyone
who loads the page once. Remains the right fix if it ever recurs on a
visitor's first load. See the 2026-08-27 decision.
*Superseded 2026-08-28 — built, for reasons the original rejection did not
consider. The measurement stands: the 429s were development traffic, and
this was never worth building to fix them. What changed is that deployment
made a third-party CDN dependency undesirable on its own terms, and the
YouTube Terms review on 2026-08-27 gave it a second justification. Same
object, different argument. See the decision of 2026-08-28.*

**Filter bar icons from `preview.png`.**
The mockup put a small icon above each of the four filter labels, and the
item sat on NEXT_STEPS from the start as the most droppable thing on it.
Dropped. The labels — TIME WINDOW, METRIC, COMPARISON, CONTENT TYPE —
already say what each control is, so an icon above them is decoration
carrying no information the caption does not.

It also runs against a rule the filter bar already established. The
2026-08-23 decision kept full-length captions at every breakpoint on the
grounds that the caption is what makes a value like "Absolute" mean
something to a first-time visitor. If the words are doing that work, an icon
is not adding a second channel of meaning, it is adding a second thing to
look at above an already-dense row of four controls at 375px.

Consistent with the earlier rejection of emoji in the homepage section
headings, and for the same reason: the page does not need a second visual
vocabulary. Recorded rather than silently dropped because the mockup is the
design reference for this build, and a deliberate departure from it should
be findable later.