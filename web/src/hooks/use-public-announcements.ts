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
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getPublicAnnouncements } from '@/features/announcements/api'
import type { Announcement } from '@/features/announcements/types'

/**
 * Read key for one announcement. The publish time is part of the key so that
 * re-publishing an edited announcement shows up as unread again.
 */
export function announcementReadKey(item: Announcement): string {
  return `ann:${item.id}:${item.publish_time}`
}

/**
 * Published announcements from the announcement center, shared by the
 * notification bell and the dashboard panel so both read one cache entry.
 */
export function usePublicAnnouncements() {
  const { data, isLoading } = useQuery({
    queryKey: ['announcements-public'],
    queryFn: () => getPublicAnnouncements(),
    staleTime: 1000 * 60 * 5,
  })

  const items = useMemo(() => {
    const list = data?.success ? (data.data ?? []) : []
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return b.publish_time - a.publish_time
    })
  }, [data])

  const versions = useMemo(
    () => items.filter((item) => item.type === 'version' && item.version),
    [items]
  )

  return { items, versions, loading: isLoading }
}
