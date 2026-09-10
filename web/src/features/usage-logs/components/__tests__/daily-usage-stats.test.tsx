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
import { act, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import { useAuthStore, type AuthUser } from '@/stores/auth-store'

import { getDailyUsage } from '../../api'
import { DailyUsageStats } from '../daily-usage-stats'
import { UsageLogsProvider, useUsageLogsContext } from '../usage-logs-provider'

vi.mock('../../api', () => ({
  getDailyUsage: vi.fn(),
}))

const authenticatedUser: AuthUser = {
  id: 101,
  username: 'daily-summary-user',
  role: 1,
}

function PrivacyMaskButton() {
  const { sensitiveVisible, setSensitiveVisible } = useUsageLogsContext()

  return (
    <button
      type='button'
      onClick={() => setSensitiveVisible(!sensitiveVisible)}
    >
      Toggle privacy
    </button>
  )
}

function renderDailyUsageStats(): { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  const Wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <UsageLogsProvider>{props.children}</UsageLogsProvider>
    </QueryClientProvider>
  )

  render(
    <Wrapper>
      <DailyUsageStats />
      <PrivacyMaskButton />
    </Wrapper>
  )

  return { queryClient }
}

describe('daily usage stats', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      'Cache Rate': 'Cache Rate',
      'Total Usage': 'Total Usage',
    })
  })

  afterEach(() => {
    useAuthStore.getState().auth.reset()
  })

  test('shows formatted total tokens and the weighted cache rate for the logged-in user', async () => {
    useAuthStore.getState().auth.setUser(authenticatedUser)
    vi.mocked(getDailyUsage).mockResolvedValue({
      success: true,
      data: {
        input_tokens: 400000,
        cache_read_tokens: 100000,
        cache_rate: 0.25,
        total_tokens: 1250000,
      },
    })

    renderDailyUsageStats()

    expect(await screen.findByText('1.25M')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('Total Usage')).toBeInTheDocument()
    expect(screen.getByText('Cache Rate')).toBeInTheDocument()
    await waitFor(() => expect(getDailyUsage).toHaveBeenCalledTimes(1))
  })

  test('places cache rate before total usage in the stats sequence', async () => {
    useAuthStore.getState().auth.setUser(authenticatedUser)
    vi.mocked(getDailyUsage).mockResolvedValue({
      success: true,
      data: {
        input_tokens: 400000,
        cache_read_tokens: 100000,
        cache_rate: 0.25,
        total_tokens: 1250000,
      },
    })

    renderDailyUsageStats()

    const cacheRateLabel = await screen.findByText('Cache Rate')
    const totalUsageLabel = screen.getByText('Total Usage')
    expect(
      cacheRateLabel.compareDocumentPosition(totalUsageLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
  })

  test('uses an unavailable value instead of zero after a daily summary fetch failure', async () => {
    useAuthStore.getState().auth.setUser(authenticatedUser)
    vi.mocked(getDailyUsage).mockRejectedValue(new Error('network unavailable'))

    renderDailyUsageStats()

    expect(await screen.findAllByText('--')).toHaveLength(2)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  test('masks daily token values when privacy mode is enabled', async () => {
    useAuthStore.getState().auth.setUser(authenticatedUser)
    vi.mocked(getDailyUsage).mockResolvedValue({
      success: true,
      data: {
        input_tokens: 400000,
        cache_read_tokens: 100000,
        cache_rate: 0.25,
        total_tokens: 1250000,
      },
    })

    renderDailyUsageStats()
    expect(await screen.findByText('1.25M')).toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: 'Toggle privacy' }).click()
    })

    expect(screen.getAllByText('••••')).toHaveLength(2)
    expect(screen.queryByText('1.25M')).not.toBeInTheDocument()
    expect(screen.queryByText('25%')).not.toBeInTheDocument()
  })
})
