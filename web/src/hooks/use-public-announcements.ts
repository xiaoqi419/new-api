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

import {
  getPublicAnnouncements,
  getPublicAnnouncementsPage,
} from '@/features/announcements/api'
import type { Announcement } from '@/features/announcements/types'

const MODAL_ANNOUNCEMENT_PAGE_SIZE = 100

function sortPublicAnnouncements(items: Announcement[]) {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.publish_time - a.publish_time
  })
}

/**
 * Read key for one announcement. The publish time is part of the key so that
 * re-publishing an edited announcement shows up as unread again.
 */
export function announcementReadKey(item: Announcement): string {
  return `ann:${item.id}:${item.publish_time}`
}

/**
 * Identifies a confirmed modal announcement version for one browser origin
 * and user. Republishing changes publish_time, intentionally producing a new
 * key that the user must explicitly acknowledge again.
 */
export function modalAnnouncementKey(
  item: Pick<Announcement, 'id' | 'publish_time'>,
  userId: number,
  origin?: string
): string {
  const resolvedOrigin =
    origin ?? (typeof window === 'undefined' ? '' : window.location.origin)
  return `modal-announcement:v1:${resolvedOrigin}:${userId}:${item.id}:${item.publish_time}`
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
    return sortPublicAnnouncements(list)
  }, [data])

  const versions = useMemo(
    () => items.filter((item) => item.type === 'version' && item.version),
    [items]
  )

  return { items, versions, loading: isLoading }
}

/**
 * Fetches every published modal announcement in a separate cache entry. The
 * first page yields the total, then later pages are fetched in parallel so a
 * long announcement history cannot be hidden behind the public endpoint's
 * page-size cap.
 */
export function useModalPublicAnnouncements() {
  const { data, isLoading } = useQuery({
    queryKey: ['announcements-public', 'modal'],
    queryFn: async () => {
      const firstPage = await getPublicAnnouncementsPage({
        level: 'modal',
        p: 1,
        page_size: MODAL_ANNOUNCEMENT_PAGE_SIZE,
      })
      const firstData = firstPage.success ? firstPage.data : undefined
      if (!firstData) return []

      const pageCount = Math.ceil(
        firstData.total / MODAL_ANNOUNCEMENT_PAGE_SIZE
      )
      if (pageCount <= 1) return sortPublicAnnouncements(firstData.items)

      const remainingPages = await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, index) =>
          getPublicAnnouncementsPage({
            level: 'modal',
            p: index + 2,
            page_size: MODAL_ANNOUNCEMENT_PAGE_SIZE,
          })
        )
      )
      const items = [
        ...firstData.items,
        ...remainingPages.flatMap((page) =>
          page.success ? (page.data?.items ?? []) : []
        ),
      ]

      return sortPublicAnnouncements(items)
    },
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60,
    refetchOnWindowFocus: true,
  })

  return { items: data ?? [], loading: isLoading }
}
