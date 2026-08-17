# Decisions & Current State

How to use this file: rewrite **Current state** each session so it's always
short and true. Append to **Decisions** — never edit or delete past entries.
Move things out of **Open questions** into Decisions once settled. Add to
**Rejected** whenever something is ruled out, always with the reason.

---


## Current state

*Last updated: 2026-08-17*

Google Cloud project created, YouTube API key issued and restricted to Data API
v3. Supabase project created on the free tier in an EU region, with
"Automatically expose new tables" off and automatic RLS on. Schema applied from
`sql/schema.sql`; all four tables live, verified with a test row and a
deliberately failing insert against the category CHECK constraint.

Schema audited against the prototype's UI requirements — every field the
results view needs is covered. One addition pending: `channels.avatar_url`.

Nothing else built — no collection script, no GitHub Actions workflows, no
front end.


**Next steps:** See `NEXT_STEPS.md`.

**After that:** get the snapshot job running. It has to start collecting before
anything else is built, because the API holds no history and every week not
recorded is data that can never be recovered.

---

## Decisions

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

**2026-08-15 — Channel list stored as table rows, not in code.**
Adding a channel should be a new row, not a code change.

**2026-08-15 — No user accounts. Public and read-only.**
Nothing in the prototype needs identity, and auth is pure scope cost.

---


## Open questions

- **Backfill as a flag on the collection script, or a separate one-off script.**
  The flag reuses the fetch-and-insert logic; a separate script is easier to
  reason about but duplicates ~40 lines. Blocking the collection script.
- **Failure threshold for the collection job.** "A run that writes 40 rows
  instead of 400 must not report success" is the right instinct, but 400 is an
  estimate that moves with upload cadence. Undefined, the threshold gets
  invented silently at implementation time. Candidate: fail if
  `channels_processed < 40`, or if `snapshots_written` is below 50% of the last
  successful run.
- **Where the scoring calculation runs** — in the collection job, as a separate
  scheduled job, or on read. Not urgent; the snapshot job doesn't depend on it.
- **Front-end stack and hosting — not yet designed.** Deliberately deferred:
  the snapshot job doesn't depend on them, and deciding now would be premature.
- **The final list of 40 specific channels** — not yet compiled.
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

**OAuth for YouTube access.**
Only needed for private data belonging to a channel owner. The platform reads
public videos exclusively. Rejected as overhead, not as unavailable.

**Supabase Pro to remove the inactivity pause.**
$25/month solves the pausing problem outright, but a keep-alive workflow solves
it for free and no other free-tier limit is in sight at this volume. No demo
value in paying.

**Twice-weekly collection as a pause workaround.**
Would keep the project awake as a side effect, but changes what "this week's
snapshot" means and complicates the 8–14 day scoring window for no analytical
gain at prototype scale. Scope creep.

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