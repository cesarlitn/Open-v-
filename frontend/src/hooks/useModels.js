// Hook that loads the available checkpoints and the current generation status.

import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'

// Checkpoints list with refetch.
export function useModels() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.models()
      setItems(data.items || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])
  return { items, loading, reload }
}
