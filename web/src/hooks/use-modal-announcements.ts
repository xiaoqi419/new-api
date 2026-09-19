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
import { useLocation } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import {
  modalAnnouncementKey,
  useModalPublicAnnouncements,
} from '@/hooks/use-public-announcements'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationStore } from '@/stores/notification-store'

const announcementDetailPath = /^\/announcements\/\d+$/

/**
 * Chooses one pending modal announcement for the authenticated layout. A
 * dismissal lasts only for this mounted document; acknowledgement is the
 * separate persistent action in the notification store.
 */
export function useModalAnnouncements() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const userId = useAuthStore((state) => state.auth.user?.id)
  const acknowledgedModalKeys = useNotificationStore(
    (state) => state.acknowledgedModalKeys
  )
  const acknowledgeModal = useNotificationStore(
    (state) => state.acknowledgeModal
  )
  const { items, loading } = useModalPublicAnnouncements()
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(
    () => new Set()
  )

  const pending = useMemo(() => {
    if (userId === undefined) return []

    return items.filter((item) => {
      const key = modalAnnouncementKey(item, userId)
      return !dismissedKeys.has(key) && !acknowledgedModalKeys.includes(key)
    })
  }, [acknowledgedModalKeys, dismissedKeys, items, userId])

  const activeAnnouncement = pending[0]
  const activeKey =
    activeAnnouncement && userId !== undefined
      ? modalAnnouncementKey(activeAnnouncement, userId)
      : undefined

  const dismissActive = () => {
    if (!activeKey) return
    setDismissedKeys((keys) => new Set([...keys, activeKey]))
  }

  const acknowledgeActive = () => {
    if (!activeKey) return
    acknowledgeModal(activeKey)
  }

  return {
    activeAnnouncement,
    dismissActive,
    acknowledgeActive,
    loading,
    open: Boolean(activeAnnouncement) && !announcementDetailPath.test(pathname),
    queuePosition: activeAnnouncement ? 1 : 0,
    queueSize: pending.length,
  }
}
