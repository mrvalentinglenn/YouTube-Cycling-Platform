# Decisions & Current State

How to use this file: rewrite **Current state** each session so it's always
short and true. Append to **Decisions** — never edit or delete past entries.
Move things out of **Open questions** into Decisions once settled. Add to
**Rejected** whenever something is ruled out, always with the reason.

---

## Current state

*Last updated: 2026-08-15*

Nothing built yet.

**Next steps:** See `NEXT_STEPS.md`.

**After that:** get the snapshot job running. It has to start collecting before
anything else is built, because the API holds no history and every week not
recorded is data that can never be recovered.

---

## Decisions

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

- **Where the scoring calculation runs** — in the collection job, as a separate
  scheduled job, or on read. Not urgent; the snapshot job doesn't depend on it.
- **Front-end stack and hosting — not yet designed.** Deliberately deferred:
  the snapshot job doesn't depend on them, and deciding now would be premature.
- **Shorts detection method.** Duration ≤ 3 min is ~95% accurate and free. The
  HEAD request to `youtube.com/shorts/{video_id}` closes the gap but is
  unofficial and adds a request per video. Undecided — start with duration, add
  the HEAD check only if misclassification shows up in practice.
- **How does the weekly job run?** n8n or code. n8n leans on existing experience
  and demonstrates the automation skill directly; code may be more robust and
  easier to version-control. Undecided.
- **Hosting** — not decided.
- **The final list of 40 specific channels** — not yet compiled.
- **YouTube API Terms of Service** — rules on data retention and thumbnail
  display need reviewing before anything goes to a public URL.


---

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
