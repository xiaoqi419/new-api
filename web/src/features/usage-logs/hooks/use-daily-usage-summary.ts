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
import { useQuery } from '@tanstack/react-query'
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
import { useCallback, useEffect, useState } from 'react'

import { useAuthStore } from '@/stores/auth-store'

import { getDailyUsage } from '../api'
import type { DailyUsageResponse, DailyUsageSummary } from '../types'

export interface LocalDayRange {
  startTimestamp: number
  endTimestamp: number
}

export function getLocalDayRange(date: Date = new Date()): LocalDayRange {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return {
    startTimestamp: Math.floor(start.getTime() / 1000),
    endTimestamp: Math.floor(end.getTime() / 1000),
  }
}

export function getDailyUsageQueryKey(
  userId: number,
  range: LocalDayRange
): readonly [string, number, number, number] {
  return [
    'daily-usage-summary',
    userId,
    range.startTimestamp,
    range.endTimestamp,
  ]
}

function getNextMidnightDelay(): number {
  const now = new Date()
  const nextMidnight = new Date(now)
  nextMidnight.setHours(24, 0, 0, 0)
  return Math.max(1000, nextMidnight.getTime() - now.getTime())
}

export function useDailyUsageSummary() {
  const userId = useAuthStore((state) => state.auth.user?.id)
  const [range, setRange] = useState(getLocalDayRange)

  useEffect(() => {
    let timeout: number | undefined
    const scheduleNextDay = () => {
      timeout = window.setTimeout(() => {
        setRange(getLocalDayRange())
        scheduleNextDay()
      }, getNextMidnightDelay())
    }
    scheduleNextDay()

    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout)
    }
  }, [])

  const syncRange = useCallback(() => {
    setRange((current) => {
      const next = getLocalDayRange()
      return current.startTimestamp === next.startTimestamp &&
        current.endTimestamp === next.endTimestamp
        ? current
        : next
    })
  }, [])

  useEffect(() => {
    window.addEventListener('focus', syncRange)
    document.addEventListener('visibilitychange', syncRange)
    return () => {
      window.removeEventListener('focus', syncRange)
      document.removeEventListener('visibilitychange', syncRange)
    }
  }, [syncRange])

  return useQuery<DailyUsageSummary | null, Error>({
    queryKey: userId
      ? getDailyUsageQueryKey(userId, range)
      : ['daily-usage-summary', null],
    queryFn: async () => {
      if (!userId) return null
      const response: DailyUsageResponse = await getDailyUsage({
        start_timestamp: range.startTimestamp,
        end_timestamp: range.endTimestamp,
      })
      if (!response.success) {
        throw new Error(response.message || 'Daily usage unavailable')
      }
      return response.data ?? null
    },
    enabled: userId != null,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  })
}
