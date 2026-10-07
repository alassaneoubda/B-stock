'use client'

import { useEffect, useState } from 'react'

/**
 * Valeur retardée : évite une requête à chaque frappe dans les champs de recherche.
 *   const debouncedSearch = useDebouncedValue(search, 300)
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
