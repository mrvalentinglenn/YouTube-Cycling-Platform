import { Link, useSearchParams } from 'react-router-dom'
import FilterBar from '../components/FilterBar'

// Fixed order per CLAUDE.md: Brands, Professional Triathletes, Cycling
// Teams, Influencers.
const CATEGORIES = ['brands', 'triathletes', 'teams', 'influencers']

export default function HomePage({ channels }) {
  const [searchParams] = useSearchParams()
  const query = searchParams.toString()

  return (
    <div>
      <FilterBar channels={channels} />
      <h1 className="text-4xl font-bold text-white">Home</h1>
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
