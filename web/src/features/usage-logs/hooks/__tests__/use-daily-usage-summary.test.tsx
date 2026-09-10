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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { useAuthStore, type AuthUser } from '@/stores/auth-store'

import { getDailyUsage } from '../../api'
import {
  getDailyUsageQueryKey,
  getLocalDayRange,
  useDailyUsageSummary,
} from '../use-daily-usage-summary'

vi.mock('../../api', () => ({
  getDailyUsage: vi.fn(),
}))

const authenticatedUser: AuthUser = {
  id: 101,
  username: 'daily-summary-user',
  role: 1,
}

function DailyUsageHarness() {
  useDailyUsageSummary()
  return null
}

function renderDailyUsageHook(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  })
  const Wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {props.children}
    </QueryClientProvider>
  )

  return render(<DailyUsageHarness />, { wrapper: Wrapper })
}

describe('daily usage summary range and cache identity', () => {
  afterEach(() => {
    useAuthStore.getState().auth.reset()
    vi.useRealTimers()
  })

  test('uses the browser-local current day through the following local midnight', () => {
    const range = getLocalDayRange(new Date(2026, 8, 10, 15, 30, 45))
    const start = new Date(range.startTimestamp * 1000)
    const end = new Date(range.endTimestamp * 1000)

    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
    expect(end.getHours()).toBe(0)
    expect(end.getMinutes()).toBe(0)
    expect(end.getSeconds()).toBe(0)
    expect(end.getDate()).toBe(start.getDate() + 1)

    const dayLengthHours = (end.getTime() - start.getTime()) / (60 * 60 * 1000)
    expect(dayLengthHours).toBeGreaterThanOrEqual(23)
    expect(dayLengthHours).toBeLessThanOrEqual(25)
  })

  test('partitions daily summary cache entries by authenticated user and local day', () => {
    const today = getLocalDayRange(new Date(2026, 8, 10, 15, 30))
    const tomorrow = getLocalDayRange(new Date(2026, 8, 11, 15, 30))

    expect(getDailyUsageQueryKey(101, today)).toEqual([
      'daily-usage-summary',
      101,
      today.startTimestamp,
      today.endTimestamp,
    ])
    expect(getDailyUsageQueryKey(202, today)).not.toEqual(
      getDailyUsageQueryKey(101, today)
    )
    expect(getDailyUsageQueryKey(101, tomorrow)).not.toEqual(
      getDailyUsageQueryKey(101, today)
    )
  })

  test('uses a fresh day range when the page regains focus after local midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 10, 23, 59))
    useAuthStore.getState().auth.setUser(authenticatedUser)
    vi.mocked(getDailyUsage).mockResolvedValue({
      success: true,
      data: {
        input_tokens: 0,
        total_tokens: 0,
        cache_read_tokens: 0,
        cache_rate: null,
      },
    })

    renderDailyUsageHook()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getDailyUsage).toHaveBeenCalledTimes(1)
    expect(vi.mocked(getDailyUsage).mock.calls[0]?.[0]).toMatchObject({
      start_timestamp: getLocalDayRange(new Date(2026, 8, 10, 23, 59))
        .startTimestamp,
    })

    vi.setSystemTime(new Date(2026, 8, 11, 0, 1))
    act(() => window.dispatchEvent(new Event('focus')))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getDailyUsage).toHaveBeenCalledTimes(2)
    expect(vi.mocked(getDailyUsage).mock.calls[1]?.[0]).toMatchObject({
      start_timestamp: getLocalDayRange(new Date(2026, 8, 11, 0, 1))
        .startTimestamp,
    })
  })

  test('stops refreshing the summary when the component unmounts', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 10, 23, 59))
    useAuthStore.getState().auth.setUser(authenticatedUser)
    vi.mocked(getDailyUsage).mockResolvedValue({
      success: true,
      data: {
        input_tokens: 0,
        total_tokens: 0,
        cache_read_tokens: 0,
        cache_rate: null,
      },
    })

    const rendered = renderDailyUsageHook()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getDailyUsage).toHaveBeenCalledTimes(1)
    rendered.unmount()

    await act(async () => {
      vi.advanceTimersByTime(2 * 60 * 1000)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getDailyUsage).toHaveBeenCalledTimes(1)
  })
})
