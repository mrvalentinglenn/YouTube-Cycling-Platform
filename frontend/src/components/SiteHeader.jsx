import { Link } from 'react-router-dom'

// A neutral text mark, not a wordmark — no name, no colour split, no
// bicycle mark (a bicycle icon was tried during the "BikeTube" version and
// rejected; that reasoning no longer applies here since there's no brand
// name left to accompany). Written in sentence case in the JSX and
// capitalised with `uppercase` in CSS rather than typed in caps directly,
// so a future casing change is a class, not a retyped string. tracking-wide
// gives the uppercase text the extra letter-spacing it needs to stay
// readable — lower-case text doesn't need this, uppercase does.
//
// One text element, one size, at every breakpoint — no hiding, no
// shortening, no separate mobile string. Same one-vocabulary rule that
// governs the filter labels: this is the only version of this text, so
// there's nothing to keep in sync between breakpoints.
export default function SiteHeader({ query }) {
  return (
    <Link to={`/${query ? `?${query}` : ''}`} className="mb-4 inline-block sm:mb-6">
      <span className="text-base font-medium tracking-wide text-neutral-100 uppercase sm:text-lg">
        Cycling Content Tracker
      </span>
    </Link>
  )
}
