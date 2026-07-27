import { createFileRoute } from '@tanstack/react-router'
import z from 'zod'

import { TicketDetailPage } from '@/features/tickets/detail'

const detailSearchSchema = z.object({
  id: z.number().catch(0),
})

export const Route = createFileRoute('/_authenticated/tickets/detail')({
  validateSearch: detailSearchSchema,
  component: RouteComponent,
})

function RouteComponent() {
  const { id } = Route.useSearch()
  return <TicketDetailPage id={id} admin={false} />
}
