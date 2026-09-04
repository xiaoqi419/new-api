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
import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  convertDisplayedQuotaBetweenSnapshots,
  quotaThresholdValueForSave,
} from '@/lib/quota-threshold'

const cnySnapshot = {
  quotaDisplayType: 'CNY',
  quotaPerUnit: 500_000,
  usdExchangeRate: 7.3,
  customCurrencyExchangeRate: 1,
} as const

const usdSnapshot = {
  ...cnySnapshot,
  quotaDisplayType: 'USD',
  usdExchangeRate: 1,
} as const

describe('low balance reminder threshold display conversion', () => {
  test('shows a saved USD threshold in the current CNY display unit', () => {
    const result = convertDisplayedQuotaBetweenSnapshots(
      1,
      usdSnapshot,
      cnySnapshot
    )

    assert.equal(result, 7.3)
  })

  test('preserves the normalized value when converting a saved CNY threshold to USD', () => {
    const result = convertDisplayedQuotaBetweenSnapshots(
      7.3,
      cnySnapshot,
      usdSnapshot
    )

    assert.equal(result, 1)
  })

  test('submits the persisted value when a converted personal threshold was not edited', () => {
    const displayed = convertDisplayedQuotaBetweenSnapshots(1, usdSnapshot, {
      ...cnySnapshot,
      usdExchangeRate: 7.25,
    })

    assert.equal(displayed, 7.25)
    assert.equal(quotaThresholdValueForSave(displayed, displayed, 1), 1)
  })

  test('does not let display conversion rounding lower the persisted quota', () => {
    const displayed = convertDisplayedQuotaBetweenSnapshots(1, usdSnapshot, {
      ...cnySnapshot,
      usdExchangeRate: 7.25,
    })

    assert.equal(displayed, 7.25)
    // Re-normalizing the converted display value with binary floating-point
    // arithmetic truncates to 499999; an untouched field must still submit 1.
    assert.equal(Math.trunc((displayed ?? 0) * (500_000 / 7.25)), 499_999)
    assert.equal(quotaThresholdValueForSave(displayed, displayed, 1), 1)
  })

  test('submits the displayed value when the personal threshold was edited', () => {
    assert.equal(quotaThresholdValueForSave(8, 7.25, 1), 8)
  })
})
