import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import FilterBar from '../components/FilterBar'
import SiteHeader from '../components/SiteHeader'
import VideoCard from '../components/VideoCard'
import {
  CATEGORIES,
  getGridColumnsClassName,
  getPageSize,
  parseCategories,
  resolveFilters,
  serializeCategories,
} from '../lib/filters'
import { getCategoryVideos } from '../lib/queries'

// No icon library in this project (checked package.json) — an inline SVG
// for one icon, matching the stroke style VideoCard's Eye/Comment/Thumb
// icons already use, rather than adding a dependency.
function HomeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  )
}

export default function CategoryPage({ channels }) {
  const { categories: rawCategories } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const filters = resolveFilters(searchParams)
  const query = searchParams.toString()

  // Defensive parsing: unknown tokens (a typo, a stale link, a hand-edited
  // URL) are dropped rather than erroring. An empty result after that is
  // handled below, once all hooks have run — it can't short-circuit here,
  // because hooks must be called in the same order on every render.
  const selectedCategories = parseCategories(rawCategories)
  const categoriesKey = selectedCategories.join(',')

  const [rows, setRows] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // filters.exclude is an array — a new reference every render, even when
  // its contents haven't changed — so this joins it to a string first,
  // giving the effect below a primitive it can actually depend on.
  const excludeKey = filters.exclude.join(',')

  // Re-runs whenever the category selection or any individual filter value
  // changes — deliberately not keyed on the `filters` object itself, since
  // resolveFilters() returns a new object on every render regardless of
  // whether anything actually changed.
  useEffect(() => {
    // Nothing to fetch while the page below is about to redirect away from
    // an invalid/empty category selection.
    if (selectedCategories.length === 0) return undefined

    let cancelled = false
    setLoading(true)
    setError(null)

    getCategoryVideos({
      categories: selectedCategories,
      window: filters.window,
      metric: filters.metric,
      comparison: filters.comparison,
      format: filters.format,
      page: filters.page,
      exclude: filters.exclude,
      q: filters.q,
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
  }, [
    categoriesKey,
    filters.window,
    filters.metric,
    filters.comparison,
    filters.format,
    filters.page,
    filters.q,
    excludeKey,
  ])

  // getPageSize() is the same helper queries.js used for .range() — using
  // anything else here is exactly the divergence that would silently skip
  // or repeat videos between pages.
  const pageSize = getPageSize(filters.format)
  const pageNumber = Number(filters.page) || 1
  // The page's first row is rank (page - 1) * pageSize + 1, so page 2 of
  // long-form starts at #21, page 2 of Shorts (pageSize 24) at #25 — same
  // rule as before, now applied to a ranking merged across categories
  // rather than a single one.
  const rankOffset = (pageNumber - 1) * pageSize
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // Bad/empty category selection: redirect rather than render an empty
  // page. `replace` is load-bearing — without it the bad URL stays in
  // browser history, so back lands on it and immediately redirects forward
  // again, trapping the user.
  if (selectedCategories.length === 0) {
    return <Navigate to={`/category/${CATEGORIES[0].value}${query ? `?${query}` : ''}`} replace />
  }

  function goToPage(newPage) {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(newPage))
    setSearchParams(next)
    // A page change should land the user at the top of the new page, not
    // wherever they happened to be scrolled to on the old one.
    window.scrollTo(0, 0)
  }

  function toggleCategory(categoryValue) {
    const isSelected = selectedCategories.includes(categoryValue)

    // The page can never reach zero categories — removing the last one is
    // a no-op, not a fall-through to "show everything".
    if (isSelected && selectedCategories.length === 1) return

    const nextCategories = isSelected
      ? selectedCategories.filter((value) => value !== categoryValue)
      : [...selectedCategories, categoryValue]

    const nextSearchParams = new URLSearchParams(searchParams)
    // Same rule as the other filters: a category change can put the
    // current page number past the end of the new selection's results.
    nextSearchParams.set('page', '1')

    navigate(`/category/${serializeCategories(nextCategories)}?${nextSearchParams.toString()}`)
  }

  // Shorts run 9:16, so more of them fit per row than 16:9 long-form —
  // hence the different column counts at every breakpoint, per
  // CLAUDE.md's layout table. Shared with the homepage via filters.js
  // rather than kept as a local literal here, so the two can't diverge.
  const gridColumnsClassName = getGridColumnsClassName(filters.format)

  const heading = selectedCategories
    .map((value) => CATEGORIES.find((category) => category.value === value).label)
    .join(' + ')

  return (
    // py-6 matches HomePage's own container — CategoryPage had no vertical
    // padding before (FilterBar sat flush against the viewport top), which
    // is fine for a filter bar but not for a page title sitting above it.
    // Adding it here keeps the two routes' top spacing consistent, without
    // touching FilterBar itself.
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader query={query} />
      <FilterBar channels={channels} />

      {/* flex-wrap, not horizontal scroll: "Professional Triathletes" and
          "Cycling Teams" alongside three other pills won't fit one line on
          a phone, and a scroll gesture hides options nobody knows are
          there. Wrapping keeps every option visible at every width. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {/* Laptop and up: unchanged text link. */}
        <Link
          to={`/${query ? `?${query}` : ''}`}
          className="hidden rounded-full border border-neutral-600 px-4 py-1.5 text-sm font-medium text-neutral-300 hover:text-white lg:inline-block"
        >
          {'<< Back to home'}
        </Link>

        {/* Below laptop: icon only. `aspect-square` was tried twice and
            rejected both times — verified empirically, not assumed. It
            can't derive width from a flex-stretched height (stretch
            resolves too late in the flex algorithm), and switching off
            flex entirely still failed: with both width and height
            unset, the browser sizes each axis independently from its own
            content instead of transferring one from the other, so the box
            came out 18×34 either way, never square.
            What actually matches the pills' 34px height, reliably: the
            same two ingredients that produce it — py-1.5 (12px) plus
            text-sm's line-height (20px) plus the 2px border = 34.
            px-2 is the deliberate horizontal counterpart, not a guess:
            16px padding + the icon's own 16px (h-4/w-4) + the same 2px
            border also totals 34, so both axes land on the same number
            through matching arithmetic rather than through aspect-ratio.
            If the pills' own py-1.5/text-sm ever changes, this has to be
            re-derived alongside them — there's no live link between the
            two. */}
        <Link
          to={`/${query ? `?${query}` : ''}`}
          aria-label="Back to home"
          className="inline-block rounded-full border border-neutral-600 px-2 py-1.5 text-sm text-neutral-300 hover:text-white lg:hidden"
        >
          <HomeIcon className="inline-block h-4 w-4 align-middle" />
        </Link>

        {CATEGORIES.map((category) => {
          const isSelected = selectedCategories.includes(category.value)
          return (
            <button
              key={category.value}
              type="button"
              onClick={() => toggleCategory(category.value)}
              className={
                isSelected
                  ? 'rounded-full border border-yellow-400 bg-yellow-400 px-4 py-1.5 text-sm font-medium text-neutral-900'
                  : 'rounded-full border border-neutral-600 px-4 py-1.5 text-sm font-medium text-neutral-400 hover:text-neutral-200'
              }
            >
              {category.label}
            </button>
          )
        })}
      </div>

      <h1 className="mt-4">{heading}</h1>

      {loading && <p>Loading…</p>}

      {!loading && error && <p>Error: {error.message}</p>}

      {/* Zero rows is expected right now — the 7-day window has no arm in
          scoring_view yet — and must read as an empty window, not a
          broken page. A search returning nothing gets its own wording:
          otherwise a user can't tell "your search matched nothing" from
          "this window has no data yet" from the same generic line. */}
      {!loading && !error && rows.length === 0 && (
        <p>{filters.q ? `No videos match "${filters.q}".` : 'No videos found.'}</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className={`grid gap-4 ${gridColumnsClassName}`}>
          {rows.map((row, index) => (
            <div key={row.video_id}>
              <p className="mb-1 text-base font-semibold text-neutral-500">#{rankOffset + index + 1}</p>
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
