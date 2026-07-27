import { createFileRoute, redirect } from '@tanstack/react-router'
import z from 'zod'

import { TicketDetailPage } from '@/features/tickets/detail'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

const adminDetailSearchSchema = z.object({
  id: z.number().catch(0),
})

export const Route = createFileRoute('/_authenticated/tickets/admin-detail')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()

    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({
        to: '/403',
      })
    }
  },
  validateSearch: adminDetailSearchSchema,
  component: RouteComponent,
})

function RouteComponent() {
  const { id } = Route.useSearch()
  return <TicketDetailPage id={id} admin />
}
