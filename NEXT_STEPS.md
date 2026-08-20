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

**Two things to check on, without doing anything:**

- [ ] Confirm the first scheduled run fires on its own. It has only ever been
      triggered by hand. Check `job_runs` for a row starting near 06:17 UTC.
- [ ] Monday's run should record `mode = 'weekly'` and write ~400 rows rather
      than ~130. That is the date-derived window working; it has never been
      exercised on a real Monday.

---

## Next: the scoring view

This is the piece between the data and anything viewable. Nothing exists yet.

1. [ ] Build the view exposing `outlier_score` and `is_provisional` per video,
       per window, per metric. All baseline logic lives here — median of the
       last 15 videos, 30 days to 24 months, computed separately for Shorts and
       long-form, video excluded from its own baseline. See the Scoring section
       of CLAUDE.md; the spec is locked.
2. [ ] Live view, not materialised. Measure the median query once it exists; only
       switch if it is actually slow.
3. [ ] Give it `security_invoker = true` from the start, as `videos_readable`
       now has. A view defaults to running as its owner and would read straight
       past RLS.
4. [ ] Sanity-check the output against channels you know. Malachi Cashmore and
       Matt Hauser should both come back provisional on long-form; most channels
       should be provisional on 7-day, since day-7 readings only exist for
       videos published since collection began.

---

## After that: the front end

Don't start before the scoring view returns sensible numbers — designing
against a view that doesn't work yet means designing against guesses.

1. [ ] Decide the front-end stack and hosting.
2. [ ] Build the page from `preview.png`: filter bar with four controls (window,
       metric, comparison, format), four category sections, top 3 each, "show
       more" to expand.
3. [ ] Open the two access layers narrowly for `anon` — a SELECT grant plus a
       SELECT policy, on the scoring view only. Never on the tables, never write
       access.
4. [ ] Verify the Provisional label appears where it should.

---

## Small things, whenever

- [ ] Add `.env.example` — four variable names now, no values, committed. Note
      that `HEALTHCHECKS_URL` is deliberately absent from the local `.env`: a
      manual test run must not be able to silence an alarm about the scheduled
      job failing to run.
- [ ] Write a README.
- [ ] Review YouTube's API Services Terms on data retention and thumbnail
      display, before anything goes to a public URL.
- [ ] Re-run `scripts/fix_shorts_classification.py` at some point to pick up the
      one video that failed on a connection reset. One row; no hurry.

---

## Rules for this file

- Delete items when done. Don't tick and keep.
- If a task turns out to be bigger than expected, split it rather than letting
  it sit half-finished.
- Decisions made along the way go in DECISIONS.md, not here.