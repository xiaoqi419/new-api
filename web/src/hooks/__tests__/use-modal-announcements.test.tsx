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
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { Announcement } from '@/features/announcements/types'
import { modalAnnouncementKey } from '@/hooks/use-public-announcements'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationStore } from '@/stores/notification-store'

const mocks = vi.hoisted(() => ({
  items: [] as Announcement[],
  pathname: '/dashboard',
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useLocation: <T,>({
    select,
  }: {
    select: (location: { pathname: string }) => T
  }) => select({ pathname: mocks.pathname }),
}))

vi.mock('@/hooks/use-public-announcements', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/hooks/use-public-announcements')
  >()),
  useModalPublicAnnouncements: () => ({ items: mocks.items, loading: false }),
}))

const { useModalAnnouncements } = await import('../use-modal-announcements')

const firstAnnouncement: Announcement = {
  id: 1,
  title: 'First modal notice',
  content: 'First notice content',
  type: 'system',
  level: 'modal',
  version: '',
  pinned: true,
  published: true,
  publish_time: 1_726_740_000,
  created_at: 1_726_740_000,
  updated_at: 1_726_740_000,
}

const secondAnnouncement: Announcement = {
  ...firstAnnouncement,
  id: 2,
  title: 'Second modal notice',
  pinned: false,
  publish_time: 1_726_739_000,
}

beforeEach(() => {
  mocks.items = [firstAnnouncement, secondAnnouncement]
  mocks.pathname = '/dashboard'
  window.localStorage.clear()
  useNotificationStore.setState({
    acknowledgedModalKeys: [],
    closedUntilDate: null,
    lastReadNotice: '',
    readAnnouncementKeys: [],
  })
  useAuthStore.getState().auth.setUser({
    id: 7,
    username: 'modal-test-user',
    role: 1,
  })
})

describe('useModalAnnouncements', () => {
  test('cancelling advances the single dialog queue without acknowledging the notice', () => {
    const { result } = renderHook(() => useModalAnnouncements())

    expect(result.current.activeAnnouncement?.id).toBe(firstAnnouncement.id)

    act(() => result.current.dismissActive())

    expect(result.current.activeAnnouncement?.id).toBe(secondAnnouncement.id)
    expect(
      useNotificationStore
        .getState()
        .isModalAcknowledged(modalAnnouncementKey(firstAnnouncement, 7))
    ).toBe(false)
  })

  test('acknowledging advances the queue and persists only the selected edition', () => {
    const { result } = renderHook(() => useModalAnnouncements())

    act(() => result.current.acknowledgeActive())

    expect(result.current.activeAnnouncement?.id).toBe(secondAnnouncement.id)
    expect(
      useNotificationStore
        .getState()
        .isModalAcknowledged(modalAnnouncementKey(firstAnnouncement, 7))
    ).toBe(true)
    expect(
      useNotificationStore
        .getState()
        .isModalAcknowledged(modalAnnouncementKey(secondAnnouncement, 7))
    ).toBe(false)
  })

  test('suppresses the dialog while an announcement detail route is open', () => {
    mocks.pathname = '/announcements/1'

    const { result } = renderHook(() => useModalAnnouncements())

    expect(result.current.activeAnnouncement?.id).toBe(firstAnnouncement.id)
    expect(result.current.open).toBe(false)
  })
})
