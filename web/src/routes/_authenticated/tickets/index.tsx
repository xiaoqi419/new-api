import { createFileRoute } from '@tanstack/react-router'
import z from 'zod'

import { Tickets } from '@/features/tickets'
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
} from '@/features/tickets/constants'

const ticketsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  status: z.array(z.enum(TICKET_STATUSES)).optional().catch([]),
  category: z.array(z.enum(TICKET_CATEGORIES)).optional().catch([]),
})

export const Route = createFileRoute('/_authenticated/tickets/')({
  validateSearch: ticketsSearchSchema,
  component: Tickets,
})
