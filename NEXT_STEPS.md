# Next steps

Working checklist. Delete items once done — this file only shrinks. Reasoning
lives in DECISIONS.md, not here.

---

## The collection script — done

Stages 1–9 complete and deleted. `scripts/collect.py` runs daily on GitHub
Actions at 06:17 UTC, writes to `videos` and `video_snapshots`, logs every
execution to `job_runs` with three failure checks, refreshes the
materialised scoring view, and pings Healthchecks.io only on full success.
On weekly and backfill runs it also uploads channel avatars to the
`channel-avatars` bucket in Supabase Storage. The backfill has run; the
database now holds 4,022 videos across 40 channels.

Collection is live. Nothing further is required to keep it running.


---

## The front end

Scaffold, data layer, filter bar, video card and category grid are built and
verified in the browser. Tailwind v4 is installed. What remains:


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
- [ ] **Monitor the schedule daily until ~10 September, then decide.**
      GitHub's scheduler has been unreliable since 27 August: one dropped
      run that day, then five consecutive runs 5h42m to 12h31m late against
      a 45–75 minute norm. Not the cron and not manual dispatches masking a
      dead schedule — both ruled out on 31 August. Nothing lost so far, and
      the 31 August weekly landed correctly at 14:02 UTC with 1,345 rows.

      What to record each day — one line, from the `job_runs` query:
      the run's `started_at`, its delay against 06:17 UTC, and its `mode`.
      What matters is not any single delay but whether the spread is
      widening, holding, or returning to the earlier 45–75 minute band.

      The cost only arrives if a run crosses midnight UTC, because it then
      writes to the next calendar date. On a Monday that means `collect.py`
      derives `daily`, the 90-day sweep and the avatar upload are skipped for
      the week, all three checks pass and Healthchecks pings. Closest
      approach so far was 28 August, 5h12m short. Note that Healthchecks
      cannot surface any of this: it measures from the last ping rather than
      against a clock, so each late run walks the deadline forward with it.

      **Act immediately, without waiting for 10 September, if any run
      crosses midnight UTC or if a second run is dropped entirely.** Either
      one is the failure itself rather than a warning of it.

      Otherwise decide on ~10 September, on two weeks of data rather than
      one. If the drift has eased back to the earlier band, delete this item
      and record that it resolved on its own. If it is still running to
      hours, add a second cron entry: `17 14 * * 1` protects only the Monday
      sweep, which is the run carrying irreplaceable weight; a daily second
      entry protects every day but overwrites each snapshot with
      later-in-day numbers and runs the avatar upload twice on Mondays. The
      job is idempotent — `video_snapshots` upserts on
      `(video_id, snapshot_date)` — so a duplicate is a no-op. One line in
      `.github/workflows/collect.yml`. It is a second lottery ticket rather
      than a backstop: the same scheduler queues both.

      A self-checking version that queries `job_runs` and exits if today's
      work is already done is better and is a session's work, not a line —
      it needs a `job_runs` row shape for "ran, found nothing to do" that
      check 3 does not then take as its volume reference.


---

## Rules for this file

- Delete items when done. Don't tick and keep.
- If a task turns out to be bigger than expected, split it rather than letting
  it sit half-finished.
- Decisions made along the way go in DECISIONS.md, not here.