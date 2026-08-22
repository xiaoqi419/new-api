import { createFileRoute, redirect } from '@tanstack/react-router'
import z from 'zod'

import { AnnouncementsAdmin } from '@/features/announcements/admin'
import { ANNOUNCEMENT_TYPES } from '@/features/announcements/constants'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

const announcementsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  type: z.array(z.enum(ANNOUNCEMENT_TYPES)).optional().catch([]),
})

export const Route = createFileRoute('/_authenticated/announcements/admin')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()

    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({
        to: '/403',
      })
    }
  },
  validateSearch: announcementsSearchSchema,
  component: AnnouncementsAdmin,
})
