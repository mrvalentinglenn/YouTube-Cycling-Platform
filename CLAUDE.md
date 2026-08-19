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
  costs ~1 unit per 50 items. 40 channels weekly ≈ a couple hundred units/week.
- **Available per public video:** views, likes, comments, duration, publish date,
  thumbnail, title, description, tags.
- **Shorts detection:** no official API flag. Duration ≤ 3 minutes is ~95%
  accurate. An unofficial HEAD request to `youtube.com/shorts/{video_id}` closes
  the gap (200 = Short, 303 = not a Short).
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
| `is_short` | boolean | Result of the Shorts check, stored so it isn't redone |
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
Outlier Score = views at ~7 days / channel baseline median
```

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
Outlier Score and lead with the ranking. This holds even though age-matched
windows put most scores near 1.0.

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
buildable now without rework later.

The view is **live**, not materialised — it recomputes on read, so it can never
serve stale scores. Switching to a materialised view refreshed by the collection
job is a change behind the same two fields, to be made only if the median query
measurably slows the page once real snapshots exist.

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
current filter combination, with thumbnail, duration, title, channel name and
avatar, and views / comments / likes. A "Show more" button expands to the full
ranked list for that category.

All four categories are always visible on one page — the cross-category view is
the point. A marketer wants to see what teams are doing next to what brands are
doing, without navigating.

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
- **Collection job:** Python script, run daily by GitHub Actions at a fixed UTC
  hour. No keep-alive workflow is needed — daily runs touch Supabase well
  inside the free tier's 7-day inactivity pause boundary.

- **Monitoring:** Healthchecks.io dead man's switch, pinged on successful
  completion.
- **YouTube access:** API key, not OAuth. Restricted to YouTube Data API v3.
- **Secrets:** `.env` locally, GitHub Secrets in Actions. Never in committed
  files, never hardcoded.

| Variable | What it is |
|---|---|
| `YOUTUBE_API_KEY` | YouTube Data API v3 key |
| `SUPABASE_URL` | Supabase project API URL |
| `SUPABASE_SECRET_KEY` | Supabase secret key (`sb_secret_...`) |

Supabase now issues `sb_publishable_...` and `sb_secret_...` keys in place of the
legacy `anon` and `service_role` JWTs. The collection job uses the **secret**
key, which bypasses Row Level Security and must only ever run on a machine we
control. The front end, when it exists, uses the **publishable** key. The secret
key never appears in front-end code.

Front-end stack and hosting are deliberately undecided — the collection job doesn't depend on them.

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
5. Upsert today's numbers into `video_snapshots` on
   `(video_id, snapshot_date)`, so a re-run on the same day overwrites rather
   than duplicating.
6. Write a row to `job_runs` recording start, finish, status, row count, and any
   error.
7. Ping the Healthchecks.io URL as the final action, only on full success.

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
| `backfill` | ~30 videos per channel, ignoring publish date | Once, before the first scheduled run |

Default-by-date means the scheduled workflow passes no argument and cannot be
scheduled with the wrong mode. The overrides exist so the 90-day path can be
tested without waiting for a Monday.

One script rather than two: backfill and collection share ~90% of their logic —
read channels, walk uploads playlist, batch video details by 50, insert to
`videos`, upsert to `video_snapshots`, log to `job_runs`. Only the window
differs. Two files would mean two places to fix every bug.

**Backfill.** For each channel, walk the uploads playlist back ~30 videos
regardless of publish date, insert into `videos`, and write one
`video_snapshots` row each dated today. ~1,200 videos, ~25 quota units.

Without it there is no baseline: only videos inside the collection window would
enter `videos`, giving 8–9 usable reference videos for a weekly uploader and
2–3 for a monthly one — both under the minimum of 10. The relative score, the
product's headline feature, could not be computed for a single channel.

The backfill snapshot is also what the 90-day window reads until real 90-day
snapshots exist.