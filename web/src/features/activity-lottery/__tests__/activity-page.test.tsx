import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
*/
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { getActivityLotteryRounds, getCurrentActivityLottery } from '../api'
import { ActivityLotteryPage } from '../index'
import type { ActivityLotteryCampaign } from '../types'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getActivityLotteryRounds: vi.fn(),
  getCurrentActivityLottery: vi.fn(),
}))

function renderPage() {
  const root = createRootRoute({ component: Outlet })
  const page = createRoute({
    getParentRoute: () => root,
    path: '/activity-lottery',
    component: ActivityLotteryPage,
  })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/activity-lottery/$id',
    component: () => null,
  })
  const wallet = createRoute({
    getParentRoute: () => root,
    path: '/finance/wallet',
    component: () => null,
  })
  const router = createRouter({
    routeTree: root.addChildren([page, detail, wallet]),
    history: createMemoryHistory({ initialEntries: ['/activity-lottery'] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  vi.mocked(getCurrentActivityLottery).mockResolvedValue(null)
  vi.mocked(getActivityLotteryRounds).mockResolvedValue({
    page: 1,
    page_size: 10,
    total: 0,
    items: [],
  })
})

test('when no campaign has been published, users see a clear empty state', async () => {
  renderPage()

  expect(
    await screen.findByText('No recharge lottery has been published yet')
  ).toBeVisible()
})

test('a completed round remains reachable from the activity history', async () => {
  const campaign: ActivityLotteryCampaign = {
    id: 7,
    title: '十月充值活动',
    description: '',
    status: 'drawn',
    published_at: 1_780_000_000,
    qualification_start_at: 1_780_000_000,
    qualification_end_at: 1_780_086_400,
    draw_at: Date.parse('2026-10-07T16:00:00Z') / 1000,
    min_participants: 29,
    participant_count: 42,
    usd_exchange_rate: 7.3,
    quota_per_unit: 500000,
    drawn_at: Date.parse('2026-10-07T16:00:00Z') / 1000,
    created_at: 1_780_000_000,
    updated_at: 1_780_000_000,
    prizes: [
      {
        id: 1,
        campaign_id: 7,
        position: 1,
        name: '一等奖',
        count: 1,
        amount_cents: 50_000,
        quota: 34_246_575,
      },
    ],
  }
  vi.mocked(getActivityLotteryRounds).mockResolvedValue({
    page: 1,
    page_size: 10,
    total: 1,
    items: [campaign],
  })

  renderPage()

  const link = await screen.findByRole('link', { name: '十月充值活动' })
  expect(link).toHaveAttribute('href', '/activity-lottery/7')
  expect(screen.getByText('2026-10-07 24:00')).toBeVisible()
})
