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

import { getSuccessRateColor } from '../format'

describe('performance canvas semantic colors', () => {
  test.each(['light', 'dark'])(
    'matches business semantic tokens in %s mode',
    (theme) => {
      expect(getSuccessRateColor(100, theme)).toBe('#16c784')
      expect(getSuccessRateColor(75, theme)).toBe('#f4b740')
      expect(getSuccessRateColor(50, theme)).toBe('#ef4444')
    }
  )

  test('uses each mode muted foreground for an unknown rate', () => {
    expect(getSuccessRateColor(Number.NaN, 'light')).toBe('#5b6b78')
    expect(getSuccessRateColor(Number.NaN, 'dark')).toBe('#b0bbc5')
  })
})
