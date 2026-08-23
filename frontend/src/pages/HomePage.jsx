import { useSearchParams } from 'react-router-dom'
import FilterBar from '../components/FilterBar'
import HomeCategorySection from '../components/HomeCategorySection'
import SiteHeader from '../components/SiteHeader'
import { CATEGORIES, resolveFilters } from '../lib/filters'

export default function HomePage({ channels, channelsLoaded }) {
  const [searchParams] = useSearchParams()
  const query = searchParams.toString()
  const filters = resolveFilters(searchParams)

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader query={query} />
      <FilterBar channels={channels} />

      <div className="mt-6">
        {CATEGORIES.map((category) => (
          <HomeCategorySection
            key={category.value}
            category={category}
            filters={filters}
            channels={channels}
            channelsLoaded={channelsLoaded}
            query={query}
          />
        ))}
      </div>
    </div>
  )
}
