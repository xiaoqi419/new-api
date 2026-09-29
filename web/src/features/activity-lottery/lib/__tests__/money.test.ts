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
import { expect, test } from 'vitest'

import {
  activityLotteryCurrencyFromConfig,
  formatActivityPrizeAmount,
  parseActivityPrizeAmount,
} from '../money'

test('prize amounts use the configured USD display currency', () => {
  const currency = activityLotteryCurrencyFromConfig({
    displayInCurrency: true,
    quotaDisplayType: 'USD',
    quotaPerUnit: 500_000,
    usdExchangeRate: 7.3,
    customCurrencySymbol: '¤',
    customCurrencyExchangeRate: 1,
  })
  expect(formatActivityPrizeAmount(50_000, currency, 'zh-CN')).toBe('$500')
  expect(formatActivityPrizeAmount(155_000, currency, 'zh-CN')).toBe('$1,550')
})

test('entered currency amounts convert to exact minor units without floating-point rounding', () => {
  const currency = activityLotteryCurrencyFromConfig({
    displayInCurrency: true,
    quotaDisplayType: 'CNY',
    quotaPerUnit: 500_000,
    usdExchangeRate: 7.3,
    customCurrencySymbol: '¤',
    customCurrencyExchangeRate: 1,
  })
  expect(parseActivityPrizeAmount('500', currency)).toBe(50_000)
  expect(parseActivityPrizeAmount('0.01', currency)).toBe(1)
  expect(parseActivityPrizeAmount('20.50', currency)).toBe(2050)
  expect(parseActivityPrizeAmount('20.001', currency)).toBeNull()
  expect(parseActivityPrizeAmount('100000.01', currency)).toBeNull()
})

test('token mode accepts raw quota units and does not add a currency symbol', () => {
  const currency = activityLotteryCurrencyFromConfig({
    displayInCurrency: false,
    quotaDisplayType: 'TOKENS',
    quotaPerUnit: 500_000,
    usdExchangeRate: 7.3,
    customCurrencySymbol: '¤',
    customCurrencyExchangeRate: 1,
  })
  expect(parseActivityPrizeAmount('1234', currency)).toBe(1234)
  expect(parseActivityPrizeAmount('12.34', currency)).toBeNull()
  expect(formatActivityPrizeAmount(1234, currency, 'en-US')).toBe('1,234')
})
