# Next steps

Working checklist. Delete items once done — this file only shrinks. Reasoning
lives in DECISIONS.md, not here.

Goal of this stretch: get the collection script written, running, and scheduled.
Collection starts the day the script first runs successfully — every day before
that is data that cannot be recovered.

---

## The collection script

Build it in stages. Don't skip ahead — each stage is a thing that can break on
its own, and finding out which one broke is much harder once three are stacked.

- [ ] **1. Read-only, one channel.** Fetch one channel's uploads playlist and
      print the videos it finds. No database writes at all. Confirms the API key
      works, the playlist walk is correct, and the quota cost is what was
      expected.

- [ ] **2. Write, one channel.** Extend it to insert into `videos` and
      `video_snapshots` for that same channel. Writes to `video_snapshots` must
      use `ON CONFLICT (video_id, snapshot_date) DO UPDATE` — the composite key
      prevents duplicate rows but makes a plain re-insert *fail*, which would
      leave a half-finished run impossible to retry. Inserts to `videos` must
      skip rows already present and never update them.

- [ ] **3. All 40 channels.** Loop over the channel list read from the
      `channels` table — never a hardcoded list. Run it manually.

- [ ] **4. Add the tiered window.** With no `--mode` argument the script derives
      its window from today's date: 90 days on Monday, 8 days otherwise. Add
      `--mode daily`, `--mode weekly` and `--mode backfill` as manual overrides,
      so the Monday path can be tested without waiting for a Monday.

- [ ] **5. Run the backfill.** `--mode backfill`, once, manually. Walks each
      channel's uploads playlist back ~30 videos regardless of publish date.
      ~1,200 rows, ~25 quota units. Must happen before the first scheduled run:
      without it no channel has enough reference videos for a baseline, and the
      90-day window has nothing to read at all.

- [ ] **6. Add `job_runs` writes.** Insert a row with `status = 'running'` at
      the start, update it at the end. The final update must run in a `finally`
      block, so a predictable failure still records `status = 'failed'` and an
      error message. A row stuck at `running` then means something worse — the
      process was killed and never reached its own error handling.

- [ ] **7. Move to GitHub Actions, daily schedule.** Fixed UTC hour, and treat
      that hour as a constant once collection starts. Secrets go in GitHub
      Secrets, never in the workflow file. Collection is now live.

- [ ] **8. Add the Healthchecks.io ping.** Final action of the run, only on full
      success. Configure the check for a daily period, not weekly.

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