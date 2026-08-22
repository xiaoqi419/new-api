import { createFileRoute, redirect } from '@tanstack/react-router'
import z from 'zod'

import { TicketsAdmin } from '@/features/tickets/admin'
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '@/features/tickets/constants'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

const ticketsAdminSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  keyword: z.string().optional().catch(''),
  status: z.array(z.enum(TICKET_STATUSES)).optional().catch([]),
  category: z.array(z.enum(TICKET_CATEGORIES)).optional().catch([]),
  priority: z.array(z.enum(TICKET_PRIORITIES)).optional().catch([]),
})

export const Route = createFileRoute('/_authenticated/tickets/admin')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()

    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({
        to: '/403',
      })
    }
  },
  validateSearch: ticketsAdminSearchSchema,
  component: TicketsAdmin,
})
