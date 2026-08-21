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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

const chartSource = readFileSync(
  resolve(
    process.cwd(),
    'src/features/pricing/components/model-details-charts.tsx'
  ),
  'utf8'
)

describe('model details chart theme', () => {
  test('uses business chart and card colors for light and dark canvas rendering', () => {
    expect(chartSource).toContain("seriesColor: dark ? '#64b5f6' : '#1976d2'")
    expect(chartSource).toContain(
      "pointRingColor: dark ? '#242424' : '#ffffff'"
    )
  })

  test('does not retain the legacy pink chart or plum card colors', () => {
    for (const legacy of ['#f693c0', '#ea7aae', '#281f24', '#fffcfe']) {
      expect(chartSource).not.toContain(legacy)
    }
  })
})
