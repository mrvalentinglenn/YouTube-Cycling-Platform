// Single source of truth for the five filter query params and their
// defaults. Both pages read filter state through resolveFilters() rather
// than reading URLSearchParams directly, so the default values below are
// the only place they're written.
export const DEFAULT_FILTERS = {
  window: '90d',
  metric: 'views',
  comparison: 'absolute',
  format: 'longform',
  page: '1',
}

// Takes the URLSearchParams for the current page and returns every filter
// resolved to its URL value, falling back to DEFAULT_FILTERS for any
// param that isn't present. searchParams.get() returns null (not
// undefined) for a missing param, so ?? only falls back on an actually
// missing param, not on an empty-string one.
export function resolveFilters(searchParams) {
  const resolved = {}
  for (const key of Object.keys(DEFAULT_FILTERS)) {
    resolved[key] = searchParams.get(key) ?? DEFAULT_FILTERS[key]
  }
  return resolved
}
