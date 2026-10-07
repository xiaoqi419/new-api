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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { ActivityLotteryView } from '../../types'
import { ActivityLotteryBoard } from '../activity-board'

const qualificationStart = Date.parse('2026-09-27T16:00:00Z') / 1000
const drawAt = Date.parse('2026-10-07T16:00:00Z') / 1000

function viewFixture(
  status: ActivityLotteryView['campaign']['status']
): ActivityLotteryView {
  return {
    campaign: {
      id: 1,
      title: '充值抽奖',
      description: '发布当天成功充值即可参与',
      status,
      published_at: qualificationStart + 3600,
      qualification_start_at: qualificationStart,
      qualification_end_at: drawAt,
      draw_at: drawAt,
      min_participants: 29,
    designated_user_id: 0,
      participant_count: 0,
      usd_exchange_rate: 7.3,
      quota_per_unit: 500000,
      display_currency: 'CNY',
      display_currency_symbol: '¥',
      display_currency_rate: 7.3,
      drawn_at: status === 'drawn' ? drawAt : 0,
      created_at: qualificationStart,
      updated_at: qualificationStart,
      prizes: [
        {
          id: 1,
          campaign_id: 1,
          position: 1,
          name: '一等奖',
          count: 1,
          amount_cents: 50_000,
          quota: 34_246_575,
          designated_user_id: 0,
        },
        {
          id: 2,
          campaign_id: 1,
          position: 2,
          name: '二等奖',
          count: 3,
          amount_cents: 20_000,
          quota: 13_698_630,
          designated_user_id: 0,
        },
      ],
    },
    participant_count: 2,
    joined: false,
    winners: [],
    server_time: qualificationStart + 7200,
  }
}

function renderBoard(view: ActivityLotteryView) {
  const root = createRootRoute({ component: Outlet })
  const activity = createRoute({
    getParentRoute: () => root,
    path: '/activity-lottery',
    component: () => <ActivityLotteryBoard view={view} />,
  })
  const wallet = createRoute({
    getParentRoute: () => root,
    path: '/finance/wallet',
    component: () => null,
  })
  const router = createRouter({
    routeTree: root.addChildren([activity, wallet]),
    history: createMemoryHistory({ initialEntries: ['/activity-lottery'] }),
  })
  render(<RouterProvider router={router} />)
}

describe('activity lottery board', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })

  test('open campaign shows prize tiers, draw time, and recharge path while entry is open', async () => {
    renderBoard(viewFixture('open'))

    expect(
      await screen.findByRole('heading', { name: '充值抽奖', level: 2 })
    ).toBeVisible()
    expect(screen.getByText('2026-10-07 24:00')).toBeVisible()
    expect(
      screen.getByText(
        'Participation window: 2026-09-28 00:00 – 2026-10-07 24:00'
      )
    ).toBeVisible()
    expect(screen.getByRole('timer')).toHaveClass(
      'text-foreground',
      'bg-background/85'
    )
    expect(screen.getByText('Participants')).toBeVisible()
    expect(screen.queryByText('Qualified accounts')).not.toBeInTheDocument()
    expect(screen.getByText('一等奖')).toBeVisible()
    expect(screen.getByText('二等奖')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Go to wallet' })
    ).toHaveAttribute('href', '/finance/wallet')
  })

  test('a future start date does not invite wallet top-ups before the participation window', async () => {
    const view = viewFixture('open')
    view.server_time = qualificationStart - 1
    renderBoard(view)

    expect(
      await screen.findByText('Participation has not started yet')
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Go to wallet' })
    ).not.toBeInTheDocument()
  })

  test('drawn campaign shows the signed-in winner their credited activity gift', async () => {
    const view = viewFixture('drawn')
    view.joined = true
    view.server_time = drawAt + 1
    view.participant_count = 29
    view.winners = [
      { id: 1, masked_name: '中***者', name: '一等奖', amount_cents: 50_000 },
    ]
    view.my_prize = {
      name: '一等奖',
      amount_cents: 50_000,
      quota: 34_246_575,
      granted_at: drawAt,
      granted: true,
    }
    renderBoard(view)

    expect(
      await screen.findByText(
        'The prize has been credited automatically as an activity gift.'
      )
    ).toBeVisible()
    expect(screen.getByText('Activity gift credited')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Winners' })).toBeVisible()
    expect(screen.getByText('中***者')).toBeVisible()
    expect(screen.getAllByText('一等奖 · ¥500')).toHaveLength(2)
    expect(
      screen.queryByRole('button', { name: 'Go to wallet' })
    ).not.toBeInTheDocument()
  })

  test('published USD campaigns display dollar prizes', async () => {
    const view = viewFixture('drawn')
    view.campaign.display_currency = 'USD'
    view.campaign.display_currency_symbol = '$'
    view.campaign.display_currency_rate = 1
    view.winners = [
      { id: 1, masked_name: '中***者', name: '一等奖', amount_cents: 50_000 },
    ]
    renderBoard(view)

    expect(await screen.findByText('一等奖 · $500')).toBeVisible()
    expect(screen.queryByText('一等奖 · ¥500')).not.toBeInTheDocument()
  })

  test('a canceled published campaign clearly states that prizes will not be issued', async () => {
    const view = viewFixture('canceled')
    renderBoard(view)

    expect(
      await screen.findByText(
        'This campaign was canceled; no prizes were issued.'
      )
    ).toBeVisible()
  })
})
