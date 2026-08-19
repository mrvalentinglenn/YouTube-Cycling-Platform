# Next steps

Working checklist. Delete items once done — this file only shrinks. Reasoning
lives in DECISIONS.md, not here.

Goal of this stretch: get the collection script written, running, and scheduled.
Collection starts the day the script first runs successfully — every day before
that is data that cannot be recovered.

---

## The collection script

Stages 1–5 are done and deleted. `scripts/collect.py` reads the channel list
from the table, walks each uploads playlist with pagination, derives its window
from the date or from `--mode`, and writes to `videos` and `video_snapshots`.
The backfill has run: 3,824 videos across all 40 channels.

- [ ] **6. Fix Shorts classification.** The duration heuristic is wrong on this
      dataset — brand channels publish regular videos under 3 minutes, some
      under 60 seconds, so no duration floor separates them. The HEAD check to
      `youtube.com/shorts/{video_id}` does work: verified with curl, 200 for a
      Short and 303 for a regular video. But the same request from Python
      returned 302 for all twelve test videos, so the difference is in what the
      Python request sends. `scripts/test_shorts_check.py` is the diagnostic.

      Two pieces, and they are separate work:
      - **Prevention** — in `collect.py`, HEAD-check every video under 180
        seconds before writing `is_short`. A daily run finds ~120 videos, so
        this is a few dozen extra requests. This is the permanent fix.
      - **Correction** — a one-off script to re-check the ~3,000 existing rows
        already marked as Shorts and update `is_short` where wrong. Not part of
        `collect.py`: it shares almost no logic with collection, and it runs
        once.

      Re-check the long-form counts per channel afterwards. The current figures
      for Decathlon (6), Red Bull Bike (8) and Malachi Cashmore (9) are measured
      against a classification known to be wrong, so the backfill depth question
      cannot be settled until this is fixed.

- [ ] **7. Add `job_runs` writes.** Insert a row with `status = 'running'` at
      the start, update it at the end. The final update must run in a `finally`
      block, so a predictable failure still records `status = 'failed'` and an
      error message. A row stuck at `running` then means something worse — the
      process was killed and never reached its own error handling. Include the
      resolved `mode`, and implement the three failure checks defined in
      DECISIONS.md.

- [ ] **8. Move to GitHub Actions, daily schedule.** Fixed UTC hour, and treat
      that hour as a constant once collection starts. Secrets go in GitHub
      Secrets, never in the workflow file. Collection is now live.

- [ ] **9. Add the Healthchecks.io ping.** Final action of the run, only on full
      success. Configure the check for a daily period with a 28-hour grace
      period, not weekly.

---

## After this stretch

The front end. Don't start it until snapshots have been accumulating for at
least a few days — designing against an empty table means designing against
guesses.

Rough order once you get there:

1. Database view exposing `outlier_score` and `is_provisional` per video, per
   window, per metric. All baseline logic lives here, not in the front end.
   Check the median-over-15-videos query is fast enough to run on read.
2. Decide the front-end stack and hosting.
3. Build the page from `preview.png`: filter bar with four controls (window,
   metric, comparison, format), four category sections, top 3 each, "show more"
   to expand.
4. Verify the Provisional label appears where it should — early on it will be on
   most channels' 7-day scores, which is correct and worth being able to explain.

---

## Small things, whenever


- [ ] Add `.env.example` — same three variable names, no values, committed.
      Documents what the project needs to run without leaking anything. Best
      done alongside the README.
- [ ] Write a README.
- [ ] Review YouTube's API Services Terms on data retention and thumbnail
      display, before anything goes to a public URL.

---

## Rules for this file

- Delete items when done. Don't tick and keep.
- If a task turns out to be bigger than expected, split it rather than letting
  it sit half-finished.
- Decisions made along the way go in DECISIONS.md, not here.