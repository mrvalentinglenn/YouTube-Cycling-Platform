# Next steps

Working checklist. Delete items once done — this file only shrinks. Reasoning
lives in DECISIONS.md, not here.

---

## The collection script — done

Stages 1–9 complete and deleted. `scripts/collect.py` runs daily on GitHub
Actions at 06:17 UTC, writes to `videos` and `video_snapshots`, logs every
execution to `job_runs` with three failure checks, and pings Healthchecks.io
only on full success. The backfill has run: 3,946 videos across 40 channels.

Collection is live. Nothing further is required to keep it running.



---

## The scoring view — both arms done, materialised

`sql/scoring_view.sql` holds two objects: `scoring_view_live` (the query, tall
shape, `security_invoker = true`, no ORDER BY) and `scoring_view` (the
materialised copy the front end reads, with three indexes). Refreshed by
`collect.py` after its failure checks pass.

Verified: 357 ms for a full `SELECT *` after the baseline was rewritten to
precompute pools (the first version timed out). Score distribution on
long-form views — p25 0.56, p50 1.04, p75 1.92, p95 7.21, 2,350 scored rows.
A median of 1.04 is the baseline calibrating correctly.

**Still to do:**


1. [ ] Mirror `scoring_view.sql` into `sql/schema.sql` now the numbers are
       trusted, so the schema file is a complete description of the database.

---

## The front end

Scaffold, data layer, filter bar, video card and category grid are built and
verified in the browser. Tailwind v4 is installed. What remains:



1. [ ] Replace Vite's default `frontend/README.md` with something
       project-specific.
2. [ ] Choose a static host and deploy. Whichever it is, configure route
       rewriting to `index.html` or a direct link to `/category/teams`
       returns 404.


---

## Small things, whenever


- [ ] One video's is_short was never rewritten by
      scripts/fix_shorts_classification.py — a connection reset during the
      correction run. Which row is unknown; it was not identified by
      spot-checking the shortest long-form videos on 27 August, all of
      which were correctly classified. One row in ~4,000, and daily
      collection does not revisit it. Re-run the script when convenient,
      after checking it still works — it predates collect.py gaining its
      own HEAD check.
- [ ] Red Bull Bike returns 6 long-form baseline videos against ~18 visible on
      the channel. Cause is understood and not a bug — see DECISIONS. No action
      unless it is still thin in a month.
- [ ] Avatars can 429 from `yt3.ggpht.com` under heavy reloading. Measured
      27 August: after a 20-minute pause, a cold incognito load returned all
      40. Development traffic, not structural — no action. If it ever
      recurs on a page a visitor loaded once, the fix is a Supabase storage
      bucket holding the 40 images, which would also settle the parked
      YouTube Terms question on thumbnail handling.    

---

## Rules for this file

- Delete items when done. Don't tick and keep.
- If a task turns out to be bigger than expected, split it rather than letting
  it sit half-finished.
- Decisions made along the way go in DECISIONS.md, not here.