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
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { updateQuotaReminderConfig } from '../../api'

vi.mock('@/lib/api', () => ({
  api: {
    put: vi.fn(),
  },
}))

describe('quota reminder configuration API', () => {
  beforeEach(() => {
    vi.mocked(api.put).mockReset()
  })

  test('sends the complete reminder configuration atomically', async () => {
    vi.mocked(api.put).mockResolvedValue({
      data: { success: true, message: '' },
    } as never)

    await updateQuotaReminderConfig({
      enabled: true,
      threshold: 1,
      template: 'custom',
      custom_template: '{"subject":"Low balance"}',
    })

    expect(api.put).toHaveBeenCalledWith('/api/option/quota_reminder', {
      enabled: true,
      threshold: 1,
      template: 'custom',
      custom_template: '{"subject":"Low balance"}',
    })
  })

  test('rejects a logical failure response so callers do not advance their baseline', async () => {
    vi.mocked(api.put).mockResolvedValue({
      data: { success: false, message: 'invalid reminder template' },
    } as never)

    await expect(
      updateQuotaReminderConfig({
        enabled: true,
        threshold: 1,
        template: 'custom',
        custom_template: '',
      })
    ).rejects.toThrow('invalid reminder template')
  })
})
