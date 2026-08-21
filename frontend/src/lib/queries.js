import { supabase } from './supabase'

// Rows per page, and the size of each .range() window below — exported so
// CategoryPage can compute a row's rank from its page offset without
// repeating this number.
export const PAGE_SIZE = 20

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
export async function getCategoryVideos({ category, window, metric, comparison, format, page }) {
  const isShort = format === 'shorts'

  // 'relative' ranks by how far a video beat its channel's baseline;
  // 'absolute' ranks by the raw figure itself.
  const orderColumn = comparison === 'relative' ? 'outlier_score' : 'value'

  const pageNumber = Number(page) || 1
  const from = (pageNumber - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data, error } = await supabase
    .from('scoring_view')
    .select(SELECT_COLUMNS)
    .eq('category', category)
    .eq('window', window)
    .eq('metric', metric)
    .eq('is_short', isShort)
    // Postgres sorts NULLS FIRST on a DESC sort by default. Without
    // nullsFirst: false, a video with no valid baseline (outlier_score is
    // NULL) would rank #1 with no score to show it for. Hard requirement
    // from CLAUDE.md, so this is never left to the default.
    .order(orderColumn, { ascending: false, nullsFirst: false })
    .range(from, to)

  // Never thrown, never swallowed: the caller decides how to show a
  // failed query, and `rows` still defaults to an array so it's always
  // safe to .map over even when `error` is set.
  return { rows: data ?? [], error }
}
