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

- [ ] **6. Fix Shorts classification.** Mostly done. Diagnosis and prevention
      are complete; the correction run is the remaining work.

      **Done:** the HEAD check is verified (12/12) and wired into `collect.py`
      for every video under 180 seconds. The cause of the earlier uniform 302s
      was the opposite of what was assumed — YouTube routes browser-like
      User-Agents to a GDPR consent redirect, so the *default* requests
      User-Agent is required and a realistic Chrome string breaks it. Two
      `--mode daily` runs since: 90 checks, 0 fallbacks, 42 videos that the
      heuristic would have got wrong. A second crash was found and fixed on the
      way — a missing `contentDetails.duration` field, distinct from `P0D`;
      both now take the same skip path.

      **Remaining:**
      - [ ] Run `scripts/fix_shorts_classification.py` without `--dry-run`. The
            dry run checked all 1,982 rows and found **375** to reclassify from
            Short to long-form, with 2 failures on YouTube-side HTTP 500s. Takes
            ~15 minutes. Safe to interrupt and re-run: the query selects only
            `is_short = true`, so corrected rows drop out of the next pass.
      - [ ] Re-run the per-channel long-form counts afterwards. Every figure
            from before this fix was measured against a classification now known
            to be wrong on ~19% of Shorts.
      - [ ] Only then revisit the backfill depth question. Decathlon (6), Red
            Bull Bike (8) and Malachi Cashmore (9) were the channels below the
            10-video threshold, and all three are brand-style channels posting
            short regular videos — the exact profile the fix corrects. The
            problem may substantially disappear. Do not raise the depth before
            looking at the corrected numbers.

      Note for later: `collect.py` reads the `channels` table without
      pagination, so it is implicitly capped at 1,000 rows — the same silent
      truncation that hit the correction script. Not a live problem at 40
      channels and deliberately not fixed, but it would break silently if the
      channel list ever grew past 1,000.

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