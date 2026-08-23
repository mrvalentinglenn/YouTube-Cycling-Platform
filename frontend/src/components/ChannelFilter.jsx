import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { resolveFilters } from '../lib/filters'

// Fixed order per CLAUDE.md, reused here as the dropdown's group order.
const CATEGORY_ORDER = ['brands', 'triathletes', 'teams', 'influencers']
const CATEGORY_LABELS = {
  brands: 'Brands',
  triathletes: 'Professional Triathletes',
  teams: 'Cycling Teams',
  influencers: 'Influencers',
}

// A different kind of filter from the four in FilterBar: this says WHAT is
// relevant to the person looking, not HOW performance is measured. All
// channels are on by default and the URL carries only the exclusions, so a
// bare URL stays short — a user switches a handful off at most, not most of
// them on.
// isOpen/onToggle are owned by FilterBar now — one piece of state shared
// across this dropdown and the four filter dropdowns, so opening any of them
// closes whatever else was open. Click-outside and Escape are handled once,
// at the FilterBar level, for the same reason.
export default function ChannelFilter({ channels, isOpen, onToggle }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const excludedIds = resolveFilters(searchParams).exclude

  const [searchText, setSearchText] = useState('')

  function writeExclusions(nextExcludedIds) {
    const next = new URLSearchParams(searchParams)
    if (nextExcludedIds.length > 0) {
      next.set('exclude', nextExcludedIds.join(','))
    } else {
      // Empty means "nothing excluded" — dropping the param entirely
      // rather than writing exclude= keeps a fully-reset URL clean.
      next.delete('exclude')
    }
    // Same rule as the four measurement filters: an exclusion change can
    // put a channel's videos on a page that no longer exists.
    next.set('page', '1')
    setSearchParams(next)
  }

  function toggleChannel(channelId) {
    const nextExcludedIds = excludedIds.includes(channelId)
      ? excludedIds.filter((id) => id !== channelId)
      : [...excludedIds, channelId]
    writeExclusions(nextExcludedIds)
  }

  const excludedChannels = channels.filter((channel) => excludedIds.includes(channel.channel_id))
  const shownCount = channels.length - excludedChannels.length

  const groupedChannels = useMemo(() => {
    const needle = searchText.trim().toLowerCase()
    const groups = {}
    for (const category of CATEGORY_ORDER) groups[category] = []

    for (const channel of channels) {
      if (needle && !channel.name.toLowerCase().includes(needle)) continue
      if (!groups[channel.category]) groups[channel.category] = []
      groups[channel.category].push(channel)
    }
    return groups
  }, [channels, searchText])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        <button
          type="button"
          onClick={onToggle}
          className="rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-300 hover:text-neutral-100"
        >
          Channels
        </button>

        {isOpen && (
          <div className="absolute z-10 mt-2 w-72 rounded-md border border-neutral-700 bg-neutral-900 p-3 shadow-lg">
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Filter channels…"
              className="mb-2 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white placeholder:text-neutral-500"
            />

            <div className="max-h-72 overflow-y-auto pr-1">
              {CATEGORY_ORDER.map((category) => {
                const channelsInCategory = groupedChannels[category] ?? []
                if (channelsInCategory.length === 0) return null
                return (
                  <div key={category} className="mb-3">
                    <p className="mb-1 text-xs font-semibold tracking-wide text-neutral-500">
                      {CATEGORY_LABELS[category] ?? category}
                    </p>
                    {channelsInCategory.map((channel) => (
                      <label
                        key={channel.channel_id}
                        className="flex items-center gap-2 py-0.5 text-sm text-neutral-300"
                      >
                        <input
                          type="checkbox"
                          checked={!excludedIds.includes(channel.channel_id)}
                          onChange={() => toggleChannel(channel.channel_id)}
                        />
                        {channel.name}
                      </label>
                    ))}
                  </div>
                )
              })}

              {channels.length > 0 &&
                CATEGORY_ORDER.every((category) => (groupedChannels[category] ?? []).length === 0) && (
                  <p className="text-sm text-neutral-500">No channels match "{searchText}".</p>
                )}
            </div>

            <button
              type="button"
              onClick={() => writeExclusions([])}
              className="mt-2 text-xs text-violet-400 hover:text-violet-300"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      <span className="text-sm text-neutral-400">
        {shownCount} of {channels.length} shown
      </span>

      {excludedChannels.map((channel) => (
        <span
          key={channel.channel_id}
          className="flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
        >
          {channel.name}
          <button
            type="button"
            onClick={() => toggleChannel(channel.channel_id)}
            aria-label={`Include ${channel.name}`}
            className="text-neutral-500 hover:text-neutral-200"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}
