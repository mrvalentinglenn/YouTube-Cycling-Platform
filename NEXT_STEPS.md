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

**Two things to check on tomorrow, 24 August — the first run to exercise both:**

- [ ] `mode = 'weekly'` and ~400 rows rather than ~134. That is the
      date-derived window working; it has never fired on a real Monday.
- [ ] The refresh call landed. `refresh_scoring_view()` is new and has never
      run inside a scheduled job. A failure marks the run failed and
      suppresses the Healthchecks ping, so silence is the signal — but check
      `job_runs` for the run's status either way.

---

## The scoring view — 90-day arm done, materialised

`sql/scoring_view.sql` holds two objects: `scoring_view_live` (the query, tall
shape, `security_invoker = true`, no ORDER BY) and `scoring_view` (the
materialised copy the front end reads, with three indexes). Refreshed by
`collect.py` after its failure checks pass.

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

Scaffold, data layer, filter bar, video card and category grid are built and
verified in the browser. Tailwind v4 is installed. What remains:


1. [ ] Verify the Provisional label appears where it should. Matt Hauser has
       no Shorts, so his Shorts rows should come back with a null score and
       `is_provisional = true`. Easiest route: filter `scoring_view` on
       `is_provisional = true` in the Supabase table editor, then find those
       videos in the front end.
2. [ ] Revert the `window` default from `90d` to `7d` once the 7-day arm is
       live. One line in `frontend/src/lib/filters.js`.
3. [ ] Replace Vite's default `frontend/README.md` with something
       project-specific.
4. [ ] Choose a static host and deploy. Whichever it is, configure route
       rewriting to `index.html` or a direct link to `/category/teams`
       returns 404.
5. [ ] Measure whether `count: 'exact'` is now fast enough on four categories
        to keep "Page X of Y". It was never re-measured after materialising —
        we went straight past the question. If it is slow, the fallback is a
        `pageSize + 1` has-more check and a "Page 3" / Next-disabled UI. See
        DECISIONS Rejected.
6. [ ] Drop `scoring_view_live`'s dead weight if the 7-day arm changes its
        shape — no action now, just a reminder that the arm gets added inside
        `scoring_view_live`, not inside the materialised view, and the next
        refresh picks it up.       

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
      - [ ] Filter bar icons from `preview.png`. The most droppable item on this
      list — four small icons above labels that already say what they are. Cut
      this before cutting anything else.
- [ ] The name "BikeTube" incorporates "Tube", which YouTube's brand guidelines
      ask third parties not to do. Irrelevant locally, relevant at a public
      URL. Fold into the same pre-publication review as the API Terms item.

---

## Rules for this file

- Delete items when done. Don't tick and keep.
- If a task turns out to be bigger than expected, split it rather than letting
  it sit half-finished.
- Decisions made along the way go in DECISIONS.md, not here.