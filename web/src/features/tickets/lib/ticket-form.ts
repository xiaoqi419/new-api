import type { TFunction } from 'i18next'
import { z } from 'zod'

export function getTicketFormSchema(t: TFunction) {
  return z.object({
    title: z
      .string()
      .trim()
      .min(1, t('Title is required'))
      .max(255, t('Title is too long')),
    category: z.enum(['billing', 'technical', 'account', 'other']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    content: z
      .string()
      .trim()
      .min(1, t('Content is required'))
      .max(5000, t('Content is too long')),
  })
}

export type TicketFormValues = z.infer<ReturnType<typeof getTicketFormSchema>>

export const TICKET_FORM_DEFAULT_VALUES: TicketFormValues = {
  title: '',
  category: 'other',
  priority: 'medium',
  content: '',
}
