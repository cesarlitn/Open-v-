// History hook. Provides TRUE server-side pagination (one page in memory) plus the
// browsing modes: normal list, favorites-only, and visual-similarity (similar).
// Exposes items, paging, loading/error state and the mode setters.

import { useState, useCallback, useRef } from 'react'
import api from '../services/api'

const PAGE_SIZE = 45 // 9 columns x 5 rows per page

// TRUE server-side pagination: the frontend only ever holds ONE page (max 45
// items) in memory. Moving to another page REPLACES the set - it never appends.
// The network call lives only here (in fetchPage), so scrolling/re-renders can
// never trigger it.
export function useHistory() {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [similarTo, setSimilarTo] = useState(null) // image id for visual similarity
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const favCacheRef = useRef(null) // all favorites, paginated client-side

  const fetchPage = useCallback(
    async (p, opts = {}) => {
      const s = opts.search !== undefined ? opts.search : search
      const fav = opts.favoritesOnly !== undefined ? opts.favoritesOnly : favoritesOnly
      const sim = opts.similarTo !== undefined ? opts.similarTo : similarTo
      setLoading(true)
      setError('')
      try {
        let pageItems = []
        let count = 0
        if (sim) {
          // Visual similarity to a chosen image.
          const data = await api.similar({ id: sim, page: p, limit: PAGE_SIZE })
          pageItems = data.items || []
          count = data.total || pageItems.length
        } else if (fav) {
          if (!favCacheRef.current) {
            const data = await api.favorites()
            favCacheRef.current = data.items || []
          }
          const all = favCacheRef.current
          count = all.length
          pageItems = all.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
        } else {
          const data = await api.history({ search: s, page: p, limit: PAGE_SIZE })
          pageItems = data.items || []
          count = data.total || pageItems.length
        }
        setItems(pageItems)
        setTotal(count)
        setPage(p)
        return pageItems
      } catch (e) {
        setItems([])
        setTotal(0)
        setError(e.message || 'Request failed')
        return []
      } finally {
        setLoading(false)
      }
    },
    [search, favoritesOnly, similarTo]
  )

  // Reset to page 1 (after generate, search change, or favorites toggle).
  const reload = useCallback(
    async (opts = {}) => {
      if (opts.favoritesOnly !== undefined || opts.search !== undefined) favCacheRef.current = null
      setSimilarTo(null)
      return fetchPage(1, { ...opts, similarTo: null })
    },
    [fetchPage]
  )

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const goToPage = useCallback(
    (p) => {
      const clamped = Math.min(Math.max(1, p), Math.max(1, Math.ceil(total / PAGE_SIZE)))
      if (clamped === page || loading) return
      fetchPage(clamped)
    },
    [fetchPage, page, total, loading]
  )

  const findSimilar = useCallback((id) => { setSimilarTo(id); fetchPage(1, { similarTo: id }) }, [fetchPage])
  const clearSimilar = useCallback(() => { setSimilarTo(null); fetchPage(1, { similarTo: null }) }, [fetchPage])

  return {
    items, search, setSearch, favoritesOnly, setFavoritesOnly,
    similarTo, findSimilar, clearSimilar,
    page, total, totalPages, loading, error, reload, goToPage
  }
}
