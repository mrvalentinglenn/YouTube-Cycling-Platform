# Next steps

Working checklist. Delete items once done — this file only shrinks. Reasoning
lives in DECISIONS.md, not here.

Goal of this stretch: get everything in place so the collection script has
something to read from and somewhere to write to. No script yet.

---



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

## Modify and get clarity on V1 and V2
- We have now defined that in v1 we will show life-time results (life-time views, clicks etc)
- after 2-3 months, we will build v2 with 7-day results
- however, I would like to include this already in V1 with the warning
- Important TO DO: Understand thoroughly how data selection is defined in Claude.md and modify accoridingly