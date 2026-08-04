// Hook that loads the list of available LoRAs from the backend.

import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'

// LoRA list + whether the current workflow supports them.
export function useLoras(workflowSupportsLora) {
  const [items, setItems] = useState([])

  const reload = useCallback(async () => {
    if (!workflowSupportsLora) { setItems([]); return }
    try {
      const data = await api.loras()
      setItems(data.items || [])
    } catch {
      setItems([])
    }
  }, [workflowSupportsLora])

  useEffect(() => { reload() }, [reload])
  return { items, reload, supported: !!workflowSupportsLora }
}
