# Next steps

Working checklist. Delete items once done — this file only shrinks. Reasoning
lives in DECISIONS.md, not here.

Goal of this stretch: get everything in place so the collection script has
something to read from and somewhere to write to. No script yet.

---

## Session 3 — Compile the 40 channels (~2–3 hrs)

Tedious but unavoidable, and the one task that can't be delegated. Do it in a
spreadsheet, then import.

- [ ] Decide the actual 40 channels: 10 brands, 10 triathletes, 10 teams,
      10 influencers.
- [ ] Check each one uploads at least once a month. Drop any that don't — this
      rule is what keeps the baselines usable.
- [ ] Find each channel's `channel_id` (starts with UC). It's not in the URL for
      channels with custom handles — use the API call from Session 1 with
      `forHandle=`, or view the channel page source and search for `channelId`.
- [ ] Build a spreadsheet with columns: `channel_id`, `name`, `category`.
- [ ] Use exactly these category values: `brands`, `triathletes`, `teams`,
      `influencers`. Anything else is now rejected by a CHECK constraint, so a
      typo fails the import rather than passing silently.
- [ ] Export as CSV and import into `channels` via the Supabase table editor.
      Leave `added_at` out of the CSV — it fills itself in.
- [ ] Verify: 40 rows, 10 per category, no blank `channel_id`.

Watch for: a channel ID you can't find usually means the channel was renamed or
the handle is wrong. Don't guess — a wrong ID fails silently later by simply
returning no videos.

**Done when:** `channels` holds 40 verified rows.

**Commit:** the CSV, if you keep it in the repo. Nothing else changes.

---

## After this stretch

Next up is the collection script. Don't start it until all 40 channels are in
the database — the script reads its channel list from there, so testing against
an empty table proves nothing.

Rough order once you get there:

1. Script that fetches one channel's recent videos and prints them. No writing.
2. Extend it to write to `videos` and `video_snapshots` for that one channel.
   Writes to `video_snapshots` must use
   `ON CONFLICT (video_id, snapshot_date) DO UPDATE` — the composite key
   prevents duplicates but makes a plain re-insert *fail*, which would leave a
   half-finished run impossible to retry.
3. Loop over all 40. Run manually. Collection has now started.
4. Move to GitHub Actions on a weekly schedule.
5. Add the keep-alive workflow — a second Actions job every 2–3 days doing one
   trivial read. Must be in place before or alongside the first scheduled run:
   Supabase pauses free projects after 7 days of inactivity, and the weekly job
   alone sits exactly on that boundary.
6. Add the Healthchecks.io ping and the `job_runs` writes.

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