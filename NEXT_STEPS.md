Next steps

Working checklist. Delete items once done — this file only shrinks. Reasoning lives in DECISIONS.md, not here.

Goal of this stretch: get everything in place so the collection script has something to read from and somewhere to write to. No script yet.

Session 1 - get API Key done

Session 2 — Supabase setup (~1.5–2.5 hrs)

First time with Supabase, so budget for reading as much as doing.

 Create a Supabase account and a new project. Choose a region in Europe.
 Save the database password somewhere safe when it's shown. It is not shown again.
 Find the project's API URL and the service_role key in project settings.
 Add both to .env: SUPABASE_URL=... and SUPABASE_SERVICE_KEY=...
 Re-run git status and confirm .env still doesn't appear.
 Create the four tables using the SQL editor in Supabase. Prompt for Claude Code below.
 Manually insert 2–3 test rows into channels to confirm it works.
 Delete the test rows.

Prompt for Claude Code

Read the Data model section of CLAUDE.md. Write a single SQL script that creates
the four tables exactly as specified there: channels, videos, video_snapshots
and job_runs. Include primary keys, the foreign key relationships, and the
composite primary key on video_snapshots. Note that job_runs is an operational
log and deliberately has no foreign keys to the other three. Use Postgres types
appropriate for Supabase. Add an index on video_snapshots.snapshot_date since
we'll filter on it every week. Explain what each part of the script does before I
run it — I've never written SQL before. Save it as sql/schema.sql in the repo.

Done when: all four tables show up in the Supabase table editor with the right
columns, and you were able to add and remove a test row.

Commit: git add sql/schema.sql && git commit -m "Add database schema" && git push

Session 3 — Compile the 40 channels (~2–3 hrs)

Tedious but unavoidable, and the one task that can't be delegated. Do it in a spreadsheet, then import.

 Decide the actual 40 channels: 10 brands, 10 triathletes, 10 teams, 10 influencers.
 Check each one uploads at least once a month. Drop any that don't — this rule is what keeps the baselines usable.
 Find each channel's channel_id (starts with UC). It's not in the URL for channels with custom handles — use the API call from Session 1 with forHandle=, or view the channel page source and search for channelId.
 Build a spreadsheet with columns: channel_id, name, category.
 Export as CSV and import into the channels table via the Supabase table editor.
 Verify: 40 rows, 10 per category, no blank channel_id.

Watch for: a channel ID you can't find usually means the channel was renamed or the handle is wrong. Don't guess — a wrong ID fails silently later by simply returning no videos.

Done when: channels holds 40 verified rows.

After this stretch

Next up is the collection script itself. Don't start it until all 40 channels are in the database — the script reads its channel list from there, so testing against an empty table proves nothing.

Rough order once you get there:

Script that fetches one channel's recent videos and prints them. No writing.
Extend it to write to videos and video_snapshots for that one channel.
Loop over all 40. Run manually. Collection has now started.
Move to GitHub Actions on a weekly schedule.
Add the Healthchecks.io ping and the job_runs table.
Rules for this file
Delete items when done. Don't tick and keep.
If a task turns out to be bigger than expected, split it rather than letting it sit half-finished.
Decisions made along the way go in DECISIONS.md, not here.