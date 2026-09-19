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
import { beforeEach, describe, expect, test } from 'vitest'

import { modalAnnouncementKey } from '@/hooks/use-public-announcements'
import { useNotificationStore } from '@/stores/notification-store'

const announcement = {
  id: 42,
  publish_time: 1_726_740_000,
}

beforeEach(() => {
  window.localStorage.clear()
  useNotificationStore.setState({
    acknowledgedModalKeys: [],
    closedUntilDate: null,
    lastReadNotice: '',
    readAnnouncementKeys: [],
  })
})

describe('modal announcement acknowledgement state', () => {
  test('persists an explicit acknowledgement without changing normal bell reads', () => {
    const key = modalAnnouncementKey(
      announcement,
      7,
      'https://gateway.example.test'
    )

    useNotificationStore.getState().acknowledgeModal(key)

    expect(useNotificationStore.getState().isModalAcknowledged(key)).toBe(true)
    expect(useNotificationStore.getState().readAnnouncementKeys).toEqual([])

    const persisted = JSON.parse(
      window.localStorage.getItem('notification-storage') ?? '{}'
    ) as { state?: { acknowledgedModalKeys?: string[] } }
    expect(persisted.state?.acknowledgedModalKeys).toContain(key)
  })

  test('does not share an acknowledgement across accounts or republished editions', () => {
    const origin = 'https://gateway.example.test'
    const acknowledgedKey = modalAnnouncementKey(announcement, 7, origin)
    const otherAccountKey = modalAnnouncementKey(announcement, 8, origin)
    const republishedKey = modalAnnouncementKey(
      { ...announcement, publish_time: announcement.publish_time + 1 },
      7,
      origin
    )

    useNotificationStore.getState().acknowledgeModal(acknowledgedKey)

    expect(
      useNotificationStore.getState().isModalAcknowledged(otherAccountKey)
    ).toBe(false)
    expect(
      useNotificationStore.getState().isModalAcknowledged(republishedKey)
    ).toBe(false)
  })
})
