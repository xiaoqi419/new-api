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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { adminUpdateActivityLotteryRound } from '../../api'
import type { ActivityLotteryCampaign } from '../../types'
import { ActivityLotteryDraftDrawer } from '../draft-drawer'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  adminUpdateActivityLotteryRound: vi.fn(),
}))

const drawAt = Date.parse('2026-10-07T16:00:00Z') / 1000
const campaign: ActivityLotteryCampaign = {
  id: 7,
  title: '充值抽奖',
  description: '今日充值自动参与',
  status: 'draft',
  published_at: 0,
  qualification_start_at: Date.parse('2026-09-27T16:00:00Z') / 1000,
  qualification_end_at: 0,
  draw_at: drawAt,
  min_participants: 29,
  designated_user_id: 0,
  participant_count: 0,
  usd_exchange_rate: 0,
  quota_per_unit: 0,
  display_currency: 'CNY',
  display_currency_symbol: '¥',
  display_currency_rate: 7.3,
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
      designated_user_id: 0,
    },
    {
      id: 2,
      campaign_id: 7,
      position: 2,
      name: '二等奖',
      count: 3,
      amount_cents: 20_000,
      quota: 0,
      designated_user_id: 0,
    },
    {
      id: 3,
      campaign_id: 7,
      position: 3,
      name: '三等奖',
      count: 5,
      amount_cents: 5_000,
      quota: 0,
      designated_user_id: 0,
    },
    {
      id: 4,
      campaign_id: 7,
      position: 4,
      name: '四等奖',
      count: 20,
      amount_cents: 1_000,
      quota: 0,
      designated_user_id: 0,
    },
  ],
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-07T07:30:00Z'))
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(
    () => undefined
  )
  vi.mocked(adminUpdateActivityLotteryRound).mockResolvedValue(campaign)
})

test('editing a legacy draft previews 29 winners and its CNY prize pool before saving exact prize amounts', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ActivityLotteryDraftDrawer
        open
        onOpenChange={vi.fn()}
        campaign={campaign}
      />
    </QueryClientProvider>
  )

  expect(await screen.findByText('29')).toBeVisible()
  expect(screen.getByText('¥1,550')).toBeVisible()
  expect(
    screen.getByLabelText('Participation start date (Beijing time)')
  ).toHaveValue('2026-09-28')
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

  await waitFor(() => {
    expect(adminUpdateActivityLotteryRound).toHaveBeenCalledWith(7, {
      title: '充值抽奖',
      description: '今日充值自动参与',
      qualification_start_at: Date.parse('2026-09-27T16:00:00Z') / 1000,
      draw_at: drawAt,
      min_participants: 29,
      designated_user_id: 0,
      prizes: [
        { name: '一等奖', count: 1, amount_cents: 50_000, designated_user_id: 0 },
        { name: '二等奖', count: 3, amount_cents: 20_000, designated_user_id: 0 },
        { name: '三等奖', count: 5, amount_cents: 5_000, designated_user_id: 0 },
        { name: '四等奖', count: 20, amount_cents: 1_000, designated_user_id: 0 },
      ],
    })
  })
})

test('editing a USD draft labels and previews the prize pool in dollars', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ActivityLotteryDraftDrawer
        open
        onOpenChange={vi.fn()}
        campaign={{
          ...campaign,
          display_currency: 'USD',
          display_currency_symbol: '$',
          display_currency_rate: 1,
        }}
      />
    </QueryClientProvider>
  )

  const amountInputs = await screen.findAllByLabelText(
    'Amount per winner (USD)'
  )
  expect(amountInputs).toHaveLength(4)
  expect(amountInputs[0]).toBeVisible()
  expect(screen.getByText('$1,550')).toBeVisible()
})

test('every prize tier has its own designated winner field, blank by default', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ActivityLotteryDraftDrawer
        open
        onOpenChange={vi.fn()}
        campaign={campaign}
      />
    </QueryClientProvider>
  )

  const inputs = await screen.findAllByLabelText('Designated winner user ID')
  expect(inputs).toHaveLength(campaign.prizes.length)
  expect(inputs[0]).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

  await waitFor(() => {
    expect(adminUpdateActivityLotteryRound).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        designated_user_id: 0,
        prizes: expect.arrayContaining([
          expect.objectContaining({ designated_user_id: 0 }),
        ]),
      })
    )
  })
})

test('a per-tier designated winner is echoed back and submitted as a number', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ActivityLotteryDraftDrawer
        open
        onOpenChange={vi.fn()}
        campaign={{
          ...campaign,
          prizes: campaign.prizes.map((prize, index) =>
            index === 0 ? { ...prize, designated_user_id: 42 } : prize
          ),
        }}
      />
    </QueryClientProvider>
  )

  const inputs = await screen.findAllByLabelText('Designated winner user ID')
  expect(inputs[0]).toHaveValue('42')
  expect(inputs[1]).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

  await waitFor(() => {
    expect(adminUpdateActivityLotteryRound).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        prizes: expect.arrayContaining([
          expect.objectContaining({
            name: '一等奖',
            designated_user_id: 42,
          }),
        ]),
      })
    )
  })
})

test('a non-numeric per-tier designated winner is rejected before saving', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ActivityLotteryDraftDrawer
        open
        onOpenChange={vi.fn()}
        campaign={campaign}
      />
    </QueryClientProvider>
  )

  const inputs = await screen.findAllByLabelText('Designated winner user ID')
  fireEvent.change(inputs[0], { target: { value: 'abc' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

  expect(
    await screen.findByText('Enter a positive numeric user ID')
  ).toBeVisible()
  expect(adminUpdateActivityLotteryRound).not.toHaveBeenCalled()
})

test('the same account cannot be designated on two prize tiers', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ActivityLotteryDraftDrawer
        open
        onOpenChange={vi.fn()}
        campaign={campaign}
      />
    </QueryClientProvider>
  )

  const inputs = await screen.findAllByLabelText('Designated winner user ID')
  fireEvent.change(inputs[0], { target: { value: '42' } })
  fireEvent.change(inputs[1], { target: { value: '42' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

  expect(
    await screen.findByText(
      'The same account cannot be designated for more than one prize tier'
    )
  ).toBeVisible()
  expect(adminUpdateActivityLotteryRound).not.toHaveBeenCalled()
})
