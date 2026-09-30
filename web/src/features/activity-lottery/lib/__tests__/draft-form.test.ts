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
import i18next from 'i18next'
import { expect, test } from 'vitest'

import {
  getActivityLotteryDraftSchema,
  toActivityLotteryDraftInput,
} from '../draft-form'
import { activityLotteryCurrencyFromConfig } from '../money'

const publishedAt = Date.parse('2026-09-29T04:00:00Z') / 1000
const validDraft = {
  title: '充值抽奖',
  description: '今日成功充值自动参与',
  startDateLocal: '2026-09-28',
  drawAtLocal: '2026-10-08T00:00',
  minParticipants: '',
  designatedUserId: '',
  prizes: [
    { name: '一等奖', count: '1', amountDisplay: '500' },
    { name: '二等奖', count: '3', amountDisplay: '200' },
    { name: '三等奖', count: '5', amountDisplay: '50' },
    { name: '四等奖', count: '20', amountDisplay: '10' },
  ],
}

test('a prior Beijing start date and midnight draw map to the exact qualification window and prize budget', () => {
  const usd = activityLotteryCurrencyFromConfig({
    displayInCurrency: true,
    quotaDisplayType: 'USD',
    quotaPerUnit: 500_000,
    usdExchangeRate: 7.3,
    customCurrencySymbol: '¤',
    customCurrencyExchangeRate: 1,
  })
  const parsed = getActivityLotteryDraftSchema(
    i18next.t,
    usd,
    publishedAt
  ).safeParse(validDraft)
  expect(parsed.success).toBe(true)
  if (!parsed.success) return

  expect(toActivityLotteryDraftInput(parsed.data, usd)).toEqual({
    title: '充值抽奖',
    description: '今日成功充值自动参与',
    qualification_start_at: Date.parse('2026-09-27T16:00:00Z') / 1000,
    draw_at: Date.parse('2026-10-07T16:00:00Z') / 1000,
    min_participants: 0,
    designated_user_id: 0,
    prizes: [
      { name: '一等奖', count: 1, amount_cents: 50_000 },
      { name: '二等奖', count: 3, amount_cents: 20_000 },
      { name: '三等奖', count: 5, amount_cents: 5_000 },
      { name: '四等奖', count: 20, amount_cents: 1_000 },
    ],
  })
})

test('a blank designated winner stays zero while a valid ID is carried through', () => {
  const usd = activityLotteryCurrencyFromConfig({
    displayInCurrency: true,
    quotaDisplayType: 'USD',
    quotaPerUnit: 500_000,
    usdExchangeRate: 7.3,
    customCurrencySymbol: '¤',
    customCurrencyExchangeRate: 1,
  })
  const schema = getActivityLotteryDraftSchema(i18next.t, usd, publishedAt)

  const blank = schema.safeParse(validDraft)
  expect(blank.success).toBe(true)
  if (blank.success) {
    expect(
      toActivityLotteryDraftInput(blank.data, usd).designated_user_id
    ).toBe(0)
  }

  const assigned = schema.safeParse({
    ...validDraft,
    designatedUserId: '42',
  })
  expect(assigned.success).toBe(true)
  if (assigned.success) {
    expect(
      toActivityLotteryDraftInput(assigned.data, usd).designated_user_id
    ).toBe(42)
  }
})

test('a non-numeric designated winner is rejected', () => {
  const schema = getActivityLotteryDraftSchema(
    i18next.t,
    undefined,
    publishedAt
  )
  expect(
    schema.safeParse({ ...validDraft, designatedUserId: 'abc' }).success
  ).toBe(false)
  expect(
    schema.safeParse({ ...validDraft, designatedUserId: '0' }).success
  ).toBe(false)
  expect(
    schema.safeParse({ ...validDraft, designatedUserId: '-1' }).success
  ).toBe(false)
  expect(
    schema.safeParse({ ...validDraft, designatedUserId: '  7  ' }).success
  ).toBe(true)
})

test('invalid start dates, past draw times, and too few participants are rejected', () => {
  const schema = getActivityLotteryDraftSchema(
    i18next.t,
    undefined,
    publishedAt
  )
  expect(
    schema.safeParse({ ...validDraft, startDateLocal: '2026-02-30' }).success
  ).toBe(false)
  expect(
    schema.safeParse({ ...validDraft, startDateLocal: '2026-10-09' }).success
  ).toBe(false)
  expect(
    schema.safeParse({ ...validDraft, drawAtLocal: '2026-09-29T11:59' }).success
  ).toBe(false)
  expect(
    schema.safeParse({ ...validDraft, drawAtLocal: '2026-10-07T23:59' }).success
  ).toBe(true)
  expect(
    schema.safeParse({ ...validDraft, minParticipants: '28' }).success
  ).toBe(false)
  expect(
    schema.safeParse({ ...validDraft, minParticipants: '29' }).success
  ).toBe(true)
})
