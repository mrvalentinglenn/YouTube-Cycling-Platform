import { Link, useSearchParams } from 'react-router-dom'
import FilterBar from '../components/FilterBar'
import { CATEGORIES } from '../lib/filters'

export default function HomePage({ channels }) {
  const [searchParams] = useSearchParams()
  const query = searchParams.toString()

  return (
    <div>
      <FilterBar channels={channels} />
      <h1 className="text-4xl font-bold text-white">Home</h1>
      <ul>
        {CATEGORIES.map((category) => (
          <li key={category.value}>
            <Link to={`/category/${category.value}${query ? `?${query}` : ''}`}>
              {category.value}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
