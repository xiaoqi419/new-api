/*
Copyright (C) 2026 QuantumNous

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
import { describe, expect, test, vi } from 'vitest'

import { getPublicAnnouncementsPage } from '../api'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/lib/api', () => ({ api: { get } }))

describe('getPublicAnnouncementsPage', () => {
  test('uses the paginated public endpoint contract and keeps the modal filter', async () => {
    get.mockResolvedValueOnce({ data: { success: true, data: { items: [] } } })

    await getPublicAnnouncementsPage({
      level: 'modal',
      p: 2,
      page_size: 20,
      type: 'system',
    })

    expect(get).toHaveBeenCalledWith(
      '/api/announcements?p=2&page_size=20&type=system&level=modal'
    )
  })
})
