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
export async function getCategoryVideos({
  category,
  window,
  metric,
  comparison,
  format,
  page,
  exclude = [],
}) {
  const isShort = format === 'shorts'

  // 'relative' ranks by how far a video beat its channel's baseline;
  // 'absolute' ranks by the raw figure itself.
  const orderColumn = comparison === 'relative' ? 'outlier_score' : 'value'

  // getPageSize() is the one place this number is decided — see
  // filters.js. Using anything else here would let this diverge from the
  // rank offset CategoryPage computes with the same helper.
  const pageSize = getPageSize(format)
  const pageNumber = Number(page) || 1
  const from = (pageNumber - 1) * pageSize
  const to = from + pageSize - 1

  // { count: 'exact' } asks PostgREST for the total number of matching
  // rows (ignoring .range()) alongside the page of data itself, via the
  // response's Content-Range header — that's what lets the caller know
  // when it has reached the last page.
  let queryBuilder = supabase
    .from('scoring_view')
    .select(SELECT_COLUMNS, { count: 'exact' })
    .eq('category', category)
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
  // safe to .map over even when `error` is set.
  return { rows: data ?? [], error, totalCount: count ?? 0 }
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
