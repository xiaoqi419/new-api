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

import { formatActivityPrizeYuan, parseActivityPrizeYuan } from '../money'

test('prize budget uses fixed yuan amounts independent of the site display currency', () => {
  expect(formatActivityPrizeYuan(50_000, 'zh-CN')).toBe('¥500')
  expect(formatActivityPrizeYuan(155_000, 'zh-CN')).toBe('¥1,550')
})

test('entered yuan amounts convert to exact cents without floating-point rounding', () => {
  expect(parseActivityPrizeYuan('500')).toBe(50_000)
  expect(parseActivityPrizeYuan('0.01')).toBe(1)
  expect(parseActivityPrizeYuan('20.50')).toBe(2050)
  expect(parseActivityPrizeYuan('20.001')).toBeNull()
  expect(parseActivityPrizeYuan('100000.01')).toBeNull()
})
