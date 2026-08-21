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

import { getDashboardChartColors } from '../charts'

const businessPalette = [
  '#1976d2',
  '#00838f',
  '#16835e',
  '#7e57c2',
  '#a16207',
  '#2563eb',
  '#0e7490',
  '#15803d',
  '#8b5cf6',
  '#b45309',
]

describe('dashboard chart palette', () => {
  test('uses business blue first and keeps ten distinct non-pink series', () => {
    expect(getDashboardChartColors(10)).toEqual(businessPalette)
    expect(new Set(getDashboardChartColors(10))).toHaveLength(10)
  })

  test('keeps the existing minimum, slicing, and cycling contracts', () => {
    expect(getDashboardChartColors(0)).toEqual([businessPalette[0]])
    expect(getDashboardChartColors(3)).toEqual(businessPalette.slice(0, 3))
    expect(getDashboardChartColors(12)).toEqual([
      ...businessPalette,
      businessPalette[0],
      businessPalette[1],
    ])
  })
})
