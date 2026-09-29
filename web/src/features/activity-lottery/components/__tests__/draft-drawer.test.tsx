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
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-07T07:30:00Z'))
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(
    () => undefined
  )
  vi.mocked(adminUpdateActivityLotteryRound).mockResolvedValue(campaign)
})

test('editing a draft previews 29 winners and ¥1,550 before saving exact prize amounts', async () => {
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
      prizes: [
        { name: '一等奖', count: 1, amount_cents: 50_000 },
        { name: '二等奖', count: 3, amount_cents: 20_000 },
        { name: '三等奖', count: 5, amount_cents: 5_000 },
        { name: '四等奖', count: 20, amount_cents: 1_000 },
      ],
    })
  })
})
