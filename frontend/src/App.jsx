import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import CategoryPage from './pages/CategoryPage.jsx'
import { getChannels } from './lib/queries'
import './App.css'

function App() {
  const [channels, setChannels] = useState([])

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
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Routes>
      <Route path="/" element={<HomePage channels={channels} />} />
      <Route path="/category/:categories" element={<CategoryPage channels={channels} />} />
    </Routes>
  )
}

export default App
