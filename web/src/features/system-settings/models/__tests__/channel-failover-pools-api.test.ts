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

import { getSchedulingPoolChannels } from '../channel-failover-pools-api'

const { getChannels } = vi.hoisted(() => ({ getChannels: vi.fn() }))

vi.mock('@/features/channels/api', () => ({ getChannels }))

describe('scheduling pool channel options API', () => {
  beforeEach(() => {
    getChannels.mockReset()
  })

  test('loads every administrator channel page and retains only the safe selection fields', async () => {
    getChannels
      .mockResolvedValueOnce({
        success: true,
        data: {
          total: 2,
          items: [
            {
              id: 11,
              name: 'Primary',
              group: 'standard',
              type: 1,
              status: 1,
              key: 'must-not-be-exposed',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          total: 2,
          items: [
            {
              id: 12,
              name: 'Backup',
              group: 'standard',
              type: 1,
              status: 1,
              key: 'must-not-be-exposed',
            },
          ],
        },
      })

    await expect(getSchedulingPoolChannels()).resolves.toEqual([
      { id: 11, name: 'Primary', group: 'standard', type: 1, status: 1 },
      { id: 12, name: 'Backup', group: 'standard', type: 1, status: 1 },
    ])
    expect(getChannels).toHaveBeenNthCalledWith(1, {
      p: 1,
      page_size: 100,
      id_sort: true,
    })
    expect(getChannels).toHaveBeenNthCalledWith(2, {
      p: 2,
      page_size: 100,
      id_sort: true,
    })
  })
})
