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

import {
  formatShanghaiDrawTime,
  formatShanghaiInputTime,
  formatShanghaiStartDate,
  parseShanghaiInputTime,
  parseShanghaiStartDate,
} from '../time'

describe('activity lottery draw time', () => {
  test('October 8 at 00:00 Beijing time represents October 7 at 24:00', () => {
    const timestamp = parseShanghaiInputTime('2026-10-08T00:00')

    expect(timestamp).toBe(Date.parse('2026-10-07T16:00:00Z') / 1000)
    if (timestamp === null) return
    expect(formatShanghaiDrawTime(timestamp)).toBe('2026-10-07 24:00')
    expect(formatShanghaiInputTime(timestamp)).toBe('2026-10-08T00:00')
  })

  test('invalid local dates do not silently roll into another day', () => {
    expect(parseShanghaiInputTime('2026-02-30T10:00')).toBeNull()
    expect(parseShanghaiInputTime('2026-10-07T24:00')).toBeNull()
  })

  test('selected Beijing calendar date starts at local midnight even for a past day', () => {
    const startAt = parseShanghaiStartDate('2026-09-28')
    expect(startAt).toBe(Date.parse('2026-09-27T16:00:00Z') / 1000)
    if (startAt === null) return
    expect(formatShanghaiStartDate(startAt)).toBe('2026-09-28')
    expect(parseShanghaiStartDate('2026-02-30')).toBeNull()
    expect(parseShanghaiStartDate('2026-09-28T12:00')).toBeNull()
  })
})
