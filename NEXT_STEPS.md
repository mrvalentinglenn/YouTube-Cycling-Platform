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
- [ ] Scheduled run dropped by GitHub Actions on 27 August — no `job_runs`
      row, caught by Healthchecks, recovered by manual dispatch. One
      occurrence. If it recurs before ~10 September, add a second cron entry
      a few hours after the first: the job is idempotent, so a duplicate is
      a no-op and a dropped first run is covered. One line in
      `.github/workflows/collect.yml`.
- [ ] Unibet Rose Rockets' avatar is still on YouTube's CDN — its
      download failed on a connection reset during the 28 August weekly
      run, so the existing URL was kept rather than overwritten. The next
      weekly run should pick it up. No action unless it fails again.            

---

## Rules for this file

- Delete items when done. Don't tick and keep.
- If a task turns out to be bigger than expected, split it rather than letting
  it sit half-finished.
- Decisions made along the way go in DECISIONS.md, not here.