import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import CategoryPage from './pages/CategoryPage.jsx'
import { getChannels } from './lib/queries'
import './App.css'

function App() {
  const [channels, setChannels] = useState([])
  // Separate from `channels` itself deliberately: `channels` starts as an
  // empty array and an empty array is what it would also be on a genuine
  // fetch failure, so nothing about its length alone can distinguish "not
  // loaded yet" from "loaded, turned out empty". The homepage's per-category
  // exclusion check needs that distinction — [].every(...) is vacuously
  // true, so checking "is every channel in this category excluded" against
  // an empty list reads as yes before the real list has arrived.
  const [channelsLoaded, setChannelsLoaded] = useState(false)

  // Fetched once here, not per page or per section: 40 rows that change
  // almost never, and both routes' filter bars read the same list.
  useEffect(() => {
    let cancelled = false

    getChannels().then((result) => {
      if (cancelled) return
      if (result.error) {
        console.error('Failed to load channels:', result.error)
      }
      setChannels(result.channels)
      setChannelsLoaded(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Routes>
      <Route
        path="/"
        element={<HomePage channels={channels} channelsLoaded={channelsLoaded} />}
      />
      <Route path="/category/:categories" element={<CategoryPage channels={channels} />} />
    </Routes>
  )
}

export default App
