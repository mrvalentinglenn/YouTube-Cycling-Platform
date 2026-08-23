// Single source of truth for the five filter query params and their
// defaults. Both pages read filter state through resolveFilters() rather
// than reading URLSearchParams directly, so the default values below are
// the only place they're written.
// `exclude` is a different kind of filter from the other four — it says
// WHAT is relevant to the person looking, not HOW performance is measured
// — but it still lives here so a bare URL still resolves to one valid
// state and nothing has two homes for its default. Its default is an
// empty list: all channels shown, nothing excluded.
export const DEFAULT_FILTERS = {
  window: '90d',
  metric: 'views',
  comparison: 'absolute',
  format: 'longform',
  page: '1',
  exclude: [],
}

// Takes the URLSearchParams for the current page and returns every filter
// resolved to its URL value, falling back to DEFAULT_FILTERS for any
// param that isn't present. searchParams.get() returns null (not
// undefined) for a missing param, so ?? only falls back on an actually
// missing param, not on an empty-string one.
//
// `exclude` is handled separately: it's stored in the URL as a
// comma-separated string of channel_ids (e.g. "?exclude=UCabc,UCdef") but
// resolves to an array here, so every consumer gets a list of ids to check
// membership against rather than each having to split the string itself.
export function resolveFilters(searchParams) {
  const resolved = {}
  for (const key of Object.keys(DEFAULT_FILTERS)) {
    if (key === 'exclude') continue
    resolved[key] = searchParams.get(key) ?? DEFAULT_FILTERS[key]
  }

  const rawExclude = searchParams.get('exclude')
  resolved.exclude = rawExclude ? rawExclude.split(',').filter(Boolean) : [...DEFAULT_FILTERS.exclude]

  return resolved
}

// The single place page size is decided. Shorts get more per page than
// long-form because they're a 9:16 grid item rather than 16:9 — more of
// them fit on screen at once. Both queries.js (.range()) and CategoryPage
// (rank offset) call this rather than each holding their own number: if
// those two ever disagreed, videos would be silently skipped or repeated
// between pages with no error to show for it.
export function getPageSize(format) {
  return format === 'shorts' ? 24 : 20
}

// Canonical order for the four categories — the homepage's section order,
// the category page's button row, and URL serialisation all read from this
// one list rather than each keeping their own copy. Deliberately the
// homepage's order, not alphabetical: a user arriving from the homepage
// seeing the same four things in a different order reads as carelessness.
export const CATEGORIES = [
  { value: 'brands', label: 'Brands' },
  { value: 'triathletes', label: 'Professional Triathletes' },
  { value: 'teams', label: 'Cycling Teams' },
  { value: 'influencers', label: 'Influencers' },
]

// Turns the raw `:categories` route param into a canonically-ordered,
// deduplicated array of valid category values. Unknown tokens (a typo, a
// stale link, someone hand-editing the URL) are dropped rather than
// erroring — parsing defensively here is what lets the page redirect to a
// sane state instead of rendering on bad input.
export function parseCategories(rawParam) {
  const requested = new Set(
    (rawParam ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
  return CATEGORIES.filter((category) => requested.has(category.value)).map(
    (category) => category.value,
  )
}

// The inverse: turns a list of category values (in any order, with any
// duplicates) back into the canonical comma-separated path segment. Both
// this and parseCategories() independently reorder to match CATEGORIES, so
// a given selection has exactly one URL — "brands,teams" and "teams,brands"
// can never both exist as addresses for the same state.
export function serializeCategories(categoryValues) {
  const selected = new Set(categoryValues)
  return CATEGORIES.filter((category) => selected.has(category.value))
    .map((category) => category.value)
    .join(',')
}

// Complete, literal fragments only, looked up by number rather than built
// with `grid-cols-${n}`. Tailwind's build-time scanner finds class names by
// scanning each source file's raw text, not by evaluating JavaScript, so a
// class name assembled at runtime would never be found and its CSS would
// never be generated — the page would silently not respond to a column
// count nobody wrote out as a literal string somewhere.
const GRID_COLS_CLASSES = {
  '': { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6' },
  md: { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-5', 6: 'md:grid-cols-6' },
  lg: { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6' },
  xl: { 1: 'xl:grid-cols-1', 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5', 6: 'xl:grid-cols-6' },
}

// The one place the category grid's column count per breakpoint, per
// format, is decided — CLAUDE.md's layout table: long-form 1/2/4/5, Shorts
// 3/4/6/6 (Shorts has no separate xl entry because its lg value already
// carries up to every wider breakpoint, same as it not being listed at all
// used to mean before this became data instead of two hand-written strings).
const GRID_COLUMNS_BY_FORMAT = {
  longform: { '': 1, md: 2, lg: 4, xl: 5 },
  shorts: { '': 3, md: 4, lg: 6 },
}

// Returns the grid-cols-* class list for a format, one class per breakpoint
// that format defines. The category page is the only caller — the homepage
// uses a fixed grid-cols-3 at every breakpoint regardless of format, not a
// responsive count, so it doesn't call this at all.
export function getGridColumnsClassName(format) {
  const columnsByBreakpoint = GRID_COLUMNS_BY_FORMAT[format] ?? GRID_COLUMNS_BY_FORMAT.longform
  return Object.entries(columnsByBreakpoint)
    .map(([breakpoint, columns]) => GRID_COLS_CLASSES[breakpoint][columns])
    .join(' ')
}
