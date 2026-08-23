import { supabase } from './supabase'
import { getPageSize } from './filters'

// scoring_view is tall (one row per video, per window, per metric), so
// every one of these columns is named explicitly rather than `select('*')`
// — this is the exact contract CLAUDE.md describes the front end reading.
const SELECT_COLUMNS = [
  'video_id',
  'channel_id',
  'channel_name',
  'avatar_url',
  'category',
  'title',
  'thumbnail_url',
  'duration_seconds',
  'is_short',
  'published_at',
  'views',
  'likes',
  'comments',
  'window',
  'metric',
  'value',
  'baseline_median',
  'outlier_score',
  'is_provisional',
  'baseline_video_count',
].join(', ')

// The one query the front end makes so far. `format` is not a column on
// scoring_view — it maps to is_short (longform = false, shorts = true) —
// so the mapping happens here rather than being pushed onto callers.
// `categories` is an array — the category page shows one merged ranking
// across every selected category, not one section per category, so this is
// .in(), not .eq().
export async function getCategoryVideos({
  categories,
  window,
  metric,
  comparison,
  format,
  page,
  exclude = [],
  pageSize: pageSizeOverride,
}) {
  const isShort = format === 'shorts'

  // 'relative' ranks by how far a video beat its channel's baseline;
  // 'absolute' ranks by the raw figure itself.
  const orderColumn = comparison === 'relative' ? 'outlier_score' : 'value'

  // getPageSize() in filters.js stays the one place the format-dependent
  // number is decided, and CategoryPage's calls (which never pass
  // pageSize) get exactly that number, unchanged. pageSizeOverride exists
  // for callers with a fixed, format-independent need — currently only the
  // homepage, which always wants exactly 3 regardless of format.
  const requestCount = pageSizeOverride === undefined
  const pageSize = pageSizeOverride ?? getPageSize(format)
  const pageNumber = Number(page) || 1
  const from = (pageNumber - 1) * pageSize
  const to = from + pageSize - 1

  // { count: 'exact' } asks PostgREST for the total number of matching
  // rows (ignoring .range()) alongside the page of data itself, via the
  // response's Content-Range header — that's what lets the caller know
  // when it has reached the last page. This is one query object, built up
  // and executed once below: the count comes from the exact same filtered
  // request as the rows, so .in('category', ...) only needs to be applied
  // here once for both to stay in agreement. A separate count query would
  // risk drifting from the row filters with no error to show for it — the
  // same failure shape as page size disagreeing between .range() and the
  // rank offset.
  //
  // Skipped entirely when a pageSize override is supplied: that's the
  // homepage, which shows a fixed top 3 plus an unconditional Show More
  // link and never reads the total. Four sections each paying for a full
  // exact count of the view, for a number nothing displays, is wasted work
  // on every homepage load.
  let queryBuilder = supabase
    .from('scoring_view')
    .select(SELECT_COLUMNS, requestCount ? { count: 'exact' } : {})
    .in('category', categories)
    .eq('window', window)
    .eq('metric', metric)
    .eq('is_short', isShort)

  // Which channels are relevant to the person looking, not how their
  // performance is measured — this only changes which rows are returned.
  // It can't touch outlier_score: baselines are computed per channel
  // inside scoring_view itself, over that channel's own history, so
  // excluding a different channel here has no effect on it. Skipped
  // entirely when nothing is excluded, per CLAUDE.md.
  if (exclude.length > 0) {
    queryBuilder = queryBuilder.not('channel_id', 'in', `(${exclude.join(',')})`)
  }

  const { data, error, count } = await queryBuilder
    // Postgres sorts NULLS FIRST on a DESC sort by default. Without
    // nullsFirst: false, a video with no valid baseline (outlier_score is
    // NULL) would rank #1 with no score to show it for. Hard requirement
    // from CLAUDE.md, so this is never left to the default.
    .order(orderColumn, { ascending: false, nullsFirst: false })
    .range(from, to)

  // Never thrown, never swallowed: the caller decides how to show a
  // failed query, and `rows` still defaults to an array so it's always
  // safe to .map over even when `error` is set. totalCount is null, not 0,
  // when no count was requested — 0 would claim "we know the total and it's
  // zero", which is false; null says "not asked for" and matches
  // CategoryPage's existing behaviour exactly when it is asked for.
  return { rows: data ?? [], error, totalCount: requestCount ? (count ?? 0) : null }
}

// The full channel list — channel_id, name, category. 40 rows that change
// almost never, so this is meant to be called once at the top level
// (App.jsx) and passed down, not re-fetched by every section that needs
// it. Same never-throw / never-swallow contract as getCategoryVideos.
export async function getChannels() {
  const { data, error } = await supabase
    .from('channels')
    .select('channel_id, name, category')
    .order('name', { ascending: true })

  return { channels: data ?? [], error }
}
