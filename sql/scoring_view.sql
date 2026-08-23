-- Scoring view for the YouTube Trends Platform.
-- See CLAUDE.md "Scoring — LOCKED" for the spec this implements.
--
-- TWO OBJECTS NOW, NOT ONE.
--
--   scoring_view_live  — the query itself. Unchanged logic from the
--                         original live view: same CTEs, same LATERAL
--                         baseline computation, same security_invoker = true,
--                         same absence of ORDER BY. Only its name changed.
--                         No grants — nothing queries this directly.
--
--   scoring_view       — a materialised view, `select * from
--                         scoring_view_live`, holding the stored result.
--                         This is what the front end and anon actually read,
--                         and what carries the indexes.
--
-- Why: DECISIONS.md 2026-08-19 chose a live view specifically because a
-- materialised one can fail silently — a broken REFRESH serves stale scores
-- with no error. That risk is why this stayed live for as long as it did.
-- Measured against the real anon statement_timeout (3s, confirmed via
-- pg_roles — the SQL editor's own session runs as a role with an 8s budget,
-- which is why nothing looked wrong when the query was tested by hand), four
-- categories merged on the long-form arm takes 3.0-3.4s and is cancelled
-- outright, even fetching rows alone with no count. The view was already
-- optimised 730x on 2026-08-21; there is no further win inside the query
-- itself, and a live view cannot be indexed on its own output. Materialising
-- is the remaining lever.
--
-- The silent-staleness risk this was originally rejected for is closed a
-- different way now: collect.py calls refresh_scoring_view() only after its
-- three failure checks pass, and a failed refresh is itself written to
-- job_runs as status = 'failed' with an error_message naming the refresh,
-- which suppresses the Healthchecks ping. A broken refresh is exactly as
-- loud as a broken collection run, because it goes through the same
-- mechanism.
--
-- Keeping the old name on the materialised view rather than the live one is
-- deliberate: nothing in frontend/ changes — no query string, no column
-- name, no contract. The scoring logic still lives in exactly one place,
-- scoring_view_live; the materialised view is a stored copy of it, not a
-- second implementation that could drift from it.
--
-- SHAPE. Tall: one row per video, per window, per metric. Only the 90-day
-- window exists yet, so today every video produces 3 rows (views, likes,
-- comments). The view is written as ONE parenthesised block per window,
-- unioned together, specifically so the 7-day window can be added later by
-- appending a second block with `union all` rather than restructuring this
-- one. See the comment marking where that block goes.
--
-- "window" is a reserved SQL keyword (it's also the name of a real SQL
-- feature, window functions), so every use of it as a column name below —
-- including in the index definitions further down — is double-quoted:
-- "window". Forgetting a quote there is a syntax error, not a silent bug, so
-- Postgres will catch it immediately if one is missed.
--
-- BASELINE PERFORMANCE. The first version of this view computed each
-- video's baseline with a LATERAL subquery that re-scanned the entire
-- unpivoted `metrics` CTE (~11,900 rows) and re-sorted it, once per output
-- row — 11,838 full scans for a single SELECT * from the view, which never
-- finished. The fix below computes every channel/format/metric baseline
-- pool exactly once, up front, as two small parallel arrays, and each
-- output row's LATERAL join then does nothing more than unnest those two
-- arrays (at most 16 elements) and exclude itself. Same numbers out; the
-- work moved from "per row" to "per group". This is the 730x fix
-- referenced above — it is why a single-category query is fast at all, and
-- also why there was nothing further to win by optimising the query again
-- rather than storing its result.
--
-- CREATE OR REPLACE VIEW cannot change a view's column list or column
-- types. This rewrite keeps both identical, but DROP + CREATE is used
-- anyway so a future change that does alter them doesn't fail confusingly
-- on a stale view definition.
drop view if exists scoring_view_live;

create or replace view scoring_view_live
with (security_invoker = true) as

-- ================================================================
-- 90-day window arm
-- ================================================================
(
  with numerator as (
    -- The figure this window scores each video on. Real 90-day snapshots
    -- don't exist yet, so CLAUDE.md's proxy is used instead: the most
    -- recent video_snapshots row for the video, i.e. its lifetime totals
    -- so far. DISTINCT ON (video_id) with ORDER BY snapshot_date DESC
    -- keeps exactly one row per video_id — the latest one.
    --
    -- Every row in `videos` has at least one matching video_snapshots row
    -- by construction (collect.py writes both in the same batch, for the
    -- same videos, in the same run), so an inner join to this CTE later
    -- is safe rather than dropping videos silently.
    select distinct on (video_id)
      video_id,
      views,
      likes,
      comments,
      title,
      thumbnail_url
    from video_snapshots
    order by video_id, snapshot_date desc
  ),

  metrics as (
    -- Unpivot: turn the three metric columns on one numerator row into
    -- three rows, one per metric, each carrying its own value. This is
    -- what makes a video "produce 3 rows" downstream. likes/comments are
    -- nullable (a creator can disable either), so COALESCE(x, 0) here per
    -- CLAUDE.md — views is NOT NULL already and needs no coalesce.
    -- Cast to numeric so outlier_score below is a real division, not
    -- integer division.
    --
    -- channel_id, is_short and published_at are carried along here too
    -- (joined from `videos`) even though the main SELECT below already
    -- has them from `v` — this copy is what the pooling CTEs beneath use
    -- to group and rank, without re-joining back to `videos` per row.
    select
      mv.video_id,
      mv.channel_id,
      mv.is_short,
      mv.published_at,
      'views' as metric,
      n.views::numeric as value
    from numerator n
    join videos mv on mv.video_id = n.video_id
    union all
    select
      mv.video_id,
      mv.channel_id,
      mv.is_short,
      mv.published_at,
      'likes' as metric,
      coalesce(n.likes, 0)::numeric as value
    from numerator n
    join videos mv on mv.video_id = n.video_id
    union all
    select
      mv.video_id,
      mv.channel_id,
      mv.is_short,
      mv.published_at,
      'comments' as metric,
      coalesce(n.comments, 0)::numeric as value
    from numerator n
    join videos mv on mv.video_id = n.video_id
  ),

  ranked as (
    -- Every video eligible to appear in ANY baseline pool — published
    -- between 30 days and 24 months ago — numbered from most recent (1)
    -- to oldest, separately within each channel + format + metric group.
    -- This is computed once for the whole table, not once per scored
    -- video.
    select
      video_id,
      channel_id,
      is_short,
      published_at,
      metric,
      value,
      row_number() over (
        partition by channel_id, is_short, metric
        order by published_at desc
      ) as rn
    from metrics
    where published_at <= now() - interval '30 days'
      and published_at >= now() - interval '24 months'
  ),

  pools as (
    -- Sixteen, not fifteen — this is the crux of why self-exclusion is
    -- still correct after precomputing. The spec is "the channel's last
    -- 15 videos, excluding the video being scored". A single video can
    -- occupy at most one rank in its own channel/format/metric group, so
    -- excluding it can displace the ranking by at most one place. Taking
    -- the top 16 instead of 15 guarantees the correct 15-video pool for
    -- EVERY video that could be scored against this group, without
    -- knowing in advance which video that will be:
    --   - If the scored video sits at rank 7, ranks 1-16 minus rank 7
    --     leaves 15 videos — exactly the 15 most recent excluding it.
    --   - If the scored video sits at rank 16 or is not in this group at
    --     all (too new, too old, or a different channel/format), it was
    --     never going to be removed, so the first 15 of the 16 are simply
    --     the correct answer.
    -- 15 would not have this property: a video at rank 7 would leave only
    -- 14 after removing itself, one short.
    --
    -- The 16 candidates are collapsed into a single row per group here,
    -- as two arrays built in the same order (most recent first) so that
    -- position N in pool_video_ids and position N in pool_values always
    -- describe the same video. That pairing is what lets the per-video
    -- LATERAL join below unnest both arrays together instead of joining
    -- back to a table.
    select
      channel_id,
      is_short,
      metric,
      array_agg(video_id order by published_at desc) as pool_video_ids,
      array_agg(value order by published_at desc) as pool_values
    from ranked
    where rn <= 16
    group by channel_id, is_short, metric
  )

  select
    v.video_id,
    v.channel_id,
    c.name as channel_name,
    c.avatar_url,
    c.category,
    n.title,
    n.thumbnail_url,
    v.duration_seconds,
    v.is_short,
    v.published_at,
    n.views,
    n.likes,
    n.comments,
    '90d' as "window",
    m.metric,
    m.value,
    b.baseline_median,
    -- NULL, never 0 and never an error, when there's no valid baseline —
    -- a channel this thin should read as "no data", not as "zero outlier".
    case
      when b.baseline_median is null or b.baseline_median = 0 then null
      else m.value / b.baseline_median
    end as outlier_score,
    -- count(*) from an aggregate with no GROUP BY always returns a row
    -- (0 if the pool was empty, never NULL), so no COALESCE is needed here.
    b.baseline_video_count < 10 as is_provisional,
    b.baseline_video_count
  from videos v
  join channels c on c.channel_id = v.channel_id
  join numerator n on n.video_id = v.video_id
  join metrics m on m.video_id = v.video_id
  -- One lookup per video into the precomputed pool for its own
  -- channel + format + metric — not a scan, a keyed join against the (at
  -- most 40 channels x 2 formats x 3 metrics =) 240 rows `pools` holds.
  left join pools p
    on p.channel_id = v.channel_id
    and p.is_short = v.is_short
    and p.metric = m.metric
  -- LATERAL: a subquery that can reference columns from the row it's
  -- joining against (v.video_id here) — an ordinary join can't do that.
  -- This runs once per output row, same as before, but now each execution
  -- only unnests two arrays of up to 16 elements already sitting in `p`
  -- rather than re-scanning and re-sorting the whole metrics table.
  left join lateral (
    select
      -- percentile_cont(0.5) WITHIN GROUP is Postgres's median: the value
      -- at the 50th percentile of the ordered set, interpolated if needed.
      -- Median rather than mean per CLAUDE.md, so one viral video can't
      -- permanently distort a channel's baseline.
      percentile_cont(0.5) within group (order by pool15.pool_value) as baseline_median,
      count(*) as baseline_video_count
    from (
      -- unnest() given two arrays walks them in parallel, position by
      -- position, rather than one after another — so pool_video_id and
      -- pool_value on each output row still describe the same video.
      -- WITH ORDINALITY numbers those positions 1, 2, 3... in the order
      -- the arrays were built, i.e. most-recent-first, which is what lets
      -- "order by ord, limit 15" mean "the 15 most recent" without
      -- touching published_at again.
      --
      -- Excluding the scored video here, AFTER unnesting but BEFORE the
      -- limit, is what turns the 16-candidate pool into the correct
      -- 15-video baseline for this specific video — see the `pools` CTE
      -- above for why 16 is exactly enough.
      select pv.pool_value
      from unnest(p.pool_video_ids, p.pool_values)
        with ordinality as pv(pool_video_id, pool_value, ord)
      where pv.pool_video_id <> v.video_id
      order by pv.ord
      limit 15
    ) pool15
  ) b on true
);

-- ================================================================
-- 7-day window arm — not built yet. When the 7-day snapshot exists to
-- read from, add it here as:
--
--   union all
--
--   (
--     with numerator as (...), metrics as (...), ranked as (...),
--          pools as (...)
--     select ... '7d' as "window", ...
--     from videos v ...
--   )
--
-- same column shape, same precomputed-pool pattern. Once added, refresh
-- the materialised view (below) picks up the new arm automatically on its
-- next run — nothing about materialising this changes how that addition
-- works.
-- ================================================================

-- ================================================================
-- No ORDER BY on the view deliberately.
--
-- An ORDER BY inside a view definition is not binding on anything that
-- queries it. The front end must sort for itself — absolute rankings
-- order by `value`, relative rankings by `outlier_score` — and the moment
-- it does, the view's own ordering is discarded. Sorting ~12,000 rows on
-- every read only to have them re-sorted is wasted work, and worse, a
-- guardrail that looks like it protects the consumer but does not.
--
-- The guardrail therefore lives in the consuming query instead, and is
-- part of the front-end contract: Postgres sorts NULLS FIRST on a DESC
-- sort, so any relative ranking MUST specify nulls-last explicitly, or
-- every video with no valid baseline ranks #1 on a card with no score
-- printed on it. In supabase-js:
--
--   .order('outlier_score', { ascending: false, nullsFirst: false })
--
-- The two indexes on the materialised view further down bake nulls-last
-- in at the index level, so this remains true for `scoring_view` as read
-- by the front end even though the ORDER BY itself lives only in the
-- query, never in either view.
-- ================================================================

-- ================================================================
-- scoring_view_live carries no grants. Nothing queries it directly —
-- anon reads the materialised view below, and the only other reader is
-- refresh_scoring_view(), which runs as this view's owner (postgres) via
-- SECURITY DEFINER, not as a role that needs its own grant.
--
-- This REVOKE is not a grant — it's the same explicit "make sure nothing
-- is open" statement schema.sql uses for videos_readable, since "automatic
-- expose" only covers tables created through the UI, not views created by
-- hand.
-- ================================================================
revoke all on scoring_view_live from anon, authenticated;

-- ================================================================
-- scoring_view — the materialised view. `select * from scoring_view_live`
-- is the entire definition: the scoring logic lives in exactly one place,
-- above, and this is a stored copy of its output, not a second
-- implementation that could drift from it.
--
-- Populated immediately on creation (CREATE MATERIALIZED VIEW ... AS
-- SELECT defaults to WITH DATA), so there is no empty-table window between
-- running this and the site having something to show — no manual first
-- refresh is required for that reason. The separate "run this once after
-- creating" block at the end of this file exists anyway, to bring the
-- data up to the current moment rather than whatever it was when this
-- script ran.
-- ================================================================
drop materialized view if exists scoring_view;

create materialized view scoring_view as
select * from scoring_view_live;

-- ================================================================
-- Indexes. This is where the actual speed comes from, and the thing a
-- live view structurally cannot have — a view has no storage of its own
-- to index.
--
-- All three lead with the columns the front end always filters on with
-- .eq(): is_short and metric (window too, once a second arm exists — it's
-- included now for forward compatibility even though every row currently
-- shares the one value '90d'). category is deliberately NOT an index
-- column: with only four possible values it barely narrows anything, and
-- leaving it out lets Postgres apply .in('category', [...]) as a filter
-- while walking an index that is already in the right sort order — for a
-- merged multi-category selection that's still a single ordered scan, not
-- a scan followed by a separate sort.
-- ================================================================

-- Enforces the shape the view is built to guarantee: one row per video,
-- per window, per metric. numerator holds exactly one row per video_id
-- (DISTINCT ON), metrics unpivots each into exactly 3 rows (one per
-- literal metric value), and every join after that is 1:1 or a
-- single-row aggregate — nothing in the query can fan a (video_id,
-- window, metric) tuple out to more than one row. This is also the
-- prerequisite for REFRESH ... CONCURRENTLY below: Postgres requires a
-- unique index on a materialised view before it will refresh one without
-- locking readers out for the duration.
create unique index scoring_view_video_window_metric_idx
  on scoring_view (video_id, "window", metric);

-- Absolute comparison: order by value desc, nulls last. Postgres stores
-- DESC indexes NULLS FIRST by default, so nulls last must be written into
-- the index definition itself to match what the front end actually asks
-- for (.order('value', { ascending: false, nullsFirst: false })) — without
-- it, this index still helps but Postgres falls back to a sort step on
-- top of it rather than reading the rows out in final order directly.
create index scoring_view_value_idx
  on scoring_view (is_short, "window", metric, value desc nulls last);

-- Relative comparison: same shape, ordered by outlier_score instead.
-- nulls last here is load-bearing in the way CLAUDE.md's front-end
-- contract describes, not just a performance nicety: outlier_score is
-- NULL for any video without a valid baseline, and without nulls-last
-- ordering (in the query, mirrored here in the index) those videos would
-- sort to #1 with no score to show for it.
create index scoring_view_outlier_score_idx
  on scoring_view (is_short, "window", metric, outlier_score desc nulls last);

-- ================================================================
-- Access control on the materialised view — a genuine exception to the
-- two-layer model used everywhere else in this project, stated plainly
-- rather than smoothed over:
--
--   RLS does not apply to materialised views at all. There is no policy
--   layer here, only the grant below.
--
--   A materialised view cannot be security_invoker — that option does not
--   exist for this object type. It always reads the tables it's built
--   from as its OWNER (postgres) at refresh time, regardless of who
--   queries the stored result afterwards.
--
-- In practice this exposes nothing new: anon already holds SELECT
-- directly on channels, videos and video_snapshots — all public YouTube
-- data collected from a public API — so postgres reading them to build
-- this view is not reaching anon any data anon couldn't already reach
-- directly. But it is a real deviation from "the querying role's own
-- permissions decide what it sees", and if that ever stops being true —
-- if a table this view reads ever holds something anon shouldn't see
-- directly — this exception needs re-examining, not just this comment.
-- ================================================================
grant select on scoring_view to anon;

-- ================================================================
-- refresh_scoring_view() — called from collect.py after its three
-- failure checks pass, never before. supabase-py cannot execute arbitrary
-- SQL, so this function is the interface: the Python client calls it by
-- name via .rpc(), and the REFRESH itself runs inside Postgres.
--
-- SECURITY DEFINER is necessary, not optional, for the same reason it's
-- necessary on videos_readable's underlying tables reasoning does not
-- apply here — this is the reverse case. Refreshing a materialised view
-- requires ownership of it. service_role does not own scoring_view;
-- postgres does, as the role that runs this script. Without SECURITY
-- DEFINER, service_role calling this function would attempt the REFRESH
-- as itself and fail with a permissions error. The function instead runs
-- with postgres's privileges, but only service_role can ever reach it —
-- EXECUTE is revoked from PUBLIC and granted to service_role alone, so
-- the elevated privilege this function carries is reachable by exactly
-- one role, never by anon. `set search_path = public` is standard
-- hardening for SECURITY DEFINER functions, so it cannot be tricked by a
-- caller with a different search_path into resolving `scoring_view`
-- against a different schema.
--
-- CONCURRENTLY so a refresh never blocks a visitor's read mid-request —
-- readers keep seeing the previous snapshot until the new one is ready,
-- then the swap is atomic. This is what the unique index above exists to
-- allow; REFRESH CONCURRENTLY is a Postgres error without one.
-- ================================================================
create or replace function refresh_scoring_view()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently scoring_view;
end;
$$;

revoke all on function refresh_scoring_view() from public;
grant execute on function refresh_scoring_view() to service_role;
