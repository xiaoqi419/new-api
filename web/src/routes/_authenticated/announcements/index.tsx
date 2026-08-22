import { createFileRoute } from '@tanstack/react-router'

import { AnnouncementCenter } from '@/features/announcements'

export const Route = createFileRoute('/_authenticated/announcements/')({
  component: AnnouncementCenter,
})
