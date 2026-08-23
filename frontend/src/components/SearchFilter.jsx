import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { resolveFilters } from '../lib/filters'

const DEBOUNCE_MS = 300

// A different kind of filter from the four in FilterBar, same family as
// ChannelFilter: this says WHAT is relevant to the person looking ("only
// videos about X"), not HOW performance is measured.
export default function SearchFilter() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = resolveFilters(searchParams).q

  // Local buffer so typing feels instant — the URL only updates ~300ms
  // after the user stops, or every keystroke would be its own fetch and,
  // pre-debounce, its own history entry. `q` in the URL stays canonical;
  // this buffer only ever holds what's in flight between a keystroke and
  // the debounced commit, and resyncs from the URL below whenever it
  // changes some other way (back/forward, the clear button, a pasted
  // link). Deliberate, scoped exception to "no filter state in React" —
  // not a drift from that rule, since nothing here is a second source of
  // truth for what the committed search actually is.
  const [inputValue, setInputValue] = useState(urlQuery)
  const debounceRef = useRef(null)

  // What THIS component last wrote to the URL. Without it, the resync
  // effect below can't tell "the URL just changed because our own
  // debounced commit landed" (inputValue may already be ahead of it, if
  // the user kept typing during the round-trip — don't stomp that) from
  // "the URL changed some other way" (back/forward, clear — resync for
  // real). The failure mode without this guard: a character silently
  // disappearing mid-word whenever a commit's re-render lands after the
  // next keystroke.
  const lastCommittedRef = useRef(urlQuery)

  useEffect(() => {
    if (urlQuery === lastCommittedRef.current) return
    lastCommittedRef.current = urlQuery
    setInputValue(urlQuery)
  }, [urlQuery])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function commit(value, options) {
    lastCommittedRef.current = value
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value) {
        next.set('q', value)
      } else {
        next.delete('q')
      }
      // Same rule as every other filter: a search change can put the
      // current page number past the end of the new (smaller) result set.
      next.set('page', '1')
      return next
    }, options)
  }

  function handleChange(event) {
    const value = event.target.value
    setInputValue(value)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      // replace, not push: a pause mid-word still fires a commit at
      // 300ms, and pushing would leave the back button stepping through
      // partial search terms instead of stepping out of the search
      // entirely.
      commit(value, { replace: true })
    }, DEBOUNCE_MS)
  }

  function handleClear() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setInputValue('')
    // push, not replace: clearing is a deliberate action, not a typing
    // artefact, and gets its own back-button stop.
    commit('', { replace: false })
  }

  return (
    <div className="relative mb-4">
      <input
        type="text"
        value={inputValue}
        onChange={handleChange}
        placeholder="Search titles..."
        className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 pr-8 text-sm text-white placeholder:text-neutral-500"
      />
      {inputValue && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2 text-sm text-neutral-500 hover:text-neutral-200"
        >
          ×
        </button>
      )}
    </div>
  )
}
