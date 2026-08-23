import { Link } from 'react-router-dom'

// Typographic only — no logo, no image, per CLAUDE.md's scope discipline for
// this prototype. A bicycle icon was tried and rejected: at wordmark size it
// read as an ambiguous scribble more than a bike, and it pushed the "B" of
// "BikeTube" off the column's actual left edge, undercutting the one thing
// this header is required to nail — alignment with the filter bar and grid
// beneath it. The colour split plus the larger, heavier weight below already
// give this the presence a mark was meant to add.
//
// Title and tagline sit inline beside each other rather than stacked, at
// every breakpoint the tagline shows at, so this block can never grow to a
// second line: the requirement was "must not eat vertical space before the
// filters" on mobile, and a lockup that can wrap is a lockup that can
// silently start doing exactly that. The tagline is hidden below `sm`
// instead of shrinking further or wrapping — "BikeTube Cycling Content
// Tracker" doesn't reliably fit one line at 375px without either an
// illegibly small font or a wrap, and dropping it entirely is the one option
// that can't regress into either.
export default function SiteHeader({ query }) {
  return (
    <Link
      to={`/${query ? `?${query}` : ''}`}
      className="mb-4 inline-flex items-baseline gap-2 sm:mb-6"
    >
      <span className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        <span className="text-yellow-400">Bike</span>
        <span className="text-white">Tube</span>
      </span>
      <span className="hidden text-sm text-neutral-400 sm:inline">Cycling Content Tracker</span>
    </Link>
  )
}
