import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ChannelFilter from './ChannelFilter'
import FilterDropdown from './FilterDropdown'
import SearchFilter from './SearchFilter'
import { resolveFilters } from '../lib/filters'

// Option values here are the ones already defined in filters.js — nothing
// new is introduced, and DEFAULT_FILTERS itself is never duplicated here:
// the active option is read back through resolveFilters(), not compared
// against a hardcoded default.
const GROUPS = [
  {
    param: 'window',
    label: 'TIME WINDOW',
    options: [
      { value: '7d', label: '7-day window' },
      { value: '90d', label: '90-day window' },
    ],
  },
  {
    param: 'metric',
    label: 'METRIC',
    options: [
      { value: 'views', label: 'Views' },
      { value: 'comments', label: 'Comments' },
      { value: 'likes', label: 'Likes' },
    ],
  },
  {
    param: 'comparison',
    label: 'COMPARISON',
    options: [
      { value: 'absolute', label: 'Absolute' },
      { value: 'relative', label: 'Relative' },
    ],
  },
  {
    param: 'format',
    label: 'CONTENT TYPE',
    options: [
      { value: 'longform', label: 'Long-form' },
      { value: 'shorts', label: 'Shorts' },
    ],
  },
]

// Used on both routes. Reads active state from the URL (via the shared
// resolver) and writes back to the URL on click — there is no local
// component state, so the filter bar behaves identically on the homepage
// and the category page for free.
export default function FilterBar({ channels = [] }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = resolveFilters(searchParams)

  // Which panel is open — one value, not one boolean per dropdown, so
  // opening any panel (including Channels) always closes whatever else was
  // open; there is no state combination where two panels are open at once.
  const [openPanel, setOpenPanel] = useState(null)
  const controlsRef = useRef(null)

  // Click outside the whole filter-controls block, or Escape, closes
  // whatever panel is open. One listener pair here covers all five
  // dropdowns — a click on any toggle button is inside controlsRef, so it's
  // never treated as "outside"; that button's own onClick just overwrites
  // openPanel directly.
  useEffect(() => {
    if (!openPanel) return undefined

    function handlePointerDown(event) {
      if (controlsRef.current && !controlsRef.current.contains(event.target)) {
        setOpenPanel(null)
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpenPanel(null)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openPanel])

  function setFilter(param, value) {
    const next = new URLSearchParams(searchParams)
    next.set(param, value)
    // Every filter change resets pagination — page 3 of long-form may not
    // exist under Shorts, and a stale page number would just render an
    // empty grid that looks like missing data. Unconditional: this isn't
    // special-cased to the format filter alone.
    next.set('page', '1')
    setSearchParams(next)
  }

  function togglePanel(key) {
    setOpenPanel((current) => (current === key ? null : key))
  }

  return (
    <div ref={controlsRef} className="rounded-lg bg-neutral-900 p-2 lg:p-4">
      {/* Laptop and up: unchanged button-row layout, same classes as before
          this task — just now gated to lg+ instead of rendering at every
          width. */}
      <div className="hidden lg:flex lg:flex-wrap lg:gap-6">
        {GROUPS.map((group) => (
          <div key={group.param}>
            <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-400">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-1 rounded-md bg-neutral-950 p-1">
              {group.options.map((option) => {
                const isActive = filters[group.param] === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFilter(group.param, option.value)}
                    className={
                      isActive
                        ? 'rounded border border-violet-500 px-3 py-1.5 text-sm text-white'
                        : 'rounded border border-transparent px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200'
                    }
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Below laptop: four labelled dropdowns in one row instead of four
          button groups — see FilterDropdown. panelAlign keeps the last
          column's options panel from opening off the right edge of a
          narrow viewport. */}
      <div className="grid grid-cols-4 gap-1 lg:hidden">
        {GROUPS.map((group) => (
          <FilterDropdown
            key={group.param}
            group={group}
            value={filters[group.param]}
            isOpen={openPanel === group.param}
            onToggle={() => togglePanel(group.param)}
            onSelect={(value) => {
              setFilter(group.param, value)
              setOpenPanel(null)
            }}
            panelAlign={group.param === 'format' ? 'right' : 'left'}
          />
        ))}
      </div>

      {/* Divided from the measurement filters above by a rule, since this
          row answers a different question — WHAT is relevant to the person
          looking, not HOW performance is measured — and shouldn't read as
          a fifth group of the same kind. */}
      <div className="my-4 border-t border-neutral-800" />

      {/* Same "what is relevant to me" family as ChannelFilter below it —
          its own full-width row rather than a fifth measurement control,
          since a search input needs width the four-across dropdown row
          can't spare. */}
      <SearchFilter />

      <ChannelFilter
        channels={channels}
        isOpen={openPanel === 'channels'}
        onToggle={() => togglePanel('channels')}
      />
    </div>
  )
}
