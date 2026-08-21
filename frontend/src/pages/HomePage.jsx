import { Link, useSearchParams } from 'react-router-dom'

// Fixed order per CLAUDE.md: Brands, Professional Triathletes, Cycling
// Teams, Influencers.
const CATEGORIES = ['brands', 'triathletes', 'teams', 'influencers']

export default function HomePage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.toString()

  return (
    <div>
      <h1>Home</h1>
      <ul>
        {CATEGORIES.map((category) => (
          <li key={category}>
            <Link to={`/category/${category}${query ? `?${query}` : ''}`}>
              {category}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
