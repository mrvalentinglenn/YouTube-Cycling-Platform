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

**Collection frequency:** weekly for the prototype. Possibly daily later.

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

Adding a channel is a new row here — never a code change.

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
| `likes` | integer | Engagement |
| `comments` | integer | Engagement |
| `title` | text | Captured every run — creators change titles |
| `thumbnail_url` | text | Captured every run — creators change thumbnails |

Composite primary key `(video_id, snapshot_date)` — one row per video per run,
and re-running the same day overwrites rather than duplicates.

~400 new rows per week. This table only grows.

### How they join

`channels.channel_id` → `videos.channel_id` → `video_snapshots.video_id`.

"Top 3 brand videos this week" = filter `channels` by category, follow to their
`videos`, join this week's `video_snapshots`.

### `job_runs` — one row per execution, operational log

Not part of the analytical model. Does not join to the other tables. Exists so
that a failed or partial run is visible after the fact.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial, PK | |
| `started_at` | timestamptz | Written when the run begins |
| `finished_at` | timestamptz, null | Written on completion; stays null if the job dies |
| `status` | text | `running` \| `success` \| `failed` |
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

### Access control (RLS)

Supabase exposes every table in the `public` schema through an auto-generated
REST API. Row Level Security is enabled on all four tables with **no policies**,
which seals them from that API completely. The collection job reaches them with
the secret key, which bypasses RLS.

When the front end is built, each table gets one policy granting `SELECT` to
anonymous visitors — read-only public access, matching "no user accounts, no
login". No write policy is ever added: nothing but the collection job writes.

### Rule for new fields

Before adding a column, ask whether the value can change after a video is
published. If no, it belongs in `videos`. If yes, it belongs in
`video_snapshots`. Don't duplicate immutable facts into the snapshot table.

## The snapshot job — build this first

Runs weekly. For all 40 channels, fetches every video published in the last 90
days and writes one row per video per run.

| Field | Purpose |
|---|---|
| `video_id` | Key |
| `snapshot_date` | Key — makes it a time series |
| `views` | Core metric |
| `likes` | Engagement |
| `comments` | Engagement |
| `title` | Results view; also enables title-pattern analysis later |
| `thumbnail_url` | Results view; also enables thumbnail analysis later |

Title and thumbnail are captured on **every** run, not once — creators change
both after publishing, and a record of those changes is itself a signal worth
having for a marketing audience.

Volume: ~400 rows/week. Trivial.

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
- **7-day measurement lag:** each weekly run scores videos published 8–14 days
  earlier, so every video is measured with the same yardstick.

**UI constraint:** the baseline uses lifetime totals of mature videos while the
scored video is only 7 days old, so most scores land well below 1.0. Fine for
ranking — every video in a given week is measured identically — but the number
must **never** be shown as a percentage ("180% of normal"), because that invites
the wrong reading. Present it as an Outlier Score and lead with the ranking.

## Prototype features — must have

- Filter: absolute vs relative success.
- Filter: Shorts vs long-form.
- Results view: top 3 videos of the week per category, each with thumbnail and
  title.
- "See more" to reveal #4, #5, #6 and beyond.
- No user accounts, no login. Public and read-only.

## Explicitly out of scope

Transcript summaries; the "why did it work" auto-tagging layer; cross-category
benchmarking; weekly digest email (planned for n8n, post-prototype);; a "how the Outlier Score works" page;
age-matched v2 baselines; growth curves in the UI; engagement as a user-facing
filter; daily collection; Instagram/TikTok; user accounts; more than 40 channels.

These are good ideas parked deliberately, not oversights. Don't build them
without asking.

## Where things stand

See `DECISIONS.md` for current state, decisions made, and open questions. Read it
at the start of a session before proposing work.

`NEXT_STEPS.md` holds the working checklist for what to do next.

## Stack

## Stack

- **Database:** Supabase (Postgres), free tier, EU region. Four tables — see
  Data model above.
- **Collection job:** Python script, run weekly by GitHub Actions.
- **Keep-alive:** a second GitHub Actions workflow, every 2–3 days, issuing one
  trivial read against Supabase. Free-tier projects pause after 7 days of
  inactivity, and the weekly collection job alone sits exactly on that boundary.
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

The weekly job must:

1. Read the channel list from the `channels` table — never from a hardcoded list.
2. For each channel, fetch the uploads playlist, then video details in batches
   of 50. Never use `search.list` (100 quota units per call).
3. Filter to videos published in the last 90 days.
4. Insert any video not already in `videos`. Never update existing rows there.
5. Upsert this week's numbers into `video_snapshots` on
   `(video_id, snapshot_date)`, so a re-run on the same day overwrites rather
   than duplicating.
6. Write a row to `job_runs` recording start, finish, status, row count, and any
   error.
7. Ping the Healthchecks.io URL as the final action, only on full success.

Fail loudly. A run that writes 40 rows instead of 400 must not report success.