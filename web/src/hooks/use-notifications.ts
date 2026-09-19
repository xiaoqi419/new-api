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
import { useState, useMemo } from 'react'

import {
  announcementReadKey,
  modalAnnouncementKey,
  usePublicAnnouncements,
} from '@/hooks/use-public-announcements'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationStore } from '@/stores/notification-store'

export type NotificationTab = 'announcements' | 'timeline'

/**
 * Hook backing the notification bell. Reads published announcements from the
 * announcement center and tracks which ones the user has already seen.
 */
export function useNotifications() {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<NotificationTab>('announcements')

  const { items, versions, loading } = usePublicAnnouncements()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const { acknowledgedModalKeys, markAnnouncementsRead, readAnnouncementKeys } =
    useNotificationStore()

  const unreadCount = useMemo(
    () =>
      items.filter((item) => {
        if (item.level === 'modal' && userId !== undefined) {
          return !acknowledgedModalKeys.includes(
            modalAnnouncementKey(item, userId)
          )
        }
        return !readAnnouncementKeys.includes(announcementReadKey(item))
      }).length,
    [acknowledgedModalKeys, items, readAnnouncementKeys, userId]
  )

  const markAllRead = () => {
    if (items.length > 0) {
      markAnnouncementsRead(items.map(announcementReadKey))
    }
  }

  const openPopover = (tab?: NotificationTab) => {
    setActiveTab(tab ?? activeTab)
    markAllRead()
    setPopoverOpen(true)
  }

  return {
    announcements: items,
    versions,
    loading,

    unreadCount,

    popoverOpen,
    setPopoverOpen: (open: boolean) => {
      if (open) {
        openPopover(activeTab)
        return
      }
      setPopoverOpen(false)
    },
    activeTab,
    setActiveTab,

    openPopover,
    closePopover: () => setPopoverOpen(false),
  }
}
