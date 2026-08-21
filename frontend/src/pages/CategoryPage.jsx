import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import FilterBar from '../components/FilterBar'
import VideoCard from '../components/VideoCard'
import { getPageSize, resolveFilters } from '../lib/filters'
import { getCategoryVideos } from '../lib/queries'

export default function CategoryPage({ channels }) {
  const { category } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = resolveFilters(searchParams)
  const query = searchParams.toString()

  const [rows, setRows] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // filters.exclude is an array — a new reference every render, even when
  // its contents haven't changed — so this joins it to a string first,
  // giving the effect below a primitive it can actually depend on.
  const excludeKey = filters.exclude.join(',')

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
      exclude: filters.exclude,
    }).then((result) => {
      if (cancelled) return
      setRows(result.rows)
      setTotalCount(result.totalCount)
      setError(result.error)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, filters.window, filters.metric, filters.comparison, filters.format, filters.page, excludeKey])

  // getPageSize() is the same helper queries.js used for .range() — using
  // anything else here is exactly the divergence that would silently skip
  // or repeat videos between pages.
  const pageSize = getPageSize(filters.format)
  const pageNumber = Number(filters.page) || 1
  // The page's first row is rank (page - 1) * pageSize + 1, so page 2 of
  // long-form starts at #21, page 2 of Shorts (pageSize 24) at #25.
  const rankOffset = (pageNumber - 1) * pageSize
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  function goToPage(newPage) {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(newPage))
    setSearchParams(next)
    // A page change should land the user at the top of the new page, not
    // wherever they happened to be scrolled to on the old one.
    window.scrollTo(0, 0)
  }

  // Shorts run 9:16, so more of them fit per row than 16:9 long-form —
  // hence the different column counts at every breakpoint, per
  // CLAUDE.md's layout table. Both class strings are complete, literal
  // strings in the source, so Tailwind's scanner picks up whichever one
  // isn't active at build time too.
  const gridColumnsClassName =
    filters.format === 'shorts'
      ? 'grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5'

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <FilterBar channels={channels} />
      <h1>{category}</h1>
      <Link to={`/${query ? `?${query}` : ''}`}>Back to home</Link>

      {loading && <p>Loading…</p>}

      {!loading && error && <p>Error: {error.message}</p>}

      {/* Zero rows is expected right now — the 7-day window has no arm in
          scoring_view yet — and must read as an empty window, not a
          broken page. */}
      {!loading && !error && rows.length === 0 && <p>No videos found.</p>}

      {!loading && !error && rows.length > 0 && (
        <div className={`grid gap-4 ${gridColumnsClassName}`}>
          {rows.map((row, index) => (
            <div key={row.video_id}>
              <p className="mb-1 text-xs text-neutral-500">#{rankOffset + index + 1}</p>
              <VideoCard video={row} comparison={filters.comparison} />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && (
        <div className="mt-6 flex items-center justify-center gap-4 pb-8">
          <button
            type="button"
            onClick={() => goToPage(pageNumber - 1)}
            disabled={pageNumber <= 1}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-neutral-400">
            Page {pageNumber} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => goToPage(pageNumber + 1)}
            disabled={pageNumber >= totalPages}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
