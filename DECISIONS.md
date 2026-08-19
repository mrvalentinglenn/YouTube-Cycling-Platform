# Decisions & Current State

How to use this file: rewrite **Current state** each session so it's always
short and true. Append to **Decisions** — never edit or delete past entries.
Move things out of **Open questions** into Decisions once settled. Add to
**Rejected** whenever something is ruled out, always with the reason.

---


## Current state

*Last updated: 2026-08-19*

Google Cloud project created, YouTube API key issued and restricted to Data API
v3. Supabase project on the free tier in an EU region, "Automatically expose new
tables" off, RLS on. Schema applied from `sql/schema.sql`; all four tables live,
verified with a test row and a deliberately failing insert against the category
CHECK constraint. `channels.avatar_url` added.

All 40 channels compiled and imported across the four categories, 10 each. A
duplicate `channel_id` between two influencer channels was caught on import and
resolved.

Scoring model settled: the v1/v2 split is gone: the prototype ships one model
with a user-facing toggle between a 7-day and a 90-day window, both age-matched.
Collection moves from weekly to daily with a tiered window, which is what makes
an exact day-7 reading possible. Front-end layout fixed — see `preview.png`.

Collection script `scripts/collect.py` built through stage 5 of `NEXT_STEPS.md`
and committed. It reads the channel list from the `channels` table, walks each
uploads playlist with pagination, derives its window from the date or from
`--mode`, and writes to `videos` (insert-only) and `video_snapshots` (upsert on
the composite key). Failures are isolated per channel: one bad channel is
reported and skipped, never fatal to the run.

All four modes verified by running them:

| Mode | Videos | Pages | Quota | Duration |
|---|---|---|---|---|
| stage 3, one page per channel | 1,959 | 40 | 120 | 34.7s |
| `daily` (8 days) | 129 | 40 | 108 | 24.7s |
| `weekly` (90 days) | 1,382 | 55 | 150 | 32.6s |
| `backfill` (100/channel) | 3,824 | 78 | 196 | 46.4s |

Idempotency verified by re-running — 0 new rows in `videos`, all snapshot rows
overwritten rather than duplicated. Nullable engagement confirmed against real
data: 80 videos with likes hidden, 3 with comments disabled, all stored as NULL.
Backfill complete: 3,824 videos across all 40 channels, none failed.

Two bugs found by running rather than by reading. `P0D` durations — YouTube's
answer for live streams and premieres, which have no playable length — crashed
three channels outright on the first backfill; those videos are now skipped and
counted rather than written as 0 seconds, which would have filed a three-hour
stream as a Short. Three videos in 3,824, and it took down 7.5% of the channel
list. And the duration heuristic for `is_short` is wrong on this dataset — see
the decision below, which is the open work.

Not yet built: the Shorts classification fix, `job_runs` writes, the GitHub
Actions workflow, the Healthchecks ping, and the front end. Collection is
therefore not yet live — nothing runs on a schedule, and every day before that
is data that cannot be recovered.

**Next steps:** See `NEXT_STEPS.md`.

**After that:** get the snapshot job running. It has to start collecting before
anything else is built, because the API holds no history and every day not
recorded is data that can never be recovered. This is now more acute than under
weekly collection: a video's day-7 reading exists only if the job was running on
that specific day.

---

## Decisions

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
turned on shared logic

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
- **Front-end stack and hosting — not yet designed.** Deliberately deferred: the
  collection job doesn't depend on them.
- **YouTube API Terms of Service** — data retention and thumbnail display rules.
  Worth closing before the front end is built rather than before launch: the
  thumbnail rules could constrain how the results view works, and that is
  cheaper to know now than to discover afterwards.

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