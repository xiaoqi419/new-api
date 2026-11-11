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
import { describe, expect, test } from 'vitest'

import { rechargeDiscount } from './recharge-discount'

describe('threshold recharge discount', () => {
  const campaign = {
    mode: 'discount' as const,
    tiers: [
      { pay: 500, discount: 0.8 },
      { pay: 100, discount: 0.9 },
    ],
  }
  test.each([
    [99, 1],
    [100, 0.9],
    [101, 0.9],
    [300, 0.9],
    [499, 0.9],
    [500, 0.8],
    [501, 0.8],
    [1000, 0.8],
  ])('amount %s uses %s', (amount, rate) => {
    expect(rechargeDiscount(amount, campaign, { [amount]: 0.5 })).toBe(rate)
  })
  test('gift and inactive campaigns retain legacy preset pricing', () => {
    expect(rechargeDiscount(100, undefined, { 100: 0.95 })).toBe(0.95)
    expect(
      rechargeDiscount(
        100,
        { mode: 'gift', tiers: [{ pay: 100, gift: 10 }] },
        { 100: 0.95 }
      )
    ).toBe(0.95)
  })
})
