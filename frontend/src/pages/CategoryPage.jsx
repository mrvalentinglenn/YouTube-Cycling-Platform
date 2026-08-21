import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { resolveFilters } from '../lib/filters'
import { getCategoryVideos, PAGE_SIZE } from '../lib/queries'

// Throwaway scaffolding to prove filter state round-trips through the URL.
// Not the real filter bar.
export default function CategoryPage() {
  const { category } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = resolveFilters(searchParams)
  const query = searchParams.toString()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Re-runs whenever category or any individual filter value changes —
  // deliberately not keyed on the `filters` object itself, since
  // resolveFilters() returns a new object on every render regardless of
  // whether anything actually changed.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    getCategoryVideos({
      category,
      window: filters.window,
      metric: filters.metric,
      comparison: filters.comparison,
      format: filters.format,
      page: filters.page,
    }).then((result) => {
      if (cancelled) return
      setRows(result.rows)
      setError(result.error)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, filters.window, filters.metric, filters.comparison, filters.format, filters.page])

  function setParam(key, value) {
    const next = new URLSearchParams(searchParams)
    next.set(key, value)
    setSearchParams(next)
  }

  // The page's first row is rank (page - 1) * PAGE_SIZE + 1, so page 2's
  // first row is #21, not #1.
  const pageNumber = Number(filters.page) || 1
  const rankOffset = (pageNumber - 1) * PAGE_SIZE

  return (
    <div>
      <h1>{category}</h1>
      <ul>
        <li>window: {filters.window}</li>
        <li>metric: {filters.metric}</li>
        <li>comparison: {filters.comparison}</li>
        <li>format: {filters.format}</li>
        <li>page: {filters.page}</li>
      </ul>
      <Link to={`/${query ? `?${query}` : ''}`}>Back to home</Link>
      <div>
        <button
          type="button"
          onClick={() => setParam('window', filters.window === '7d' ? '90d' : '7d')}
        >
          Toggle window
        </button>
        <button
          type="button"
          onClick={() =>
            setParam(
              'comparison',
              filters.comparison === 'absolute' ? 'relative' : 'absolute',
            )
          }
        >
          Toggle comparison
        </button>
        <button
          type="button"
          onClick={() =>
            setParam('format', filters.format === 'longform' ? 'shorts' : 'longform')
          }
        >
          Toggle format
        </button>
        <button
          type="button"
          onClick={() => setParam('page', String(Number(filters.page) + 1))}
        >
          Next page
        </button>
      </div>

      {loading && <p>Loading…</p>}

      {!loading && error && <p>Error: {error.message}</p>}

      {!loading && !error && rows.length === 0 && <p>No videos found.</p>}

      {!loading && !error && rows.length > 0 && (
        <ul>
          {rows.map((row, index) => (
            <li key={row.video_id}>
              #{rankOffset + index + 1} — {row.title} — {row.channel_name} —
              views: {row.views} — likes: {row.likes} — comments: {row.comments} —
              outlier_score: {row.outlier_score ?? 'n/a'}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
