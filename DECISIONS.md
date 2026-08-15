# Decisions & Current State

How to use this file: rewrite **Current state** each session so it's always
short and true. Append to **Decisions** — never edit or delete past entries.
Move things out of **Open questions** into Decisions once settled. Add to
**Rejected** whenever something is ruled out, always with the reason.

---

## Current state

*Last updated: 2026-08-15*

Nothing built yet. Concept and scoring spec are locked; architecture is not yet
designed.

**Next step:** design the architecture — stack, data model, how the weekly
collection job runs (n8n vs code), and where Supabase fits.

**After that:** get the snapshot job running. It has to start collecting before
anything else is built, because the API holds no history and every week not
recorded is data that can never be recovered.

---

## Decisions

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

- **Architecture — not yet designed.** Stack, data model, and where Supabase
  fits. This is the immediate next step.
- **How does the weekly job run?** n8n or code. n8n leans on existing experience
  and demonstrates the automation skill directly; code may be more robust and
  easier to version-control. Undecided.
- **Hosting** — not decided.
- **The final list of 40 specific channels** — not yet compiled.
- **YouTube API Terms of Service** — rules on data retention and thumbnail
  display need reviewing before anything goes to a public URL.

---

## Rejected — and why

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
