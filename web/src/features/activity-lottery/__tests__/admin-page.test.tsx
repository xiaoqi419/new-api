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
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

import { ActivityLotteryAdmin } from '../admin'
import {
  adminExportActivityLotteryWinners,
  adminGetActivityLotteryRounds,
  adminPublishActivityLotteryRound,
} from '../api'
import type { ActivityLotteryCampaign } from '../types'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  adminGetActivityLotteryRounds: vi.fn(),
  adminPublishActivityLotteryRound: vi.fn(),
  adminExportActivityLotteryWinners: vi.fn(),
}))

const campaign: ActivityLotteryCampaign = {
  id: 7,
  title: '十月充值抽奖',
  description: '',
  status: 'draft',
  published_at: 0,
  qualification_start_at: Date.parse('2026-09-27T16:00:00Z') / 1000,
  qualification_end_at: 0,
  draw_at: Date.parse('2026-10-07T16:00:00Z') / 1000,
  min_participants: 29,
  participant_count: 0,
  usd_exchange_rate: 0,
  quota_per_unit: 0,
  drawn_at: 0,
  created_at: 0,
  updated_at: 0,
  prizes: [
    {
      id: 1,
      campaign_id: 7,
      position: 1,
      name: '一等奖',
      count: 1,
      amount_cents: 50_000,
      quota: 0,
    },
    {
      id: 2,
      campaign_id: 7,
      position: 2,
      name: '二等奖',
      count: 3,
      amount_cents: 20_000,
      quota: 0,
    },
    {
      id: 3,
      campaign_id: 7,
      position: 3,
      name: '三等奖',
      count: 5,
      amount_cents: 5_000,
      quota: 0,
    },
    {
      id: 4,
      campaign_id: 7,
      position: 4,
      name: '四等奖',
      count: 20,
      amount_cents: 1_000,
      quota: 0,
    },
  ],
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-28T07:30:00Z'))
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(
    () => undefined
  )
  vi.mocked(adminGetActivityLotteryRounds).mockResolvedValue({
    page: 1,
    page_size: 10,
    total: 1,
    items: [campaign],
  })
  vi.mocked(adminPublishActivityLotteryRound).mockResolvedValue({
    ...campaign,
    status: 'open',
  })
})

test('publishing a draft requires explicit confirmation of the locked prize pool', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ActivityLotteryAdmin />
    </QueryClientProvider>
  )

  expect(await screen.findByText('Participants')).toBeVisible()
  expect(screen.queryByText('Qualified accounts')).not.toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: 'Publish' }))
  expect(adminPublishActivityLotteryRound).not.toHaveBeenCalled()

  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).getByText('Start date: 2026-09-28')).toBeVisible()
  expect(within(dialog).getByText('Draw time: 2026-10-07 24:00')).toBeVisible()
  expect(within(dialog).getByText('Prize slots: 29')).toBeVisible()
  expect(within(dialog).getByText('Total prize pool: ¥1,550')).toBeVisible()
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Confirm publication' })
  )

  await waitFor(() =>
    expect(adminPublishActivityLotteryRound).toHaveBeenCalledWith(7)
  )
})

test('an empty management page opens the create-draft drawer', async () => {
  vi.mocked(adminGetActivityLotteryRounds).mockResolvedValue({
    page: 1,
    page_size: 10,
    total: 0,
    items: [],
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ActivityLotteryAdmin />
    </QueryClientProvider>
  )

  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: 'Create activity' }))

  expect(
    await screen.findByRole('dialog', { name: 'Create recharge lottery' })
  ).toBeVisible()
})

test('a drawn campaign exposes a one-click winner CSV export', async () => {
  vi.mocked(adminGetActivityLotteryRounds).mockResolvedValue({
    page: 1,
    page_size: 10,
    total: 1,
    items: [
      { ...campaign, status: 'drawn', published_at: campaign.created_at + 1 },
    ],
  })
  vi.mocked(adminExportActivityLotteryWinners).mockResolvedValue()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ActivityLotteryAdmin />
    </QueryClientProvider>
  )

  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: 'Export winner list' }))

  await waitFor(() =>
    expect(adminExportActivityLotteryWinners).toHaveBeenCalledWith(7)
  )
})
