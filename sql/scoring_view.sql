-- Scoring view for the YouTube Trends Platform.
-- See CLAUDE.md "Scoring — LOCKED" for the spec this implements, and
-- DECISIONS.md ("Scoring runs in a live view, not a materialised one" and
-- "videos_readable view, and views default to security definer") for why
-- this is a live view with security_invoker = true rather than a
-- materialised one owned by postgres.
--
-- SHAPE. Tall: one row per video, per window, per metric. Only the 90-day
-- window exists yet, so today every video produces 3 rows (views, likes,
-- comments). The view is written as ONE parenthesised block per window,
-- unioned together, specifically so the 7-day window can be added later by
-- appending a second block with `union all` rather than restructuring this
-- one. See the comment marking where that block goes.
--
-- "window" is a reserved SQL keyword (it's also the name of a real SQL
-- feature, window functions), so every use of it as a column name below is
-- double-quoted: "window". Forgetting a quote there is a syntax error, not
-- a silent bug, so Postgres will catch it immediately if one is missed.
--
-- BASELINE PERFORMANCE. The first version of this view computed each
-- video's baseline with a LATERAL subquery that re-scanned the entire
-- unpivoted `metrics` CTE (~11,900 rows) and re-sorted it, once per output
-- row — 11,838 full scans for a single SELECT * from the view, which never
-- finished. The fix below computes every channel/format/metric baseline
-- pool exactly once, up front, as two small parallel arrays, and each
-- output row's LATERAL join then does nothing more than unnest those two
-- arrays (at most 16 elements) and exclude itself. Same numbers out; the
-- work moved from "per row" to "per group".
--
-- CREATE OR REPLACE VIEW cannot change a view's column list or column
-- types. This rewrite keeps both identical, but DROP + CREATE is used
-- anyway so a future change that does alter them doesn't fail confusingly
-- on a stale view definition.
drop view if exists scoring_view;

create or replace view scoring_view
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
-- same column shape, same precomputed-pool pattern.
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
-- ================================================================

-- ================================================================
-- Access control — deliberately nothing granted yet.
--
-- Same two-layer model as schema.sql: RLS on the underlying tables already
-- seals this view for any role without an explicit grant, and
-- security_invoker = true (set above) makes sure the view checks the
-- QUERYING role's permissions rather than its owner's — without it, a view
-- created through the Supabase SQL editor runs as `postgres` and would
-- read straight through RLS regardless of who queries it.
--
-- This REVOKE is not a grant — it's the same explicit "make sure nothing
-- is open" statement schema.sql uses for videos_readable, since "automatic
-- expose" only covers tables created through the UI, not views created by
-- hand. SELECT for `anon` is a deliberate later step, added only when the
-- front end needs it.
-- ================================================================
revoke all on scoring_view from anon, authenticated;
