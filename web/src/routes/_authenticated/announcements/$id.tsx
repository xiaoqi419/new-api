import { createFileRoute } from '@tanstack/react-router'

import { AnnouncementDetail } from '@/features/announcements/detail'

export const Route = createFileRoute('/_authenticated/announcements/$id')({
  component: AnnouncementDetailRoute,
})

function AnnouncementDetailRoute() {
  const { id } = Route.useParams()
  const parsedId = Number(id)
  const announcementId =
    Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : null

  return <AnnouncementDetail announcementId={announcementId} />
}
