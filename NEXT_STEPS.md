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

**One thing to check on, without doing anything:**

- [ ] Monday's run should record `mode = 'weekly'` and write ~400 rows rather
      than ~134. That is the date-derived window working; it has never been
      exercised on a real Monday. Next Monday is 24 August.

---

## The scoring view — 90-day arm done

`sql/scoring_view.sql` is built and running. Tall shape: one row per video,
per window, per metric. `security_invoker = true`, nothing granted to `anon`
yet, no ORDER BY on the view.

Verified: 357 ms for a full `SELECT *` after the baseline was rewritten to
precompute pools (the first version timed out). Score distribution on
long-form views — p25 0.56, p50 1.04, p75 1.92, p95 7.21, 2,350 scored rows.
A median of 1.04 is the baseline calibrating correctly.

**Still to do:**

1. [ ] Add the 7-day arm as a second `union all` block. Not possible until
       day-7 readings exist — collection began 19/20 August, so the first
       videos reach day 7 around 26–27 August. Check for rows before
       building: a video needs a snapshot dated exactly 7 days after its
       `published_at`.
2. [ ] Mirror `scoring_view.sql` into `sql/schema.sql` now the numbers are
       trusted, so the schema file is a complete description of the database.
3. [ ] Spot-check the Provisional label against channels you know: Matt
       Hauser has no Shorts at all, so his Shorts rows should come back with a
       null score and `is_provisional = true`.

---

## The front end

Scaffold and data layer are done and verified in the browser. Two routes,
filter state in the URL, a working query against `scoring_view`. Nothing is
styled.

1. [ ] Install and configure Tailwind CSS v4. Dark base applied once at the
       top level, matching `preview.png`. Config only — nothing restyled.
2. [ ] Build the real filter bar, replacing the four throwaway toggle
       buttons. Four groups, active state visible, present on both routes.
       Every filter change must reset `page` to 1 — page 3 of long-form may
       not exist under Shorts, and the empty grid would look like missing
       data.
3. [ ] Build the video card: thumbnail with duration badge, title, channel
       name, avatar, views/likes/comments, and under Relative the Outlier
       Score as a multiple (`75×`). Provisional badge where
       `is_provisional`. Thumbnail links to YouTube in a new tab. Must
       render without an avatar — `avatar_url` is null until 24 August.
4. [ ] Build the homepage: four category sections in fixed order, top 3
       each, "Show more" linking to the category page with the current
       params attached.
5. [ ] Build the category page grid: 20 per page, rank offset-aware, 16:9
       for long-form and 9:16 for Shorts. Pagination needs both directions
       and a stop at the last page — the throwaway button only goes forward.
6. [ ] Responsive. Check the four category sections collapse sensibly on a
       phone.
7. [ ] Verify the Provisional label appears where it should. Matt Hauser has
       no Shorts, so his Shorts rows should come back with a null score and
       `is_provisional = true`.
8. [ ] Revert the `window` default from `90d` to `7d` once the 7-day arm is
       live. One line in `frontend/src/lib/filters.js`.
9. [ ] Choose a static host and deploy. Whichever it is, configure route
       rewriting to `index.html` or a direct link to `/category/teams`
       returns 404.

---

## Small things, whenever

- [ ] Add a root `.env.example` for the collection job — four variable names,
      no values, committed. Note that `HEALTHCHECKS_URL` is deliberately
      absent from the local `.env`: a manual test run must not be able to
      silence an alarm about the scheduled job failing to run. The front end
      already has its own at `frontend/.env.example`, with
      `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The two stay
      separate — the secret key must never sit in the same file as anything
      the browser reads.
- [ ] Write a README.
- [ ] Review YouTube's API Services Terms on data retention and thumbnail
      display, before anything goes to a public URL.
- [ ] Re-run `scripts/fix_shorts_classification.py` at some point to pick up the
      one video that failed on a connection reset. One row; no hurry.
- [ ] Red Bull Bike returns 6 long-form baseline videos against ~18 visible on
      the channel. Cause is understood and not a bug — see DECISIONS. No action
      unless it is still thin in a month.

---

## Rules for this file

- Delete items when done. Don't tick and keep.
- If a task turns out to be bigger than expected, split it rather than letting
  it sit half-finished.
- Decisions made along the way go in DECISIONS.md, not here.