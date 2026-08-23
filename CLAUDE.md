# YouTube Trends Platform — Cycling & Triathlon

## What this is

A platform that surfaces the best-performing YouTube videos in the cycling and
triathlon sector, so marketing teams at brands in that sector can find
inspiration and track trends.

**This is a portfolio prototype for job applications, not a commercial product.**
It exists to demonstrate three things to a prospective employer:

1. Marketing thinking — the concept itself is useful to a marketing team.
2. The ability to build software with Claude Code.
3. The ability to use automations and databases to gather data.

**Implication: scope discipline beats completeness.** Prefer the option that makes
a better demo over the one that is more technically thorough. Anything that adds
weeks without adding demo value should be cut.

## Who I am

- 5 years of professional experience in marketing.
- New to coding. Completed Angela Yu's full-stack developer course, so the
  fundamentals are there, but I am not a working developer.
- Completed an n8n course; comfortable with automation concepts.
- Never worked with Supabase before.

## How to work with me

- Explain the **why** behind architectural choices, not just the steps.
- Introduce database concepts rather than assuming them.
- Where there is a real choice to make, show me the options and their trade-offs
  before you pick one.
- Small steps. Don't build five files at once. One thing, then check with me.
- Tell me directly when I'm asking for scope creep, and say what it would cost.
- When you're unsure what I meant, ask instead of guessing.

## Rules

- Secrets go in `.env`. Never in committed files, never hardcoded in config.
- `.env` must be listed in `.gitignore` before the first commit.
- Never present estimated watch time (views × duration) as real watch time.
- Never present the Outlier Score as a percentage.
- Log every architectural or scoping decision in `DECISIONS.md`, with the
  reasoning — not just what was chosen.

## Locked constraints — do not re-open unless I ask

These were researched and settled. If you find yourself about to suggest one of
them, the answer is already no.

- **Watch time is unavailable.** Watch time, retention, CTR and demographics sit
  behind the YouTube Analytics API and require OAuth consent from the channel
  owner. Impossible for channels we don't own. Dropped from the concept.
- **The Data API has no history.** It returns a single point-in-time snapshot.
  There is no way to recover what a video's view count was last week. This is
  why the snapshot job must run before anything else exists.
- **Transcripts are out of prototype scope.**
- **The scoring spec below is locked.**

## Technical constraints that affect implementation

- **Quota:** 10,000 units/day, free tier. `search.list` costs 100 units per call
  and must be avoided. Fetching a channel's uploads playlist then video details
  costs ~1 unit per 50 items. Measured: a full run over all 40 channels fetching
  one page each cost 120 units. A daily 8-day run costs far less, since the walk
  stops at the window. The one-off backfill costs ~160.
- **Available per public video:** views, likes, comments, duration, publish date,
  thumbnail, title, description, tags.
- **Shorts detection:** no official API flag, and the duration heuristic does
  **not** work on this dataset. Brand channels publish regular videos under 3
  minutes — on Decathlon, roughly one in four of those is under 60 seconds — so
  no duration floor separates Shorts from short regular videos. The HEAD request
  to `youtube.com/shorts/{video_id}` is therefore required, not optional: 200 =
  Short, 303 = not a Short (with a `Location` header pointing at `/watch?v=`).
  Verified against 12 videos of known status. **Send no custom User-Agent.**
  YouTube routes this endpoint through a regional GDPR consent redirect and
  decides eligibility by User-Agent alone: non-browser clients (curl's default,
  `requests`' default) get the real answer, while anything browser-like gets a
  302 to the consent page for every video, Short or not. A realistic Chrome
  string breaks the check completely. See `scripts/test_shorts_check.py`.
- **Terms of service:** YouTube's API Services Terms restrict how long API data
  may be stored and how thumbnails must be displayed. Review before publishing
  to a public URL.

## Scope

**40 channels, 4 categories of 10:** cycling brands (Canyon, Trek, Giant);
professional triathletes (Blummenfelt, Charles-Barclay, Geens); professional
cycling teams (Visma–Lease a Bike, Lidl-Trek, Unibet Rose Rockets); cycling
influencers (Gerrit Knein, GCN).

**Selection rule:** only channels that upload at least once per month, so every
baseline stays statistically usable.

**Collection frequency:** daily, with a tiered window. Every run collects
videos published in the last 8 days. Monday's run widens that window to 90
days. One script, one schedule — the window size is the only difference.

**Channel list is stored as rows in a table** — adding a channel is a new row,
never a code change.

## Data model

Four tables. The split follows one rule: **facts that never change are stored
once; numbers that change are stored per week.**

### `channels` — 40 rows, changes almost never

| Column | Type | Notes |
|---|---|---|
| `channel_id` | text, PK | YouTube's channel ID |
| `name` | text | Human-readable, e.g. "Canyon" |
| `category` | text | brands \| triathletes \| teams \| influencers |
| `added_at` | timestamptz | When we started tracking |
| `avatar_url` | text, nullable | Channel thumbnail, refreshed on collection runs |

Adding a channel is a new row here — never a code change. The CHECK constraint exists because these rows are inserted by hand: a typo like 'brand' raises no error on its own, it just removes that channel from every category query silently.

### `videos` — one row per video, immutable facts

| Column | Type | Notes |
|---|---|---|
| `video_id` | text, PK | YouTube's video ID |
| `channel_id` | text, FK → channels | Whose video it is |
| `published_at` | timestamptz | Drives the 90-day window, view velocity, 7-day lag |
| `duration_seconds` | integer | Shorts heuristic + estimated watch time |
| `is_short` | boolean | Result of the HEAD check, stored so it isn't redone. Duration alone is not reliable — see Shorts detection above |
| `first_seen_at` | timestamptz | When the snapshot job first picked it up |

Nothing here changes after insert. On each run, insert only videos not already
present.

### `video_snapshots` — one row per video per run, the time series

| Column | Type | Notes |
|---|---|---|
| `video_id` | text, FK → videos | Part of composite PK |
| `snapshot_date` | date | Part of composite PK |
| `views` | bigint | Core metric |
| `likes` | integer, nullable | Engagement |
| `comments` | integer, nullable | Engagement |
| `title` | text | Captured every run — creators change titles |
| `thumbnail_url` | text | Captured every run — creators change thumbnails |

Composite primary key `(video_id, snapshot_date)` — one row per video per run,
and re-running the same day overwrites rather than duplicates.

~1,120 new rows per week: ~720 from the six daily 8-day runs at ~120 each, ~400
from the Monday 90-day sweep. This table only grows.

Row counts differ by weekday. A Monday run writing ~400 rows is normal; a
Tuesday run writing ~400 is not. `job_runs.snapshots_written` must be read
against the expected count for that weekday.

### How they join

`channels.channel_id` → `videos.channel_id` → `video_snapshots.video_id`.

"Top 3 brand videos this week" = filter `channels` by category, follow to their
`videos`, join this week's `video_snapshots`.

### `job_runs` — one row per execution, operational log

Not part of the analytical model. Does not join to the other tables. Exists so
that a failed or partial run is visible after the fact.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint, identity, PK | Identity rather than bigserial — no separate sequence to grant |
| `started_at` | timestamptz | Written when the run begins |
| `finished_at` | timestamptz, null | Written on completion; stays null if the job dies |
| `status` | text | `running` \| `success` \| `failed` |
| `mode` | text | `daily` \| `weekly` \| `backfill` — the resolved window, not the argument passed |
| `channels_processed` | integer | Expect 40 |
| `snapshots_written` | integer | Expect ~400 |
| `error_message` | text, null | Populated on failure |

**Write pattern:** insert a row with `status = 'running'` at the start, update it
at the end. The final update must run in a `finally` block, so a run that fails
predictably — API error, network timeout, bad credentials — still records
`status = 'failed'` and an `error_message` rather than dying silently.

A permanent `running` row therefore means something worse: the process was
killed outright and never reached its own error handling. Distinguishing "the job
failed" from "the job vanished" matters, because they have different causes and
different fixes.

A run that completes with far fewer rows than expected must be treated as a
failure, not a success.



### Access control — two layers

Supabase exposes every table in the `public` schema through an auto-generated
REST API. Two independent mechanisms control access to it, and both must be set
deliberately:

**Grants** decide whether a role may touch a table at all. This project was
created with "Automatically expose new tables" turned OFF, so new tables start
with no privileges for anyone. `schema.sql` grants `SELECT`, `INSERT`, `UPDATE`
on all four tables to `service_role` — the role the collection job
authenticates as. No `DELETE`: nothing in the job removes rows. Nothing is
granted to `anon` or `authenticated`.

**Row Level Security** decides which rows a role that already has a grant may
see. Enabled on all four tables with no policies, which seals them from the
Data API. The secret key bypasses RLS, so the collection job is unaffected.

If a query ever fails with `42501 permission denied for table`, that is the
grant layer, not RLS — RLS failures return empty results, not errors.

When the front end is built it gets both layers opened, narrowly: a `SELECT`
grant plus a `SELECT` policy for `anon`. No write access is ever granted to
anything but the collection job.

**Views default to security definer.** A Postgres view runs with the permissions
of its owner unless told otherwise, so a view created in the Supabase SQL editor
is owned by `postgres` and reads the underlying tables as `postgres` — straight
past RLS. The project setting that stops new *tables* being exposed does not
cover this. Every view in this project must be created `with (security_invoker =
true)`, so it checks the querying role's own permissions and the two layers above
still hold. This applies especially to the scoring view, which is the object the
front end will actually be granted SELECT on.

### Rule for new fields

Before adding a column, ask whether the value can change after a video is
published. If no, it belongs in `videos`. If yes, it belongs in
`video_snapshots`. Don't duplicate immutable facts into the snapshot table.

## The snapshot job — build this first

Runs **daily**. For all 40 channels, fetches videos inside the current
collection window and writes one row per video per run.

**Tiered window.** The window is a single number — how far back to walk the
uploads playlist before stopping. Nothing else about the run changes.

| Day | Window | Videos in scope | Rows |
|---|---|---|---|
| Monday | 90 days | everything still growing | ~400 |
| Tue–Sun | 8 days | recent uploads only | ~120/day |

**Why daily.** Weekly collection cannot produce a day-7 reading. A video
published the day after a run gets measured at 14 days; one published the day
before gets measured at 8 days. YouTube view curves are heavily front-loaded,
so those readings are not comparable — two identically-performing videos could
differ by ~20% in relative score purely from their publication weekday. That is
a scheduling artefact distorting the headline feature. Daily runs cut the
worst-case measurement error from 6 days to under 1.

**Why day 8 and not day 7.** Buffer. If the day-7 run fails — API outage,
Actions failure, expired credential — the day-8 reading is close enough to
salvage the score. Without that overlap, one failed run destroys a video's
headline metric permanently, because the API holds no history.

**Why Monday still sweeps 90 days.** The 8-day window alone would mean a video
is never measured again after day 8, losing the growth curve and view velocity
entirely. Monday is also where `channels.avatar_url` is refreshed.

**Worked example.** Video published Wednesday 26 August:

| Date | Day | Age | Window | Collected | Why |
|---|---|---|---|---|---|
| Wed 26 Aug | Wed | 0 | 8d | maybe | Only if published before the run hour |
| Thu 27 Aug | Thu | 1 | 8d | yes | |
| Fri 28 Aug | Fri | 2 | 8d | yes | |
| Sat 29 Aug | Sat | 3 | 8d | yes | |
| Sun 30 Aug | Sun | 4 | 8d | yes | |
| Mon 31 Aug | Mon | 5 | 90d | yes | Monday sweep includes it anyway |
| Tue 1 Sep | Tue | 6 | 8d | yes | |
| **Wed 2 Sep** | Wed | **7** | 8d | **yes** | **The 7-day score reads this row** |
| Thu 3 Sep | Thu | 8 | 8d | yes | Buffer day — last day in window |
| Fri 4 Sep | Fri | 9 | 8d | no | Cutoff is 27 Aug; video falls outside |
| Sat 5 Sep | Sat | 10 | 8d | no | |
| Sun 6 Sep | Sun | 11 | 8d | no | |
| Mon 7 Sep | Mon | 12 | 90d | yes | Monday sweep picks it back up |
| Tue 8 Sep | Tue | 13 | 8d | no | |
| Wed 9 Sep | Wed | 14 | 8d | no | |

Result: ~9 rows in the first fortnight — days 1–8 consecutively, then Mondays
only until the video ages out at day 90. Dense where the curve is steep,
sparse where it is flat.

**Fields captured per row:** `video_id`, `snapshot_date`, `views`, `likes`,
`comments`, `title`, `thumbnail_url`. Title and thumbnail are captured on
**every** run, not once — creators change both after publishing, and a record
of those changes is itself a signal worth having for a marketing audience.

**Age measurement.** `published_at` is a timestamptz; `snapshot_date` is a
date. Age is computed by date subtraction only, and the workflow is pinned to a
fixed UTC hour. This accepts sub-day imprecision deliberately: storing snapshot
timestamps and interpolating would be real complexity for a rounding error.
Consequence — the run hour is effectively a constant. Moving it later would
make every video appear marginally older, shifting scores against the
historical record.

## Scoring — LOCKED

**Metrics:** views; engagement rate `(likes + comments) / views`; view velocity
(views per day since publication); estimated watch time `views × duration`
(secondary only, always labelled an estimate).

**Absolute ranking:** straight ranking by the selected metric.

**Relative ranking — the headline feature.** How well a video performed compared
to what is normal *for that specific channel*. A channel averaging 2K views
hitting 12K is far more remarkable than a channel averaging 10K hitting 12K.
This is the product's core differentiator.

```
Outlier Score = the video's figure / that channel's baseline median
(both measured at the same age — see the window table below)
```

**7-day window:** views at day 7 / the channel's median day-7 views.
**90-day window:** views at ~90 days / the channel's median ~90-day views —
currently the lifetime proxy on both sides, until real 90-day snapshots exist.

The metric is whichever of views, likes or comments the user has selected;
views is the default.

**Display format: a multiple, written `75×`.** The score is a ratio and must
read as one. The ban on percentages stands — see below — and the `×` satisfies
it more directly than a bare number does, because it cannot be misread as a
share of something.

Scores range wider than "near 1.0" suggests. Measured on long-form views:
p25 0.56, p50 1.04, p75 1.92, p95 7.21, with a tail reaching ~75. The median
of 1.04 is the baseline calibrating correctly; the tail is real, and it is the
product's whole point. Channel view counts are heavily right-skewed — routine
output at 2–5K views alongside a documentary at 300K — and the median is
chosen precisely so that skew shows rather than being absorbed.

Baseline specification:

- **Median** views of the channel's **last 15 videos**, published between **30
  days and 24 months ago**.
- Median, not mean — one viral video would otherwise permanently distort it.
- **30-day floor:** videos younger than 30 days haven't finished accumulating
  views; including them drags the median down and inflates every score.
- **Minimum 10 videos** for a valid baseline. The once-a-month selection rule
  means this should almost never bind.
- Computed **separately for Shorts and long-form** — different view scales.
- The video being scored is **excluded** from its own baseline.
- **Recomputed weekly.**

- **Day-7 measurement.** Daily collection means every video is snapshotted at
  exactly 7 days of age. The 7-day score reads that row. Day 8 is collected as
  a buffer against a failed run.

**UI constraint:** the Outlier Score must **never** be shown as a percentage
("180% of normal"), because that invites the wrong reading. Present it as an
Outlier Score and lead with the ranking. Age-matching removes a systematic bias; it does not compress natural variance, and most scores are near 1.0 only in the sense that the median is.

### Two windows, one version

There is no v1/v2 split. The prototype ships **one** scoring model with a
user-facing toggle between two age-matched windows.

| Window | Numerator | Denominator |
|---|---|---|
| 7-day | the video's figure at day 7 | median day-7 figure of that channel's other videos |
| 90-day | the video's figure at ~90 days | median ~90-day figure of that channel's other videos |

Both sides of each ratio are measured at the same age. This removes the scale
mismatch an earlier draft accepted, so a relative score of 1.4 genuinely means
40% above that channel's normal — in either window, for every channel.

Critically, **no channel is ever on a different scale from another.** An
earlier design switched channels from a lifetime baseline to a 7-day baseline
individually as data accumulated, which would have put channels on scales
differing by roughly 3×. Since the headline feature ranks videos *across*
channels within a category, that would have silently turned the leaderboard
into "which channels have been tracked longest." Both windows are age-matched
from day one, so this cannot happen.

**The 90-day proxy.** Real 90-day snapshots do not exist until three months
after collection begins. Until then the 90-day window uses **lifetime views
from the backfill** as a stand-in. For *relative* scoring this is sound: the
proxy appears in both numerator and denominator and largely cancels. For
*absolute* scoring it means the 90-day list ranks lifetime totals, so older
videos rank higher. This is accepted for the prototype — the 90-day view is
deliberately the static, "best of all time" list. When real 90-day snapshots
exist, the proxy is swapped out in SQL with no front-end change.

Parked, not built: a publication-date filter on the 90-day window (6 months /
1 year / 2 years / all time) would remove the age skew. Not in the prototype.

**Which videos appear in each window**

| Window | Pool | Character |
|---|---|---|
| 7-day | videos that reached day 7 within the last 30 days | Trending — what has performed recently |
| 90-day | all collected videos | Static — best performing all time |

The 7-day pool is 30 days rather than 7 for two reasons. A day-7 reading is
frozen once taken, so widening the pool adds depth rather than churn — a strong
video persists for four weeks instead of one. And on day one of the demo, only
videos published *since collection started* have a day-7 row at all; a 7-day
pool would show a single week of them. The page is therefore labelled by month,
not week.

**Metrics available in both windows.** Views, likes and comments each work
absolute and relative. Caveat on relative comments: medians are small, so a
channel whose median is 8 comments hitting 30 scores 3.75 on what is largely
noise. `likes` and `comments` are nullable — creators can disable them — so
use `COALESCE(x, 0)` and treat a null median as no valid baseline.

**Provisional Score.** A baseline is provisional when it rests on fewer than 10
reference videos. This is evaluated **per channel, per format, per window** —
so a channel can be provisional on Shorts but not long-form, or on 7-day but
not 90-day.

> **Provisional Score** — baseline drawn from a limited number of reference
> videos.

Expect this on most channels' 7-day scores early on, since a day-7 reading only
exists for videos published after collection began. It clears channel by
channel as data accumulates, with no release and no front-end change.

It is permanent product furniture, not a temporary patch: a newly added channel
always starts thin, and the Shorts/long-form split means a channel that posts
long-form weekly and Shorts occasionally may stay provisional on Shorts
indefinitely.

**Front-end contract.** The front end reads two fields per video per window:
`outlier_score` and `is_provisional`. How the baseline is computed lives in a
database view behind those fields. Changing the proxy, the pool or the threshold
is a SQL change the front end never sees. This is what makes the prototype
buildable now without rework later. Two obligations the contract places on the consuming query. Sorting is the
front end's job — the view carries no `ORDER BY`, because one inside a view is
discarded the moment the consumer sorts for itself. And Postgres sorts NULLS
FIRST on a DESC sort, so **every relative ranking must specify nulls-last
explicitly** or a video with no valid baseline ranks #1 on a card with no score
printed on it. In supabase-js:
`.order('outlier_score', { ascending: false, nullsFirst: false })`.

The 90-day pool is uncapped by publication date, so `published_at` is exposed
as a column and any date cap is a `WHERE` clause the front end adds per
request. Deliberately not in the view — hardcoding it would turn a possible
user-facing toggle into a fixed constant.

The view is **materialised**. Two objects: `scoring_view_live` holds the query
— the scoring logic lives there and nowhere else — and `scoring_view` is a
stored copy of its output, carrying the indexes and read by the front end. The
front end reads the same name it always did, so the contract above is
unchanged.

`collect.py` calls `refresh_scoring_view()` after its three failure checks
pass, never before: a run that failed its checks must not publish its data to
the page. A failed refresh is itself a failed run — `status = 'failed'`, an
`error_message` naming the refresh, and no Healthchecks ping.

Adding the 7-day arm is unaffected: it is a second `union all` block inside
`scoring_view_live`, and the next refresh picks it up.

Access-control exception, stated rather than glossed: RLS does not apply to
materialised views, and they cannot be `security_invoker` — they read the
underlying tables as their owner. This exposes nothing new, since `anon`
already holds SELECT on `channels`, `videos` and `video_snapshots`, all public
YouTube data. But it is a real deviation from the two-layer model and needs
re-examining if any table this view reads ever holds something `anon` should
not see directly.

## Prototype features — must have

Single page, no accounts, no login, public and read-only. Layout reference:
`preview.png` in the project folder.

**Filter bar, fixed at the top.** Four independent filters:

| Filter | Options | Effect |
|---|---|---|
| Time window | 7-day \| 90-day | Which age the figure is read at, and which pool of videos is eligible |
| Metric | Views \| Comments \| Likes | Which number is ranked |
| Comparison | Absolute \| Relative | Raw figure, or Outlier Score against the channel's median |
| Format | Long-form \| Shorts | Which set of videos, and which baseline |

Any combination is valid — 24 in total. Example: 7-day + likes + relative +
long-form ranks long-form videos by how far their day-7 likes exceeded the
channel's median day-7 likes, among videos that reached day 7 in the last month.

**Format filter is not optional.** Shorts and long-form sit on entirely
different view scales. Without the split, Shorts dominate every absolute
ranking and the comparison is meaningless.

**Results.** Four category sections in fixed order: Brands, Professional
Triathletes, Cycling Teams, Influencers. Each shows the top 3 videos for the
current filter combination, with rank (#1, #2, #3…), thumbnail, duration, title, channel name and avatar, and views / comments / likes. Under Relative comparison, the card also shows the Outlier Score as a multiple. Rank is positional — the front end derives it from the order of the returned rows, not from a column on the view. A "Show more" button expands to the full
ranked list for that category.

All four categories are always visible on one page — the cross-category view is
the point. A marketer wants to see what teams are doing next to what brands are
doing, without navigating.

## Front-end architecture

**Stack.** Vite + React + React Router, deployed as a static site. No server:
the browser reads `scoring_view` directly with the Supabase publishable key.
Nothing here is private — the anon role holds SELECT on public YouTube data
and nothing else — so a server would add a deployment surface without adding
protection. The secret key never enters `frontend/`.

Lives in `frontend/` inside this repo rather than a repo of its own, so one
link shows a prospective employer the collection job, the schema, the
decision log and the product together.

**Two routes.**

| Route | What it is |
|---|---|
| `/` | Homepage — four category sections, top 3 each |
| `/category/:category` | One category, ranked, 20 per page |

`:category` carries the raw database value — `brands`, `triathletes`, `teams`,
`influencers` — not a prettier slug. The CHECK constraint on
`channels.category` already makes those four a closed set; a translation layer
between URL and database would be a second place to maintain and would break
silently on a rename.

**"Show more" is navigation, not expansion.** It leaves the homepage and opens
the category page. That page shows the same ranking continued, numbered from
#1 — so the three videos from the homepage appear again at the top. They are
not duplicated on screen, because the homepage is no longer there.

**Filter state lives in the URL as query params.**

| Param | Values | Default |
|---|---|---|
| `window` | `7d` \| `90d` | `90d` — see below |
| `metric` | `views` \| `likes` \| `comments` | `views` |
| `comparison` | `absolute` \| `relative` | `absolute` |
| `format` | `longform` \| `shorts` | `longform` |
| `page` | integer | `1` |
| `exclude` | comma-separated `channel_id` list | empty — all channels shown |

Missing params fall back to their default, so a bare URL always resolves to a
valid state and no half-set combination has to be handled.

The URL is the single source of truth rather than React state. Three things
then come free instead of being built: refresh keeps the current filters, the
browser back button steps back one filter change, and a link can be shared
with its filters intact. Carrying state across the two routes stops being a
feature at all — the link behind "Show more" simply passes the params along.

Defaults live in exactly one place, `frontend/src/lib/filters.js`, exported as
`DEFAULT_FILTERS` alongside a resolver that takes a `URLSearchParams` and
returns every filter resolved to its URL value or its default. Both pages use
that resolver; the defaults appear nowhere else.

**The filter bar appears on both routes** and is fully active on both. Changing
a filter on the category page re-ranks that page in place — no returning to
the homepage to filter. Every filter change must reset `page` to 1: page 3 of
long-form may not exist under Shorts.

**Reading the view.** `format` is not a column — it maps to `is_short`
(`longform` → false, `shorts` → true). The view is tall, so each video appears
once per window per metric, with `views`, `likes` and `comments` all populated
on every row and `value` holding whichever metric that row is for. One row
therefore carries everything a card needs.

Ordering is by `outlier_score` under relative and by `value` under absolute,
descending, and always with `nullsFirst: false` — see the front-end contract.
Pagination is `.range()`, 20 rows per page.

**Rank is positional and offset-aware.** The view carries no rank column. The
front end derives it from row order plus the page offset: the first row of
page 2 is #21.

**Page size depends on format.** Long-form is 20 per page, Shorts 24. Shorts
are portrait, so more fit per row, and 24 divides cleanly into every
breakpoint's column count while 20 does not.

| | Mobile | Tablet | Small laptop | Wide | Per page |
|---|---|---|---|---|---|
| Long-form | 1 | 2 | 4 | 5 | 20 |
| Shorts | 3 | 4 | 6 | 6 | 24 |

Page size lives in one exported helper in `frontend/src/lib/filters.js`,
used by both `queries.js` for `.range()` and the page for the rank offset.
If those two numbers ever diverge, videos are silently skipped or repeated
between pages — a plausible-looking list with no error. This is also why
`page` must reset to 1 on every filter change: page 5 of Shorts can reach
further than page 5 of long-form exists.

**The category page grid follows YouTube's own layout** — thumbnail with a
duration badge bottom-right, title, channel name and avatar beneath. It
departs from YouTube on one point deliberately: views, likes and comments
are shown on every card including Shorts, where YouTube shows views alone.
Shorts and long-form never mix in one list, since the format filter is a
toggle, so each grid has a single aspect ratio: 16:9 for long-form, 9:16
for Shorts.

**The Outlier Score is a badge on the top-left of the thumbnail**, shown only
under Relative, formatted as a multiple with one decimal and an explicit `×`.
It sits on the thumbnail rather than among views/likes/comments so it reads
as a judgement about the video rather than a fourth statistic — it is the
product's differentiator, and it is the only value that appears and
disappears with a filter, which would make a row of four numbers jump.

A null `outlier_score` shows no badge. Null means no valid baseline exists,
which is not the same as a score of zero: `0.0×` on a video with 40,000
views reads as a broken product. The Provisional badge covers that case, so
the card still says something — on the other corner.

**The Provisional badge sits top-right and is deliberately subtle** — muted
and low contrast. It is a caveat, not a warning, and must not compete with
the score badge opposite it.

**The channel filter answers a different question from the other four.**
Window, metric, comparison and format all describe *how* performance is
measured. `exclude` describes *what is relevant to the person looking*. A
brand may find Red Bull Bike's BMX and downhill content genuinely
high-performing and still irrelevant: the score is right, the fit is wrong.
No measurement filter can express that.

It therefore sits on its own row beneath the four, divided by a rule, rather
than as a fifth group. Excluded channels appear as removable chips beside
the control, so a filtered list never looks like a short list — without
them, a user forgets they are filtering and wonders what is missing.

All channels are on by default and the URL carries only the exclusions, so a
bare URL stays short. Excluding a channel filters which videos are listed
and changes no other video's score, because baselines are computed per
channel.

**Thumbnails link to the video on YouTube, opening in a new tab.** This also
settles the thumbnail question in YouTube's API Terms, which require a
thumbnail to link back to the video rather than stand alone. The data
retention rules remain to be reviewed before a public URL, but they do not
constrain the front end.

**`avatar_url` is null on every row until the first Monday sweep** — avatars
are refreshed only on the 90-day run, and the first real Monday is 24 August.
Cards must render without an avatar rather than treating it as required. This
is permanent behaviour, not a temporary gap: a newly added channel has no
avatar until the following Monday either.

**`window` defaults to `90d` rather than `7d` while the 7-day arm of the
scoring view does not exist.** A bare URL would otherwise open on four empty
categories, which reads as a broken site rather than as an empty window.
Revert to `7d` once the 7-day arm is live — it is the trending view and the
more interesting default for a marketer. One line in `DEFAULT_FILTERS`.

## Explicitly out of scope

Transcript summaries; the "why did it work" auto-tagging layer; cross-category
benchmarking; weekly digest email (planned for n8n, post-prototype); a "how the Outlier Score works" page;
Instagram/TikTok; user accounts; more than 40 channels.
A publication-date filter on the 90-day window (6 months / 1 year / 2 years /
all time). Would remove the age skew in absolute 90-day rankings. Parked
deliberately — explain it rather than build it.

These are good ideas parked deliberately, not oversights. Don't build them
without asking.

## Where things stand

See `DECISIONS.md` for current state, decisions made, and open questions. Read it
at the start of a session before proposing work.

`NEXT_STEPS.md` holds the working checklist for what to do next.


## Stack

- **Database:** Supabase (Postgres), free tier, EU region. Four tables — see
  Data model above.
- **Collection job:** Python script, run daily by GitHub Actions at **06:17
  UTC**, defined in `.github/workflows/collect.yml`. Off the top of the hour
  deliberately: GitHub's scheduler is busiest at :00 and scheduled runs get
  queued or dropped under load. Treat this hour as a constant — age is measured
  by date subtraction, so moving it shifts every score against the existing
  record. The scheduled run passes no `--mode`; only a manual dispatch does. No
  keep-alive workflow is needed — daily runs touch Supabase well inside the free
  tier's 7-day inactivity pause boundary.

- **Monitoring:** Healthchecks.io dead man's switch. Period 1 day, grace 4 hours
  — a 28-hour window. Pinged only when all three failure checks pass; a failed
  run stays silent, because the missing ping is what reaches a human.
- **YouTube access:** API key, not OAuth. Restricted to YouTube Data API v3.
- **Secrets:** `.env` locally, GitHub Secrets in Actions. Never in committed
  files, never hardcoded.

| Variable | What it is |
|---|---|
| `YOUTUBE_API_KEY` | YouTube Data API v3 key |
| `SUPABASE_URL` | Supabase project API URL |
| `SUPABASE_SECRET_KEY` | Supabase secret key (`sb_secret_...`) |
| `HEALTHCHECKS_URL` | Healthchecks.io ping URL — **GitHub Secrets only, never in local `.env`** |

`HEALTHCHECKS_URL` is deliberately absent from the local `.env`. If a laptop had
it, a manual test run would ping Healthchecks and reset the timer — silencing an
alarm about the *scheduled* job having failed to run. The script treats the
variable as optional and logs the skip, so the environment decides.

Supabase now issues `sb_publishable_...` and `sb_secret_...` keys in place of the
legacy `anon` and `service_role` JWTs. The collection job uses the **secret**
key, which bypasses Row Level Security and must only ever run on a machine we
control. The front end, when it exists, uses the **publishable** key. The secret
key never appears in front-end code.

- **Front end:** Vite + React + React Router, static hosting. See
  Front-end architecture below. Hosting provider not yet chosen — any static
  host works, with one requirement: all routes must rewrite to `index.html`,
  or a direct link to `/category/teams` returns 404.

## Collection job requirements

The collection job must:

1. Read the channel list from the `channels` table — never from a hardcoded list.
2. For each channel, fetch the uploads playlist, then video details in batches
   of 50. Never use `search.list` (100 quota units per call).
3. Filter to videos published inside the current window: 8 days on Tue–Sun, 90
   days on Monday. This is the *collection* window — which videos get
   re-measured — and is deliberately not the baseline window. Videos past 90
   days barely move; re-fetching them daily would be thousands of rows to watch
   numbers that don't change.
4. Insert any video not already in `videos`. Never update existing rows there.
  Videos under 180 seconds get a HEAD check to `youtube.com/shorts/{video_id}`
   before `is_short` is written; duration alone gets roughly half of them wrong.
   Videos over 180 seconds are long-form with certainty and must not be checked.
   The check falls back to the duration heuristic on any non-200/303 response,
   reporting and counting the fallback — an unofficial endpoint having a bad day
   must never abort a run. Videos whose duration cannot be determined at all —
   `P0D` for live streams and premieres, or no `duration` field on a video still
   processing — are skipped entirely and counted, never written as 0 seconds,
   which would file a long stream as a Short.
5. Upsert today's numbers into `video_snapshots` on
   `(video_id, snapshot_date)`, so a re-run on the same day overwrites rather
   than duplicating.
6. Write a row to `job_runs` recording start, finish, status, row count, and any
   error.
7. Refresh the materialised view by calling `refresh_scoring_view()`, only
   after all three failure checks have passed. A run that failed its checks
   must not publish its data. If the refresh itself fails, the run is failed:
   `status = 'failed'`, an `error_message` naming the refresh, and no ping.
   Runs in every mode, backfill included.
8. Ping the Healthchecks.io URL as the final action, only on full success.

**Fail loudly — three checks, all of which must pass for `status = 'success'`.**

1. **Completeness.** `channels_processed` equals the number of channel rows read
   at the start of the run. Never a hardcoded 40 — the channel list is data.
2. **Consistency.** `snapshots_written` equals the number of videos found inside
   the window. Catches a partial write without needing to know what a normal
   figure looks like.
3. **Volume.** `snapshots_written` is at least 50% of the last successful run of
   the same weekday *and the same mode*. Skipped, and logged as skipped, when no
   such run exists.

A failed check writes `status = 'failed'` and an `error_message` naming the check
and both numbers, and suppresses the Healthchecks ping. The Healthchecks grace
period is 28 hours.

### Modes

The script takes an optional `--mode` argument:

| Mode | Window | When |
|---|---|---|
| *(none)* | Derived from today's date: 90 on Monday, 8 otherwise | Default — what GitHub Actions runs |
| `weekly` | 90 days | Manual override, for testing the Monday path on a non-Monday |
| `daily` | 8 days | Manual override |
| `backfill` | 100 videos per channel, ignoring publish date | Once, before the first scheduled run |

Default-by-date means the scheduled workflow passes no argument and cannot be
scheduled with the wrong mode. The overrides exist so the 90-day path can be
tested without waiting for a Monday.

One script rather than two: backfill and collection share ~90% of their logic —
read channels, walk uploads playlist, batch video details by 50, insert to
`videos`, upsert to `video_snapshots`, log to `job_runs`. Only the window
differs. Two files would mean two places to fix every bug.

**Backfill.** For each channel, walk the uploads playlist back 100 videos
regardless of publish date, insert into `videos`, and write one
`video_snapshots` row each dated today. ~4,000 videos, ~160 quota units. 100
videos is two pages of 50, so the backfill requires pagination.

Without it there is no baseline: only videos inside the collection window would
enter `videos`, giving 8–9 usable reference videos for a weekly uploader and
2–3 for a monthly one — both under the minimum of 10. The relative score, the
product's headline feature, could not be computed for a single channel.

**Why 100 and not 30.** The depth is set by the Shorts/long-form split, not by
publish dates. Measured across all 40 channels, brand channels run around one
long-form video in twelve — Decathlon 46 Shorts to 4 long-form, Red Bull Bike
45 to 5, Canyon 43 to 7. A 30-video backfill would give those channels 2–3
long-form reference videos against a minimum of 10, so the headline feature
would be Provisional on long-form across most of the brands category on day one.
100 clears the middle of the distribution outright and brings the worst cases
close. It does not rescue genuinely thin channels — one triathlete channel has 9
videos in total — and is not meant to; that is the Provisional label's job.

The backfill snapshot is also what the 90-day window reads until real 90-day
snapshots exist.