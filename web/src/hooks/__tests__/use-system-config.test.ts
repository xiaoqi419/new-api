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

import { mapStatusDataToConfig } from '@/hooks/use-system-config'
import { DEFAULT_SYSTEM_NAME } from '@/lib/constants'

describe('system name normalization', () => {
  test.each([
    ['missing', undefined],
    ['empty', ''],
    ['whitespace-only', ' \t\n '],
  ])('uses the default system name for a %s API value', (_, systemName) => {
    const config = mapStatusDataToConfig({ system_name: systemName })

    expect(config.systemName).toBe(DEFAULT_SYSTEM_NAME)
  })

  test('trims surrounding whitespace from a configured system name', () => {
    const config = mapStatusDataToConfig({
      system_name: '  Customer Brand  ',
    })

    expect(config.systemName).toBe('Customer Brand')
  })
})
