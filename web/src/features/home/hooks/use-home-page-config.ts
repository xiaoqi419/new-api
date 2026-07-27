/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useState } from 'react'

import { getHomePageConfig } from '../api'
import type { HomePageConfig, HomePageConfigResult } from '../types'

const STORAGE_KEY = 'home_page_config'

function parseConfig(raw: string | null | undefined): HomePageConfig {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return parsed as HomePageConfig
    }
  } catch {
    // Ignore malformed cache/response; fall back to built-in defaults.
  }
  return {}
}

/**
 * Loads the structured home page config (active template + per-template
 * content). Falls back silently to an empty config (built-in defaults) on any
 * error, and warms from localStorage for immediate first paint.
 */
export function useHomePageConfig(): HomePageConfigResult {
  const [config, setConfig] = useState<HomePageConfig>({})
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      const cached = localStorage.getItem(STORAGE_KEY)
      if (cached && mounted) {
        setConfig(parseConfig(cached))
      }

      try {
        const response = await getHomePageConfig()
        if (!mounted) return
        const { success, data } = response
        if (success && data) {
          setConfig(parseConfig(data))
          localStorage.setItem(STORAGE_KEY, data)
        } else {
          setConfig({})
          localStorage.removeItem(STORAGE_KEY)
        }
      } catch {
        // Non-fatal: keep whatever we have and render built-in defaults.
      } finally {
        if (mounted) setIsLoaded(true)
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [])

  return { config, isLoaded }
}
