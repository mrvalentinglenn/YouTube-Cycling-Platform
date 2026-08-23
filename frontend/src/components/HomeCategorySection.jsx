import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import VideoCard from './VideoCard'
import { getCategoryVideos } from '../lib/queries'

// Item count and column count both now depend on format — Shorts shows
// more per section than long-form (5 vs 3), and the count fetched must
// match what the grid can actually show, or the layout would either
// render empty cells or discard rows that were fetched for nothing.
// mobile | tablet | laptop | wide
//  long-form:   1  |   3    |   3    |  3   (fetch 3)
//  shorts:      3  |   3    |   5    |  5   (fetch 5)
function getTopCount(format) {
  return format === 'shorts' ? 5 : 3
}

// Two complete literal strings, not built with `grid-cols-${n}` — Tailwind's
// build-time scanner finds class names by scanning each source file's raw
// text, not by evaluating JavaScript, so a class name assembled at runtime
// would never be found and its CSS would never be generated.
function getHomeGridColumnsClassName(format) {
  return format === 'shorts' ? 'grid-cols-3 lg:grid-cols-5' : 'grid-cols-1 md:grid-cols-3'
}

// Shorts on the category page render at whatever width its widest state (6
// columns, container capped at max-w-7xl) produces: (1280px container -
// 2*32px lg:px-8 padding - 5*16px gap-4 gaps) / 6 columns = 189px. At that
// width VideoCard's own aspect-[9/16] thumbnail (untouched, inside
// VideoCard) comes out to exactly 336px tall (189 * 16 / 9). That 336px is
// the ceiling point 2 asks for — measured from the category page's actual
// layout, not invented.
//
// There is no way to cap that derived height directly without reaching
// inside VideoCard's own aspect-ratio box, which is off limits: height
// there is computed FROM width by the aspect-ratio CSS property, so
// bounding the output means bounding the input. The cap is applied one
// level up instead — as a width on the cell a Shorts card sits in, from
// outside VideoCard, which reproduces the same 336px ceiling as a side
// effect of capping the same width the category page's own 6-column grid
// already caps it to. Long-form is untouched: no cap, same as before.
//
// w-full is not decorative here — it is the fix for a second, worse bug
// this cap caused. With only max-width set (width left at its default,
// auto), a grid item that isn't stretch-aligned sizes itself by
// CSS's fit-content(track-size) formula: min(max-content, max(min-content,
// track-size)). That formula is bounded BELOW by the item's own
// min-content — the width its content cannot shrink under without
// breaking — and neither max-width nor an explicit min-width:0 can push a
// fit-content box below that floor; min-content there comes straight from
// content, not from any CSS-author-settable property. A long unbroken run
// in a title (most often a hashtag with no spaces, e.g.
// "#womenempowerment") or a long channel name (permanently unbreakable —
// the channel-name span is white-space:nowrap) can easily need more than
// a narrow mobile track's ~92px, so the card rendered at its own
// min-content width instead of the track's, overlapping its neighbours.
// Verified in a real browser: emptying the title and hiding the channel
// name were the only changes that brought a broken card back to the
// track's width; max-width alone, min-width:0, and swapping
// justify-self-center for mx-auto each left the overflow completely
// unchanged.
//
// w-full gives the item a DEFINITE width (100% of its track) instead of
// auto, which takes it out of fit-content sizing entirely — a definite
// width is not computed from content at all, so there is no min-content
// floor to hit. max-width then clamps that definite width down to 189px
// when the track is wider, exactly like the common
// `width: 100%; max-width: 600px` pattern for a capped-width image.
// mx-auto centres the result when max-width has actually capped it below
// the track's width.
const SHORTS_CARD_WRAPPER_CLASS_NAME = 'w-full max-w-[189px] mx-auto'

// Shorts fetches and renders 5 items always (see getTopCount) — the count
// never changes with viewport, only how many of them are visible. The grid
// itself only widens to 5 columns from `lg` up (getHomeGridColumnsClassName
// below); below that it's 3 columns, so without this the 4th and 5th items
// would simply wrap onto a second row rather than being hidden. Toggling
// visibility in CSS at the SAME `lg` breakpoint the column count switches
// on means the two can never disagree about how many cards a given width
// shows — there is no width at which the grid says 5 columns but only 3
// cards are visible, or vice versa. No JS reads the viewport for this.
const HIDE_BELOW_LAPTOP_CLASS_NAME = 'hidden lg:block'

// Position 0-2 always render normally. Positions 3-4 (the 4th and 5th
// card) exist in the DOM at every breakpoint but are display:none below
// `lg`, so long-form (which never reaches index 3, topCount is 3) is
// entirely unaffected by this — the check only ever applies to Shorts.
function getCardWrapperClassName(isShort, index) {
  if (!isShort) return ''
  const visibilityClassName = index >= 3 ? HIDE_BELOW_LAPTOP_CLASS_NAME : ''
  return `${SHORTS_CARD_WRAPPER_CLASS_NAME} ${visibilityClassName}`.trim()
}

function SkeletonCard({ isShort }) {
  return (
    // w-full, not a fixed width: this sits in the same grid cell VideoCard
    // will occupy once loaded (itself capped for Shorts by the wrapper
    // around this component, not by anything here), and a fixed width on
    // the skeleton itself would fight that cell exactly the way VideoCard's
    // own width once did (2026-08-21).
    <div className="w-full animate-pulse">
      <div className={`rounded-lg bg-neutral-800 ${isShort ? 'aspect-[9/16]' : 'aspect-video'}`} />
      <div className="mt-2 h-4 w-4/5 rounded bg-neutral-800" />
      <div className="mt-2 h-3 w-2/5 rounded bg-neutral-800" />
    </div>
  )
}

// One category's worth of the homepage: heading, its own fetch, its own
// loading/error/rows state. Mounting four of these — one per CATEGORIES
// entry — is what makes the four sections load in parallel: each owns an
// independent effect, so React fires all four requests in the same pass
// rather than one waiting on another, and one section's error or loading
// state can't reach into the other three.
export default function HomeCategorySection({ category, filters, channels, channelsLoaded, query }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const excludeKey = filters.exclude.join(',')

  // Only meaningful once channelsLoaded is true. Checking this against an
  // empty `channels` array before it has loaded would be vacuously true —
  // [].every(...) is true for the same reason "all cards on an empty table
  // are red" is true — and every section would flash the "select at least
  // one channel" message before any real data exists to contradict it.
  const channelsInCategory = channelsLoaded
    ? channels.filter((channel) => channel.category === category.value)
    : []
  const allChannelsExcluded =
    channelsLoaded &&
    channelsInCategory.length > 0 &&
    channelsInCategory.every((channel) => filters.exclude.includes(channel.channel_id))

  useEffect(() => {
    if (allChannelsExcluded) {
      // Already known without asking: every channel this category has is
      // switched off, so there is nothing scoring_view could return.
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    getCategoryVideos({
      categories: [category.value],
      window: filters.window,
      metric: filters.metric,
      comparison: filters.comparison,
      format: filters.format,
      page: '1',
      exclude: filters.exclude,
      q: filters.q,
      pageSize: getTopCount(filters.format),
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
  }, [
    category.value,
    filters.window,
    filters.metric,
    filters.comparison,
    filters.format,
    filters.q,
    excludeKey,
    allChannelsExcluded,
  ])

  const isShort = filters.format === 'shorts'
  const topCount = getTopCount(filters.format)
  const gridColumnsClassName = getHomeGridColumnsClassName(filters.format)

  return (
    // The bordered block itself — overflow-hidden so the header bar below
    // (which has no rounding of its own) gets clipped to this container's
    // top corners rather than sitting square inside a rounded box.
    // rounded-lg matches VideoCard's thumbnail radius and FilterBar's own
    // container; bg-neutral-900 matches FilterBar's panel tone, so this
    // reads as the same kind of surface rather than a new one.
    <section className="mb-10 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900">
      {/* Full-width header strip, one step lighter than the body
          (neutral-800 on neutral-900) — the same "raised strip" relationship
          FilterBar uses internally, not a new colour. Centred, no icon. */}
      <div className="bg-neutral-800 px-4 py-3 text-center">
        <h2 className="text-xl font-semibold text-white">{category.label}</h2>
      </div>

      <div className="p-4">
        {allChannelsExcluded && (
          <p className="text-sm text-neutral-500">
            At least one channel must be selected for this category.
          </p>
        )}

        {/* Long-form stacks to a single column below the tablet breakpoint —
            three across at 375px left a 16:9 thumbnail too narrow to read a
            title against, and portrait Shorts (which stay 3 across down to
            mobile) don't have that problem. Shorts widens to 5 across from
            laptop up, matching how many were actually fetched below. */}
        {!allChannelsExcluded && loading && (
          <div className={`grid gap-4 ${gridColumnsClassName}`}>
            {Array.from({ length: topCount }).map((_, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={index} className={getCardWrapperClassName(isShort, index)}>
                <SkeletonCard isShort={isShort} />
              </div>
            ))}
          </div>
        )}

        {!allChannelsExcluded && !loading && error && <p>Error: {error.message}</p>}

        {/* Distinct from allChannelsExcluded above — a user needs to know
            which of the two is the reason nothing's showing. A section
            emptied by a search says so specifically rather than rendering
            an empty bordered box with only its header, which reads as
            broken. */}
        {!allChannelsExcluded && !loading && !error && filters.q && rows.length === 0 && (
          <p className="text-sm text-neutral-500">No videos match "{filters.q}".</p>
        )}

        {/* Fewer than topCount videos is expected and renders as-is — no
            message, no filler — EXCEPT when a search is the reason, which
            is the case handled just above. The 7-day window in particular
            will produce this routinely (with no search active) until the
            pool of scored videos grows. */}
        {!allChannelsExcluded && !loading && !error && !(filters.q && rows.length === 0) && (
          <div className={`grid gap-4 ${gridColumnsClassName}`}>
            {rows.map((row, index) => (
              <div key={row.video_id} className={getCardWrapperClassName(isShort, index)}>
                <p className="mb-1 text-base font-semibold text-neutral-500">#{index + 1}</p>
                <VideoCard video={row} comparison={filters.comparison} />
              </div>
            ))}
          </div>
        )}

        {/* Own category only, not the current selection — the homepage
            already shows all four side by side, so there is nothing to
            select here. Every filter and the exclusion list carry over
            unchanged; only window and comparison ever affect which videos
            these three even are. Styled as a pill matching the category
            page's buttons (same radius, padding, font size) rather than a
            plain text link, so it reads as clickable at a glance instead of
            as body copy. Kept inside the bordered container (this div sits
            inside the p-4 body wrapper) so it visibly belongs to this
            section rather than floating between two categories. */}
        <div className="mt-4 flex justify-center">
          <Link
            to={`/category/${category.value}${query ? `?${query}` : ''}`}
            className="rounded-full border border-neutral-600 px-4 py-1.5 text-sm font-medium text-neutral-300 hover:text-white"
          >
            Show more
          </Link>
        </div>
      </div>
    </section>
  )
}
